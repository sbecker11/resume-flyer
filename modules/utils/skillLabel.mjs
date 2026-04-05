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
 * Returns null if no match — callers must treat null as a hard data error
 * (the description contains a bracketed term with no matching skill entry).
 *
 * No aliases, no fuzzy matching, no slug generation.  If this returns null,
 * fix the description or add a skill entry in skills.json.
 *
 * @param {string} label  - bare label text, brackets already stripped
 * @param {Record<string, { name?: string }>} skillsData
 * @returns {string|null}  slug, or null if not found
 */
export function labelToSlug(label, skillsData) {
    if (!label || !skillsData) return null
    const lower = String(label).toLowerCase()
    for (const [slug, skill] of Object.entries(skillsData)) {
        if ((skill?.name || '').toLowerCase() === lower) return slug
    }
    // fallback: match by slug itself (e.g. label === slug)
    for (const slug of Object.keys(skillsData)) {
        if (slug.toLowerCase() === lower) return slug
    }
    return null
}
