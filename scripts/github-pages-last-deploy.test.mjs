import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    parseArgs,
    parseOwnerRepoFromRemoteUrl,
    formatRelativeTime,
    pickLatestSuccessStatus,
    findLastSuccessfulPagesDeployment,
    fetchCommitSummary,
    runCli,
} from './github-pages-last-deploy.mjs';

/** Minimal fetch Response stand-in. */
function jsonResponse(body, { ok = true, status = 200 } = {}) {
    return {
        ok,
        status,
        json: async () => body,
        text: async () => JSON.stringify(body),
    };
}

describe('github-pages-last-deploy', () => {
    beforeEach(() => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('parseArgs', () => {
        it('returns defaults when argv is empty', () => {
            expect(parseArgs([])).toEqual({ repo: null, tz: null, limit: 10, json: false, help: false });
        });

        it('parses --repo and --repo=owner/name', () => {
            expect(parseArgs(['--repo', 'acme/widget']).repo).toBe('acme/widget');
            expect(parseArgs(['--repo=acme/widget']).repo).toBe('acme/widget');
        });

        it('throws when --repo is missing its value', () => {
            expect(() => parseArgs(['--repo'])).toThrow(/--repo requires/);
        });

        it('parses --tz and --tz=Zone', () => {
            expect(parseArgs(['--tz', 'America/Denver']).tz).toBe('America/Denver');
            expect(parseArgs(['--tz=America/Denver']).tz).toBe('America/Denver');
        });

        it('throws when --tz is missing its value', () => {
            expect(() => parseArgs(['--tz'])).toThrow(/--tz requires/);
        });

        it('parses --limit as a positive integer', () => {
            expect(parseArgs(['--limit', '5']).limit).toBe(5);
        });

        it('throws on a non-positive or non-numeric --limit', () => {
            expect(() => parseArgs(['--limit', '0'])).toThrow(/--limit requires/);
            expect(() => parseArgs(['--limit', 'abc'])).toThrow(/--limit requires/);
        });

        it('parses --json, --help, and -h', () => {
            expect(parseArgs(['--json']).json).toBe(true);
            expect(parseArgs(['--help']).help).toBe(true);
            expect(parseArgs(['-h']).help).toBe(true);
        });

        it('throws on an unknown argument', () => {
            expect(() => parseArgs(['--bogus'])).toThrow(/Unknown argument: --bogus/);
        });
    });

    describe('parseOwnerRepoFromRemoteUrl', () => {
        it('parses the HTTPS form with a .git suffix', () => {
            expect(parseOwnerRepoFromRemoteUrl('https://github.com/sbecker11/resume-flyer.git'))
                .toEqual({ owner: 'sbecker11', repo: 'resume-flyer' });
        });

        it('parses the HTTPS form without a .git suffix', () => {
            expect(parseOwnerRepoFromRemoteUrl('https://github.com/sbecker11/resume-flyer'))
                .toEqual({ owner: 'sbecker11', repo: 'resume-flyer' });
        });

        it('parses the HTTPS form with embedded credentials', () => {
            expect(parseOwnerRepoFromRemoteUrl('https://x-access-token:ghp_abc@github.com/sbecker11/resume-flyer.git'))
                .toEqual({ owner: 'sbecker11', repo: 'resume-flyer' });
        });

        it('parses the SSH form', () => {
            expect(parseOwnerRepoFromRemoteUrl('git@github.com:sbecker11/resume-flyer.git'))
                .toEqual({ owner: 'sbecker11', repo: 'resume-flyer' });
        });

        it('throws for a non-GitHub or malformed remote URL', () => {
            expect(() => parseOwnerRepoFromRemoteUrl('https://gitlab.com/sbecker11/resume-flyer.git'))
                .toThrow(/Could not parse owner\/repo/);
            expect(() => parseOwnerRepoFromRemoteUrl('')).toThrow(/Could not parse owner\/repo/);
        });
    });

    describe('formatRelativeTime', () => {
        const to = new Date('2026-11-05T12:00:00Z');

        it('returns "just now" for sub-second differences', () => {
            expect(formatRelativeTime(new Date('2026-11-05T11:59:59.900Z'), to)).toBe('just now');
        });

        it('pluralizes units correctly going backward in time', () => {
            expect(formatRelativeTime(new Date('2026-11-05T11:59:30Z'), to)).toBe('30 seconds ago');
            expect(formatRelativeTime(new Date('2026-11-05T11:55:00Z'), to)).toBe('5 minutes ago');
            expect(formatRelativeTime(new Date('2026-11-05T10:00:00Z'), to)).toBe('2 hours ago');
            expect(formatRelativeTime(new Date('2026-11-03T12:00:00Z'), to)).toBe('2 days ago');
        });

        it('keeps singular units at count 1', () => {
            expect(formatRelativeTime(new Date('2026-11-05T11:59:00Z'), to)).toBe('1 minute ago');
        });

        it('reports future timestamps with "from now"', () => {
            expect(formatRelativeTime(new Date('2026-11-05T12:05:00Z'), to)).toBe('5 minutes from now');
        });
    });

    describe('pickLatestSuccessStatus', () => {
        it('returns the first success entry', () => {
            const statuses = [
                { state: 'in_progress', created_at: '2026-11-05T12:00:00Z' },
                { state: 'success', created_at: '2026-11-05T11:59:00Z', environment_url: 'https://x.github.io/y/', target_url: 'https://x/run' },
            ];
            expect(pickLatestSuccessStatus(statuses)).toEqual({
                createdAt: '2026-11-05T11:59:00Z',
                environmentUrl: 'https://x.github.io/y/',
                targetUrl: 'https://x/run',
            });
        });

        it('returns null when there is no success entry', () => {
            expect(pickLatestSuccessStatus([{ state: 'failure', created_at: '2026-11-05T12:00:00Z' }])).toBeNull();
        });

        it('returns null for a non-array input', () => {
            expect(pickLatestSuccessStatus(null)).toBeNull();
            expect(pickLatestSuccessStatus(undefined)).toBeNull();
        });
    });

    describe('findLastSuccessfulPagesDeployment', () => {
        it('returns the first deployment whose statuses include a success', async () => {
            const fetchImpl = vi.fn(async (url) => {
                if (url.includes('/deployments?')) {
                    return jsonResponse([
                        { id: 2, sha: 'bbb', ref: 'master' },
                        { id: 1, sha: 'aaa', ref: 'master' },
                    ]);
                }
                if (url.includes('/deployments/2/statuses')) {
                    return jsonResponse([{ state: 'in_progress', created_at: '2026-11-05T12:00:00Z' }]);
                }
                if (url.includes('/deployments/1/statuses')) {
                    return jsonResponse([
                        { state: 'success', created_at: '2026-11-05T11:00:00Z', environment_url: 'https://sbecker11.github.io/resume-flyer/', target_url: 'https://x/run' },
                    ]);
                }
                throw new Error(`Unexpected URL: ${url}`);
            });
            const result = await findLastSuccessfulPagesDeployment(fetchImpl, { owner: 'sbecker11', repo: 'resume-flyer' });
            expect(result).toEqual({
                sha: 'aaa',
                ref: 'master',
                success: {
                    createdAt: '2026-11-05T11:00:00Z',
                    environmentUrl: 'https://sbecker11.github.io/resume-flyer/',
                    targetUrl: 'https://x/run',
                },
            });
        });

        it('returns null when no recent deployment has a success status', async () => {
            const fetchImpl = vi.fn(async (url) => {
                if (url.includes('/deployments?')) return jsonResponse([{ id: 1, sha: 'aaa', ref: 'master' }]);
                return jsonResponse([{ state: 'failure', created_at: '2026-11-05T12:00:00Z' }]);
            });
            const result = await findLastSuccessfulPagesDeployment(fetchImpl, { owner: 'sbecker11', repo: 'resume-flyer' });
            expect(result).toBeNull();
        });

        it('throws with context when the GitHub API responds with an error status', async () => {
            const fetchImpl = vi.fn(async () => jsonResponse({ message: 'Not Found' }, { ok: false, status: 404 }));
            await expect(findLastSuccessfulPagesDeployment(fetchImpl, { owner: 'sbecker11', repo: 'nope' }))
                .rejects.toThrow(/404/);
        });
    });

    describe('fetchCommitSummary', () => {
        it('returns the commit subject, author, and date on success', async () => {
            const fetchImpl = vi.fn(async () => jsonResponse({
                commit: { message: 'Fix things\n\nLonger body', author: { name: 'Shawn Becker', date: '2026-11-05T11:00:00Z' } },
            }));
            const result = await fetchCommitSummary(fetchImpl, { owner: 'sbecker11', repo: 'resume-flyer', sha: 'aaa' });
            expect(result).toEqual({ subject: 'Fix things', authorName: 'Shawn Becker', authorDate: '2026-11-05T11:00:00Z' });
        });

        it('returns null and reports instead of throwing when the fetch fails', async () => {
            const fetchImpl = vi.fn(async () => jsonResponse({}, { ok: false, status: 500 }));
            const result = await fetchCommitSummary(fetchImpl, { owner: 'sbecker11', repo: 'resume-flyer', sha: 'aaa' });
            expect(result).toBeNull();
            expect(console.error).toHaveBeenCalled();
        });
    });

    describe('runCli', () => {
        function makeFetchImpl({ deployments = [{ id: 1, sha: 'c6483421ffd36eebc58b88c5504214550d3babb9', ref: 'master' }], statuses, commit } = {}) {
            return vi.fn(async (url) => {
                if (url.includes('/deployments?')) return jsonResponse(deployments);
                if (url.includes('/statuses')) {
                    return jsonResponse(statuses ?? [
                        { state: 'success', created_at: '2026-11-05T18:51:05Z', environment_url: 'https://sbecker11.github.io/resume-flyer/', target_url: 'https://github.com/sbecker11/resume-flyer/actions/runs/1' },
                    ]);
                }
                if (url.includes('/commits/')) {
                    return jsonResponse(commit ?? { commit: { message: 'added more project urls', author: { name: 'Shawn Becker', date: '2026-11-05T18:50:00Z' } } });
                }
                throw new Error(`Unexpected URL: ${url}`);
            });
        }

        function makeIo(overrides = {}) {
            const lines = [];
            const errLines = [];
            return {
                log: (line) => lines.push(line),
                error: (line) => errLines.push(line),
                fetchImpl: makeFetchImpl(),
                getRemoteUrl: () => 'https://github.com/sbecker11/resume-flyer.git',
                env: {},
                now: () => new Date('2026-11-05T19:00:00Z'),
                lines,
                errLines,
                ...overrides,
            };
        }

        it('reports the last successful deployment in human-readable form', async () => {
            const io = makeIo();
            const code = await runCli([], io);
            expect(code).toBe(0);
            const output = io.lines.join('\n');
            expect(output).toContain('sbecker11/resume-flyer');
            expect(output).toContain('2026-11-05T18:51:05.000Z');
            expect(output).toContain('8 minutes ago');
            expect(output).toContain('master @ c648342');
            expect(output).toContain('added more project urls');
            expect(output).toContain('https://sbecker11.github.io/resume-flyer/');
        });

        it('emits structured JSON with --json', async () => {
            const io = makeIo();
            const code = await runCli(['--json'], io);
            expect(code).toBe(0);
            const parsed = JSON.parse(io.lines.join('\n'));
            expect(parsed).toMatchObject({
                repo: 'sbecker11/resume-flyer',
                deployedAt: '2026-11-05T18:51:05Z',
                ref: 'master',
                sha: 'c6483421ffd36eebc58b88c5504214550d3babb9',
                environmentUrl: 'https://sbecker11.github.io/resume-flyer/',
                commit: { subject: 'added more project urls' },
            });
        });

        it('adds a localized time line when --tz is given', async () => {
            const io = makeIo();
            const code = await runCli(['--tz', 'America/Denver'], io);
            expect(code).toBe(0);
            expect(io.lines.some((l) => l.includes('America/Denver'))).toBe(true);
        });

        it('reports and continues when --tz is not a valid IANA zone', async () => {
            const io = makeIo();
            const code = await runCli(['--tz', 'Not/AZone'], io);
            expect(code).toBe(0);
            expect(console.error).toHaveBeenCalled();
            expect(io.lines.some((l) => l.includes('Not/AZone'))).toBe(false);
        });

        it('uses --repo instead of the git remote when given', async () => {
            const io = makeIo({ getRemoteUrl: () => { throw new Error('should not be called'); } });
            const code = await runCli(['--repo', 'acme/widget'], io);
            expect(code).toBe(0);
            expect(io.lines.join('\n')).toContain('acme/widget');
        });

        it('returns 2 for a malformed --repo', async () => {
            const io = makeIo();
            const code = await runCli(['--repo', 'not-owner-slash-repo'], io);
            expect(code).toBe(2);
            expect(io.errLines.join('\n')).toMatch(/--repo must be/);
        });

        it('returns 2 and prints usage for an unknown argument', async () => {
            const io = makeIo();
            const code = await runCli(['--bogus'], io);
            expect(code).toBe(2);
            expect(io.errLines.join('\n')).toMatch(/^Usage:/m);
        });

        it('returns 0 and prints usage for --help without touching the network', async () => {
            const io = makeIo({ fetchImpl: vi.fn(async () => { throw new Error('should not be called'); }) });
            const code = await runCli(['--help'], io);
            expect(code).toBe(0);
            expect(io.lines.join('\n')).toMatch(/^Usage:/m);
        });

        it('returns 2 when the git remote cannot be resolved and no --repo is given', async () => {
            const io = makeIo({ getRemoteUrl: () => { throw new Error('not a git repo'); } });
            const code = await runCli([], io);
            expect(code).toBe(2);
            expect(console.error).toHaveBeenCalled();
        });

        it('returns 1 with a helpful message when no deployment has succeeded', async () => {
            const io = makeIo({
                fetchImpl: vi.fn(async (url) => {
                    if (url.includes('/deployments?')) return jsonResponse([{ id: 1, sha: 'aaa', ref: 'master' }]);
                    return jsonResponse([{ state: 'failure', created_at: '2026-11-05T12:00:00Z' }]);
                }),
            });
            const code = await runCli([], io);
            expect(code).toBe(1);
            expect(io.errLines.join('\n')).toMatch(/No successful "github-pages" deployment/);
        });

        it('returns 1 when the GitHub API call fails', async () => {
            const io = makeIo({ fetchImpl: vi.fn(async () => { throw new Error('network down'); }) });
            const code = await runCli([], io);
            expect(code).toBe(1);
            expect(console.error).toHaveBeenCalled();
        });

        it('sends an Authorization header when GITHUB_TOKEN is set', async () => {
            const seenHeaders = [];
            const fetchImpl = vi.fn(async (url, opts) => {
                seenHeaders.push(opts?.headers);
                if (url.includes('/deployments?')) return jsonResponse([{ id: 1, sha: 'aaa', ref: 'master' }]);
                if (url.includes('/statuses')) return jsonResponse([{ state: 'success', created_at: '2026-11-05T12:00:00Z' }]);
                return jsonResponse({ commit: { message: 'x', author: {} } });
            });
            const io = makeIo({ fetchImpl, env: { GITHUB_TOKEN: 'ghp_test123' } });
            await runCli([], io);
            expect(seenHeaders.some((h) => h?.Authorization === 'Bearer ghp_test123')).toBe(true);
        });
    });
});
