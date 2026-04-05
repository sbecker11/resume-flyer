<template>
  <div class="rde-tab-content rde-skills">
    <p v-if="loadError" class="rde-error">{{ loadError }}</p>
    <template v-else>
      <section class="rde-section">
        <label for="rde-skills-job-select" class="rde-sr-only">Select job</label>
        <select
          id="rde-skills-job-select"
          name="rde-skills-job"
          v-model="jobIndexLocal"
          class="rde-select"
          :disabled="jobs.length === 0"
          @change="emit('update:selectedJobIndex', jobIndexLocal)"
        >
          <option value="" disabled>jobs</option>
          <option
            v-for="(job, i) in jobs"
            :key="i"
            :value="i"
          >
            {{ jobLabel(job, i) }}
          </option>
        </select>
      </section>
      <template v-if="selectedJob != null">
        <section class="rde-section">
          <div class="rde-skills-add-row">
            <label for="rde-skills-new-skill" class="rde-sr-only">Add a new skill</label>
            <input
              id="rde-skills-new-skill"
              name="newSkill"
              v-model="newSkillName"
              class="rde-input rde-add-skill"
              type="text"
              placeholder="Add a new skill…"
              @keydown.enter="addNewSkill"
            />
            <button type="button" class="rde-btn add" :disabled="!canEdit || !newSkillNameTrimmed" @click="addNewSkill">
              Add
            </button>
          </div>
          <div v-if="sortedSkills.length >= 2" class="rde-skills-merge-row">
            <label for="rde-skills-merge-from" class="rde-sr-only">Skill to merge away</label>
            <select id="rde-skills-merge-from" name="mergeFrom" v-model="mergeFromKey" class="rde-select rde-merge-select" title="Skill to merge away">
              <option value="" disabled>Merge skill</option>
              <option v-for="s in sortedSkills" :key="s.id" :value="s.id">{{ s.name }}</option>
            </select>
            <label for="rde-skills-merge-to" class="rde-sr-only">Keep this skill</label>
            <select id="rde-skills-merge-to" name="mergeTo" v-model="mergeToKey" class="rde-select rde-merge-select" title="Keep this skill (canonical skillID)">
              <option value="" disabled>To skill</option>
              <option v-for="s in sortedSkills" :key="s.id" :value="s.id">{{ s.name }}</option>
            </select>
            <button type="button" class="rde-btn merge" :disabled="!canEdit || !canMerge" title="Replace the first skill with the second everywhere" @click="mergeSkills">
              Merge
            </button>
          </div>
          <div class="rde-skills-search-row">
            <label for="rde-skills-search" class="rde-sr-only">Filter skills</label>
            <input
              id="rde-skills-search"
              name="search"
              v-model="search"
              class="rde-input rde-search"
              type="text"
              placeholder="Filter skills…"
            />
            <span class="rde-count">{{ checkedCount }} selected out of {{ totalCount }} total</span>
          </div>
          <div
            ref="skillGridRef"
            class="rde-skill-grid"
            @keydown="onSkillGridKeydown"
          >
            <div
              v-for="skill in filteredSkills"
              :key="skill.id"
              class="rde-skill-item"
              :data-skill-id="String(skill.id)"
              :class="{ checked: selected.has(skill.id) }"
            >
              <label class="rde-skill-item-label">
                <input
                  type="checkbox"
                  :checked="selected.has(skill.id)"
                  :disabled="skillEditModalOpen"
                  @change="toggleAndAutosave(skill.id)"
                />
                <button
                  type="button"
                  class="rde-skill-edit-btn"
                  aria-label="Edit skill name"
                  @click.stop="startEditSkill(skill)"
                >
                  &#9998;
                </button>
                <span>{{ skill.name }}</span>
              </label>
            </div>
          </div>
        </section>
      </template>
    </template>
  </div>

  <Teleport to="body">
    <div
      v-if="skillEditModalOpen"
      class="rde-skill-edit-overlay"
      @click.self="cancelEditSkill"
    >
      <div
        class="rde-skill-edit-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Edit skill"
        @keydown.esc="cancelEditSkill"
      >
        <div class="rde-skill-edit-title">Edit skill</div>
        <div class="rde-skill-edit-input-row">
          <input
            ref="editSkillInputRef"
            v-model="editingSkillName"
            type="text"
            class="rde-input rde-skill-edit-input"
            :aria-label="`Edit ${editingSkillId}`"
            @keydown.enter="saveEditSkill"
          />
        </div>
        <div class="rde-skill-edit-actions-row">
          <button
            ref="editCancelBtnRef"
            type="button"
            class="rde-btn edit-cancel"
            @click="cancelEditSkill"
          >
            Cancel
          </button>
          <button
            ref="editSaveBtnRef"
            type="button"
            class="rde-btn edit-save"
            :disabled="!canEdit"
            @click="saveEditSkill"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, shallowRef, computed, watch, nextTick } from 'vue';
