/**
 * One jobs.json row per unique `[1.1.3]` content-index tag.
 * The parser may collapse nested tagged lines into a parent Description;
 * those tags are distinct jobs, not extra bullets on the employer.
 */

import { applyOutlineFromHeading } from './applyOutlineFromHeading.mjs';
import { extractContentIndexTag, normalizeOutlineIndex } from '../utils/outlineIndex.mjs';

const TAGGED_CHUNK_RE = /(?=[\u2022•]|\[\d+(?:\.\d+)*\])/;
const BULLET_PREFIX_RE = /^[\u2022\u00b7•]\s*/;
const EM_DASH_SPLIT_RE = /\s+[—]\s+/;
const PAREN_DATE_RE =
  /^(.*?)\s+\((\d{1,2}\/\d{4})\s+[–—-]\s+(\d{1,2}\/\d{4}|CURRENT_DATE|[Pp]resent|[Cc]urrent)\)\s*$/;
const DATE_TAIL_RE =
  /^(.*?)\s+(\d{1,2}\/\d{4})\s+[–—-]\s+(\d{1,2}\/\d{4}|CURRENT_DATE|[Pp]resent|[Cc]urrent)\s*$/;
const CONTENT_INDEX_IN_TEXT_RE = /\[(\d+(?:\.\d+)*)\]/;

const SECTION_LABELS = {
  '1.1': 'Spexture Portfolio Projects',
  '1.2': 'Spexture Client Engagements',
};

/**
 * @param {string} endRaw
 * @returns {string}
 */
function normalizeEnd(endRaw) {
  return ['present', 'current'].includes(String(endRaw).toLowerCase()) ? 'CURRENT_DATE' : endRaw;
}

/**
 * @param {string} index
 * @param {string} rest
 * @returns {{ outlineIndex: string, employer: string, role: string, start: string, end: string, Description: string }}
 */
export function parseContentIndexHeading(index, rest) {
  let body = String(rest || '').replace(BULLET_PREFIX_RE, '').trim();
  let left = body;
  let desc = '';
  const parts = body.split(EM_DASH_SPLIT_RE);
  if (parts.length >= 2) {
    left = parts[0].trim();
    desc = parts.slice(1).join(' — ').trim();
  }
  let employer = left;
  let start = '';
  let end = '';
  const pm = left.match(PAREN_DATE_RE);
  const dm = !pm ? left.match(DATE_TAIL_RE) : null;
  if (pm) {
    employer = pm[1].trim();
    start = pm[2];
    end = normalizeEnd(pm[3]);
  } else if (dm) {
    employer = dm[1].trim();
    start = dm[2];
    end = normalizeEnd(dm[3]);
  }
  let role = '';
  if (desc.includes(':')) {
    const colon = desc.indexOf(':');
    const maybeRole = desc.slice(0, colon).trim();
    if (/(Engineer|Architect|CTO|Manager|Lead)/.test(maybeRole)) {
      role = maybeRole;
      desc = desc.slice(colon + 1).trim();
    }
  }
  return {
    outlineIndex: normalizeOutlineIndex(index),
    employer,
    role,
    start,
    end,
    Description: desc ? (desc.startsWith('•') ? desc : `• ${desc}`) : '',
  };
}

/**
 * @param {string} description
 * @returns {string[]}
 */
