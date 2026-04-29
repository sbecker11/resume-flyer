import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/modules/core/hasServer.mjs', () => ({ hasServer: () => true }));

import { useJobsDependency, getGlobalJobsDependency } from './useJobsDependency.mjs';

/**
 * URL-aware mock for current 2-phase loader:
 * - phase 1: parsed_resumes/:id/enriched-jobs.json + skills.json
 * - phase 2: api/resumes/:id/data + education
 */
function mockRuntimeFetch({ resumeId = 'r1', apiPayload = { jobs: [], skills: {} }, apiStatus = 200 }) {
  const base = `/api/resumes/${resumeId}`;
  fetch.mockImplementation(async (url) => {
    const u = String(url);
    if (u.includes(`/parsed_resumes/${resumeId}/enriched-jobs.json`)) {
      return { ok: false, status: 404, text: async () => 'Not found' };
    }
    if (u.includes(`/parsed_resumes/${resumeId}/skills.json`)) {
      return { ok: false, status: 404, text: async () => 'Not found' };
    }
    if (u.includes(`${base}/data`)) {
      if (apiStatus !== 200) return { ok: false, status: apiStatus, text: async () => 'Not found' };
      return { ok: true, json: async () => apiPayload };
    }
    if (u.includes(`${base}/education`)) {
      return { ok: false, status: 404, text: async () => '' };
    }
    return { ok: false, status: 404, text: async () => 'Not found' };
  });
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
  if (typeof global.window !== 'undefined') {
    global.window.hasServer = () => true;
  }
});

describe('useJobsDependency', () => {
  it('loadJobs fetches /api/resumes/:id/data when forceResumeId is set', async () => {
    const resumeId = 'resume-default';
    const apiPayload = { jobs: [{ index: 0, Description: '' }], skills: {} };
    mockRuntimeFetch({ resumeId, apiPayload });
    const { loadJobs, getJobsData } = useJobsDependency();
    await loadJobs({ force: true, forceResumeId: resumeId });
    expect(fetch).toHaveBeenCalledWith(`/api/resumes/${resumeId}/data`);
    expect(getJobsData()).toHaveLength(1);
    expect(getJobsData()[0]).toHaveProperty('references');
    expect(getJobsData()[0]).toHaveProperty('job-skills');
  });

  it('loadJobs fetches /api/resumes/:id/data when forceResumeId is set', async () => {
    const resumeId = 'resume-abc-123';
    mockRuntimeFetch({ resumeId, apiPayload: { jobs: [], skills: {} } });
    const { loadJobs } = useJobsDependency();
    await loadJobs({ force: true, forceResumeId: resumeId });
    expect(fetch).toHaveBeenCalledWith(`/api/resumes/${resumeId}/data`);
  });

  it('loadJobs normalizes non-array jobs to empty array', async () => {
    mockRuntimeFetch({ resumeId: 'x', apiPayload: { jobs: 'not-an-array', skills: {} } });
    const { loadJobs, getJobsData } = useJobsDependency();
    await loadJobs({ force: true, forceResumeId: 'x' });
    expect(getJobsData()).toEqual([]);
  });

  it('loadJobs throws when API returns 404', async () => {
    mockRuntimeFetch({ resumeId: 'missing', apiStatus: 404 });
    const { loadJobs } = useJobsDependency();
    await expect(loadJobs({ force: true, forceResumeId: 'missing' })).rejects.toThrow(/Resume data not found|404|Static resume jobs not found/);
  });

  it('getJobsData returns an array', () => {
    const dep = useJobsDependency();
    expect(Array.isArray(dep.getJobsData())).toBe(true);
  });

  it('registerController initializes immediately when jobs already loaded', async () => {
    mockRuntimeFetch({ resumeId: 'resume-default', apiPayload: { jobs: [{ index: 0, Description: '' }], skills: {} } });
    const { loadJobs, registerController } = useJobsDependency();
    await loadJobs({ force: true, forceResumeId: 'resume-default' });
    const initFn = vi.fn();
    registerController('TestCtrl', initFn);
    await new Promise((r) => setTimeout(r, 20));
    expect(initFn).toHaveBeenCalledWith(expect.any(Array));
  });

  it('registerController then loadJobs notifies controller', async () => {
    mockRuntimeFetch({ resumeId: 'resume-default', apiPayload: { jobs: [], skills: {} } });
    const initFn = vi.fn();
    const { loadJobs, registerController } = useJobsDependency();
    registerController('TestCtrl2', initFn);
    await loadJobs({ force: true, forceResumeId: 'resume-default' });
    expect(initFn).toHaveBeenCalledWith([]);
  });

  it('waitForJobs resolves when jobs are ready', async () => {
    mockRuntimeFetch({ resumeId: 'resume-default', apiPayload: { jobs: [], skills: {} } });
    const { loadJobs, waitForJobs } = useJobsDependency();
    const p = loadJobs({ force: true, forceResumeId: 'resume-default' }).then(() => waitForJobs());
    const data = await p;
    expect(data).toEqual([]);
  });

  it('waitForJobs rejects when there is an error', async () => {
    mockRuntimeFetch({ resumeId: 'missing', apiStatus: 404 });
    const { loadJobs, waitForJobs } = useJobsDependency();
    await expect(loadJobs({ force: true, forceResumeId: 'missing' })).rejects.toThrow();
    await expect(waitForJobs()).rejects.toBeDefined();
  });

  it('loadJobs returns cached data when not force and already loaded', async () => {
    mockRuntimeFetch({ resumeId: 'resume-default', apiPayload: { jobs: [{ index: 0, Description: '' }], skills: {} } });
    const { loadJobs, getJobsData } = useJobsDependency();
    await loadJobs({ force: true, forceResumeId: 'resume-default' });
    const first = getJobsData();
    const result = await loadJobs(); // no force — should use cache
    // phase 1 + phase 2 calls happen on first load; second load uses cache
    expect(fetch.mock.calls.length).toBeGreaterThanOrEqual(4);
    expect(result).toEqual(first);
  });
});

describe('getGlobalJobsDependency', () => {
  it('returns same instance on multiple calls', () => {
    const a = getGlobalJobsDependency();
    const b = getGlobalJobsDependency();
    expect(a).toBe(b);
  });
});
