/**
 * Escape a user-entered string so it can be used as a literal regex pattern.
 * @param {string} value
 * @returns {string}
 */
function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build a resilient regex from user input.
 * Supports:
 * - raw pattern input: "aws|gcp"
 * - slash notation: "/aws|gcp/i"
 *
 * Always adds case-insensitive matching and strips stateful flags (`g`, `y`)
 * so repeated `.test()` calls are stable while filtering.
 *
 * @param {string} query
 * @returns {RegExp | null}
 */
export function buildSkillSearchRegex(query) {
  const raw = String(query ?? '').trim();
  if (!raw) return null;

  const slashForm = raw.match(/^\/(.+)\/([a-z]*)$/i);
  let pattern = raw;
  let flags = 'i';
  if (slashForm) {
    pattern = slashForm[1];
    flags = slashForm[2] || '';
  }
  if (!flags.includes('i')) flags += 'i';
  flags = flags.replace(/[gy]/g, '');

  try {
    return new RegExp(pattern, flags);
  } catch {
    // Remedy: treat invalid regex as plain text query.
    return new RegExp(escapeRegex(raw), 'i');
  }
}

/**
 * Regex-filter skills by both id and display name.
 *
 * @param {{ id: string, name: string }[]} skills
 * @param {string} query
 * @returns {{ id: string, name: string }[]}
 */
export function filterSkillsBySearchQuery(skills, query) {
  const re = buildSkillSearchRegex(query);
  if (!re) return skills;
  return skills.filter((skill) => re.test(`${skill.id} ${skill.name}`));
}
