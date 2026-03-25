// modules/resume-details-editor/api.test.mjs
// Unit tests for resume-details-editor API client

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/modules/core/hasServer.mjs', () => ({ hasServer: vi.fn(() => true) }));

import { hasServer } from '@/modules/core/hasServer.mjs';
import {
    getResumeMeta,
    updateResumeMeta,
    getResumeOtherSections,
    updateResumeOtherSections,
    getResumeEducation,
    updateResumeEducation,
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

        it('falls back to static meta when API returns 404', async () => {
            const meta = { id: 'r1', displayName: 'Static', createdAt: '2025-01-01' };
            fetchMock
                .mockResolvedValueOnce(errJson(404, 'not found'))
                .mockResolvedValueOnce(okJson(meta));
            const result = await getResumeMeta('r1');
            expect(result).toEqual(meta);
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

        it('falls back to static other-sections when API returns 404', async () => {
            const data = { summary: 'S', contact: {} };
            fetchMock
                .mockResolvedValueOnce(errJson(404, 'not found'))
                .mockResolvedValueOnce(okJson(data));
            const result = await getResumeOtherSections('r1');
            expect(result).toEqual(data);
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

    describe('getResumeEducation', () => {
        it('fetches education on success', async () => {
            const edu = { e1: { degree: 'BS', institution: 'X' } };
            fetchMock.mockResolvedValue(okJson(edu));
            const result = await getResumeEducation('r1');
            expect(result).toEqual(edu);
            expect(fetchMock).toHaveBeenCalledWith('/api/resumes/r1/education', expect.any(Object));
        });

        it('falls back to static education.json when API returns 404', async () => {
            const edu = { e1: { degree: 'BS', institution: 'X' } };
            fetchMock
                .mockResolvedValueOnce(errJson(404, 'not found'))
                .mockResolvedValueOnce(okJson(edu));
            const result = await getResumeEducation('r1');
            expect(result).toEqual(edu);
        });

        it('throws on non-404 errors', async () => {
            fetchMock.mockResolvedValue(errJson(500, 'Server error'));
            await expect(getResumeEducation('r1')).rejects.toThrow('Server error');
        });
    });

    describe('updateResumeEducation', () => {
        it('PATCHes education updates', async () => {
            const payload = { e1: { degree: 'MS' } };
            const updated = { ok: true };
            fetchMock.mockResolvedValue(okJson(updated));
            const result = await updateResumeEducation('r1', payload);
            expect(result).toEqual(updated);
            expect(fetchMock).toHaveBeenCalledWith(
                '/api/resumes/r1/education',
                expect.objectContaining({
                    method: 'PATCH',
                    body: JSON.stringify(payload)
                })
            );
        });

        it('downloads patch and rethrows when API fails', async () => {
            fetchMock.mockResolvedValue(errJson(500, 'Server error'));
            await expect(updateResumeEducation('r1', { e1: { degree: 'MS' } })).rejects.toThrow('Server error');
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

        it('falls back to static when API returns 404 for non-default resume', async () => {
            const jobs = [{ index: 0, Description: '' }];
            const skills = {};
            const categories = {};
            fetchMock
                .mockResolvedValueOnce(errJson(404, 'not found'))
                .mockResolvedValueOnce(okJson(jobs))
                .mockResolvedValueOnce(okJson(skills))
                .mockResolvedValueOnce(okJson(categories));
            const result = await getResumeData('resume-1');
            expect(result).toEqual({ jobs, skills, categories });
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

        it('downloads patch and rethrows when API fails', async () => {
            fetchMock.mockResolvedValue(errJson(500, 'Server error'));
            await expect(updateResumeCategories('r1', { c1: { name: 'C', skillIDs: [] } })).rejects.toThrow('Server error');
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

        it('downloads patch and rethrows when API fails', async () => {
            fetchMock.mockResolvedValue(errJson(500, 'Server error'));
            await expect(updateJob('r1', 0, { role: 'X' })).rejects.toThrow('Server error');
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
            global.window.__RESUME_DETAILS_EDITOR_API_BASE__ = 'https://api.example.com';
            fetchMock.mockResolvedValue(okJson({}));
            await getResumeMeta('r1');
            expect(fetchMock).toHaveBeenCalledWith(
                'https://api.example.com/api/resumes/r1/meta',
                expect.any(Object)
            );
        });
    });

    describe('when hasServer() is false (static host)', () => {
        beforeEach(() => {
            vi.mocked(hasServer).mockReturnValue(false);
            if (global.window && !global.window.location) {
                global.window.location = { origin: 'http://localhost', pathname: '/' };
            }
        });

        it('getResumeMeta returns default when static fetch fails', async () => {
            fetchMock.mockResolvedValue(errJson(404, 'not found'));
            const result = await getResumeMeta('missing');
            expect(result).toMatchObject({ id: 'missing', displayName: 'missing' });
        });

        it('getResumeMeta returns static meta when available', async () => {
            const meta = { id: 'r1', displayName: 'Static', createdAt: '2025-01-01' };
            fetchMock.mockResolvedValue(okJson(meta));
            const result = await getResumeMeta('r1');
            expect(result).toEqual(meta);
        });

        it('getResumeOtherSections returns static data', async () => {
            const data = { summary: 'S', contact: {} };
            fetchMock.mockResolvedValue(okJson(data));
            const result = await getResumeOtherSections('r1');
            expect(result).toEqual(data);
        });

        it('getResumeOtherSections returns empty object when static fails', async () => {
            fetchMock.mockResolvedValue(errJson(404, 'not found'));
            const result = await getResumeOtherSections('r1');
            expect(result).toEqual({});
        });

        it('getResumeData returns static data for non-default resume', async () => {
            const jobs = [{ index: 0, Description: '' }];
            const skills = {};
            const categories = {};
            fetchMock
                .mockResolvedValueOnce(okJson(jobs))
                .mockResolvedValueOnce(okJson(skills))
                .mockResolvedValueOnce(okJson(categories));
            const result = await getResumeData('resume-1');
            expect(result).toEqual({ jobs, skills, categories });
        });

        it('getResumeData throws for default on static host', async () => {
            await expect(getResumeData('default')).rejects.toThrow('not available on static hosting');
        });

        it('getResumeEducation returns static data', async () => {
            const edu = { e1: { degree: 'BS', institution: 'X' } };
            fetchMock.mockResolvedValue(okJson(edu));
            const result = await getResumeEducation('r1');
            expect(result).toEqual(edu);
        });

        it('getResumeEducation returns {} when static fetch fails', async () => {
            fetchMock.mockResolvedValue(errJson(404, 'not found'));
            const result = await getResumeEducation('r1');
            expect(result).toEqual({});
        });

        it('updateResumeMeta throws and downloads patch', async () => {
            await expect(updateResumeMeta('r1', { displayName: 'X' })).rejects.toThrow('not available on static hosting');
        });

        it('updateResumeOtherSections throws and downloads patch', async () => {
            await expect(updateResumeOtherSections('r1', { summary: 'S' })).rejects.toThrow('not available on static hosting');
        });

        it('updateJob throws and downloads patch', async () => {
            await expect(updateJob('r1', 0, { role: 'X' })).rejects.toThrow('not available on static hosting');
        });

        it('updateResumeCategories throws and downloads patch', async () => {
            await expect(updateResumeCategories('r1', { cat1: { name: 'C', skillIDs: [] } })).rejects.toThrow('not available on static hosting');
        });

        it('updateResumeEducation throws and downloads patch', async () => {
            await expect(updateResumeEducation('r1', { e1: { degree: 'MS' } })).rejects.toThrow('not available on static hosting');
        });
    });
});
