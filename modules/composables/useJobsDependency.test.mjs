import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/modules/core/hasServer.mjs', () => ({ hasServer: () => true }));

import { useJobsDependency, getGlobalJobsDependency } from './useJobsDependency.mjs';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
  if (typeof global.window !== 'undefined') {
    global.window.hasServer = () => true;
  }
});

describe('useJobsDependency', () => {
  it('loadJobs fetches /api/resumes/default/data when forceResumeId is default', async () => {
    const apiPayload = { jobs: [{ index: 0, Description: '' }], skills: {} };
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => apiPayload,
    });
    const { loadJobs, getJobsData } = useJobsDependency();
    await loadJobs({ force: true, forceResumeId: 'default' });
    expect(fetch).toHaveBeenCalledWith('/api/resumes/default/data');
    expect(getJobsData()).toHaveLength(1);
    expect(getJobsData()[0]).toHaveProperty('references');
    expect(getJobsData()[0]).toHaveProperty('job-skills');
  });

  it('loadJobs fetches /api/resumes/:id/data when forceResumeId is set', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ jobs: [], skills: {} }),
    });
    const { loadJobs } = useJobsDependency();
    await loadJobs({ force: true, forceResumeId: 'resume-abc-123' });
    expect(fetch).toHaveBeenCalledWith('/api/resumes/resume-abc-123/data');
  });

  it('loadJobs normalizes non-array jobs to empty array', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ jobs: 'not-an-array', skills: {} }),
    });
    const { loadJobs, getJobsData } = useJobsDependency();
    await loadJobs({ force: true, forceResumeId: 'x' });
    expect(getJobsData()).toEqual([]);
  });

  it('loadJobs throws when API returns 404', async () => {
    // API returns 404, then static fallback (jobs + skills URLs); mock jobs to fail so we reject
    fetch
      .mockResolvedValueOnce({ ok: false, status: 404, text: async () => 'Not found' })
      .mockResolvedValueOnce({ ok: false, text: async () => '' })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    const { loadJobs } = useJobsDependency();
    await expect(loadJobs({ force: true, forceResumeId: 'missing' })).rejects.toThrow(/Resume data not found|404|Static resume jobs not found/);
  });

  it('getJobsData returns an array', () => {
    const dep = useJobsDependency();
    expect(Array.isArray(dep.getJobsData())).toBe(true);
  });

  it('registerController initializes immediately when jobs already loaded', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ jobs: [{ index: 0, Description: '' }], skills: {} }) });
    const { loadJobs, registerController } = useJobsDependency();
    await loadJobs({ force: true, forceResumeId: 'default' });
    const initFn = vi.fn();
    registerController('TestCtrl', initFn);
    await new Promise((r) => setTimeout(r, 20));
    expect(initFn).toHaveBeenCalledWith(expect.any(Array));
  });

  it('registerController then loadJobs notifies controller', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ jobs: [], skills: {} }) });
    const initFn = vi.fn();
    const { loadJobs, registerController } = useJobsDependency();
    registerController('TestCtrl2', initFn);
    await loadJobs({ force: true, forceResumeId: 'default' });
    expect(initFn).toHaveBeenCalledWith([]);
  });

  it('waitForJobs resolves when jobs are ready', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ jobs: [], skills: {} }) });
    const { loadJobs, waitForJobs } = useJobsDependency();
    const p = loadJobs({ force: true, forceResumeId: 'default' }).then(() => waitForJobs());
    const data = await p;
    expect(data).toEqual([]);
  });

  it('waitForJobs rejects when there is an error', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 404, text: async () => 'Not found' });
    const { loadJobs, waitForJobs } = useJobsDependency();
    await expect(loadJobs({ force: true, forceResumeId: 'missing' })).rejects.toThrow();
    await expect(waitForJobs()).rejects.toBeDefined();
  });

  it('loadJobs returns cached data when not force and already loaded', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ jobs: [{ index: 0, Description: '' }], skills: {} }) });
    const { loadJobs, getJobsData } = useJobsDependency();
    await loadJobs({ force: true, forceResumeId: 'default' });
    const first = getJobsData();
    const result = await loadJobs(); // no force
    expect(fetch).toHaveBeenCalledTimes(1);
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
