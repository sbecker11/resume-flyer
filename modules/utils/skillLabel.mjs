/**
 * skillLabel.mjs
 *
 * Single source of truth for how a skill is displayed as text throughout the app.
 *
 * The slug id is shown UPPERCASED so it is visually distinct from the display name:
 *
 *   <AWS> AWS
 *   <CI-CD-JENKINS> CI/CD Jenkins
 *   <VUE-JS> Vue.js
 *   <K-MEANS-CLUSTERING> K-means clustering
 *
 * Use skillLabelText() wherever a plain string is needed (aria-labels, titles,
 * option text, DOM innerHTML text nodes).
 *
 * Use skillLabelHtml() wherever HTML is rendered directly (cDiv / rDiv spans,
 * description bullets, skills lists).  The id portion uses class="skill-id-tag"
 * (low-opacity monospace) so it is visually de-emphasised.
 */

const escHtml = (s) =>
    String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')

/**
 * Return the id string used as the visible prefix — no transformation applied.
 * e.g. "vue-js" → "vue-js", "aws-s3" → "aws-s3"
 *
 * @param {string} slug
 * @returns {string}
 */
export function skillIdDisplay(slug) {
    return String(slug)
}

/**
 * Resolve the canonical display name for a skill.
 * Priority: skill.name → slug (last-resort raw key).
 *
 * @param {string} slug  - the skill key / id (e.g. "ci-cd-jenkins")
 * @param {{ name?: string } | null | undefined} skill - skill object from skills.json (optional)
 * @returns {string}
 */
export function skillDisplayName(slug, skill) {
    return (skill && skill.name) ? skill.name : slug
}

/**
 * Plain-text label: "<SLUG> DisplayName"
 * Safe for use in aria-label, title, option text, console output, etc.
 *
 * @param {string} slug
 * @param {{ name?: string } | null | undefined} skill
 * @returns {string}
 */
export function skillLabelText(slug, skill) {
    return `<${skillIdDisplay(slug)}> ${skillDisplayName(slug, skill)}`
}

/**
 * HTML label: visually renders as  <SLUG> DisplayName
 * The angle-bracket id portion uses class="skill-id-tag" (low-opacity monospace).
 * Safe to inject as innerHTML.
 *
 * @param {string} slug
 * @param {{ name?: string } | null | undefined} skill
 * @returns {string}  HTML string
 */
export function skillLabelHtml(slug, skill) {
    const name = skillDisplayName(slug, skill)
    return `<span class="skill-id-tag">&lt;${escHtml(skillIdDisplay(slug))}&gt;</span> ${escHtml(name)}`
}

/**
 * Plain-text years line for skill cards: "(3 yrs exp.)"
 *
 * @param {number} totalYears
 * @returns {string} empty when totalYears <= 0
 */
export function skillYearsExperienceLabel(totalYears) {
    const n = Number(totalYears)
    if (!Number.isFinite(n) || n <= 0) return ''
    return `(${n} yr${n !== 1 ? 's' : ''} exp.)`
}

/**
 * HTML years row for skill cards (scene + resume use the same markup).
 *
 * @param {number} totalYears
 * @param {string} [className='skill-card-years']
 * @returns {string}
 */
export function skillYearsExperienceHtml(totalYears, className = 'skill-card-years') {
    const label = skillYearsExperienceLabel(totalYears)
    if (!label) return ''
    return `<span class="${className}">${label}</span>`
}

/**
 * Convenience one-liner: given a slug and the full skills map, return the
 * display label.  Guarantees one slug → one label as long as skills.json has
 * a single entry per slug.
 *
 * Usage:
 *   import { skillLabelForSlug } from '@/modules/utils/skillLabel.mjs';
 *   import { getSkillsData }     from '@/modules/composables/useJobsDependency.mjs';
 *
 *   const label = skillLabelForSlug('vue-js', getSkillsData()); // "Vue.js"
 *
 * @param {string} slug
 * @param {Record<string, { name?: string }>} skillsData  - the full skills map
 * @returns {string}
 */
export function skillLabelForSlug(slug, skillsData) {
    return skillDisplayName(slug, skillsData?.[slug])
}

/**
 * Reverse lookup: given a display label (the text inside brackets in a job
 * description, e.g. "AWS Glue"), return the canonical slug from skillsData.
 *
 * Matching is case-insensitive on skill.name first, then on slug itself.
 * If no exact match, retries after stripping common corporate / legal suffixes
 * (Inc., LLC, Corp., Ltd., Co., Company, Corporation) so "[Apple Inc.]" resolves
 * to a skill named "Apple" without requiring a duplicate skills.json entry.
 * Returns null if no match — callers must treat null as a hard data error
 * (the description contains a bracketed term with no matching skill entry).
 *
 * No free-form aliases or slug generation.  If this returns null, fix the
 * description or add a skill entry in skills.json.
 *
 * @param {string} label  - bare label text, brackets already stripped
 * @param {Record<string, { name?: string }>} skillsData
 * @returns {string|null}  slug, or null if not found
 */
export function labelToSlug(label, skillsData) {
    if (!label || !skillsData) return null
    const exact = matchLabelToSlugExact(label, skillsData)
    if (exact) return exact
    const stripped = stripCorporateSuffix(label)
    if (stripped && stripped.toLowerCase() !== String(label).trim().toLowerCase()) {
        return matchLabelToSlugExact(stripped, skillsData)
    }
    return null
}

/** Common legal/corporate suffixes parsers often leave on employer-like skill tags. */
const CORPORATE_SUFFIX_RE = /(?:\s*[,.]?\s*)?\b(?:incorporated|corporation|company|corp\.?|inc\.?|llc\.?|ltd\.?|l\.?l\.?c\.?|co\.?)\s*\.?$/i

/**
 * @param {string} label
 * @returns {string}
 */
export function stripCorporateSuffix(label) {
    let s = String(label).trim()
    // Repeat in case of stacked suffixes (e.g. "Acme Co., Inc.")
    for (let i = 0; i < 3; i++) {
        const next = s.replace(CORPORATE_SUFFIX_RE, '').trim().replace(/[,\s.]+$/, '').trim()
        if (next === s) break
        s = next
    }
    return s
}

/**
 * @param {string} label
 * @param {Record<string, { name?: string }>} skillsData
 * @returns {string|null}
 */
function matchLabelToSlugExact(label, skillsData) {
    const lower = String(label).trim().toLowerCase()
    if (!lower) return null
    for (const [slug, skill] of Object.entries(skillsData)) {
        if ((skill?.name || '').toLowerCase() === lower) return slug
    }
    for (const slug of Object.keys(skillsData)) {
        if (slug.toLowerCase() === lower) return slug
    }
    return null
}
