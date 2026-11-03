/**
 * cardMarkup.mjs
 *
 * Single source of truth for scene/resume card inner HTML.
 * Scene and resume shells differ (.biz-card-div vs .biz-resume-div, etc.)
 * but shared content must come from here so typography and padding stay aligned.
 *
 * See docs/CARD-VISUAL-PARITY.md
 */

import { skillLabelHtml, skillLabelText, skillYearsExperienceHtml, canonicalSkillKey } from '@/modules/utils/skillLabel.mjs'

export function escapeHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

/**
 * One back-arrow icon linking to a biz card (scene + resume).
 *
 * @param {{ bizCardId: string, jobNumber?: number, backIconUrl: string, linkClass?: string }} opts
 */
export function renderSkillCardBackIconHtml({ bizCardId, jobNumber, backIconUrl, linkClass = '' }) {
    const jobAttr = jobNumber != null && jobNumber !== ''
        ? ` data-job-number="${escapeHtml(String(jobNumber))}"`
        : ''
    const extraClass = linkClass ? ` ${linkClass}` : ''
    return `<span class="skill-card-biz-title skill-card-back-icon biz-back-link${extraClass}" data-biz-card-id="${escapeHtml(bizCardId)}"${jobAttr} style="cursor: pointer; display: inline-flex;"><img class="back-icon" src="${escapeHtml(backIconUrl)}" alt="" width="16" height="16" aria-hidden="true"></span>`
}

/**
 * @param {{ bizCardId: string, jobNumber?: number }[]} backLinks
 * @param {string} backIconUrl
 * @param {string} [linkClass]
 */
export function renderSkillCardBackIconsHtml(backLinks, backIconUrl, linkClass = '') {
    if (!backLinks?.length) return ''
    const icons = backLinks.map((link) => renderSkillCardBackIconHtml({
        bizCardId: link.bizCardId,
        jobNumber: link.jobNumber,
        backIconUrl,
        linkClass,
    })).join('')
    return `<div class="skill-card-back-icons">${icons}</div>`
}

/** Resume-list only: pencil control to edit the skill's custom info URL. */
export function renderSkillUrlEditBtnHtml(skillSlug) {
    return `<button type="button" class="skill-url-edit-btn" data-skill-slug="${escapeHtml(skillSlug)}" aria-label="Edit skill info URL" title="Edit skill info URL">&#9998;</button>`
}

/**
 * Clickable skill info URL (custom or Wikipedia fallback) for resume cards.
 * @param {string} infoUrl
 */
export function renderSkillInfoUrlLinkHtml(infoUrl) {
    const href = String(infoUrl || '').trim()
    if (!href) return ''
    return `<a class="skill-card-info-url" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(href)}">${escapeHtml(href)}</a>`
}

/**
 * Shared skill card content stack (label, back icons, years).
 * When infoUrl is set (resume list), shows the URL to the right of the name.
 * Pencil edit (if any) is rendered by the resume shell next to the close button.
 */
export function renderSkillCardContentHtml({
    skillSlug,
    skillObj,
    totalYears,
    backLinks = [],
    backIconUrl,
    linkClass = '',
    infoUrl = null,
}) {
    const iconsHtml = backLinks.length
        ? renderSkillCardBackIconsHtml(backLinks, backIconUrl, linkClass)
        : ''
    const labelHtml = `<span class="skill-card-label">${skillLabelHtml(skillSlug, skillObj)}</span>`
    const urlLinkHtml = infoUrl ? renderSkillInfoUrlLinkHtml(infoUrl) : ''
    const nameBlock = infoUrl
        ? `<div class="skill-card-name-row">${labelHtml}${urlLinkHtml}</div>`
        : labelHtml
    return `<div class="skill-card-content">
                ${nameBlock}
                ${iconsHtml}
                ${skillYearsExperienceHtml(totalYears)}
            </div>`
}

export function renderSkillInfoModalBtnHtml(skillSlug, displayName) {
    return `<button type="button" class="skill-info-modal-btn" data-skill-slug="${escapeHtml(skillSlug)}" aria-label="What is ${escapeHtml(displayName)}?">?</button>`
}

/**
 * Inner HTML for scene .skill-card-div (excludes shell attributes/listeners).
 * Scene retains the ? skill-info button; no inline URL row.
 */
export function renderSkillCardSceneInnerHtml({
    skillSlug,
    skillObj,
    totalYears,
    referencingBizCardIds = [],
    backIconUrl,
}) {
    const displayName = skillObj?.name || skillSlug
    const backLinks = referencingBizCardIds.map((bizCardId) => ({ bizCardId }))
    return `${renderSkillInfoModalBtnHtml(skillSlug, displayName)}
            ${renderSkillCardContentHtml({ skillSlug, skillObj, totalYears, backLinks, backIconUrl })}`
}

/**
 * Inner HTML for resume .skill-resume-div appended copy (includes listing-only close btn).
 * Shows clickable info URL; optional pencil sits immediately left of close (top-right).
 * No ? button (scene-only).
 */
export function renderSkillCardResumeInnerHtml({
    skillSlug,
    skillObj,
    totalYears,
    referencingJobNumbers = [],
    backIconUrl,
    bizCardIdForJob,
    infoUrl = '',
    showUrlEdit = false,
}) {
    const backLinks = referencingJobNumbers.map((jobNumber) => ({
        bizCardId: bizCardIdForJob(jobNumber),
        jobNumber,
    }))
    const urlEditHtml = showUrlEdit ? renderSkillUrlEditBtnHtml(skillSlug) : ''
    return `${renderSkillCardContentHtml({
        skillSlug,
        skillObj,
        totalYears,
        backLinks,
        backIconUrl,
        linkClass: 'skill-resume-div-back-link',
        infoUrl,
    })}
    ${urlEditHtml}<button type="button" class="skill-resume-div-close" aria-label="Remove skill card from resume listing">×</button>`
}

