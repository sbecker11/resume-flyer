// modules/utils/atomicFileUtils.mjs
// Atomic file utilities with lock file protection (prevents concurrent write corruption)
// Inspired by npm's package-lock.json implementation

import { promises as fs } from 'fs';
import { reportError } from './errorReporting.mjs';

/**
 * Same-process callers for one path wait on this chain instead of stampeding
 * the lock file. The file lock is still acquired before any write so other
 * processes cannot interleave. A rejected operation does not stall the chain.
 *
 * @type {Map<string, Promise<void>>}
 */
const localLockTails = new Map();

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fixed delays wake every waiter together. Grow the wait, then add a full
 * extra jitter span, and never sleep less than `retryDelay` so a short
 * explicit delay still reaches a lock released on that cadence.
 *
 * @param {number} attempt
 * @param {number} retryDelay
 * @returns {number}
 */
function retryWaitMs(attempt, retryDelay) {
    const base = Math.max(0, Number(retryDelay) || 0);
    const exponential = base * (2 ** Math.min(attempt, 5));
    const cap = Math.max(base, 1000);
    const ceiling = Math.min(exponential, cap);
    const jitter = base === 0 ? 0 : Math.floor(Math.random() * (base + 1));
    return ceiling + jitter;
}

/**
 * @param {string} filePath
 * @param {() => Promise<*>} task
 * @returns {Promise<*>}
 */
function enqueueLocal(filePath, task) {
    const previous = localLockTails.get(filePath) ?? Promise.resolve();
    const run = previous.then(() => task());
    const tail = run.then(
        () => {},
        (error) => {
            reportError(
                error,
                `[atomicFileUtils] Locked operation failed for ${filePath}`,
                'Continuing the lock queue so the next writer can acquire the lock'
            );
        }
    );
    localLockTails.set(filePath, tail);
    tail.finally(() => {
        if (localLockTails.get(filePath) === tail) {
            localLockTails.delete(filePath);
        }
    });
    return run;
}

/**
 * @param {string} filePath
 * @param {number} maxRetries
 * @param {number} retryDelay
 * @returns {Promise<string>} lock path, held by this caller
 */
async function acquireFileLock(filePath, maxRetries, retryDelay) {
    const lockPath = `${filePath}.lock`;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            // Exclusive create. Fails with EEXIST while another process holds the lock.
            await fs.writeFile(lockPath, process.pid.toString(), { flag: 'wx' });
            return lockPath;
        } catch (error) {
            if (error.code !== 'EEXIST') {
                reportError(error, `[atomicFileUtils] Failed to create lock file ${lockPath}`);
                throw error;
            }
            if (attempt >= maxRetries - 1) {
                const failure = new Error(`Failed to acquire lock for ${filePath} after ${maxRetries} retries`);
                reportError(failure, `[atomicFileUtils] Failed to acquire lock for ${filePath}`);
                throw failure;
            }
            const delay = retryWaitMs(attempt, retryDelay);
            reportError(
                error,
                `[atomicFileUtils] Lock held for ${filePath} (attempt ${attempt + 1}/${maxRetries})`,
                `Retrying in ${delay}ms`
            );
            await sleep(delay);
        }
    }

    const failure = new Error(`Failed to acquire lock for ${filePath} after ${maxRetries} retries`);
    reportError(failure, `[atomicFileUtils] Failed to acquire lock for ${filePath}`);
    throw failure;
}

/**
 * @param {string} lockPath
 */
async function releaseFileLock(lockPath) {
    try {
        await fs.unlink(lockPath);
    } catch (error) {
        // The lock is already gone, which is the state release is aiming for.
        if (error.code === 'ENOENT') {
            return;
        }
        reportError(
            error,
            `[atomicFileUtils] Failed to release lock ${lockPath}`,
            'Later acquires will retry while this lock file remains'
        );
        throw error;
    }
}

