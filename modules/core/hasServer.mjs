/**
 * Singleton: "do we have a backend server?" (vs static host e.g. GitHub Pages).
 * Self-initializing: value is computed on first call; no global boolean to initialize.
 * Attached to window on module load so window.hasServer() works; also exported for import.
 *
 * Convention: call sites use `if (hasServer()) { server } else { local }` so the server
 * path is the primary one (matches local dev where hasServer() is true).
 */

function hasServerImpl() {
    if (typeof window === 'undefined') return false;
    if (hasServerImpl._cached === undefined) {
        // GitHub Pages detection:
        // - Prefer `host`/`hostname` because some environments may not provide `origin` reliably.
        // - Fallback to `origin` if available.
        const loc = window.location || {};
        const host = loc.host || loc.hostname || '';
        const origin = loc.origin || '';
        const isGitHubPages = Boolean(host) ? host.includes('github.io') : origin.includes('github.io');
        hasServerImpl._cached = !isGitHubPages;
    }
    return hasServerImpl._cached;
}

if (typeof window !== 'undefined') {
    window.hasServer = hasServerImpl;
}

export function hasServer() {
    return hasServerImpl();
}
