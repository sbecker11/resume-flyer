<template>
  <div
    id="rde-skill-jobs-root"
    class="rde-tab-content rde-skill-jobs"
    tabindex="-1"
  >
    <p v-if="loadError" class="rde-error">{{ loadError }}</p>
    <p v-else-if="!jobsLoaded && resumeId && resumeId !== 'default'" class="rde-loading">Loading jobs…</p>
    <template v-else>
      <p
        v-if="jobsList.length === 0 || skillRowsForMatrix.length === 0"
        class="rde-skill-jobs-cross-empty"
      >
        <span v-if="jobsList.length === 0">No jobs in this resume.</span>
        <span v-else>No skills in this resume.</span>
      </p>
      <div v-else class="rde-skill-jobs-split">
        <!-- Single scrolling container; one grid inside so header and body share column widths -->
        <div class="rde-sj-scroll" aria-label="Job and skill cross grid">
          <div class="rde-sj-matrix-grid" :style="matrixGridStyle">
            <!-- Row 0: corner + job headers; subgrid inherits outer column sizes exactly -->
            <div class="rde-sj-header-jobs">
              <div class="rde-sj-corner" role="group" aria-label="Skill–jobs actions">
                <button
                  type="button"
                  class="rde-btn rde-sj-clear"
                  aria-label="Clear all job–skill links"
                  title="Clear all job–skill links"
                  :disabled="!canClearGrid"
                  @click="onClearGrid"
                >
                  Clear
                </button>
              </div>
              <div
                v-for="(job, ji) in jobsList"
                :key="'job-h-' + ji"
                class="rde-sj-head-job"
              >
                <span class="rde-skill-jobs-label rotated-job-name">{{ rotatedJobHeaderText(job, ji) }}</span>
              </div>
            </div>

            <!-- Rows 1…N: skill label + matrix cells -->
            <template v-for="(skillRow, si) in skillRowsForMatrix" :key="'skill-row-' + skillRow.id">
              <div class="rde-sj-head-skill" :title="skillRow.displayLabel">
                {{ skillRow.displayLabel }}
              </div>
              <button
                v-for="(job, ji) in jobsList"
                :key="'cell-' + skillRow.id + '-' + ji"
                type="button"
                class="rde-sj-cell"
                :class="{ 'rde-sj-cell--selected': isMatrixCellSelected(job, skillRow.id) }"
                :disabled="!matrixCellInteractive(job)"
                :aria-label="cellAriaLabel(job, ji, skillRow)"
                :aria-pressed="isMatrixCellSelected(job, skillRow.id)"
                @click="onMatrixCellClick(ji, skillRow)"
              />
            </template>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, shallowRef, computed, watch, nextTick } from 'vue';
import * as api from '../api.mjs';
import { reportError } from '@/modules/utils/errorReporting.mjs';
import { ResumeJob, isEducationDerivedJob, educationKeyOf } from '@/modules/data/ResumeJob.mjs';
import { educationJobDisplayNameFromParts } from '@/modules/utils/educationJobDisplayName.mjs';
import {
  getSelectedSkillIdsForJob,
  filterDescriptionBracketsToSkillSelection,
} from '../jobSkillsSelection.mjs';
import { hasServer } from '@/modules/core/hasServer.mjs';
import { updateJobSkills, updateEducationJobSkills } from '@/modules/api/resumeManagerApi.mjs';
import { jobTenureMonthsInclusive } from '@/modules/utils/dateUtils.mjs';

const props = defineProps({
  resumeId: { type: String, default: '' },
  reloadNonce: { type: Number, default: 0 },
});

const emit = defineEmits(['content-ready', 'saved']);

const canEdit = hasServer();
/** True only while "Clear all" runs; cell toggles no longer block the grid (optimistic UI + background save). */
const saving = ref(false);
/** In-flight per-cell save count; Clear is disabled until these finish to avoid inconsistent bulk clear. */
const pendingToggleSaves = ref(0);
/** Skill keys that existed when this panel loaded / last refetched (for updateJobSkills newSkills). */
const initialSkillKeys = ref(new Set());

/** @type {Map<number, Promise<void>>} */
const jobSaveTail = new Map();

/**
 * Serialize PATCH for the same job column so rapid toggles don't reorder server writes.
 * @param {number} jobIndex
 * @param {() => Promise<void>} task
 */
