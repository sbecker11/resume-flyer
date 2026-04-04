/**
 * Merge resume education records into the jobs array as job-shaped rows (scene + editor).
 * Synthetic rows are {@link ResumeJob} with `educationKey` set (see isEducationDerivedJob).
 */
import { ResumeJob } from './ResumeJob.mjs';

/** Normalize API/static jobs value to an array. */
export function toJobsArray(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object' && Array.isArray(value.jobs)) return value.jobs;
  if (value && typeof value === 'object') return Object.values(value);
  return [];
}

/**
 * Education persists dates as YYYY/MM or YYYY/MM/DD; jobs use YYYY-MM or YYYY-MM-DD (JobsTab).
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeEducationDateForJobField(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const slashYmd = raw.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (slashYmd) {
    return `${slashYmd[1]}-${String(slashYmd[2]).padStart(2, '0')}-${String(slashYmd[3]).padStart(2, '0')}`;
  }
  const slashYm = raw.match(/^(\d{4})\/(\d{1,2})$/);
  if (slashYm) return `${slashYm[1]}-${String(slashYm[2]).padStart(2, '0')}`;
  const dashYmd = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (dashYmd) {
    return `${dashYmd[1]}-${String(dashYmd[2]).padStart(2, '0')}-${String(dashYmd[3]).padStart(2, '0')}`;
  }
  const dashYm = raw.match(/^(\d{4})-(\d{1,2})(?!-\d)/);
  if (dashYm) return `${dashYm[1]}-${String(dashYm[2]).padStart(2, '0')}`;
  const yOnly = raw.match(/^(\d{4})$/);
  if (yOnly) return yOnly[1];
  return raw;
}

/**
 * @param {string} educationKey - key in education.json object
 * @param {{ index?: number, degree?: string, institution?: string, start?: string, end?: string, description?: string }} edu
 */
export function mapEducationToJob(educationKey, edu) {
  const institution = String(edu?.institution ?? '').trim();
  const degree = String(edu?.degree ?? '').trim();
  return new ResumeJob({
    employer: institution,
    title: degree,
    role: degree,
    label: institution || undefined,
    start: normalizeEducationDateForJobField(edu?.start),
    end: normalizeEducationDateForJobField(edu?.end),
    Description: String(edu?.description ?? ''),
    educationKey: String(educationKey),
  });
}

/**
 * @param {Record<string, { index?: number, degree?: string, institution?: string, start?: string, end?: string, description?: string }>|null|undefined} education
 * @returns {object[]}
 */
export function educationEntriesToJobs(education) {
  if (!education || typeof education !== 'object') return [];
  const entries = Object.entries(education);
  entries.sort((a, b) => {
    const iA = typeof a[1]?.index === 'number' ? a[1].index : Number.NaN;
    const iB = typeof b[1]?.index === 'number' ? b[1].index : Number.NaN;
    if (!Number.isNaN(iA) && !Number.isNaN(iB) && iA !== iB) return iA - iB;
    return String(a[0]).localeCompare(String(b[0]));
  });
  return entries.map(([key, edu]) => mapEducationToJob(key, edu));
}

/** @param {unknown[]} jobs */
export function mergeJobsWithEducation(jobs, education) {
  const base = Array.isArray(jobs) ? [...jobs] : [];
  return base.concat(educationEntriesToJobs(education));
}
