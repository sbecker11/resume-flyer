/**
 * skillInfoModal.mjs
 *
 * Shared utility: fetch a skill's LLM-generated definition from the server
 * and display it in a modal overlay.
 *
 * On static hosts (GitHub Pages) the API is unavailable; the ? button is
 * hidden via CSS and openSkillInfoModal shows a "not available" message
 * instead of making a failing network request.
 *
 * Usage:
 *   import { openSkillInfoModal } from '@/modules/utils/skillInfoModal.mjs';
 *   openSkillInfoModal(slug, displayName);
 */

import { hasServer } from '@/modules/core/hasServer.mjs';
import { getGlobalJobsDependency } from '@/modules/composables/useJobsDependency.mjs';
import { jobTenureMonthsInclusive } from '@/modules/utils/dateUtils.mjs';
import { createBizCardDivId } from '@/modules/utils/bizCardUtils.mjs';
import { scrollResumeListingElementIntoView } from '@/modules/utils/resumeListScroll.mjs';

const MODAL_ID = 'skill-info-modal';
const SKILL_BIZ_LINK_CLASS = 'skill-info-biz-link';
const SKILL_BIZ_LINK_JOB_ATTR = 'data-job-number';
const SKILL_BIZ_LINK_SKILL_ATTR = 'data-skill-name';
const FOCUSED_SKILL_LINK_CLASS = 'skill-link-focused-from-modal';
const SOURCE_BIZ_BACKLINK_CLASS = 'biz-back-link-source';
const DEFAULT_SKILL_INFO_SOURCE_BASE_URL = 'http://wikipedia.com/wiki/';
/** Matches scene `.biz-card-div` crop inset (styles/scene.css + updateBizCardSkillsVisibility). */
const BIZ_CARD_CROP_BOTTOM_INSET_PX = 20;
const SCENE_SKILL_SCROLL_MARGIN_PX = 8;
/** Keep focused skill pill clear of the T&S clip edge after internal scroll. */
const SKILLS_SECTION_SCROLL_MARGIN_PX = 6;

function buildSkillInfoSourceUrl(slug, displayName) {
    const configuredBase = String(import.meta?.env?.VITE_SKILL_INFO_SOURCE_BASE_URL || '').trim();
    const baseUrl = configuredBase || DEFAULT_SKILL_INFO_SOURCE_BASE_URL;
    const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    const term = String(slug || displayName || '').trim();
    if (!term) return normalizedBase;
    return `${normalizedBase}${encodeURIComponent(term)}`;
}

// Single global delegated listener — survives any innerHTML replacement on cards.
let _delegateInstalled = false;
function installGlobalDelegate() {
    if (_delegateInstalled) return;
    _delegateInstalled = true;
    document.addEventListener('click', (e) => {
        const bizLink = e.target.closest(`.${SKILL_BIZ_LINK_CLASS}`);
        if (bizLink) {
            e.stopPropagation();
            e.preventDefault();
            const raw = bizLink.getAttribute(SKILL_BIZ_LINK_JOB_ATTR);
            const skillSlug = String(bizLink.getAttribute(SKILL_BIZ_LINK_SKILL_ATTR) || '').trim();
            const jobNumber = raw == null ? NaN : Number.parseInt(raw, 10);
            if (!Number.isFinite(jobNumber)) return;
            const sm = window.resumeFlyer?.selectionManager;
            if (sm?.selectCard) {
                sm.selectCard({ type: 'biz', jobNumber }, 'SkillInfoModal.bizLinkClick');
                if (skillSlug) {
                    // Clone creation/selection is async; retry briefly to mark both cDiv and rDiv links.
                    markFocusedSkillLinkForJob(jobNumber, skillSlug);
                }
                const modal = document.getElementById(MODAL_ID);
                if (modal) closeModal(modal);
            }
            return;
        }

        const btn = e.target.closest('.skill-info-modal-btn');
        if (!btn) return;
        e.stopPropagation();
        e.preventDefault();
        // On static hosts the button should be hidden by CSS, but guard here too.
        if (!hasServer()) return;
        const card = btn.closest('.skill-card-div, .skill-resume-div, .appended-skill-resume-div');
        const slug = card?.getAttribute('data-skill-name') || btn.getAttribute('data-skill-slug') || '';
        const displayName = btn.getAttribute('aria-label')?.replace(/^What is /, '').replace(/\?$/, '') || slug;
        console.log(`[SkillInfoModal] ? clicked — slug: "${slug}", name: "${displayName}"`);
        if (slug) openSkillInfoModal(slug, displayName, card);
    }, true); // capture phase so stopPropagation blocks card deselection
}

