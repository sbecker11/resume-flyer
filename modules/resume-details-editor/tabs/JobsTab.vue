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
          :disabled="workJobsForDropdown.length === 0"
          @change="emit('update:selectedJobIndex', jobIndexLocal)"
        >
          <option value="" disabled>jobs</option>
          <option
            v-for="({ job, mergedIdx }, pos) in workJobsForDropdown"
            :key="mergedIdx"
            :value="mergedIdx"
          >
            {{ jobOptionLabel(job, pos) }}
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
              :disabled="!canEdit"
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
              :disabled="!canEdit"
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
                  :disabled="!canEdit"
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
                  :disabled="!canEdit"
                  @input="onTwoDigitInput('startMM')"
                  @blur="onJobFieldBlur"
                />
                <input
                  id="rde-jobs-start-dd"
                  name="startDD"
                  v-model="local.startDD"
                  class="rde-input rde-date-input"
                  inputmode="numeric"
                  maxlength="2"
                  pattern="\\d{0,2}"
                  placeholder="DD"
                  :disabled="!canEdit"
                  @input="onTwoDigitInput('startDD')"
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
                  :disabled="!canEdit"
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
                  :disabled="!canEdit"
                  @input="onTwoDigitInput('endMM')"
                />
                <input
                  id="rde-jobs-end-dd"
                  name="endDD"
                  v-model="local.endDD"
                  class="rde-input rde-date-input"
                  inputmode="numeric"
                  maxlength="2"
                  pattern="\\d{0,2}"
                  placeholder="DD"
                  :disabled="!canEdit"
                  @input="onTwoDigitInput('endDD')"
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
              :disabled="!canEdit"
              @blur="onJobFieldBlur"
            />
          </div>
        </section>
      </template>
      <section v-if="jobsLoaded" class="rde-section rde-job-actions">
        <div class="rde-job-actions-row">
          <button
            type="button"
            class="rde-btn skills"
            :aria-busy="saving"
            :disabled="saving || selectedJob == null"
            @click="openSkillsForCurrentJob"
          >
            Skills
          </button>
          <button
            type="button"
            class="rde-btn add-job"
            :disabled="!canEdit || saving || !props.resumeId || props.resumeId === 'default'"
            @click="onAddJob"
          >
            Add Job
          </button>
          <button
            type="button"
            class="rde-btn delete-job"
            :disabled="!canEdit || saving || selectedJob == null || !props.resumeId || props.resumeId === 'default'"
            @click="openDeleteJobConfirm"
          >
            Delete Job
          </button>
          <div class="rde-job-nav-group" role="group" aria-label="Job navigation">
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
        </div>
      </section>
    </template>
  </div>

  <Teleport to="body">
    <div
      v-if="deleteConfirmOpen"
      class="rde-delete-job-overlay"
      role="presentation"
      @click.self="closeDeleteJobConfirm"
    >
      <div
        class="rde-delete-job-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="rde-delete-job-title"
        @keydown.esc.prevent="closeDeleteJobConfirm"
      >
        <div id="rde-delete-job-title" class="rde-delete-job-title">Delete this job?</div>
        <p class="rde-delete-job-body">
          This removes the job from <code>jobs.json</code> and reindexes skill links. This cannot be undone from here.
        </p>
        <p v-if="deleteConfirmLabel" class="rde-delete-job-label">{{ deleteConfirmLabel }}</p>
        <div class="rde-delete-job-actions">
          <button type="button" class="rde-btn cancel" @click="closeDeleteJobConfirm">Cancel</button>
          <button type="button" class="rde-btn delete-confirm" :disabled="deleteInFlight" @click="confirmDeleteJob">
            {{ deleteInFlight ? 'Deleting…' : 'Delete' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, shallowRef, computed, watch, nextTick } from 'vue';
import * as api from '../api.mjs';
import { hasServer } from '@/modules/core/hasServer.mjs';
import { reportError } from '@/modules/utils/errorReporting.mjs';
import {
  isEducationDerivedJob,
  workJobDropdownEntries,
  firstWorkJobMergedIndex,
} from '@/modules/data/ResumeJob.mjs';

const canEdit = hasServer();

const props = defineProps({
  resumeId: { type: String, default: '' },
  /** When ResumeDetailsEditor re-parses, it bumps this value to force reload. */
  reloadNonce: { type: Number, default: 0 },
  /** Shared 0-based job index (synced with Job skills tab). */
  selectedJobIndex: { type: Number, default: null },
});

const emit = defineEmits(['saved', 'open-skills-for-job', 'open-education-for-job', 'update:selectedJobIndex', 'content-ready']);

const employerInputRef = ref(null);
const descriptionInputRef = ref(null);
const endDateGroupRef = ref(null);
const jobs = shallowRef([]);
const jobsLoaded = ref(false);
const loadError = ref('');
const jobIndexLocal = ref(null);
const saving = ref(false);
const local = ref({
  employer: '',
  title: '',
  startYYYY: '',
  startMM: '',
  startDD: '',
  endYYYY: '',
  endMM: '',
  endDD: '',
  Description: '',
});
const deleteConfirmOpen = ref(false);
const deleteConfirmLabel = ref('');
const deleteInFlight = ref(false);

function jobsArray(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  const keys = Object.keys(data).filter(k => /^\d+$/.test(k)).sort((a, b) => Number(a) - Number(b));
  return keys.map(k => data[k]);
}

/** Work jobs only — education rows are edited on the Education tab (Job skills tab still lists all rows). */
const workJobsForDropdown = computed(() => workJobDropdownEntries(jobs.value));

const workMergedIndices = computed(() => workJobsForDropdown.value.map((e) => e.mergedIdx));

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

/** @param {string} dd @param {string} yyyy @param {string} mm */
function normalizeDayOrBlank(dd, yyyy, mm) {
  const d = toTwoDigits(dd);
  if (!d) return '';
  const n = Number(d);
  if (!Number.isFinite(n) || n < 1 || n > 31) return null;
  const y = Number(yyyy);
  const m = Number(mm);
  if (Number.isFinite(y) && Number.isFinite(m) && m >= 1 && m <= 12) {
    const last = new Date(y, m, 0).getDate();
    if (n > last) return null;
  }
  return String(n).padStart(2, '0');
}

function ymScore(yyyy, mm) {
  const y = Number(yyyy);
  const m = mm ? Number(mm) : 0;
  return y + (m / 12);
}

/** @returns {number|null} UTC ms at local midnight, or null if incomplete */
function ymdToTime(yyyy, mm, dd) {
  if (!yyyy) return null;
  const y = Number(yyyy);
  if (!Number.isFinite(y)) return null;
  if (!mm) return null;
  const m = Number(mm);
  if (!Number.isFinite(m) || m < 1 || m > 12) return null;
  const d = dd ? Number(dd) : 1;
  if (!Number.isFinite(d) || d < 1 || d > 31) return null;
  const t = new Date(y, m - 1, d).getTime();
  return Number.isNaN(t) ? null : t;
}

watch(() => [props.resumeId, props.reloadNonce], ([id]) => {
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
      const firstWork = firstWorkJobMergedIndex(arr);
      let idx = null;
      if (
        props.selectedJobIndex != null
        && props.selectedJobIndex >= 0
        && props.selectedJobIndex < arr.length
        && !isEducationDerivedJob(arr[props.selectedJobIndex])
      ) {
        idx = Number(props.selectedJobIndex);
      } else {
        idx = firstWork;
      }
      jobsLoaded.value = true;
      setTimeout(() => {
        jobIndexLocal.value = idx;
        emit('update:selectedJobIndex', idx);
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

// When parent shared index updates: mirror work jobs only; education indices belong on Job skills / Education tabs.
watch(
  () => props.selectedJobIndex,
  (v) => {
    if (!jobsLoaded.value || jobs.value.length === 0) return;
    if (v == null || v < 0 || v >= jobs.value.length) return;
    if (isEducationDerivedJob(jobs.value[v])) {
      const first = firstWorkJobMergedIndex(jobs.value);
      if (first != null && jobIndexLocal.value !== first) {
        jobIndexLocal.value = first;
        emit('update:selectedJobIndex', first);
      }
      return;
    }
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
    const first = firstWorkJobMergedIndex(jobs.value);
    jobIndexLocal.value = first;
    if (first != null) emit('update:selectedJobIndex', first);
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

function currentWorkDropdownPosition() {
  const idx = jobIndexAsNumber();
  if (idx == null) return -1;
  return workMergedIndices.value.indexOf(idx);
}

const canGoToPreviousJob = computed(() => currentWorkDropdownPosition() > 0);

const canGoToNextJob = computed(() => {
  const pos = currentWorkDropdownPosition();
  const list = workMergedIndices.value;
  return pos >= 0 && pos < list.length - 1;
});

function parseYearMonthDay(str) {
  if (!str || typeof str !== 'string') return { year: '', month: '', day: '' };
  const d = str.trim();
  const ymd = d.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (ymd) {
    return {
      year: ymd[1],
      month: String(parseInt(ymd[2], 10)),
      day: String(parseInt(ymd[3], 10)),
    };
  }
  const ym = d.match(/^(\d{4})-(\d{1,2})(?!-\d)/);
  if (ym) return { year: ym[1], month: String(parseInt(ym[2], 10)), day: '' };
  const y = d.match(/^(\d{4})/);
  if (y) return { year: y[1], month: '', day: '' };
  return { year: '', month: '', day: '' };
}

function toStartEnd(l) {
  const rawStartY = String(l.startYYYY ?? '').trim();
  const rawEndY = String(l.endYYYY ?? '').trim();
  const rawStartM = String(l.startMM ?? '').trim();
  const rawEndM = String(l.endMM ?? '').trim();
  const rawStartD = String(l.startDD ?? '').trim();
  const rawEndD = String(l.endDD ?? '').trim();

  const startYYYY = rawStartY ? normalizeYearOrBlank(l.startYYYY, { minYear: 1900 }) : '';
  const endMin = startYYYY && startYYYY !== null ? Number(startYYYY) : 1900;
  const endYYYY = rawEndY ? normalizeYearOrBlank(l.endYYYY, { minYear: endMin }) : '';
  const startMM = rawStartM ? normalizeMonthOrBlank(l.startMM) : '';
  const endMM = rawEndM ? normalizeMonthOrBlank(l.endMM) : '';
  const startDD = rawStartD ? normalizeDayOrBlank(l.startDD, startYYYY || '', startMM || '') : '';
  const endDD = rawEndD ? normalizeDayOrBlank(l.endDD, endYYYY || '', endMM || '') : '';

  if (rawStartY && startYYYY === null) throw new Error('Start year must be between 1900 and the current year');
  if (rawEndY && endYYYY === null) throw new Error('End year must be between start year and the current year');
  if (rawStartM && startMM === null) throw new Error('Start month must be between 1 and 12');
  if (rawEndM && endMM === null) throw new Error('End month must be between 1 and 12');
  if (rawStartD && startDD === null) throw new Error('Start day is invalid for this month');
  if (rawEndD && endDD === null) throw new Error('End day is invalid for this month');
  if (rawStartD && (!startMM || !startYYYY)) throw new Error('Enter year and month before start day');
  if (rawEndD && (!endMM || !endYYYY)) throw new Error('Enter year and month before end day');

  const sFull = startYYYY && startMM && startDD;
  const eFull = endYYYY && endMM && endDD;
  const sTime = ymdToTime(startYYYY, startMM || '', startDD || '');
  const eTime = ymdToTime(endYYYY, endMM || '', endDD || '');
  if (startYYYY && endYYYY) {
    if (sFull && eFull && sTime != null && eTime != null) {
      if (eTime < sTime) throw new Error('End date must be on or after start date');
    } else {
      const startScore = ymScore(startYYYY, startMM || '');
      const endScore = ymScore(endYYYY, endMM || '');
      if (endScore < startScore) {
        throw new Error('End date must be on or after start date');
      }
    }
  }

  const start = (startYYYY && startMM && startDD)
    ? `${startYYYY}-${startMM}-${startDD}`
    : (startYYYY && startMM)
      ? `${startYYYY}-${startMM}`
      : (startYYYY || '');
  const end = (endYYYY && endMM && endDD)
    ? `${endYYYY}-${endMM}-${endDD}`
    : (endYYYY && endMM)
      ? `${endYYYY}-${endMM}`
      : (endYYYY || '');
  return { start, end };
}

watch(jobIndexLocal, () => {
  const job = selectedJob.value;
  if (!job) return;
  const start = parseYearMonthDay(job.start);
  const end = parseYearMonthDay(job.end);
  local.value = {
    employer: job.employer ?? job.Employer ?? job.label ?? '',
    title: job.title || job.role || job.Role || '',
    startYYYY: toFourDigits(start.year),
    startMM: toTwoDigits(start.month),
    startDD: toTwoDigits(start.day),
    endYYYY: toFourDigits(end.year),
    endMM: toTwoDigits(end.month),
    endDD: toTwoDigits(end.day),
    Description: job.Description ?? job.description ?? ''
  };
}, { immediate: true });

function onFourDigitInput(field) {
  local.value[field] = toFourDigits(local.value[field]);
}

function onTwoDigitInput(field) {
  local.value[field] = toTwoDigits(local.value[field]);
}

function jobOptionLabel(job, pos) {
  const title = job?.title ?? job?.role ?? job?.Role ?? '';
  const employer = job?.employer ?? job?.Employer ?? job?.label ?? '';
  const parts = [employer, title].filter(Boolean);
  return parts.length ? parts.join(' -- ') : `Job ${pos + 1}`;
}

/** @returns {Promise<boolean>} true if saved or nothing to save; false if save failed */
async function saveCurrentJob() {
  if (!canEdit) return true;
  const idx = jobIndexLocal.value;
  if (idx == null || !props.resumeId || props.resumeId === 'default') return true;
  if (isEducationDerivedJob(jobs.value[idx])) return true;
  if (saving.value) return true;
  saving.value = true;
  try {
    const { start, end } = toStartEnd(local.value);
    const patch = {};
    if (local.value.employer) patch.employer = local.value.employer;
    if (local.value.title) patch.role = local.value.title;
    if (start) patch.start = start;
    if (end) patch.end = end;
    if (local.value.Description) patch.Description = local.value.Description;
    if (Object.keys(patch).length === 0) return true;
    await api.updateJob(props.resumeId, idx, patch);
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
    const rawY = String(local.value.startYYYY ?? '').trim();
    const rawM = String(local.value.startMM ?? '').trim();
    const rawD = String(local.value.startDD ?? '').trim();

    const startYYYY = rawY ? normalizeYearOrBlank(local.value.startYYYY, { minYear: 1900 }) : '';
    if (rawY && startYYYY === null) throw new Error('Start year must be between 1900 and the current year');
    local.value.startYYYY = startYYYY || '';

    const startMM = rawM ? normalizeMonthOrBlank(local.value.startMM) : '';
    if (rawM && startMM === null) throw new Error('Start month must be between 1 and 12');
    local.value.startMM = startMM || '';

    const startDD = rawD ? normalizeDayOrBlank(local.value.startDD, local.value.startYYYY, local.value.startMM) : '';
    if (rawD && startDD === null) throw new Error('Start day is invalid for this month');
    if (rawD && (!local.value.startMM || !local.value.startYYYY)) {
      throw new Error('Enter year and month before start day');
    }
    local.value.startDD = startDD || '';
  } catch (e) {
    alert(e instanceof Error ? e.message : String(e));
    // Remedy: clear invalid date parts so subsequent blur can save.
    if (String(e?.message || '').includes('Start month')) local.value.startMM = '';
    if (String(e?.message || '').includes('Start year')) local.value.startYYYY = '';
    if (String(e?.message || '').includes('Start day') || String(e?.message || '').includes('before start day')) {
      local.value.startDD = '';
    }
    return;
  }
  // Fire-and-forget: blur should persist the current job without requiring an explicit Save click.
  void saveCurrentJob();
}

function validateAndNormalizeEndDate() {
  const rawStartY = String(local.value.startYYYY ?? '').trim();
  const rawEndY = String(local.value.endYYYY ?? '').trim();
  const rawEndM = String(local.value.endMM ?? '').trim();
  const rawEndD = String(local.value.endDD ?? '').trim();

  const startYYYY = rawStartY ? normalizeYearOrBlank(local.value.startYYYY, { minYear: 1900 }) : '';
  if (rawStartY && startYYYY === null) throw new Error('Start year must be between 1900 and the current year');

  const endMin = startYYYY ? Number(startYYYY) : 1900;
  const endYYYY = rawEndY ? normalizeYearOrBlank(local.value.endYYYY, { minYear: endMin }) : '';
  if (rawEndY && endYYYY === null) throw new Error('End year must be between start year and the current year');

  const endMM = rawEndM ? normalizeMonthOrBlank(local.value.endMM) : '';
  if (rawEndM && endMM === null) throw new Error('End month must be between 1 and 12');

  const endDD = rawEndD ? normalizeDayOrBlank(local.value.endDD, endYYYY || '', endMM || '') : '';
  if (rawEndD && endDD === null) throw new Error('End day is invalid for this month');
  if (rawEndD && (!endMM || !endYYYY)) {
    throw new Error('Enter year and month before end day');
  }

  local.value.endYYYY = endYYYY || '';
  local.value.endMM = endMM || '';
  local.value.endDD = endDD || '';

  const sFull = local.value.startYYYY && local.value.startMM && local.value.startDD;
  const eFull = local.value.endYYYY && local.value.endMM && local.value.endDD;
  const sTime = ymdToTime(local.value.startYYYY, local.value.startMM || '', local.value.startDD || '');
  const eTime = ymdToTime(local.value.endYYYY, local.value.endMM || '', local.value.endDD || '');

  if (local.value.startYYYY && local.value.endYYYY) {
    if (sFull && eFull && sTime != null && eTime != null) {
      if (eTime < sTime) throw new Error('End date must be on or after start date');
    } else {
      const startScore = ymScore(local.value.startYYYY, local.value.startMM || '');
      const endScore = ymScore(local.value.endYYYY, local.value.endMM || '');
      if (endScore < startScore) throw new Error('End date must be on or after start date');
    }
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
    local.value.endDD = '';
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
  const list = workMergedIndices.value;
  const pos = currentWorkDropdownPosition();
  if (pos <= 0) return;
  if (canEdit) {
    const ok = await saveCurrentJob();
    if (!ok) return;
  }
  const next = list[pos - 1];
  jobIndexLocal.value = next;
  emit('update:selectedJobIndex', next);
}

async function goToNextJob() {
  if (saving.value || !canGoToNextJob.value) return;
  const list = workMergedIndices.value;
  const pos = currentWorkDropdownPosition();
  if (pos < 0 || pos >= list.length - 1) return;
  if (canEdit) {
    const ok = await saveCurrentJob();
    if (!ok) return;
  }
  const next = list[pos + 1];
  jobIndexLocal.value = next;
  emit('update:selectedJobIndex', next);
}

function closeDeleteJobConfirm() {
  if (deleteInFlight.value) return;
  deleteConfirmOpen.value = false;
}

function openDeleteJobConfirm() {
  const idx = jobIndexAsNumber();
  if (idx == null || jobs.value[idx] == null) return;
  const job = jobs.value[idx];
  const pos = workJobsForDropdown.value.findIndex((e) => e.mergedIdx === idx);
  deleteConfirmLabel.value = jobOptionLabel(job, pos >= 0 ? pos : 0);
  deleteConfirmOpen.value = true;
}

async function confirmDeleteJob() {
  const delIdx = jobIndexAsNumber();
  if (delIdx == null || !props.resumeId || props.resumeId === 'default') return;
  deleteInFlight.value = true;
  try {
    await api.deleteJob(props.resumeId, delIdx);
    const data = await api.getResumeData(props.resumeId);
    const arr = jobsArray(data.jobs);
    jobs.value = arr;
    const newWork = workJobDropdownEntries(arr);
    if (newWork.length === 0) {
      jobIndexLocal.value = null;
      emit('update:selectedJobIndex', null);
    } else {
      const pickPos = Math.min(delIdx, newWork.length - 1);
      const mergedIdx = newWork[pickPos].mergedIdx;
      jobIndexLocal.value = mergedIdx;
      emit('update:selectedJobIndex', mergedIdx);
    }
    deleteConfirmOpen.value = false;
    emit('saved', { jobsMutated: true });
  } catch (e) {
    reportError(e, '[JobsTab] Delete job failed', '');
    alert('Failed to delete job: ' + (e instanceof Error ? e.message : String(e)));
  } finally {
    deleteInFlight.value = false;
  }
}

async function onAddJob() {
  if (!canEdit || saving.value || !props.resumeId || props.resumeId === 'default') return;
  const idx = jobIndexAsNumber();
  const afterIndex = idx == null ? -1 : idx;
  saving.value = true;
  try {
    if (idx != null) {
      const ok = await saveCurrentJob();
      if (!ok) return;
    }
    const result = await api.addJobAfter(props.resumeId, afterIndex);
    const insertIndex = result?.insertIndex;
    const data = await api.getResumeData(props.resumeId);
    jobs.value = jobsArray(data.jobs);
    const newIdx = insertIndex != null && Number.isFinite(Number(insertIndex))
      ? Number(insertIndex)
      : (afterIndex === -1 ? 0 : afterIndex + 1);
    jobIndexLocal.value = newIdx;
    emit('update:selectedJobIndex', newIdx);
    emit('saved', { jobsMutated: true });
  } catch (e) {
    reportError(e, '[JobsTab] Add job failed', '');
    alert('Failed to add job: ' + (e instanceof Error ? e.message : String(e)));
  } finally {
    saving.value = false;
  }
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
  width: 100%;
  box-sizing: border-box;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(255,255,255,0.1);
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
.rde-job-actions-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  width: 100%;
}
.rde-job-nav-group {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  justify-content: flex-end;
}
.rde-job-actions-row .rde-btn {
  flex: 0 1 auto;
  min-width: 0;
}
.rde-job-actions .rde-btn.add-job,
.rde-job-actions .rde-btn.delete-job {
  background: transparent;
  color: rgba(255, 255, 255, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.3);
  padding: 6px 14px;
  border-radius: 4px;
  font-size: 0.85rem;
  cursor: pointer;
}
.rde-job-actions .rde-btn.add-job:hover:not(:disabled),
.rde-job-actions .rde-btn.delete-job:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}
.rde-job-actions .rde-btn.delete-job {
  border-color: rgba(232, 136, 136, 0.45);
  color: #e8a0a0;
}
.rde-job-actions .rde-btn.delete-job:hover:not(:disabled) {
  border-color: rgba(232, 136, 136, 0.7);
  color: #fcc;
}
.rde-job-actions .rde-btn.add-job:disabled,
.rde-job-actions .rde-btn.delete-job:disabled,
.rde-job-actions .rde-btn.skills:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.rde-delete-job-overlay {
  position: fixed;
  inset: 0;
  z-index: 100002;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  box-sizing: border-box;
}
.rde-delete-job-dialog {
  max-width: 420px;
  width: 100%;
  background: #2a2a2e;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  padding: 18px 20px;
  color: #e8e8e8;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
}
.rde-delete-job-title {
  font-size: 1rem;
  font-weight: 600;
  margin: 0 0 10px;
}
.rde-delete-job-body,
.rde-delete-job-label {
  font-size: 0.88rem;
  line-height: 1.45;
  margin: 0 0 10px;
  color: rgba(255, 255, 255, 0.75);
}
.rde-delete-job-label {
  font-weight: 500;
  color: #fff;
  word-break: break-word;
}
.rde-delete-job-body code {
  font-size: 0.82em;
  padding: 1px 4px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.08);
}
.rde-delete-job-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 16px;
}
.rde-delete-job-actions .rde-btn {
  padding: 8px 16px;
  border-radius: 4px;
  font-size: 0.88rem;
  cursor: pointer;
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: transparent;
  color: #e0e0e0;
}
.rde-delete-job-actions .rde-btn.cancel:hover {
  background: rgba(255, 255, 255, 0.08);
}
.rde-delete-job-actions .rde-btn.delete-confirm {
  border-color: rgba(200, 80, 80, 0.6);
  color: #f8b4b4;
}
.rde-delete-job-actions .rde-btn.delete-confirm:hover:not(:disabled) {
  background: rgba(180, 60, 60, 0.25);
}
.rde-delete-job-actions .rde-btn.delete-confirm:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
