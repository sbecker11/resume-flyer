/**
 * Build a short label for education-as-job rows: "ShortInst, Degree, Major".
 *
 * - Short institution: text before the first comma in `employer` (e.g. "MIT" from
 *   "MIT, Massachusetts Institute of Technology, Cambridge, MA").
 * - Degree: text before the first comma in `title` (e.g. "PhD" from
 *   "PhD, Media Arts & Sciences — …").
 * - Major: text after that comma, trimmed at a spaced em/en dash (— or –) so
 *   specializations like "— Computer Vision / …" are dropped.
 *
 * @param {unknown} employer - institution string from education → job mapping
 * @param {unknown} title - degree line from education → job mapping
 * @returns {string}
 */
export function educationJobDisplayNameFromParts(employer, title) {
  const emp = String(employer ?? '').trim();
  const ttl = String(title ?? '').trim();
  const shortInst = emp.split(',')[0]?.trim() || '';

  if (!ttl) {
    return shortInst || '';
  }

  const firstComma = ttl.indexOf(',');
  let degree;
  let majorRest;
  if (firstComma === -1) {
    degree = ttl;
    majorRest = '';
  } else {
    degree = ttl.slice(0, firstComma).trim();
    majorRest = ttl.slice(firstComma + 1).trim();
  }

  let major = majorRest;
  const detailSep = major.search(/\s[—–]\s/);
  if (detailSep >= 0) {
    major = major.slice(0, detailSep).trim();
  }

  return [shortInst, degree, major].filter(Boolean).join(', ');
}