/**
 * Atomically write data to a file with lock file protection
 * Prevents concurrent write corruption by using a lock file and atomic rename
 *
 * @param {string} filePath - Path to the target file
 * @param {string} data - Data to write (typically JSON string)
 * @param {number} maxRetries - Maximum acquire attempts if another process holds the lock (default: 10)
 * @param {number} retryDelay - Base delay between retries in milliseconds (default: 50ms). Waits grow and jitter.
 * @throws {Error} If lock cannot be acquired after retries or write fails
 *
 * @example
 * const data = JSON.stringify({ foo: 'bar' }, null, 2);
 * await atomicWriteWithLock('./config.json', data);
 */
export async function atomicWriteWithLock(filePath, data, maxRetries = 10, retryDelay = 50) {
    const tempPath = `${filePath}.tmp`;
    await withFileLock(filePath, async () => {
        // Write to temporary file first
        await fs.writeFile(tempPath, data, 'utf-8');

        // Atomically rename temp to final (OS-level atomic operation)
        // This ensures readers never see partially-written content
        await fs.rename(tempPath, filePath);
    }, maxRetries, retryDelay);
}

/**
 * Write JSON data atomically with lock protection
 * Convenience wrapper for atomicWriteWithLock that handles JSON stringification
 *
 * @param {string} filePath - Path to the target JSON file
 * @param {*} jsonData - JavaScript object to write as JSON
 * @param {boolean} pretty - Whether to pretty-print JSON (default: true)
 * @param {number} maxRetries - Maximum retry attempts (default: 10)
 * @param {number} retryDelay - Base delay between retries in ms (default: 50)
 *
 * @example
 * await atomicWriteJSON('./config.json', { foo: 'bar', count: 42 });
 */
export async function atomicWriteJSON(filePath, jsonData, pretty = true, maxRetries = 10, retryDelay = 50) {
    const stringified = JSON.stringify(jsonData, null, pretty ? 2 : 0);
    await atomicWriteWithLock(filePath, stringified, maxRetries, retryDelay);
}

/**
 * Run a read-modify-write under an exclusive lock file.
 * Same-process callers for this path are queued. The lock is released if `fn` throws.
 * Does not delete a live lock; use cleanStaleLock for a lock left by a crashed process.
 *
 * @param {string} filePath - Path whose `.lock` sibling is claimed
 * @param {() => Promise<*>} fn
 * @param {number} [maxRetries=10]
 * @param {number} [retryDelay=50]
 * @returns {Promise<*>}
 */
export async function withFileLock(filePath, fn, maxRetries = 10, retryDelay = 50) {
    return enqueueLocal(filePath, async () => {
        const lockPath = await acquireFileLock(filePath, maxRetries, retryDelay);
        try {
            return await fn();
        } finally {
            await releaseFileLock(lockPath);
        }
    });
}

/**
 * Clean up orphaned lock files (e.g., from crashed processes)
 * Only removes lock files older than specified age
 *
 * @param {string} filePath - Path to the file whose lock should be cleaned
 * @param {number} maxAgeMs - Maximum age in milliseconds (default: 30000 = 30 seconds)
 * @returns {boolean} True if lock was removed, false if not found or too recent
 *
 * @example
 * // Clean up stale locks on startup
 * await cleanStaleLock('./app_state.json', 30000);
 */
export async function cleanStaleLock(filePath, maxAgeMs = 30000) {
    const lockPath = `${filePath}.lock`;

    try {
        const stats = await fs.stat(lockPath);
        const age = Date.now() - stats.mtimeMs;

        if (age > maxAgeMs) {
            await fs.unlink(lockPath);
            console.log(`[AtomicFileOps] Cleaned stale lock file: ${lockPath} (age: ${Math.round(age / 1000)}s)`);
            return true;
        }

        return false; // Lock exists but too recent
    } catch (error) {
        if (error.code === 'ENOENT') {
            return false; // Lock doesn't exist
        }
        throw error;
    }
}
