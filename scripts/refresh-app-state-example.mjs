#!/usr/bin/env node
/**
 * Refresh app_state.example.json from app_state.json with sanitized values.
 * Run from project root: node scripts/refresh-app-state-example.mjs
 *
 * Use when app_state.json has new properties (e.g. after migrations) so the
 * example stays in sync. User-specific fields are reset to safe defaults.
 */
import fs from 'fs/promises';
import path from 'path';

const projectRoot = process.cwd();
const statePath = path.join(projectRoot, 'app_state.json');
const examplePath = path.join(projectRoot, 'app_state.example.json');

function sanitize(state) {
  const out = JSON.parse(JSON.stringify(state));

  // Remove legacy top-level keys (current schema uses user-settings.* and system-constants.*)
  delete out.layout;
  delete out.resizeHandle;

  if (out['user-settings']) {
    out['user-settings'].currentResumeId = 'default';
    out['user-settings'].lastVisitedJobNumber = undefined;
    out['user-settings'].selectedJobNumber = undefined;
    out['user-settings'].selectedElementId = undefined;
    out['user-settings'].selectedDualElementId = undefined;
    if (out['user-settings'].scrollPositions) {
      out['user-settings'].scrollPositions = {};
    }
  }

  out.lastUpdated = new Date().toISOString().replace(/T.*/, 'T00:00:00.000Z'); // generic

  return out;
}

async function main() {
  await fs.access(statePath);
  const raw = await fs.readFile(statePath, 'utf-8');
  const state = JSON.parse(raw);
  const safe = sanitize(state);
  await fs.writeFile(examplePath, JSON.stringify(safe, null, 2) + '\n', 'utf-8');
  console.log('[refresh-app-state-example] Wrote', examplePath);
}

main().catch((e) => {
  if (e.code === 'ENOENT' && e.path === statePath) {
    console.error('[refresh-app-state-example] No app_state.json found; create one first or copy from a backup.');
  } else {
    console.error('[refresh-app-state-example] Failed:', e.message);
  }
  process.exitCode = 1;
});
