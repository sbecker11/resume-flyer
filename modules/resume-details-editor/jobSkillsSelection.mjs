/**
 * Same definition of "which skills are linked to a job" as Job skills tab:
 * explicit job.skillIDs plus [bracket] terms in Description that match skills.json keys.
 */

/** @param {string} name @param {Record<string, { name?: string }>} skillsMap */
export function resolveSkillKey(name, skillsMap) {
  if (!name || !skillsMap || typeof skillsMap !== 'object') return null;
  if (skillsMap[name]) return name;
  const entry = Object.entries(skillsMap).find(([, s]) => s && (s.name === name || s.name === name.trim()));
  return entry ? entry[0] : null;
}

/** @param {unknown} description @param {Record<string, unknown>} skillsMap */
export function skillKeysFromDescription(description, skillsMap) {
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
 * @param {unknown} job
 * @param {Record<string, unknown>} skillsMap
 * @returns {Set<string>}
 */
export function getSelectedSkillIdsForJob(job, skillsMap) {
  const fromIds = new Set(job?.skillIDs || []);
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
