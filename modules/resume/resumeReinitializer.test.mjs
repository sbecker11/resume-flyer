import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createJobsDependencyStub, fixtureJobs } from './testFixtures.mjs';

const jobsDep = createJobsDependencyStub();
const loadJobs = vi.fn(async () => jobsDep.getJobsData());
jobsDep.loadJobs = loadJobs;

vi.mock('@/modules/composables/useJobsDependency.mjs', () => ({
    getGlobalJobsDependency: () => jobsDep,
    useJobsDependency: () => jobsDep,
}));

const mod = await import('./resumeReinitializer.mjs');

beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    loadJobs.mockClear();
    jobsDep.setJobs(fixtureJobs());
    // Clear registrations between tests.
    mod.registerTimelineReinit(null);
    mod.registerCardsReinit(null);
    mod.registerResumeListReinit(null);
    mod.registerGetBizCardDivs(null);
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('reinitializeResumeSystem', () => {
    it('loads jobs for the resume id, then reinits timeline, cards, and the list with scene cards', async () => {
        const order = [];
        const cards = [document.createElement('div')];
        mod.registerTimelineReinit((jobs) => order.push(['timeline', jobs.length]));
        mod.registerCardsReinit(async () => { order.push(['cards']); });
        mod.registerGetBizCardDivs(() => cards);
        mod.registerResumeListReinit(async (divs) => { order.push(['list', divs]); });

        await mod.reinitializeResumeSystem('some-resume');

        expect(loadJobs).toHaveBeenCalledWith({ force: true, forceResumeId: 'some-resume' });
        expect(order).toEqual([['timeline', 3], ['cards'], ['list', cards]]);
    });

    it('passes null for the default resume and warns about missing registrations', async () => {
        await mod.reinitializeResumeSystem(undefined);
        expect(loadJobs).toHaveBeenCalledWith({ force: true, forceResumeId: null });
        const warnings = console.warn.mock.calls.map((c) => c[0]);
        expect(warnings).toEqual(expect.arrayContaining([
            expect.stringContaining('Timeline reinit not registered'),
            expect.stringContaining('Cards reinit not registered'),
            expect.stringContaining('Resume list reinit not registered'),
        ]));
    });

    it('clears cards and the list when the load returns no jobs', async () => {
        jobsDep.setJobs([]);
        const timeline = vi.fn();
        const cards = vi.fn(async () => {});
        const list = vi.fn(async () => {});
        mod.registerTimelineReinit(timeline);
        mod.registerCardsReinit(cards);
        mod.registerResumeListReinit(list);

        await mod.reinitializeResumeSystem('empty');

        expect(timeline).not.toHaveBeenCalled();
        expect(cards).toHaveBeenCalledTimes(1);
        expect(list).toHaveBeenCalledWith([]);
    });

    it('falls back to an empty card list when the getter is not registered', async () => {
        const list = vi.fn(async () => {});
        mod.registerResumeListReinit(list);
        await mod.reinitializeResumeSystem('x');
        expect(list).toHaveBeenCalledWith([]);
    });
});

describe('rebuildResumeListFromSceneCards', () => {
    it('returns false before the resume list reinit is registered', async () => {
        await expect(mod.rebuildResumeListFromSceneCards()).resolves.toBe(false);
        expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('not registered yet'));
    });

    it('uses real scene cards when available', async () => {
        const cards = [document.createElement('div'), document.createElement('div')];
        const list = vi.fn(async () => {});
        mod.registerResumeListReinit(list);
        mod.registerGetBizCardDivs(() => cards);
        await expect(mod.rebuildResumeListFromSceneCards()).resolves.toBe(true);
        expect(list).toHaveBeenCalledWith(cards);
    });

    it('builds one placeholder per job when no scene cards exist yet', async () => {
        const list = vi.fn(async () => {});
        mod.registerResumeListReinit(list);
        mod.registerGetBizCardDivs(() => [null, undefined]);
        await mod.rebuildResumeListFromSceneCards();
        const divs = list.mock.calls[0][0];
        expect(divs).toHaveLength(3);
        expect(divs.map((d) => d.getAttribute('data-job-number'))).toEqual(['0', '1', '2']);
    });

    it('passes an empty list when there are neither cards nor jobs', async () => {
        jobsDep.setJobs([]);
        const list = vi.fn(async () => {});
        mod.registerResumeListReinit(list);
        await mod.rebuildResumeListFromSceneCards();
        expect(list).toHaveBeenCalledWith([]);
    });
});
