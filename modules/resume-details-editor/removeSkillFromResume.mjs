/**
 * Remove one skill from a resume's in-memory jobs, skills, and education.
 * Mutates the objects in place. Strips matching skillIDs and unwraps [Skill] brackets to
 * plain text so the prose survives and a leftover bracket cannot fail description
 * enrichment after the skill is gone. Category lists and skill.jobIDs are derived data:
 * resumeStore.commitResume drops the dangling key and recomputes jobIDs on write.
 */
import { labelToSlug } from '../utils/skillLabel.mjs';

/**
 * @param {unknown} jobs
 * @returns {object[]}
 */
function recordList(jobs) {
  if (Array.isArray(jobs)) return jobs;
  if (jobs && typeof jobs === 'object') return Object.values(jobs);
  return [];
}

/**
 * @param {unknown} sid
 * @param {Record<string, { name?: string }>} skills
 * @param {string} resolvedKey
 * @param {string} nameLower
 * @param {string} keyLower
 */
function idMatchesSkill(sid, skills, resolvedKey, nameLower, keyLower) {
  const text = String(sid ?? '').trim();
  if (!text) return false;
  if (text === resolvedKey) return true;
  const lower = text.toLowerCase();
  if (lower === nameLower || lower === keyLower) return true;
  return labelToSlug(text, skills) === resolvedKey;
}

/**
 * Unwrap `[Token]` → `Token` for brackets that reference the removed skill. Surrounding
 * text and spacing are left exactly as-is; only the two bracket characters are dropped.
 * @param {string} description
 * @param {Record<string, { name?: string }>} skills
 * @param {string} resolvedKey
 * @param {string} nameLower
 * @param {string} keyLower
 * @returns {string}
 */
function unwrapSkillBrackets(description, skills, resolvedKey, nameLower, keyLower) {
  return description.replace(/\[([^\]]+)\]/g, (match, inner) => {
    const label = String(inner).trim();
    if (!label) return match;
    if (idMatchesSkill(label, skills, resolvedKey, nameLower, keyLower)) return inner;
    return match;
  });
}

/**
 * @param {object} record
 * @param {Record<string, { name?: string }>} skills
 * @param {string} resolvedKey
 * @param {string} nameLower
 * @param {string} keyLower
 * @returns {number} 1 when a description field changed
 */
function stripRecord(record, skills, resolvedKey, nameLower, keyLower) {
  if (!record || typeof record !== 'object') return 0;
  if (Array.isArray(record.skillIDs)) {
    record.skillIDs = record.skillIDs.filter(
      (sid) => !idMatchesSkill(sid, skills, resolvedKey, nameLower, keyLower)
    );
  }
  let descriptionFixes = 0;
  for (const field of ['Description', 'description']) {
    if (typeof record[field] !== 'string' || !record[field]) continue;
    const next = unwrapSkillBrackets(record[field], skills, resolvedKey, nameLower, keyLower);
    if (next !== record[field]) {
      record[field] = next;
      descriptionFixes = 1;
    }
  }
  return descriptionFixes;
}

/**
 * @param {{
 *   jobs: unknown,
 *   skills: Record<string, { name?: string }>,
 *   education?: Record<string, object> | null,
 *   key: string,
 * }} data
 * @returns {{ ok: true, key: string, name: string, descriptionFixes: number } | { ok: false, error: string }}
 */
export function removeSkillFromResumeData({ jobs, skills, education, key }) {
  if (!skills || typeof skills !== 'object') {
    return { ok: false, error: 'Skills data is missing.' };
  }
  const requested = key != null ? String(key).trim() : '';
  if (!requested) return { ok: false, error: 'Missing skill key.' };
  const resolvedKey = skills[requested] != null ? requested : labelToSlug(requested, skills);
  if (resolvedKey == null || skills[resolvedKey] == null) {
    return { ok: false, error: `Skill "${requested}" not found.` };
  }
  const name = skills[resolvedKey].name || resolvedKey;
  const nameLower = String(name).trim().toLowerCase();
  const keyLower = String(resolvedKey).trim().toLowerCase();

  let descriptionFixes = 0;
  for (const job of recordList(jobs)) {
    descriptionFixes += stripRecord(job, skills, resolvedKey, nameLower, keyLower);
  }
  for (const entry of recordList(education)) {
    descriptionFixes += stripRecord(entry, skills, resolvedKey, nameLower, keyLower);
  }
  delete skills[resolvedKey];
  return { ok: true, key: resolvedKey, name, descriptionFixes };
}
