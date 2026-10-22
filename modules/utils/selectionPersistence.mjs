import { useAppState } from '../composables/useAppState.ts';
import { reportError } from './errorReporting.mjs';

/**
 * @typedef {{ type: 'biz', jobNumber: number } | { type: 'skill', skillCardId: string }} PersistedSelectedCard
 */

/**
 * @param {unknown} stored
 * @returns {number | null}
 */
export function persistedCardId(stored) {
    const id = stored && typeof stored === 'object' ? stored['card-id'] : null;
    if (typeof id !== 'number' || !Number.isInteger(id) || id < 0) return null;
    return id;
}

/**
 * @param {unknown} stored
 * @returns {PersistedSelectedCard | null}
 */
export function runtimeCardFromBizRef(stored) {
    const id = persistedCardId(stored);
    if (id == null) return null;
    return { type: 'biz', jobNumber: id };
}

/**
 * @param {unknown} stored
 * @returns {PersistedSelectedCard | null}
 */
export function runtimeCardFromSkillRef(stored) {
    const id = persistedCardId(stored);
    if (id == null) return null;
    return { type: 'skill', skillCardId: `skill-card-div-${id}` };
}

/**
 * Read the card to restore. A stored biz card wins when both are present so the
 * job selection stays active; selectedSkillCard remains in app state either way.
 * @returns {PersistedSelectedCard | null}
 */
export function getPersistedSelectedCard() {
    const { appState } = useAppState();
    const settings = appState.value?.['user-settings'];
    return runtimeCardFromBizRef(settings?.selectedBizCard)
        || runtimeCardFromSkillRef(settings?.selectedSkillCard)
        || null;
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
        if (card == null) {
            await updateAppState({
                'user-settings': { selectedBizCard: null, selectedSkillCard: null },
            }, true);
            return;
        }
        if (card.type === 'biz') {
            if (!Number.isInteger(card.jobNumber) || card.jobNumber < 0) {
                throw new Error(`Cannot persist biz card jobNumber ${card.jobNumber}`);
            }
            await updateAppState({
                'user-settings': { selectedBizCard: { 'card-id': card.jobNumber } },
            }, true);
            return;
        }
        if (card.type === 'skill') {
            const match = String(card.skillCardId || '').match(/^skill-card-div-(\d+)/);
            if (!match) {
                throw new Error(`Cannot persist skill card id ${card.skillCardId}`);
            }
            await updateAppState({
                'user-settings': { selectedSkillCard: { 'card-id': Number(match[1]) } },
            }, true);
            return;
        }
        throw new Error(`Cannot persist selected card type ${card.type}`);
    } catch (e) {
        reportError(e, '[selectionPersistence] Failed to persist selection');
        throw e;
    }
}
