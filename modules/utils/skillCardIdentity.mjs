/**
 * Canonical scene skill-card identity, finder rows, and years.
 *
 * Scene skill cards are created once, then hidden clones are provisioned with
 * the same class and data-skill-name. Finder rows and resume copies must use
 * the non-clone card so one skill has one row and one resume card.
 *
 * Years on the scene card are ceil(sum(durationMonths) / 12), where
 * durationMonths is the inclusive calendar-month span. That value is stamped
 * on data-total-years-experience. Resume copies must show that same number.
 */

import { reportError } from './errorReporting.mjs'
import { userDefinedSkillUrl } from './skillUrlCatalog.mjs'
import { getSelectedSkillIdsForJob } from '../resume-details-editor/jobSkillsSelection.mjs'
import { jobColumnHeaderText, skillRowDisplayLabel } from '../resume-details-editor/skillJobsMatrixLabels.mjs'

const CLONE_ID_SUFFIX = '-clone'

/**
 * Scene skill-card id with a trailing `-clone` removed.
 * Non-clone ids are returned unchanged.
 * @param {unknown} skillCardId
 * @returns {string}
 */
export function canonicalSkillCardId(skillCardId) {
    const id = typeof skillCardId === 'string' ? skillCardId : ''
    if (!id) return ''
    return id.endsWith(CLONE_ID_SUFFIX) ? id.slice(0, -CLONE_ID_SUFFIX.length) : id
}

/**
 * Prefer the non-clone scene skill card. Falls back to its hidden clone.
 * @param {unknown} skillCardId
 * @param {Document|ParentNode} [doc]
 * @returns {HTMLElement|null}
 */
export function resolveSceneSkillCardElement(skillCardId, doc = globalThis.document) {
    const canonical = canonicalSkillCardId(skillCardId)
    if (!canonical || !doc || typeof doc.getElementById !== 'function') return null
    const original = doc.getElementById(canonical)
    if (original && !original.classList.contains('clone')) return original
    const clone = doc.getElementById(`${canonical}-clone`)
    if (clone) return clone
    return original || null
}

/**
 * First non-clone skill card id per slug.
 * Later clones must not overwrite the canonical id.
 * @param {Iterable<Element>} elements
 * @returns {Record<string, string>}
 */
export function skillCardIdBySlugFromElements(elements) {
    const map = Object.create(null)
    if (!elements) return map
    for (const el of elements) {
        if (!el || el.classList?.contains('clone')) continue
        const slug = String(el.getAttribute?.('data-skill-name') || '').trim()
        const id = canonicalSkillCardId(el.id)
        if (!slug || !id || map[slug]) continue
        map[slug] = id
    }
    return map
}

/**
 * Same month total the Skill jobs tab shows in parentheses after a skill name.
 * @param {string} skillId
 * @param {Array<object>|null|undefined} jobs
 * @param {Record<string, unknown>} skillsData
 * @returns {{ jobCount: number, monthsTotal: number }}
 */
function skillJobsExperience(skillId, jobs, skillsData) {
    let jobCount = 0
    let monthsTotal = 0
    for (const job of jobs || []) {
        if (!getSelectedSkillIdsForJob(job, skillsData).has(skillId)) continue
        jobCount += 1
        const n = job?.durationMonths
        if (typeof n === 'number' && Number.isFinite(n) && n > 0) monthsTotal += n
    }
    return { jobCount, monthsTotal }
}

/**
 * Same skill count and tenure the Skill jobs tab shows before a job name.
 * @param {object|undefined} job
 * @param {Record<string, unknown>} skillsData
 * @returns {{ skillCount: number, durationMonths: number|null|undefined }}
 */
function jobRowExperience(job, skillsData) {
    let skillCount = 0
    for (const id of getSelectedSkillIdsForJob(job, skillsData)) {
        if (skillsData?.[id] != null) skillCount += 1
    }
    return { skillCount, durationMonths: job?.durationMonths }
}

/**
 * @param {Iterable<Element>} cardElements
 * @param {Record<string, { name?: string }>} [skillsData]
 * @param {unknown} [catalog] shared skill-URL catalog, used only when the skill has no url
 * @param {Array<object>|null} [jobs] when set, labels use the Skill jobs month total: "Name (number)"
 * @returns {{ kind: 'skill', id: string, label: string, sublabel: string }[]}
 */
export function buildSkillSearchOptions(cardElements, skillsData = {}, catalog = null, jobs = null) {
    const bySlug = skillCardIdBySlugFromElements(cardElements)
    const options = Object.entries(bySlug).map(([slug, id]) => {
        const skill = skillsData[slug]
        const url = userDefinedSkillUrl(catalog, slug, skill?.name, skill?.url)
        const name = skill?.name || slug
        let label = name
        if (Array.isArray(jobs)) {
            const { jobCount, monthsTotal } = skillJobsExperience(slug, jobs, skillsData)
            label = skillRowDisplayLabel(name, jobCount, monthsTotal)
        }
        return {
            kind: 'skill',
            id,
            label,
            sublabel: url || '',
            slug,
        }
    })
    options.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
    return options
}

