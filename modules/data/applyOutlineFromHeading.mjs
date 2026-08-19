/**
 * Extract `[1.1.3]` content-index tags from job headings into outlineIndex / outlineKind.
 * Strips the tag from employer (and role when tag was there). Idempotent when outlineIndex is set.
 */

import {
  extractContentIndexTag,
  normalizeOutlineIndex,
} from '../utils/outlineIndex.mjs';

/**
 * @param {Record<string, unknown>} job
 * @returns {Record<string, unknown>}
 */
export function applyOutlineFromHeading(job) {
  if (!job || typeof job !== 'object') return job;
  const out = { ...job };

  if (!normalizeOutlineIndex(out.outlineIndex)) {
    for (const key of ['employer', 'label', 'title', 'role']) {
      const raw = out[key];
      if (raw == null || String(raw).trim() === '') continue;
      const { index, rest } = extractContentIndexTag(raw);
      if (!index) continue;
      out.outlineIndex = index;
      if (rest) out[key] = rest;
      else delete out[key];
      break;
    }
  } else {
    out.outlineIndex = normalizeOutlineIndex(out.outlineIndex);
  }

  if (out.outlineKind !== 'section' && out.outlineIndex) {
    const start = String(out.start || '').trim();
    const end = String(out.end || '').trim();
    const desc = String(out.Description ?? out.description ?? '').trim();
    const role = String(out.role || out.title || '').trim();
    if (!start && !end && !desc && !role) {
      out.outlineKind = 'section';
    }
  }

  return out;
}
