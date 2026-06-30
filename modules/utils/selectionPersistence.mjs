import { useAppState } from '../composables/useAppState.ts';
import { reportError } from './errorReporting.mjs';

/**
 * @typedef {{ type: 'biz', jobNumber: number } | { type: 'skill', skillCardId: string }} PersistedSelectedCard
 */

/**
 * Read persisted selection from user-settings (via useAppState singleton).
 * @returns {PersistedSelectedCard | null}
 */
export function getPersistedSelectedCard() {
    const { appState } = useAppState();
    const card = appState.value?.['user-settings']?.selectedCard;
    if (!card || typeof card !== 'object' || !card.type) return null;
    return card;
}

/**
 * Validate persisted selection against loaded resume content / DOM.
 * @param {PersistedSelectedCard | null | undefined} card
 * @param {unknown[]} jobsData
 * @returns {PersistedSelectedCard | null}
 */
export function validatePersistedSelectedCard(card, jobsData) {
    if (!card || typeof card !== 'object' || !card.type) return null;

    if (card.type === 'biz') {
        const jobNumber = card.jobNumber;
        if (typeof jobNumber !== 'number' || !Number.isInteger(jobNumber) || jobNumber < 0) return null;
        if (!Array.isArray(jobsData) || jobNumber >= jobsData.length) return null;
        const rDiv = document.querySelector(`[data-job-number="${jobNumber}"].biz-resume-div`);
        const cDiv = document.getElementById(`biz-card-div-${jobNumber}`);
        if (!rDiv && !cDiv) return null;
        return { type: 'biz', jobNumber };
    }

    if (card.type === 'skill') {
        const skillCardId = card.skillCardId;
        if (typeof skillCardId !== 'string' || !skillCardId) return null;
        if (!document.getElementById(skillCardId)) return null;
        return { type: 'skill', skillCardId };
    }

    return null;
}

/**
 * Persist current selection to user-settings (immediate save).
 * @param {PersistedSelectedCard | null} card
 */
export async function persistSelectedCard(card) {
    try {
        const { updateAppState } = useAppState();
        await updateAppState({ 'user-settings': { selectedCard: card } }, true);
    } catch (e) {
        reportError(e, '[selectionPersistence] Failed to persist selectedCard');
        throw e;
    }
}
