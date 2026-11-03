import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    createJobsDependencyStub,
    fixtureJobs,
    listedJobNumbers,
    mockBizCardDivs,
    mountResumeListDom,
} from './testFixtures.mjs';

const jobsDep = createJobsDependencyStub();
const registerController = vi.fn();
jobsDep.registerController = registerController;
const reportError = vi.fn();

vi.mock('../composables/useJobsDependency.mjs', () => ({
    getGlobalJobsDependency: () => jobsDep,
    useJobsDependency: () => jobsDep,
}));
vi.mock('../composables/useColorPalette.mjs', () => ({
    applyPaletteToElement: vi.fn(async () => {}),
    applyPaletteToElementSync: vi.fn(() => {}),
}));
vi.mock('../core/stateManager.mjs', () => ({ AppState: { resume: {} }, saveState: vi.fn(async () => {}) }));
vi.mock('../utils/selectionPersistence.mjs', () => ({
    persistSelectedCard: vi.fn(async () => {}),
    readPersistedSelectedCard: vi.fn(() => null),
}));
vi.mock('../utils/errorReporting.mjs', () => ({ reportError }));

const init = await import('./resumeSystemInitializer.mjs');
const { resumeListController: rlc } = await import('./ResumeListController.mjs');
const { resumeItemsController: ric } = await import('./ResumeItemsController.mjs');
const { selectionManager } = await import('../core/selectionManager.mjs');

beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    document.body.innerHTML = '';
    window.resumeFlyer = undefined;
    jobsDep.setJobs(fixtureJobs());
    registerController.mockClear();
    reportError.mockClear();
    ric.dismissedJobNumbers.clear();
    rlc.removedJobNumbers.clear();
    selectionManager.selectedCard = null;
    selectionManager.selectedJobNumber = null;
});

afterEach(() => {
    vi.restoreAllMocks();
});

function installApp() {
    window.resumeFlyer = { resumeListController: rlc, resumeItemsController: ric, selectionManager, allDivs: { bizCardDivs: [], skillCardDivs: [], bizResumeDivs: [], skillResumeDivs: [] } };
    const dom = mountResumeListDom();
    rlc.resumeContentDiv = dom.holder;
    rlc.resumeContentWrapper = dom.scrollport;
    rlc.resumecontentdivElement = dom.holder;
    rlc.resumecontentdivwrapperElement = dom.scrollport;
    return dom;
}

describe('buildResumeListFromCards', () => {
    it('fails fast when the app object or controllers are missing', async () => {
        await expect(init.buildResumeListFromCards(mockBizCardDivs(1))).rejects.toThrow(/window\.resumeFlyer not set/);
        window.resumeFlyer = { resumeListController: rlc };
        await expect(init.buildResumeListFromCards(mockBizCardDivs(1))).rejects.toThrow(/not on window\.resumeFlyer/);
    });

    it('fails fast when the resume list element is not in the DOM', async () => {
        document.body.innerHTML = '';
        window.resumeFlyer = { resumeListController: rlc, resumeItemsController: ric };
        rlc.resumeContentDiv = null;
        await expect(init.buildResumeListFromCards(mockBizCardDivs(1))).rejects.toThrow(/resume list element not available/);
    });

    it('builds the list from cards, syncs allDivs, and applies the sort', async () => {
        const { holder } = installApp();
        const ok = await init.buildResumeListFromCards(mockBizCardDivs(3));
        expect(ok).toBe(true);
        expect(listedJobNumbers(holder)).toEqual([1, 0, 2]);
        expect(rlc.bizResumeDivs).toHaveLength(3);
        expect(ric.bizResumeDivs).toBe(rlc.bizResumeDivs);
        expect(window.resumeFlyer.allDivs.bizResumeDivs).toBe(rlc.bizResumeDivs);
        expect(window.resumeFlyer.allDivs.skillResumeDivs).toEqual([]);
        expect(rlc.removedJobNumbers.size).toBe(0);
    });

    it('clears everything and returns false when given no cards', async () => {
        const { holder } = installApp();
        await init.buildResumeListFromCards(mockBizCardDivs(3));
        rlc.removedJobNumbers.add(1);
        const ok = await init.buildResumeListFromCards([]);
        expect(ok).toBe(false);
        expect(holder.children).toHaveLength(0);
        expect(rlc.bizResumeDivs).toEqual([]);
        expect(ric.bizResumeDivs).toEqual([]);
        expect(rlc.removedJobNumbers.size).toBe(0);
        expect(window.resumeFlyer.allDivs.bizResumeDivs).toEqual([]);
    });

    it('reports and rethrows when creating the divs fails, leaving the old list intact', async () => {
        const { holder } = installApp();
        await init.buildResumeListFromCards(mockBizCardDivs(3));
        const before = listedJobNumbers(holder);
        vi.spyOn(ric, 'createAllBizResumeDivs').mockRejectedValueOnce(new Error('create failed'));
        await expect(init.buildResumeListFromCards(mockBizCardDivs(3))).rejects.toThrow('create failed');
        expect(reportError).toHaveBeenCalledWith(
            expect.any(Error),
            expect.stringContaining('[ResumeSystemInitializer] Failed creating resume listing divs'),
            expect.stringContaining('Leaving the previous resume listing in place'),
        );
        expect(listedJobNumbers(holder)).toEqual(before);
    });
});

