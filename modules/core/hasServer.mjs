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
        hasServerImpl._cached = !window.location?.origin?.includes('github.io');
    }
    return hasServerImpl._cached;
}

if (typeof window !== 'undefined') {
    window.hasServer = hasServerImpl;
}

export function hasServer() {
    return hasServerImpl();
}
