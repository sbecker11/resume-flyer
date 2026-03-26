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
              <option value="" disabled>Merge link</option>
              <option v-for="s in sortedSkills" :key="s.id" :value="s.id">{{ s.name }}</option>
            </select>
            <label for="rde-skills-merge-to" class="rde-sr-only">Keep this skill</label>
            <select id="rde-skills-merge-to" name="mergeTo" v-model="mergeToKey" class="rde-select rde-merge-select" title="Keep this skill (canonical skillID)">
              <option value="" disabled>Into link</option>
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
          <div class="rde-skill-grid">
            <div
              v-for="skill in filteredSkills"
              :key="skill.id"
              class="rde-skill-item"
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
import { updateJobSkills, renameSkill, mergeSkill } from '@/modules/api/resumeManagerApi.mjs';
import { hasServer } from '@/modules/core/hasServer.mjs';

const canEdit = hasServer();

const props = defineProps({
  resumeId: { type: String, default: '' },
  /** When ResumeDetailsEditor re-parses, it bumps this value to force reload. */
  reloadNonce: { type: Number, default: 0 },
  /** Shared 0-based job index (synced with Resume jobs tab). */
  selectedJobIndex: { type: Number, default: null }
});

const emit = defineEmits(['saved', 'update:selectedJobIndex']);

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

/** Resolve a skill name to the key used in skillsMap (name-keyed: name is key; id-keyed: find id where skill.name === name). */
function resolveSkillKey(name, skillsMap) {
  if (!name || !skillsMap || typeof skillsMap !== 'object') return null;
  if (skillsMap[name]) return name;
  const entry = Object.entries(skillsMap).find(([, s]) => s && (s.name === name || s.name === name.trim()));
  return entry ? entry[0] : null;
}

/** Extract skill keys (ids) that exist in skillsMap from [bracket] terms in description (matches enrichJobsWithSkills). */
function skillKeysFromDescription(description, skillsMap) {
  if (!description || typeof description !== 'string' || !skillsMap || typeof skillsMap !== 'object') return [];
  const out = [];
  const seen = new Set();
  const bracketRe = /\[([^\]]+)\]/g;
  let m;
  while ((m = bracketRe.exec(description)) !== null) {
    const name = m[1].trim();
    if (!name || seen.has(name)) continue;
    const key = resolveSkillKey(name, skillsMap);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

/** Return the set of skill IDs to show as selected for this job (skillIDs + description brackets in skills map). */
function getSelectedSkillIdsForJob(job, skillsMap) {
  const fromIds = new Set(job?.skillIDs || []);
  const fromDesc = skillKeysFromDescription(job?.Description ?? job?.description, skillsMap);
  fromDesc.forEach(id => fromIds.add(id));
  return fromIds;
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

/** @returns {Promise<boolean>} true if saved or nothing to save; false if save failed */
async function saveForCurrentJob() {
  if (!canEdit) return true;
  const idx = jobIndexLocal.value;
  if (idx == null || !props.resumeId || props.resumeId === 'default') return true;
  saving.value = true;
  try {
    const skillIDs = [...selected.value];
    const newSkills = skillIDs.filter(id => !initialSkillKeys.value.has(id));
    await updateJobSkills(props.resumeId, idx, skillIDs, newSkills);
    if (jobs.value[idx]) jobs.value[idx].skillIDs = skillIDs;
    newSkills.forEach(id => initialSkillKeys.value.add(id));
    // Refetch resume data so the updated skills list (including any new skill) is available for all jobs
    const data = await api.getResumeData(props.resumeId);
    jobs.value = jobsArray(data.jobs);
    skills.value = data.skills || {};
    initialSkillKeys.value = new Set(Object.keys(skills.value));
    selected.value = getSelectedSkillIdsForJob(jobs.value[idx], skills.value);
    emit('saved', { jobIndex: idx, skillIDs });
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
.rde-input:focus { outline: none; border-color: rgba(74,158,255,0.6); }
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
