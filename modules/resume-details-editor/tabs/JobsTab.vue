<template>
  <div class="rde-tab-content rde-jobs">
    <p v-if="loadError" class="rde-error">{{ loadError }}</p>
    <template v-else>
      <section class="rde-section">
        <h3 class="rde-section-title">Job</h3>
        <select
          v-model="selectedJobIndex"
          class="rde-select"
          :disabled="jobsList.length === 0"
        >
          <option value="" disabled>Select a job…</option>
          <option
            v-for="(job, i) in jobsList"
            :key="i"
            :value="i"
          >
            {{ jobOptionLabel(job, i) }}
          </option>
        </select>
      </section>
      <template v-if="selectedJob != null">
        <section class="rde-section rde-job-fields">
          <div class="rde-field">
            <label class="rde-label">Employer</label>
            <input ref="employerInputRef" v-model="local.employer" type="text" class="rde-input" placeholder="Employer name" />
          </div>
          <div class="rde-field">
            <label class="rde-label">Title</label>
            <input v-model="local.title" type="text" class="rde-input" placeholder="Job title" />
          </div>
          <div class="rde-field rde-date-row">
            <div class="rde-date-field">
              <label class="rde-label">Start (YY/MM)</label>
              <div class="rde-date-inputs">
                <select v-model="local.startYear" class="rde-select rde-date-select">
                  <option value="">—</option>
                  <option v-for="y in yearOptions" :key="y" :value="y">{{ y }}</option>
                </select>
                <select v-model="local.startMonth" class="rde-select rde-date-select">
                  <option value="">—</option>
                  <option v-for="m in 12" :key="m" :value="m">{{ String(m).padStart(2, '0') }}</option>
                </select>
              </div>
            </div>
            <div class="rde-date-field">
              <label class="rde-label">End (YY/MM)</label>
              <div class="rde-date-inputs">
                <select v-model="local.endYear" class="rde-select rde-date-select">
                  <option value="">—</option>
                  <option v-for="y in yearOptions" :key="y" :value="y">{{ y }}</option>
                </select>
                <select v-model="local.endMonth" class="rde-select rde-date-select">
                  <option value="">—</option>
                  <option v-for="m in 12" :key="m" :value="m">{{ String(m).padStart(2, '0') }}</option>
                </select>
              </div>
            </div>
          </div>
          <div class="rde-field">
            <label class="rde-label">Description</label>
            <textarea
              ref="descriptionInputRef"
              v-model="local.Description"
              class="rde-textarea rde-description"
              placeholder="Job description…"
              rows="8"
            />
          </div>
        </section>
        <section class="rde-section rde-job-actions">
          <button type="button" class="rde-btn save" :disabled="saving" @click="saveCurrentJob">
            {{ saving ? 'Saving…' : 'Save job' }}
          </button>
          <button type="button" class="rde-btn skills" @click="openSkillsForCurrentJob">
            Skills
          </button>
        </section>
      </template>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue';
import * as api from '../api.mjs';

const props = defineProps({
  resumeId: { type: String, default: '' },
  /** When opening to this tab, preselect this job index (0-based). */
  initialJobIndex: { type: Number, default: null },
  /** After job is selected, focus this field ('employer' | 'description'). */
  initialFocusField: { type: String, default: null }
});

const emit = defineEmits(['saved', 'open-skills-for-job']);

const employerInputRef = ref(null);
const descriptionInputRef = ref(null);
const jobs = ref([]);
const loadError = ref('');
const selectedJobIndex = ref(null);
const saving = ref(false);
const local = ref({ employer: '', title: '', startYear: '', startMonth: '', endYear: '', endMonth: '', Description: '' });

function jobsArray(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  const keys = Object.keys(data).filter(k => /^\d+$/.test(k)).sort((a, b) => Number(a) - Number(b));
  return keys.map(k => data[k]);
}

const jobsList = computed(() => jobs.value);

const yearOptions = computed(() => {
  const current = new Date().getFullYear();
  const out = [];
  for (let y = current; y >= current - 80; y--) out.push(y);
  return out;
});

watch(() => props.resumeId, async (id) => {
  loadError.value = '';
  jobs.value = [];
  selectedJobIndex.value = null;
  if (!id || id === 'default') return;
  try {
    const data = await api.getResumeData(id);
    jobs.value = jobsArray(data.jobs);
    const idx = props.initialJobIndex != null && props.initialJobIndex >= 0 && props.initialJobIndex < jobs.value.length
      ? props.initialJobIndex
      : (jobs.value.length ? 0 : null);
    selectedJobIndex.value = idx;
  } catch (err) {
    console.error('[JobsTab] load failed:', err);
    loadError.value = 'Failed to load jobs: ' + err.message;
  }
}, { immediate: true });

const selectedJob = computed(() => {
  const idx = selectedJobIndex.value;
  if (idx == null || idx < 0 || idx >= jobs.value.length) return null;
  return jobs.value[idx];
});