function clearFocusedSkillLinkClass() {
    document.querySelectorAll(`.biz-card-skill-title.${FOCUSED_SKILL_LINK_CLASS}`).forEach((el) => {
        el.classList.remove(FOCUSED_SKILL_LINK_CLASS);
    });
    restoreTemporarilyGrownBizCardHeights();
}

export function markFocusedSkillLinkForJob(jobNumber, skillSlug) {
    clearFocusedSkillLinkClass();
    const escJob = CSS.escape(String(jobNumber));
    const escSkill = CSS.escape(String(skillSlug));
    const containerSelector = `.biz-card-div[data-job-number="${escJob}"], .biz-resume-div[data-job-number="${escJob}"]`;
    const apply = () => {
        const containers = Array.from(document.querySelectorAll(containerSelector));
        if (!containers.length) return false;
        let appliedAny = false;
        containers.forEach((container) => {
            container.querySelectorAll(`.biz-card-skill-title.${FOCUSED_SKILL_LINK_CLASS}`).forEach((el) => {
                el.classList.remove(FOCUSED_SKILL_LINK_CLASS);
            });
            const matches = container.querySelectorAll(`.biz-card-skill-title[data-skill-name="${escSkill}"]`);
            if (matches.length) {
                matches.forEach((el) => el.classList.add(FOCUSED_SKILL_LINK_CLASS));
                appliedAny = true;
            }
        });
        return appliedAny;
    };
    if (apply()) return;
    // Retry a few times while selected cDiv clone is being created.
    requestAnimationFrame(() => {
        if (apply()) return;
        requestAnimationFrame(() => {
            if (apply()) return;
            window.setTimeout(() => { apply(); }, 120);
        });
    });
}

/**
 * Vertical extent of an element, including every line box when text wraps
 * (`display: inline` skill titles return one client rect per line).
 * @param {HTMLElement} el
 * @returns {{ top: number, bottom: number, height: number }}
 */
export function getElementVerticalExtent(el) {
    if (!el) return { top: 0, bottom: 0, height: 0 };
    const rects = el.getClientRects?.() || [];
    let top = Infinity;
    let bottom = -Infinity;
    for (const r of rects) {
        if (r.width <= 0 && r.height <= 0) continue;
        top = Math.min(top, r.top);
        bottom = Math.max(bottom, r.bottom);
    }
    if (Number.isFinite(top) && Number.isFinite(bottom) && bottom >= top) {
        return { top, bottom, height: bottom - top };
    }
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, height: r.height };
}

/**
 * True when a skill title is fully inside the visible T&S clip
 * (`.resume-skills` box, which is itself inside the card’s bottom inset crop).
 * Hidden T&S sections never count as visible.
 * Uses all line boxes so multi-line skill titles are not treated as single-line.
 * @param {HTMLElement} skillTitleEl
 * @param {HTMLElement} cardEl - .biz-card-div (original or clone)
 * @returns {boolean}
 */
export function isSkillTitleVisibleInBizCardCrop(skillTitleEl, cardEl) {
    if (!skillTitleEl || !cardEl) return false;
    const skillsEl = cardEl.querySelector('.resume-skills');
    if (!skillsEl || skillsEl.style.display === 'none') return false;

    const skillsRect = skillsEl.getBoundingClientRect();
    if (skillsRect.height <= 0 || skillsRect.width <= 0) return false;

    // Also respect the card’s intentional bottom inset (padding-bottom / crop).
    const cardRect = cardEl.getBoundingClientRect();
    const cropBottom = Math.min(skillsRect.bottom, cardRect.bottom - BIZ_CARD_CROP_BOTTOM_INSET_PX);
    const cropTop = Math.max(skillsRect.top, cardRect.top);

    const { top, bottom, height } = getElementVerticalExtent(skillTitleEl);
    return height > 0
        && top >= cropTop - 0.5
        && bottom <= cropBottom + 0.5;
}

