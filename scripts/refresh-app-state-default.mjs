#!/usr/bin/env node
/**
 * Refresh app_state.default.json from app_state.json with sanitized values.
 * Run from project root: node scripts/refresh-app-state-default.mjs
 *
 * Use when app_state.json has new properties (e.g. after migrations) so the
 * default stays in sync. User-specific fields are reset to safe defaults.
 */
import fs from 'fs/promises';
import path from 'path';

const projectRoot = process.cwd();
const statePath = path.join(projectRoot, 'app_state.json');
const defaultPath = path.join(projectRoot, 'public', 'app_state.default.json');

function sanitize(state) {
  const out = JSON.parse(JSON.stringify(state));

  // Remove legacy top-level keys (current schema uses user-settings.* and system-constants.*)
  delete out.layout;
  delete out.resizeHandle;

  if (out['user-settings']) {
    out['user-settings'].currentResumeId = 'default';
    out['user-settings'].selectedCard = null;
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
  await fs.writeFile(defaultPath, JSON.stringify(safe, null, 2) + '\n', 'utf-8');
  console.log('[refresh-app-state-default] Wrote', defaultPath);
}

main().catch((e) => {
  if (e.code === 'ENOENT' && e.path === statePath) {
    console.error('[refresh-app-state-default] No app_state.json found; create one first or copy from a backup.');
  } else {
    console.error('[refresh-app-state-default] Failed:', e.message);
  }
  process.exitCode = 1;
});