describe('initializeResumeSystem', () => {
    it('wires controllers onto window.resumeFlyer, loads jobs, builds the list, and shows the indicator', async () => {
        vi.useFakeTimers();
        try {
            mountResumeListDom();
            const promise = init.initializeResumeSystem('abc');
            await vi.runAllTimersAsync();
            await expect(promise).resolves.toBe(true);

            const app = window.resumeFlyer;
            expect(app.resumeListController).toBe(rlc);
            expect(app.resumeItemsController).toBe(ric);
            expect(app.selectionManager).toBe(selectionManager);
            expect(app.allDivs.bizResumeDivs).toHaveLength(3);
            expect(registerController).toHaveBeenCalledWith('ResumeListController', expect.any(Function));
            expect(typeof window.testResumeClick).toBe('function');
            expect(init.isResumeSystemInitialized()).toBe(true);
            // The status indicator is added and removed after its timeout.
            expect(document.getElementById('resume-system-indicator')).toBeNull();
        } finally {
            vi.useRealTimers();
        }
    });

    it('waits for the DOM and throws once the retries run out', async () => {
        vi.useFakeTimers();
        try {
            document.body.innerHTML = '';
            const promise = init.initializeResumeSystem();
            // Swallow here so the rejection is observed by the expect below rather than as unhandled.
            promise.catch(() => {});
            await vi.runAllTimersAsync();
            await expect(promise).rejects.toThrow(/DOM elements not available after retries/);
            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining('Failed to initialize resume system'),
                expect.any(Error),
            );
        } finally {
            vi.useRealTimers();
        }
    });

    it('registered controller callback initializes the list controller', async () => {
        vi.useFakeTimers();
        try {
            mountResumeListDom();
            const promise = init.initializeResumeSystem();
            await vi.runAllTimersAsync();
            await promise;
            const cb = registerController.mock.calls.find((c) => c[0] === 'ResumeListController')[1];
            const spy = vi.spyOn(rlc, 'initialize');
            await cb(fixtureJobs());
            expect(spy).toHaveBeenCalledWith(expect.any(Array));
        } finally {
            vi.useRealTimers();
        }
    });
});

describe('console helpers', () => {
    it('report status without throwing', async () => {
        installApp();
        await init.buildResumeListFromCards(mockBizCardDivs(2));
        expect(() => init.testResumeSystem()).not.toThrow();
        expect(() => init.checkResumeDivs()).not.toThrow();
        expect(() => init.testScrolling()).not.toThrow();
        expect(window.testResumeSystem).toBe(init.testResumeSystem);
        window.resumeFlyer = undefined;
        expect(init.isResumeSystemInitialized()).toBe(false);
        expect(() => init.testResumeSystem()).not.toThrow();
    });
});
