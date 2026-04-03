<template>
  <div class="rde-tab-content rde-jobs">
    <p v-if="loadError" class="rde-error">{{ loadError }}</p>
    <p v-else-if="!jobsLoaded && resumeId && resumeId !== 'default'" class="rde-loading">Loading jobs…</p>
    <template v-else>
      <section class="rde-section">
        <label for="rde-jobs-job-select" class="rde-label rde-sr-only">Select job</label>
        <select
          id="rde-jobs-job-select"
          name="rde-jobs-job"
          v-model="jobIndexLocal"
          class="rde-select"
          :disabled="jobsList.length === 0"
          @change="emit('update:selectedJobIndex', jobIndexLocal)"
        >
          <option value="" disabled>jobs</option>
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
            <label class="rde-label" for="rde-jobs-employer">Employer</label>
            <input
              id="rde-jobs-employer"
              name="employer"
              ref="employerInputRef"
              v-model="local.employer"
              type="text"
              class="rde-input"
              placeholder="Employer name"
              autocomplete="organization"
              @blur="onJobFieldBlur"
            />
          </div>
          <div class="rde-field">
            <label class="rde-label" for="rde-jobs-title">Title</label>
            <input
              id="rde-jobs-title"
              name="title"
              v-model="local.title"
              type="text"
              class="rde-input"
              placeholder="Job title"
              autocomplete="organization-title"
              @blur="onJobFieldBlur"
            />
          </div>
          <div class="rde-field rde-date-row">
            <div class="rde-date-field">
              <label class="rde-label" for="rde-jobs-start-yy">Start</label>
              <div class="rde-date-inputs">
                <input
                  id="rde-jobs-start-yy"
                  name="startYYYY"
                  v-model="local.startYYYY"
                  class="rde-input rde-date-input"
                  inputmode="numeric"
                  maxlength="4"
                  pattern="\\d{0,4}"
                  placeholder="YYYY"
                  @input="onFourDigitInput('startYYYY')"
                  @blur="onJobFieldBlur"
                />
                <input
                  id="rde-jobs-start-mm"
                  name="startMM"
                  v-model="local.startMM"
                  class="rde-input rde-date-input"
                  inputmode="numeric"
                  maxlength="2"
                  pattern="\\d{0,2}"
                  placeholder="MM"
                  @input="onTwoDigitInput('startMM')"
                  @blur="onJobFieldBlur"
                />
              </div>
            </div>
            <div class="rde-date-field">
              <label class="rde-label" for="rde-jobs-end-yy">End</label>
              <div class="rde-date-inputs" ref="endDateGroupRef" @focusout="onEndGroupFocusOut">
                <input
                  id="rde-jobs-end-yy"
                  name="endYYYY"
                  v-model="local.endYYYY"
                  class="rde-input rde-date-input"
                  inputmode="numeric"
                  maxlength="4"
                  pattern="\\d{0,4}"
                  placeholder="YYYY"
                  @input="onFourDigitInput('endYYYY')"
                />
                <input
                  id="rde-jobs-end-mm"
                  name="endMM"
                  v-model="local.endMM"
                  class="rde-input rde-date-input"
                  inputmode="numeric"
                  maxlength="2"
                  pattern="\\d{0,2}"
                  placeholder="MM"
                  @input="onTwoDigitInput('endMM')"
                />
              </div>
            </div>
          </div>
          <div class="rde-field">
            <label class="rde-label" for="rde-jobs-description">Description</label>
            <textarea
              id="rde-jobs-description"
              name="description"
              ref="descriptionInputRef"
              v-model="local.Description"
              class="rde-textarea rde-description"
              placeholder="Job description…"
              rows="8"
              @blur="onJobFieldBlur"
            />
          </div>
        </section>
        <section class="rde-section rde-job-actions">
          <button
            type="button"
            class="rde-btn skills"
            :aria-busy="saving"
            @click="openSkillsForCurrentJob"
          >
            Skills
          </button>
          <div class="rde-job-nav-group">
            <button
              type="button"
              class="rde-btn rde-btn-nav"
              :disabled="saving || !canGoToPreviousJob"
              aria-label="Previous job"
              @click="goToPreviousJob"
            >
              Previous job
            </button>
            <button
              type="button"
              class="rde-btn rde-btn-nav"
              :disabled="saving || !canGoToNextJob"
              aria-label="Next job"
              @click="goToNextJob"
            >
              Next job
            </button>
          </div>
        </section>
      </template>
    </template>
  </div>
</template>

