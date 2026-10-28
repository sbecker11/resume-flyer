/**
 * Build a short label for education-as-job rows: "ShortInst, Degree, Major".
 *
 * - Short institution: text before the first comma in `employer` (e.g. "MIT" from
 *   "MIT, Massachusetts Institute of Technology, Cambridge, MA").
 * - Degree: text before the first comma in `title` (e.g. "PhD" from
 *   "PhD, Media Arts & Sciences — …").
 * - Major: text after that comma, trimmed at a spaced em/en dash (— or –) so
 *   specializations like "— Computer Vision / …" are dropped.
 * - A year range such as "1990 - 1997" ends the label. The range and everything
 *   after it are removed.
 * - A remaining long university name becomes its 3-letter acronym: a parenthetical
 *   such as "(MIT)", otherwise the initials of the significant words ("BYU").
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
    return shortenLongUniversityName(truncateBeforeDateRange(shortInst));
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

  return shortenLongUniversityName(
    truncateBeforeDateRange([shortInst, degree, major].filter(Boolean).join(', ')),
  );
}

/**
 * Drop a year range and everything after it: "Name  —  1990 - 1997, PhD" → "Name".
 * @param {string} label
 * @returns {string}
 */
export function truncateBeforeDateRange(label) {
  const str = String(label ?? '').trim();
  const match = str.match(/\d{4}\s*[-–—]\s*\d{4}/);
  if (!match || match.index == null) return str;
  return str.slice(0, match.index).replace(/[\s,–—-]+$/u, '').trim();
}

const UNIVERSITY_NAME_SKIP = new Set(['of', 'the', 'and', 'at', 'for', 'a', 'an']);

/**
 * Turn a single long university name into a 3-letter acronym.
 * Labels that already include a degree ("MIT, PhD, …") are left unchanged.
 * @param {string} label
 * @returns {string}
 */
export function shortenLongUniversityName(label) {
  const name = String(label ?? '').trim();
  if (!name || name.includes(',')) return name;
  if (/^[A-Z]{2,5}$/.test(name)) return name;
  const paren = name.match(/\(([A-Z]{2,5})\)/);
  if (paren) return paren[1];
  const letters = name
    .split(/[^A-Za-z]+/)
    .filter((word) => word && !UNIVERSITY_NAME_SKIP.has(word.toLowerCase()))
    .map((word) => word[0].toUpperCase());
  if (letters.length === 3) return letters.join('');
  return name;
}
