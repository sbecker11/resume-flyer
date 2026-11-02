/**
 * Local-dev quit for this checkout only.
 *
 * Enabled solely when scripts/start-dev.mjs sets RESUME_FLYER_LOCAL_DEV=1.
 * A public or static deploy does not set that flag, so the route refuses
 * and does not run the stop script.
 *
 * The stop itself is scripts/restart-local.sh --stop-only, which kills only
 * processes whose command or cwd belongs to this repo (Express, Vite, and
 * the start-dev parent). It does not use a broad pkill.
 */
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { reportError } from '../utils/errorReporting.mjs';

export const LOCAL_DEV_QUIT_ENV = 'RESUME_FLYER_LOCAL_DEV';
export const LOCAL_DEV_QUIT_HEADER = 'x-resume-flyer-local-quit';
export const LOCAL_DEV_QUIT_PATH = '/api/local-dev/quit';

export function isLoopbackAddress(address) {
    if (!address) return false;
    const normalized = String(address).trim().toLowerCase().replace(/^::ffff:/, '');
    return normalized === '127.0.0.1' || normalized === '::1';
}

export function isLocalDevQuitEnabled(env = process.env) {
    return env?.[LOCAL_DEV_QUIT_ENV] === '1';
}

export function isLocalHostname(hostname) {
    if (!hostname) return false;
    const host = String(hostname).toLowerCase().replace(/^\[|\]$/g, '');
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

/** Missing Origin is allowed (curl on loopback). A present Origin must be local. */
export function isAllowedQuitOrigin(originHeader) {
    if (originHeader == null || originHeader === '') return true;
    if (originHeader === 'null') return false;
    let parsed;
    try {
        parsed = new URL(originHeader);
    } catch {
        return false;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    return isLocalHostname(parsed.hostname);
}

/** Missing Sec-Fetch-Site is allowed. Cross-site browser requests are not. */
export function isAllowedFetchSite(site) {
    if (site == null || site === '') return true;
    return site === 'same-origin' || site === 'same-site' || site === 'none';
}

export function hasLocalQuitHeader(req) {
    const raw = req?.get?.(LOCAL_DEV_QUIT_HEADER) ?? req?.headers?.[LOCAL_DEV_QUIT_HEADER];
    return raw === '1';
}

export function localDevStopScriptPath(projectRoot) {
    return path.join(projectRoot, 'scripts', 'restart-local.sh');
}

export function assertLocalDevStopScript(projectRoot) {
    const script = localDevStopScriptPath(projectRoot);
    if (!fs.existsSync(script)) {
        throw new Error(`Stop script not found at ${script}`);
    }
    return script;
}

/**
 * Run this checkout's stop script in its own session so it can still kill
 * Vite after Express exits. spawnImpl is injectable so tests do not exec it.
 */
export function spawnLocalDevStop(projectRoot, spawnImpl = spawn) {
    const script = assertLocalDevStopScript(projectRoot);
    const child = spawnImpl('/bin/zsh', [script, '--stop-only'], {
        cwd: projectRoot,
        detached: true,
        stdio: 'ignore',
    });
    if (child && typeof child.unref === 'function') child.unref();
    if (child && typeof child.on === 'function') {
        child.on('error', (error) => {
            reportError(
                error,
                '[localDevQuit] Stop script failed to spawn',
                'Dev servers were not stopped'
            );
            throw error;
        });
    }
    return child;
}

function refuse(res, status, error) {
    res.status(status).json({ error });
}

export function createLocalDevQuitHandler({
    getEnv = () => process.env,
    projectRoot = process.cwd(),
    spawnImpl = spawn,
    schedule = setImmediate,
    report = reportError,
} = {}) {
    return function localDevQuitHandler(req, res) {
        if (!isLocalDevQuitEnabled(getEnv())) {
            return refuse(
                res,
                404,
                'Quit is not available. This process is not the local resume-flyer dev server, so nothing was stopped.'
            );
        }

        const remote = req?.socket?.remoteAddress || '';
        if (!isLoopbackAddress(remote)) {
            return refuse(
                res,
                403,
                'Quit was refused because the request did not come from this machine. Nothing was stopped.'
            );
        }

        const origin = req?.get?.('origin') ?? req?.headers?.origin;
        if (!isAllowedQuitOrigin(origin)) {
            return refuse(
                res,
                403,
                'Quit was refused because the request did not come from the local resume-flyer app. Nothing was stopped.'
            );
        }

        const fetchSite = req?.get?.('sec-fetch-site') ?? req?.headers?.['sec-fetch-site'];
        if (!isAllowedFetchSite(fetchSite)) {
            return refuse(
                res,
                403,
                'Quit was refused because the request did not come from the local resume-flyer app. Nothing was stopped.'
            );
        }

        if (!hasLocalQuitHeader(req)) {
            return refuse(
                res,
                403,
                'Quit was refused because the request was not made by the local resume-flyer app. Nothing was stopped.'
            );
        }

        try {
            assertLocalDevStopScript(projectRoot);
        } catch (error) {
            report(
                error,
                '[POST /api/local-dev/quit] Cannot stop this checkout',
                'Responding 500 and not stopping any process'
            );
            return refuse(
                res,
                500,
                'Quit failed: the local stop script is missing, so nothing was stopped.'
            );
        }

        let started = false;
        const start = () => {
            if (started) return;
            started = true;
            schedule(() => {
                try {
                    spawnLocalDevStop(projectRoot, spawnImpl);
                } catch (error) {
                    report(
                        error,
                        '[POST /api/local-dev/quit] Failed to start checkout stop',
                        'Dev servers were not stopped'
                    );
                    throw error;
                }
            });
        };

        if (typeof res.once === 'function') {
            res.once('finish', start);
            res.once('close', start);
        }
        res.status(202).json({
            ok: true,
            message: 'Stopping the local resume-flyer dev servers for this checkout.',
        });
        if (typeof res.once !== 'function') start();
    };
}
