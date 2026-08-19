/**
 * Outline indices (e.g. "1", "1.1", "1.1.10") are for sort/nesting only.
 * Canonical heading tag: `[1.1.3] Adobe` — used for sort, stripped when rendering.
 */

const OUTLINE_INDEX_RE = /^\d+(?:\.\d+)*$/;
const LEADING_OUTLINE_DISPLAY_RE = /^\d+(?:\.\d+)*\.\s*[•·]?\s*/;
const CONTENT_INDEX_TAG_RE = /^\[(\d+(?:\.\d+)*)\]\s*/;

/**
 * @param {unknown} value
 * @returns {number[]|null} numeric segments, or null if missing/invalid
 */
export function parseOutlineIndex(value) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s || !OUTLINE_INDEX_RE.test(s)) return null;
  return s.split('.').map((part) => Number(part));
}

/**
 * @param {unknown} value
 * @returns {string} canonical dotted form, or ''
 */
export function normalizeOutlineIndex(value) {
  const parts = parseOutlineIndex(value);
  return parts ? parts.join('.') : '';
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isValidOutlineIndex(value) {
  if (value == null) return false;
  const s = String(value).trim();
  if (!s) return true;
  return OUTLINE_INDEX_RE.test(s);
}

/**
 * Parent-before-child, numeric segments so 1.1.10 follows 1.1.9.
 * Missing/invalid indices sort after valid ones.
 * @param {unknown} a
 * @param {unknown} b
 * @returns {number}
 */
export function compareOutlineIndex(a, b) {
  const pa = parseOutlineIndex(a);
  const pb = parseOutlineIndex(b);
  if (!pa && !pb) return 0;
  if (!pa) return 1;
  if (!pb) return -1;
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const va = i < pa.length ? pa[i] : -1;
    const vb = i < pb.length ? pb[i] : -1;
    if (va !== vb) return va - vb;
  }
  return 0;
}

/**
 * Nest indent level: "1" → 0, "1.1" → 1, "1.1.3" → 2.
 * @param {unknown} value
 * @returns {number}
 */
export function outlineNestDepth(value) {
  const parts = parseOutlineIndex(value);
  if (!parts) return 0;
  return Math.max(0, parts.length - 1);
}

/**
 * Immediate parent path: "1.1.3" → "1.1", "1" → "".
 * @param {unknown} value
 * @returns {string}
 */
export function parentOutlineIndex(value) {
  const parts = parseOutlineIndex(value);
  if (!parts || parts.length < 2) return '';
  return parts.slice(0, -1).join('.');
}

/**
 * @param {unknown} text
 * @returns {{ index: string, rest: string }}
 */
export function extractContentIndexTag(text) {
  const raw = String(text ?? '').trim();
  const m = raw.match(CONTENT_INDEX_TAG_RE);
  if (!m) return { index: '', rest: raw };
  return { index: normalizeOutlineIndex(m[1]), rest: raw.slice(m[0].length).trim() };
}

/**
 * @param {unknown} index
 * @returns {string} `[1.1.3]` or ''
 */
export function formatContentIndexTag(index) {
  const n = normalizeOutlineIndex(index);
  return n ? `[${n}]` : '';
}

/**
 * Attach or replace the heading tag: `[1.2.1] Adobe`.
 * @param {unknown} index
 * @param {unknown} heading
 * @returns {string}
 */
export function formatContentIndexHeading(index, heading) {
  const rest = extractContentIndexTag(heading).rest.replace(LEADING_OUTLINE_DISPLAY_RE, '').trim();
  const tag = formatContentIndexTag(index);
  if (!tag) return rest;
  return rest ? `${tag} ${rest}` : tag;
}

/**
 * Strip `[1.1.3]` and legacy `1.1.` prefixes from a display string.
 * Does not strip bare integers ("3 yrs …").
 * @param {unknown} text
 * @returns {string}
 */
export function stripDisplayedOutlineIndex(text) {
  const { rest } = extractContentIndexTag(text);
  if (!rest) return '';
  return rest.replace(LEADING_OUTLINE_DISPLAY_RE, '').trim();
}

/**
 * Field `outlineIndex`, else `[1.2.1]` on employer/label/title.
 * @param {unknown} job
 * @returns {string}
 */
export function outlineIndexOf(job) {
  if (job == null || typeof job !== 'object') return '';
  const fromField = normalizeOutlineIndex(/** @type {{ outlineIndex?: unknown }} */ (job).outlineIndex);
  if (fromField) return fromField;
  for (const key of ['employer', 'label', 'title']) {
    const fromHeading = extractContentIndexTag(/** @type {Record<string, unknown>} */ (job)[key]).index;
    if (fromHeading) return fromHeading;
  }
  return '';
}

/**
 * Visible employer/heading with the content-index tag removed.
 * @param {unknown} job
 * @returns {string}
 */
export function displayJobHeading(job) {
  if (job == null || typeof job !== 'object') return '';
  const raw = /** @type {{ employer?: unknown, label?: unknown, title?: unknown }} */ (job);
  return stripDisplayedOutlineIndex(raw.employer || raw.label || raw.title || '');
}

/**
 * @param {unknown[]} jobs
 * @returns {boolean}
 */
export function jobsHaveOutlineIndex(jobs) {
  if (!Array.isArray(jobs)) return false;
  return jobs.some((job) => outlineIndexOf(job) !== '');
}
