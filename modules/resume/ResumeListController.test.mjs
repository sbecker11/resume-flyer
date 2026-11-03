import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    appendedSkillDiv,
    createJobsDependencyStub,
    fixtureJobs,
    fixtureOutlineJobs,
    listedJobNumbers,
    mockBizCardDivs,
    mountResumeListDom,
} from './testFixtures.mjs';

const jobsDep = createJobsDependencyStub();
const saveState = vi.fn(async () => {});
const AppState = { resume: {} };

vi.mock('../composables/useJobsDependency.mjs', () => ({
    getGlobalJobsDependency: () => jobsDep,
    useJobsDependency: () => jobsDep,
}));
vi.mock('../composables/useColorPalette.mjs', () => ({
    applyPaletteToElement: vi.fn(async () => {}),
    applyPaletteToElementSync: vi.fn(() => {}),
}));
vi.mock('../core/stateManager.mjs', () => ({ AppState, saveState }));
vi.mock('../utils/selectionPersistence.mjs', () => ({
    persistSelectedCard: vi.fn(async () => {}),
    readPersistedSelectedCard: vi.fn(() => null),
}));

const { resumeListController: rlc } = await import('./ResumeListController.mjs');
const ResumeListController = rlc.constructor;
const { resumeItemsController: ric } = await import('./ResumeItemsController.mjs');
const { selectionManager } = await import('../core/selectionManager.mjs');

let holder;
let scrollport;

async function buildList(jobs = fixtureJobs()) {
    jobsDep.setJobs(jobs);
    ({ scrollport, holder } = mountResumeListDom());
    window.resumeFlyer = { resumeListController: rlc, resumeItemsController: ric, selectionManager };
    ric.dismissedJobNumbers.clear();
    rlc.removedJobNumbers.clear();
    rlc.resumeListSelectionOrder = [];
    rlc.currentSortRule = { field: 'startDate', direction: 'desc' };
    rlc.resumeContentDiv = holder;
    rlc.resumeContentWrapper = scrollport;
    rlc.resumecontentdivElement = holder;
    rlc.resumecontentdivwrapperElement = scrollport;
    rlc.initialize(jobs);
    const divs = await ric.createAllBizResumeDivs(mockBizCardDivs(jobs.length));
    rlc.reinitialize(divs);
    return divs;
}

beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    selectionManager.selectedCard = null;
    selectionManager.selectedJobNumber = null;
    saveState.mockClear();
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllTimers();
});

