/**
 * cardMarkup.mjs
 *
 * Single source of truth for scene/resume card inner HTML.
 * Scene and resume shells differ (.biz-card-div vs .biz-resume-div, etc.)
 * but shared content must come from here so typography and padding stay aligned.
 *
 * See docs/CARD-VISUAL-PARITY.md
 */

import { skillLabelHtml, skillYearsExperienceHtml } from '@/modules/utils/skillLabel.mjs'

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
