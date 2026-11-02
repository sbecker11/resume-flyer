import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    LOCAL_DEV_QUIT_ENV,
    LOCAL_DEV_QUIT_PATH,
    assertLocalDevStopScript,
    createLocalDevQuitHandler,
    isAllowedFetchSite,
    isAllowedQuitOrigin,
    isLocalDevQuitEnabled,
    isLocalHostname,
    isLoopbackAddress,
    spawnLocalDevStop,
} from './localDevQuit.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function mockReq({
    remote = '127.0.0.1',
    origin = 'http://localhost:5174',
    site = 'same-origin',
    header = '1',
} = {}) {
    const headers = {
        origin,
        'sec-fetch-site': site,
        'x-resume-flyer-local-quit': header,
    };
    return {
        socket: { remoteAddress: remote },
        headers,
        get(name) {
            return headers[String(name).toLowerCase()];
        },
    };
}

function mockRes() {
    const finish = [];
    return {
        statusCode: null,
        body: null,
        finishCount: 0,
        once(event, fn) {
            if (event === 'finish') finish.push(fn);
        },
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            if (this.statusCode === 202) {
                this.finishCount += 1;
                finish.forEach((fn) => fn());
                finish.forEach((fn) => fn());
            }
            return this;
        },
    };
}

function enabledHandler(overrides = {}) {
    const spawnCalls = [];
    const spawnImpl = overrides.spawnImpl || ((cmd, args, opts) => {
        spawnCalls.push({ cmd, args, opts });
        return { unref: vi.fn(), on: vi.fn() };
    });
    const handler = createLocalDevQuitHandler({
        getEnv: () => ({ [LOCAL_DEV_QUIT_ENV]: '1' }),
        projectRoot: repoRoot,
        spawnImpl,
        schedule: (fn) => fn(),
        report: overrides.report || vi.fn(),
        ...overrides,
        spawnImpl,
    });
    return { handler, spawnCalls, spawnImpl };
}

describe('localDevQuit guards', () => {
    it('accepts only loopback peers', () => {
        expect(isLoopbackAddress('127.0.0.1')).toBe(true);
        expect(isLoopbackAddress('::ffff:127.0.0.1')).toBe(true);
        expect(isLoopbackAddress('::1')).toBe(true);
        expect(isLoopbackAddress('192.168.1.20')).toBe(false);
        expect(isLoopbackAddress('')).toBe(false);
        expect(isLoopbackAddress(null)).toBe(false);
    });

    it('enables quit only for the local-dev flag', () => {
        expect(isLocalDevQuitEnabled({ [LOCAL_DEV_QUIT_ENV]: '1' })).toBe(true);
        expect(isLocalDevQuitEnabled({ [LOCAL_DEV_QUIT_ENV]: 'true' })).toBe(false);
        expect(isLocalDevQuitEnabled({})).toBe(false);
        expect(isLocalDevQuitEnabled(null)).toBe(false);
    });

    it('allows only local origins and same-site fetches', () => {
        expect(isLocalHostname('localhost')).toBe(true);
        expect(isLocalHostname('[::1]')).toBe(true);
        expect(isLocalHostname('evil.example')).toBe(false);
        expect(isLocalHostname('')).toBe(false);
        expect(isAllowedQuitOrigin(undefined)).toBe(true);
        expect(isAllowedQuitOrigin('')).toBe(true);
        expect(isAllowedQuitOrigin('http://localhost:5174')).toBe(true);
        expect(isAllowedQuitOrigin('http://127.0.0.1:3001')).toBe(true);
        expect(isAllowedQuitOrigin('https://[::1]:5174')).toBe(true);
        expect(isAllowedQuitOrigin('null')).toBe(false);
        expect(isAllowedQuitOrigin('not a url')).toBe(false);
        expect(isAllowedQuitOrigin('http://evil.example')).toBe(false);
        expect(isAllowedQuitOrigin('ftp://localhost')).toBe(false);
        expect(isAllowedFetchSite(undefined)).toBe(true);
        expect(isAllowedFetchSite('')).toBe(true);
        expect(isAllowedFetchSite('same-origin')).toBe(true);
        expect(isAllowedFetchSite('same-site')).toBe(true);
        expect(isAllowedFetchSite('none')).toBe(true);
        expect(isAllowedFetchSite('cross-site')).toBe(false);
    });
});

