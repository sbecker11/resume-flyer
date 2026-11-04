/**
 * Cross-file consistency checker and mechanical fixer for one parsed resume folder
 * (jobs.json, skills.json, categories.json, education.json, enriched-jobs.json) plus the
 * shared parsed_resumes/skill-urls.json catalog and the parsed_resumes/non-local-resumes.json index.
 *
 * Conventions enforced (derived from server.mjs routes, enrichedJobs.mjs and skillLabel.mjs):
 *  - job.skillIDs / education.skillIDs / category.skillIDs hold exact skills.json map keys.
 *    Keys may be slugs ("express-js") or self-named ("Bash"); display names are resolvable by
 *    labelToSlug but the server's jobIDs sync (`skills[sid]`) only works for exact keys, so a
 *    non-key id is an error (skill-id-not-key), not a warning.
 *  - skill.jobIDs are 0-based positions in mergeJobsWithEducation(jobs, education): work jobs in
 *    jobs.json order, then education entries sorted by `index`. Sorted unique integers.
 *  - Every [Bracketed] token in a work-job Description must resolve via labelToSlug (content-index
 *    tags like [1.2.3] excepted); enrichJobsWithSkills throws otherwise. Education descriptions are
 *    never scanned for skills.
 *  - skillIDs is the source of truth for job<->skill links: a [Bracket] whose skill is not in that
 *    job's skillIDs is a blocking finding (bracket-not-linked), never a jobIDs source.
 *  - skill.categoryIDs and categories[c].skillIDs must mirror each other.
 *  - enriched-jobs.json must equal enrichJobsWithSkills(mergeJobsWithEducation(jobs, education), skills)
 *    (durationMonths excluded: blank end dates make it date-dependent).
 *
 * Pure: no filesystem access; inputs are never mutated.
 */
import { labelToSlug } from '../utils/skillLabel.mjs';
import { parseOutlineIndex } from '../utils/outlineIndex.mjs';
import { normalizeCatalog } from '../utils/skillUrlCatalog.mjs';
import { reportError } from '../utils/errorReporting.mjs';
import { mergeJobsWithEducation, educationEntriesToJobs } from './mergeEducationIntoJobs.mjs';
import { enrichJobsWithSkills } from './enrichedJobs.mjs';
import { normalizeParserJobs } from './parsedResumeAdapter.mjs';

export const SEVERITY = Object.freeze({ ERROR: 'error', WARNING: 'warning', INFO: 'info' });

/** Finding codes the fixer can resolve without human judgment. */
export const FIXABLE_CODES = Object.freeze(new Set([
  'skill-id-not-key',
  'skill-id-duplicate',
  'skill-jobids-missing',
  'skill-jobids-extraneous',
  'skill-jobids-out-of-range',
  'skill-jobids-malformed',
  'skill-category-not-listed',
  'category-skill-not-declared',
  'category-skill-unknown',
  'category-skill-not-key',
  'category-skill-duplicate',
  'enriched-jobs-stale',
  'enriched-jobs-missing',
]));

const BRACKET_RE = /\[([^\]]+)\]/g;

/**
 * @param {string} code
 * @param {string} severity
 * @param {string} message
 * @param {string} where
 * @param {Record<string, unknown>} [details]
 */
function finding(code, severity, message, where, details) {
  const out = { code, severity, message, where };
  if (details && Object.keys(details).length) out.details = details;
  return out;
}

/**
 * Exact skills.json key for an id that may be a key or a display name; null when unknown.
 * @param {unknown} sid
 * @param {Record<string, { name?: string }>} skills
 * @returns {string|null}
 */
export function resolveSkillKeyOrNull(sid, skills) {
  const raw = typeof sid === 'string' ? sid.trim() : (sid == null ? '' : String(sid).trim());
  if (!raw) return null;
  if (skills[raw] != null) return raw;
  return labelToSlug(raw, skills);
}

/**
 * @param {unknown} jobs
 * @returns {object[]}
 */
function jobsAsArray(jobs) {
  return normalizeParserJobs(jobs);
}

/**
 * @param {unknown} education
 * @returns {[string, object][]} entries in the same order mergeJobsWithEducation appends them
 */