function isSceneCardElementVisible(el) {
    if (!el) return false;
    const cs = window.getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    const rect = el.getBoundingClientRect();
    return rect.height > 0 && rect.width > 0;
}

function getVisibleBizCardForJob(jobNumber) {
    const originalId = createBizCardDivId(jobNumber);
    const clone = document.getElementById(`${originalId}-clone`);
    if (isSceneCardElementVisible(clone)) return clone;
    const original = document.getElementById(originalId);
    if (isSceneCardElementVisible(original)) return original;
    return null;
}

/**
 * Programmatically scroll `.resume-skills` (overflow:hidden still scrolls via scrollTop)
 * so the skill title (including every wrapped line) sits fully inside the T&S clip window.
 * Multi-line titles taller than the clip are pinned to the top of the window.
 * @returns {boolean} true when the skill is fully visible in the section after adjustment
 */
function scrollSkillFullyIntoSkillsSection(skillEl, skillsEl, cardEl) {
    if (!skillEl || !skillsEl) return false;

    const margin = SKILLS_SECTION_SCROLL_MARGIN_PX;
    const skillsRect = skillsEl.getBoundingClientRect();
    const cardRect = cardEl?.getBoundingClientRect?.() || skillsRect;
    const clipTop = Math.max(skillsRect.top, cardRect.top) + margin;
    const clipBottom = Math.min(skillsRect.bottom, cardRect.bottom - BIZ_CARD_CROP_BOTTOM_INSET_PX) - margin;

    if (clipBottom <= clipTop) return false;

    const { top, bottom, height } = getElementVerticalExtent(skillEl);
    const clipHeight = clipBottom - clipTop;
    let delta = 0;

    if (height > clipHeight) {
        // Can't fit every line — show from the first line downward.
        delta = top - clipTop;
    } else if (bottom > clipBottom) {
        delta = bottom - clipBottom;
    } else if (top < clipTop) {
        delta = top - clipTop;
    }

    if (Math.abs(delta) > 0.5) {
        skillsEl.scrollTop += delta;
    }

    // Second pass after layout: wrapped inline → inline-block focus can change height.
    const after = getElementVerticalExtent(skillEl);
    const afterSkills = skillsEl.getBoundingClientRect();
    const afterCard = cardEl?.getBoundingClientRect?.() || afterSkills;
    const afterClipTop = Math.max(afterSkills.top, afterCard.top) + margin;
    const afterClipBottom = Math.min(afterSkills.bottom, afterCard.bottom - BIZ_CARD_CROP_BOTTOM_INSET_PX) - margin;
    let delta2 = 0;
    if (after.height <= afterClipBottom - afterClipTop) {
        if (after.bottom > afterClipBottom) delta2 = after.bottom - afterClipBottom;
        else if (after.top < afterClipTop) delta2 = after.top - afterClipTop;
    } else {
        delta2 = after.top - afterClipTop;
    }
    if (Math.abs(delta2) > 0.5) {
        skillsEl.scrollTop += delta2;
    }

    return isSkillTitleVisibleInBizCardCrop(skillEl, cardEl || skillsEl.closest('.biz-card-div'));
}

const CARD_HEIGHT_BEFORE_SKILL_FOCUS_ATTR = 'data-prev-height-for-skill-focus';

/** Restore any biz cards temporarily grown to reveal a focused T&S skill. */
function restoreTemporarilyGrownBizCardHeights() {
    document.querySelectorAll(`.biz-card-div[${CARD_HEIGHT_BEFORE_SKILL_FOCUS_ATTR}]`).forEach((card) => {
        const prev = card.getAttribute(CARD_HEIGHT_BEFORE_SKILL_FOCUS_ATTR);
        if (prev == null || prev === '') return;
        card.style.height = `${prev}px`;
        card.setAttribute('data-sceneHeight', prev);
        card.removeAttribute(CARD_HEIGHT_BEFORE_SKILL_FOCUS_ATTR);
        const skillsEl = card.querySelector('.resume-skills');
        if (skillsEl) skillsEl.scrollTop = 0;
    });
}

