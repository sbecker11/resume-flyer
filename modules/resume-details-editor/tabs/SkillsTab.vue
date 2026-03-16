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
            <label
              v-for="skill in filteredSkills"
              :key="skill.id"
              class="rde-skill-item"
              :class="{ checked: selected.has(skill.id) }"
            >
              <input
                type="checkbox"
                :checked="selected.has(skill.id)"
                @change="toggle(skill.id)"
              />
              <span>{{ skill.name }}</span>
            </label>
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
import { ref, computed, watch } from 'vue';
import * as api from '../api.mjs';
import { updateJobSkills } from '@/modules/api/resumeManagerApi.mjs';

const props = defineProps({
  resumeId: { type: String, default: '' },
  initialJobIndex: { type: Number, default: null }
});

const emit = defineEmits(['saved']);

const jobs = ref([]);
const skills = ref({});
const loadError = ref('');
const selectedJobIndex = ref(null);
const search = ref('');
const saving = ref(false);
const selected = ref(new Set());

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
  if (!id || id === 'default') return;
  try {
    const data = await api.getResumeData(id);
    jobs.value = jobsArray(data.jobs);
    skills.value = data.skills || {};
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

async function saveForCurrentJob() {
  const idx = selectedJobIndex.value;
  if (idx == null || !props.resumeId || props.resumeId === 'default') return;
  saving.value = true;
  try {
    const skillIDs = [...selected.value];
    await updateJobSkills(props.resumeId, idx, skillIDs);
    if (jobs.value[idx]) jobs.value[idx].skillIDs = skillIDs;
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
.rde-skills .rde-section-title { font-size: 0.8rem; font-weight: 600; color: #fff; margin: 0 0 8px; }
.rde-error { color: #e88; padding: 8px 0; }
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
.rde-skills-search-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.rde-search { flex: 1; }
.rde-count { font-size: 0.75rem; color: rgba(255,255,255,0.4); white-space: nowrap; }
.rde-skill-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 2px 8px;
  align-content: start;
  margin-bottom: 12px;
  max-height: 280px;
  overflow-y: auto;
}
.rde-skill-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  border-radius: 3px;
  cursor: pointer;
  color: rgba(255,255,255,0.65);
  transition: background 0.1s;
  user-select: none;
}
.rde-skill-item:hover { background: rgba(255,255,255,0.07); }
.rde-skill-item.checked { color: #fff; }
.rde-skill-item input[type="checkbox"] { accent-color: #4a9eff; cursor: pointer; }
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