function educationEntriesInMergeOrder(education) {
  if (!education || typeof education !== 'object') return [];
  return educationEntriesToJobs(education).map((row) => [String(row.educationKey), education[row.educationKey]]);
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function withoutDuration(row) {
  if (!row || typeof row !== 'object') return row;
  const copy = { ...row };
  delete copy.durationMonths;
  return copy;
}

/**
 * Recompute enriched-jobs from the primary files as plain JSON.
 * @returns {{ ok: true, rows: object[] } | { ok: false, error: Error }}
 */
export function rebuildEnrichedJobs({ jobs, skills, education }) {
  try {
    const merged = mergeJobsWithEducation(jobsAsArray(jobs), education);
    const rows = JSON.parse(JSON.stringify(enrichJobsWithSkills(merged, skills || {})));
    return { ok: true, rows };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error : new Error(String(error)) };
  }
}

/**
 * Check a skillIDs list for non-key ids, unknown ids and duplicates.
 * @param {unknown} ids
 * @param {Record<string, { name?: string }>} skills
 * @param {string} wherePrefix e.g. 'jobs.json[3]'
 * @param {object[]} out
 */
function checkSkillIdList(ids, skills, wherePrefix, out) {
  if (ids === undefined) return;
  if (!Array.isArray(ids)) {
    out.push(finding('skill-ids-not-array', SEVERITY.ERROR,
      `skillIDs must be an array; got ${ids === null ? 'null' : typeof ids}`, `${wherePrefix}.skillIDs`));
    return;
  }
  const seen = new Map();
  ids.forEach((sid, i) => {
    const where = `${wherePrefix}.skillIDs[${i}]`;
    const key = resolveSkillKeyOrNull(sid, skills);
    if (key == null) {
      out.push(finding('skill-id-unknown', SEVERITY.ERROR,
        `skillID ${JSON.stringify(sid)} matches no skills.json key or name`, where, { skillID: sid }));
      return;
    }
    if (key !== sid) {
      out.push(finding('skill-id-not-key', SEVERITY.ERROR,
        `skillID ${JSON.stringify(sid)} is not the exact skills.json key; resolves to ${JSON.stringify(key)}`,
        where, { skillID: sid, resolvedKey: key }));
    }
    if (seen.has(key)) {
      out.push(finding('skill-id-duplicate', SEVERITY.WARNING,
        `skillID ${JSON.stringify(sid)} duplicates ${JSON.stringify(seen.get(key))} (both resolve to ${JSON.stringify(key)})`,
        where, { skillID: sid, resolvedKey: key, firstIndex: ids.indexOf(seen.get(key)) }));
    } else {
      seen.set(key, sid);
    }
  });
}

/**
 * Canonical skill keys referenced by one merged job row (skillIDs only — the server maintains
 * skill.jobIDs from skillIDs, never from description text).
 * @param {object} row
 * @param {Record<string, { name?: string }>} skills
 * @returns {Set<string>}
 */
function referencedKeys(row, skills) {
  const keys = new Set();
  const ids = Array.isArray(row?.skillIDs) ? row.skillIDs : [];
  for (const sid of ids) {
    const key = resolveSkillKeyOrNull(sid, skills);
    if (key != null) keys.add(key);
  }
  return keys;
}

/**
 * @param {object[]} merged rows from mergeJobsWithEducation
 * @param {Record<string, { name?: string }>} skills
 * @returns {Map<string, number[]>} skill key → sorted merged indices
 */
export function computeSkillJobIds(merged, skills) {
  const byKey = new Map();
  merged.forEach((row, i) => {
    for (const key of referencedKeys(row, skills)) {
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(i);
    }
  });
  for (const list of byKey.values()) list.sort((a, b) => a - b);
  return byKey;
}

function describeRow(row, i) {
  const label = row?.employer || row?.institution || row?.label || row?.title || '';
  return label ? `#${i} (${label})` : `#${i}`;
}

/**
 * @param {{
 *   skills: Record<string, object>,
 *   jobs: unknown,
 *   enrichedJobs?: unknown,
 *   categories?: Record<string, { name?: string, skillIDs?: unknown }> | null,
 *   education?: Record<string, object> | null,
 *   skillUrls?: unknown,
 *   index?: unknown,
 *   resumeId?: string,
 * }} input
 * @returns {Array<{ code: string, severity: string, message: string, where: string, details?: object }>}
 */
