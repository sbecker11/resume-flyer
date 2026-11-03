/**
 * Same definition of "which skills are linked to a job" as Job skills tab:
 * explicit job.skillIDs plus [bracket] terms in Description that match skills.json keys.
 *
 * Every id is resolved to its canonical skills-map key via canonicalSkillKey, because
 * job.skillIDs has historically held both keys ("ai-ml") and display names ("AI/ML").
 * Without that, a display-name link never matches the key the matrix rows, the
 * Find-skill modal, and the scene cards are keyed by, and its months count as zero.
 */

import { canonicalSkillKey } from '../utils/skillLabel.mjs';

/**
 * Canonical skills-map key for a key or display name; null when it matches no skill.
 * @param {string} name
 * @param {Record<string, { name?: string }>} skillsMap
 * @returns {string|null}
 */
function resolveSkillKey(name, skillsMap) {
  if (!name || !skillsMap || typeof skillsMap !== 'object') return null;
  const key = canonicalSkillKey(name, skillsMap);
  return key && skillsMap[key] != null ? key : null;
}

/** @param {unknown} description @param {Record<string, unknown>} skillsMap */
function skillKeysFromDescription(description, skillsMap) {
  if (!description || typeof description !== 'string' || !skillsMap || typeof skillsMap !== 'object') return [];
  const out = [];
  const seen = new Set();
  const bracketRe = /\[([^\]]+)\]/g;
  let m;
  while ((m = bracketRe.exec(description)) !== null) {
    const name = m[1].trim();
    if (!name || seen.has(name)) continue;
    const key = resolveSkillKey(name, skillsMap);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

/**
 * Canonical skill keys linked to a job: job.skillIDs (each resolved through
 * canonicalSkillKey; an id that matches no skill is kept as typed so the caller can
 * still see and clean it up) plus [bracket] terms in the Description.
 *
 * @param {unknown} job
 * @param {Record<string, unknown>} skillsMap
 * @returns {Set<string>}
 */
export function getSelectedSkillIdsForJob(job, skillsMap) {
  const fromIds = new Set();
  const ids = Array.isArray(job?.skillIDs) ? job.skillIDs : [];
  for (const sid of ids) {
    const key = canonicalSkillKey(sid, skillsMap);
    if (key) fromIds.add(key);
  }
  const fromDesc = skillKeysFromDescription(job?.Description ?? job?.description, skillsMap);
  fromDesc.forEach((id) => fromIds.add(id));
  return fromIds;
}

/**
 * Remove `[term]` spans that resolve to a skills.json key when that key is not in the
 * persisted selection. Keeps brackets that do not resolve to a skill (prose / typos).
 * Work-job matrix saves only `skillIDs`; without this, description brackets keep cells "on".
 *
 * @param {string} description
 * @param {Set<string> | Iterable<string>} selectedSkillIds
 * @param {Record<string, unknown>} skillsMap
 * @returns {string}
 */
export function filterDescriptionBracketsToSkillSelection(description, selectedSkillIds, skillsMap) {
  if (!description || typeof description !== 'string') return description;
  if (!skillsMap || typeof skillsMap !== 'object') return description;
  const set = selectedSkillIds instanceof Set ? selectedSkillIds : new Set(selectedSkillIds);
  const out = description.replace(/\[([^\]]+)\]/g, (match, inner) => {
    const key = resolveSkillKey(String(inner).trim(), skillsMap);
    if (key == null) return match;
    return set.has(key) ? match : '';
  });
  return out
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();
}
