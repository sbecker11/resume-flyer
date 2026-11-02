/**
 * Ask the local Express server to stop this checkout's dev servers.
 * Static hosts (GitHub Pages, forceStaticMode) have no server to stop;
 * that path throws so the UI can say quit did not happen.
 */
import { hasServer } from '@/modules/core/hasServer.mjs';
import { reportError } from '@/modules/utils/errorReporting.mjs';

export const LOCAL_DEV_QUIT_PATH = '/api/local-dev/quit';
export const LOCAL_DEV_QUIT_HEADER = 'X-Resume-Flyer-Local-Quit';

const STATIC_QUIT_ERROR = 'Quit is unavailable because this page has no local dev server (static host or GitHub Pages). Nothing was stopped.';

/** Shown only when a local dev server is present. Static hosts must not use this prompt. */
export const LOCAL_DEV_QUIT_CONFIRM_MESSAGE = 'This stops both the local API and the Vite dev server for this app. This page will go offline.';

/** True only when quit would actually stop local servers. Static hosts skip the confirm. */
export function quitNeedsServerConfirm(hasServerImpl = hasServer) {
    return typeof hasServerImpl === 'function' && hasServerImpl() === true;
}

async function readErrorDetail(response) {
    try {
        const body = await response.json();
        return body?.error || '';
    } catch (error) {
        reportError(
            error,
            '[localDevQuit] Quit error response was not JSON',
            'Using the HTTP status instead of the response body'
        );
        return '';
    }
}

export async function requestLocalDevQuit({
    fetchImpl = globalThis.fetch,
    hasServerImpl = hasServer,
} = {}) {
    if (typeof hasServerImpl !== 'function' || !hasServerImpl()) {
        throw new Error(STATIC_QUIT_ERROR);
    }
    if (typeof fetchImpl !== 'function') {
        throw new Error('Quit failed: fetch is not available. Nothing was stopped.');
    }

    const response = await fetchImpl(LOCAL_DEV_QUIT_PATH, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            [LOCAL_DEV_QUIT_HEADER]: '1',
        },
        body: '{}',
    });

    if (!response.ok) {
        const detail = await readErrorDetail(response);
        throw new Error(detail || `Quit failed (HTTP ${response.status}). Nothing was stopped.`);
    }

    try {
        return await response.json();
    } catch (error) {
        // HTTP success already means the server accepted quit. A bad body
        // must not make the UI claim the request failed.
        reportError(
            error,
            '[localDevQuit] Quit acceptance body was not JSON',
            'Treating the HTTP success as accepted'
        );
        return { ok: true, message: 'The app is stopping.' };
    }
}