export function checkResumeDataConsistency({
  skills,
  jobs,
  enrichedJobs,
  categories,
  education,
  skillUrls,
  index,
  resumeId,
}) {
  if (!skills || typeof skills !== 'object' || Array.isArray(skills)) {
    throw new Error('[resumeDataConsistency] skills must be an object keyed by skill key');
  }
  if (jobs == null || typeof jobs !== 'object') {
    throw new Error('[resumeDataConsistency] jobs must be an array or an object keyed by jobID');
  }
  /** @type {object[]} */
  const out = [];
  const jobsArr = jobsAsArray(jobs);
  const jobsIsArray = Array.isArray(jobs);
  const eduEntries = educationEntriesInMergeOrder(education);
  const merged = mergeJobsWithEducation(jobsArr, education);

  // --- skill names: duplicate names make bracket/name resolution ambiguous
  const byLowerName = new Map();
  for (const [key, skill] of Object.entries(skills)) {
    const name = skill && typeof skill === 'object' && skill.name != null ? String(skill.name).trim().toLowerCase() : '';
    if (!name) continue;
    if (byLowerName.has(name)) {
      out.push(finding('skill-name-duplicate', SEVERITY.WARNING,
        `skills ${JSON.stringify(byLowerName.get(name))} and ${JSON.stringify(key)} share the name ${JSON.stringify(skill.name)}; bracket/name resolution is ambiguous`,
        `skills.json[${JSON.stringify(key)}].name`, { otherKey: byLowerName.get(name) }));
    } else {
      byLowerName.set(name, key);
    }
  }

  // --- jobs: skillIDs + bracket tokens
  jobsArr.forEach((job, i) => {
    const where = jobsIsArray ? `jobs.json[${i}]` : `jobs.json[${JSON.stringify(String(job?.jobID ?? i))}]`;
    checkSkillIdList(job?.skillIDs, skills, where, out);
    const description = typeof job?.Description === 'string' ? job.Description : (typeof job?.description === 'string' ? job.description : '');
    if (!description) return;
    const linked = referencedKeys(job, skills);
    const reported = new Set();
    BRACKET_RE.lastIndex = 0;
    let m;
    while ((m = BRACKET_RE.exec(description)) !== null) {
      const label = String(m[1]).trim();
      if (!label || parseOutlineIndex(label)) continue;
      const lower = label.toLowerCase();
      if (reported.has(lower)) continue;
      reported.add(lower);
      const key = labelToSlug(label, skills);
      if (!key) {
        out.push(finding('bracket-unresolved', SEVERITY.ERROR,
          `[${label}] in Description of job ${describeRow(job, i)} resolves to no skill (enrichJobsWithSkills will throw)`,
          `${where}.Description`, { label }));
      } else if (!linked.has(key)) {
        out.push(finding('bracket-not-linked', SEVERITY.ERROR,
          `[${label}] in Description of job ${describeRow(job, i)} resolves to ${JSON.stringify(key)} but the job's skillIDs do not list it`,
          `${where}.Description`, { label, resolvedKey: key }));
      }
    }
  });

  // --- education: skillIDs (descriptions are not skill-scanned by enrichment)
  for (const [eduKey, entry] of eduEntries) {
    checkSkillIdList(entry?.skillIDs, skills, `education.json[${JSON.stringify(eduKey)}]`, out);
  }

  // --- skill.jobIDs vs merged references
  const expectedJobIds = computeSkillJobIds(merged, skills);
  for (const [key, skill] of Object.entries(skills)) {
    if (!skill || typeof skill !== 'object') {
      out.push(finding('skill-entry-invalid', SEVERITY.ERROR, `skill entry is not an object`, `skills.json[${JSON.stringify(key)}]`));
      continue;
    }
    const where = `skills.json[${JSON.stringify(key)}].jobIDs`;
    const expected = expectedJobIds.get(key) || [];
    const raw = skill.jobIDs;
    if (raw !== undefined && !Array.isArray(raw)) {
      out.push(finding('skill-jobids-malformed', SEVERITY.ERROR, `jobIDs must be an array; got ${typeof raw}`, where, { expected }));
      continue;
    }
    const actualRaw = Array.isArray(raw) ? raw : [];
    const ints = [];
    const malformed = [];
    for (const v of actualRaw) {
      const n = typeof v === 'number' ? v : Number(v);
      if (typeof v !== 'number' || !Number.isInteger(n)) malformed.push(v);
      if (Number.isInteger(n)) ints.push(n);
    }
    if (malformed.length) {
      out.push(finding('skill-jobids-malformed', SEVERITY.ERROR,
        `jobIDs contains non-integer entries ${JSON.stringify(malformed)}`, where, { malformed, expected }));
    }
    const sortedUnique = [...new Set(ints)].sort((a, b) => a - b);
    if (!malformed.length && JSON.stringify(sortedUnique) !== JSON.stringify(actualRaw)) {
      out.push(finding('skill-jobids-malformed', SEVERITY.ERROR,
        `jobIDs ${JSON.stringify(actualRaw)} is not sorted and unique`, where, { expected }));
    }
    const outOfRange = sortedUnique.filter((n) => n < 0 || n >= merged.length);
    if (outOfRange.length) {
      out.push(finding('skill-jobids-out-of-range', SEVERITY.ERROR,
        `jobIDs ${JSON.stringify(outOfRange)} outside 0..${merged.length - 1} (${jobsArr.length} jobs + ${eduEntries.length} education)`,
        where, { outOfRange, expected }));
    }
    const actualSet = new Set(sortedUnique);
    const missing = expected.filter((n) => !actualSet.has(n));
    const extraneous = sortedUnique.filter((n) => n >= 0 && n < merged.length && !expectedJobIds.get(key)?.includes(n));
    if (missing.length) {
      out.push(finding('skill-jobids-missing', SEVERITY.ERROR,
        `jobIDs lacks ${JSON.stringify(missing)} — referenced by skillIDs of ${missing.map((n) => describeRow(merged[n], n)).join(', ')}`,
        where, { missing, expected }));
    }
    if (extraneous.length) {
      out.push(finding('skill-jobids-extraneous', SEVERITY.ERROR,
        `jobIDs lists ${JSON.stringify(extraneous)} but ${extraneous.map((n) => describeRow(merged[n], n)).join(', ')} do not reference this skill`,
        where, { extraneous, expected }));
    }
  }

  // --- categories <-> skill.categoryIDs
  if (categories != null) {
    if (typeof categories !== 'object' || Array.isArray(categories)) {
      out.push(finding('categories-invalid', SEVERITY.ERROR, 'categories must be an object keyed by category id', 'categories.json'));
    } else {
      for (const [key, skill] of Object.entries(skills)) {
        if (!skill || typeof skill !== 'object' || skill.categoryIDs === undefined) continue;
        if (!Array.isArray(skill.categoryIDs)) {
          out.push(finding('skill-category-malformed', SEVERITY.ERROR, 'categoryIDs must be an array', `skills.json[${JSON.stringify(key)}].categoryIDs`));
          continue;
        }
        skill.categoryIDs.forEach((cid, i) => {
          const where = `skills.json[${JSON.stringify(key)}].categoryIDs[${i}]`;
          const cat = categories[cid];
          if (cat == null) {
            out.push(finding('skill-category-missing-category', SEVERITY.ERROR,
              `categoryID ${JSON.stringify(cid)} is not a categories.json key`, where, { categoryID: cid }));
            return;
          }
          const list = Array.isArray(cat.skillIDs) ? cat.skillIDs : [];
          if (!list.some((sid) => resolveSkillKeyOrNull(sid, skills) === key)) {
            out.push(finding('skill-category-not-listed', SEVERITY.WARNING,
              `skill declares category ${JSON.stringify(cid)} but categories.json[${JSON.stringify(cid)}].skillIDs does not list it`,
              where, { categoryID: cid }));
          }
        });
      }
      for (const [cid, cat] of Object.entries(categories)) {
        const whereCat = `categories.json[${JSON.stringify(cid)}]`;
        if (!cat || typeof cat !== 'object') {
          out.push(finding('category-invalid', SEVERITY.ERROR, 'category entry is not an object', whereCat));
          continue;
        }
        if (cat.skillIDs === undefined) continue;
        if (!Array.isArray(cat.skillIDs)) {
          out.push(finding('category-skill-malformed', SEVERITY.ERROR, 'skillIDs must be an array', `${whereCat}.skillIDs`));
          continue;
        }
        const seen = new Set();
        cat.skillIDs.forEach((sid, i) => {
          const where = `${whereCat}.skillIDs[${i}]`;
          const key = resolveSkillKeyOrNull(sid, skills);
          if (key == null) {
            out.push(finding('category-skill-unknown', SEVERITY.ERROR,
              `category lists ${JSON.stringify(sid)} which is no skills.json key or name (dangling)`, where, { skillID: sid }));
            return;
          }
          if (key !== sid) {
            out.push(finding('category-skill-not-key', SEVERITY.WARNING,
              `category lists ${JSON.stringify(sid)}; exact key is ${JSON.stringify(key)}`, where, { skillID: sid, resolvedKey: key }));
          }
          if (seen.has(key)) {
            out.push(finding('category-skill-duplicate', SEVERITY.WARNING,
              `category lists ${JSON.stringify(key)} more than once`, where, { resolvedKey: key }));
          }
          seen.add(key);
          const declared = Array.isArray(skills[key]?.categoryIDs) ? skills[key].categoryIDs : [];
          if (!declared.includes(cid)) {
            out.push(finding('category-skill-not-declared', SEVERITY.WARNING,
              `category lists ${JSON.stringify(key)} but skills.json[${JSON.stringify(key)}].categoryIDs does not include ${JSON.stringify(cid)}`,
              where, { resolvedKey: key, categoryID: cid }));
          }
        });
      }
    }
  }

  // --- enriched-jobs.json freshness
  if (enrichedJobs !== undefined) {
    const rebuilt = rebuildEnrichedJobs({ jobs, skills, education });
    if (!rebuilt.ok) {
      out.push(finding('enriched-jobs-unbuildable', SEVERITY.ERROR,
        `enrichJobsWithSkills failed: ${rebuilt.error.message}`, 'enriched-jobs.json'));
    } else if (enrichedJobs == null) {
      // Not drift: the client falls back to live enrichment when the bake is absent.
      out.push(finding('enriched-jobs-missing', SEVERITY.INFO,
        `enriched-jobs.json is missing; ${rebuilt.rows.length} rows would be baked`, 'enriched-jobs.json'));
    } else if (!Array.isArray(enrichedJobs)) {
      out.push(finding('enriched-jobs-stale', SEVERITY.ERROR, 'enriched-jobs.json is not an array', 'enriched-jobs.json'));
    } else {
      const staleRows = [];
      const n = Math.max(enrichedJobs.length, rebuilt.rows.length);
      for (let i = 0; i < n; i++) {
        if (stableStringify(withoutDuration(enrichedJobs[i])) !== stableStringify(withoutDuration(rebuilt.rows[i]))) staleRows.push(i);
      }
      if (staleRows.length) {
        out.push(finding('enriched-jobs-stale', SEVERITY.ERROR,
          `enriched-jobs.json differs from enrichJobsWithSkills(jobs+education, skills) at row(s) ${JSON.stringify(staleRows.slice(0, 20))}${staleRows.length > 20 ? '…' : ''} (file ${enrichedJobs.length} rows, rebuilt ${rebuilt.rows.length})`,
          'enriched-jobs.json', { staleRows, fileRows: enrichedJobs.length, rebuiltRows: rebuilt.rows.length }));
      }
    }
  }

  // --- shared skill-urls.json (informational: catalog is shared across resumes)
  if (skillUrls !== undefined && skillUrls !== null) {
    const entries = normalizeCatalog(skillUrls).entries;
    for (const [slug, entry] of Object.entries(entries)) {
      const key = resolveSkillKeyOrNull(slug, skills);
      const where = `skill-urls.json.entries[${JSON.stringify(slug)}]`;
      if (key == null) {
        out.push(finding('skill-url-orphan', SEVERITY.INFO,
          `catalog slug ${JSON.stringify(slug)} matches no skill key or name in this resume`, where, { slug }));
        continue;
      }
      const skillUrl = String(skills[key]?.url ?? '').trim();
      if (skillUrl && entry.url && skillUrl !== entry.url) {
        out.push(finding('skill-url-mismatch', SEVERITY.INFO,
          `catalog url for ${JSON.stringify(slug)} (${entry.url}) differs from skills.json[${JSON.stringify(key)}].url (${skillUrl})`,
          where, { slug, resolvedKey: key, catalogUrl: entry.url, skillUrl }));
      }
    }
  }

  // --- non-local-resumes.json index counts (informational)
  if (index !== undefined && index !== null && resumeId) {
    const list = Array.isArray(index?.resumes) ? index.resumes : [];
    const entry = list.find((r) => r && r.id === resumeId);
    if (!entry) {
      out.push(finding('index-missing-resume', SEVERITY.INFO,
        `non-local-resumes.json has no entry for ${JSON.stringify(resumeId)}`, 'non-local-resumes.json.resumes'));
    } else {
      const jobCount = Array.isArray(jobs) ? jobs.length : Object.keys(jobs).length;
      const skillCount = Object.keys(skills).length;
      if (entry.jobCount !== jobCount) {
        out.push(finding('index-count-mismatch', SEVERITY.INFO,
          `jobCount ${entry.jobCount} != ${jobCount} jobs in jobs.json`, `non-local-resumes.json.resumes[${JSON.stringify(resumeId)}].jobCount`,
          { field: 'jobCount', indexed: entry.jobCount, actual: jobCount }));
      }
      if (entry.skillCount !== skillCount) {
        out.push(finding('index-count-mismatch', SEVERITY.INFO,
          `skillCount ${entry.skillCount} != ${skillCount} skills in skills.json`, `non-local-resumes.json.resumes[${JSON.stringify(resumeId)}].skillCount`,
          { field: 'skillCount', indexed: entry.skillCount, actual: skillCount }));
      }
    }
  }

  return out;
}

