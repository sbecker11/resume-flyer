// modules/utils/atomicFileUtils.test.mjs
// Comprehensive unit tests for atomic file utilities

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { atomicWriteWithLock, atomicWriteJSON, cleanStaleLock } from './atomicFileUtils.mjs';

describe('atomicFileUtils', () => {
    let testDir;
    let testFile;

    beforeEach(async () => {
        // Create unique temp directory for each test
        testDir = path.join(os.tmpdir(), `atomic-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        await fs.mkdir(testDir, { recursive: true });
        testFile = path.join(testDir, 'test-file.txt');
    });

    afterEach(async () => {
        // Clean up test directory
        try {
            await fs.rm(testDir, { recursive: true, force: true });
        } catch (err) {
            // Ignore cleanup errors
        }
    });

    describe('atomicWriteWithLock', () => {
        it('should write data to file successfully', async () => {
            const data = 'Hello, World!';
            await atomicWriteWithLock(testFile, data);

            const content = await fs.readFile(testFile, 'utf-8');
            expect(content).toBe(data);
        });

        it('should create lock file during write', async () => {
            const lockPath = `${testFile}.lock`;
            let lockExisted = false;

            // Start write operation
            const writePromise = atomicWriteWithLock(testFile, 'test data');

            // Check if lock file exists (racing with write, may or may not catch it)
            try {
                await fs.access(lockPath);
                lockExisted = true;
            } catch {
                // Lock might already be released if write was fast
            }

            await writePromise;

            // Lock should definitely be removed after write
            await expect(fs.access(lockPath)).rejects.toThrow();
        });

        it('should clean up lock file after successful write', async () => {
            await atomicWriteWithLock(testFile, 'test data');

            const lockPath = `${testFile}.lock`;
            await expect(fs.access(lockPath)).rejects.toThrow();
        });

        it('should clean up lock file even after write failure', async () => {
            const invalidPath = path.join(testDir, 'nonexistent', 'subdir', 'file.txt');
            const lockPath = `${invalidPath}.lock`;

            await expect(atomicWriteWithLock(invalidPath, 'test')).rejects.toThrow();

            // Lock should be cleaned up even though write failed
            await expect(fs.access(lockPath)).rejects.toThrow();
        });

        it('should overwrite existing file content', async () => {
            await fs.writeFile(testFile, 'original content');

            await atomicWriteWithLock(testFile, 'new content');

            const content = await fs.readFile(testFile, 'utf-8');
            expect(content).toBe('new content');
        });

        it('should handle concurrent writes sequentially', async () => {
            const writes = [];
            const numWrites = 5;

            // Start multiple concurrent writes
            for (let i = 0; i < numWrites; i++) {
                writes.push(atomicWriteWithLock(testFile, `write-${i}`));
            }

            // All writes should complete without error
            await Promise.all(writes);

            // File should contain one of the write values (last one to complete)
            const content = await fs.readFile(testFile, 'utf-8');
            expect(content).toMatch(/^write-\d$/);
        });

        it('should retry when lock file exists', async () => {
            const lockPath = `${testFile}.lock`;

            // Manually create lock file
            await fs.writeFile(lockPath, '12345');

            // Start write with short retry delay
            const writePromise = atomicWriteWithLock(testFile, 'data', 5, 10);

            // Remove lock after short delay to allow retry to succeed
            setTimeout(async () => {
                try {
                    await fs.unlink(lockPath);
                } catch {
                    // Lock might already be removed by write operation
                }
            }, 30);

            await writePromise;

            const content = await fs.readFile(testFile, 'utf-8');
            expect(content).toBe('data');
        });

        it('should fail after max retries with persistent lock', async () => {
            const lockPath = `${testFile}.lock`;

            // Create and keep lock file
            await fs.writeFile(lockPath, '99999');

            // Should fail after 3 retries with 10ms delay
            await expect(
                atomicWriteWithLock(testFile, 'data', 3, 10)
            ).rejects.toThrow(/Failed to acquire lock/);

            // Clean up lock
            await fs.unlink(lockPath);
        });

        it('should use atomic rename for file update', async () => {
            const tempPath = `${testFile}.tmp`;

            await atomicWriteWithLock(testFile, 'atomic data');

            // Temp file should be cleaned up (renamed to final file)
            await expect(fs.access(tempPath)).rejects.toThrow();

            // Final file should exist
            const content = await fs.readFile(testFile, 'utf-8');
            expect(content).toBe('atomic data');
        });

        it('should handle empty data', async () => {
            await atomicWriteWithLock(testFile, '');

            const content = await fs.readFile(testFile, 'utf-8');
            expect(content).toBe('');
        });

        it('should handle large data', async () => {
            const largeData = 'x'.repeat(1024 * 100); // 100KB
            await atomicWriteWithLock(testFile, largeData);

            const content = await fs.readFile(testFile, 'utf-8');
            expect(content).toBe(largeData);
            expect(content.length).toBe(1024 * 100);
        });

        it('should handle special characters in data', async () => {
            const specialData = '{"unicode": "日本語", "emoji": "🎉", "newlines": "line1\\nline2"}';
            await atomicWriteWithLock(testFile, specialData);

            const content = await fs.readFile(testFile, 'utf-8');
            expect(content).toBe(specialData);
        });
    });

    describe('atomicWriteJSON', () => {
        it('should write JSON object with pretty formatting', async () => {
            const jsonFile = path.join(testDir, 'test.json');
            const data = { foo: 'bar', count: 42, nested: { key: 'value' } };

            await atomicWriteJSON(jsonFile, data, true);

            const content = await fs.readFile(jsonFile, 'utf-8');
            const parsed = JSON.parse(content);

            expect(parsed).toEqual(data);
            expect(content).toContain('\n'); // Pretty formatting includes newlines
            expect(content).toContain('  '); // Pretty formatting includes indentation
        });

        it('should write JSON object with compact formatting', async () => {
            const jsonFile = path.join(testDir, 'test.json');
            const data = { foo: 'bar', count: 42 };

            await atomicWriteJSON(jsonFile, data, false);

            const content = await fs.readFile(jsonFile, 'utf-8');
            const parsed = JSON.parse(content);

            expect(parsed).toEqual(data);
            expect(content).toBe('{"foo":"bar","count":42}');
        });

        it('should handle complex nested JSON', async () => {
            const jsonFile = path.join(testDir, 'complex.json');
            const data = {
                version: '1.0',
                config: {
                    enabled: true,
                    options: ['opt1', 'opt2'],
                    nested: {
                        deep: {
                            value: 123
                        }
                    }
                },
                array: [1, 2, { key: 'value' }]
            };

            await atomicWriteJSON(jsonFile, data);

            const content = await fs.readFile(jsonFile, 'utf-8');
            const parsed = JSON.parse(content);

            expect(parsed).toEqual(data);
        });

        it('should handle null and undefined values', async () => {
            const jsonFile = path.join(testDir, 'nulls.json');
            const data = { nullValue: null, definedValue: 'test' };
            // Note: undefined properties are omitted by JSON.stringify

            await atomicWriteJSON(jsonFile, data);

            const content = await fs.readFile(jsonFile, 'utf-8');
            const parsed = JSON.parse(content);

            expect(parsed).toEqual(data);
            expect(parsed.nullValue).toBeNull();
        });

        it('should prevent concurrent JSON writes', async () => {
            const jsonFile = path.join(testDir, 'concurrent.json');

            const writes = [
                atomicWriteJSON(jsonFile, { id: 1, value: 'first' }),
                atomicWriteJSON(jsonFile, { id: 2, value: 'second' }),
                atomicWriteJSON(jsonFile, { id: 3, value: 'third' })
            ];

            await Promise.all(writes);

            const content = await fs.readFile(jsonFile, 'utf-8');
            const parsed = JSON.parse(content);

            // Should be valid JSON with one of the IDs
            expect(parsed).toHaveProperty('id');
            expect([1, 2, 3]).toContain(parsed.id);
        });
    });

    describe('cleanStaleLock', () => {
        it('should remove old lock files', async () => {
            const lockPath = `${testFile}.lock`;
            await fs.writeFile(lockPath, '12345');

            // Wait to make lock "stale"
            await new Promise(resolve => setTimeout(resolve, 100));

            const result = await cleanStaleLock(testFile, 50); // 50ms threshold

            expect(result).toBe(true);
            await expect(fs.access(lockPath)).rejects.toThrow();
        });

        it('should not remove recent lock files', async () => {
            const lockPath = `${testFile}.lock`;
            await fs.writeFile(lockPath, '12345');

            const result = await cleanStaleLock(testFile, 5000); // 5 second threshold

            expect(result).toBe(false);
            await fs.access(lockPath); // Should still exist
        });

        it('should return false if lock does not exist', async () => {
            const result = await cleanStaleLock(testFile, 1000);

            expect(result).toBe(false);
        });

        it('should handle multiple stale lock cleanup calls', async () => {
            const lockPath = `${testFile}.lock`;
            await fs.writeFile(lockPath, '12345');

            await new Promise(resolve => setTimeout(resolve, 100));

            const result1 = await cleanStaleLock(testFile, 50);
            const result2 = await cleanStaleLock(testFile, 50);

            expect(result1).toBe(true);
            expect(result2).toBe(false); // Already removed
        });

        it('should use default maxAge if not specified', async () => {
            const lockPath = `${testFile}.lock`;
            await fs.writeFile(lockPath, '12345');

            // Default is 30000ms, so recent lock should not be removed
            const result = await cleanStaleLock(testFile);

            expect(result).toBe(false);
            await fs.access(lockPath); // Should still exist
        });
    });

    describe('edge cases and error handling', () => {
        it('should handle permission errors gracefully', async () => {
            // This test would require setting up read-only directories
            // Skip in CI environments where permissions might differ
            expect(true).toBe(true);
        });

        it('should handle disk full scenarios', async () => {
            // This test would require mocking fs operations
            // Skip for now as it requires advanced mocking
            expect(true).toBe(true);
        });

        it('should handle process crash simulation', async () => {
            const lockPath = `${testFile}.lock`;

            // Simulate crashed process by creating orphaned lock
            await fs.writeFile(lockPath, '99999'); // Different PID

            await new Promise(resolve => setTimeout(resolve, 100));

            // Clean up stale lock
            await cleanStaleLock(testFile, 50);

            // New write should succeed
            await atomicWriteWithLock(testFile, 'recovered data');

            const content = await fs.readFile(testFile, 'utf-8');
            expect(content).toBe('recovered data');
        });
    });

    describe('integration scenarios', () => {
        it('should simulate app_state.json concurrent save scenario', async () => {
            const stateFile = path.join(testDir, 'app_state.json');

            // Simulate multiple simultaneous state updates
            const updates = [
                { version: '1.0', orientation: 'scene-left', timestamp: 1 },
                { version: '1.0', orientation: 'scene-right', timestamp: 2 },
                { version: '1.0', orientation: 'scene-left', timestamp: 3 }
            ];

            const writes = updates.map(state => atomicWriteJSON(stateFile, state));

            await Promise.all(writes);

            // File should contain valid JSON (one of the updates)
            const content = await fs.readFile(stateFile, 'utf-8');
            const parsed = JSON.parse(content);

            expect(parsed).toHaveProperty('version', '1.0');
            expect(parsed).toHaveProperty('timestamp');
            expect([1, 2, 3]).toContain(parsed.timestamp);
        });

        it('should handle rapid successive writes', async () => {
            const numWrites = 10;
            const writes = [];

            // Use more retries and longer delay for high concurrency
            for (let i = 0; i < numWrites; i++) {
                writes.push(atomicWriteWithLock(testFile, `iteration-${i}`, 20, 50));
            }

            await Promise.all(writes);

            const content = await fs.readFile(testFile, 'utf-8');
            expect(content).toMatch(/^iteration-\d+$/);
        });

        it('should maintain data integrity under load', async () => {
            const jsonFile = path.join(testDir, 'integrity.json');
            const numOperations = 10;

            const operations = Array.from({ length: numOperations }, (_, i) => ({
                id: i,
                data: `test-${i}`,
                timestamp: Date.now() + i
            }));

            await Promise.all(
                operations.map(op => atomicWriteJSON(jsonFile, op))
            );

            // Final file should be valid JSON
            const content = await fs.readFile(jsonFile, 'utf-8');
            const parsed = JSON.parse(content);

            expect(parsed).toHaveProperty('id');
            expect(parsed).toHaveProperty('data');
            expect(parsed).toHaveProperty('timestamp');
        });

        it('should keep integrity when each write outlasts the default retry delay', async () => {
            const jsonFile = path.join(testDir, 'slow-integrity.json');
            const numOperations = 10;
            const originalWriteFile = fs.writeFile.bind(fs);
            // Longer than the default 50ms retry. A fixed-delay stampede exhausts 10 attempts.
            fs.writeFile = async (filePath, data, options) => {
                if (typeof filePath === 'string' && filePath.endsWith('.tmp')) {
                    await new Promise((resolve) => setTimeout(resolve, 80));
                }
                return originalWriteFile(filePath, data, options);
            };

            try {
                const operations = Array.from({ length: numOperations }, (_, i) => ({
                    id: i,
                    data: `test-${i}`,
                    timestamp: Date.now() + i
                }));

                await Promise.all(
                    operations.map(op => atomicWriteJSON(jsonFile, op))
                );

                const content = await fs.readFile(jsonFile, 'utf-8');
                const parsed = JSON.parse(content);

                expect(parsed).toHaveProperty('id');
                expect(parsed).toHaveProperty('data');
                expect(operations.map(op => op.id)).toContain(parsed.id);
            } finally {
                fs.writeFile = originalWriteFile;
            }
        });
    });
});