describe('ResumeListController', () => {
    it('is a singleton exposed on window.resumeFlyer', () => {
        expect(ResumeListController.getInstance()).toBe(rlc);
        expect(new ResumeListController()).toBe(rlc);
        expect(rlc.getComponentName()).toBe('ResumeListController');
    });

    describe('initial order', () => {
        it('lists jobs by start date descending by default', async () => {
            await buildList();
            // Beta (2022) → Acme (2020) → Gamma (2018)
            expect(rlc.getSortedIndices()).toEqual([1, 0, 2]);
            expect(listedJobNumbers(holder)).toEqual([1, 0, 2]);
            expect(rlc.getCurrentSortRule()).toEqual({ field: 'startDate', direction: 'desc' });
        });

        it('uses outline order when jobs carry an outline index', async () => {
            await buildList(fixtureOutlineJobs());
            // 1.1 Gamma → 1.2 Acme → 2.1 Beta
            expect(rlc.getSortedIndices()).toEqual([2, 0, 1]);
            expect(listedJobNumbers(holder)).toEqual([2, 0, 1]);
            expect(rlc.getCurrentSortRule()).toEqual({ field: 'outline', direction: 'asc' });
            // Initializing sort does not persist to app state.
            expect(saveState).not.toHaveBeenCalled();
        });

        it('gives every rDiv the resume-N id, the job number, and a close button', async () => {
            const divs = await buildList();
            divs.forEach((div, i) => {
                expect(div.id).toBe(`resume-${i}`);
                expect(div.getAttribute('data-job-number')).toBe(String(i));
                expect(div.querySelector('.r-div-close')).toBeTruthy();
            });
            expect(rlc.getBizResumeDivByJobNumber(1)).toBe(divs[1]);
            expect(rlc.getBizResumeDivByJobNumber(99)).toBeNull();
        });
    });

    describe('removing and restoring rDivs', () => {
        it('removeJobFromListing records the job and drops it from the DOM', async () => {
            await buildList();
            const changed = vi.fn();
            window.addEventListener('resume-listing-changed', changed);
            try {
                rlc.removeJobFromListing(0);
                expect(rlc.removedJobNumbers.has(0)).toBe(true);
                expect(listedJobNumbers(holder)).toEqual([1, 2]);
                expect(changed).toHaveBeenCalled();
                expect(changed.mock.calls.at(-1)[0].detail).toEqual({ activeCount: 2, canRestoreAll: true });
            } finally {
                window.removeEventListener('resume-listing-changed', changed);
            }
        });

        it('the × on an original rDiv removes it through ResumeItemsController', async () => {
            const divs = await buildList();
            divs[2].querySelector('.r-div-close').click();
            expect(ric.dismissedJobNumbers.has(2)).toBe(true);
            expect(rlc.removedJobNumbers.has(2)).toBe(true);
            expect(listedJobNumbers(holder)).toEqual([1, 0]);
        });

        it('removing the selected job clears the selection first', async () => {
            const divs = await buildList();
            selectionManager.selectCard({ type: 'biz', jobNumber: 1 }, 'test');
            expect(selectionManager.getSelectedJobNumber()).toBe(1);
            divs[1].querySelector('.r-div-close').click();
            expect(selectionManager.getSelectedCard()).toBeNull();
            expect(listedJobNumbers(holder)).toEqual([0, 2]);
        });

        it('ensureJobInListing clears the removed flag; the selection-order re-add then shows the job again', async () => {
            await buildList();
            rlc.removeJobFromListing(0);
            rlc.removeJobFromListing(2);
            expect(listedJobNumbers(holder)).toEqual([1]);

            // Removal also drops the job from the selection order, so clearing the flag alone
            // does not re-render it; the job-selected path (addToResumeListOrder) does.
            rlc.ensureJobInListing(0);
            expect(rlc.removedJobNumbers.has(0)).toBe(false);
            expect(listedJobNumbers(holder)).toEqual([1]);
            rlc.addToResumeListOrder({ type: 'biz', jobNumber: 0 });
            expect(listedJobNumbers(holder)).toEqual([1, 0]);

            // scrollToElementId("resume-N") routes through ensureJobInListing for rDiv ids only.
            rlc.scrollToElementId('resume-2');
            expect(rlc.removedJobNumbers.has(2)).toBe(false);
            rlc.removeJobFromListing(1);
            rlc.scrollToElementId('something-else');
            expect(rlc.removedJobNumbers.has(1)).toBe(true);
        });

        it('scrollToElementId scrolls a listed rDiv into view at block start', async () => {
            const divs = await buildList();
            const scrolled = vi.fn();
            divs[1].scrollIntoView = scrolled;
            rlc.scrollToElementId('resume-1');
            expect(scrolled).toHaveBeenCalledWith(expect.objectContaining({ block: 'start' }));
            expect(() => rlc.scrollToElementId('')).not.toThrow();
        });

        it('clearAll empties the list and restoreAll brings the sort order back', async () => {
            await buildList();
            const events = [];
            const listener = (e) => events.push(e.type);
            window.addEventListener('resume-listing-cleared', listener);
            window.addEventListener('resume-listing-restored', listener);
            try {
                rlc.clearAllResumeDivsFromListing();
                expect(listedJobNumbers(holder)).toEqual([]);
                expect(rlc.canRestoreAllResumeDivs()).toBe(true);
                expect(ric.dismissedJobNumbers.size).toBe(3);

                rlc.restoreAllResumeDivsToListing();
                expect(listedJobNumbers(holder)).toEqual([1, 0, 2]);
                expect(rlc.removedJobNumbers.size).toBe(0);
                expect(ric.dismissedJobNumbers.size).toBe(0);
                expect(rlc.canRestoreAllResumeDivs()).toBe(false);
                // Restore selects the first item.
                expect(selectionManager.getSelectedJobNumber()).toBe(1);
                expect(events).toEqual(['resume-listing-cleared', 'resume-listing-restored']);
            } finally {
                window.removeEventListener('resume-listing-cleared', listener);
                window.removeEventListener('resume-listing-restored', listener);
            }
        });
    });

    describe('skill rows and selection order', () => {
        it('appends skill copies after the jobs and interleaves later selections', async () => {
            await buildList();
            holder.appendChild(appendedSkillDiv('skill-card-div-7'));
            rlc.notifySkillAddedToResumeListing('skill-card-div-7');
            expect(rlc.getActiveOrderedEntries()).toEqual([
                { type: 'biz', jobNumber: 1 },
                { type: 'biz', jobNumber: 0 },
                { type: 'biz', jobNumber: 2 },
                { type: 'skill', skillCardId: 'skill-card-div-7' },
            ]);
            expect(holder.lastElementChild.getAttribute('data-skill-card-id')).toBe('skill-card-div-7');

            // A removed job re-selected later lands after the skill row (selection order).
            rlc.removeJobFromListing(0);
            rlc.addToResumeListOrder({ type: 'biz', jobNumber: 0 });
            expect(rlc.getActiveOrderedEntries().map((e) => e.type === 'biz' ? e.jobNumber : e.skillCardId))
                .toEqual([1, 2, 'skill-card-div-7', 0]);

            // Duplicates are ignored.
            rlc.notifySkillAddedToResumeListing('skill-card-div-7');
            expect(rlc.getActiveOrderedEntries()).toHaveLength(4);
        });

        it('removeSkillFromResumeListOrder drops the row and clears a matching selection', async () => {
            await buildList();
            holder.appendChild(appendedSkillDiv('skill-card-div-7'));
            rlc.notifySkillAddedToResumeListing('skill-card-div-7');
            selectionManager.selectCard({ type: 'skill', skillCardId: 'skill-card-div-7' }, 'test');
            expect(rlc.getSelectedListPosition()).toBe(3);

            rlc.removeSkillFromResumeListOrder('skill-card-div-7');
            expect(selectionManager.getSelectedCard()).toBeNull();
            expect(rlc.getActiveOrderedEntries()).toHaveLength(3);
            expect(rlc.getSelectedListPosition()).toBe(-1);
        });

        it('a job-selected event from the selection manager adds the job to the list order', async () => {
            await buildList();
            rlc.removeJobFromListing(2);
            expect(listedJobNumbers(holder)).toEqual([1, 0]);
            selectionManager.selectCard({ type: 'biz', jobNumber: 2 }, 'scene');
            expect(rlc.removedJobNumbers.has(2)).toBe(false);
            expect(listedJobNumbers(holder)).toEqual([1, 0, 2]);
        });
    });

    describe('list navigation', () => {
        it('first/next/previous/last select in list order and wrap', async () => {
            await buildList();
            rlc.goToFirstResumeItem();
            expect(selectionManager.getSelectedJobNumber()).toBe(1);
            rlc.goToNextResumeItem();
            expect(selectionManager.getSelectedJobNumber()).toBe(0);
            rlc.goToLastResumeItem();
            expect(selectionManager.getSelectedJobNumber()).toBe(2);
            rlc.goToNextResumeItem();
            expect(selectionManager.getSelectedJobNumber()).toBe(1);
            rlc.goToPreviousResumeItem();
            expect(selectionManager.getSelectedJobNumber()).toBe(2);
        });

        it('next with nothing selected picks the second item; previous picks the last', async () => {
            await buildList();
            rlc.goToNextResumeItem();
            expect(selectionManager.getSelectedJobNumber()).toBe(0);
            selectionManager.clearSelection('test');
            rlc.goToPreviousResumeItem();
            expect(selectionManager.getSelectedJobNumber()).toBe(2);
        });

        it('does nothing on an empty list', async () => {
            await buildList();
            rlc.clearAllResumeDivsFromListing();
            rlc.goToFirstResumeItem();
            rlc.goToNextResumeItem();
            expect(selectionManager.getSelectedCard()).toBeNull();
        });
    });

    describe('sorting', () => {
        it('applySortRule reorders the list, persists the rule, and selects the first item', async () => {
            await buildList();
            const ruleEvents = [];
            const onRule = (e) => ruleEvents.push(e.detail.sortRule);
            window.addEventListener('sort-rule-changed', onRule);
            try {
                rlc.applySortRule({ field: 'employer', direction: 'asc' });
                expect(rlc.getSortedIndices()).toEqual([0, 1, 2]);
                expect(listedJobNumbers(holder)).toEqual([0, 1, 2]);
                expect(AppState.resume.sortRule).toEqual({ field: 'employer', direction: 'asc' });
                expect(saveState).toHaveBeenCalledWith(AppState);
                expect(ruleEvents).toEqual([{ field: 'employer', direction: 'asc' }]);
                expect(selectionManager.getSelectedJobNumber()).toBe(0);

                rlc.sortByEndDateAsc();
                // Gamma 2019 → Acme 2021 → Beta Present
                expect(rlc.getSortedIndices()).toEqual([2, 0, 1]);
                rlc.sortByRoleDesc();
                // Staff → Lead → Engineer
                expect(rlc.getSortedIndices()).toEqual([2, 1, 0]);
                rlc.sortByOriginalOrder();
                expect(rlc.getSortedIndices()).toEqual([0, 1, 2]);
            } finally {
                window.removeEventListener('sort-rule-changed', onRule);
            }
        });

        it('falls back to the default rule for an invalid one', async () => {
            await buildList();
            rlc.applySortRule(null);
            expect(rlc.getCurrentSortRule()).toEqual({ field: 'startDate', direction: 'desc' });
        });

        it('maps between sorted and original indices', async () => {
            await buildList();
            expect(rlc.getOriginalIndexFromSorted(0)).toBe(1);
            expect(rlc.getOriginalIndexFromSorted('2')).toBe(2);
            expect(rlc.getOriginalIndexFromSorted(7)).toBe(-1);
            expect(rlc.getOriginalIndexFromSorted(null)).toBe(-1);
            expect(rlc.getOriginalIndexFromSorted('x')).toBe(-1);
            expect(rlc.getSortedIndexFromOriginal(2)).toBe(2);
            expect(rlc.getSortedIndexFromOriginal(1)).toBe(0);
            expect(rlc.getSortedIndexFromOriginal(9)).toBe(-1);
        });

        it('compares dates with Present as now and missing dates first', () => {
            expect(rlc.compareDates('2020-01-01', '2021-01-01')).toBeLessThan(0);
            expect(rlc.compareDates('Present', '2021-01-01')).toBeGreaterThan(0);
            expect(rlc.compareDates(null, '2021-01-01')).toBe(-1);
            expect(rlc.compareDates('2021-01-01', null)).toBe(1);
            expect(rlc.compareDates(null, undefined)).toBe(0);
            expect(rlc.parseDate('not a date')).toBeNull();
            expect(rlc.compareStrings('b', 'A')).toBeGreaterThan(0);
        });
    });

    describe('guards', () => {
        it('does not sort before jobs are initialized', () => {
            const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            vi.spyOn(console, 'trace').mockImplementation(() => {});
            const saved = rlc.originalJobsData;
            rlc.originalJobsData = null;
            rlc.sortedIndices = [9];
            rlc.updateSortedIndices();
            expect(rlc.sortedIndices).toEqual([9]);
            expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('before originalJobsData is set'));
            rlc.originalJobsData = saved;
        });

        it('ignores removals and restores before the list is built', () => {
            const savedDivs = rlc.bizResumeDivs;
            const savedContainer = rlc.scrollContainer;
            rlc.bizResumeDivs = null;
            rlc.scrollContainer = null;
            expect(() => {
                rlc.removeJobFromListing(0);
                rlc.ensureJobInListing(0);
                rlc.clearAllResumeDivsFromListing();
                rlc.restoreAllResumeDivsToListing();
            }).not.toThrow();
            rlc.bizResumeDivs = savedDivs;
            rlc.scrollContainer = savedContainer;
        });
    });
});