function chainJobSave(jobIndex, task) {
  const prev = jobSaveTail.get(jobIndex) ?? Promise.resolve();
  const next = prev.then(() => task()).finally(() => {
    if (jobSaveTail.get(jobIndex) === next) jobSaveTail.delete(jobIndex);
  });
  jobSaveTail.set(jobIndex, next);
  return next;
}

/** Same rem for job column width and body row height → square matrix cells; wider = more space between rotated job headers. */
const JOB_MATRIX_CELL_REM = 1.4;
/** Header row min height (rem) for −45° job labels above square columns (taller = less clipping on long names). */
const JOB_HEADER_ROW_MIN_REM = 4.35;

const jobs = shallowRef([]);
const skillsMap = shallowRef({});
const jobsLoaded = ref(false);
const loadError = ref('');

function jobsArray(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  const keys = Object.keys(data).filter((k) => /^\d+$/.test(k)).sort((a, b) => Number(a) - Number(b));
  return keys.map((k) => data[k]);
}

const jobsList = computed(() => jobs.value);

/** Sum of job durationMonths for jobs where this skill is linked (same cells as matrix selection). */
function linkedJobsDurationMonthsTotal(skillId, jobsArr, map) {
  let sum = 0;
  for (const job of jobsArr) {
    if (!getSelectedSkillIdsForJob(job, map).has(skillId)) continue;
    const n = job?.durationMonths;
    if (typeof n === 'number' && Number.isFinite(n) && n > 0) sum += n;
  }
  return sum;
}

const skillRowsForMatrix = computed(() => {
  const map = skillsMap.value || {};
  const jlist = jobsList.value;
  const entries = Object.entries(map);
  const rows = entries.map(([id, s]) => {
    const fullName = (s && s.name) || id;
    const monthsTotal = linkedJobsDurationMonthsTotal(id, jlist, map);
    const displayLabel = monthsTotal > 0 ? `${fullName} (${monthsTotal})` : fullName;
    return { id, fullName, displayLabel, monthsTotal };
  });
  rows.sort((a, b) => a.fullName.localeCompare(b.fullName, undefined, { sensitivity: 'base' }));
  return rows;
});

const hasAnyMatrixLink = computed(() => {
  const map = skillsMap.value;
  for (const job of jobsList.value) {
    if (getSelectedSkillIdsForJob(job, map).size > 0) return true;
  }
  return false;
});

const canClearGrid = computed(
  () =>
    canEdit
    && props.resumeId
    && props.resumeId !== 'default'
    && !saving.value
    && pendingToggleSaves.value === 0
    && jobsList.value.length > 0
    && skillRowsForMatrix.value.length > 0
    && hasAnyMatrixLink.value
);

const crossGridColumnsStyle = computed(() => {
  const nj = jobsList.value.length;
  if (nj === 0) return {};
  return {
    /* Skill col: max-content one line; job cols match body row height for square cells. */
    gridTemplateColumns: `minmax(8rem, max-content) repeat(${nj}, ${JOB_MATRIX_CELL_REM}rem)`,
  };
});

/**
 * Outer matrix grid: one column spanning full width for the sticky header wrapper,
 * then one row per skill for the body cells.
 */
const matrixGridStyle = computed(() => {
  const ns = skillRowsForMatrix.value.length;
  return {
    ...crossGridColumnsStyle.value,
    gridTemplateRows: `auto repeat(${Math.max(ns, 1)}, minmax(${JOB_MATRIX_CELL_REM}rem, auto))`,
    '--rde-sj-header-row-min': `${JOB_HEADER_ROW_MIN_REM}rem`,
    '--rde-sj-cell-size': `${JOB_MATRIX_CELL_REM}rem`,
  };
});


/**
 * Text before the first dash that has whitespace on both sides (-, –, —).
 * Avoids splitting words like "Co-op".
 */
function portionBeforeSpacedDash(s) {
  const str = String(s ?? '').trim();
  if (!str) return '';
  const idx = str.search(/\s[-–—]\s/);
  if (idx === -1) return str;
  return str.slice(0, idx).trimEnd();
}

