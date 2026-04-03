/**
 * When a biz card (job) is selected, move focus to the first tabbable control inside
 * the corresponding resume row (rDiv) and/or scene card (cDiv), so Tab continues from there.
 */

import { isVisibleSceneCardRoot } from '@/modules/utils/sceneCardVisibility.mjs';

/**
 * @param {Element | null | undefined} el
 * @returns {boolean}
 */
function isInResumeListingViewport(el) {
  if (!el) return false;
  const port = document.getElementById('resume-content-listing');
  if (!port) return true;
  const er = el.getBoundingClientRect();
  const pr = port.getBoundingClientRect();
  return er.bottom > pr.top && er.top < pr.bottom;
}

/**
 * @param {Element} el
 * @returns {boolean}
 */
function isCssVisible(el) {
  if (!(el instanceof HTMLElement)) return false;
  if (typeof el.checkVisibility === 'function') {
    return el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
  }
  const cs = getComputedStyle(el);
  return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
}

/**
 * @param {number} jobNumber
 * @returns {HTMLElement | null}
 */
function getVisibleBizCardRootForJob(jobNumber) {
  if (jobNumber == null || Number.isNaN(jobNumber)) return null;
  const clone = document.getElementById(`biz-card-div-${jobNumber}-clone`);
  const orig = document.getElementById(`biz-card-div-${jobNumber}`);
  if (clone && isVisibleSceneCardRoot(clone)) return clone;
  if (orig && isVisibleSceneCardRoot(orig)) return orig;
  return clone || orig;
}

/**
 * @param {number} jobNumber
 * @returns {HTMLElement | null}
 */
function getPrimaryRDivForFocus(jobNumber) {
  const all = Array.from(
    document.querySelectorAll(`.biz-resume-div[data-job-number="${jobNumber}"]`)
  ).filter((el) => !el.classList.contains('r-div-removed-from-listing'));

  const selected = all.find((el) => el.classList.contains('selected'));
  if (selected && isInResumeListingViewport(selected)) return selected;

  const inView = all.filter(isInResumeListingViewport);
  if (inView.length) {
    return inView.sort((a, b) => {
      const pos = a.compareDocumentPosition(b);
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      return 0;
    })[0];
  }

  return selected || all[0] || null;
}

/**
 * @param {HTMLElement} root
 * @returns {HTMLElement[]}
 */
function listTabbableInTreeOrder(root) {
  if (!root) return [];
  const selector = 'a[href], button, input, select, textarea, [tabindex]';
  const nodes = Array.from(root.querySelectorAll(selector));
  const out = [];
  for (const el of nodes) {
    if (!(el instanceof HTMLElement)) continue;
    if (el.disabled) continue;
    if (el.getAttribute('tabindex') === '-1') continue;
    if (el.tabIndex < 0) continue;
    if (el.getAttribute('aria-hidden') === 'true') continue;
    if (!isCssVisible(el)) continue;
    out.push(el);
  }
  out.sort((a, b) => {
    const aT = a.tabIndex > 0 ? a.tabIndex : 1_000_000;
    const bT = b.tabIndex > 0 ? b.tabIndex : 1_000_000;
    if (aT !== bT) return aT - bT;
    const pos = a.compareDocumentPosition(b);
    if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    return 0;
  });
  return out;
}

/**
 * @returns {boolean}
 */
function shouldSkipAutofocusForModal() {
  const el = document.activeElement;
  if (!el || el === document.body) return false;
  if (el.closest?.('.rde-overlay, .rde-modal, [role="dialog"][aria-modal="true"]')) return true;
  // Open resume dropdown renders this menu; don't steal focus from it
  if (el.closest?.('.resume-selector-menu')) return true;
  return false;
}

/**
 * @param {number} jobNumber
 * @returns {HTMLElement | null}
 */
export function getFirstTabTargetForSelectedBizJob(jobNumber) {
  const rDiv = getPrimaryRDivForFocus(jobNumber);
  const cDiv = getVisibleBizCardRootForJob(jobNumber);

  const candidates = [];
  if (rDiv) {
    const first = listTabbableInTreeOrder(rDiv)[0];
    if (first) candidates.push(first);
  }
  if (cDiv) {
    const first = listTabbableInTreeOrder(cDiv)[0];
    if (first) candidates.push(first);
  }
  if (candidates.length === 0) return null;

  let best = candidates[0];
  for (let i = 1; i < candidates.length; i++) {
    const c = candidates[i];
    if (best.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_PRECEDING) {
      best = c;
    }
  }
  return best;
}

/**
 * @param {number} jobNumber
 * @returns {boolean} true if focus was applied
 */
export function focusFirstTabTargetForSelectedBizJob(jobNumber) {
  if (shouldSkipAutofocusForModal()) return false;

  const active = document.activeElement;
  const rDiv = getPrimaryRDivForFocus(jobNumber);
  const cDiv = getVisibleBizCardRootForJob(jobNumber);
  if (active instanceof HTMLElement && active !== document.body) {
    if ((rDiv && rDiv.contains(active)) || (cDiv && cDiv.contains(active))) {
      return false;
    }
  }

  const target = getFirstTabTargetForSelectedBizJob(jobNumber);
  if (!target || typeof target.focus !== 'function') return false;
  try {
    target.focus();
    return document.activeElement === target;
  } catch {
    return false;
  }
}

/**
 * @param {{ eventTarget?: EventTarget }} selectionManager
 * @returns {() => void}
 */
export function installBizSelectionFocus(selectionManager) {
  const target = selectionManager?.eventTarget;
  if (!target || typeof target.addEventListener !== 'function') {
    return () => {};
  }

  const schedule = (jobNumber) => {
    const tryRun = () => focusFirstTabTargetForSelectedBizJob(jobNumber);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (tryRun()) return;
        window.setTimeout(() => {
          if (tryRun()) return;
          window.setTimeout(() => {
            tryRun();
          }, 120);
        }, 50);
      });
    });
  };

  /** @param {Event} ev */
  const onCardSelected = (ev) => {
    const card = ev.detail?.card;
    if (!card || card.type !== 'biz' || typeof card.jobNumber !== 'number') return;
    schedule(card.jobNumber);
  };

  target.addEventListener('card-selected', onCardSelected);
  return () => target.removeEventListener('card-selected', onCardSelected);
}