import * as api from '../api.mjs';
import { updateJobSkills, updateEducationJobSkills, renameSkill, mergeSkill } from '@/modules/api/resumeManagerApi.mjs';
import { hasServer } from '@/modules/core/hasServer.mjs';
import { ResumeJob, isEducationDerivedJob, educationKeyOf } from '@/modules/data/ResumeJob.mjs';
import { educationJobDisplayNameFromParts } from '@/modules/utils/educationJobDisplayName.mjs';
import { jobTenureMonthsInclusive } from '@/modules/utils/dateUtils.mjs';
import { getSelectedSkillIdsForJob, filterDescriptionBracketsToSkillSelection } from '../jobSkillsSelection.mjs';

const canEdit = hasServer();

const props = defineProps({
  resumeId: { type: String, default: '' },
  /** When ResumeDetailsEditor re-parses, it bumps this value to force reload. */
  reloadNonce: { type: Number, default: 0 },
  /** Shared 0-based job index (synced with Resume jobs tab). */
  selectedJobIndex: { type: Number, default: null }
});

const emit = defineEmits(['saved', 'update:selectedJobIndex', 'content-ready']);

const jobs = shallowRef([]);
const skills = shallowRef({});
const initialSkillKeys = ref(new Set());
const loadError = ref('');
const jobIndexLocal = ref(null);
const search = ref('');
const newSkillName = ref('');
const saving = ref(false);
const selected = ref(new Set());
const editingSkillId = ref(null);
const editingSkillName = ref('');
const editSkillInputRef = ref(null);
const editSaveBtnRef = ref(null);
const editCancelBtnRef = ref(null);
const skillEditModalOpen = ref(false);
const mergeFromKey = ref('');
const mergeToKey = ref('');
const skillGridRef = ref(null);
/** Same letter repeated cycles through filtered skills whose names start with that letter (a–z). */
const skillLetterCycle = ref({ letter: '', matchIndex: -1 });

function resetSkillLetterCycle() {
  skillLetterCycle.value = { letter: '', matchIndex: -1 };
}

const newSkillNameTrimmed = computed(() => (newSkillName.value || '').trim());
const canMerge = computed(() => {
  const from = mergeFromKey.value;
  const to = mergeToKey.value;
  const bothSelected = (from != null && from !== '') && (to != null && to !== '');
  return bothSelected && from !== to && !!props.resumeId && props.resumeId !== 'default';
});

// Ensure jobs is always an array (API may return array or object keyed by index)
function jobsArray(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  const keys = Object.keys(data).filter(k => /^\d+$/.test(k)).sort((a, b) => Number(a) - Number(b));
  return keys.map(k => data[k]);
}

watch(() => [props.resumeId, props.reloadNonce], async ([id]) => {
  loadError.value = '';
  jobs.value = [];
  skills.value = {};
  jobIndexLocal.value = null;
  selected.value = new Set();
  search.value = '';
  editingSkillId.value = null;
  editingSkillName.value = '';
  mergeFromKey.value = '';
  mergeToKey.value = '';
  if (!id || id === 'default') return;
  try {
    const data = await api.getResumeData(id);
    jobs.value = jobsArray(data.jobs);
    skills.value = data.skills || {};
    initialSkillKeys.value = new Set(Object.keys(skills.value));
    let idx = null;
    if (props.selectedJobIndex != null && props.selectedJobIndex >= 0 && props.selectedJobIndex < jobs.value.length) {
      idx = Number(props.selectedJobIndex);
    } else if (jobs.value.length) {
      idx = 0;
    }
    jobIndexLocal.value = idx;
    if (idx != null) emit('update:selectedJobIndex', idx);
    if (idx != null && jobs.value[idx]) {
      selected.value = getSelectedSkillIdsForJob(jobs.value[idx], skills.value);
    }
  } catch (err) {
    console.error('[SkillsTab] load failed:', err);
    loadError.value = 'Failed to load jobs and skills: ' + err.message;
  }
  nextTick(() => emit('content-ready'));
}, { immediate: true });

