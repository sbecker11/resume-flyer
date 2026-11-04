#!/usr/bin/env node
/**
 * console.error ratchet: counts `console.error(` per source file and compares the counts with
 * scripts/console-error-baseline.json. A file above its baseline fails (exit 1); a file below its
 * baseline passes and, with --update, the baseline is lowered to the new count. The number can
 * only go down. New files start at a baseline of 0, so every new console.error must go through
 * reportError() from modules/utils/errorReporting.mjs instead. The one time --update writes
 * current counts as-is is when no baseline file exists yet (bootstrapping the ratchet).
 *
 *   node scripts/check-console-error-ratchet.mjs            # check (CI)
 *   node scripts/check-console-error-ratchet.mjs --update   # lower the baseline to current counts
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(__dirname, '..');
export const BASELINE_FILENAME = 'console-error-baseline.json';
export const DEFAULT_BASELINE_PATH = path.join(__dirname, BASELINE_FILENAME);

export const SCAN_EXTENSIONS = ['.mjs', '.ts', '.vue'];
export const SCAN_ROOTS = ['modules', 'server.mjs'];
export const EXCLUDED_DIRS = ['scripts', 'node_modules', 'dist', 'color-palette-utils-ts'];
export const EXCLUDED_FILES = [
    'modules/utils/errorReporting.mjs',
    'modules/utils/logger.mjs',
    'modules/utils/paletteS3LoudError.mjs',
];

const CONSOLE_ERROR_RE = /console\.error\(/g;

const toPosix = (p) => p.split(path.sep).join('/');

/**
 * Whether a project-relative (posix) path takes part in the scan.
 * @param {string} relPath
 */
export function isScannedPath(relPath) {
    const rel = toPosix(relPath);
    const segments = rel.split('/');
    if (segments.some((s) => EXCLUDED_DIRS.includes(s))) return false;
    if (rel.endsWith('.test.mjs') || rel.endsWith('.md')) return false;
    if (EXCLUDED_FILES.includes(rel)) return false;
    if (!SCAN_EXTENSIONS.some((ext) => rel.endsWith(ext))) return false;
    return segments[0] === 'modules' || rel === 'server.mjs';
}

/**
 * Project-relative (posix) paths of every file the ratchet scans under rootDir.
 * @param {string} rootDir
 * @returns {string[]} sorted
 */
export function listScanFiles(rootDir) {
    const out = [];
    const walk = (dirAbs) => {
        for (const entry of fs.readdirSync(dirAbs, { withFileTypes: true })) {
            const abs = path.join(dirAbs, entry.name);
            const rel = toPosix(path.relative(rootDir, abs));
            if (entry.isDirectory()) {
                if (!EXCLUDED_DIRS.includes(entry.name)) walk(abs);
            } else if (isScannedPath(rel)) {
                out.push(rel);
            }
        }
    };
    for (const root of SCAN_ROOTS) {
        const abs = path.join(rootDir, root);
        if (!fs.existsSync(abs)) continue;
        if (fs.statSync(abs).isDirectory()) walk(abs);
        else if (isScannedPath(root)) out.push(root);
    }
    return out.sort();
}

/** @param {string} source */
export function countConsoleErrors(source) {
    return (source.match(CONSOLE_ERROR_RE) || []).length;
}

/**
 * Counts for every scanned file, keyed by project-relative path. Files with zero calls are omitted.
 * @param {string} rootDir
 * @returns {Record<string, number>}
 */
export function collectCounts(rootDir) {
    const counts = {};
    for (const rel of listScanFiles(rootDir)) {
        const n = countConsoleErrors(fs.readFileSync(path.join(rootDir, rel), 'utf-8'));
        if (n > 0) counts[rel] = n;
    }
    return counts;
}

/**
 * Pure comparison of current counts against the baseline.
 * @param {Record<string, number>} counts   current counts (zero-count files may be omitted)
 * @param {Record<string, number>} baseline committed baseline ({ "<path>": count })
 * @returns {{
 *   over: Array<{ file: string, count: number, baseline: number }>,
 *   under: Array<{ file: string, count: number, baseline: number }>,
 *   nextBaseline: Record<string, number>,
 *   total: number,
 * }}
 */