/** Employer only when that field exists; otherwise first segment of label/title before a spaced dash. */
function fullJobLabel(job, i) {
  const employer = String(job?.employer ?? job?.Employer ?? job?.label ?? '').trim();
  const title = String(job?.title ?? job?.role ?? job?.Role ?? '').trim();
  if (isEducationDerivedJob(job)) {
    const shortName = educationJobDisplayNameFromParts(employer, title);
    return shortName || `Job ${i + 1}`;
  }
  if (employer) return employer;
  const label = String(job?.label ?? '').trim();
  if (label) return portionBeforeSpacedDash(label) || `Job ${i + 1}`;
  if (title) return portionBeforeSpacedDash(title) || `Job ${i + 1}`;
  return `Job ${i + 1}`;
}

/** Rotated column header: "(N) employer/label" where N is enriched durationMonths. */
function rotatedJobHeaderText(job, i) {
  const base = fullJobLabel(job, i);
  const n = job?.durationMonths;
  if (typeof n === 'number' && Number.isFinite(n) && n > 0) {
    return `(${n}) ${base}`;
  }
  return base;
}

function cellAriaLabel(job, ji, skillRow) {
  const base = `${rotatedJobHeaderText(job, ji)} — ${skillRow.displayLabel}`;
  const link = isMatrixCellSelected(job, skillRow.id) ? 'linked' : 'not linked';
  return `${base} — ${link}`;
}

function isMatrixCellSelected(job, skillId) {
  return getSelectedSkillIdsForJob(job, skillsMap.value).has(skillId);
}

function matrixCellInteractive(job) {
  return (
    canEdit
    && props.resumeId
    && props.resumeId !== 'default'
    && job != null
  );
}

/** @param {string[]} skillIDs @param {Record<string, { name?: string }>} map */
function jobSkillsRecordFromMap(skillIDs, map) {
  const o = {};
  for (const sid of skillIDs) {
    const skill = map[sid];
    o[sid] = skill?.name ?? sid;
  }
  return o;
}

/** Replace shallowRef jobs list entry so the matrix updates without a full getResumeData round-trip. */
function patchJobRowLocal(jobIndex, skillIDs, descriptionIfWork) {
  const list = jobs.value.map((j, i) => {
    if (i !== jobIndex) return j;
    const plain = j instanceof ResumeJob ? j.toPlainObject() : { ...j };
    plain.skillIDs = [...skillIDs];
    if (descriptionIfWork !== undefined) plain.Description = descriptionIfWork;
    const patched = ResumeJob.fromPlainObject(plain);
    // Constructor strips durationMonths (not persisted); recompute so skill-row month sums stay correct.
    patched.durationMonths = jobTenureMonthsInclusive(patched.start, patched.end);
    return patched;
  });
  jobs.value = list;
}