watch(
  () => props.selectedJobIndex,
  (v) => {
    if (!jobs.value.length) return;
    if (v == null || v < 0 || v >= jobs.value.length) return;
    if (jobIndexLocal.value !== v) jobIndexLocal.value = v;
  }
);

watch(jobIndexLocal, (idx) => {
  resetSkillLetterCycle();
  if (idx == null || !jobs.value[idx]) {
    selected.value = new Set();
    return;
  }
  selected.value = getSelectedSkillIdsForJob(jobs.value[idx], skills.value);
});

const selectedJob = computed(() => {
  const idx = jobIndexLocal.value;
  if (idx == null || idx < 0 || idx >= jobs.value.length) return null;
  return jobs.value[idx];
});

function jobLabel(job, i) {
  const title = job?.title ?? job?.role ?? job?.Role ?? '';
  const employer = job?.employer ?? job?.Employer ?? job?.label ?? '';
  if (isEducationDerivedJob(job)) {
    const shortName = educationJobDisplayNameFromParts(employer, title);
    return shortName ? `${shortName} (education)` : `Job ${i + 1} (education)`;
  }
  const parts = [employer, title].filter(Boolean);
  return parts.length ? parts.join(' -- ') : `Job ${i + 1}`;
}

const sortedSkills = computed(() => {
  return Object.entries(skills.value)
    .map(([id, s]) => ({ id, name: (s && s.name) || id }))
    .sort((a, b) => a.name.localeCompare(b.name));
});

const filteredSkills = computed(() => {
  const q = search.value.toLowerCase();
  if (!q) return sortedSkills.value;
  return sortedSkills.value.filter(s => s.name.toLowerCase().includes(q));
});

watch(
  () => [search.value, filteredSkills.value],
  () => resetSkillLetterCycle(),
  { deep: true }
);

