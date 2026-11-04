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
import { canonicalSkillKey } from './skillLabel.mjs'
import { getSelectedSkillIdsForJob } from '../resume-details-editor/jobSkillsSelection.mjs'
import { jobColumnHeaderText, skillRowDisplayLabel } from '../resume-details-editor/skillJobsMatrixLabels.mjs'
import { isEducationDerivedJob } from '../data/ResumeJob.mjs'
import { educationJobDisplayNameFromParts } from './educationJobDisplayName.mjs'

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
 * Each job's linked skill keys, resolved once per build. Resolving per card would
 * repeat the display-name → key lookups cards × jobs times.
 * @param {Array<object>|null|undefined} jobs
 * @param {Record<string, unknown>} skillsData
 * @returns {Array<{ job: object, skillIds: Set<string> }>}
 */
function jobSkillSets(jobs, skillsData) {
    const out = []
    for (const job of jobs || []) {
        out.push({ job, skillIds: getSelectedSkillIdsForJob(job, skillsData) })
    }
    return out
}

/**
 * Same month total the Skill jobs tab shows in parentheses after a skill name.
 * @param {string} skillId
 * @param {Array<{ job: object, skillIds: Set<string> }>} jobSets from jobSkillSets()
 * @returns {{ jobCount: number, monthsTotal: number }}
 */
function skillJobsExperience(skillId, jobSets) {
    let jobCount = 0
    let monthsTotal = 0
    for (const { job, skillIds } of jobSets) {
        if (!skillIds.has(skillId)) continue
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
 * A card's data-skill-name is normally the skills-map key, but it may also be a
 * display-name variant ("C++" / "c++" for key "c"). Resolve it like any other id so
 * the row shows skill.name and counts the same months as the Skill jobs tab; a token
 * that matches no skill is shown exactly as written (never re-cased).
 *
 * @param {Iterable<Element>} cardElements
 * @param {Record<string, { name?: string }>} [skillsData]
 * @param {unknown} [catalog] shared skill-URL catalog, used only when the skill has no url
 * @param {Array<object>|null} [jobs] when set, labels use the Skill jobs month total: "Name (number)"
 * @returns {{ kind: 'skill', id: string, label: string, sublabel: string, slug: string }[]}
 */
export function buildSkillSearchOptions(cardElements, skillsData = {}, catalog = null, jobs = null) {
    const bySlug = skillCardIdBySlugFromElements(cardElements)
    const jobSets = Array.isArray(jobs) ? jobSkillSets(jobs, skillsData) : null
    const options = Object.entries(bySlug).map(([slug, id]) => {
        const key = canonicalSkillKey(slug, skillsData) || slug
        const skill = skillsData[key]
        const url = userDefinedSkillUrl(catalog, key, skill?.name, skill?.url)
        const name = skill?.name || slug
        let label = name
        if (jobSets) {
            const { jobCount, monthsTotal } = skillJobsExperience(key, jobSets)
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
        const job = Array.isArray(jobs) ? jobs[jobNumber] : null
        let name = employer || `Job ${jobNumber}`
        if (isEducationDerivedJob(job)) {
            const shortName = educationJobDisplayNameFromParts(
                job.employer || job.Employer || employer,
                job.title || job.role || job.Role || role,
            )
            if (shortName) name = shortName
        }
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