function splitDescriptionChunks(description) {
  if (!description) return [];
  return String(description)
    .split(TAGGED_CHUNK_RE)
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * @param {string} chunk
 * @returns {{ outlineIndex: string, rest: string } | null}
 */
function taggedChunk(chunk) {
  const body = String(chunk).replace(BULLET_PREFIX_RE, '').trim();
  const { index, rest } = extractContentIndexTag(body);
  if (!index) return null;
  return { outlineIndex: index, rest };
}

/**
 * @param {Record<string, unknown>} parent
 * @returns {Record<string, unknown>}
 */
function styleFrom(parent) {
  return {
    'css name': parent['css name'],
    'css RGB': parent['css RGB'],
    'css color': parent['css color'],
    'text color': parent['text color'] || '#FFFFFF',
  };
}

/**
 * @param {string} index
 * @param {Record<string, unknown>} parent
 * @param {number} z
 * @returns {Record<string, unknown>}
 */
function makeSection(index, parent, z) {
  return applyOutlineFromHeading({
    role: '',
    employer: SECTION_LABELS[index] || String(parent.employer || ''),
    start: '',
    end: '',
    'z-index': z,
    ...styleFrom(parent),
    Description: '',
    outlineIndex: index,
    outlineKind: 'section',
  });
}

/**
 * @param {unknown[]} jobs
 * @returns {boolean}
 */
export function descriptionsHaveContentIndexTags(jobs) {
  if (!Array.isArray(jobs)) return false;
  return jobs.some((job) => {
    if (!job || typeof job !== 'object') return false;
    const desc = /** @type {{ Description?: unknown, description?: unknown }} */ (job).Description
      ?? /** @type {{ description?: unknown }} */ (job).description
      ?? '';
    return CONTENT_INDEX_IN_TEXT_RE.test(String(desc));
  });
}

/**
 * Split nested `[n.n.n]` bullets out of parent Descriptions into their own job rows.
 * No-op when descriptions do not contain content-index tags.
 * Does not copy parent dates onto children that have none.
 *
 * @param {unknown[]} jobs
 * @returns {object[]}
 */
export function expandJobsOnePerContentIndex(jobs) {
  if (!Array.isArray(jobs) || jobs.length === 0) return jobs;
  if (!descriptionsHaveContentIndexTags(jobs)) return jobs;

  /** @type {object[]} */
  const out = [];
  const insertedSections = new Set();
  let zCycle = 0;
  const nextZ = () => {
    zCycle += 1;
    return ((zCycle - 1) % 3) + 1;
  };

  for (const raw of jobs) {
    if (!raw || typeof raw !== 'object') continue;
    const job = /** @type {Record<string, unknown>} */ (raw);
    if (job.educationKey) {
      out.push({ ...job });
      continue;
    }

    const desc = String(job.Description ?? job.description ?? '');
    /** @type {ReturnType<typeof parseContentIndexHeading>[]} */
    const tagged = [];
    const leftover = [];
    for (const chunk of splitDescriptionChunks(desc)) {
      const taggedHit = taggedChunk(chunk);
      if (!taggedHit) {
        leftover.push(chunk);
        continue;
      }
      tagged.push(parseContentIndexHeading(taggedHit.outlineIndex, taggedHit.rest));
    }

    const parent = { ...job };
    delete parent.skillIDs;
    if (leftover.length) parent.Description = leftover.join('\n');
    else if (tagged.length) parent.Description = '';
    parent.outlineIndex = normalizeOutlineIndex(parent.outlineIndex) || parent.outlineIndex;
    out.push(applyOutlineFromHeading(parent));

    if (!tagged.length) continue;

    const parentIdx = normalizeOutlineIndex(parent.outlineIndex);
    const ensureSectionPrefixes = (childIdx) => {
      const parts = String(childIdx).split('.');
      for (let i = 1; i < parts.length; i += 1) {
        const secIdx = parts.slice(0, i).join('.');
        if (!secIdx || secIdx === parentIdx || insertedSections.has(secIdx)) continue;
        const underParent = parentIdx ? secIdx.startsWith(`${parentIdx}.`) : false;
        if (!SECTION_LABELS[secIdx] && !underParent) continue;
        out.push(makeSection(secIdx, parent, nextZ()));
        insertedSections.add(secIdx);
      }
    };

    for (const parsed of tagged) {
      ensureSectionPrefixes(parsed.outlineIndex);
      out.push(
        applyOutlineFromHeading({
          role: parsed.role || '',
          employer: parsed.employer,
          start: parsed.start || '',
          end: parsed.end || '',
          'z-index': nextZ(),
          ...styleFrom(parent),
          Description: parsed.Description,
          outlineIndex: parsed.outlineIndex,
        })
      );
    }
  }

  return out.map((job, i) => ({ ...job, index: i, jobID: String(i) }));
}
