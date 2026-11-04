import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import {
    BASELINE_FILENAME,
    compareWithBaseline,
    countConsoleErrors,
    isScannedPath,
    listScanFiles,
    main,
    readBaseline,
    runRatchet,
} from './check-console-error-ratchet.mjs';

const CE = 'console.error(';

describe('check-console-error-ratchet', () => {
    let root;
    let baselinePath;

    async function write(rel, content) {
        const abs = path.join(root, rel);
        await fs.mkdir(path.dirname(abs), { recursive: true });
        await fs.writeFile(abs, content, 'utf-8');
    }

    async function writeBaselineFile(baseline) {
        await fs.writeFile(baselinePath, JSON.stringify(baseline), 'utf-8');
    }

    async function readBaselineFile() {
        return JSON.parse(await fs.readFile(baselinePath, 'utf-8'));
    }

    beforeEach(async () => {
        root = await fs.mkdtemp(path.join(os.tmpdir(), 'console-error-ratchet-'));
        await fs.mkdir(path.join(root, 'scripts'));
        baselinePath = path.join(root, 'scripts', BASELINE_FILENAME);
    });

    afterEach(async () => {
        await fs.rm(root, { recursive: true, force: true });
    });

    describe('countConsoleErrors', () => {
        it('counts every console.error( occurrence and nothing else', () => {
            expect(countConsoleErrors(`${CE}'a');\n${CE}'b');\nconsole.warn('c');\nconsole.errorX(`)).toBe(2);
            expect(countConsoleErrors('')).toBe(0);
        });
    });

    describe('isScannedPath', () => {
        it('scans modules/**/*.{mjs,ts,vue} and server.mjs', () => {
            expect(isScannedPath('modules/a.mjs')).toBe(true);
            expect(isScannedPath('modules/x/y/Comp.vue')).toBe(true);
            expect(isScannedPath('modules/x/useThing.ts')).toBe(true);
            expect(isScannedPath('server.mjs')).toBe(true);
        });

        it('ignores tests, the reporting helpers, docs, other roots, and excluded directories', () => {
            expect(isScannedPath('modules/a.test.mjs')).toBe(false);
            expect(isScannedPath('modules/utils/errorReporting.mjs')).toBe(false);
            expect(isScannedPath('modules/utils/logger.mjs')).toBe(false);
            expect(isScannedPath('modules/utils/paletteS3LoudError.mjs')).toBe(false);
            expect(isScannedPath('modules/README.md')).toBe(false);
            expect(isScannedPath('modules/a.js')).toBe(false);
            expect(isScannedPath('scripts/foo.mjs')).toBe(false);
            expect(isScannedPath('modules/node_modules/x.mjs')).toBe(false);
            expect(isScannedPath('modules/dist/x.mjs')).toBe(false);
            expect(isScannedPath('color-palette-utils-ts/src/x.ts')).toBe(false);
            expect(isScannedPath('main.mjs')).toBe(false);
        });
    });

    describe('listScanFiles', () => {
        it('walks modules recursively, includes server.mjs, and skips excluded paths', async () => {
            await write('server.mjs', CE);
            await write('modules/a.mjs', CE);
            await write('modules/deep/b.vue', CE);
            await write('modules/deep/c.ts', CE);
            await write('modules/a.test.mjs', CE);
            await write('modules/utils/errorReporting.mjs', CE);
            await write('modules/utils/logger.mjs', CE);
            await write('modules/utils/paletteS3LoudError.mjs', CE);
            await write('modules/notes.md', CE);
            await write('modules/node_modules/dep.mjs', CE);
            await write('modules/dist/bundle.mjs', CE);
            await write('scripts/tool.mjs', CE);
            await write('color-palette-utils-ts/src/x.ts', CE);
            await write('main.mjs', CE);
            expect(listScanFiles(root)).toEqual(['modules/a.mjs', 'modules/deep/b.vue', 'modules/deep/c.ts', 'server.mjs']);
        });

        it('tolerates a missing server.mjs or modules directory', async () => {
            await write('modules/only.mjs', '');
            expect(listScanFiles(root)).toEqual(['modules/only.mjs']);
            await fs.rm(path.join(root, 'modules'), { recursive: true });
            expect(listScanFiles(root)).toEqual([]);
        });
    });

    describe('compareWithBaseline', () => {
        it('separates over and under, keeps the next baseline at or below the old one, and totals', () => {
            const r = compareWithBaseline(
                { 'modules/up.mjs': 3, 'modules/down.mjs': 1, 'modules/same.mjs': 2, 'modules/new.mjs': 1 },
                { 'modules/up.mjs': 2, 'modules/down.mjs': 4, 'modules/same.mjs': 2, 'modules/gone.mjs': 5 },
            );
            expect(r.over).toEqual([
                { file: 'modules/new.mjs', count: 1, baseline: 0 },
                { file: 'modules/up.mjs', count: 3, baseline: 2 },
            ]);
            expect(r.under).toEqual([
                { file: 'modules/down.mjs', count: 1, baseline: 4 },
                { file: 'modules/gone.mjs', count: 0, baseline: 5 },
            ]);
            expect(r.nextBaseline).toEqual({ 'modules/down.mjs': 1, 'modules/same.mjs': 2, 'modules/up.mjs': 2 });
            expect(r.total).toBe(7);
        });
    });

    describe('readBaseline', () => {
        it('returns {} when the file is missing and rejects malformed baselines', async () => {
            expect(readBaseline(baselinePath)).toEqual({});
            await fs.writeFile(baselinePath, '[1]');
            expect(() => readBaseline(baselinePath)).toThrow(/JSON object/);
            await fs.writeFile(baselinePath, '{"modules/a.mjs": -1}');
            expect(() => readBaseline(baselinePath)).toThrow(/non-integer or negative/);
            await fs.writeFile(baselinePath, '{"modules/a.mjs": "2"}');
            expect(() => readBaseline(baselinePath)).toThrow(/non-integer or negative/);
        });
    });

    describe('runRatchet', () => {
        it('fails with a per-file message when a file exceeds its baseline', async () => {
            await write('modules/a.mjs', `${CE}\n${CE}\n${CE}`);
            await write('modules/b.mjs', CE);
            await writeBaselineFile({ 'modules/a.mjs': 2, 'modules/b.mjs': 1 });
            const r = runRatchet({ rootDir: root, baselinePath });
            expect(r.exitCode).toBe(1);
            expect(r.lines.some((l) => l.startsWith('FAIL modules/a.mjs: 3 console.error( calls, baseline is 2'))).toBe(true);
            expect(r.lines.some((l) => l.includes('modules/b.mjs'))).toBe(false);
            expect(r.lines.some((l) => l.includes('reportError'))).toBe(true);
            expect(r.baselineWritten).toBe(false);
        });

        it('fails for a new file with console.error (baseline defaults to 0), even with --update, and never raises the baseline', async () => {
            await write('modules/fresh.vue', CE);
            await writeBaselineFile({});
            const r = runRatchet({ rootDir: root, baselinePath, update: true });
            expect(r.exitCode).toBe(1);
            expect(r.lines[0]).toMatch(/^FAIL modules\/fresh\.vue: 1 console\.error\( call, baseline is 0/);
            expect(r.baselineWritten).toBe(false);
            expect(await readBaselineFile()).toEqual({});
        });

        it('passes when every file is at its baseline', async () => {
            await write('modules/a.mjs', `${CE}${CE}`);
            await write('server.mjs', 'reportError(e)');
            await writeBaselineFile({ 'modules/a.mjs': 2 });
            const r = runRatchet({ rootDir: root, baselinePath });
            expect(r.exitCode).toBe(0);
            expect(r.lines).toEqual(['console.error ratchet OK: 2 call(s) across 1 file(s), none above baseline']);
            expect(r.baselineWritten).toBe(false);
        });

        it('passes with a note when a file is below baseline and only lowers the baseline with --update', async () => {
            await write('modules/a.mjs', CE);
            await write('modules/gone.mjs', 'nothing here');
            await writeBaselineFile({ 'modules/a.mjs': 3, 'modules/gone.mjs': 2, 'modules/removed.mjs': 1 });

            const check = runRatchet({ rootDir: root, baselinePath });
            expect(check.exitCode).toBe(0);
            expect(check.lines).toContain('note modules/a.mjs: 1 console.error( call, below baseline 3');
            expect(check.lines).toContain('note modules/gone.mjs: 0 console.error( calls, below baseline 2');
            expect(check.lines).toContain('note modules/removed.mjs: 0 console.error( calls, below baseline 1');
            expect(check.lines.some((l) => l.includes('--update'))).toBe(true);
            expect(check.baselineWritten).toBe(false);
            expect(await readBaselineFile()).toEqual({ 'modules/a.mjs': 3, 'modules/gone.mjs': 2, 'modules/removed.mjs': 1 });

            const update = runRatchet({ rootDir: root, baselinePath, update: true });
            expect(update.exitCode).toBe(0);
            expect(update.baselineWritten).toBe(true);
            expect(update.lines.some((l) => l.startsWith('Lowered baseline for 3 file(s)'))).toBe(true);
            expect(await readBaselineFile()).toEqual({ 'modules/a.mjs': 1 });
            expect(await fs.readFile(baselinePath, 'utf-8')).toMatch(/\n$/);

            const again = runRatchet({ rootDir: root, baselinePath, update: true });
            expect(again.exitCode).toBe(0);
            expect(again.baselineWritten).toBe(false);
        });

        it('ignores excluded paths when counting', async () => {
            await write('modules/a.test.mjs', `${CE}${CE}`);
            await write('modules/utils/errorReporting.mjs', CE);
            await write('modules/utils/logger.mjs', CE);
            await write('modules/utils/paletteS3LoudError.mjs', CE);
            await write('modules/doc.md', CE);
            await write('modules/node_modules/x.mjs', CE);
            await write('modules/dist/x.mjs', CE);
            await write('scripts/x.mjs', CE);
            await write('color-palette-utils-ts/x.ts', CE);
            await writeBaselineFile({});
            const r = runRatchet({ rootDir: root, baselinePath });
            expect(r.exitCode).toBe(0);
            expect(r.result.total).toBe(0);
        });

        it('bootstraps the baseline from current counts with --update when no baseline file exists', async () => {
            await write('modules/clean.mjs', 'reportError(e)');
            await write('modules/legacy.mjs', `${CE}${CE}`);
            const r = runRatchet({ rootDir: root, baselinePath, update: true });
            expect(r.exitCode).toBe(0);
            expect(r.baselineWritten).toBe(true);
            expect(r.lines).toEqual(['Wrote initial baseline scripts/console-error-baseline.json: 2 call(s) across 1 file(s)']);
            expect(await readBaselineFile()).toEqual({ 'modules/legacy.mjs': 2 });
        });

        it('treats a missing baseline file as all zeros without --update', async () => {
            await write('modules/legacy.mjs', CE);
            const r = runRatchet({ rootDir: root, baselinePath });
            expect(r.exitCode).toBe(1);
            expect(r.lines[0]).toMatch(/^FAIL modules\/legacy\.mjs: 1 console\.error\( call, baseline is 0/);
        });
    });

    describe('main', () => {
        it('parses --update, prints every line, and returns the exit code', async () => {
            await write('modules/a.mjs', CE);
            await writeBaselineFile({ 'modules/a.mjs': 2 });
            const logged = [];
            const code = main(['--update'], { log: (l) => logged.push(l), rootDir: root, baselinePath });
            expect(code).toBe(0);
            expect(logged.length).toBeGreaterThan(1);
            expect(await readBaselineFile()).toEqual({ 'modules/a.mjs': 1 });

            await write('modules/a.mjs', `${CE}${CE}`);
            const failed = [];
            expect(main([], { log: (l) => failed.push(l), rootDir: root, baselinePath })).toBe(1);
            expect(failed[0]).toMatch(/^FAIL modules\/a\.mjs/);
        });
    });
});