/**
 * When T&S scrollTop cannot reveal the skill (section too short / almost no overflow),
 * temporarily grow the selected card so the focused skill fits above the crop inset.
 * Used for cramped cards like Spanish-only jobs where scroll range is only a few px.
 */
function growCardToFitFocusedSkill(skillEl, skillsEl, cardEl) {
    if (!skillEl || !cardEl) return false;
    if (isSkillTitleVisibleInBizCardCrop(skillEl, cardEl)) return true;

    const margin = SKILLS_SECTION_SCROLL_MARGIN_PX;
    const { bottom } = getElementVerticalExtent(skillEl);
    const cardRect = cardEl.getBoundingClientRect();
    const cropBottom = cardRect.bottom - BIZ_CARD_CROP_BOTTOM_INSET_PX - margin;
    const shortfall = bottom - cropBottom;
    if (shortfall <= 0.5) return true;

    const prevHeight = parseFloat(cardEl.style.height) || cardRect.height;
    if (!cardEl.hasAttribute(CARD_HEIGHT_BEFORE_SKILL_FOCUS_ATTR)) {
        cardEl.setAttribute(CARD_HEIGHT_BEFORE_SKILL_FOCUS_ATTR, String(prevHeight));
    }
    const nextHeight = prevHeight + Math.ceil(shortfall) + 4;
    cardEl.style.height = `${nextHeight}px`;
    cardEl.setAttribute('data-sceneHeight', String(nextHeight));

    // Flex T&S section grows with the card — scroll again into the larger clip.
    scrollSkillFullyIntoSkillsSection(skillEl, skillsEl, cardEl);
    if (isSkillTitleVisibleInBizCardCrop(skillEl, cardEl)) return true;

    // Still short (header/layout): grow once more from fresh measurement.
    const again = getElementVerticalExtent(skillEl);
    const cardRect2 = cardEl.getBoundingClientRect();
    const cropBottom2 = cardRect2.bottom - BIZ_CARD_CROP_BOTTOM_INSET_PX - margin;
    const shortfall2 = again.bottom - cropBottom2;
    if (shortfall2 > 0.5) {
        const h2 = parseFloat(cardEl.style.height) || cardRect2.height;
        const next2 = h2 + Math.ceil(shortfall2) + 4;
        cardEl.style.height = `${next2}px`;
        cardEl.setAttribute('data-sceneHeight', String(next2));
        scrollSkillFullyIntoSkillsSection(skillEl, skillsEl, cardEl);
    }
    return isSkillTitleVisibleInBizCardCrop(skillEl, cardEl);
}

/** Scroll #scene-content just enough so el is inside the viewport (nearest), using all line boxes. */
function scrollSceneContentSoElementVisible(el) {
    const sceneContent = document.getElementById('scene-content');
    if (!sceneContent || !el?.isConnected) return;

    const { top, bottom } = getElementVerticalExtent(el);
    const contentRect = sceneContent.getBoundingClientRect();
    const margin = SCENE_SKILL_SCROLL_MARGIN_PX;
    let delta = 0;
    if (top < contentRect.top + margin) {
        delta = top - contentRect.top - margin;
    } else if (bottom > contentRect.bottom - margin) {
        delta = bottom - contentRect.bottom + margin;
    }
    if (delta === 0) return;
    sceneContent.scrollBy({ top: delta, behavior: 'smooth' });
}

function scrollResumeSkillTitleIntoView(jobNumber, skillSlug) {
    const escJob = CSS.escape(String(jobNumber));
    const escSkill = CSS.escape(String(skillSlug));
    const rDiv = document.querySelector(`.biz-resume-div[data-job-number="${escJob}"]`);
    const skillEl = rDiv?.querySelector(`.biz-card-skill-title[data-skill-name="${escSkill}"]`);
    if (!skillEl) return;
    const scrollport = skillEl.closest('#resume-content-listing');
    scrollResumeListingElementIntoView(skillEl, scrollport, { behavior: 'smooth' });
}

/**
 * After a skill-card back-arrow selects a biz card: if that card’s T&S section is shown,
 * scroll the matching skill fully into the T&S crop window (via `.resume-skills` scrollTop),
 * then bring it into the scene/resume viewports. No-op when T&S is hidden.
 *
 * @param {number|string} jobNumber
 * @param {string} skillSlug
 */
