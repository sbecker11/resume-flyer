/**
 * Validate parsed resume data against the parsed-resume format (schema in resume-parser package).
 * Canonical schema: resume-parser contracts/parsed-resume-format-v1.0.json (versioned).
 * FAIL FAST: throws immediately on any format violation.
 * Source of truth: resume-parser package; updates there may require changes here.
 *
 * Cross-file rule (resume-flyer convention, see resumeDataConsistency.mjs): every
 * job.skillIDs / education.skillIDs entry must be an exact key of the skills map.
 * validateJobSkillIds / validateEducationSkillIds enforce that at load; display names,
 * case variants and unknown ids are rejected with a message naming the fix.
 */
import { canonicalSkillKey } from '../utils/skillLabel.mjs';

/**
 * Validate jobs (array or object keyed by jobID). Per spec: must parse to array or object.
 * @param {unknown} rawJobs
 * @throws {Error} on format violation
 */
export function validateJobs(rawJobs) {
  if (rawJobs === null || rawJobs === undefined) {
    throw new Error('[ParsedResumeFormat] jobs is required; got null/undefined');
  }
  if (Array.isArray(rawJobs)) {
    return;
  }
  if (typeof rawJobs !== 'object') {
    throw new Error(`[ParsedResumeFormat] jobs must be array or object; got ${typeof rawJobs}`);
  }
}

/**
 * Validate skills (object keyed by skillID). Per spec: must parse to object; if missing, server uses {}.
 * @param {unknown} rawSkills
 * @throws {Error} on format violation
 */
export function validateSkills(rawSkills) {
  if (rawSkills === null || rawSkills === undefined) return;
  if (typeof rawSkills !== 'object' || Array.isArray(rawSkills)) {
    throw new Error(`[ParsedResumeFormat] skills must be object; got ${Array.isArray(rawSkills) ? 'array' : typeof rawSkills}`);
  }
}

/**
 * Records as [index label, record] pairs in the file's own order: `[3]` for an array
 * position, `["3"]` for an object key (same style as resumeDataConsistency `where` paths).
 * @param {unknown} records array or id-keyed object (already shape-validated)
 * @returns {[string, unknown][]}
 */
function recordEntries(records) {
  return Array.isArray(records)
    ? records.map((record, i) => [`[${i}]`, record])
    : Object.entries(/** @type {Record<string, unknown>} */ (records)).map(([key, record]) => [`[${JSON.stringify(key)}]`, record]);
}

/**
 * Throw unless every skillIDs entry of every record is an exact key of `skills`.
 * @param {unknown} records jobs or education, array or id-keyed object
 * @param {Record<string, unknown>} skills
 * @param {string} file 'jobs' | 'education'
 * @param {(record: object) => string} describe label for the message (employer, institution)
 */
function assertSkillIdsAreKeys(records, skills, file, describe) {
  for (const [index, record] of recordEntries(records)) {
    if (record === null || typeof record !== 'object' || record.skillIDs === undefined) continue;
    const label = describe(/** @type {object} */ (record));
    const where = `${file}${index}${label ? ` (${label})` : ''}`;
    if (!Array.isArray(record.skillIDs)) {
      throw new Error(`[ParsedResumeFormat] ${where}.skillIDs must be array; got ${record.skillIDs === null ? 'null' : typeof record.skillIDs}`);
    }
    record.skillIDs.forEach((sid, i) => {
      if (typeof sid === 'string' && sid !== '' && skills[sid] != null) return;
      const shown = JSON.stringify(sid);
      const resolved = canonicalSkillKey(sid, skills);
      const fix = resolved && resolved !== sid && skills[resolved] != null
        ? `it resolves to key ${JSON.stringify(resolved)} — replace it with that key`
        : 'no skills entry has that key or name — add the skill to skills.json or remove the id';
      throw new Error(`[ParsedResumeFormat] ${where}.skillIDs[${i}] ${shown} is not an exact skills.json key; ${fix}`);
    });
  }
}