/**
 * Catalog slugs matching no skill key or name in any of the given skills maps.
 * Used by the CLI when checking every resume at once (the catalog is shared).
 * @param {unknown} skillUrls
 * @param {Record<string, object>[]} skillsMaps
 */
export function findSkillUrlOrphans(skillUrls, skillsMaps) {
  const entries = normalizeCatalog(skillUrls).entries;
  const out = [];
  for (const slug of Object.keys(entries)) {
    if (skillsMaps.some((skills) => resolveSkillKeyOrNull(slug, skills) != null)) continue;
    out.push(finding('skill-url-orphan', SEVERITY.INFO,
      `catalog slug ${JSON.stringify(slug)} matches no skill key or name in any checked resume`,
      `skill-urls.json.entries[${JSON.stringify(slug)}]`, { slug }));
  }
  return out;
}

/**
 * @param {object[]} findings
 * @returns {{ error: object[], warning: object[], info: object[] }}
 */
export function groupFindingsBySeverity(findings) {
  const groups = { error: [], warning: [], info: [] };
  for (const f of findings) (groups[f.severity] ??= []).push(f);
  return groups;
}

/** @param {object[]} findings */
export function hasBlockingFindings(findings) {
  return findings.some((f) => f.severity !== SEVERITY.INFO);
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

/**
 * Canonicalize + dedupe one skillIDs list. Unknown ids are kept verbatim (not mechanical).
 * @returns {{ ids: unknown[], changed: boolean, notes: string[] }}
 */
function fixSkillIdList(ids, skills) {
  const out = [];
  const seenKeys = new Set();
  const notes = [];
  let changed = false;
  for (const sid of ids) {
    const key = resolveSkillKeyOrNull(sid, skills);
    if (key == null) {
      out.push(sid);
      continue;
    }
    if (key !== sid) {
      changed = true;
      notes.push(`${JSON.stringify(sid)} → ${JSON.stringify(key)}`);
    }
    if (seenKeys.has(key)) {
      changed = true;
      notes.push(`dropped duplicate ${JSON.stringify(sid)}`);
      continue;
    }
    seenKeys.add(key);
    out.push(key);
  }
  return { ids: out, changed, notes };
}

/**
 * The one normalization every write path runs (resumeStore.commitResume and the CLI --fix):
 * skillIDs → exact keys and deduped; category lists → exact keys, dangling dropped, deduped;
 * categories <-> skill.categoryIDs synced additively; every skill.jobIDs recomputed from the
 * merged work + education references. Never changes names, urls, descriptions, or job fields
 * other than skillIDs. Returns deep copies; inputs are untouched.
 *
 * @param {{
 *   skills: Record<string, object>,
 *   jobs: unknown,
 *   categories?: Record<string, object> | null,
 *   education?: Record<string, object> | null,
 * }} input
 * @returns {{
 *   skills: Record<string, object>, jobs: unknown, categories: unknown, education: unknown,
 *   applied: Array<{ code: string, message: string, where: string }>
 * }}
 */
export function normalizeResumeData({ skills, jobs, categories, education }) {
  if (!skills || typeof skills !== 'object' || Array.isArray(skills)) {
    throw new Error('[resumeDataConsistency] fix: skills must be an object keyed by skill key');
  }
  if (jobs == null || typeof jobs !== 'object') {
    throw new Error('[resumeDataConsistency] fix: jobs must be an array or an object keyed by jobID');
  }
  const fixedSkills = clone(skills);
  const fixedJobs = clone(jobs);
  const fixedCategories = clone(categories ?? null);
  const fixedEducation = clone(education ?? null);
  /** @type {Array<{ code: string, message: string, where: string }>} */
  const applied = [];
  const record = (code, message, where) => applied.push({ code, message, where });

  // 1. job / education skillIDs → exact keys, deduped
  const jobRecords = Array.isArray(fixedJobs)
    ? fixedJobs.map((job, i) => [`jobs.json[${i}]`, job])
    : Object.entries(fixedJobs).map(([k, job]) => [`jobs.json[${JSON.stringify(k)}]`, job]);
  for (const [where, job] of jobRecords) {
    if (!job || !Array.isArray(job.skillIDs)) continue;
    const { ids, changed, notes } = fixSkillIdList(job.skillIDs, fixedSkills);
    if (changed) {
      job.skillIDs = ids;
      record('skill-ids-canonicalized', `skillIDs: ${notes.join('; ')}`, `${where}.skillIDs`);
    }
  }
  if (fixedEducation && typeof fixedEducation === 'object') {
    for (const [eduKey, entry] of Object.entries(fixedEducation)) {
      if (!entry || !Array.isArray(entry.skillIDs)) continue;
      const { ids, changed, notes } = fixSkillIdList(entry.skillIDs, fixedSkills);
      if (changed) {
        entry.skillIDs = ids;
        record('skill-ids-canonicalized', `skillIDs: ${notes.join('; ')}`, `education.json[${JSON.stringify(eduKey)}].skillIDs`);
      }
    }
  }

  // 2. category skillIDs → exact keys, dangling dropped, deduped
  if (fixedCategories && typeof fixedCategories === 'object' && !Array.isArray(fixedCategories)) {
    for (const [cid, cat] of Object.entries(fixedCategories)) {
      if (!cat || typeof cat !== 'object' || !Array.isArray(cat.skillIDs)) continue;
      const out = [];
      const seen = new Set();
      const notes = [];
      for (const sid of cat.skillIDs) {
        const key = resolveSkillKeyOrNull(sid, fixedSkills);
        if (key == null) {
          notes.push(`dropped dangling ${JSON.stringify(sid)}`);
          continue;
        }
        if (key !== sid) notes.push(`${JSON.stringify(sid)} → ${JSON.stringify(key)}`);
        if (seen.has(key)) {
          notes.push(`dropped duplicate ${JSON.stringify(sid)}`);
          continue;
        }
        seen.add(key);
        out.push(key);
      }
      if (notes.length) {
        cat.skillIDs = out;
        record('category-skill-ids-canonicalized', `skillIDs: ${notes.join('; ')}`, `categories.json[${JSON.stringify(cid)}].skillIDs`);
      }
    }

    // 3. additive sync: a link declared on either side is added to the other.
    //    A categoryID naming a nonexistent category is left alone (create vs drop is a judgment call).
    for (const [key, skill] of Object.entries(fixedSkills)) {
      if (!skill || typeof skill !== 'object' || !Array.isArray(skill.categoryIDs)) continue;
      for (const cid of skill.categoryIDs) {
        const cat = fixedCategories[cid];
        if (!cat || typeof cat !== 'object') continue;
        if (!Array.isArray(cat.skillIDs)) cat.skillIDs = [];
        if (!cat.skillIDs.includes(key)) {
          cat.skillIDs.push(key);
          record('category-skill-added', `added ${JSON.stringify(key)} (declared by skills.json[${JSON.stringify(key)}].categoryIDs)`, `categories.json[${JSON.stringify(cid)}].skillIDs`);
        }
      }
    }
    for (const [cid, cat] of Object.entries(fixedCategories)) {
      if (!cat || typeof cat !== 'object' || !Array.isArray(cat.skillIDs)) continue;
      for (const key of cat.skillIDs) {
        const skill = fixedSkills[key];
        if (!skill || typeof skill !== 'object') continue;
        if (!Array.isArray(skill.categoryIDs)) skill.categoryIDs = [];
        if (!skill.categoryIDs.includes(cid)) {
          skill.categoryIDs.push(cid);
          record('skill-category-added', `added ${JSON.stringify(cid)} (listed by categories.json[${JSON.stringify(cid)}].skillIDs)`, `skills.json[${JSON.stringify(key)}].categoryIDs`);
        }
      }
    }
  }

  // 4. every skill.jobIDs recomputed from merged references
  const merged = mergeJobsWithEducation(jobsAsArray(fixedJobs), fixedEducation);
  const expected = computeSkillJobIds(merged, fixedSkills);
  for (const [key, skill] of Object.entries(fixedSkills)) {
    if (!skill || typeof skill !== 'object') continue;
    const next = expected.get(key) || [];
    const prev = Array.isArray(skill.jobIDs) ? skill.jobIDs : (skill.jobIDs === undefined ? undefined : skill.jobIDs);
    if (JSON.stringify(prev) !== JSON.stringify(next)) {
      skill.jobIDs = next;
      record('skill-jobids-recomputed', `jobIDs ${JSON.stringify(prev)} → ${JSON.stringify(next)}`, `skills.json[${JSON.stringify(key)}].jobIDs`);
    }
  }

  return {
    skills: fixedSkills,
    jobs: fixedJobs,
    categories: fixedCategories,
    education: fixedEducation,
    applied,
  };
}

/**
 * normalizeResumeData plus a re-bake of enriched-jobs from the normalized primary files.
 * Pure preview used by the CLI (--dry-run) and tests; resumeStore.commitResume is the writer.
 *
 * @param {{
 *   skills: Record<string, object>,
 *   jobs: unknown,
 *   categories?: Record<string, object> | null,
 *   education?: Record<string, object> | null,
 *   enrichedJobs?: unknown,
 * }} input
 * @returns {{
 *   skills: Record<string, object>, jobs: unknown, categories: unknown, education: unknown,
 *   enrichedJobs: unknown, applied: Array<{ code: string, message: string, where: string }>
 * }}
 */
export function fixResumeDataConsistency({ skills, jobs, categories, education, enrichedJobs }) {
  const normalized = normalizeResumeData({ skills, jobs, categories, education });
  const { applied } = normalized;

  let fixedEnriched = clone(enrichedJobs);
  const rebuilt = rebuildEnrichedJobs(normalized);
  if (!rebuilt.ok) {
    reportError(rebuilt.error, '[resumeDataConsistency] Cannot re-bake enriched-jobs after fixes', 'Leaving enriched-jobs unchanged; fix the unresolved bracket tokens first');
  } else if (stableStringify((Array.isArray(fixedEnriched) ? fixedEnriched : []).map(withoutDuration)) !== stableStringify(rebuilt.rows.map(withoutDuration))) {
    fixedEnriched = rebuilt.rows;
    applied.push({ code: 'enriched-jobs-rebaked', message: `enriched-jobs re-baked (${rebuilt.rows.length} rows)`, where: 'enriched-jobs.json' });
  }

  return { ...normalized, enrichedJobs: fixedEnriched, applied };
}
