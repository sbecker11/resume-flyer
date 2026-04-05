import { describe, it, expect } from 'vitest';
import {
  toJobsArray,
  normalizeEducationDateForJobField,
  mapEducationToJob,
  educationEntriesToJobs,
  mergeJobsWithEducation,
} from './mergeEducationIntoJobs.mjs';
import { ResumeJob } from './ResumeJob.mjs';

describe('toJobsArray', () => {
  it('returns array as-is', () => {
    const arr = [{ employer: 'A' }];
    expect(toJobsArray(arr)).toBe(arr);
  });

  it('returns jobs property when value is object with jobs array', () => {
    const jobs = [{ employer: 'A' }];
    expect(toJobsArray({ jobs })).toBe(jobs);
  });

  it('returns Object.values when value is plain object without jobs array', () => {
    const obj = { a: { employer: 'A' }, b: { employer: 'B' } };
    expect(toJobsArray(obj)).toEqual([{ employer: 'A' }, { employer: 'B' }]);
  });

  it('returns [] for null', () => {
    expect(toJobsArray(null)).toEqual([]);
  });

  it('returns [] for undefined', () => {
    expect(toJobsArray(undefined)).toEqual([]);
  });

  it('returns [] for non-object', () => {
    expect(toJobsArray('bad')).toEqual([]);
    expect(toJobsArray(42)).toEqual([]);
  });
});

describe('normalizeEducationDateForJobField', () => {
  it('returns empty string for empty input', () => {
    expect(normalizeEducationDateForJobField('')).toBe('');
    expect(normalizeEducationDateForJobField(null)).toBe('');
    expect(normalizeEducationDateForJobField(undefined)).toBe('');
  });

  it('converts YYYY/MM/DD to YYYY-MM-DD', () => {
    expect(normalizeEducationDateForJobField('2020/5/3')).toBe('2020-05-03');
    expect(normalizeEducationDateForJobField('2020/12/01')).toBe('2020-12-01');
  });

  it('converts YYYY/MM to YYYY-MM', () => {
    expect(normalizeEducationDateForJobField('2020/5')).toBe('2020-05');
    expect(normalizeEducationDateForJobField('2020/12')).toBe('2020-12');
  });

  it('normalizes YYYY-MM-DD (pads single digits)', () => {
    expect(normalizeEducationDateForJobField('2020-5-3')).toBe('2020-05-03');
  });

  it('normalizes YYYY-MM (pads single digit month)', () => {
    expect(normalizeEducationDateForJobField('2020-5')).toBe('2020-05');
  });

  it('returns YYYY for year-only', () => {
    expect(normalizeEducationDateForJobField('2020')).toBe('2020');
  });

  it('returns raw string for unrecognized format', () => {
    expect(normalizeEducationDateForJobField('spring 2020')).toBe('spring 2020');
  });
});

describe('mapEducationToJob', () => {
  it('creates a ResumeJob with educationKey set', () => {
    const edu = { institution: 'MIT', degree: 'BS CS', start: '2015/09', end: '2019/05' };
    const job = mapEducationToJob('mit-bs-cs', edu);
    expect(job).toBeInstanceOf(ResumeJob);
    expect(job.educationKey).toBe('mit-bs-cs');
    expect(job.employer).toBe('MIT');
    expect(job.title).toBe('BS CS');
    expect(job.role).toBe('BS CS');
    expect(job.start).toBe('2015-09');
    expect(job.end).toBe('2019-05');
    expect(job.isEducationDerived).toBe(true);
  });

  it('handles missing fields gracefully', () => {
    const job = mapEducationToJob('key1', {});
    expect(job.employer).toBe('');
    expect(job.title).toBe('');
    expect(job.start).toBe('');
    expect(job.end).toBe('');
    expect(job.Description).toBe('');
  });

  it('maps description field', () => {
    const job = mapEducationToJob('k', { description: 'Studied hard' });
    expect(job.Description).toBe('Studied hard');
  });

  it('maps skillIDs when present', () => {
    const job = mapEducationToJob('k', { skillIDs: ['python', 'ml'] });
    expect(job.skillIDs).toEqual(['python', 'ml']);
  });

  it('does not set skillIDs when not present', () => {
    const job = mapEducationToJob('k', {});
    expect(job.skillIDs).toBeUndefined();
  });

  it('filters empty strings from skillIDs', () => {
    const job = mapEducationToJob('k', { skillIDs: ['python', '', 'ml'] });
    expect(job.skillIDs).toEqual(['python', 'ml']);
  });
});

describe('educationEntriesToJobs', () => {
  it('returns [] for null/undefined', () => {
    expect(educationEntriesToJobs(null)).toEqual([]);
    expect(educationEntriesToJobs(undefined)).toEqual([]);
  });

  it('returns [] for non-object', () => {
    expect(educationEntriesToJobs('bad')).toEqual([]);
  });

  it('converts education entries to ResumeJob instances', () => {
    const edu = {
      'mit-bs': { institution: 'MIT', degree: 'BS', start: '2015/09', end: '2019/05' },
      'stanford-ms': { institution: 'Stanford', degree: 'MS', start: '2019/09', end: '2021/05' },
    };
    const jobs = educationEntriesToJobs(edu);
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toBeInstanceOf(ResumeJob);
    expect(jobs[0].educationKey).toBe('mit-bs');
    expect(jobs[1].educationKey).toBe('stanford-ms');
  });

  it('sorts by index field when present', () => {
    const edu = {
      'second': { index: 1, institution: 'B', degree: 'MS' },
      'first': { index: 0, institution: 'A', degree: 'BS' },
    };
    const jobs = educationEntriesToJobs(edu);
    expect(jobs[0].educationKey).toBe('first');
    expect(jobs[1].educationKey).toBe('second');
  });

  it('sorts alphabetically by key when no index', () => {
    const edu = {
      'z-school': { institution: 'Z', degree: 'BS' },
      'a-school': { institution: 'A', degree: 'MS' },
    };
    const jobs = educationEntriesToJobs(edu);
    expect(jobs[0].educationKey).toBe('a-school');
    expect(jobs[1].educationKey).toBe('z-school');
  });
});

describe('mergeJobsWithEducation', () => {
  it('appends education-derived jobs after work jobs', () => {
    const workJobs = [{ employer: 'Acme', role: 'Dev' }];
    const education = {
      'mit-bs': { institution: 'MIT', degree: 'BS' },
    };
    const merged = mergeJobsWithEducation(workJobs, education);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toEqual(workJobs[0]);
    expect(merged[1]).toBeInstanceOf(ResumeJob);
    expect(merged[1].educationKey).toBe('mit-bs');
  });

  it('handles empty education', () => {
    const jobs = [{ employer: 'A' }];
    expect(mergeJobsWithEducation(jobs, {})).toHaveLength(1);
    expect(mergeJobsWithEducation(jobs, null)).toHaveLength(1);
  });

  it('handles non-array jobs', () => {
    const result = mergeJobsWithEducation(null, {});
    expect(result).toEqual([]);
  });

  it('handles both empty', () => {
    expect(mergeJobsWithEducation([], {})).toEqual([]);
  });
});
