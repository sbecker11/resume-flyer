import { describe, it, expect } from 'vitest';
import {
  ResumeJob,
  isEducationDerivedJob,
  educationKeyOf,
  workJobDropdownEntries,
  firstWorkJobMergedIndex,
} from './ResumeJob.mjs';

describe('ResumeJob', () => {
  it('constructs with defaults', () => {
    const j = new ResumeJob();
    expect(j.employer).toBe('');
    expect(j.title).toBe('');
    expect(j.role).toBe('');
    expect(j.start).toBe('');
    expect(j.end).toBe('');
    expect(j.Description).toBe('');
    expect(j.educationKey).toBeNull();
    expect(j.references).toEqual([]);
    expect(j['job-skills']).toEqual({});
    expect(j.isEducationDerived).toBe(false);
  });

  it('constructs with provided values', () => {
    const j = new ResumeJob({ employer: 'Acme', role: 'Dev', title: 'Dev', start: '2020-01', end: '2023-01' });
    expect(j.employer).toBe('Acme');
    expect(j.role).toBe('Dev');
    expect(j.start).toBe('2020-01');
  });

  it('maps description from lowercase description field', () => {
    const j = new ResumeJob({ description: 'lower desc' });
    expect(j.Description).toBe('lower desc');
  });

  it('Description from uppercase takes precedence over lowercase', () => {
    const j = new ResumeJob({ Description: 'upper', description: 'lower' });
    expect(j.Description).toBe('upper');
  });

  it('sets educationKey from __educationKey', () => {
    const j = new ResumeJob({ __educationKey: 'edu-1' });
    expect(j.educationKey).toBe('edu-1');
    expect(j.isEducationDerived).toBe(true);
  });

  it('sets educationKey from educationKey field', () => {
    const j = new ResumeJob({ educationKey: 'edu-2' });
    expect(j.educationKey).toBe('edu-2');
    expect(j.isEducationDerived).toBe(true);
  });

  it('null/empty educationKey means not education-derived', () => {
    const j = new ResumeJob({ educationKey: '' });
    expect(j.educationKey).toBeNull();
    expect(j.isEducationDerived).toBe(false);
  });

  it('normalizes non-array references to []', () => {
    const j = new ResumeJob({ references: 'bad' });
    expect(j.references).toEqual([]);
  });

  it('normalizes non-object job-skills to {}', () => {
    const j = new ResumeJob({ 'job-skills': 'bad' });
    expect(j['job-skills']).toEqual({});
  });

  describe('toPlainObject', () => {
    it('returns all fields', () => {
      const j = new ResumeJob({ employer: 'X', role: 'Y', skillIDs: ['a'] });
      const plain = j.toPlainObject();
      expect(plain).toHaveProperty('employer', 'X');
      expect(plain).toHaveProperty('role', 'Y');
      expect(plain).toHaveProperty('skillIDs');
      expect(plain).toHaveProperty('references');
      expect(plain).toHaveProperty('job-skills');
      expect(plain).toHaveProperty('educationKey');
      expect(plain).toHaveProperty('durationMonths');
    });
  });

  describe('toJobPatchPlainObject', () => {
    it('drops educationKey and durationMonths', () => {
      const j = new ResumeJob({ educationKey: 'edu-1', employer: 'X' });
      j.durationMonths = 12;
      const patch = j.toJobPatchPlainObject();
      expect(patch).not.toHaveProperty('educationKey');
      expect(patch).not.toHaveProperty('durationMonths');
      expect(patch).toHaveProperty('employer', 'X');
    });
  });

  describe('fromPlainObject', () => {
    it('returns a ResumeJob from a plain object', () => {
      const j = ResumeJob.fromPlainObject({ employer: 'Acme', role: 'Dev' });
      expect(j).toBeInstanceOf(ResumeJob);
      expect(j.employer).toBe('Acme');
    });

    it('returns empty ResumeJob for null', () => {
      const j = ResumeJob.fromPlainObject(null);
      expect(j).toBeInstanceOf(ResumeJob);
      expect(j.employer).toBe('');
    });

    it('clones an existing ResumeJob', () => {
      const orig = new ResumeJob({ employer: 'Orig' });
      const clone = ResumeJob.fromPlainObject(orig);
      expect(clone).toBeInstanceOf(ResumeJob);
      expect(clone.employer).toBe('Orig');
      expect(clone).not.toBe(orig);
    });
  });
});

