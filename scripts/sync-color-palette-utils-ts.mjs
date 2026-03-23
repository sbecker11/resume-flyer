#!/usr/bin/env node
/**
 * Copy the color-palette-utils-ts package into repo root as color-palette-utils-ts/,
 * then npm install + npm run build there, and npm install at resume-flyer root
 * so file:./color-palette-utils-ts stays linked (see package.json + docs/PALETTE-UTILS-TS-MIGRATION-PLAN.md).
 *
 * Default source (overridable): see DEFAULT_SOURCE below.
 *
 * Usage (prefer `node …`; for ./script, chmod +x first):
 *   node scripts/sync-color-palette-utils-ts.mjs                    # uses DEFAULT_SOURCE
 *   node scripts/sync-color-palette-utils-ts.mjs <SOURCE_DIR>       # copy FROM → ./color-palette-utils-ts
 *   PALETTE_UTILS_TS_SOURCE=<SOURCE_DIR> node scripts/sync-color-palette-utils-ts.mjs
 *   chmod +x scripts/sync-color-palette-utils-ts.mjs && ./scripts/sync-color-palette-utils-ts.mjs
 *   npm run sync-color-palette-utils-ts
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

/** Log / docs prefix (must match script filename stem: sync-color-palette-utils-ts.mjs) */
const SCRIPT_NAME = 'sync-color-palette-utils-ts';

/** Default package folder to copy from when no argv / PALETTE_UTILS_TS_SOURCE */
const DEFAULT_SOURCE =
    '/Users/sbecker11/workspace-color-palette/color-palette-maker/color-palette-utils-ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dest = path.join(root, 'color-palette-utils-ts');

const sourceArg =
    (process.argv[2] && String(process.argv[2]).trim()) ||
    (process.env.PALETTE_UTILS_TS_SOURCE && String(process.env.PALETTE_UTILS_TS_SOURCE).trim()) ||
    DEFAULT_SOURCE;

const srcResolved = path.resolve(sourceArg.trim());
let srcStat;
try {
    srcStat = fs.statSync(srcResolved);
} catch (e) {
    console.error(`${SCRIPT_NAME}: source does not exist:`, srcResolved);
    console.error(e.message);
    process.exit(1);
}
if (!srcStat.isDirectory()) {
    console.error(`${SCRIPT_NAME}: source must be a directory:`, srcResolved);
    process.exit(1);
}

const srcPkg = path.join(srcResolved, 'package.json');
if (!fs.existsSync(srcPkg)) {
    console.error(`${SCRIPT_NAME}: no package.json in source:`, srcResolved);
    process.exit(1);
}
try {
    const pkg = JSON.parse(fs.readFileSync(srcPkg, 'utf8'));
    if (pkg.name && pkg.name !== 'color-palette-utils-ts') {
        console.warn(
            `${SCRIPT_NAME}: warning — package.json name is`,
            JSON.stringify(pkg.name),
            '(expected "color-palette-utils-ts"). Imports may break.'
        );
    }
} catch (e) {
    console.error(`${SCRIPT_NAME}: could not read/parse source package.json:`, e.message);
    process.exit(1);
}

function run(cmd, args, cwd) {
    const r = spawnSync(cmd, args, {
        cwd,
        stdio: 'inherit',
        shell: false,
        env: process.env
    });
    if (r.status !== 0) {
        console.error(`${SCRIPT_NAME}: command failed (${cmd} ${args.join(' ')}) in ${cwd}`);
        process.exit(r.status ?? 1);
    }
}

console.log(`${SCRIPT_NAME}: copying\n  from`, srcResolved, '\n  to  ', dest);
fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.cpSync(srcResolved, dest, { recursive: true });

const nm = path.join(dest, 'node_modules');
if (fs.existsSync(nm)) {
    console.log(`${SCRIPT_NAME}: removing copied node_modules for a clean install`);
    fs.rmSync(nm, { recursive: true, force: true });
}

console.log(`${SCRIPT_NAME}: npm install in color-palette-utils-ts`);
run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install'], dest);

console.log(`${SCRIPT_NAME}: npm run build in color-palette-utils-ts`);
run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], dest);

console.log(`${SCRIPT_NAME}: npm install at repo root (refresh file: link)`);
run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install'], root);

console.log(`${SCRIPT_NAME}: done.`);
