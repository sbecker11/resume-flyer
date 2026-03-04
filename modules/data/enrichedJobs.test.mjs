import { describe, it, expect } from 'vitest';
import { jobs, getJobsData, skills } from './enrichedJobs.mjs';

describe('enrichedJobs', () => {
  it('exports jobs array', () => {
    expect(Array.isArray(jobs)).toBe(true);
    expect(jobs.length).toBeGreaterThan(0);
  });
  it('each job has references and job-skills', () => {
    const job = jobs[0];
    expect(job).toHaveProperty('references');
    expect(job).toHaveProperty('job-skills');
    expect(Array.isArray(job.references)).toBe(true);
    expect(typeof job['job-skills']).toBe('object');
  });
  it('getJobsData returns jobs', () => {
    expect(getJobsData()).toBe(jobs);
  });
  it('exports skills', () => {
    expect(skills).toBeDefined();
    expect(typeof skills).toBe('object');
  });
});