export function scrollFocusedBizCardSkillIntoViewIfCropVisible(jobNumber, skillSlug) {
    if (jobNumber == null || jobNumber === '' || !skillSlug) return;

    const escSkill = CSS.escape(String(skillSlug));
    let attempts = 0;
    const maxAttempts = 25;

    const tryScroll = () => {
        const card = getVisibleBizCardForJob(jobNumber);
        if (!card) {
            if (++attempts < maxAttempts) requestAnimationFrame(tryScroll);
            return;
        }

        const skillsEl = card.querySelector('.resume-skills');
        if (!skillsEl || skillsEl.style.display === 'none') {
            return;
        }

        const skillEl = card.querySelector(`.biz-card-skill-title[data-skill-name="${escSkill}"]`);
        if (!skillEl) {
            if (++attempts < maxAttempts) requestAnimationFrame(tryScroll);
            return;
        }

        // Prefer waiting until the focus pill is applied (it grows the hit box).
        const focused = skillEl.classList.contains(FOCUSED_SKILL_LINK_CLASS);
        if (!focused && attempts < 10) {
            attempts += 1;
            requestAnimationFrame(tryScroll);
            return;
        }

        // Bring skill into the card’s T&S clip first — scene scroll cannot unclip overflow:hidden.
        scrollSkillFullyIntoSkillsSection(skillEl, skillsEl, card);

        // Cramped cards (e.g. Spanish-only jobs): scroll range may be only a few px.
        // Grow the selected card enough so the focused skill fits in the crop.
        if (!isSkillTitleVisibleInBizCardCrop(skillEl, card)) {
            growCardToFitFocusedSkill(skillEl, skillsEl, card);
        }

        // Layout may need a frame after scrollTop / height change before rects settle.
        if (!isSkillTitleVisibleInBizCardCrop(skillEl, card) && attempts < 8) {
            attempts += 1;
            requestAnimationFrame(tryScroll);
            return;
        }

        if (!isSkillTitleVisibleInBizCardCrop(skillEl, card)) {
            // Skill taller than the clip window — still nudge scene/resume toward it.
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    scrollSceneContentSoElementVisible(skillEl);
                    scrollResumeSkillTitleIntoView(jobNumber, skillSlug);
                });
            });
            return;
        }

        // Run after selectCard's header scroll is issued so this adjustment wins.
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                scrollSkillFullyIntoSkillsSection(skillEl, skillsEl, card);
                if (!isSkillTitleVisibleInBizCardCrop(skillEl, card)) {
                    growCardToFitFocusedSkill(skillEl, skillsEl, card);
                }
                if (!isSkillTitleVisibleInBizCardCrop(skillEl, card)) return;
                scrollSceneContentSoElementVisible(skillEl);
                scrollResumeSkillTitleIntoView(jobNumber, skillSlug);
            });
        });
    };

    requestAnimationFrame(tryScroll);
}

/** Remove “source job” highlight from all biz-back-link controls (scene skill-card + resume skill-row). */
export function clearSourceBizBackLinkClass() {
    document.querySelectorAll(`.biz-back-link.${SOURCE_BIZ_BACKLINK_CLASS}`).forEach((el) => {
        el.classList.remove(SOURCE_BIZ_BACKLINK_CLASS);
    });
}

/**
 * After opening a skill card from a biz/rDiv skill phrase, invert the matching biz-back-link
 * (same data-biz-card-id) on skill-card-div, its clone, and skill-resume-div rows.
 *
 * Resume copies are appended in Vue nextTick after selection, so we must keep retrying until
 * rows exist — do not stop early when only the scene card was marked.
 */
