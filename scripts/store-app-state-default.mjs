#!/usr/bin/env node
/**
 * Store the entire app_state.json as public/app_state.default.json.
 * Run from project root: node scripts/store-app-state-default.mjs
 *
 * Copies the full parsed state with no field resets. Unlike
 * scripts/refresh-app-state-default.mjs, this does not sanitize selection
 * fields (currentResumeId, selected card/job/element ids, scrollPositions,
 * lastUpdated, or legacy layout keys).
 */
import fs from 'fs/promises';
import path from 'path';
import { reportError } from '../modules/utils/errorReporting.mjs';

const projectRoot = process.cwd();
const statePath = path.join(projectRoot, 'app_state.json');
const defaultPath = path.join(projectRoot, 'public', 'app_state.default.json');

async function main() {
  await fs.access(statePath);
  const raw = await fs.readFile(statePath, 'utf-8');
  const state = JSON.parse(raw);
  await fs.writeFile(defaultPath, JSON.stringify(state, null, 2) + '\n', 'utf-8');
  console.log('[store-app-state-default] Wrote', defaultPath);
}

main().catch((e) => {
  if (e.code === 'ENOENT' && e.path === statePath) {
    reportError(
      new Error(`No app_state.json found at ${statePath}; create one first or copy from a backup.`),
      '[store-app-state-default] Failed to read app state'
    );
  } else {
    reportError(e, '[store-app-state-default] Failed to store app state default');
  }
  process.exitCode = 1;
});
