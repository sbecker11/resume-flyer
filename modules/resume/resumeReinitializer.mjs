/**
 * Single path to reinitialize the resume system (Timeline, CardsController, resume list)
 * after loading a different resume (parsed resume id or default).
 *
 * Pass the resume id directly — currentResumeId is not stored in app_state (content-scoped).
 *   await reinitializeResumeSystem(resumeId)
 *
 * Registration: components that own Timeline, CardsController, and the resume list
 * register their reinit functions so this module can orchestrate without importing composables.
 */

import { getGlobalJobsDependency } from '@/modules/composables/useJobsDependency.mjs';

let timelineReinit = null;
let cardsReinit = null;
let resumeListReinit = null;
let getBizCardDivs = null;

export function registerTimelineReinit(fn) {
  timelineReinit = fn;
}

export function registerCardsReinit(fn) {
  cardsReinit = fn;
}

/** fn(bizCardDivs) — rebuild resume list from scene card divs */
export function registerResumeListReinit(fn) {
  resumeListReinit = fn;
}

export function registerGetBizCardDivs(fn) {
  getBizCardDivs = fn;
}

/**
 * Rebuild the resume listing from current scene biz-card divs (or job-count placeholders).
 * Safe to call after cards finish init even when initializeResumeSystem ran earlier.
 * @returns {Promise<boolean>} true when rebuild ran
 */
export async function rebuildResumeListFromSceneCards() {
  if (typeof resumeListReinit !== 'function') {
    console.warn('[resumeReinitializer] rebuildResumeListFromSceneCards: resume list reinit not registered yet');
    return false;
  }
  const jobsDependency = getGlobalJobsDependency();
  const jobs = jobsDependency.getJobsData?.() ?? [];
  let bizCardDivs = typeof getBizCardDivs === 'function' ? getBizCardDivs() : [];
  if ((!Array.isArray(bizCardDivs) || bizCardDivs.filter(Boolean).length === 0) && Array.isArray(jobs) && jobs.length > 0) {
    bizCardDivs = jobs.map((_, index) => {
      const el = document.createElement('div');
      el.setAttribute('data-job-number', String(index));
      return el;
    });
  }
  await resumeListReinit(bizCardDivs ?? []);
  return true;
}

/**
 * Load jobs for the given resume id and reinitialize Timeline, CardsController, and resume list.
 * @param {string | null} resumeId - Parsed resume id, or null for default (static content).
 * @returns {Promise<void>}
 */
export async function reinitializeResumeSystem(resumeId) {
  const jobsDependency = getGlobalJobsDependency();
  // Use the return value directly: loadJobs returns [] when resumeId is null without
  // clearing jobsState.data, so getJobsData() would return stale old-resume jobs.
  const jobsData = await jobsDependency.loadJobs({ force: true, forceResumeId: resumeId ?? null });
  if (!Array.isArray(jobsData) || jobsData.length === 0) {
    console.warn('[resumeReinitializer] No jobs data after load — clearing scene and resume list');
    // Clear old cards so deleted resume content doesn't linger
    if (typeof cardsReinit === 'function') await cardsReinit();
    if (typeof resumeListReinit === 'function') await resumeListReinit([]);
    return;
  }

  if (typeof timelineReinit === 'function') {
    timelineReinit(jobsData);
  } else {
    console.warn('[resumeReinitializer] Timeline reinit not registered');
  }

  if (typeof cardsReinit === 'function') {
    await cardsReinit();
  } else {
    console.warn('[resumeReinitializer] Cards reinit not registered');
  }

  const bizCardDivs = typeof getBizCardDivs === 'function' ? getBizCardDivs() : [];
  if (typeof resumeListReinit === 'function') {
    await resumeListReinit(bizCardDivs ?? []);
  } else {
    console.warn('[resumeReinitializer] Resume list reinit not registered');
  }
}
