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

const MODAL_ID = 'skill-info-modal';

// Single global delegated listener — survives any innerHTML replacement on cards.
let _delegateInstalled = false;
function installGlobalDelegate() {
    if (_delegateInstalled) return;
    _delegateInstalled = true;
    document.addEventListener('click', (e) => {
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

// Install delegate immediately when this module is imported.
installGlobalDelegate();

export async function openSkillInfoModal(slug, displayName, cardEl = null) {
    const modal = getOrCreateModal();
    applyPaletteFromCard(modal, cardEl);

    if (!hasServer()) {
        setModalContent(modal, displayName || slug,
            `<span class="skill-info-error">Skill definitions are not available in the static (GitHub Pages) version of this app.</span>`);
        return;
    }

    setModalContent(modal, displayName || slug, '<span class="skill-info-loading">Loading…</span>');

    try {
        const res = await fetch(`/api/skills/${encodeURIComponent(slug)}/info`);
        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
            setModalContent(modal, displayName || slug,
                `<span class="skill-info-error">Could not load definition: ${err.error || res.status}</span>`);
            return;
        }
        const { summary } = await res.json();
        setModalContent(modal, displayName || slug,
            `<p class="skill-info-summary">${summary.replace(/\n/g, '<br>')}</p>`);
    } catch (e) {
        setModalContent(modal, displayName || slug,
            `<span class="skill-info-error">Network error: ${e.message}</span>`);
    }
}