<script setup>
import { ref, shallowRef, computed, watch, nextTick } from 'vue';
import * as api from '../api.mjs';
import { hasServer } from '@/modules/core/hasServer.mjs';

const canEdit = hasServer();

const props = defineProps({
  resumeId: { type: String, default: '' },
  /** When ResumeDetailsEditor re-parses, it bumps this value to force reload. */
  reloadNonce: { type: Number, default: 0 },
  /** Shared 0-based job index (synced with Job skills tab). */
  selectedJobIndex: { type: Number, default: null },
});

const emit = defineEmits(['saved', 'open-skills-for-job', 'update:selectedJobIndex', 'content-ready']);

const employerInputRef = ref(null);
const descriptionInputRef = ref(null);
const endDateGroupRef = ref(null);
const jobs = shallowRef([]);
const jobsLoaded = ref(false);
const loadError = ref('');
const jobIndexLocal = ref(null);
const saving = ref(false);
const local = ref({ employer: '', title: '', startYYYY: '', startMM: '', endYYYY: '', endMM: '', Description: '' });

function jobsArray(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  const keys = Object.keys(data).filter(k => /^\d+$/.test(k)).sort((a, b) => Number(a) - Number(b));
  return keys.map(k => data[k]);
}

const jobsList = computed(() => jobs.value);

function toTwoDigits(value) {
  const s = String(value ?? '').replace(/\D/g, '').slice(0, 2);
  return s;
}

function toFourDigits(value) {
  return String(value ?? '').replace(/\D/g, '').slice(0, 4);
}

function normalizeYearOrBlank(value, { minYear = 1900, maxYear = new Date().getFullYear() } = {}) {
  const yyyy = toFourDigits(value);
  if (!yyyy) return '';
  if (yyyy.length !== 4) return null;
  const n = Number(yyyy);
  if (!Number.isFinite(n) || n < minYear || n > maxYear) return null;
  return String(n);
}

function normalizeMonthOrBlank(value) {
  const mm = toTwoDigits(value);
  if (!mm) return '';
  const n = Number(mm);
  if (!Number.isFinite(n) || n < 1 || n > 12) return null;
  return String(n).padStart(2, '0');
}

function ymScore(yyyy, mm) {
  const y = Number(yyyy);
  const m = mm ? Number(mm) : 0;
  return y + (m / 12);
}

let selectedJobWatchCount = 0;
watch(() => [props.resumeId, props.reloadNonce], ([id]) => {
  selectedJobWatchCount = 0;
  jobsLoaded.value = false;
  loadError.value = '';
  jobs.value = [];
  jobIndexLocal.value = null;
  if (!id || id === 'default') return;
  // Defer fetch to macrotask; then assign selection in a second macrotask to avoid one big reactive burst.
  setTimeout(async () => {
    try {
      const data = await api.getResumeData(id);
      const arr = jobsArray(data.jobs);
      if (arr.length > 500) console.warn('[RDE] JobsTab large jobs array', arr.length);
      jobs.value = arr;
      let idx = null;
      if (props.selectedJobIndex != null && props.selectedJobIndex >= 0 && props.selectedJobIndex < arr.length) {
        idx = Number(props.selectedJobIndex);
      } else if (arr.length) {
        idx = 0;
      }
      jobsLoaded.value = true;
      setTimeout(() => {
        jobIndexLocal.value = idx;
        if (idx != null) emit('update:selectedJobIndex', idx);
        nextTick(() => emit('content-ready'));
      }, 0);
    } catch (err) {
      console.error('[JobsTab] load failed:', err);
      loadError.value = 'Failed to load jobs: ' + err.message;
      jobsLoaded.value = true;
      nextTick(() => emit('content-ready'));
    }
  }, 0);
}, { immediate: true });

// When parent shared index updates (e.g. user picked a job on Job skills tab), mirror it here.
watch(
  () => props.selectedJobIndex,
  (v) => {
    if (!jobsLoaded.value || jobs.value.length === 0) return;
    if (v == null || v < 0 || v >= jobs.value.length) return;
    if (jobIndexLocal.value !== v) jobIndexLocal.value = v;
  }
);

// Keep selection in sync when jobs are empty (e.g. select can emit "" with no options).
watch([() => jobs.value.length, jobIndexLocal], ([len, idx]) => {
  if (len === 0 && jobIndexLocal.value != null) {
    jobIndexLocal.value = null;
    emit('update:selectedJobIndex', null);
  }
  if (len > 0 && (idx === '' || (typeof idx !== 'number' && idx != null))) {
    jobIndexLocal.value = 0;
    emit('update:selectedJobIndex', 0);
  }
});