describe('spawnLocalDevStop', () => {
    it('invokes zsh on this checkout stop script without executing it', () => {
        const calls = [];
        const child = { unref: vi.fn(), on: vi.fn() };
        const returned = spawnLocalDevStop(repoRoot, (cmd, args, opts) => {
            calls.push({ cmd, args, opts });
            return child;
        });
        expect(returned).toBe(child);
        expect(calls).toEqual([{
            cmd: '/bin/zsh',
            args: [path.join(repoRoot, 'scripts', 'restart-local.sh'), '--stop-only'],
            opts: { cwd: repoRoot, detached: true, stdio: 'ignore' },
        }]);
        expect(child.unref).toHaveBeenCalledTimes(1);
        expect(fs.readFileSync(calls[0].args[0], 'utf8')).toContain('--stop-only');
    });

    it('reports a spawn error and does not require unref', () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const handlers = {};
        spawnLocalDevStop(repoRoot, () => ({
            on(event, fn) { handlers[event] = fn; },
        }));
        expect(() => handlers.error(new Error('zsh missing'))).toThrow('zsh missing');
        expect(errorSpy).toHaveBeenCalled();
        expect(String(errorSpy.mock.calls[0][0])).toMatch(/Stop script failed to spawn/);
        expect(logSpy).toHaveBeenCalledWith('Remedy: Dev servers were not stopped');
        errorSpy.mockRestore();
        logSpy.mockRestore();
    });

    it('throws when the stop script is missing and does not spawn', () => {
        const spawnImpl = vi.fn();
        expect(() => spawnLocalDevStop('/tmp/resume-flyer-quit-missing', spawnImpl)).toThrow(/Stop script not found/);
        expect(spawnImpl).not.toHaveBeenCalled();
        expect(() => assertLocalDevStopScript('/tmp/resume-flyer-quit-missing')).toThrow(/Stop script not found/);
    });

    it('tolerates a spawn result with no child handle', () => {
        expect(spawnLocalDevStop(repoRoot, () => undefined)).toBeUndefined();
    });
});

