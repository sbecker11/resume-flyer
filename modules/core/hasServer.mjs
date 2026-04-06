/**
 * Singleton: "do we have a backend server?" (vs static host e.g. GitHub Pages).
 * Self-initializing: value is computed on first call; no global boolean to initialize.
 * Attached to window on module load so window.hasServer() works; also exported for import.
 *
 * Convention: call sites use `if (hasServer()) { server } else { local }` so the server
 * path is the primary one (matches local dev where hasServer() is true).
 *
 * Static mode can be forced three ways (highest priority first):
 *   1. localStorage key:  localStorage.setItem('forceStaticMode', 'true')  (runtime toggle, survives HMR)
 *   2. .env variable:     VITE_STATIC_MODE=true  (requires dev server restart)
 *   3. Auto-detected:     hostname includes 'github.io'
 *
 * To clear the runtime override: localStorage.removeItem('forceStaticMode') then reload.
 */

function hasServerImpl() {
    if (typeof window === 'undefined') return false;
    if (hasServerImpl._cached === undefined) {
        // 1. Runtime localStorage override (highest priority — survives HMR without restart)
        try {
            if (localStorage.getItem('forceStaticMode') === 'true') {
                console.log('[hasServer] 🗂️  Static mode forced via localStorage (forceStaticMode=true)');
                hasServerImpl._cached = false;
                return false;
            }
        } catch { /* localStorage unavailable in some contexts */ }

        // 2. Build-time .env flag: VITE_STATIC_MODE=true
        // import.meta.env is replaced at build time by Vite; safe to reference here.
        try {
            if (import.meta.env?.VITE_STATIC_MODE === 'true') {
                console.log('[hasServer] 🗂️  Static mode forced via VITE_STATIC_MODE=true (.env)');
                hasServerImpl._cached = false;
                return false;
            }
        } catch { /* not a Vite environment */ }

        // 3. Auto-detect GitHub Pages
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

    // Convenience helpers accessible from the browser console:
    //   window.enableStaticMode()   — force static mode until cleared
    //   window.disableStaticMode()  — restore server mode
    window.enableStaticMode = () => {
        localStorage.setItem('forceStaticMode', 'true');
        hasServerImpl._cached = undefined; // clear cache so next call re-evaluates
        console.log('[hasServer] Static mode enabled — reload the page to apply.');
    };
    window.disableStaticMode = () => {
        localStorage.removeItem('forceStaticMode');
        hasServerImpl._cached = undefined;
        console.log('[hasServer] Static mode disabled — reload the page to apply.');
    };
}

export function hasServer() {
    return hasServerImpl();
}
