#!/usr/bin/env node
/**
 * Store the entire app_state.json as public/app_state.default.json.
 * Run from project root: node scripts/store-app-state-default.mjs
 *
 * Copies the full parsed state with no field resets. Unlike
 * scripts/refresh-app-state-default.mjs, this does not sanitize selection
 * fields (currentResumeId, selectedBizCard, selectedSkillCard, scrollPositions,
 * lastUpdated, or legacy layout keys).
 */
import fs from 'fs/promises';
import path from 'path';
import { reportError } from '../modules/utils/errorReporting.mjs';

const projectRoot = process.cwd();
const statePath = path.join(projectRoot, 'app_state.json');
const defaultPath = path.join(projectRoot, 'public', 'app_state.default.json');

/**
 * @param {unknown} stored
 * @param {string} prefix
 * @returns {string}
 */
function storedCardDomId(stored, prefix) {
  const id = stored && typeof stored === 'object' ? stored['card-id'] : null;
  if (typeof id !== 'number' || !Number.isInteger(id) || id < 0) return '(none)';
  return `${prefix}${id}`;
}

/**
 * @param {object} state
 * @returns {string}
 */
function storedFocalPointMode(state) {
  const settings = state?.['user-settings'];
  const mode = settings?.focalPoint?.mode ?? settings?.focalPointMode;
  if (mode == null || mode === '') {
    const err = new Error('Stored state has no focalPoint.mode or focalPointMode.');
    reportError(err, '[store-app-state-default] Cannot report focal-point-mode');
    throw err;
  }
  return String(mode);
}

async function main() {
  await fs.access(statePath);
  const raw = await fs.readFile(statePath, 'utf-8');
  const state = JSON.parse(raw);
  await fs.writeFile(defaultPath, JSON.stringify(state, null, 2) + '\n', 'utf-8');
  const settings = state?.['user-settings'] || {};
  console.log('[store-app-state-default] Wrote', defaultPath);
  console.log('[store-app-state-default] selected-biz-card-id:', storedCardDomId(settings.selectedBizCard, 'biz-card-div-'));
  console.log('[store-app-state-default] selected-skill-card-id:', storedCardDomId(settings.selectedSkillCard, 'skill-card-div-'));
  console.log('[store-app-state-default] focal-point-mode:', storedFocalPointMode(state));
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
