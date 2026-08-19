// Utility functions for BizCard operations

export const createBizCardDivId = (jobNumber) => `biz-card-div-${jobNumber}`;

export const createBizCardDetailsDivId = (jobNumber) => `biz-card-details-div-${jobNumber}`;

export const createBizCardDetailsDivClass = () => 'biz-card-details-div';

/**
 * Sparse array keyed by data-job-number so holes (section-label rows with no card) stay empty.
 * @param {Iterable<{ getAttribute?: (name: string) => string|null }|null|undefined>} elements
 * @returns {Array<unknown>}
 */
export function indexElementsByJobNumber(elements) {
  const byJob = [];
  if (!elements) return byJob;
  for (const el of elements) {
    if (!el || typeof el.getAttribute !== 'function') continue;
    const n = parseInt(el.getAttribute('data-job-number'), 10);
    if (Number.isNaN(n)) continue;
    byJob[n] = el;
  }
  return byJob;
}