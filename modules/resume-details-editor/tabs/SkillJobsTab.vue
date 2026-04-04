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
        <div class="rde-skill-jobs-cross-frame" aria-label="Job and skill cross grid">
          <!-- Fixed: job headers only (rotated names stay visible) -->
          <div class="rde-sj-header-strip" :style="crossHeaderGridStyle">
            <div class="rde-sj-corner" aria-hidden="true" />
            <div
              v-for="(job, ji) in jobsList"
              :key="'job-h-' + ji"
              class="rde-sj-head-job"
            >
              <span class="rde-skill-jobs-label rotated-job-name">{{ rotatedJobHeaderText(job, ji) }}</span>
            </div>
          </div>

          <!-- Scrolls: skill names + matrix cells -->
          <div class="rde-sj-scroll">
            <div class="rde-sj-body-grid" :style="crossBodyGridStyle">
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
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, shallowRef, computed, watch, nextTick } from 'vue';
import * as api from '../api.mjs';
import { reportError } from '@/modules/utils/errorReporting.mjs';
import { isEducationDerivedJob, educationKeyOf } from '@/modules/data/ResumeJob.mjs';
import { educationJobDisplayNameFromParts } from '@/modules/utils/educationJobDisplayName.mjs';
import { getSelectedSkillIdsForJob, filterDescriptionBracketsToSkillSelection } from '../jobSkillsSelection.mjs';
import { hasServer } from '@/modules/core/hasServer.mjs';
import { updateJobSkills, updateEducationJobSkills } from '@/modules/api/resumeManagerApi.mjs';

const props = defineProps({
  resumeId: { type: String, default: '' },
  reloadNonce: { type: Number, default: 0 },
});

const emit = defineEmits(['content-ready', 'saved']);

const canEdit = hasServer();
const saving = ref(false);
/** Skill keys that existed when this panel loaded / last refetched (for updateJobSkills newSkills). */
const initialSkillKeys = ref(new Set());

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

const crossGridColumnsStyle = computed(() => {
  const nj = jobsList.value.length;
  if (nj === 0) return {};
  return {
    /* Skill col: max-content one line; job cols match body row height for square cells. */
    gridTemplateColumns: `minmax(8rem, max-content) repeat(${nj}, ${JOB_MATRIX_CELL_REM}rem)`,
  };
});

const crossHeaderGridStyle = computed(() => ({
  ...crossGridColumnsStyle.value,
  gridTemplateRows: `minmax(${JOB_HEADER_ROW_MIN_REM}rem, auto)`,
  '--rde-sj-header-row-min': `${JOB_HEADER_ROW_MIN_REM}rem`,
}));

const crossBodyGridStyle = computed(() => {
  const ns = skillRowsForMatrix.value.length;
  return {
    ...crossGridColumnsStyle.value,
    gridTemplateRows: `repeat(${Math.max(ns, 1)}, minmax(${JOB_MATRIX_CELL_REM}rem, auto))`,
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
    && !saving.value
    && props.resumeId
    && props.resumeId !== 'default'
    && job != null
  );
}

async function onMatrixCellClick(jobIndex, skillRow) {
  const job = jobs.value[jobIndex];
  if (!matrixCellInteractive(job)) return;
  const map = skillsMap.value;
  const next = new Set(getSelectedSkillIdsForJob(job, map));
  if (next.has(skillRow.id)) next.delete(skillRow.id);
  else next.add(skillRow.id);
  const skillIDs = [...next];
  const newSkills = skillIDs.filter((id) => !initialSkillKeys.value.has(id));
  saving.value = true;
  try {
    if (isEducationDerivedJob(job)) {
      const ek = educationKeyOf(job);
      if (!ek) throw new Error('Education row has no educationKey.');
      await updateEducationJobSkills(props.resumeId, ek, skillIDs, newSkills);
    } else {
      await updateJobSkills(props.resumeId, jobIndex, skillIDs, newSkills);
      const rawDesc = String(job?.Description ?? job?.description ?? '');
      const alignedDesc = filterDescriptionBracketsToSkillSelection(rawDesc, next, map);
      if (alignedDesc !== rawDesc) {
        await api.updateJob(props.resumeId, jobIndex, { Description: alignedDesc });
      }
    }
    const data = await api.getResumeData(props.resumeId);
    jobs.value = jobsArray(data.jobs);
    skillsMap.value = data.skills && typeof data.skills === 'object' ? data.skills : {};
    initialSkillKeys.value = new Set(Object.keys(skillsMap.value));
    emit('saved', { jobIndex, skillIDs });
  } catch (err) {
    reportError(err, '[SkillJobsTab] Failed to save job–skill link', '');
    alert('Failed to save: ' + (err instanceof Error ? err.message : String(err)));
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

/*
 * Cartesian grid: columns = jobs; header row fixed, body = skills × jobs (scrolls).
 */
.rde-skill-jobs-cross-frame {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
  max-width: 100%;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 4px;
  overflow: hidden;
  box-sizing: border-box;
}

.rde-sj-header-strip {
  display: grid;
  flex: 0 0 auto;
  width: 100%;
  box-sizing: border-box;
  gap: 1px;
  padding: 0;
  background: rgba(255, 255, 255, 0.14);
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
  z-index: 1;
}

.rde-sj-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  -webkit-overflow-scrolling: touch;
  /* Block scroll chaining to .rde-body; damp rubber-band at top/bottom (macOS trackpad / touch) */
  overscroll-behavior-x: contain;
  overscroll-behavior-y: none;
}

.rde-sj-body-grid {
  display: grid;
  width: 100%;
  box-sizing: border-box;
  gap: 1px;
  padding: 0;
  background: rgba(255, 255, 255, 0.14);
  min-width: min-content;
}

.rde-sj-corner {
  background: rgba(20, 24, 32, 0.92);
  min-height: var(--rde-sj-header-row-min, 4.35rem);
}

.rde-sj-head-job {
  position: relative;
  box-sizing: border-box;
  min-height: var(--rde-sj-header-row-min, 4.35rem);
  padding: 0 1px;
  background: rgba(255, 255, 255, 0.04);
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
</style>