function jobIndexAsNumber() {
  const v = jobIndexLocal.value;
  if (v === '' || v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return n;
}

const selectedJob = computed(() => {
  const idx = jobIndexAsNumber();
  if (idx == null || idx < 0 || idx >= jobs.value.length) return null;
  return jobs.value[idx];
});

const canGoToPreviousJob = computed(() => {
  const idx = jobIndexAsNumber();
  return idx != null && idx > 0;
});

const canGoToNextJob = computed(() => {
  const idx = jobIndexAsNumber();
  const len = jobs.value.length;
  return idx != null && len > 0 && idx < len - 1;
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
  const startYYYY = normalizeYearOrBlank(l.startYYYY, { minYear: 1900 });
  const endMin = startYYYY && startYYYY !== null ? Number(startYYYY) : 1900;
  const endYYYY = normalizeYearOrBlank(l.endYYYY, { minYear: endMin });
  const startMM = normalizeMonthOrBlank(l.startMM);
  const endMM = normalizeMonthOrBlank(l.endMM);

  if (startMM === null) throw new Error('Start month must be between 1 and 12');
  if (endMM === null) throw new Error('End month must be between 1 and 12');
  if (startYYYY === null) throw new Error('Start year must be between 1900 and the current year');
  if (endYYYY === null) throw new Error('End year must be between start year and the current year');

  if (startYYYY && endYYYY) {
    const startScore = ymScore(startYYYY, startMM || '');
    const endScore = ymScore(endYYYY, endMM || '');
    if (endScore < startScore) {
      throw new Error('End date must be on or after start date');
    }
  }

  const start = (startYYYY && startMM)
    ? `${startYYYY}-${startMM}`
    : (startYYYY || '');
  const end = (endYYYY && endMM)
    ? `${endYYYY}-${endMM}`
    : (endYYYY || '');
  return { start, end };
}

watch(selectedJob, (job) => {
  selectedJobWatchCount++;
  if (selectedJobWatchCount > 5) console.warn('[RDE] JobsTab selectedJob watch LOOP', selectedJobWatchCount);
  if (!job) return;
  console.log('[RDE] JobsTab selectedJob watch, setting local');
  const start = parseYearMonth(job.start);
  const end = parseYearMonth(job.end);
  local.value = {
    employer: job.employer ?? job.Employer ?? job.label ?? '',
    title: job.title ?? job.role ?? job.Role ?? '',
    startYYYY: toFourDigits(start.year),
    startMM: toTwoDigits(start.month),
    endYYYY: toFourDigits(end.year),
    endMM: toTwoDigits(end.month),
    Description: job.Description ?? job.description ?? ''
  };
}, { immediate: true });

function onFourDigitInput(field) {
  local.value[field] = toFourDigits(local.value[field]);
}

function onTwoDigitInput(field) {
  local.value[field] = toTwoDigits(local.value[field]);
}

function jobOptionLabel(job, i) {
  const title = job?.title ?? job?.role ?? job?.Role ?? '';
  const employer = job?.employer ?? job?.Employer ?? job?.label ?? '';
  const parts = [employer, title].filter(Boolean);
  return parts.length ? parts.join(' -- ') : `Job ${i + 1}`;
}

/** @returns {Promise<boolean>} true if saved or nothing to save; false if save failed */
async function saveCurrentJob() {
  if (!canEdit) return true;
  const idx = jobIndexLocal.value;
  if (idx == null || !props.resumeId || props.resumeId === 'default') return true;
  if (saving.value) return true;
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
    return true;
  } catch (err) {
    console.error('[JobsTab] save failed:', err);
    alert('Failed to save job: ' + err.message);
    return false;
  } finally {
    saving.value = false;
  }
}

function onJobFieldBlur() {
  // Normalize/validate dates before autosaving.
  try {
    const startMM = normalizeMonthOrBlank(local.value.startMM);
    if (startMM === null) throw new Error('Start month must be between 1 and 12');
    local.value.startMM = startMM || '';

    const startYYYY = normalizeYearOrBlank(local.value.startYYYY, { minYear: 1900 });
    if (startYYYY === null) throw new Error('Start year must be between 1900 and the current year');
    local.value.startYYYY = startYYYY || '';
  } catch (e) {
    alert(e instanceof Error ? e.message : String(e));
    // Remedy: clear invalid date parts so subsequent blur can save.
    if (String(e?.message || '').includes('Start month')) local.value.startMM = '';
    if (String(e?.message || '').includes('Start year')) local.value.startYYYY = '';
    return;
  }
  // Fire-and-forget: blur should persist the current job without requiring an explicit Save click.
  void saveCurrentJob();
}

function validateAndNormalizeEndDate() {
  const startYYYY = normalizeYearOrBlank(local.value.startYYYY, { minYear: 1900 });
  if (startYYYY === null) throw new Error('Start year must be between 1900 and the current year');

  const endMin = startYYYY ? Number(startYYYY) : 1900;
  const endYYYY = normalizeYearOrBlank(local.value.endYYYY, { minYear: endMin });
  const endMM = normalizeMonthOrBlank(local.value.endMM);

  if (endYYYY === null) throw new Error('End year must be between start year and the current year');
  if (endMM === null) throw new Error('End month must be between 1 and 12');

  local.value.endYYYY = endYYYY || '';
  local.value.endMM = endMM || '';

  if (local.value.startYYYY && local.value.endYYYY) {
    const startScore = ymScore(local.value.startYYYY, local.value.startMM || '');
    const endScore = ymScore(local.value.endYYYY, local.value.endMM || '');
    if (endScore < startScore) throw new Error('End date must be on or after start date');
  }
}

function onEndGroupFocusOut(e) {
  const root = endDateGroupRef.value;
  const next = e?.relatedTarget || null;
  if (root && next && root.contains(next)) return; // focus moved within end group
  try {
    validateAndNormalizeEndDate();
  } catch (err) {
    alert(err instanceof Error ? err.message : String(err));
    // Remedy: clear invalid end date parts
    local.value.endYYYY = '';
    local.value.endMM = '';
    return;
  }
  void saveCurrentJob();
}

async function openSkillsForCurrentJob() {
  if (saving.value) return;
  const idx = jobIndexLocal.value;
  if (idx == null) return;
  // Auto-save job before switching to Skills.
  if (canEdit) {
    const ok = await saveCurrentJob();
    if (!ok) return;
  }
  emit('open-skills-for-job', idx);
}

async function goToPreviousJob() {
  if (saving.value || !canGoToPreviousJob.value) return;
  const idx = jobIndexAsNumber();
  if (idx == null || idx <= 0) return;
  if (canEdit) {
    const ok = await saveCurrentJob();
    if (!ok) return;
  }
  const next = idx - 1;
  jobIndexLocal.value = next;
  emit('update:selectedJobIndex', next);
}

async function goToNextJob() {
  if (saving.value || !canGoToNextJob.value) return;
  const idx = jobIndexAsNumber();
  const len = jobs.value.length;
  if (idx == null || idx >= len - 1) return;
  if (canEdit) {
    const ok = await saveCurrentJob();
    if (!ok) return;
  }
  const next = idx + 1;
  jobIndexLocal.value = next;
  emit('update:selectedJobIndex', next);
}

defineExpose({ saveCurrentJob });
</script>

<style scoped>
.rde-tab-content.rde-jobs { padding: 12px 16px; }
.rde-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
.rde-jobs .rde-section-title { font-size: 0.8rem; font-weight: 600; color: #fff; margin: 0 0 8px; }
.rde-error { color: #e88; padding: 8px 0; }
.rde-loading { color: rgba(255,255,255,0.6); padding: 8px 0; font-size: 0.9rem; }
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
.rde-job-fields { margin-top: 14px; }
.rde-job-fields .rde-label { display: block; font-size: 0.7rem; text-transform: none; letter-spacing: 0.05em; color: rgba(255,255,255,0.5); margin-bottom: 4px; }
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
.rde-job-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 12px;
  width: 100%;
  box-sizing: border-box;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(255,255,255,0.1);
}
.rde-job-nav-group {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.rde-job-actions .rde-btn.rde-btn-nav,
.rde-job-actions .rde-btn.skills {
  background: transparent;
  color: rgba(255,255,255,0.8);
  border: 1px solid rgba(255,255,255,0.3);
  padding: 6px 14px;
  border-radius: 4px;
  font-size: 0.85rem;
  cursor: pointer;
}
.rde-job-actions .rde-btn.rde-btn-nav:hover:not(:disabled),
.rde-job-actions .rde-btn.skills:hover { background: rgba(255,255,255,0.08); color: #fff; }
.rde-job-actions .rde-btn.rde-btn-nav:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.rde-job-actions .rde-btn.skills { padding: 6px 18px; }
</style>
