// modules/api/resumeManagerApi.test.mjs
// Comprehensive unit tests for resume manager API client

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/modules/core/hasServer.mjs', () => ({ hasServer: () => true }));

import { listResumes, uploadResume, getResumeData } from './resumeManagerApi.mjs';

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

            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => mockData
            });

            const result = await getResumeData('default');

            expect(result).toEqual(mockData);
            expect(fetchMock).toHaveBeenCalledWith('/api/resumes/default/data', expect.any(Object));
        });

        it('should fetch specific resume data', async () => {
            const mockData = {
                jobs: [{ id: 1, title: 'Manager' }],
                skills: [{ id: 1, name: 'Leadership' }],
                categories: []
            };

            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => mockData
            });

            const result = await getResumeData('resume-123');

            expect(result).toEqual(mockData);
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
});