export function markSourceBizBackLinkForSkill(skillCardId, bizCardId) {
    if (!skillCardId || !bizCardId) return;
    clearSourceBizBackLinkClass();
    const escBiz = CSS.escape(String(bizCardId));
    const escSkillCard = CSS.escape(String(skillCardId));
    const rowSelector = `.skill-resume-div[data-skill-card-id="${escSkillCard}"], .appended-skill-resume-div[data-skill-card-id="${escSkillCard}"]`;
    const markedSel = `.biz-back-link.${SOURCE_BIZ_BACKLINK_CLASS}[data-biz-card-id="${escBiz}"]`;

    let n = 0;
    const MAX = 40;
    const tick = () => {
        n += 1;
        for (const id of [skillCardId, `${skillCardId}-clone`]) {
            const cardEl = document.getElementById(id);
            if (!cardEl || !cardEl.classList.contains('skill-card-div')) continue;
            const link = cardEl.querySelector(`.biz-back-link[data-biz-card-id="${escBiz}"]`);
            if (link) link.classList.add(SOURCE_BIZ_BACKLINK_CLASS);
        }
        document.querySelectorAll(rowSelector).forEach((row) => {
            const link = row.querySelector(`.biz-back-link[data-biz-card-id="${escBiz}"]`);
            if (link) link.classList.add(SOURCE_BIZ_BACKLINK_CLASS);
        });

        const rows = document.querySelectorAll(rowSelector);
        const resumeDone =
            rows.length > 0 &&
            [...rows].every((row) => row.querySelector(markedSel));

        let sceneDone = true;
        let anyScene = false;
        for (const id of [skillCardId, `${skillCardId}-clone`]) {
            const cardEl = document.getElementById(id);
            if (!cardEl || !cardEl.classList.contains('skill-card-div')) continue;
            anyScene = true;
            if (!cardEl.querySelector(markedSel)) sceneDone = false;
        }
        if (!anyScene) sceneDone = false;

        const done = sceneDone && resumeDone;
        if (done || n >= MAX) return;
        if (n <= 8) requestAnimationFrame(tick);
        else window.setTimeout(tick, 80);
    };
    tick();
}

function getOrCreateModal() {
    let modal = document.getElementById(MODAL_ID);
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'skill-info-modal-title');
    modal.innerHTML = `
        <div class="skill-info-modal-backdrop"></div>
        <div class="skill-info-modal-box">
            <button class="skill-info-modal-close" aria-label="Close">&times;</button>
            <h3 id="skill-info-modal-title" class="skill-info-modal-title"></h3>
            <div class="skill-info-modal-body"></div>
        </div>
    `;
    document.body.appendChild(modal);

    // Close via close button or by clicking outside the modal box (backdrop).
    modal.querySelector('.skill-info-modal-close').addEventListener('click', () => closeModal(modal));
    modal.querySelector('.skill-info-modal-backdrop').addEventListener('click', () => closeModal(modal));
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal(modal);
    });

    return modal;
}

/**
 * Copy the live palette colors from a card element onto the modal box as
 * inline styles, so the modal always matches the currently active palette.
 */
function applyPaletteFromCard(modal, cardEl) {
    const box = modal.querySelector('.skill-info-modal-box');
    if (!box) return;
    // Reset any previously applied inline palette styles so CSS fallbacks show
    // if no card is available.
    box.style.removeProperty('background-color');
    box.style.removeProperty('color');
    box.style.removeProperty('border-color');
    if (!cardEl) return;
    const cs = getComputedStyle(cardEl);
    const bg = cs.getPropertyValue('--data-background-color').trim();
    const fg = cs.getPropertyValue('--data-foreground-color').trim();
    const borderColor = cs.getPropertyValue('--data-normal-inner-border-color').trim();
    if (bg) box.style.backgroundColor = bg;
    if (fg) box.style.color = fg;
    if (borderColor) box.style.borderColor = borderColor;
}

function closeModal(modal) {
    modal.classList.remove('open');
}

function setModalContent(modal, title, bodyHtml) {
    modal.querySelector('.skill-info-modal-title').textContent = title;
    modal.querySelector('.skill-info-modal-body').innerHTML = bodyHtml;
    modal.classList.add('open');
}

function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = String(value ?? '');
    return div.innerHTML;
}

function parseJobNumberFromBizCardElement(bizCardEl) {
    if (!bizCardEl) return null;
    const raw = bizCardEl.getAttribute('data-job-number');
    const n = raw == null ? NaN : Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
}

