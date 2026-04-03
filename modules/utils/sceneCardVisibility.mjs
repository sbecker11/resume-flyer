/**
 * Scene card visibility for keyboard tab cycles, focus order, and DOM passes that must
 * not target both an original cDiv and its clone.
 *
 * When a card is selected, the original is hidden (force-hidden-for-clone / display:none)
 * and the clone is shown; only one should participate in tab order.
 */

/**
 * @param {Element | null | undefined} el
 * @returns {boolean}
 */
export function isSceneCardRootElement(el) {
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
  return el.classList.contains('biz-card-div') || el.classList.contains('skill-card-div');
}

/**
 * True if this scene card root is the instance the user sees (original OR clone, not both).
 * @param {Element} el
 * @returns {boolean}
 */
export function isVisibleSceneCardRoot(el) {
  if (!isSceneCardRootElement(el)) return false;
  if (el.classList.contains('force-hidden-for-clone')) return false;
  if (el.classList.contains('clone-hidden')) return false;
  if (typeof getComputedStyle === 'function') {
    const cs = getComputedStyle(el);
    if (cs.display === 'none') return false;
  }
  return true;
}

/**
 * Visible biz-card-div and skill-card-div roots under #scene-plane (or given root), in DOM order.
 * Callers that need visual order should sort with {@link compareSceneCardsTopLeft}.
 *
 * @param {ParentNode | null | undefined} [scenePlane]
 * @returns {HTMLElement[]}
 */
export function listVisibleSceneCardRoots(scenePlane) {
  const root =
    scenePlane && scenePlane.querySelector
      ? scenePlane
      : typeof document !== 'undefined'
        ? document.getElementById('scene-plane')
        : null;
  if (!root) return [];
  return Array.from(root.querySelectorAll('.biz-card-div, .skill-card-div')).filter(isVisibleSceneCardRoot);
}

/**
 * Top-to-bottom, then left-to-right (reading order for scene layout).
 * @param {HTMLElement} a
 * @param {HTMLElement} b
 * @returns {number}
 */
export function compareSceneCardsTopLeft(a, b) {
  const ra = a.getBoundingClientRect();
  const rb = b.getBoundingClientRect();
  const dy = ra.top - rb.top;
  if (Math.abs(dy) > 1) return dy;
  return ra.left - rb.left;
}
