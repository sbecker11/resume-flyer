/**
 * Validate parsed resume data against docs/PARSED-RESUME-FORMAT.md.
 * FAIL FAST: throws immediately on any format violation.
 *
 * @see docs/PARSED-RESUME-FORMAT.md
 */

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
