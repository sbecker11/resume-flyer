/**
 * Normalize resume-parser output for consumption by resume-flyer.
 * Parser may emit jobs/skills as dicts keyed by ID; the app expects jobs as array and skills name-keyed for enrichment.
 *
 * - Jobs: array → unchanged; object keyed by jobID → array sorted by jobID, each item gains jobID.
 * - Skills: object keyed by skillID with { name, url?, img?, ... } → name-keyed { [name]: { url, img } }; legacy name-keyed → unchanged.
 * - Categories: returned as-is (dict keyed by categoryID).
 */

/**
 * @param {unknown} jobs - Parser output: array or object keyed by jobID
 * @returns {Array<object>} Normalized jobs array (for getJobsData / enrichJobs)
 */
export function normalizeParserJobs(jobs) {
  if (Array.isArray(jobs)) return jobs;
  if (jobs && typeof jobs === 'object' && !Array.isArray(jobs)) {
    const entries = Object.entries(jobs);
    const sorted = entries.sort(([a], [b]) => {
      const na = Number(a);
      const nb = Number(b);
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
      return String(a).localeCompare(String(b));
    });
    return sorted.map(([id, job]) => ({ ...job, jobID: id }));
  }
  return [];
}

/** Returns true if a key looks like a slug: lowercase, hyphens, digits, dots — no spaces or uppercase. */
function isSlugKey(key) {
  return /^[a-z0-9][a-z0-9\-._]*$/.test(key);
}

/**
 * @param {unknown} skills - One of three formats:
 *   1. Already slug-keyed: { [slug]: { name, url?, img?, ... } }  — our skills.json format; pass through unchanged.
 *   2. Parser new format: { [opaqueID]: { name, url?, img?, ... } } — re-key by name for enrichment.
 *   3. Legacy name-keyed: { [skillName]: { url?, img? } }          — pass through unchanged.
 * @returns {Record<string, { name?: string, url?: string, img?: string }>} Slug- or name-keyed skills for enrichment
 */
export function normalizeParserSkills(skills) {
  if (!skills || typeof skills !== 'object') return {};
  const entries = Object.entries(skills);
  if (entries.length === 0) return {};

  // If all keys are valid slugs, the map is already in our canonical format — pass through.
  const allSlugs = entries.every(([k]) => isSlugKey(k));
  if (allSlugs) return /** @type {Record<string, { name?: string, url?: string, img?: string }>} */ (skills);

  // Parser "new format": keys are opaque IDs, values have a name field — re-key by name.
  const first = entries[0][1];
  const isNewFormat = first && typeof first === 'object' && 'name' in first && typeof first.name === 'string';
  if (isNewFormat) {
    const byName = {};
    for (const [, skill] of entries) {
      if (skill && typeof skill === 'object' && skill.name) {
        const name = String(skill.name).trim();
        if (name && !byName[name]) byName[name] = { url: skill.url, img: skill.img };
      }
    }
    return byName;
  }

  // Legacy name-keyed format — pass through unchanged.
  return /** @type {Record<string, { name?: string, url?: string, img?: string }>} */ (skills);
}

/**
 * @param {unknown} categories - Parser output: { [categoryID]: { name, skillIDs? } } or missing
 * @returns {Record<string, { name: string, skillIDs?: string[] }>}
 */
export function normalizeParserCategories(categories) {
  if (!categories || typeof categories !== 'object') return {};
  return /** @type {Record<string, { name: string, skillIDs?: string[] }>} */ (categories);
}
