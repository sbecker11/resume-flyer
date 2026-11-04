import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, provide, ref } from 'vue';
import { withSetup } from './testHost.mjs';

const jobs = ref([]);
const skills = {
    vue: { name: 'Vue', url: 'https://vuejs.org/', jobIDs: [0] },
    kafka: { name: 'Kafka', jobIDs: [1] },
};
const jobsDep = {
    isReady: ref(true),
    getJobsData: () => jobs.value,
    getSkillsData: () => skills,
    getCategoriesData: () => ({}),
    registerController: () => {},
    loadJobs: async () => jobs.value,
};
vi.mock('@/modules/composables/useJobsDependency.mjs', () => ({
    getGlobalJobsDependency: () => jobsDep,
    useJobsDependency: () => jobsDep,
}));
const applyPaletteToElement = vi.fn(async (el) => { el.setAttribute('data-background-color', '#123456'); });
vi.mock('@/modules/composables/useColorPalette.mjs', () => ({
    applyPaletteToElement,
    updateContrastForBrightness: vi.fn(),
    readyPromise: Promise.resolve(),
    syncSkillCardBackLinkPresentation: vi.fn(),
    syncAllSkillCardBackLinkPresentations: vi.fn(),
    applyPaletteToElementSync: vi.fn(),
    useColorPalette: () => ({ colorPalettes: ref({}), currentPaletteFilename: ref('dusk.json') }),
}));
const appState = ref({ 'system-constants': { cards: {} }, 'user-settings': {} });
vi.mock('@/modules/composables/useAppState.ts', () => ({ useAppState: () => ({ appState, updateAppState: vi.fn(async () => {}) }) }));
const elementRegistry = {
    getScenePlane: () => document.getElementById('scene-plane'),
    getSceneContainer: () => document.getElementById('scene-container'),
    clearAllCache: vi.fn(),
};
vi.mock('@/modules/composables/useGlobalElementRegistry.mjs', () => ({ injectGlobalElementRegistry: () => elementRegistry }));
const rebuildResumeListFromSceneCards = vi.fn(async () => true);
vi.mock('@/modules/resume/resumeReinitializer.mjs', () => ({ rebuildResumeListFromSceneCards }));
vi.mock('@/modules/utils/selectionPersistence.mjs', () => ({
    persistSelectedCard: vi.fn(async () => {}),
    readPersistedSelectedCard: vi.fn(() => null),
}));
const reportError = vi.fn();
vi.mock('@/modules/utils/errorReporting.mjs', () => ({ reportError }));

const { useCardsController, bumpCardsInitGeneration, isKnownSkillKey } = await import('./useCardsController.mjs');

function fixtureJobs() {
    return [
        { employer: 'Acme', role: 'Engineer', start: '2020-01', end: '2021-01', Description: '• [Vue] app', skillIDs: ['vue'], 'job-skills': { vue: 'Vue' } },
        { employer: 'Beta', role: 'Lead', start: '2022-03', end: 'Present', Description: '• [Kafka]', skillIDs: ['kafka'], 'job-skills': { kafka: 'Kafka' } },
        { employer: 'Gamma', role: 'Staff', start: '2020-01', end: '2021-01', Description: '• more', skillIDs: [], 'job-skills': {} },
    ];
}

function mountScene() {
    document.body.innerHTML = '';
    const scene = document.createElement('div');
    scene.id = 'scene-container';
    const plane = document.createElement('div');
    plane.id = 'scene-plane';
    scene.appendChild(plane);
    document.body.appendChild(scene);
    return { scene, plane };
}

const services = () => ({
    bullsEyeService: { isReady: ref(true) },
    timelineService: { isReady: ref(true) },
    colorPaletteService: { isReady: ref(true) },
    sceneContainerService: { isReady: ref(true) },
});

function mountController(overrides = {}) {
    const provided = { ...services(), ...overrides };
    return withSetup(() => useCardsController(), {
        parentSetup: () => { Object.entries(provided).forEach(([k, v]) => provide(k, v)); },
    });
}

let mounted;

beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('requestAnimationFrame', (cb) => { cb(); return 1; });
    jobs.value = [];
    window.resumeFlyer = { allDivs: { bizCardDivs: [], skillCardDivs: [], bizResumeDivs: [], skillResumeDivs: [] } };
    applyPaletteToElement.mockClear();
    rebuildResumeListFromSceneCards.mockClear();
    reportError.mockClear();
    mountScene();
});