function describeJob(job) {
  return String(job.employer ?? job.role ?? '').trim();
}

function describeEducation(entry) {
  return String(entry.institution ?? entry.degree ?? '').trim();
}

/**
 * Validate that every job.skillIDs entry is an exact key of the skills map (keys may be
 * slugs like "ai-ml" or self-named like "Bash"). Applies to both jobs shapes validateJobs
 * accepts (array or jobID-keyed object); the shape checks run first.
 *
 * Message shape:
 *   [ParsedResumeFormat] jobs[2] (Gamma).skillIDs[1] "Vue 3" is not an exact skills.json key; it resolves to key "vue-3" — replace it with that key
 *   [ParsedResumeFormat] jobs[0] (Acme).skillIDs[0] "Nope" is not an exact skills.json key; no skills entry has that key or name — add the skill to skills.json or remove the id
 *
 * @param {unknown} rawJobs
 * @param {unknown} rawSkills missing skills count as {} (then any skillID is unknown)
 * @throws {Error} on the first non-key entry
 */
export function validateJobSkillIds(rawJobs, rawSkills) {
  validateJobs(rawJobs);
  validateSkills(rawSkills);
  assertSkillIdsAreKeys(rawJobs, /** @type {Record<string, unknown>} */ (rawSkills ?? {}), 'jobs', describeJob);
}

/**
 * Same rule as validateJobSkillIds for education.json (object keyed by education key, or
 * array). A missing education file is valid.
 * @param {unknown} rawEducation
 * @param {unknown} rawSkills
 * @throws {Error}
 */
export function validateEducationSkillIds(rawEducation, rawSkills) {
  if (rawEducation === null || rawEducation === undefined) return;
  if (typeof rawEducation !== 'object') {
    throw new Error(`[ParsedResumeFormat] education must be array or object; got ${typeof rawEducation}`);
  }
  validateSkills(rawSkills);
  assertSkillIdsAreKeys(rawEducation, /** @type {Record<string, unknown>} */ (rawSkills ?? {}), 'education', describeEducation);
}

/**
 * Validate categories (object keyed by categoryID). Per spec: must be object.
 * @param {unknown} rawCategories
 * @throws {Error} on format violation
 */
export function validateCategories(rawCategories) {
  if (rawCategories === null || rawCategories === undefined) return;
  if (typeof rawCategories !== 'object' || Array.isArray(rawCategories)) {
    throw new Error(`[ParsedResumeFormat] categories must be object; got ${Array.isArray(rawCategories) ? 'array' : typeof rawCategories}`);
  }
}

/**
 * Validate otherSections object. Per spec: summary, title, contact, certifications, websites, custom_sections.
 * @param {unknown} raw
 * @throws {Error} on format violation
 */
export function validateOtherSections(raw) {
  if (raw === null || raw === undefined) return;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`[ParsedResumeFormat] otherSections must be object; got ${Array.isArray(raw) ? 'array' : typeof raw}`);
  }
  const o = /** @type {Record<string, unknown>} */ (raw);
  if (o.summary !== undefined && typeof o.summary !== 'string') {
    throw new Error('[ParsedResumeFormat] otherSections.summary must be string');
  }
  if (o.title !== undefined && typeof o.title !== 'string') {
    throw new Error('[ParsedResumeFormat] otherSections.title must be string');
  }
  if (o.contact !== undefined && (typeof o.contact !== 'object' || o.contact === null || Array.isArray(o.contact))) {
    throw new Error('[ParsedResumeFormat] otherSections.contact must be object');
  }
  if (o.certifications !== undefined && !Array.isArray(o.certifications)) {
    throw new Error('[ParsedResumeFormat] otherSections.certifications must be array');
  }
  if (o.websites !== undefined && !Array.isArray(o.websites)) {
    throw new Error('[ParsedResumeFormat] otherSections.websites must be array');
  }
  if (o.custom_sections !== undefined && !Array.isArray(o.custom_sections)) {
    throw new Error('[ParsedResumeFormat] otherSections.custom_sections must be array');
  }
}