describe('POST /api/local-dev/quit', () => {
    afterEach(() => {
        delete process.env[LOCAL_DEV_QUIT_ENV];
    });

    it('refuses when the process is not the local dev server', () => {
        delete process.env[LOCAL_DEV_QUIT_ENV];
        const spawnImpl = vi.fn();
        const handler = createLocalDevQuitHandler({
            getEnv: () => ({}),
            spawnImpl,
        });
        const res = mockRes();
        handler(mockReq(), res);
        expect(res.statusCode).toBe(404);
        expect(res.body.error).toMatch(/not the local resume-flyer dev server/);
        expect(spawnImpl).not.toHaveBeenCalled();
    });

    it('refuses a non-loopback peer', () => {
        const { handler, spawnCalls } = enabledHandler();
        const res = mockRes();
        handler(mockReq({ remote: '10.1.2.3' }), res);
        expect(res.statusCode).toBe(403);
        expect(res.body.error).toMatch(/this machine/);
        const missingSocket = mockRes();
        handler({}, missingSocket);
        expect(missingSocket.statusCode).toBe(403);
        expect(spawnCalls).toHaveLength(0);
    });

    it('refuses a cross-site origin, fetch site, or missing app header', () => {
        const { handler, spawnCalls } = enabledHandler();
        const originRes = mockRes();
        handler(mockReq({ origin: 'https://evil.example' }), originRes);
        expect(originRes.statusCode).toBe(403);

        const siteRes = mockRes();
        handler(mockReq({ site: 'cross-site' }), siteRes);
        expect(siteRes.statusCode).toBe(403);

        const headerRes = mockRes();
        handler(mockReq({ header: '' }), headerRes);
        expect(headerRes.statusCode).toBe(403);
        expect(headerRes.body.error).toMatch(/not made by the local/);
        expect(spawnCalls).toHaveLength(0);
    });

    it('reports a missing stop script and does not claim success', () => {
        const reports = [];
        const handler = createLocalDevQuitHandler({
            getEnv: () => ({ [LOCAL_DEV_QUIT_ENV]: '1' }),
            projectRoot: '/tmp/resume-flyer-quit-missing',
            spawnImpl: () => { throw new Error('should not spawn'); },
            schedule: (fn) => fn(),
            report: (...args) => reports.push(args),
        });
        const res = mockRes();
        handler(mockReq(), res);
        expect(res.statusCode).toBe(500);
        expect(res.body.error).toMatch(/stop script is missing/);
        expect(reports[0][1]).toMatch(/Cannot stop this checkout/);
        expect(reports[0][2]).toMatch(/not stopping/);
    });

    it('accepts a local request and invokes the stop command once', () => {
        const { handler, spawnCalls } = enabledHandler();
        const res = mockRes();
        handler(mockReq({ remote: '::ffff:127.0.0.1', origin: undefined, site: undefined }), res);
        expect(res.statusCode).toBe(202);
        expect(res.body.ok).toBe(true);
        expect(res.body.message).toMatch(/Stopping the local resume-flyer/);
        expect(spawnCalls).toHaveLength(1);
        expect(spawnCalls[0].args[1]).toBe('--stop-only');
        expect(spawnCalls[0].opts.cwd).toBe(repoRoot);
        expect(res.finishCount).toBe(1);

        const headerOnly = mockRes();
        handler({
            socket: { remoteAddress: '::1' },
            headers: {
                origin: 'http://127.0.0.1:5174',
                'sec-fetch-site': 'same-site',
                'x-resume-flyer-local-quit': '1',
            },
        }, headerOnly);
        expect(headerOnly.statusCode).toBe(202);
        expect(spawnCalls).toHaveLength(2);
    });

    it('reports and rethrows when the stop command throws after accept', () => {
        const reports = [];
        const handler = createLocalDevQuitHandler({
            getEnv: () => ({ [LOCAL_DEV_QUIT_ENV]: '1' }),
            projectRoot: repoRoot,
            spawnImpl: () => { throw new Error('spawn failed'); },
            schedule: (fn) => {
                expect(() => fn()).toThrow('spawn failed');
            },
            report: (...args) => reports.push(args),
        });
        const res = mockRes();
        handler(mockReq(), res);
        expect(res.statusCode).toBe(202);
        expect(reports[0][1]).toMatch(/Failed to start checkout stop/);
        expect(reports[0][2]).toMatch(/were not stopped/);
    });

    it('stops if the response closes before finish', () => {
        const calls = [];
        let onClose;
        const handler = createLocalDevQuitHandler({
            getEnv: () => ({ [LOCAL_DEV_QUIT_ENV]: '1' }),
            projectRoot: repoRoot,
            spawnImpl: () => {
                calls.push('stop');
                return { unref() {}, on() {} };
            },
            schedule: (fn) => fn(),
        });
        const res = {
            statusCode: null,
            body: null,
            once(event, fn) {
                if (event === 'close') onClose = fn;
            },
            status(code) { this.statusCode = code; return this; },
            json(payload) {
                this.body = payload;
                onClose();
                onClose();
                return this;
            },
        };
        handler(mockReq(), res);
        expect(res.statusCode).toBe(202);
        expect(calls).toEqual(['stop']);
    });

    it('stops even when the response object cannot emit finish', () => {
        const calls = [];
        const handler = createLocalDevQuitHandler({
            getEnv: () => ({ [LOCAL_DEV_QUIT_ENV]: '1' }),
            projectRoot: repoRoot,
            spawnImpl: (cmd, args) => {
                calls.push({ cmd, args });
                return { unref() {}, on() {} };
            },
            schedule: (fn) => fn(),
        });
        const res = {
            statusCode: null,
            body: null,
            status(code) { this.statusCode = code; return this; },
            json(payload) { this.body = payload; return this; },
        };
        handler(mockReq(), res);
        expect(res.statusCode).toBe(202);
        expect(calls).toHaveLength(1);
    });
});

describe('quit wiring', () => {
    it('mounts the route and start-dev sets the local-dev flag', () => {
        const serverSrc = fs.readFileSync(path.join(repoRoot, 'server.mjs'), 'utf8');
        const startSrc = fs.readFileSync(path.join(repoRoot, 'scripts', 'start-dev.mjs'), 'utf8');
        expect(serverSrc).toContain(`app.post('${LOCAL_DEV_QUIT_PATH}'`);
        expect(serverSrc).toContain('createLocalDevQuitHandler');
        expect(startSrc).toContain(`${LOCAL_DEV_QUIT_ENV}: '1'`);
        const stopSrc = fs.readFileSync(path.join(repoRoot, 'scripts', 'restart-local.sh'), 'utf8');
        expect(stopSrc).toContain('*"scripts/start-dev.mjs"*');
        expect(stopSrc).toContain('--stop-only');
        expect(stopSrc).toContain('ensure_node_on_path');
        expect(stopSrc).toContain('NVM_DIR');
        expect(stopSrc).not.toContain('tell application "Terminal"');
        expect(stopSrc).not.toContain('osascript');
    });
});