export function compareWithBaseline(counts, baseline) {
    const over = [];
    const under = [];
    const nextBaseline = {};
    const files = new Set([...Object.keys(counts), ...Object.keys(baseline)]);
    for (const file of [...files].sort()) {
        const count = counts[file] ?? 0;
        const allowed = baseline[file] ?? 0;
        if (count > allowed) over.push({ file, count, baseline: allowed });
        else if (count < allowed) under.push({ file, count, baseline: allowed });
        const next = Math.min(count, allowed);
        if (next > 0) nextBaseline[file] = next;
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    return { over, under, nextBaseline, total };
}

/** @param {string} baselinePath */
export function readBaseline(baselinePath) {
    if (!fs.existsSync(baselinePath)) return {};
    const parsed = JSON.parse(fs.readFileSync(baselinePath, 'utf-8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error(`${baselinePath} must be a JSON object of { "<path>": count }`);
    }
    for (const [file, count] of Object.entries(parsed)) {
        if (!Number.isInteger(count) || count < 0) {
            throw new Error(`${baselinePath}: "${file}" has a non-integer or negative count (${count})`);
        }
    }
    return parsed;
}

/**
 * @param {string} baselinePath
 * @param {Record<string, number>} baseline
 */
export function writeBaseline(baselinePath, baseline) {
    const sorted = Object.fromEntries(Object.entries(baseline).sort(([a], [b]) => a.localeCompare(b)));
    fs.writeFileSync(baselinePath, `${JSON.stringify(sorted, null, 2)}\n`, 'utf-8');
}

/**
 * Run the ratchet. Pure apart from reading sources and (with update) writing the baseline.
 * @param {{ rootDir?: string, baselinePath?: string, update?: boolean }} [options]
 * @returns {{ exitCode: number, lines: string[], result: ReturnType<typeof compareWithBaseline>, baselineWritten: boolean }}
 */
export function runRatchet({ rootDir = PROJECT_ROOT, baselinePath = DEFAULT_BASELINE_PATH, update = false } = {}) {
    const counts = collectCounts(rootDir);
    const lines = [];
    const baselineRel = toPosix(path.relative(rootDir, baselinePath));

    if (update && !fs.existsSync(baselinePath)) {
        const result = compareWithBaseline(counts, counts);
        writeBaseline(baselinePath, counts);
        lines.push(`Wrote initial baseline ${baselineRel}: ${result.total} call(s) across ${Object.keys(counts).length} file(s)`);
        return { exitCode: 0, lines, result, baselineWritten: true };
    }

    const baseline = readBaseline(baselinePath);
    const result = compareWithBaseline(counts, baseline);
    let baselineWritten = false;

    for (const { file, count, baseline: allowed } of result.over) {
        lines.push(
            `FAIL ${file}: ${count} console.error( call${count === 1 ? '' : 's'}, baseline is ${allowed}. `
            + 'Report through reportError(error, context, remedy) from modules/utils/errorReporting.mjs instead.'
        );
    }
    for (const { file, count, baseline: allowed } of result.under) {
        lines.push(`note ${file}: ${count} console.error( call${count === 1 ? '' : 's'}, below baseline ${allowed}`);
    }

    if (result.over.length > 0) {
        lines.push(`console.error ratchet: ${result.over.length} file(s) above baseline (total ${result.total}). Baseline: ${baselineRel}`);
        return { exitCode: 1, lines, result, baselineWritten };
    }

    if (result.under.length > 0) {
        if (update) {
            writeBaseline(baselinePath, result.nextBaseline);
            baselineWritten = true;
            lines.push(`Lowered baseline for ${result.under.length} file(s) in ${baselineRel}`);
        } else {
            lines.push(`${result.under.length} file(s) below baseline; run with --update to lower the baseline`);
        }
    }

    lines.push(`console.error ratchet OK: ${result.total} call(s) across ${Object.keys(counts).length} file(s), none above baseline`);
    return { exitCode: 0, lines, result, baselineWritten };
}

/**
 * CLI entry. Returns the exit code instead of exiting so it can be tested.
 * @param {string[]} argv
 * @param {{ log?: (line: string) => void, rootDir?: string, baselinePath?: string }} [io]
 */
export function main(argv = [], { log = console.log, rootDir, baselinePath } = {}) {
    const update = argv.includes('--update');
    const { exitCode, lines } = runRatchet({ rootDir, baselinePath, update });
    for (const line of lines) log(line);
    return exitCode;
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isDirectRun) {
    process.exit(main(process.argv.slice(2)));
}
