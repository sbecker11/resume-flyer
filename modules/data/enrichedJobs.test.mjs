import { describe, it, expect } from 'vitest';
import { enrichJobsWithSkills } from './enrichedJobs.mjs';

describe('enrichedJobs', () => {
  it('enrichJobsWithSkills returns array with references and job-skills', () => {
    const rawJobs = [
      { index: 0, employer: 'Test', role: 'Dev', Description: 'Used [Python] and [AWS].' }
    ];
    const skills = {
      Python: { url: 'https://python.org', img: '' },
      AWS: { url: 'https://aws.amazon.com', img: '' }
    };
    const jobs = enrichJobsWithSkills(rawJobs, skills);
    expect(Array.isArray(jobs)).toBe(true);
    expect(jobs.length).toBe(1);
    expect(jobs[0]).toHaveProperty('references');
    expect(jobs[0]).toHaveProperty('job-skills');
    expect(Array.isArray(jobs[0].references)).toBe(true);
    expect(jobs[0]['job-skills']).toHaveProperty('Python');
    expect(jobs[0]['job-skills']).toHaveProperty('AWS');
  });

  it('enrichJobsWithSkills handles empty jobs', () => {
    expect(enrichJobsWithSkills([], {})).toEqual([]);
  });

  it('enrichJobsWithSkills handles missing skills', () => {
    const rawJobs = [{ index: 0, Description: 'No brackets.' }];
    const jobs = enrichJobsWithSkills(rawJobs, {});
    expect(jobs[0].references).toEqual([]);
    expect(jobs[0]['job-skills']).toEqual({});
  });

  it('returns empty array when rawJobs is not an array', () => {
    expect(enrichJobsWithSkills(null, {})).toEqual([]);
    expect(enrichJobsWithSkills(undefined, {})).toEqual([]);
    expect(enrichJobsWithSkills({}, {})).toEqual([]);
  });

  it('handles skill with empty or missing url (uses #)', () => {
    const rawJobs = [{ index: 0, Description: 'Used [X].' }];
    const skills = { X: { url: '', img: '' } };
    const jobs = enrichJobsWithSkills(rawJobs, skills);
    expect(jobs[0].references).toContain('<a href="#">[X]</a>');
  });

  it('handles null/undefined Description', () => {
    const rawJobs = [
      { index: 0, Description: null },
      { index: 1 }
    ];
    const jobs = enrichJobsWithSkills(rawJobs, {});
    expect(jobs[0].references).toEqual([]);
    expect(jobs[0]['job-skills']).toEqual({});
    expect(jobs[1].references).toEqual([]);
    expect(jobs[1]['job-skills']).toEqual({});
  });

  it('deduplicates repeated [Skill] in same description', () => {
    const rawJobs = [{ index: 0, Description: ' [Python] and [Python] again.' }];
    const skills = { Python: { url: 'https://python.org', img: '' } };
    const jobs = enrichJobsWithSkills(rawJobs, skills);
    expect(jobs[0].references).toHaveLength(1);
    expect(jobs[0]['job-skills']).toEqual({ Python: 'Python' });
  });

  it('preserves full parser job shape (index, role, employer, start, end, Description)', () => {
    const rawJobs = [
      {
        index: 0,
        role: 'Senior Dev',
        employer: 'Acme',
        start: '2020-01-01',
        end: 'CURRENT_DATE',
        'z-index': 1,
        Description: 'Used [Python].'
      }
    ];
    const skills = { Python: { url: 'https://python.org', img: '' } };
    const jobs = enrichJobsWithSkills(rawJobs, skills);
    expect(jobs[0].index).toBe(0);
    expect(jobs[0].role).toBe('Senior Dev');
    expect(jobs[0].employer).toBe('Acme');
    expect(jobs[0].start).toBe('2020-01-01');
    expect(jobs[0].end).toBe('CURRENT_DATE');
    expect(jobs[0]['z-index']).toBe(1);
    expect(jobs[0].references).toHaveLength(1);
    expect(jobs[0]['job-skills']).toHaveProperty('Python');
  });

  it('ignores [brackets] that are not in skills map', () => {
    const rawJobs = [{ index: 0, Description: 'Used [UnknownSkill].' }];
    const jobs = enrichJobsWithSkills(rawJobs, {});
    expect(jobs[0].references).toEqual([]);
    expect(jobs[0]['job-skills']).toEqual({});
  });

  it('detects unbracketed skill occurrences in description', () => {
    const rawJobs = [{ index: 0, Description: 'Used Python in production.' }];
    const skills = { Python: { url: 'https://python.org', img: '' } };
    const jobs = enrichJobsWithSkills(rawJobs, skills);
    expect(jobs[0].references).toContain('<a href="https://python.org">[Python]</a>');
    expect(jobs[0]['job-skills']).toHaveProperty('Python');
  });
});
