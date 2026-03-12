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
 * Load jobs for the given resume id and reinitialize Timeline, CardsController, and resume list.
 * @param {string | null} resumeId - Parsed resume id, or null for default (static content).
 * @returns {Promise<void>}
 */
export async function reinitializeResumeSystem(resumeId) {
  const jobsDependency = getGlobalJobsDependency();
  await jobsDependency.loadJobs({ force: true, forceResumeId: resumeId ?? null });
  const jobsData = jobsDependency.getJobsData();
  if (!Array.isArray(jobsData) || jobsData.length === 0) {
    console.warn('[resumeReinitializer] No jobs data after load');
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
  if (typeof resumeListReinit === 'function' && bizCardDivs && bizCardDivs.length > 0) {
    await resumeListReinit(bizCardDivs);
  } else if (!resumeListReinit) {
    console.warn('[resumeReinitializer] Resume list reinit not registered');
  }
}
