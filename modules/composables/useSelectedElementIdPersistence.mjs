/**
 * Persists and restores the last selected DOM element ID in app state.
 * - On card-selected: persists selectedElementId and selectedDualElementId (scene ↔ resume pair).
 * - On selection-cleared: persists null for both.
 * - Restore: restores selection and ensures both the element and its dual in the other view get .selected.
 * - After restore, scrolls the selected element into view per its class.
 */
import { onMounted, onUnmounted } from 'vue';
import { selectionManager } from '../core/selectionManager.mjs';
import { useAppState } from './useAppState.ts';

const RESUME_ID_PREFIX = 'resume-';
const BIZ_CARD_CLONE_SUFFIX = '-clone';

/** From a selected card, return { primaryId, dualId } for persistence. Primary = resume id for biz, skillCardId for skill; dual = scene id for biz, same skillCardId for resume lookup. */
function idsFromCard(card) {
    if (!card || !card.type) return { primaryId: null, dualId: null };
    if (card.type === 'biz') {
        const n = card.jobNumber;
        return { primaryId: `${RESUME_ID_PREFIX}${n}`, dualId: `biz-card-div-${n}${BIZ_CARD_CLONE_SUFFIX}` };
    }
    const skillCardId = card.skillCardId || null;
    return { primaryId: skillCardId, dualId: skillCardId };
}

/** Scroll options per element class (matches existing handlers in the app). */
const SCROLL_OPTIONS_BY_CLASS = {
    'biz-card-div': { behavior: 'smooth', block: 'center', inline: 'nearest' },
    'skill-card-div': { behavior: 'smooth', block: 'center', inline: 'nearest' },
    'biz-resume-div': { behavior: 'smooth', block: 'start', inline: 'nearest' },
    'skill-resume-div': { behavior: 'smooth', block: 'end', inline: 'nearest' },
    'appended-skill-resume-div': { behavior: 'smooth', block: 'end', inline: 'nearest' }
};

function scrollElementIntoViewByClass(el) {
    if (!el || typeof el.scrollIntoView !== 'function') return;
    const classList = el.classList;
    let options = null;
    if (classList.contains('biz-card-div')) options = SCROLL_OPTIONS_BY_CLASS['biz-card-div'];
    else if (classList.contains('skill-card-div')) options = SCROLL_OPTIONS_BY_CLASS['skill-card-div'];
    else if (classList.contains('biz-resume-div')) options = SCROLL_OPTIONS_BY_CLASS['biz-resume-div'];
    else if (classList.contains('skill-resume-div')) options = SCROLL_OPTIONS_BY_CLASS['skill-resume-div'];
    else if (classList.contains('appended-skill-resume-div')) options = SCROLL_OPTIONS_BY_CLASS['appended-skill-resume-div'];
    if (options) el.scrollIntoView(options);
}

export function useSelectedElementIdPersistence() {
    const { appState, updateAppState } = useAppState();

    function onCardSelected(event) {
        const { card } = event?.detail ?? {};
        const { primaryId, dualId } = idsFromCard(card);
        const selectedJobNumber = card?.type === 'biz' ? card.jobNumber : null;
        const current = appState.value?.['user-settings'] ?? {};
        updateAppState({
            'user-settings': {
                ...current,
                selectedElementId: primaryId,
                selectedDualElementId: dualId,
                selectedJobNumber,
                ...(card?.type === 'biz' && card.jobNumber != null ? { lastVisitedJobNumber: card.jobNumber } : {})
            }
        }).catch((e) => {
            console.error('[useSelectedElementIdPersistence] Failed to persist selected element ids', e);
        });
    }

    function onSelectionCleared() {
        const current = appState.value?.['user-settings'] ?? {};
        updateAppState({
            'user-settings': {
                ...current,
                selectedElementId: null,
                selectedDualElementId: null,
                selectedJobNumber: null
            }
        }).catch((e) => {
            console.error('[useSelectedElementIdPersistence] Failed to persist selection cleared', e);
        });
    }

    /** Apply .selected to the dual element in the other view (by selectedDualElementId). */
    function applySelectedToDualElement(dualId) {
        if (!dualId || typeof document === 'undefined') return;
        // Scene element by id (biz-card-div-N-clone, or skill-card-div / skill-card-div-N-clone)
        let sceneEl = document.getElementById(dualId);
        if (!sceneEl && dualId && !dualId.endsWith(BIZ_CARD_CLONE_SUFFIX)) {
            sceneEl = document.getElementById(`${dualId}${BIZ_CARD_CLONE_SUFFIX}`);
        }
        if (sceneEl) sceneEl.classList.add('selected');
        // Resume skill element: has data-skill-card-id (no id); dualId for skill is the skillCardId
        const resumeSkillEl = document.querySelector(`.appended-skill-resume-div[data-skill-card-id="${dualId}"]`) ||
            document.querySelector(`.skill-resume-div[data-skill-card-id="${dualId}"]`);
        if (resumeSkillEl) resumeSkillEl.classList.add('selected');
    }

    /**
     * Scroll the selected element (and for skill, its resume list copy) into view per its class.
     * Runs after a short delay so selection and DOM are updated.
     */
    function scheduleScrollSelectedElementIntoView(id) {
        if (!id || typeof document === 'undefined') return;
        const scrollDelayMs = 150;
        setTimeout(() => {
            const el = document.getElementById(id);
            if (el) scrollElementIntoViewByClass(el);
            // For skill cards, also scroll the resume-list copy into view (has data-skill-card-id, no id)
            if (id && !id.startsWith(RESUME_ID_PREFIX)) {
                const resumeCopy = document.querySelector(`.appended-skill-resume-div[data-skill-card-id="${id}"]`);
                if (resumeCopy) scrollElementIntoViewByClass(resumeCopy);
            }
        }, scrollDelayMs);
    }

    /**
     * Restore selection from persisted selectedElementId / selectedDualElementId.
     * Ensures both the primary element and its dual in the other view get .selected and are scrolled into view.
     */
    function restoreSelectionFromState() {
        const id = appState.value?.['user-settings']?.selectedElementId ?? null;
        const dualId = appState.value?.['user-settings']?.selectedDualElementId ?? null;
        if (id === null) {
            selectionManager.clearSelection('useSelectedElementIdPersistence.restoreSelectionFromState');
            return;
        }
        if (id.startsWith(RESUME_ID_PREFIX)) {
            const jobNumber = parseInt(id.slice(RESUME_ID_PREFIX.length), 10);
            if (!Number.isNaN(jobNumber)) {
                selectionManager.selectJobNumber(jobNumber, 'useSelectedElementIdPersistence.restoreSelectionFromState');
                scheduleScrollSelectedElementIntoView(id);
                setTimeout(() => applySelectedToDualElement(dualId), 200);
                return;
            }
        }
        // Treat as skill card id
        selectionManager.selectSkillCard(id, 'useSelectedElementIdPersistence.restoreSelectionFromState');
        scheduleScrollSelectedElementIntoView(id);
        setTimeout(() => applySelectedToDualElement(dualId), 200);
    }

    onMounted(() => {
        selectionManager.eventTarget.addEventListener('card-selected', onCardSelected);
        selectionManager.eventTarget.addEventListener('selection-cleared', onSelectionCleared);
    });

    onUnmounted(() => {
        selectionManager.eventTarget.removeEventListener('card-selected', onCardSelected);
        selectionManager.eventTarget.removeEventListener('selection-cleared', onSelectionCleared);
    });

    return { restoreSelectionFromState };
}