function resolveSkillCardElement(cardEl, slug) {
    if (cardEl?.classList?.contains('skill-card-div')) return cardEl;
    const cardId = cardEl?.getAttribute?.('data-skill-card-id');
    if (cardId) {
        const byId = document.getElementById(cardId) || document.getElementById(`${cardId}-clone`);
        if (byId?.classList?.contains('skill-card-div')) return byId;
    }
    if (!slug) return null;
    const exact = document.querySelector(`.skill-card-div[data-skill-name="${CSS.escape(slug)}"]:not(.clone)`);
    if (exact) return exact;
    return document.querySelector(`.skill-card-div[data-skill-name="${CSS.escape(slug)}"]`);
}

function getAssociatedBizCards(skillCardEl) {
    if (!skillCardEl) return [];
    const rawIds = String(skillCardEl.getAttribute('data-referencing-biz-card-ids') || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    const seenJobs = new Set();
    const out = [];
    for (const bizCardId of rawIds) {
        const bizEl = document.getElementById(bizCardId);
        if (!bizEl) continue;
        const jobNumber = parseJobNumberFromBizCardElement(bizEl);
        if (jobNumber == null || seenJobs.has(jobNumber)) continue;
        seenJobs.add(jobNumber);
        const employer = bizEl.getAttribute('data-employer')
            || bizEl.getAttribute('data-biz-card-title')
            || `Job ${jobNumber}`;
        const jobs = getGlobalJobsDependency().getJobsData();
        const job = Array.isArray(jobs) ? jobs[jobNumber] : null;
        const months = job
            ? jobTenureMonthsInclusive(job.start, job.end)
            : null;
        out.push({ jobNumber, employer, months: months ?? 0 });
    }
    out.sort((a, b) => a.jobNumber - b.jobNumber);
    return out;
}

function associatedBizCardsHtml(skillCardEl) {
    const cards = getAssociatedBizCards(skillCardEl);
    if (!cards.length) return '';
    const skillSlug = String(skillCardEl?.getAttribute?.('data-skill-name') || '');
    const linksHtml = cards.map((biz) => {
        const employer = escapeHtml(biz.employer);
        const months = Number.isFinite(biz.months) ? biz.months : 0;
        const label = `${employer} (${months} months)`;
        return `<li><a href="#" class="${SKILL_BIZ_LINK_CLASS}" ${SKILL_BIZ_LINK_JOB_ATTR}="${biz.jobNumber}" ${SKILL_BIZ_LINK_SKILL_ATTR}="${escapeHtml(skillSlug)}">${label}</a></li>`;
    }).join('');
    return `
        <div class="skill-info-associated-biz">
            <div class="skill-info-associated-biz-title">Associated experience</div>
            <ul class="skill-info-associated-biz-list">${linksHtml}</ul>
        </div>
    `;
}

// Install delegate immediately when this module is imported.
installGlobalDelegate();

export async function openSkillInfoModal(slug, displayName, cardEl = null) {
    const modal = getOrCreateModal();
    applyPaletteFromCard(modal, cardEl);
    const skillCardEl = resolveSkillCardElement(cardEl, slug);
    const bizLinksHtml = associatedBizCardsHtml(skillCardEl);

    if (!hasServer()) {
        setModalContent(modal, displayName || slug,
            `<span class="skill-info-error">Skill definitions are not available in the static (GitHub Pages) version of this app.</span>${bizLinksHtml}`);
        return;
    }

    setModalContent(modal, displayName || slug, '<span class="skill-info-loading">Loading…</span>');

    try {
        const res = await fetch(`/api/skills/${encodeURIComponent(slug)}/info`);
        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
            setModalContent(modal, displayName || slug,
                `<span class="skill-info-error">Could not load definition: ${err.error || res.status}</span>${bizLinksHtml}`);
            return;
        }
        const { summary } = await res.json();
        const sourceUrl = buildSkillInfoSourceUrl(slug, displayName);
        setModalContent(modal, displayName || slug,
            `<p class="skill-info-summary">${summary.replace(/\n/g, '<br>')} <span>(source: <a class="skill-info-source-link" href="${sourceUrl}" target="_blank" rel="noopener noreferrer">${sourceUrl}</a>)</span></p>${bizLinksHtml}`);
    } catch (e) {
        setModalContent(modal, displayName || slug,
            `<span class="skill-info-error">Network error: ${e.message}</span>${bizLinksHtml}`);
    }
}
