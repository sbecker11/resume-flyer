import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
    archiveReparseBackup,
    listReparseHistory,
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
});