function escapeAttrId(id) {
  const s = String(id);
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(s) : s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function focusSkillCheckboxById(skillId) {
  const grid = skillGridRef.value;
  if (!grid) return;
  const row = grid.querySelector(`[data-skill-id="${escapeAttrId(skillId)}"]`);
  const cb = row?.querySelector('input[type="checkbox"]');
  if (cb && typeof cb.focus === 'function') cb.focus();
}

const RDE_SKILL_LETTER_ORDER = 'abcdefghijklmnopqrstuvwxyz';

function matchesForLetterKey(ch) {
  const c = String(ch).toLowerCase();
  if (!/^[a-z]$/.test(c)) return [];
  return filteredSkills.value.filter((s) => (s.name || '').toLowerCase().startsWith(c));
}

function nextLetterGroupAfter(letter) {
  const start = RDE_SKILL_LETTER_ORDER.indexOf(String(letter).toLowerCase());
  if (start < 0) return null;
  for (let step = 1; step < 26; step++) {
    const L = RDE_SKILL_LETTER_ORDER[(start + step) % 26];
    const m = matchesForLetterKey(L);
    if (m.length) return { letter: L, matches: m };
  }
  return null;
}

function prevLetterGroupBefore(letter) {
  const start = RDE_SKILL_LETTER_ORDER.indexOf(String(letter).toLowerCase());
  if (start < 0) return null;
  for (let step = 1; step < 26; step++) {
    const L = RDE_SKILL_LETTER_ORDER[(start - step + 26) % 26];
    const m = matchesForLetterKey(L);
    if (m.length) return { letter: L, matches: m };
  }
  return null;
}

function skillIdFromGridKeyTarget(target) {
  const row = target?.closest?.('[data-skill-id]');
  const id = row?.getAttribute?.('data-skill-id');
  return id != null && id !== '' ? id : null;
}

/** Tab order inside `.rde-skill-grid` (matches ResumeDetailsEditor focus walker). */
function gridFocusablesInOrder() {
  const grid = skillGridRef.value;
  if (!grid) return [];
  const list = [];
  const walker = document.createTreeWalker(
    grid,
    NodeFilter.SHOW_ELEMENT,
    {
      acceptNode(node) {
        if (node.nodeType !== Node.ELEMENT_NODE) return NodeFilter.FILTER_SKIP;
        const tag = node.tagName;
        if (!['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(tag)) return NodeFilter.FILTER_SKIP;
        if (node.hasAttribute('disabled')) return NodeFilter.FILTER_SKIP;
        if (node.getAttribute('tabindex') === '-1') return NodeFilter.FILTER_SKIP;
        if (tag === 'INPUT' && node.type === 'hidden') return NodeFilter.FILTER_SKIP;
        const s = getComputedStyle(node);
        if (s.visibility === 'hidden' || s.display === 'none') return NodeFilter.FILTER_SKIP;
        const r = node.getBoundingClientRect();
        if (r.width <= 0 && r.height <= 0) return NodeFilter.FILTER_SKIP;
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );
  let n = walker.nextNode();
  while (n) {
    list.push(n);
    n = walker.nextNode();
  }
  return list;
}

function onSkillGridKeydown(e) {
  if (skillEditModalOpen.value) return;
  if (!skillGridRef.value?.contains(e.target)) return;
  const t = e.target;

  if (e.key === 'Tab') {
    const L = skillLetterCycle.value.letter;
    if (!L || !/^[a-z]$/.test(L)) return;

    const matches = matchesForLetterKey(L);
    if (!matches.length) return;

    const tabStops = gridFocusablesInOrder();

    // Shift+Tab from first grid stop → previous panel control (modal handler).
    if (e.shiftKey && tabStops.length && tabStops[0] === t) {
      return;
    }
    // Forward Tab from letter-focused checkbox → same row’s pencil (native order).
    if (!e.shiftKey && t.tagName === 'INPUT' && t.type === 'checkbox') {
      return;
    }
    // Forward Tab from last grid stop → footer (modal handler), not next letter group.
    if (!e.shiftKey && tabStops.length && tabStops[tabStops.length - 1] === t) {
      return;
    }

    const currentId = skillIdFromGridKeyTarget(t);
    if (currentId == null) return;

    const idx = matches.findIndex((s) => s.id === currentId);
    if (idx < 0) return;

    if (e.shiftKey) {
      if (idx > 0) {
        e.preventDefault();
        const nextIdx = idx - 1;
        skillLetterCycle.value = { letter: L, matchIndex: nextIdx };
        focusSkillCheckboxById(matches[nextIdx].id);
        return;
      }
      const prevGroup = prevLetterGroupBefore(L);
      if (!prevGroup) return;
      e.preventDefault();
      const lastIdx = prevGroup.matches.length - 1;
      skillLetterCycle.value = { letter: prevGroup.letter, matchIndex: lastIdx };
      focusSkillCheckboxById(prevGroup.matches[lastIdx].id);
      return;
    }

    if (idx < matches.length - 1) {
      e.preventDefault();
      const nextIdx = idx + 1;
      skillLetterCycle.value = { letter: L, matchIndex: nextIdx };
      focusSkillCheckboxById(matches[nextIdx].id);
      return;
    }
    const nextGroup = nextLetterGroupAfter(L);
    if (!nextGroup) return;
    e.preventDefault();
    skillLetterCycle.value = { letter: nextGroup.letter, matchIndex: 0 };
    focusSkillCheckboxById(nextGroup.matches[0].id);
    return;
  }

  if (t.tagName === 'TEXTAREA') return;
  if (t.tagName === 'INPUT' && t.type !== 'checkbox') return;

  if (e.key.length !== 1) return;
  const ch = e.key.toLowerCase();
  if (!/^[a-z]$/.test(ch)) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;

  const list = filteredSkills.value;
  const matches = list.filter((s) => (s.name || '').toLowerCase().startsWith(ch));
  if (!matches.length) return;

  e.preventDefault();

  let nextIdx = 0;
  if (skillLetterCycle.value.letter === ch) {
    nextIdx = (skillLetterCycle.value.matchIndex + 1) % matches.length;
  }
  skillLetterCycle.value = { letter: ch, matchIndex: nextIdx };

  focusSkillCheckboxById(matches[nextIdx].id);
}

const checkedCount = computed(() => selected.value.size);
const totalCount = computed(() => sortedSkills.value.length);

function toggle(id) {
  const s = new Set(selected.value);
  if (s.has(id)) s.delete(id);
  else s.add(id);
  selected.value = s;
}

async function toggleAndAutosave(id) {
  if (!canEdit) return;
  toggle(id);
  await saveForCurrentJob();
}

function onEditSkillNameFocusOut() {}

function addNewSkill() {
  if (!canEdit) return
  const name = newSkillNameTrimmed.value;
  if (!name) return;
  newSkillName.value = '';
  const id = name;
  if (skills.value[id] != null) {
    const s = new Set(selected.value);
    s.add(id);
    selected.value = s;
  } else {
    skills.value = { ...skills.value, [id]: { name } };
    const s = new Set(selected.value);
    s.add(id);
    selected.value = s;
  }
  // Persist immediately so the new/added skill is not lost if user switches job or closes without clicking Save
  saveForCurrentJob();
}

function startEditSkill(skill) {
  if (!canEdit) return;
  editingSkillId.value = skill.id;
  editingSkillName.value = skill.name;
  nextTick(() => {
    const refVal = editSkillInputRef.value;
    const el = Array.isArray(refVal) ? refVal.find(Boolean) : refVal;
    if (el && typeof el.focus === 'function') el.focus();
  });
  skillEditModalOpen.value = true;
}

function cancelEditSkill() {
  editingSkillId.value = null;
  editingSkillName.value = '';
  skillEditModalOpen.value = false;
}

async function saveEditSkill() {
  if (!canEdit) return
  const oldKey = editingSkillId.value;
  const newName = (editingSkillName.value || '').trim();
  if (!oldKey || !newName) {
    cancelEditSkill();
    return;
  }
  if (oldKey === newName) {
    cancelEditSkill();
    return;
  }
  if (!props.resumeId || props.resumeId === 'default') {
    cancelEditSkill();
    return;
  }
  saving.value = true;
  try {
    await renameSkill(props.resumeId, oldKey, newName);
    const s = new Set(selected.value);
    if (s.has(oldKey)) {
      s.delete(oldKey);
      s.add(newName);
      selected.value = s;
    }
    const data = await api.getResumeData(props.resumeId);
    jobs.value = jobsArray(data.jobs);
    skills.value = data.skills || {};
    initialSkillKeys.value = new Set(Object.keys(skills.value));
    editingSkillId.value = null;
    editingSkillName.value = '';
    skillEditModalOpen.value = false;
    emit('saved', { skillRenamed: true });
  } catch (err) {
    console.error('[SkillsTab] rename skill failed:', err);
    alert('Failed to rename skill: ' + err.message);
  } finally {
    saving.value = false;
  }
}

async function mergeSkills() {
  if (!canEdit) return
  const from = mergeFromKey.value;
  const to = mergeToKey.value;
  if (!from || !to || from === to || !props.resumeId || props.resumeId === 'default') return;
  saving.value = true;
  try {
    await mergeSkill(props.resumeId, from, to);
    const s = new Set(selected.value);
    if (s.has(from)) {
      s.delete(from);
      s.add(to);
      selected.value = s;
    }
    const data = await api.getResumeData(props.resumeId);
    jobs.value = jobsArray(data.jobs);
    skills.value = data.skills || {};
    initialSkillKeys.value = new Set(Object.keys(skills.value));
    mergeFromKey.value = '';
    mergeToKey.value = '';
    emit('saved', { skillMerged: true });
  } catch (err) {
    console.error('[SkillsTab] merge skill failed:', err);
    alert('Failed to merge skill: ' + err.message);
  } finally {
    saving.value = false;
  }
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

function patchJobRowLocal(jobIndex, skillIDs, descriptionIfWork) {
  const list = jobs.value.map((j, i) => {
    if (i !== jobIndex) return j;
    const plain = j instanceof ResumeJob ? j.toPlainObject() : { ...j };
    plain.skillIDs = [...skillIDs];
    if (descriptionIfWork !== undefined) plain.Description = descriptionIfWork;
    const patched = ResumeJob.fromPlainObject(plain);
    patched.durationMonths = jobTenureMonthsInclusive(patched.start, patched.end);
    return patched;
  });
  jobs.value = list;
}

/** @returns {Promise<boolean>} true if saved or nothing to save; false if save failed */
async function saveForCurrentJob() {
  if (!canEdit) return true;
  const idx = jobIndexLocal.value;
  if (idx == null || !props.resumeId || props.resumeId === 'default') return true;
  saving.value = true;
  try {
    const selectedSet = selected.value;
    const skillIDs = [...selectedSet];
    const newSkills = skillIDs.filter(id => !initialSkillKeys.value.has(id));
    const jobRow = jobs.value[idx];
    const rawDesc = String(jobRow?.Description ?? jobRow?.description ?? '');
    const alignedDesc = !isEducationDerivedJob(jobRow)
      ? filterDescriptionBracketsToSkillSelection(rawDesc, selectedSet, skills.value)
      : rawDesc;
    if (isEducationDerivedJob(jobRow)) {
      const ek = educationKeyOf(jobRow);
      if (!ek) throw new Error('Education row has no educationKey.');
      await updateEducationJobSkills(props.resumeId, ek, skillIDs, newSkills);
    } else {
      await updateJobSkills(props.resumeId, idx, skillIDs, newSkills);
      if (alignedDesc !== rawDesc) {
        await api.updateJob(props.resumeId, idx, { Description: alignedDesc });
      }
    }
    let nextSkills = skills.value;
    if (newSkills.length) {
      nextSkills = { ...skills.value };
      for (const n of newSkills) {
        if (!nextSkills[n]) nextSkills[n] = { name: n };
      }
      skills.value = nextSkills;
      initialSkillKeys.value = new Set(Object.keys(nextSkills));
    }
    patchJobRowLocal(
      idx,
      skillIDs,
      isEducationDerivedJob(jobRow) ? undefined : alignedDesc
    );
    selected.value = getSelectedSkillIdsForJob(jobs.value[idx], nextSkills);
    emit('saved', {
      jobIndex: idx,
      skillIDs,
      jobSkills: jobSkillsRecordFromMap(skillIDs, nextSkills),
    });
    return true;
  } catch (err) {
    console.error('[SkillsTab] save failed:', err);
    alert('Failed to save skills: ' + err.message);
    return false;
  } finally {
    saving.value = false;
  }
}

defineExpose({ saveForCurrentJob });
</script>

<style scoped>
.rde-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
.rde-tab-content.rde-skills {
  --rde-skills-gap: 12px;
  padding: 12px 16px;
}
.rde-skills .rde-section {
  margin-bottom: var(--rde-skills-gap);
}
.rde-skills .rde-section:first-child {
  margin-bottom: var(--rde-skills-gap);
}
.rde-skills .rde-section:last-child { margin-bottom: 0; }
.rde-skills .rde-section-title { font-size: 0.8rem; font-weight: 600; color: #fff; margin: 0 0 var(--rde-skills-gap); }
.rde-error { color: #e88; padding: var(--rde-skills-gap) 0; }
.rde-input {
  width: 100%;
  background: rgba(255,255,255,0.07);
  border: 1px solid rgba(255,255,255,0.2);
  border-radius: 4px;
  padding: 6px 10px;
  color: #e0e0e0;
  font-size: 0.9rem;
  box-sizing: border-box;
}
.rde-select {
  width: 100%;
  background: rgba(255,255,255,0.07);
  border: 1px solid rgba(255,255,255,0.2);
  border-radius: 4px;
  padding: 6px 10px;
  color: #e0e0e0;
  font-size: 0.9rem;
  box-sizing: border-box;
}
.rde-skills-add-row {
  display: flex;
  align-items: center;
  gap: var(--rde-skills-gap);
  margin-bottom: var(--rde-skills-gap);
}
.rde-add-skill { flex: 1; }
.rde-btn.add {
  background: rgba(74, 158, 255, 0.25);
  color: #6ab0ff;
  border: 1px solid #4a9eff;
  padding: 6px 14px;
  border-radius: 4px;
  font-size: 0.85rem;
  cursor: pointer;
}
.rde-btn.add:hover:not(:disabled) { background: rgba(74, 158, 255, 0.4); color: #8ac4ff; }
.rde-btn.add:disabled { opacity: 0.5; cursor: default; }
.rde-skills-merge-row {
  display: flex;
  align-items: center;
  gap: var(--rde-skills-gap);
  margin-bottom: var(--rde-skills-gap);
  flex-wrap: nowrap;
}
.rde-merge-select { flex: 1; min-width: 0; }
.rde-btn.merge {
  background: rgba(160, 100, 255, 0.25);
  color: #b89eff;
  border: 1px solid #8b6fd4;
  padding: 6px 14px;
  border-radius: 4px;
  font-size: 0.85rem;
  cursor: pointer;
}
.rde-btn.merge:hover:not(:disabled) { background: rgba(160, 100, 255, 0.4); color: #d4c4ff; }
.rde-btn.merge:disabled { opacity: 0.5; cursor: default; }
.rde-skills-search-row {
  display: flex;
  align-items: center;
  gap: var(--rde-skills-gap);
  margin-bottom: var(--rde-skills-gap);
}
.rde-search { flex: 1; }
.rde-count { font-size: 0.75rem; color: rgba(255,255,255,0.4); white-space: nowrap; }
.rde-skill-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--rde-skills-gap);
  align-content: start;
  margin-bottom: var(--rde-skills-gap);
  max-height: 280px;
  overflow-y: auto;
}
.rde-skill-item {
  display: flex;
  align-items: center;
  gap: var(--rde-skills-gap);
  padding: 6px 8px;
  border-radius: 3px;
  color: rgba(255,255,255,0.65);
  transition: background 0.1s;
  user-select: none;
}
.rde-skill-item:hover { background: rgba(255,255,255,0.07); }
.rde-skill-item.checked { color: #fff; }
.rde-skill-item-label {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
  cursor: pointer;
}
.rde-skill-item input[type="checkbox"] { accent-color: #4a9eff; cursor: pointer; flex-shrink: 0; }
.rde-skill-edit-wrap {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.rde-skill-edit-input {
  min-width: 0;
  padding: 4px 8px;
  font-size: 0.9rem;
}
.rde-skill-edit-actions {
  display: flex;
  gap: 6px;
  align-items: center;
}
.rde-skill-edit-btn {
  flex-shrink: 0;
  padding: 2px 6px;
  font-size: 12px;
  background: transparent;
  color: rgba(255,255,255,0.5);
  border: none;
  border-radius: 3px;
  cursor: pointer;
}
.rde-skill-edit-btn:hover { color: #4a9eff; background: rgba(74, 158, 255, 0.15); }
.rde-btn.edit-save, .rde-btn.edit-cancel {
  padding: 4px 10px;
  font-size: 0.8rem;
  border-radius: 3px;
  cursor: pointer;
  flex-shrink: 0;
}
.rde-btn.edit-save { background: #4a9eff; color: #fff; border: none; }
.rde-btn.edit-save:hover { background: #6ab0ff; }
.rde-btn.edit-cancel { background: transparent; color: rgba(255,255,255,0.7); border: 1px solid rgba(255,255,255,0.3); }
.rde-btn.edit-cancel:hover { background: rgba(255,255,255,0.08); }

/* Skill rename modal (pencil icon) */
.rde-skill-edit-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  z-index: 21000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
  box-sizing: border-box;
}
.rde-skill-edit-modal {
  width: 300px;
  max-width: 100%;
  background: #1e1e1e;
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 8px;
  color: #e0e0e0;
  font-family: Arial, sans-serif;
  box-sizing: border-box;
  padding: 16px;
}
.rde-skill-edit-title {
  font-size: 0.8rem;
  font-weight: 700;
  color: rgba(255,255,255,0.6);
  margin-bottom: 10px;
}
.rde-skill-edit-input-row {
  margin-bottom: 10px;
}
.rde-skill-edit-actions-row {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
