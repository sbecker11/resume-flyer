import { describe, it, expect, vi } from 'vitest';
import {
    LOCAL_DEV_QUIT_CONFIRM_MESSAGE,
    LOCAL_DEV_QUIT_HEADER,
    LOCAL_DEV_QUIT_PATH,
    quitNeedsServerConfirm,
    requestLocalDevQuit,
} from './localDevQuit.mjs';

function jsonResponse({ ok = true, status = 200, body = {} } = {}) {
    return {
        ok,
        status,
        json: vi.fn(async () => body),
    };
}

describe('quitNeedsServerConfirm', () => {
    it('asks only when a local server would actually be stopped', () => {
        expect(quitNeedsServerConfirm(() => true)).toBe(true);
        expect(quitNeedsServerConfirm(() => false)).toBe(false);
        expect(quitNeedsServerConfirm(null)).toBe(false);
        expect(LOCAL_DEV_QUIT_CONFIRM_MESSAGE).toMatch(/local API/);
        expect(LOCAL_DEV_QUIT_CONFIRM_MESSAGE).toMatch(/Vite dev server/);
        expect(LOCAL_DEV_QUIT_CONFIRM_MESSAGE).toMatch(/this app/);
    });
});

describe('requestLocalDevQuit', () => {
    it('fails clearly and does not fetch when there is no local server', async () => {
        const fetchImpl = vi.fn();
        await expect(requestLocalDevQuit({
            fetchImpl,
            hasServerImpl: () => false,
        })).rejects.toThrow(/no local dev server/);
        await expect(requestLocalDevQuit({
            fetchImpl,
            hasServerImpl: null,
        })).rejects.toThrow(/Nothing was stopped/);
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('fails clearly when fetch is unavailable', async () => {
        await expect(requestLocalDevQuit({
            fetchImpl: null,
            hasServerImpl: () => true,
        })).rejects.toThrow(/fetch is not available/);
    });

    it('posts the local quit header and returns the acceptance body', async () => {
        const response = jsonResponse({
            status: 202,
            body: { ok: true, message: 'Stopping the local resume-flyer dev servers for this checkout.' },
        });
        const fetchImpl = vi.fn(async () => response);
        const result = await requestLocalDevQuit({
            fetchImpl,
            hasServerImpl: () => true,
        });
        expect(fetchImpl).toHaveBeenCalledWith(LOCAL_DEV_QUIT_PATH, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                [LOCAL_DEV_QUIT_HEADER]: '1',
            },
            body: '{}',
        });
        expect(result.ok).toBe(true);
        expect(result.message).toMatch(/Stopping/);
    });

    it('surfaces the server error and does not treat it as success', async () => {
        const fetchImpl = vi.fn(async () => jsonResponse({
            ok: false,
            status: 404,
            body: { error: 'Quit is not available. This process is not the local resume-flyer dev server, so nothing was stopped.' },
        }));
        await expect(requestLocalDevQuit({
            fetchImpl,
            hasServerImpl: () => true,
        })).rejects.toThrow(/not the local resume-flyer dev server/);
    });

    it('reports a non-JSON error body and still fails the quit', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const fetchImpl = vi.fn(async () => ({
            ok: false,
            status: 502,
            json: async () => { throw new Error('not json'); },
        }));
        await expect(requestLocalDevQuit({
            fetchImpl,
            hasServerImpl: () => true,
        })).rejects.toThrow(/HTTP 502/);
        expect(errorSpy).toHaveBeenCalled();
        expect(logSpy.mock.calls.some((call) => String(call[0]).includes('HTTP status'))).toBe(true);
        errorSpy.mockRestore();
        logSpy.mockRestore();
    });

    it('treats HTTP success with a bad body as accepted', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const fetchImpl = vi.fn(async () => ({
            ok: true,
            status: 202,
            json: async () => { throw new Error('not json'); },
        }));
        const result = await requestLocalDevQuit({
            fetchImpl,
            hasServerImpl: () => true,
        });
        expect(result).toEqual({ ok: true, message: 'The app is stopping.' });
        expect(logSpy.mock.calls.some((call) => String(call[0]).includes('Treating the HTTP success'))).toBe(true);
        errorSpy.mockRestore();
        logSpy.mockRestore();
    });

    it('propagates a network failure', async () => {
        const fetchImpl = vi.fn(async () => { throw new Error('connection refused'); });
        await expect(requestLocalDevQuit({
            fetchImpl,
            hasServerImpl: () => true,
        })).rejects.toThrow(/connection refused/);
    });
});
