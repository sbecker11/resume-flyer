/**
 * Start dev servers with port cycling: find unused ports for backend and frontend,
 * then start the Node server and Vite with the correct proxy target.
 * Reads EXPRESS_PORT and VITE_DEV_PORT from .env (see docs/REPLICATE-PORTS-CONFIG.md).
 */
import { spawn } from 'child_process';
import net from 'net';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(root, '.env') });

const DEFAULT_EXPRESS_PORT = 3001;
const DEFAULT_VITE_DEV_PORT = 5174;

// Check if something is already listening on the port (connect-based: more reliable than bind).
function isPortInUse(port) {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        const onError = () => {
            socket.destroy();
            resolve(false); // connection refused or other error => port not in use
        };
        socket.once('error', onError);
        socket.once('connect', () => {
            socket.destroy();
            resolve(true); // we connected => something is listening => port in use
        });
        socket.connect(port, '127.0.0.1');
    });
}

async function findAvailablePort(from, maxTries = 20) {
    for (let i = 0; i < maxTries; i++) {
        const port = from + i;
        const inUse = await isPortInUse(port);
        if (!inUse) return port;
    }
    return null;
}

function waitForUrl(url, maxAttempts = 30) {
    return new Promise((resolve) => {
        let attempts = 0;
        const tryFetch = () => {
            fetch(url).then(() => resolve(true)).catch(() => {
                attempts++;
                if (attempts >= maxAttempts) return resolve(false);
                setTimeout(tryFetch, 200);
            });
        };
        tryFetch();
    });
}

async function main() {
    const preferredBackend = parseInt(process.env.EXPRESS_PORT, 10) || DEFAULT_EXPRESS_PORT;
    const preferredFrontend = parseInt(process.env.VITE_DEV_PORT, 10) || DEFAULT_VITE_DEV_PORT;
    const backendPort = await findAvailablePort(preferredBackend);
    const frontendPort = await findAvailablePort(preferredFrontend);
    if (backendPort === null || frontendPort === null) {
        console.error(`Could not find available ports (tried backend ${preferredBackend}+, frontend ${preferredFrontend}+).`);
        process.exit(1);
    }
    console.log(`Using backend port ${backendPort}, frontend port ${frontendPort}`);

    const serverProc = spawn('node', ['server.mjs'], {
        cwd: root,
        env: {
            ...process.env,
            EXPRESS_PORT: String(backendPort),
            PORT: String(backendPort),
        },
        stdio: 'inherit',
    });
    serverProc.on('error', (err) => {
        console.error('Failed to start server:', err);
        process.exit(1);
    });

    const ok = await waitForUrl(`http://127.0.0.1:${backendPort}/api/palette-catalog`);
    if (!ok) {
        console.warn('Backend may not be ready yet; starting Vite anyway.');
    }

    const viteProc = spawn('npx', ['vite', '--port', String(frontendPort)], {
        cwd: root,
        env: {
            ...process.env,
            EXPRESS_PORT: String(backendPort),
            VITE_DEV_PORT: String(frontendPort),
            VITE_API_PORT: String(backendPort),
            VITE_PROXY_TARGET: `http://localhost:${backendPort}`,
            VITE_PORT: String(frontendPort),
        },
        stdio: 'inherit',
    });
    viteProc.on('error', (err) => {
        console.error('Failed to start Vite:', err);
        serverProc.kill();
        process.exit(1);
    });

    const killAll = () => {
        serverProc.kill();
        viteProc.kill();
    };
    process.on('SIGINT', killAll);
    process.on('SIGTERM', killAll);

    const openUrl = `http://localhost:${frontendPort}`;
    console.log(`Frontend will run at: ${openUrl} (backend API: http://localhost:${backendPort})`);

    // Wait until OUR Vite responds at openUrl, then open browser (so we never open another app's port)
    const useChrome = process.env.OPEN_BROWSER === 'chrome';
    (async function openBrowserWhenReady() {
        const maxWait = 30;
        for (let i = 0; i < maxWait; i++) {
            await new Promise((r) => setTimeout(r, 500));
            try {
                const res = await fetch(openUrl);
                if (res.ok) {
                    const text = await res.text();
                    // Only open if this looks like our app (Vite dev server or our index)
                    if (text.includes('vite') || text.includes('resume-flock') || text.includes('id="app"')) {
                        console.log(`Opening ${useChrome ? 'Chrome' : 'browser'} at ${openUrl}`);
                        let child;
                        if (useChrome && process.platform === 'darwin') {
                            child = spawn('open', ['-a', 'Google Chrome', openUrl], { cwd: root, stdio: 'ignore' });
                        } else if (useChrome && process.platform === 'win32') {
                            child = spawn('cmd', ['/c', 'start', 'chrome', openUrl], { cwd: root, stdio: 'ignore', shell: true });
                        } else if (useChrome && process.platform === 'linux') {
                            child = spawn('google-chrome', [openUrl], { cwd: root, stdio: 'ignore' });
                        } else {
                            child = spawn('npx', ['open-cli', openUrl], { cwd: root, stdio: 'ignore', shell: true });
                        }
                        child.on('error', (err) => console.warn('Could not open browser:', err.message));
                        return;
                    }
                }
            } catch (_) {}
        }
        console.log(`Open manually: ${openUrl}`);
    })();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