/**
 * Ordered skill entries for a biz card's "Technologies & Skills" section (scene cDiv and resume rDiv).
 *
 * Sources, in priority order:
 *   1. job.skillIDs       — user-assigned, ordered
 *   2. job['job-skills']  — enrichment-derived (description brackets + unbracketed names)
 *   3. descriptionSlugs   — slugs the caller already resolved from [brackets]
 *
 * Every id is first resolved to its canonical skills-map key via {@link canonicalSkillKey},
 * so "express-js" (key) and "Express.js" (display name) collapse to ONE entry. Without this
 * step a skill whose key differs from its name rendered twice on every card.
 *
 * Entries are sorted by display name. Ids that resolve to no known skill are kept
 * (displayed as their raw id) so data problems stay visible rather than silently vanishing.
 *
 * @param {{ skillIDs?: unknown, 'job-skills'?: Record<string, string> }} job
 * @param {Record<string, { name?: string }>} skillsData  full skills map (slug → skill)
 * @param {Iterable<string>} [descriptionSlugs]
 * @returns {{ skillKey: string, displayName: string }[]}
 */
export function orderedBizCardSkillEntries(job, skillsData, descriptionSlugs = []) {
    const jobSkills = job?.['job-skills'] && typeof job['job-skills'] === 'object' ? job['job-skills'] : {}
    const skills = skillsData && typeof skillsData === 'object' ? skillsData : {}
    const seen = new Set()
    const result = []
    const add = (rawId) => {
        const key = canonicalSkillKey(rawId, skills)
        if (!key || seen.has(key)) return
        seen.add(key)
        const displayName = skills[key]?.name || jobSkills[key] || jobSkills[rawId] || key
        result.push({ skillKey: key, displayName })
    }
    if (Array.isArray(job?.skillIDs)) job.skillIDs.forEach(add)
    Object.keys(jobSkills).forEach(add)
    for (const slug of descriptionSlugs || []) add(slug)
    return result.sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }))
}

/**
 * Inner HTML of a biz card's .skills-text span: one clickable .biz-card-skill-title per entry,
 * joined by " • ". Shared by the scene cDiv and resume rDiv so both render identically.
 *
 * @param {{ skillKey: string, skillCardId?: string|null }[]} entries  from {@link orderedBizCardSkillEntries}
 * @param {Record<string, { name?: string }>} skillsData
 * @returns {string}
 */
export function renderBizCardSkillTitleSpansHtml(entries, skillsData) {
    const skills = skillsData && typeof skillsData === 'object' ? skillsData : {}
    return (entries || []).map(({ skillKey, skillCardId }) => {
        const skillObj = skills[skillKey]
        const cardIdAttr = skillCardId ? ` data-skill-card-id="${escapeHtml(skillCardId)}"` : ''
        const ariaLabel = `View skill: ${skillLabelText(skillKey, skillObj)}`
        return `<span class="biz-card-skill-title" tabindex="0" role="link" aria-label="${escapeHtml(ariaLabel)}"${cardIdAttr} data-skill-name="${escapeHtml(skillKey)}">${skillLabelHtml(skillKey, skillObj)}</span>`
    }).join(' • ')
}

/**
 * Scene biz card body (header + optional skills block). Matches useCardsController.createBizCardDiv.
 */
export function renderBizCardSceneBodyHtml({
    employer = 'Unknown Employer',
    role = 'Unknown Role',
    datesDisplay = '',
    jobNumber = 0,
    sceneZ = 0,
    hasSkills = false,
}) {
    return `
            <div class="biz-details-employer-wrap">
                <div class="biz-details-employer">${escapeHtml(employer)}</div>
                <button type="button" class="biz-details-edit-btn" aria-label="Edit employer">&#9998;</button>
            </div>
            <div class="biz-details-role">${escapeHtml(role)}</div>
            ${datesDisplay ? `<div class="biz-details-dates">${escapeHtml(datesDisplay)}</div>` : ''}
            <div class="biz-details-debug-row"><span class="biz-details-id-and-hex">#${escapeHtml(String(jobNumber))} z:${escapeHtml(String(sceneZ))} <span class="hex-normal"></span> <span class="hex-highlighted"></span></span></div>
            ${hasSkills ? `
            <div class="resume-skills">
                <div class="resume-section-title-wrap">
                    <h4>Technologies &amp; Skills</h4>
                </div>
                <div class="skills-list">
                    <span class="bullet">&bull;</span>
                    <span class="biz-card-skill-titles skills-text"></span>
                </div>
            </div>` : ''}
        `
}

/**
 * Minimal resume biz header fixture (shared field classes for parity tests / future consolidation).
 */
export function renderBizResumeHeaderHtml({
    employer = 'Unknown Employer',
    role = 'Unknown Role',
    datesDisplay = '',
}) {
    return `
    <div class="biz-resume-details-div">
        <div class="resume-header">
            <div class="biz-details-employer-wrap">
                <div class="biz-details-employer">${escapeHtml(employer)}</div>
            </div>
            <div class="biz-details-role">${escapeHtml(role)}</div>
            ${datesDisplay ? `<div class="biz-details-dates">${escapeHtml(datesDisplay)}</div>` : ''}
        </div>
    </div>`
}
