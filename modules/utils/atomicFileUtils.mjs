// modules/utils/atomicFileUtils.mjs
// Atomic file utilities with lock file protection (prevents concurrent write corruption)
// Inspired by npm's package-lock.json implementation

import { promises as fs } from 'fs';

/**
 * Atomically write data to a file with lock file protection
 * Prevents concurrent write corruption by using a lock file and atomic rename
 *
 * @param {string} filePath - Path to the target file
 * @param {string} data - Data to write (typically JSON string)
 * @param {number} maxRetries - Maximum retry attempts if lock is held (default: 10)
 * @param {number} retryDelay - Delay between retries in milliseconds (default: 50ms)
 * @throws {Error} If lock cannot be acquired after retries or write fails
 *
 * @example
 * const data = JSON.stringify({ foo: 'bar' }, null, 2);
 * await atomicWriteWithLock('./config.json', data);
 */
export async function atomicWriteWithLock(filePath, data, maxRetries = 10, retryDelay = 50) {
    const lockPath = `${filePath}.lock`;
    const tempPath = `${filePath}.tmp`;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            // Try to create lock file (fails with EEXIST if already exists)
            await fs.writeFile(lockPath, process.pid.toString(), { flag: 'wx' });

            try {
                // Write to temporary file first
                await fs.writeFile(tempPath, data, 'utf-8');

                // Atomically rename temp to final (OS-level atomic operation)
                // This ensures readers never see partially-written content
                await fs.rename(tempPath, filePath);

                return; // Success - lock will be released in finally block
            } finally {
                // Always remove lock file, even if write failed
                await fs.unlink(lockPath).catch(() => {
                    // Ignore errors if lock file already removed
                });
            }
        } catch (error) {
            if (error.code === 'EEXIST') {
                // Lock file exists - another write is in progress
                if (attempt < maxRetries - 1) {
                    // Wait and retry
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                    continue;
                } else {
                    throw new Error(`Failed to acquire lock for ${filePath} after ${maxRetries} retries`);
                }
            }
            // Re-throw other errors (permission denied, disk full, etc.)
            throw error;
        }
    }

    // This should never be reached, but included for completeness
    throw new Error(`Failed to acquire lock for ${filePath} after retries`);
}

/**
 * Write JSON data atomically with lock protection
 * Convenience wrapper for atomicWriteWithLock that handles JSON stringification
 *
 * @param {string} filePath - Path to the target JSON file
 * @param {*} jsonData - JavaScript object to write as JSON
 * @param {boolean} pretty - Whether to pretty-print JSON (default: true)
 * @param {number} maxRetries - Maximum retry attempts (default: 10)
 * @param {number} retryDelay - Delay between retries in ms (default: 50)
 *
 * @example
 * await atomicWriteJSON('./config.json', { foo: 'bar', count: 42 });
 */
export async function atomicWriteJSON(filePath, jsonData, pretty = true, maxRetries = 10, retryDelay = 50) {
    const stringified = JSON.stringify(jsonData, null, pretty ? 2 : 0);
    await atomicWriteWithLock(filePath, stringified, maxRetries, retryDelay);
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
/**
 * Run a read-modify-write under an exclusive lock file.
 * The lock is released if `fn` throws.
 *
 * @param {string} filePath - Path whose `.lock` sibling is claimed
 * @param {() => Promise<*>} fn
 * @param {number} [maxRetries=10]
 * @param {number} [retryDelay=50]
 * @returns {Promise<*>}
 */
export async function withFileLock(filePath, fn, maxRetries = 10, retryDelay = 50) {
    const lockPath = `${filePath}.lock`;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            await fs.writeFile(lockPath, process.pid.toString(), { flag: 'wx' });
            try {
                return await fn();
            } finally {
                await fs.unlink(lockPath).catch(() => {});
            }
        } catch (error) {
            if (error.code === 'EEXIST') {
                if (attempt < maxRetries - 1) {
                    await new Promise((resolve) => setTimeout(resolve, retryDelay));
                    continue;
                }
                throw new Error(`Failed to acquire lock for ${filePath} after ${maxRetries} retries`);
            }
            throw error;
        }
    }

    throw new Error(`Failed to acquire lock for ${filePath} after retries`);
}

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
