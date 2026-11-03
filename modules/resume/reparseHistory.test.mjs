import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
    REPARSE_HISTORY_DIRNAME,
    archiveReparseBackup,
    backupIdFromDate,
    listReparseHistory,
    restoreReparseBackup,
    restoreReparseHistoryEntry,
    stashDerivedFilesForReparse,
} from './reparseHistory.mjs';

const dirs = [];

async function tempResume() {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'reparse-history-'));
    dirs.push(dir);
    await fs.writeFile(path.join(dir, 'resume.docx'), 'original');
    await fs.writeFile(path.join(dir, 'skills.json'), '{"python":{"url":"https://old.example"}}');
    await fs.writeFile(path.join(dir, 'jobs.json'), '[{"label":"edited"}]');
    return dir;
}

afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('reparseHistory', () => {
    it('archives a dated snapshot and can restore it over a later parse', async () => {
        const dir = await tempResume();
        const staged = await stashDerivedFilesForReparse(dir, 'resume.docx');
        expect(await fs.readFile(path.join(dir, 'resume.docx'), 'utf-8')).toBe('original');
        await expect(fs.access(path.join(dir, 'skills.json'))).rejects.toThrow();

        const manifest = await archiveReparseBackup(dir, staged, {
            reason: 'reparse',
            createdAt: new Date('2026-10-27T17:00:00.000Z'),
        });
        expect(manifest.id).toBe('2026-10-27T17-00-00-000Z');

        await fs.writeFile(path.join(dir, 'skills.json'), '{"python":{"url":""}}');
        await fs.writeFile(path.join(dir, 'jobs.json'), '[{"label":"fresh parse"}]');

        const history = await listReparseHistory(dir);
        expect(history.map((entry) => entry.id)).toEqual(['2026-10-27T17-00-00-000Z']);
        expect(history[0].reason).toBe('reparse');

        await restoreReparseHistoryEntry(dir, history[0].id);
        expect(await fs.readFile(path.join(dir, 'skills.json'), 'utf-8')).toContain('https://old.example');
        expect(await fs.readFile(path.join(dir, 'jobs.json'), 'utf-8')).toContain('edited');
        expect(await fs.readFile(path.join(dir, 'resume.docx'), 'utf-8')).toBe('original');

        const after = await listReparseHistory(dir);
        expect(after.some((entry) => entry.reason === 'before-restore')).toBe(true);
        expect(after.some((entry) => entry.id === '2026-10-27T17-00-00-000Z')).toBe(true);
    });

    it('rejects a backup id that is not a history folder name', async () => {
        const dir = await tempResume();
        await expect(restoreReparseHistoryEntry(dir, '../secrets')).rejects.toThrow(/invalid backup id/i);
    });

    it('404s when the backup id is well-formed but missing', async () => {
        const dir = await tempResume();
        await expect(restoreReparseHistoryEntry(dir, '2026-01-01T00-00-00-000Z')).rejects.toMatchObject({
            statusCode: 404,
            message: expect.stringContaining('was not found'),
        });
    });

    it('restoreReparseBackup puts a failed reparse back and is a no-op without a stash', async () => {
        const dir = await tempResume();
        const staged = await stashDerivedFilesForReparse(dir, 'resume.docx');
        // A partial reparse wrote a new derived file before failing.
        await fs.writeFile(path.join(dir, 'jobs.json'), '[{"label":"half-written"}]');
        await restoreReparseBackup(dir, staged);
        expect(await fs.readFile(path.join(dir, 'jobs.json'), 'utf-8')).toContain('edited');
        expect(await fs.readFile(path.join(dir, 'skills.json'), 'utf-8')).toContain('https://old.example');
        expect(await fs.readFile(path.join(dir, 'resume.docx'), 'utf-8')).toBe('original');
        await expect(fs.access(staged)).rejects.toThrow();

        await expect(restoreReparseBackup(dir, null)).resolves.toBeUndefined();
        await expect(restoreReparseBackup(dir, path.join(dir, 'nope'))).resolves.toBeUndefined();
        expect(await archiveReparseBackup(dir, null)).toBeNull();
        expect(await archiveReparseBackup(dir, path.join(dir, 'nope'))).toBeNull();
    });

    it('suffixes the id when two snapshots share a timestamp and tolerates a missing manifest', async () => {
        const dir = await tempResume();
        const when = new Date('2026-10-27T17:00:00.000Z');
        const first = await archiveReparseBackup(dir, await stashDerivedFilesForReparse(dir, 'resume.docx'), { createdAt: when });
        await fs.writeFile(path.join(dir, 'jobs.json'), '[]');
        const second = await archiveReparseBackup(dir, await stashDerivedFilesForReparse(dir, 'resume.docx'), { createdAt: when });
        expect(first.id).toBe('2026-10-27T17-00-00-000Z');
        expect(second.id).toBe('2026-10-27T17-00-00-000Z-2');

        const historyRoot = path.join(dir, REPARSE_HISTORY_DIRNAME);
        await fs.rm(path.join(historyRoot, second.id, 'manifest.json'));
        await fs.mkdir(path.join(historyRoot, 'not-a-backup-id'));
        await fs.writeFile(path.join(historyRoot, 'stray.txt'), '');
        const history = await listReparseHistory(dir);
        expect(history.map((e) => e.id)).toEqual([second.id, first.id]);
        expect(history[0]).toEqual({ id: second.id, createdAt: second.id, reason: 'reparse' });
    });

    it('lists nothing when there is no history folder', async () => {
        const dir = await tempResume();
        expect(await listReparseHistory(dir)).toEqual([]);
        expect(backupIdFromDate(new Date('2026-01-02T03:04:05.678Z'))).toBe('2026-01-02T03-04-05-678Z');
    });
});