function parseYearMonth(str) {
  if (!str || typeof str !== 'string') return { year: '', month: '' };
  const m = str.match(/^(\d{4})-(\d{2})/);
  if (m) return { year: m[1], month: String(parseInt(m[2], 10)) };
  const m2 = str.match(/^(\d{4})/);
  if (m2) return { year: m2[1], month: '' };
  return { year: '', month: '' };
}

function toStartEnd(l) {
  const start = (l.startYear && l.startMonth)
    ? `${l.startYear}-${String(l.startMonth).padStart(2, '0')}`
    : (l.startYear || '');
  const end = (l.endYear && l.endMonth)
    ? `${l.endYear}-${String(l.endMonth).padStart(2, '0')}`
    : (l.endYear || '');
  return { start, end };
}

watch(selectedJob, (job) => {
  if (!job) return;
  const start = parseYearMonth(job.start);
  const end = parseYearMonth(job.end);
  local.value = {
    employer: job.employer ?? job.Employer ?? job.label ?? '',
    title: job.title ?? job.role ?? job.Role ?? '',
    startYear: start.year,
    startMonth: start.month,
    endYear: end.year,
    endMonth: end.month,
    Description: job.Description ?? job.description ?? ''
  };
}, { immediate: true });

watch(() => [props.initialFocusField, selectedJob.value], ([focusField, job]) => {
  if (!focusField || !job) return;
  nextTick(() => {
    const el = focusField === 'employer' ? employerInputRef.value : focusField === 'description' ? descriptionInputRef.value : null;
    if (el && typeof el.focus === 'function') el.focus();
  });
}, { immediate: true });

function jobOptionLabel(job, i) {
  const title = job?.title ?? job?.role ?? job?.Role ?? '';
  const employer = job?.employer ?? job?.Employer ?? job?.label ?? '';
  const parts = [title, employer].filter(Boolean);
  return parts.length ? `${i + 1}. ${parts.join(' — ')}` : `Job ${i + 1}`;
}

async function saveCurrentJob() {
  const idx = selectedJobIndex.value;
  if (idx == null || !props.resumeId || props.resumeId === 'default') return;
  saving.value = true;
  try {
    const { start, end } = toStartEnd(local.value);
    await api.updateJob(props.resumeId, idx, {
      employer: local.value.employer || undefined,
      role: local.value.title || undefined,
      start: start || undefined,
      end: end || undefined,
      Description: local.value.Description || undefined
    });
    // Replace job in array so Jobs dropdown option label updates (employer/title) reactively
    const updated = { ...jobs.value[idx], employer: local.value.employer, role: local.value.title, title: local.value.title, start, end, Description: local.value.Description };
    jobs.value = jobs.value.map((j, i) => (i === idx ? updated : j));
    emit('saved');
  } catch (err) {
    console.error('[JobsTab] save failed:', err);
    alert('Failed to save job: ' + err.message);
  } finally {
    saving.value = false;
  }
}

function openSkillsForCurrentJob() {
  const idx = selectedJobIndex.value;
  if (idx == null) return;
  emit('open-skills-for-job', idx);
}
</script>

<style scoped>
.rde-jobs .rde-section-title { font-size: 0.8rem; font-weight: 600; color: #fff; margin: 0 0 8px; }
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
.rde-job-fields .rde-field { margin-bottom: 12px; }
.rde-job-fields .rde-label { display: block; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; color: rgba(255,255,255,0.5); margin-bottom: 4px; }
.rde-job-fields .rde-input,
.rde-job-fields .rde-textarea {
  width: 100%;
  background: rgba(255,255,255,0.07);
  border: 1px solid rgba(255,255,255,0.2);
  border-radius: 4px;
  padding: 6px 10px;
  color: #e0e0e0;
  font-size: 0.9rem;
  box-sizing: border-box;
}
.rde-job-fields .rde-textarea { resize: vertical; min-height: 120px; }
.rde-date-row { display: flex; gap: 16px; }
.rde-date-field { flex: 1; }
.rde-date-inputs { display: flex; gap: 6px; }
.rde-date-select { flex: 1; min-width: 0; }
.rde-job-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.1); }
.rde-job-actions .rde-btn.save { background: #4a9eff; color: #fff; border: none; padding: 6px 18px; border-radius: 4px; font-size: 0.85rem; cursor: pointer; }
.rde-job-actions .rde-btn.save:hover:not(:disabled) { background: #6ab0ff; }
.rde-job-actions .rde-btn.save:disabled { opacity: 0.5; cursor: default; }
.rde-job-actions .rde-btn.skills { background: transparent; color: rgba(255,255,255,0.8); border: 1px solid rgba(255,255,255,0.3); padding: 6px 18px; border-radius: 4px; font-size: 0.85rem; cursor: pointer; }
.rde-job-actions .rde-btn.skills:hover { background: rgba(255,255,255,0.08); color: #fff; }
</style>