function onMatrixCellClick(jobIndex, skillRow) {
  const job = jobs.value[jobIndex];
  if (!matrixCellInteractive(job)) return;
  const resumeId = props.resumeId;
  const map = skillsMap.value;
  // Only keep IDs that exist in the skills map; drop any stale display-name orphans.
  const existing = new Set(
    [...getSelectedSkillIdsForJob(job, map)].filter((id) => map[id] != null)
  );
  if (existing.has(skillRow.id)) existing.delete(skillRow.id);
  else existing.add(skillRow.id);
  const next = existing;
  const skillIDs = [...next];
  // newSkills: IDs added this toggle that weren't in the map at load time (genuinely new skills).
  const newSkills = skillIDs.filter((id) => !initialSkillKeys.value.has(id));
  const rawDesc = String(job?.Description ?? job?.description ?? '');
  const isEdu = isEducationDerivedJob(job);
  const alignedDesc = !isEdu ? filterDescriptionBracketsToSkillSelection(rawDesc, next, map) : rawDesc;
  const educationKey = isEdu ? educationKeyOf(job) : null;
  if (isEdu && !educationKey) {
    reportError(
      new Error('Education row has no educationKey.'),
      '[SkillJobsTab] Cannot save job–skill link',
      ''
    );
    alert('Cannot save: education row has no education key.');
    return;
  }

  let nextMap = skillsMap.value;
  if (newSkills.length) {
    nextMap = { ...skillsMap.value };
    for (const n of newSkills) {
      if (!nextMap[n]) nextMap[n] = { name: n };
    }
    skillsMap.value = nextMap;
    initialSkillKeys.value = new Set(Object.keys(nextMap));
  }
  patchJobRowLocal(jobIndex, skillIDs, isEdu ? undefined : alignedDesc);
  emit('saved', {
    jobIndex,
    skillIDs,
    jobSkills: jobSkillsRecordFromMap(skillIDs, nextMap),
  });

  pendingToggleSaves.value++;
  chainJobSave(jobIndex, async () => {
    try {
      if (isEdu && educationKey) {
        await updateEducationJobSkills(resumeId, educationKey, skillIDs, newSkills);
      } else {
        await updateJobSkills(resumeId, jobIndex, skillIDs, newSkills);
        if (alignedDesc !== rawDesc) {
          await api.updateJob(resumeId, jobIndex, { Description: alignedDesc });
        }
      }
    } catch (err) {
      reportError(err, '[SkillJobsTab] Failed to save job–skill link', 'Refetching resume data to resync');
      try {
        const data = await api.getResumeData(resumeId);
        jobs.value = jobsArray(data.jobs);
        skillsMap.value = data.skills && typeof data.skills === 'object' ? data.skills : {};
        initialSkillKeys.value = new Set(Object.keys(skillsMap.value));
      } catch (e2) {
        reportError(e2, '[SkillJobsTab] Refetch after toggle save failed', '');
      }
      alert('Failed to save: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      pendingToggleSaves.value--;
    }
  });
}

async function onClearGrid() {
  if (!canClearGrid.value) return;
  if (!window.confirm('Clear all job–skill links for this resume? This cannot be undone from here.')) {
    return;
  }
  const map = skillsMap.value;
  saving.value = true;
  try {
    for (let ji = 0; ji < jobs.value.length; ji++) {
      const row = jobs.value[ji];
      if (isEducationDerivedJob(row)) {
        const ek = educationKeyOf(row);
        if (!ek) continue;
        await updateEducationJobSkills(props.resumeId, ek, [], []);
      } else {
        await updateJobSkills(props.resumeId, ji, [], []);
        const rawDesc = String(row?.Description ?? row?.description ?? '');
        const alignedDesc = filterDescriptionBracketsToSkillSelection(rawDesc, new Set(), map);
        if (alignedDesc !== rawDesc) {
          await api.updateJob(props.resumeId, ji, { Description: alignedDesc });
        }
      }
    }
    const data = await api.getResumeData(props.resumeId);
    jobs.value = jobsArray(data.jobs);
    skillsMap.value = data.skills && typeof data.skills === 'object' ? data.skills : {};
    initialSkillKeys.value = new Set(Object.keys(skillsMap.value));
    emit('saved', { clearAllJobSkillLinks: true });
  } catch (err) {
    reportError(err, '[SkillJobsTab] Clear all grid cells failed', 'Refetching resume data to resync');
    try {
      const data = await api.getResumeData(props.resumeId);
      jobs.value = jobsArray(data.jobs);
      skillsMap.value = data.skills && typeof data.skills === 'object' ? data.skills : {};
      initialSkillKeys.value = new Set(Object.keys(skillsMap.value));
    } catch (e2) {
      reportError(e2, '[SkillJobsTab] Clear all: refetch after error failed', '');
    }
    alert('Failed to clear: ' + (err instanceof Error ? err.message : String(err)));
  } finally {
    saving.value = false;
  }
}

watch(
  () => [props.resumeId, props.reloadNonce],
  ([id]) => {
    jobsLoaded.value = false;
    loadError.value = '';
    jobs.value = [];
    skillsMap.value = {};
    initialSkillKeys.value = new Set();
    if (!id || id === 'default') {
      jobsLoaded.value = true;
      nextTick(() => emit('content-ready'));
      return;
    }
    setTimeout(async () => {
      try {
        const data = await api.getResumeData(id);
        jobs.value = jobsArray(data.jobs);
        skillsMap.value = data.skills && typeof data.skills === 'object' ? data.skills : {};
        initialSkillKeys.value = new Set(Object.keys(skillsMap.value));
        jobsLoaded.value = true;
        nextTick(() => emit('content-ready'));
      } catch (err) {
        reportError(err, '[SkillJobsTab] load failed', '');
        loadError.value = 'Failed to load jobs: ' + err.message;
        jobsLoaded.value = true;
        nextTick(() => emit('content-ready'));
      }
    }, 0);
  },
  { immediate: true }
);
</script>

<style scoped>
.rde-tab-content.rde-skill-jobs {
  /* Fill .rde-body so .rde-sj-scroll can flex to the inner bottom (respects body padding) */
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
  padding: 6px 8px;
  outline: none;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}
.rde-tab-content.rde-skill-jobs:focus-visible {
  box-shadow: inset 0 0 0 2px rgba(74, 158, 255, 0.45);
  border-radius: 4px;
}
.rde-error {
  color: #e88;
  padding: 8px 0;
}
.rde-loading {
  color: rgba(255, 255, 255, 0.6);
  padding: 8px 0;
  font-size: 0.9rem;
}

.rde-skill-jobs-cross-empty {
  color: rgba(255, 255, 255, 0.55);
  font-size: 0.9rem;
  padding: 8px 0;
}

.rde-skill-jobs-split {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 100%;
}


.rde-sj-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior-x: contain;
  overscroll-behavior-y: none;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 4px;
}

