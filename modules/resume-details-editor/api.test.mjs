// modules/resume-details-editor/api.test.mjs
// Unit tests for resume-details-editor API client

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/modules/core/hasServer.mjs', () => ({ hasServer: () => true }));

import {
    getResumeMeta,
    updateResumeMeta,
    getResumeOtherSections,
    updateResumeOtherSections,
    getResumeData,
    updateResumeCategories,
    updateJob
} from './api.mjs';

describe('resume-details-editor api', () => {
    let fetchMock;

    beforeEach(() => {
        fetchMock = vi.fn();
        global.fetch = fetchMock;
        if (typeof global.window !== 'undefined') {
            global.window.hasServer = () => true;
        }
    });

    afterEach(() => {
        vi.restoreAllMocks();
        delete global.window?.__RESUME_DETAILS_EDITOR_API_BASE__;
    });

    const okJson = (data) => ({
        ok: true,
        json: async () => data
    });

    const errJson = (status, error) => ({
        ok: false,
        status,
        json: async () => ({ error: error || `HTTP ${status}` })
    });

    describe('getResumeMeta', () => {
        it('fetches meta and returns parsed JSON', async () => {
            const meta = { id: 'r1', displayName: 'My Resume', createdAt: '2025-01-01' };
            fetchMock.mockResolvedValue(okJson(meta));
            const result = await getResumeMeta('r1');
            expect(result).toEqual(meta);
            expect(fetchMock).toHaveBeenCalledWith('/api/resumes/r1/meta', expect.any(Object));
        });

        it('encodes resume id in URL', async () => {
            fetchMock.mockResolvedValue(okJson({}));
            await getResumeMeta('resume-with/slash');
            expect(fetchMock).toHaveBeenCalledWith(
                '/api/resumes/resume-with%2Fslash/meta',
                expect.any(Object)
            );
        });

        it('returns default meta when fetch fails (404) for missing resume', async () => {
            fetchMock.mockResolvedValue(errJson(404, 'meta.json not found'));
            const result = await getResumeMeta('missing');
            expect(result).toMatchObject({ id: 'missing', displayName: 'missing' });
        });
    });

    describe('updateResumeMeta', () => {
        it('PATCHes meta with updates', async () => {
            const updated = { id: 'r1', displayName: 'Updated Name' };
            fetchMock.mockResolvedValue(okJson(updated));
            const result = await updateResumeMeta('r1', { displayName: 'Updated Name' });
            expect(result).toEqual(updated);
            expect(fetchMock).toHaveBeenCalledWith(
                '/api/resumes/r1/meta',
                expect.objectContaining({
                    method: 'PATCH',
                    body: JSON.stringify({ displayName: 'Updated Name' })
                })
            );
        });
    });

    describe('getResumeOtherSections', () => {
        it('returns data on success', async () => {
            const data = { summary: 'Hello', contact: {} };
            fetchMock.mockResolvedValue(okJson(data));
            const result = await getResumeOtherSections('r1');
            expect(result).toEqual(data);
        });

        it('returns empty object on 404', async () => {
            fetchMock.mockResolvedValue(errJson(404, 'other-sections.json not found'));
            const result = await getResumeOtherSections('r1');
            expect(result).toEqual({});
        });

        it('returns empty object when error message includes "not found"', async () => {
            fetchMock.mockResolvedValue(errJson(404, 'File not found for this resume'));
            const result = await getResumeOtherSections('r1');
            expect(result).toEqual({});
        });

        it('throws on non-404 error', async () => {
            fetchMock.mockResolvedValue(errJson(500, 'Server error'));
            await expect(getResumeOtherSections('r1')).rejects.toThrow('Server error');
        });
    });

    describe('updateResumeOtherSections', () => {
        it('PATCHes full otherSections payload', async () => {
            const payload = { summary: 'Hi', title: 'Engineer', contact: {}, certifications: [] };
            fetchMock.mockResolvedValue(okJson(payload));
            const result = await updateResumeOtherSections('r1', payload);
            expect(result).toEqual(payload);
            expect(fetchMock).toHaveBeenCalledWith(
                '/api/resumes/r1/other-sections',
                expect.objectContaining({
                    method: 'PATCH',
                    body: JSON.stringify(payload)
                })
            );
        });
    });

    describe('getResumeData', () => {
        it('fetches default resume from /api/resumes/default/data', async () => {
            const data = { jobs: [], skills: {}, categories: {} };
            fetchMock.mockResolvedValue(okJson(data));
            await getResumeData('default');
            expect(fetchMock).toHaveBeenCalledWith('/api/resumes/default/data', expect.any(Object));
        });

        it('fetches parsed resume from /api/resumes/:id/data', async () => {
            fetchMock.mockResolvedValue(okJson({ jobs: [], skills: {}, categories: {} }));
            await getResumeData('parsed-resume-1');
            expect(fetchMock).toHaveBeenCalledWith(
                '/api/resumes/parsed-resume-1/data',
                expect.any(Object)
            );
        });
    });

    describe('updateResumeCategories', () => {
        it('PATCHes categories', async () => {
            const categories = { 'cat-1': { name: 'Frontend', skillIDs: ['s1'] } };
            fetchMock.mockResolvedValue(okJson({ categories }));
            const result = await updateResumeCategories('r1', categories);
            expect(result).toEqual({ categories });
            expect(fetchMock).toHaveBeenCalledWith(
                '/api/resumes/r1/categories',
                expect.objectContaining({
                    method: 'PATCH',
                    body: JSON.stringify({ categories })
                })
            );
        });
    });

    describe('updateJob', () => {
        it('PATCHes job at index with allowed fields', async () => {
            const job = { role: 'Engineer', start: '2020-01', end: '2023-06', Description: 'Did stuff.' };
            fetchMock.mockResolvedValue(okJson({ ok: true, job }));
            const updates = { role: 'Engineer', start: '2020-01', end: '2023-06', Description: 'Did stuff.' };
            const result = await updateJob('r1', 0, updates);
            expect(result).toEqual({ ok: true, job });
            expect(fetchMock).toHaveBeenCalledWith(
                '/api/resumes/r1/jobs/0',
                expect.objectContaining({
                    method: 'PATCH',
                    body: JSON.stringify(updates)
                })
            );
        });

        it('encodes resume id in URL', async () => {
            fetchMock.mockResolvedValue(okJson({ ok: true, job: {} }));
            await updateJob('resume/with/slash', 2, { role: 'Dev' });
            expect(fetchMock).toHaveBeenCalledWith(
                '/api/resumes/resume%2Fwith%2Fslash/jobs/2',
                expect.any(Object)
            );
        });

        it('throws on HTTP error', async () => {
            fetchMock.mockResolvedValue(errJson(404, 'Job index 99 not found'));
            await expect(updateJob('r1', 99, { role: 'X' })).rejects.toThrow('Job index 99 not found');
        });
    });

    describe('base URL', () => {
        it('uses empty base when window.__RESUME_DETAILS_EDITOR_API_BASE__ is unset', async () => {
            fetchMock.mockResolvedValue(okJson({}));
            await getResumeMeta('r1');
            expect(fetchMock).toHaveBeenCalledWith(
                expect.stringMatching(/\/api\/resumes\/r1\/meta$/),
                expect.any(Object)
            );
        });

        it('uses custom base when window.__RESUME_DETAILS_EDITOR_API_BASE__ is set', async () => {
            global.window = { __RESUME_DETAILS_EDITOR_API_BASE__: 'https://api.example.com' };
            fetchMock.mockResolvedValue(okJson({}));
            await getResumeMeta('r1');
            expect(fetchMock).toHaveBeenCalledWith(
                'https://api.example.com/api/resumes/r1/meta',
                expect.any(Object)
            );
        });
    });
});
