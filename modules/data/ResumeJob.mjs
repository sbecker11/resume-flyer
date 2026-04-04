/**
 * Unified job row: work history or education-derived (educationKey set).
 * Extensible via class fields; use toJobPatchPlainObject() for job API payloads.
 */
export class ResumeJob {
  employer = '';

  title = '';

  role = '';

  /** @type {string|undefined} */
  label = undefined;

  start = '';

  end = '';

  Description = '';

  /**
   * When non-null/non-empty, this row is merged from education.json — edit via Education tab only.
   * @type {string|null}
   */
  educationKey = null;

  /** @type {string[]|undefined} */
  skillIDs = undefined;

  /** @type {string[]} */
  references = [];

  /** @type {Record<string, string>} */
  'job-skills' = {};

  /**
   * @param {Record<string, unknown>} [init]
   */
  constructor(init = {}) {
    const plain = { ...init };
    const eduRaw = plain.__educationKey ?? plain.educationKey;
    delete plain.__fromEducation;
    delete plain.__educationKey;
    delete plain.educationKey;

    Object.assign(this, {
      employer: '',
      title: '',
      role: '',
      start: '',
      end: '',
      Description: '',
      educationKey: eduRaw != null && String(eduRaw) !== '' ? String(eduRaw) : null,
      references: [],
      'job-skills': {},
      ...plain,
    });

    if (!Array.isArray(this.references)) this.references = [];
    if (!this['job-skills'] || typeof this['job-skills'] !== 'object') this['job-skills'] = {};
    if (this.Description == null) this.Description = '';
    if (init && typeof init.description === 'string' && !this.Description) this.Description = init.description;
  }

  get isEducationDerived() {
    return this.educationKey != null && this.educationKey !== '';
  }

  /**
   * @param {unknown} obj
   * @returns {ResumeJob}
   */
  static fromPlainObject(obj) {
    if (obj instanceof ResumeJob) {
      return new ResumeJob(obj.toPlainObject());
    }
    if (!obj || typeof obj !== 'object') return new ResumeJob();
    return new ResumeJob(/** @type {Record<string, unknown>} */ (obj));
  }

  /** Payload safe for PATCH / jobs.json shape (drops educationKey — not a persisted job field). */
  toJobPatchPlainObject() {
    const o = this.toPlainObject();
    delete o.educationKey;
    return o;
  }

  toPlainObject() {
    return {
      employer: this.employer,
      title: this.title,
      role: this.role,
      label: this.label,
      start: this.start,
      end: this.end,
      Description: this.Description,
      educationKey: this.educationKey,
      skillIDs: this.skillIDs,
      references: [...this.references],
      'job-skills': { ...this['job-skills'] },
    };
  }
}

/**
 * @param {unknown} job
 * @returns {boolean}
 */
export function isEducationDerivedJob(job) {
  if (job == null || typeof job !== 'object') return false;
  if (job instanceof ResumeJob) return job.isEducationDerived;
  const k = /** @type {{ educationKey?: unknown, __educationKey?: unknown }} */ (job).educationKey
    ?? /** @type {{ __educationKey?: unknown }} */ (job).__educationKey;
  return k != null && String(k) !== '';
}

/**
 * @param {unknown} job
 * @returns {string}
 */
export function educationKeyOf(job) {
  if (job == null || typeof job !== 'object') return '';
  if (job instanceof ResumeJob) return job.educationKey ?? '';
  const k = /** @type {{ educationKey?: unknown, __educationKey?: unknown }} */ (job).educationKey
    ?? /** @type {{ __educationKey?: unknown }} */ (job).__educationKey;
  return k != null ? String(k) : '';
}

/**
 * Resume-jobs tab: dropdown should list only persisted work jobs (not education-derived rows).
 * `mergedIdx` is the index in the full merged array (same as Skills tab / scene job number).
 * @param {unknown[]} jobs
 * @returns {{ job: unknown, mergedIdx: number }[]}
 */
export function workJobDropdownEntries(jobs) {
  if (!Array.isArray(jobs)) return [];
  const out = [];
  for (let mergedIdx = 0; mergedIdx < jobs.length; mergedIdx++) {
    const job = jobs[mergedIdx];
    if (!isEducationDerivedJob(job)) out.push({ job, mergedIdx });
  }
  return out;
}

/**
 * @param {unknown[]} jobs
 * @returns {number|null} merged index of first work job, or null if none
 */
export function firstWorkJobMergedIndex(jobs) {
  const e = workJobDropdownEntries(jobs);
  return e.length ? e[0].mergedIdx : null;
}
