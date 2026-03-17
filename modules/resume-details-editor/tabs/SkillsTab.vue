<template>
  <div class="rde-tab-content rde-skills">
    <p v-if="loadError" class="rde-error">{{ loadError }}</p>
    <template v-else>
      <section class="rde-section">
        <h3 class="rde-section-title">Job</h3>
        <select
          v-model="selectedJobIndex"
          class="rde-select"
          :disabled="jobs.length === 0"
        >
          <option value="" disabled>Select a job…</option>
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
            <input
              v-model="newSkillName"
              class="rde-input rde-add-skill"
              type="text"
              placeholder="Add a new skill…"
              @keydown.enter="addNewSkill"
            />
            <button type="button" class="rde-btn add" :disabled="!newSkillNameTrimmed" @click="addNewSkill">
              Add
            </button>
          </div>
          <div v-if="sortedSkills.length >= 2" class="rde-skills-merge-row">
            <select v-model="mergeFromKey" class="rde-select rde-merge-select" title="Skill to merge away">
              <option value="" disabled>Merge link</option>
              <option v-for="s in sortedSkills" :key="s.id" :value="s.id">{{ s.name }}</option>
            </select>
            <select v-model="mergeToKey" class="rde-select rde-merge-select" title="Keep this skill (canonical skillID)">
              <option value="" disabled>Into link</option>
              <option v-for="s in sortedSkills" :key="s.id" :value="s.id">{{ s.name }}</option>
            </select>
            <button type="button" class="rde-btn merge" :disabled="!canMerge" title="Replace the first skill with the second everywhere" @click="mergeSkills">
              Merge
            </button>
          </div>
          <div class="rde-skills-search-row">
            <input
              v-model="search"
              class="rde-input rde-search"
              type="text"
              placeholder="Filter skills…"
            />
            <span class="rde-count">{{ checkedCount }} selected</span>
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
                  @change="toggle(skill.id)"
                />
                <template v-if="editingSkillId === skill.id">
                  <input
                    ref="editSkillInputRef"
                    v-model="editingSkillName"
                    type="text"
                    class="rde-input rde-skill-edit-input"
                    @keydown.enter="saveEditSkill"
                    @keydown.escape="cancelEditSkill"
                  />
                  <button type="button" class="rde-btn edit-save" @click="saveEditSkill">Save</button>
                  <button type="button" class="rde-btn edit-cancel" @click="cancelEditSkill">Cancel</button>
                </template>
                <template v-else>
                  <span>{{ skill.name }}</span>
                  <button
                    type="button"
                    class="rde-skill-edit-btn"
                    aria-label="Edit skill name"
                    @click.stop="startEditSkill(skill)"
                  >
                    &#9998;
                  </button>
                </template>
              </label>
            </div>
          </div>
          <button
            type="button"
            class="rde-btn save"
            :disabled="saving"
            @click="saveForCurrentJob"
          >
            {{ saving ? 'Saving…' : 'Save skills for this job' }}
          </button>
        </section>
      </template>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue';
import * as api from '../api.mjs';
import { updateJobSkills, renameSkill, mergeSkill } from '@/modules/api/resumeManagerApi.mjs';

const props = defineProps({
  resumeId: { type: String, default: '' },
  initialJobIndex: { type: Number, default: null }
});

const emit = defineEmits(['saved']);

const jobs = ref([]);
const skills = ref({});
const initialSkillKeys = ref(new Set());
const loadError = ref('');
const selectedJobIndex = ref(null);
const search = ref('');
const newSkillName = ref('');
const saving = ref(false);
const selected = ref(new Set());
const editingSkillId = ref(null);
const editingSkillName = ref('');
const editSkillInputRef = ref(null);
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

watch(() => [props.resumeId, props.initialJobIndex], async ([id, initialIdx]) => {
  loadError.value = '';
  jobs.value = [];
  skills.value = {};
  selectedJobIndex.value = null;
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
    const idx = initialIdx != null && initialIdx >= 0 && initialIdx < jobs.value.length
      ? initialIdx
      : (jobs.value.length ? 0 : null);
    selectedJobIndex.value = idx;
    if (idx != null && jobs.value[idx]) {
      selected.value = getSelectedSkillIdsForJob(jobs.value[idx], skills.value);
    }
  } catch (err) {
    console.error('[SkillsTab] load failed:', err);
    loadError.value = 'Failed to load jobs and skills: ' + err.message;
  }
}, { immediate: true });

watch(selectedJobIndex, (idx) => {
  if (idx == null || !jobs.value[idx]) {
    selected.value = new Set();
    return;
  }
  selected.value = getSelectedSkillIdsForJob(jobs.value[idx], skills.value);
});

const selectedJob = computed(() => {
  const idx = selectedJobIndex.value;
  if (idx == null || idx < 0 || idx >= jobs.value.length) return null;
  return jobs.value[idx];
});

function jobLabel(job, i) {
  const role = job?.role ?? job?.Role ?? '';
  const employer = job?.employer ?? job?.Employer ?? '';
  const part = [role, employer].filter(Boolean).join(' — ');
  return part ? `${i + 1}. ${part}` : `Job ${i + 1}`;
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

function toggle(id) {
  const s = new Set(selected.value);
  if (s.has(id)) s.delete(id);
  else s.add(id);
  selected.value = s;
}

function addNewSkill() {
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
  editingSkillId.value = skill.id;
  editingSkillName.value = skill.name;
  nextTick(() => {
    const refVal = editSkillInputRef.value;
    const el = Array.isArray(refVal) ? refVal.find(Boolean) : refVal;
    if (el && typeof el.focus === 'function') el.focus();
  });
}

function cancelEditSkill() {
  editingSkillId.value = null;
  editingSkillName.value = '';
}

async function saveEditSkill() {
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
    emit('saved', { skillRenamed: true });
  } catch (err) {
    console.error('[SkillsTab] rename skill failed:', err);
    alert('Failed to rename skill: ' + err.message);
  } finally {
    saving.value = false;
  }
}

async function mergeSkills() {
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

async function saveForCurrentJob() {
  const idx = selectedJobIndex.value;
  if (idx == null || !props.resumeId || props.resumeId === 'default') return;
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
  } catch (err) {
    console.error('[SkillsTab] save failed:', err);
    alert('Failed to save skills: ' + err.message);
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.rde-tab-content.rde-skills {
  --rde-skills-gap: 10px;
}
.rde-skills .rde-section {
  margin-bottom: var(--rde-skills-gap);
}
.rde-skills .rde-section:last-child { margin-bottom: 0; }
.rde-skills .rde-section-title { font-size: 0.8rem; font-weight: 600; color: #fff; margin: 0 0 var(--rde-skills-gap); }
.rde-error { color: #e88; padding: var(--rde-skills-gap) 0; }
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
.rde-skill-edit-input {
  flex: 1;
  min-width: 0;
  padding: 4px 8px;
  font-size: 0.9rem;
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
.rde-skills .rde-btn.save {
  background: #4a9eff;
  color: #fff;
  border: none;
  padding: 6px 18px;
  border-radius: 4px;
  font-size: 0.85rem;
  cursor: pointer;
}
.rde-skills .rde-btn.save:hover:not(:disabled) { background: #6ab0ff; }
.rde-skills .rde-btn.save:disabled { opacity: 0.5; cursor: default; }
</style>