/**
 * @param {Iterable<Element>} cardElements
 * @param {Array<object>|null} [jobs] when set, labels use the Skill jobs tenure: "(number) Name"
 * @param {Record<string, unknown>|null} [skillsData]
 * @returns {{ kind: 'job', id: number, label: string, sublabel: string }[]}
 */
export function buildJobSearchOptions(cardElements, jobs = null, skillsData = null) {
    const options = []
    if (!cardElements) return options
    const skills = skillsData && typeof skillsData === 'object' ? skillsData : {}
    for (const el of cardElements) {
        if (!el || el.classList?.contains('clone')) continue
        const rawJob = String(el.getAttribute?.('data-job-number') || '').trim()
        const jobNumber = Number.parseInt(rawJob, 10)
        if (!Number.isFinite(jobNumber)) continue
        const employer = String(el.getAttribute?.('data-employer') || '').trim()
        const role = String(el.getAttribute?.('data-role') || '').trim()
        const name = employer || `Job ${jobNumber}`
        let label = name
        if (Array.isArray(jobs)) {
            const { skillCount, durationMonths } = jobRowExperience(jobs[jobNumber], skills)
            label = jobColumnHeaderText(name, skillCount, durationMonths)
        }
        options.push({
            kind: 'job',
            id: jobNumber,
            label,
            sublabel: role || 'Job',
        })
    }
    options.sort((a, b) => a.id - b.id)
    return options
}

/**
 * @param {{ label: string, sublabel: string }[]} options
 * @param {string} query
 */
export function filterSearchOptionsByQuery(options, query) {
    const q = String(query ?? '').trim().toLowerCase()
    if (!q || !Array.isArray(options)) return options || []
    return options.filter((opt) => {
        const haystack = [opt.label, opt.sublabel, opt.slug].filter(Boolean).join('\n').toLowerCase()
        return haystack.includes(q)
    })
}

/**
 * Whole years shown on a scene skill card.
 * Sum each job's durationMonths (inclusive calendar months) and ceil-divide by 12.
 * An exclusive month difference (end − start, start month not counted) is one month
 * short per job and can ceiling to a smaller year count.
 *
 * @param {Array<{ durationMonths?: number|null }>|null|undefined} jobs
 * @returns {number}
 */
export function totalYearsFromDurationMonths(jobs) {
    if (!Array.isArray(jobs)) return 0
    let totalMonths = 0
    for (const job of jobs) {
        const n = job?.durationMonths
        if (typeof n === 'number' && Number.isFinite(n) && n > 0) totalMonths += n
    }
    return totalMonths > 0 ? Math.ceil(totalMonths / 12) : 0
}

/**
 * Years the resume skill card must show: the value stamped on the scene card,
 * otherwise the same durationMonths sum the scene card uses.
 *
 * @param {Element|null|undefined} sceneEl
 * @param {Array<{ durationMonths?: number|null }>|null|undefined} jobs
 * @returns {number}
 */
export function resumeSkillYearsMatchingScene(sceneEl, jobs) {
    if (sceneEl?.hasAttribute?.('data-total-years-experience')) {
        const raw = String(sceneEl.getAttribute('data-total-years-experience') ?? '').trim()
        if (/^\d+$/.test(raw)) return parseInt(raw, 10)
        reportError(
            new Error(`Invalid data-total-years-experience "${raw}"`),
            '[skillCardIdentity] Scene skill card years attribute is not a whole number',
            'Computing years from job durationMonths (same formula as the scene card)'
        )
    }
    return totalYearsFromDurationMonths(jobs)
}

/**
 * Resume listing already showing this skill (canonical id, clone id, or same slug).
 * @param {ParentNode|null|undefined} list
 * @param {unknown} skillCardId
 * @param {string} [skillName]
 * @returns {Element|null}
 */
export function findExistingResumeSkillCopy(list, skillCardId, skillName = '') {
    if (!list || typeof list.querySelectorAll !== 'function') return null
    const canonical = canonicalSkillCardId(skillCardId)
    const wantedIds = new Set([canonical, typeof skillCardId === 'string' ? skillCardId : ''].filter(Boolean))
    const copies = list.querySelectorAll('.appended-skill-resume-div')
    for (const el of copies) {
        const id = el.getAttribute('data-skill-card-id') || ''
        if (wantedIds.has(id) || (id && wantedIds.has(canonicalSkillCardId(id)))) return el
    }
    const slug = String(skillName || '').trim()
    if (!slug) return null
    for (const el of copies) {
        if ((el.getAttribute('data-skill-name') || '') === slug) return el
    }
    return null
}
