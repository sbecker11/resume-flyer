import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockUpdateAppState = vi.fn().mockResolvedValue(undefined);
let mockAppStateValue = null;

vi.mock('../composables/useAppState.ts', async () => {
    const vue = await import('vue');
    return {
        useAppState: () => ({
            appState: vue.ref(mockAppStateValue),
            updateAppState: mockUpdateAppState,
        }),
    };
});

import {
    getPersistedSelectedCard,
    validatePersistedSelectedCard,
    persistSelectedCard,
} from './selectionPersistence.mjs';

describe('selectionPersistence', () => {
    beforeEach(() => {
        mockUpdateAppState.mockClear();
        mockUpdateAppState.mockResolvedValue(undefined);
        mockAppStateValue = null;
        document.body.innerHTML = '';
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('getPersistedSelectedCard', () => {
        it('returns null when appState is null', () => {
            mockAppStateValue = null;
            expect(getPersistedSelectedCard()).toBe(null);
        });

        it('returns null when selection refs are missing', () => {
            mockAppStateValue = { 'user-settings': {} };
            expect(getPersistedSelectedCard()).toBe(null);
        });

        it('returns null when selectedBizCard has no card-id', () => {
            mockAppStateValue = { 'user-settings': { selectedBizCard: { jobNumber: 1 } } };
            expect(getPersistedSelectedCard()).toBe(null);
        });

        it('returns the biz card when both refs are stored', () => {
            mockAppStateValue = {
                'user-settings': {
                    selectedBizCard: { 'card-id': 20 },
                    selectedSkillCard: { 'card-id': 35 },
                },
            };
            expect(getPersistedSelectedCard()).toEqual({ type: 'biz', jobNumber: 20 });
        });

        it('returns the skill card when only a skill ref is stored', () => {
            mockAppStateValue = { 'user-settings': { selectedSkillCard: { 'card-id': 35 } } };
            expect(getPersistedSelectedCard()).toEqual({ type: 'skill', skillCardId: 'skill-card-div-35' });
        });
    });

    describe('validatePersistedSelectedCard', () => {
        it('returns null for null/undefined card', () => {
            expect(validatePersistedSelectedCard(null, [])).toBe(null);
            expect(validatePersistedSelectedCard(undefined, [])).toBe(null);
        });

        it('returns null for a card missing type', () => {
            expect(validatePersistedSelectedCard({ jobNumber: 0 }, [])).toBe(null);
        });

        describe('biz cards', () => {
            it('returns null when jobNumber is not an integer', () => {
                expect(validatePersistedSelectedCard({ type: 'biz', jobNumber: 'x' }, [1])).toBe(null);
                expect(validatePersistedSelectedCard({ type: 'biz', jobNumber: 1.5 }, [1, 2])).toBe(null);
                expect(validatePersistedSelectedCard({ type: 'biz', jobNumber: -1 }, [1])).toBe(null);
            });

            it('returns null when jobsData is not an array or jobNumber is out of range', () => {
                expect(validatePersistedSelectedCard({ type: 'biz', jobNumber: 0 }, null)).toBe(null);
                expect(validatePersistedSelectedCard({ type: 'biz', jobNumber: 5 }, [1, 2])).toBe(null);
            });

            it('returns null when neither rDiv nor cDiv exist in the DOM', () => {
                expect(validatePersistedSelectedCard({ type: 'biz', jobNumber: 0 }, [1])).toBe(null);
            });

            it('returns the card when the cDiv exists', () => {
                const cDiv = document.createElement('div');
                cDiv.id = 'biz-card-div-0';
                document.body.appendChild(cDiv);
                expect(validatePersistedSelectedCard({ type: 'biz', jobNumber: 0 }, [1])).toEqual({
                    type: 'biz',
                    jobNumber: 0,
                });
            });

            it('returns the card when the rDiv exists', () => {
                const rDiv = document.createElement('div');
                rDiv.setAttribute('data-job-number', '0');
                rDiv.classList.add('biz-resume-div');
                document.body.appendChild(rDiv);
                expect(validatePersistedSelectedCard({ type: 'biz', jobNumber: 0 }, [1])).toEqual({
                    type: 'biz',
                    jobNumber: 0,
                });
            });
        });

        describe('skill cards', () => {
            it('returns null when skillCardId is not a non-empty string', () => {
                expect(validatePersistedSelectedCard({ type: 'skill', skillCardId: '' }, [])).toBe(null);
                expect(validatePersistedSelectedCard({ type: 'skill', skillCardId: 5 }, [])).toBe(null);
            });

            it('returns null when the skill element is not in the DOM', () => {
                expect(validatePersistedSelectedCard({ type: 'skill', skillCardId: 'skill-python' }, [])).toBe(null);
            });

            it('returns the card when the skill element exists', () => {
                const skillDiv = document.createElement('div');
                skillDiv.id = 'skill-python';
                document.body.appendChild(skillDiv);
                expect(validatePersistedSelectedCard({ type: 'skill', skillCardId: 'skill-python' }, [])).toEqual({
                    type: 'skill',
                    skillCardId: 'skill-python',
                });
            });
        });

        it('returns null for an unrecognized card type', () => {
            expect(validatePersistedSelectedCard({ type: 'other' }, [])).toBe(null);
        });
    });

    describe('persistSelectedCard', () => {
        it('stores a skill card id without clearing the biz card', async () => {
            await persistSelectedCard({ type: 'skill', skillCardId: 'skill-card-div-35' });
            expect(mockUpdateAppState).toHaveBeenCalledWith({
                'user-settings': { selectedSkillCard: { 'card-id': 35 } },
            }, true);
        });

        it('stores a biz card id without clearing the skill card', async () => {
            await persistSelectedCard({ type: 'biz', jobNumber: 20 });
            expect(mockUpdateAppState).toHaveBeenCalledWith({
                'user-settings': { selectedBizCard: { 'card-id': 20 } },
            }, true);
        });

        it('clears both selection refs', async () => {
            await persistSelectedCard(null);
            expect(mockUpdateAppState).toHaveBeenCalledWith({
                'user-settings': { selectedBizCard: null, selectedSkillCard: null },
            }, true);
        });

        it('reports and rethrows when updateAppState fails', async () => {
            const error = new Error('save failed');
            mockUpdateAppState.mockRejectedValueOnce(error);
            await expect(persistSelectedCard({ type: 'biz', jobNumber: 0 })).rejects.toThrow('save failed');
            expect(console.error).toHaveBeenCalled();
        });
    });
});