/* One grid — header row + all skill rows — so columns are always shared. */
.rde-sj-matrix-grid {
  display: grid;
  min-width: min-content;
  box-sizing: border-box;
  gap: 1px;
  background: rgba(255, 255, 255, 0.14);
}

/* Sticky opaque header wrapper — spans all grid columns via subgrid so tracks match exactly. */
.rde-sj-header-jobs {
  display: grid;
  grid-template-columns: subgrid;
  grid-column: 1 / -1;
  position: sticky;
  top: 0;
  z-index: 2;
  box-sizing: border-box;
  background: rgb(20, 24, 32);
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
}

/* Corner and job-header cells are transparent — parent provides the opaque background. */
.rde-sj-corner {
  position: relative;
  box-sizing: border-box;
  background: transparent;
  min-height: var(--rde-sj-header-row-min, 4.35rem);
}

.rde-sj-corner .rde-sj-clear {
  position: absolute;
  top: 4px;
  left: 4px;
  z-index: 2;
}

.rde-sj-head-job {
  position: relative;
  box-sizing: border-box;
  min-height: var(--rde-sj-header-row-min, 4.35rem);
  padding: 0 1px;
  background: transparent;
  min-width: 0;
}

/* First character at bottom center of cell; rotate about left bottom of the label. */
.rde-sj-head-job .rde-skill-jobs-label {
  position: absolute;
  left: 50%;
  bottom: 0;
  transform-origin: left bottom;
}

.rde-sj-head-skill {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 1px 4px 1px 3px;
  font-size: 0.625rem;
  font-weight: 500;
  line-height: 1.15;
  color: rgba(255, 255, 255, 0.88);
  text-align: right;
  white-space: nowrap;
  background: rgba(255, 255, 255, 0.04);
  min-width: min-content;
}

.rde-sj-cell {
  appearance: none;
  display: block;
  margin: 0;
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  min-height: var(--rde-sj-cell-size, 1.4rem);
  background: #000;
  cursor: pointer;
  border: none;
  padding: 0;
}
.rde-sj-cell--selected {
  background: #6e6e6e;
}
.rde-sj-cell:hover:not(:disabled) {
  filter: brightness(1.15);
}
.rde-sj-cell:disabled {
  cursor: default;
  filter: none;
}
.rde-sj-cell:focus-visible {
  outline: 2px solid rgba(74, 158, 255, 0.85);
  outline-offset: -2px;
  z-index: 1;
}

.rotated-job-name,
.rde-skill-jobs-label {
  display: inline-block;
  transform: rotate(-45deg);
  transform-origin: left bottom;
  font-size: 0.625rem;
  font-weight: 600;
  color: #fff;
  background: transparent;
  letter-spacing: 0.02em;
  white-space: nowrap;
  line-height: 1;
  user-select: none;
  max-width: none;
}

.rde-btn.rde-sj-clear {
  font-size: 0.8rem;
  padding: 4px 12px;
  border-radius: 4px;
  background: rgba(232, 80, 80, 0.2);
  color: #f5a5a5;
  border: 1px solid rgba(232, 100, 100, 0.45);
  cursor: pointer;
}
.rde-btn.rde-sj-clear:hover:not(:disabled) {
  background: rgba(232, 80, 80, 0.35);
  color: #fff;
}
.rde-btn.rde-sj-clear:disabled {
  opacity: 0.45;
  cursor: default;
}
</style>
