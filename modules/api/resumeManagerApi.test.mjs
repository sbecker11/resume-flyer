// modules/api/resumeManagerApi.test.mjs
// Comprehensive unit tests for resume manager API client

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    listResumes,
    uploadResume,
    uploadResumeWithParserStream,
    getResumeData,
    deleteResume,
    reparseResume,
    reparseResumeWithParserStream,
    updateJobSkills,
    updateEducationJobSkills,
    renameSkill,
    mergeSkill,
    getResumeOtherSections,
    getResumeEducation
} from './resumeManagerApi.mjs';
import { mergeJobsWithEducation, toJobsArray } from '@/modules/data/mergeEducationIntoJobs.mjs';
import { enrichJobsWithSkills } from '@/modules/data/enrichedJobs.mjs';

describe('resumeManagerApi', () => {
    let fetchMock;
    let consoleErrorSpy;

    beforeEach(() => {
        // Mock console.error to avoid test output noise
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        // Mock global fetch
        fetchMock = vi.fn();
        global.fetch = fetchMock;
        if (typeof global.window !== 'undefined') {
            global.window.hasServer = () => true;
        }
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('listResumes', () => {
        it('should successfully fetch list of resumes', async () => {
            const mockResumes = [
                { id: 'resume-1', displayName: 'Resume 1' },
                { id: 'resume-2', displayName: 'Resume 2' }
            ];

            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => mockResumes
            });

            const result = await listResumes();

            expect(result).toEqual(mockResumes);
            expect(fetchMock).toHaveBeenCalledWith('/api/resumes', expect.any(Object));
        });

        it('should handle HTTP error responses', async () => {
            fetchMock.mockResolvedValue({
                ok: false,
                status: 500,
                statusText: 'Internal Server Error',
                json: async () => ({ error: 'Database connection failed' }),
                text: async () => 'Database connection failed'
            });

            await expect(listResumes()).rejects.toThrow('Database connection failed');
            expect(consoleErrorSpy).toHaveBeenCalled();
        });

        it('should handle HTTP error without custom error message', async () => {
            fetchMock.mockResolvedValue({
                ok: false,
                status: 404,
                statusText: 'Not Found',
                json: async () => ({}),
                text: async () => ''
            });

            await expect(listResumes()).rejects.toThrow('HTTP 404: Not Found');
        });

        it('should handle network errors', async () => {
            fetchMock.mockRejectedValue(new Error('Network failure'));

            await expect(listResumes()).rejects.toThrow('Network failure');
            expect(consoleErrorSpy).toHaveBeenCalled();
        });

        it('should handle JSON parse errors in response', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => {
                    throw new SyntaxError('Unexpected token');
                }
            });

            await expect(listResumes()).rejects.toThrow('Unexpected token');
        });

        it('falls back to static index when API returns 404', async () => {
            const staticIdx = [{ id: 'r1', displayName: 'R1' }];
            fetchMock
                .mockResolvedValueOnce({ ok: false, status: 404, statusText: 'Not Found', text: async () => '', json: async () => ({}) })
                .mockResolvedValueOnce({ ok: true, json: async () => staticIdx });
            const result = await listResumes();
            expect(result).toEqual(staticIdx);
        });
    });

    describe('uploadResume', () => {
        let xhrInstance;

        beforeEach(() => {
            // Mock XMLHttpRequest
            xhrInstance = {
                open: vi.fn(),
                send: vi.fn(),
                addEventListener: vi.fn(),
                upload: {
                    addEventListener: vi.fn()
                },
                status: 200,
                responseText: JSON.stringify({ id: 'resume-123', success: true })
            };

            // Create a proper constructor mock
            global.XMLHttpRequest = class MockXMLHttpRequest {
                constructor() {
                    return xhrInstance;
                }
            };

            global.FormData = class FormData {
                constructor() {
                    this.data = new Map();
                }
                append(key, value) {
                    this.data.set(key, value);
                }
            };
        });

        it('should throw error if no file or URL provided', async () => {
            await expect(uploadResume(null)).rejects.toThrow('No file or URL provided');
            await expect(uploadResume(undefined)).rejects.toThrow('No file or URL provided');
        });

        it('should validate URL format', async () => {
            await expect(uploadResume('not-a-url')).rejects.toThrow('Invalid URL: must start with http:// or https://');
            await expect(uploadResume('ftp://example.com/file.pdf')).rejects.toThrow('Invalid URL');
        });

        it('should validate file extensions', async () => {
            const invalidFile = { name: 'resume.txt' };
            await expect(uploadResume(invalidFile)).rejects.toThrow('Only .docx and .pdf files are supported');
        });

        it('should upload resume from URL successfully', async () => {
            const testUrl = 'https://example.com/resume.pdf';

            // Trigger load event after send
            xhrInstance.send.mockImplementation(() => {
                const loadHandler = xhrInstance.addEventListener.mock.calls.find(
                    call => call[0] === 'load'
                )[1];
                loadHandler();
            });

            const result = await uploadResume(testUrl);

            expect(result).toEqual({ id: 'resume-123', success: true });
            expect(xhrInstance.open).toHaveBeenCalledWith('POST', '/api/resumes/upload');
            expect(xhrInstance.send).toHaveBeenCalled();
        });

        it('should upload resume file successfully', async () => {
            const testFile = { name: 'resume.docx' };

            xhrInstance.send.mockImplementation(() => {
                const loadHandler = xhrInstance.addEventListener.mock.calls.find(
                    call => call[0] === 'load'
                )[1];
                loadHandler();
            });

            const result = await uploadResume(testFile);

            expect(result).toEqual({ id: 'resume-123', success: true });
        });

        it('should upload PDF file successfully', async () => {
            const testFile = { name: 'resume.pdf' };

            xhrInstance.send.mockImplementation(() => {
                const loadHandler = xhrInstance.addEventListener.mock.calls.find(
                    call => call[0] === 'load'
                )[1];
                loadHandler();
            });

            const result = await uploadResume(testFile);

            expect(result).toEqual({ id: 'resume-123', success: true });
        });

        it('should include display name if provided', async () => {
            const testFile = { name: 'resume.docx' };

            xhrInstance.send.mockImplementation((formData) => {
                expect(formData.data.get('displayName')).toBe('My Resume');
                const loadHandler = xhrInstance.addEventListener.mock.calls.find(
                    call => call[0] === 'load'
                )[1];
                loadHandler();
            });

            await uploadResume(testFile, 'My Resume');
        });

        it('should track upload progress', async () => {
            const testFile = { name: 'resume.docx' };
            const progressCallback = vi.fn();

            xhrInstance.send.mockImplementation(() => {
                // Trigger progress event
                const progressHandler = xhrInstance.upload.addEventListener.mock.calls.find(
                    call => call[0] === 'progress'
                )[1];
                progressHandler({ lengthComputable: true, loaded: 50, total: 100 });

                // Trigger load event
                const loadHandler = xhrInstance.addEventListener.mock.calls.find(
                    call => call[0] === 'load'
                )[1];
                loadHandler();
            });

            await uploadResume(testFile, null, progressCallback);

            expect(progressCallback).toHaveBeenCalledWith(50);
        });

        it('should handle non-computable progress', async () => {
            const testFile = { name: 'resume.docx' };
            const progressCallback = vi.fn();

            xhrInstance.send.mockImplementation(() => {
                const progressHandler = xhrInstance.upload.addEventListener.mock.calls.find(
                    call => call[0] === 'progress'
                )[1];
                progressHandler({ lengthComputable: false });

                const loadHandler = xhrInstance.addEventListener.mock.calls.find(
                    call => call[0] === 'load'
                )[1];
                loadHandler();
            });

            await uploadResume(testFile, null, progressCallback);

            expect(progressCallback).not.toHaveBeenCalled();
        });

        it('should handle HTTP error with error details', async () => {
            const testFile = { name: 'resume.docx' };
            xhrInstance.status = 400;
            xhrInstance.responseText = JSON.stringify({
                error: 'Invalid file format',
                details: 'File is corrupted'
            });

            xhrInstance.send.mockImplementation(() => {
                const loadHandler = xhrInstance.addEventListener.mock.calls.find(
                    call => call[0] === 'load'
                )[1];
                loadHandler();
            });

            await expect(uploadResume(testFile)).rejects.toThrow('Invalid file format\n\nDetails: File is corrupted');
        });

        it('should handle HTTP error without error details', async () => {
            const testFile = { name: 'resume.docx' };
            xhrInstance.status = 500;
            xhrInstance.responseText = JSON.stringify({});

            xhrInstance.send.mockImplementation(() => {
                const loadHandler = xhrInstance.addEventListener.mock.calls.find(
                    call => call[0] === 'load'
                )[1];
                loadHandler();
            });

            await expect(uploadResume(testFile)).rejects.toThrow('Upload failed with status 500');
        });

        it('should handle JSON parse error in error response', async () => {
            const testFile = { name: 'resume.docx' };
            xhrInstance.status = 500;
            xhrInstance.responseText = 'Invalid JSON';

            xhrInstance.send.mockImplementation(() => {
                const loadHandler = xhrInstance.addEventListener.mock.calls.find(
                    call => call[0] === 'load'
                )[1];
                loadHandler();
            });

            await expect(uploadResume(testFile)).rejects.toThrow('Upload failed with status 500');
        });

        it('should handle JSON parse error in success response', async () => {
            const testFile = { name: 'resume.docx' };
            xhrInstance.status = 200;
            xhrInstance.responseText = 'Invalid JSON';

            xhrInstance.send.mockImplementation(() => {
                const loadHandler = xhrInstance.addEventListener.mock.calls.find(
                    call => call[0] === 'load'
                )[1];
                loadHandler();
            });

            await expect(uploadResume(testFile)).rejects.toThrow('Failed to parse server response');
        });

        it('should handle network error', async () => {
            const testFile = { name: 'resume.docx' };

            xhrInstance.send.mockImplementation(() => {
                const errorHandler = xhrInstance.addEventListener.mock.calls.find(
                    call => call[0] === 'error'
                )[1];
                errorHandler();
            });

            await expect(uploadResume(testFile)).rejects.toThrow('Network error during upload');
        });

        it('should handle upload abort', async () => {
            const testFile = { name: 'resume.docx' };

            xhrInstance.send.mockImplementation(() => {
                const abortHandler = xhrInstance.addEventListener.mock.calls.find(
                    call => call[0] === 'abort'
                )[1];
                abortHandler();
            });

            await expect(uploadResume(testFile)).rejects.toThrow('Upload aborted');
        });
    });

    describe('getResumeData', () => {
        it('should fetch default resume data', async () => {
            const mockData = {
                jobs: [{ id: 1, title: 'Developer' }],
                skills: [{ id: 1, name: 'JavaScript' }],
                categories: []
            };

            fetchMock
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => mockData
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({})
                });

            const result = await getResumeData('default');

            const merged = mergeJobsWithEducation(toJobsArray(mockData.jobs), {});
            const expectedJobs = enrichJobsWithSkills(merged, mockData.skills ?? {});
            expect(result.skills).toEqual(mockData.skills);
            expect(result.categories).toEqual(mockData.categories);
            expect(result.jobs.map((j) => j.toPlainObject())).toEqual(expectedJobs.map((j) => j.toPlainObject()));
            expect(fetchMock).toHaveBeenCalledWith('/api/resumes/default/data', expect.any(Object));
        });

        it('should fetch specific resume data', async () => {
            const mockData = {
                jobs: [{ id: 1, title: 'Manager' }],
                skills: [{ id: 1, name: 'Leadership' }],
                categories: []
            };

            fetchMock
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => mockData
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({})
                });

            const result = await getResumeData('resume-123');

            const merged = mergeJobsWithEducation(toJobsArray(mockData.jobs), {});
            const expectedJobs = enrichJobsWithSkills(merged, mockData.skills ?? {});
            expect(result.skills).toEqual(mockData.skills);
            expect(result.categories).toEqual(mockData.categories);
            expect(result.jobs.map((j) => j.toPlainObject())).toEqual(expectedJobs.map((j) => j.toPlainObject()));
            expect(fetchMock).toHaveBeenCalledWith('/api/resumes/resume-123/data', expect.any(Object));
        });

        it('should handle HTTP error with custom message', async () => {
            fetchMock.mockResolvedValue({
                ok: false,
                status: 404,
                statusText: 'Not Found',
                json: async () => ({ error: 'Resume not found' }),
                text: async () => 'Resume not found'
            });

            await expect(getResumeData('resume-999')).rejects.toThrow('Resume not found');
            expect(consoleErrorSpy).toHaveBeenCalled();
        });

        it('should handle HTTP error without custom message', async () => {
            fetchMock.mockResolvedValue({
                ok: false,
                status: 500,
                statusText: 'Internal Server Error',
                json: async () => ({}),
                text: async () => ''
            });

            await expect(getResumeData('resume-123')).rejects.toThrow('HTTP 500: Internal Server Error');
        });

        it('should handle network errors', async () => {
            fetchMock.mockRejectedValue(new Error('Connection timeout'));

            await expect(getResumeData('resume-123')).rejects.toThrow('Connection timeout');
            expect(consoleErrorSpy).toHaveBeenCalled();
        });

        it('should handle JSON parse errors', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => {
                    throw new SyntaxError('Invalid JSON');
                }
            });

            await expect(getResumeData('resume-123')).rejects.toThrow('Invalid JSON');
        });

        it('falls back to static data when API fails for non-default resume', async () => {
            const data = { jobs: [{ index: 0 }], skills: {}, categories: {} };
            fetchMock
                .mockRejectedValueOnce(new Error('Network error'))
                .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
                .mockResolvedValueOnce({ ok: true, json: async () => data.jobs })
                .mockResolvedValueOnce({ ok: true, json: async () => data.skills })
                .mockResolvedValueOnce({ ok: true, json: async () => data.categories })
                .mockResolvedValueOnce({ ok: true, json: async () => ({}) });
            const result = await getResumeData('resume-1');
            const merged = mergeJobsWithEducation(toJobsArray(data.jobs), {});
            const expectedJobs = enrichJobsWithSkills(merged, data.skills);
            expect(result.skills).toEqual(data.skills);
            expect(result.categories).toEqual(data.categories);
            expect(result.jobs.map((j) => j.toPlainObject())).toEqual(expectedJobs.map((j) => j.toPlainObject()));
        });

        it('getResumeOtherSections falls back to static when API fails', async () => {
            const sections = { summary: 'S', contact: {} };
            fetchMock
                .mockRejectedValueOnce(new Error('500'))
                .mockResolvedValueOnce({ ok: true, json: async () => sections });
            const result = await getResumeOtherSections('r1');
            expect(result).toEqual(sections);
        });
    });

    describe('deleteResume', () => {
        it('calls DELETE and returns JSON on success', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => ({ ok: true })
            });
            const out = await deleteResume('my-resume');
            expect(out).toEqual({ ok: true });
            expect(fetchMock).toHaveBeenCalledWith('/api/resumes/my-resume', { method: 'DELETE' });
        });

        it('encodes resume id in path', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => ({})
            });
            await deleteResume('a/b');
            expect(fetchMock).toHaveBeenCalledWith('/api/resumes/a%2Fb', { method: 'DELETE' });
        });

        it('throws with server error message when not ok', async () => {
            fetchMock.mockResolvedValue({
                ok: false,
                status: 403,
                json: async () => ({ error: 'Cannot delete' })
            });
            await expect(deleteResume('x')).rejects.toThrow('Cannot delete');
        });

        it('throws status-only when JSON body fails', async () => {
            fetchMock.mockResolvedValue({
                ok: false,
                status: 500,
                json: async () => {
                    throw new SyntaxError('bad');
                }
            });
            await expect(deleteResume('x')).rejects.toThrow('HTTP 500');
        });
    });

    describe('reparseResume', () => {
        it('calls POST /api/resumes/:id/reparse and returns JSON on success', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => ({ success: true, resumeId: 'r1' })
            });

            const out = await reparseResume('r1');
            expect(out).toEqual({ success: true, resumeId: 'r1' });

            expect(fetchMock).toHaveBeenCalledWith(
                '/api/resumes/r1/reparse',
                expect.objectContaining({
                    method: 'POST'
                })
            );
        });

        it('throws server error message when not ok', async () => {
            fetchMock.mockResolvedValue({
                ok: false,
                status: 500,
                json: async () => ({ error: 'Boom' })
            });
            await expect(reparseResume('r1')).rejects.toThrow('Boom');
        });

        it('throws status-only when JSON body fails', async () => {
            fetchMock.mockResolvedValue({
                ok: false,
                status: 500,
                json: async () => {
                    throw new SyntaxError('bad');
                }
            });
            await expect(reparseResume('r1')).rejects.toThrow('HTTP 500');
        });
    });

    describe('reparseResumeWithParserStream', () => {
        it('streams output/status and resolves done payload', async () => {
            const encoder = new TextEncoder();
            const sse =
                'event: status\n' +
                'data: Deleting derived files...\n\n' +
                'event: output\n' +
                'data: hello\n\n' +
                'event: done\n' +
                'data: {"success":true,"resumeId":"r1"}\n\n';

            let sseRead = 0;
            const reader = {
                read: vi.fn(async () => {
                    if (sseRead++ > 0) return { value: undefined, done: true };
                    return { value: encoder.encode(sse), done: false };
                }),
                cancel: vi.fn()
            };

            fetchMock.mockResolvedValue({
                ok: true,
                body: { getReader: () => reader }
            });

            const onStatus = vi.fn();
            const onOutput = vi.fn();
            const out = await reparseResumeWithParserStream('r1', { onStatus, onOutput });
            expect(out).toEqual({ success: true, resumeId: 'r1' });
            expect(onStatus).toHaveBeenCalledWith('Deleting derived files...');
            expect(onOutput).toHaveBeenCalledWith('hello');
        });

        it('rejects on error event', async () => {
            const encoder = new TextEncoder();
            const sse = 'event: error\n' + 'data: {"message":"Boom"}\n\n';

            let sseRead = 0;
            const reader = {
                read: vi.fn(async () => {
                    if (sseRead++ > 0) return { value: undefined, done: true };
                    return { value: encoder.encode(sse), done: false };
                }),
                cancel: vi.fn()
            };
            fetchMock.mockResolvedValue({ ok: true, body: { getReader: () => reader } });
            await expect(reparseResumeWithParserStream('r1')).rejects.toThrow('Boom');
        });
    });

    describe('updateJobSkills', () => {
        it('PATCHes skills without newSkills when array empty', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => ({ updated: true })
            });
            const r = await updateJobSkills('r1', 0, ['A', 'B']);
            expect(r).toEqual({ updated: true });
            expect(fetchMock).toHaveBeenCalledWith(
                '/api/resumes/r1/jobs/0/skills',
                expect.objectContaining({
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ skillIDs: ['A', 'B'] })
                })
            );
        });

        it('includes newSkills in body when provided', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => ({})
            });
            await updateJobSkills('r1', 2, ['X'], ['New Skill']);
            const [, init] = fetchMock.mock.calls[0];
            expect(JSON.parse(init.body)).toEqual({
                skillIDs: ['X'],
                newSkills: ['New Skill']
            });
        });

        it('throws on HTTP error', async () => {
            fetchMock.mockResolvedValue({ ok: false, status: 400 });
            await expect(updateJobSkills('r', 0, [])).rejects.toThrow('HTTP 400');
        });
    });

    describe('updateEducationJobSkills', () => {
        it('PATCHes education skills with encoded educationKey', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => ({ ok: true })
            });
            const r = await updateEducationJobSkills('r1', '0', ['A'], ['New']);
            expect(r).toEqual({ ok: true });
            expect(fetchMock).toHaveBeenCalledWith(
                '/api/resumes/r1/education/0/skills',
                expect.objectContaining({
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ skillIDs: ['A'], newSkills: ['New'] })
                })
            );
        });

        it('throws on HTTP error', async () => {
            fetchMock.mockResolvedValue({ ok: false, status: 404 });
            await expect(updateEducationJobSkills('r', 'k', [])).rejects.toThrow('HTTP 404');
        });
    });

    describe('renameSkill', () => {
        it('PATCHes rename and returns JSON', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => ({ ok: true })
            });
            const r = await renameSkill('rid', 'Old', 'New');
            expect(r).toEqual({ ok: true });
            expect(fetchMock).toHaveBeenCalledWith(
                '/api/resumes/rid/skills/rename',
                expect.objectContaining({
                    method: 'PATCH',
                    body: JSON.stringify({ oldKey: 'Old', newName: 'New' })
                })
            );
        });

        it('throws with err.error when not ok', async () => {
            fetchMock.mockResolvedValue({
                ok: false,
                status: 409,
                json: async () => ({ error: 'Name taken' })
            });
            await expect(renameSkill('r', 'a', 'b')).rejects.toThrow('Name taken');
        });

        it('throws HTTP status when json fails', async () => {
            fetchMock.mockResolvedValue({
                ok: false,
                status: 500,
                json: async () => {
                    throw new Error('fail');
                }
            });
            await expect(renameSkill('r', 'a', 'b')).rejects.toThrow('HTTP 500');
        });
    });

    describe('mergeSkill', () => {
        it('PATCHes merge and returns JSON', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => ({ merged: true })
            });
            const r = await mergeSkill('rid', 'JS', 'JavaScript');
            expect(r).toEqual({ merged: true });
            expect(fetchMock).toHaveBeenCalledWith(
                '/api/resumes/rid/skills/merge',
                expect.objectContaining({
                    body: JSON.stringify({ fromKey: 'JS', toKey: 'JavaScript' })
                })
            );
        });

        it('throws with err.error when not ok', async () => {
            fetchMock.mockResolvedValue({
                ok: false,
                status: 400,
                json: async () => ({ error: 'Invalid merge' })
            });
            await expect(mergeSkill('r', 'a', 'b')).rejects.toThrow('Invalid merge');
        });

        it('throws HTTP status when json fails', async () => {
            fetchMock.mockResolvedValue({
                ok: false,
                status: 502,
                json: async () => {
                    throw new Error('x');
                }
            });
            await expect(mergeSkill('r', 'a', 'b')).rejects.toThrow('HTTP 502');
        });
    });

    describe('getResumeOtherSections', () => {
        it('GETs other-sections and returns JSON', async () => {
            const payload = { contact: {}, title: 'T' };
            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => payload
            });
            const r = await getResumeOtherSections('resume-9');
            expect(r).toEqual(payload);
            expect(fetchMock).toHaveBeenCalledWith('/api/resumes/resume-9/other-sections', {});
        });

        it('encodes resume id', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => ({})
            });
            await getResumeOtherSections('a c');
            expect(fetchMock).toHaveBeenCalledWith('/api/resumes/a%20c/other-sections', {});
        });

        it('throws on HTTP error', async () => {
            fetchMock.mockResolvedValue({ ok: false, status: 404 });
            await expect(getResumeOtherSections('missing')).resolves.toEqual({});
        });
    });

    describe('uploadResumeWithParserStream', () => {
        it('streams SSE events and resolves on done', async () => {
            const onOutput = vi.fn();
            const onStatus = vi.fn();

            const encoder = new TextEncoder();
            // SSE events must end with a blank line (\n\n) for the parser to process them.
            const sse =
                'event: status\n' +
                'data: Preparing...\n\n' +
                'event: output\n' +
                'data: === resume-parser ===\n\n' +
                'event: output\n' +
                'data: Extracting text...\n\n' +
                'event: done\n' +
                'data: {"success":true,"resumeId":"r1","displayName":"R1","jobCount":1,"skillCount":0,"metadata":{}}\n\n';

            let idx = 0;
            const reader = {
                read: vi.fn(async () => {
                    if (idx++ === 0) return { value: encoder.encode(sse), done: false };
                    return { value: undefined, done: true };
                }),
                cancel: vi.fn()
            };

            fetchMock.mockResolvedValue({
                ok: true,
                body: {
                    getReader: () => reader
                }
            });

            const result = await uploadResumeWithParserStream('https://example.com/r.pdf', 'R1', { onOutput, onStatus });
            expect(result).toEqual({
                success: true,
                resumeId: 'r1',
                displayName: 'R1',
                jobCount: 1,
                skillCount: 0,
                metadata: {}
            });

            expect(onStatus).toHaveBeenCalledWith('Preparing...');
            expect(onOutput).toHaveBeenCalledWith('=== resume-parser ===');
            expect(onOutput).toHaveBeenCalledWith('Extracting text...');
        });

        it('rejects on error event', async () => {
            const encoder = new TextEncoder();
            const sse = 'event: error\n' + 'data: {"message":"Boom"}\n\n';

            let sseRead = 0;
            const reader = {
                read: vi.fn(async () => {
                    if (sseRead++ > 0) return { value: undefined, done: true };
                    return { value: encoder.encode(sse), done: false };
                }),
                cancel: vi.fn()
            };

            fetchMock.mockResolvedValue({
                ok: true,
                body: { getReader: () => reader }
            });

            await expect(
                uploadResumeWithParserStream('https://example.com/r.pdf', 'R1')
            ).rejects.toThrow('Boom');
        });
    });

    describe('getResumeEducation', () => {
        it('fetches education from API when hasServer is true', async () => {
            const edu = { e1: { degree: 'BS', institution: 'X' } };
            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => edu
            });
            const result = await getResumeEducation('resume-1');
            expect(result).toEqual(edu);
        });

        it('falls back to static education.json when API fails', async () => {
            const edu = { e1: { degree: 'BS', institution: 'X' } };
            fetchMock
                .mockResolvedValueOnce({
                    ok: false,
                    status: 404,
                    statusText: 'Not Found',
                    text: async () => ''
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => edu
                });
            const result = await getResumeEducation('resume-1');
            expect(result).toEqual(edu);
        });
    });

    describe('error logging', () => {
        it('should log errors with context in listResumes', async () => {
            fetchMock.mockRejectedValue(new Error('Test error'));

            await expect(listResumes()).rejects.toThrow();

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                expect.stringContaining('[ResumeManagerAPI] Failed to list resumes'),
                expect.any(Error)
            );
        });

        it('should log errors with context in uploadResume', async () => {
            await expect(uploadResume(null)).rejects.toThrow();

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                '[ResumeManagerAPI] Failed to upload resume:',
                expect.any(Error)
            );
        });

        it('should log errors with resume ID in getResumeData', async () => {
            fetchMock.mockRejectedValue(new Error('Test error'));

            await expect(getResumeData('resume-123')).rejects.toThrow();

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                expect.stringContaining('[ResumeManagerAPI] Failed to get resume data for resume-123:'),
                expect.any(Error)
            );
        });
    });

    describe('when hasServer() is false (static host)', () => {
        let listResumesStatic;
        let uploadResumeStatic;
        let uploadResumeWithParserStreamStatic;
        let getResumeDataStatic;
        let deleteResumeStatic;
        let updateJobSkillsStatic;
        let updateEducationJobSkillsStatic;
        let renameSkillStatic;
        let mergeSkillStatic;
        let getResumeOtherSectionsStatic;
        let getResumeEducationStatic;

        beforeEach(async () => {
            vi.resetModules();

            // Simulate GitHub Pages / static hosting.
            Object.defineProperty(window, 'location', {
                value: { origin: 'https://user.github.io' },
                configurable: true,
                writable: true
            });

            const api = await import('./resumeManagerApi.mjs');
            listResumesStatic = api.listResumes;
            uploadResumeStatic = api.uploadResume;
            uploadResumeWithParserStreamStatic = api.uploadResumeWithParserStream;
            getResumeDataStatic = api.getResumeData;
            deleteResumeStatic = api.deleteResume;
            updateJobSkillsStatic = api.updateJobSkills;
            updateEducationJobSkillsStatic = api.updateEducationJobSkills;
            renameSkillStatic = api.renameSkill;
            mergeSkillStatic = api.mergeSkill;
            getResumeOtherSectionsStatic = api.getResumeOtherSections;
            getResumeEducationStatic = api.getResumeEducation;
        });

        it('listResumes fetches static index and returns resumes', async () => {
            const idx = [{ id: 'r1', displayName: 'R1' }];
            fetchMock.mockResolvedValue({ ok: true, json: async () => idx });
            const result = await listResumesStatic();
            expect(result).toEqual(idx);
            expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('parsed_resumes/non-local-resumes.json'), expect.any(Object));
        });

        it('listResumes throws when static index fails', async () => {
            fetchMock.mockRejectedValue(new Error('Net error'));
            await expect(listResumesStatic()).rejects.toThrow('Net error');
        });

        it('deleteResume throws', async () => {
            await expect(deleteResumeStatic('r1')).rejects.toThrow('not available on static hosting');
        });

        it('uploadResume throws', async () => {
            await expect(uploadResumeStatic('https://example.com/r.pdf')).rejects.toThrow('not available on static hosting');
        });

        it('uploadResumeWithParserStream throws', async () => {
            await expect(
                uploadResumeWithParserStreamStatic('https://example.com/r.pdf', 'R1')
            ).rejects.toThrow('Upload is not available on static hosting');
        });

        it('getResumeData returns static data for non-default resume', async () => {
            const jobs = [];
            const skills = {};
            const categories = {};
            fetchMock
                .mockResolvedValueOnce({ ok: true, json: async () => jobs })
                .mockResolvedValueOnce({ ok: true, json: async () => skills })
                .mockResolvedValueOnce({ ok: true, json: async () => categories })
                .mockResolvedValueOnce({ ok: true, json: async () => ({}) });
            const result = await getResumeDataStatic('resume-1');
            const merged = mergeJobsWithEducation(toJobsArray(jobs), {});
            const expectedJobs = enrichJobsWithSkills(merged, skills);
            expect(result.skills).toEqual(skills);
            expect(result.categories).toEqual(categories);
            expect(result.jobs.map((j) => j.toPlainObject())).toEqual(expectedJobs.map((j) => j.toPlainObject()));
        });

        it('getResumeData throws for default resume on static host', async () => {
            await expect(getResumeDataStatic('default')).rejects.toThrow('Default resume is not available on static hosting');
        });

        it('getResumeOtherSections fetches static JSON', async () => {
            const sections = { summary: 'Hi', contact: {} };
            fetchMock.mockResolvedValue({ ok: true, json: async () => sections });
            const result = await getResumeOtherSectionsStatic('r1');
            expect(result).toEqual(sections);
        });

        it('getResumeEducation fetches static JSON', async () => {
            const edu = { e1: { degree: 'BS', institution: 'X' } };
            fetchMock.mockResolvedValue({ ok: true, json: async () => edu });
            const result = await getResumeEducationStatic('r1');
            expect(result).toEqual(edu);
        });

        it('getResumeEducation returns {} when static education.json fetch fails', async () => {
            fetchMock.mockResolvedValue({ ok: false, status: 404 });
            const result = await getResumeEducationStatic('r1');
            expect(result).toEqual({});
        });

        it('updateJobSkills throws', async () => {
            await expect(updateJobSkillsStatic('r1', 0, ['s1'])).rejects.toThrow('not available on static hosting');
        });

        it('updateEducationJobSkills throws', async () => {
            await expect(updateEducationJobSkillsStatic('r1', '0', ['s1'])).rejects.toThrow('not available on static hosting');
        });

        it('renameSkill throws', async () => {
            await expect(renameSkillStatic('r1', 'old', 'New')).rejects.toThrow('not available on static hosting');
        });

        it('mergeSkill throws', async () => {
            await expect(mergeSkillStatic('r1', 'A', 'B')).rejects.toThrow('not available on static hosting');
        });
    });
});