describe('isEducationDerivedJob', () => {
  it('returns false for null/undefined', () => {
    expect(isEducationDerivedJob(null)).toBe(false);
    expect(isEducationDerivedJob(undefined)).toBe(false);
  });

  it('returns false for non-object', () => {
    expect(isEducationDerivedJob('string')).toBe(false);
  });

  it('returns true for ResumeJob with educationKey', () => {
    const j = new ResumeJob({ educationKey: 'edu-1' });
    expect(isEducationDerivedJob(j)).toBe(true);
  });

  it('returns false for ResumeJob without educationKey', () => {
    const j = new ResumeJob({ employer: 'Acme' });
    expect(isEducationDerivedJob(j)).toBe(false);
  });

  it('returns true for plain object with educationKey', () => {
    expect(isEducationDerivedJob({ educationKey: 'edu-1' })).toBe(true);
  });

  it('returns true for plain object with __educationKey', () => {
    expect(isEducationDerivedJob({ __educationKey: 'edu-1' })).toBe(true);
  });

  it('returns false for plain object with empty educationKey', () => {
    expect(isEducationDerivedJob({ educationKey: '' })).toBe(false);
  });
});

describe('educationKeyOf', () => {
  it('returns empty string for null', () => {
    expect(educationKeyOf(null)).toBe('');
  });

  it('returns empty string for non-object', () => {
    expect(educationKeyOf('str')).toBe('');
  });

  it('returns educationKey from ResumeJob', () => {
    const j = new ResumeJob({ educationKey: 'edu-1' });
    expect(educationKeyOf(j)).toBe('edu-1');
  });

  it('returns empty string from ResumeJob with no educationKey', () => {
    const j = new ResumeJob();
    expect(educationKeyOf(j)).toBe('');
  });

  it('returns educationKey from plain object', () => {
    expect(educationKeyOf({ educationKey: 'k1' })).toBe('k1');
  });

  it('returns __educationKey from plain object', () => {
    expect(educationKeyOf({ __educationKey: 'k2' })).toBe('k2');
  });
});

describe('workJobDropdownEntries', () => {
  it('returns [] for non-array', () => {
    expect(workJobDropdownEntries(null)).toEqual([]);
    expect(workJobDropdownEntries('bad')).toEqual([]);
  });

  it('returns only non-education-derived jobs', () => {
    const jobs = [
      new ResumeJob({ employer: 'Work1' }),
      new ResumeJob({ educationKey: 'edu-1', employer: 'Uni' }),
      new ResumeJob({ employer: 'Work2' }),
    ];
    const entries = workJobDropdownEntries(jobs);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({ job: jobs[0], mergedIdx: 0 });
    expect(entries[1]).toEqual({ job: jobs[2], mergedIdx: 2 });
  });

  it('preserves mergedIdx correctly', () => {
    const jobs = [
      new ResumeJob({ educationKey: 'edu-1' }),
      new ResumeJob({ employer: 'Work' }),
    ];
    const entries = workJobDropdownEntries(jobs);
    expect(entries[0].mergedIdx).toBe(1);
  });
});

describe('firstWorkJobMergedIndex', () => {
  it('returns null for empty array', () => {
    expect(firstWorkJobMergedIndex([])).toBeNull();
  });

  it('returns null when all are education-derived', () => {
    const jobs = [new ResumeJob({ educationKey: 'edu-1' })];
    expect(firstWorkJobMergedIndex(jobs)).toBeNull();
  });

  it('returns index of first work job', () => {
    const jobs = [
      new ResumeJob({ educationKey: 'edu-1' }),
      new ResumeJob({ employer: 'Work' }),
    ];
    expect(firstWorkJobMergedIndex(jobs)).toBe(1);
  });
});
