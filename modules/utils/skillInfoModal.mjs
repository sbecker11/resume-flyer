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

const MODAL_ID = 'skill-info-modal';
const SKILL_BIZ_LINK_CLASS = 'skill-info-biz-link';
const SKILL_BIZ_LINK_JOB_ATTR = 'data-job-number';
const SKILL_BIZ_LINK_SKILL_ATTR = 'data-skill-name';
const FOCUSED_SKILL_LINK_CLASS = 'skill-link-focused-from-modal';
const SOURCE_BIZ_BACKLINK_CLASS = 'biz-back-link-source';

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
            const firstMatch = container.querySelector(`.biz-card-skill-title[data-skill-name="${escSkill}"]`);
            if (firstMatch) {
                firstMatch.classList.add(FOCUSED_SKILL_LINK_CLASS);
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

    // Close only via the close button (backdrop click intentionally does nothing)
    modal.querySelector('.skill-info-modal-close').addEventListener('click', () => closeModal(modal));

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
        setModalContent(modal, displayName || slug,
            `<p class="skill-info-summary">${summary.replace(/\n/g, '<br>')}</p>${bizLinksHtml}`);
    } catch (e) {
        setModalContent(modal, displayName || slug,
            `<span class="skill-info-error">Network error: ${e.message}</span>${bizLinksHtml}`);
    }
}