afterEach(() => {
    mounted?.unmount();
    mounted = null;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
});

describe('useCardsController', () => {
    it('fails fast when any required service is not provided', () => {
        for (const missing of ['bullsEyeService', 'timelineService', 'colorPaletteService', 'sceneContainerService']) {
            expect(() => {
                const m = mountController({ [missing]: null });
                m.unmount();
            }).toThrow(new RegExp(`${missing} not provided`));
        }
    });

    it('does not initialize without jobs, and skips a second concurrent init', async () => {
        mounted = mountController();
        const ctl = mounted.result;
        await ctl.initializeCardsController();
        expect(ctl.isInitialized.value).toBe(false);
        expect(document.querySelectorAll('.biz-card-div')).toHaveLength(0);
    });

    it('reports and rethrows when the scene plane is missing', async () => {
        jobs.value = fixtureJobs();
        document.getElementById('scene-plane').remove();
        mounted = mountController({ sceneContainerService: { isReady: ref(false) } });
        await expect(mounted.result.initializeCardsController()).rejects.toThrow(/Scene plane not available/);
        expect(reportError).toHaveBeenCalledWith(expect.any(Error), '[CardsController] Scene plane not available', '');
        expect(mounted.result.isInitialized.value).toBe(false);
    });

    it('builds biz and skill cards once, positions them statically, and rebuilds the resume list', async () => {
        jobs.value = fixtureJobs();
        mounted = mountController();
        const ctl = mounted.result;
        // onMounted watch sees jobs ready + all dependencies ready → init runs.
        await vi.waitFor(() => expect(ctl.isInitialized.value).toBe(true));

        const plane = document.getElementById('scene-plane');
        const bizCards = Array.from(plane.querySelectorAll('.biz-card-div:not(.clone)'));
        const skillCards = Array.from(plane.querySelectorAll('.skill-card-div:not(.clone)'));
        expect(bizCards).toHaveLength(3);
        expect(bizCards.map((c) => c.id)).toEqual(['biz-card-div-0', 'biz-card-div-1', 'biz-card-div-2']);
        expect(skillCards.map((c) => c.getAttribute('data-skill-name')).sort()).toEqual(['kafka', 'vue']);
        // Palette is applied to the 5 originals and their 5 selection clones.
        expect(applyPaletteToElement).toHaveBeenCalledTimes(10);
        expect(plane.querySelectorAll('[id$="-clone"]')).toHaveLength(5);
        expect(rebuildResumeListFromSceneCards).toHaveBeenCalledTimes(1);
        expect(window.resumeFlyer.allDivs.bizCardDivs).toHaveLength(3);
        expect(window.resumeFlyer.allDivs.skillCardDivs).toHaveLength(2);

        // Every card has a fixed scene placement and a depth value for parallax.
        for (const card of [...bizCards, ...skillCards]) {
            expect(card.style.left).toMatch(/px$/);
            expect(card.style.top).toMatch(/px$/);
            expect(Number.isFinite(parseFloat(card.getAttribute('data-sceneZ')))).toBe(true);
        }
        // Concurrent jobs (same period) are fanned out rather than stacked.
        expect(bizCards[0].style.left).not.toBe(bizCards[2].style.left);
        // Biz cards link to their skill cards.
        expect(bizCards[0].getAttribute('data-skill-card-ids')).toBe(skillCards.find((c) => c.getAttribute('data-skill-name') === 'vue').id);

        // The scene is static: focal/bulls-eye motion never repositions cards.
        const before = bizCards.map((c) => [c.style.left, c.style.top]);
        window.dispatchEvent(new CustomEvent('focal-point-changed', { detail: { x: 1, y: 1 } }));
        window.dispatchEvent(new CustomEvent('bulls-eye-moved', { detail: { position: { x: 5, y: 5 } } }));
        await nextTick();
        expect(bizCards.map((c) => [c.style.left, c.style.top])).toEqual(before);

        // Re-running init is a no-op once initialized.
        await ctl.initializeCardsController();
        expect(plane.querySelectorAll('.biz-card-div:not(.clone)')).toHaveLength(3);
    });

    it('scene-plane-ready triggers init when jobs arrive after mount', async () => {
        mounted = mountController();
        const ctl = mounted.result;
        expect(ctl.isInitialized.value).toBe(false);
        jobs.value = fixtureJobs();
        window.dispatchEvent(new Event('scene-plane-ready'));
        await vi.waitFor(() => expect(ctl.isInitialized.value).toBe(true));
    });

    it('bumping the init generation aborts an in-flight init without leaving cards behind', async () => {
        jobs.value = fixtureJobs();
        let release;
        applyPaletteToElement.mockImplementationOnce(() => new Promise((r) => { release = r; }));
        mounted = mountController({ sceneContainerService: { isReady: ref(false) } });
        const ctl = mounted.result;
        const run = ctl.initializeCardsController();
        await vi.waitFor(() => expect(release).toBeTypeOf('function'));
        bumpCardsInitGeneration();
        release();
        await run;
        expect(ctl.isInitialized.value).toBe(false);
        expect(document.querySelectorAll('.biz-card-div')).toHaveLength(0);
    });

    it('skips a skill card for a job-skills key with no skillsData entry and reports it once per key', async () => {
        const fixture = fixtureJobs();
        // "React 18" was merged into another skill and no longer exists in skillsData, but two
        // jobs still carry it in their baked job-skills. Display-name keys that DO resolve ("Vue") stay.
        fixture[0]['job-skills'] = { Vue: 'Vue', 'React 18': 'React 18' };
        fixture[0].skillIDs = ['Vue', 'React 18'];
        fixture[2]['job-skills'] = { 'React 18': 'React 18' };
        fixture[2].skillIDs = ['React 18'];
        jobs.value = fixture;
        mounted = mountController();
        const ctl = mounted.result;
        await vi.waitFor(() => expect(ctl.isInitialized.value).toBe(true));

        const plane = document.getElementById('scene-plane');
        const skillCards = Array.from(plane.querySelectorAll('.skill-card-div:not(.clone)'));
        expect(skillCards.map((c) => c.getAttribute('data-skill-name')).sort()).toEqual(['kafka', 'vue']);
        expect(plane.querySelector('.skill-card-div[data-skill-name="React 18"]')).toBeNull();
        expect(window.resumeFlyer.allDivs.skillCardDivs).toHaveLength(2);

        const orphanReports = reportError.mock.calls.filter(([, ctx]) => /Orphaned skill key/.test(ctx));
        expect(orphanReports).toHaveLength(1);
        const [err, ctx, remedy] = orphanReports[0];
        expect(err.message).toContain('"React 18"');
        expect(ctx).toBe('[CardsController] Orphaned skill key on job 0');
        expect(remedy).toBe('Skipping its skill card');
    });

    it('isKnownSkillKey only accepts keys present in the skills map', () => {
        expect(isKnownSkillKey('vue', skills)).toBe(true);
        expect(isKnownSkillKey('Vue', skills)).toBe(false);
        expect(isKnownSkillKey('react-18', skills)).toBe(false);
        expect(isKnownSkillKey('', skills)).toBe(false);
        expect(isKnownSkillKey('vue', null)).toBe(false);
        expect(isKnownSkillKey('vue', undefined)).toBe(false);
        expect(isKnownSkillKey('vue', 'vue')).toBe(false);
    });

    it('reinitializeResumeData clears the scene and rebuilds from the current jobs', async () => {
        jobs.value = fixtureJobs();
        mounted = mountController();
        const ctl = mounted.result;
        await vi.waitFor(() => expect(ctl.isInitialized.value).toBe(true));
        const firstCard = document.getElementById('biz-card-div-0');

        jobs.value = fixtureJobs().slice(0, 1);
        await ctl.reinitializeResumeData();
        const plane = document.getElementById('scene-plane');
        expect(plane.querySelectorAll('.biz-card-div:not(.clone)')).toHaveLength(1);
        expect(document.getElementById('biz-card-div-0')).not.toBe(firstCard);
        expect(plane.querySelectorAll('.skill-card-div:not(.clone)')).toHaveLength(1);
        expect(ctl.isInitialized.value).toBe(true);
        expect(elementRegistry.clearAllCache).toHaveBeenCalled();
    });
});
