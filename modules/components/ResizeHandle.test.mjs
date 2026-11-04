import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { nextTick, reactive, ref } from 'vue';

const resize = {
    percentage: ref(50),
    isLeftCollapsed: ref(false),
    isRightCollapsed: ref(false),
    startDrag: vi.fn(),
    collapseLeft: vi.fn(async () => {}),
    collapseRight: vi.fn(async () => {}),
    toggleStepping: vi.fn(),
};
vi.mock('@/modules/composables/useResizeHandle.mjs', () => ({ useResizeHandle: () => resize }));

const orientation = ref('scene-left');
const layout = {
    orientation,
    toggleOrientation: vi.fn(() => { orientation.value = orientation.value === 'scene-left' ? 'scene-right' : 'scene-left'; }),
    getToggleButtonText: () => (orientation.value === 'scene-left' ? '←' : '→'),
    getOrientationLabel: () => orientation.value,
};
vi.mock('@/modules/composables/useLayoutToggle.mjs', () => ({ useLayoutToggle: () => layout }));

const appState = ref({ 'user-settings': { resizeHandle: { stepCount: 1 }, currentResumeId: 'default' } });
const updateAppState = vi.fn(async (patch) => {
    const next = patch?.['user-settings']?.resizeHandle?.stepCount;
    if (next !== undefined) appState.value['user-settings'].resizeHandle.stepCount = next;
});
vi.mock('@/modules/composables/useAppState', () => ({ useAppState: () => ({ appState, updateAppState }) }));

const store = reactive({ focalPoint: { mode: 'LOCKED', x: 0, y: 0 } });
const setFocalPointMode = vi.fn((m) => { store.focalPoint.mode = m; });
vi.mock('@/modules/stores/appStore.mjs', () => ({ useAppStore: () => ({ store, actions: { setFocalPointMode } }) }));

const skillsData = { vue: { name: 'Vue', url: 'https://vuejs.org/' }, kafka: { name: 'Kafka' } };
const jobsData = [
    { employer: 'Acme', role: 'Engineer', durationMonths: 12, skillIDs: ['vue'] },
    { employer: 'Beta', role: 'Lead', durationMonths: 24, skillIDs: ['kafka'] },
];
vi.mock('@/modules/composables/useJobsDependency.mjs', () => ({
    getGlobalJobsDependency: () => ({ getJobsData: () => jobsData, getSkillsData: () => skillsData }),
}));
vi.mock('@/modules/composables/usePointerDragOffset.mjs', () => ({
    usePointerDragOffset: () => ({
        isDragging: ref(false),
        startPointerDrag: vi.fn(),
        resetDragOffset: vi.fn(),
        topCenterTransformStyle: ref({}),
    }),
}));
const selectCard = vi.fn();
vi.mock('@/modules/core/selectionManager.mjs', () => ({ selectionManager: { selectCard } }));
vi.mock('@/modules/utils/skillUrlSync.mjs', () => ({ getSkillUrlCatalog: () => ({ entries: {} }) }));
vi.mock('@/modules/resume-details-editor/api.mjs', () => ({ getResumeData: vi.fn(async () => ({ jobs: [], skills: {} })) }));
const reportError = vi.fn();
vi.mock('@/modules/utils/errorReporting.mjs', () => ({ reportError }));
vi.mock('@/modules/utils/skillCardIdentity.mjs', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        buildSkillSearchOptions: vi.fn(actual.buildSkillSearchOptions),
        buildJobSearchOptions: vi.fn(actual.buildJobSearchOptions),
    };
});
const { buildSkillSearchOptions, buildJobSearchOptions } = await import('@/modules/utils/skillCardIdentity.mjs');

const { default: ResizeHandle } = await import('./ResizeHandle.vue');

/** Errors rethrown by handlers (fast-fail) land here instead of failing the run as unhandled. */
const componentErrors = [];
function mountHandle() {
    return mount(ResizeHandle, {
        global: {
            stubs: { Scene3DSettings: true },
            config: { errorHandler: (err) => { componentErrors.push(err); } },
        },
    });
}
const tooltipHidden = (w) => (w.get('#tri-state-tooltip-text').attributes('style') || '').includes('display: none');

function addSceneCards() {
    document.body.innerHTML = `
      <div id="scene-plane">
        <div id="biz-card-div-0" class="biz-card-div" data-job-number="0" data-employer="Acme" data-role="Engineer"></div>
        <div id="biz-card-div-1" class="biz-card-div" data-job-number="1" data-employer="Beta" data-role="Lead"></div>
        <div id="skill-card-div-7" class="skill-card-div" data-skill-name="vue"></div>
        <div id="skill-card-div-8" class="skill-card-div" data-skill-name="kafka"></div>
      </div>`;
    document.querySelectorAll('.biz-card-div, .skill-card-div').forEach((el) => { el.scrollIntoView = vi.fn(); });
}

beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    resize.percentage.value = 50;
    orientation.value = 'scene-left';
    appState.value = { 'user-settings': { resizeHandle: { stepCount: 1 }, currentResumeId: 'default' } };
    store.focalPoint.mode = 'LOCKED';
    [resize.collapseLeft, resize.collapseRight, resize.startDrag, layout.toggleOrientation, updateAppState, setFocalPointMode, selectCard, reportError,
        buildSkillSearchOptions, buildJobSearchOptions]
        .forEach((fn) => fn.mockClear());
    document.body.innerHTML = '';
    componentErrors.length = 0;
});
afterEach(() => vi.restoreAllMocks());

describe('ResizeHandle.vue', () => {
    it('step buttons are disabled in free-drag mode and enabled once stepping is on', async () => {
        const w = mountHandle();
        expect(w.get('#stepping-indicator').text()).toBe('∞');
        expect(w.get('#step-left').attributes('disabled')).toBeDefined();
        expect(w.get('#step-right').attributes('disabled')).toBeDefined();

        await w.get('#stepping-indicator').trigger('click');
        await flushPromises();
        expect(updateAppState).toHaveBeenCalledWith({ 'user-settings': { resizeHandle: { stepCount: 2 } } });
        expect(w.get('#stepping-indicator').text()).toBe('2');
        expect(w.get('#step-left').attributes('disabled')).toBeUndefined();
        expect(w.get('#step-right').attributes('disabled')).toBeUndefined();

        // Hover previews the next count; 10 wraps back to free drag.
        await w.get('#stepping-indicator').trigger('mouseenter');
        expect(w.get('#stepping-indicator').text()).toBe('3');
        await w.get('#stepping-indicator').trigger('mouseleave');
        appState.value['user-settings'].resizeHandle.stepCount = 10;
        await nextTick();
        expect(w.get('#stepping-indicator').text()).toBe('10');
        await w.get('#stepping-indicator').trigger('click');
        await flushPromises();
        expect(w.get('#stepping-indicator').text()).toBe('∞');
    });

    it('reverts and reports when persisting the step count fails', async () => {
        updateAppState.mockRejectedValueOnce(new Error('disk full'));
        const w = mountHandle();
        await w.get('#stepping-indicator').trigger('click');
        await flushPromises();
        expect(reportError).toHaveBeenCalledWith(expect.any(Error), '[ResizeHandle] Failed to update step count', 'Reverting step count to previous value');
        expect(w.get('#stepping-indicator').text()).toBe('∞');
        // Fast-fail: the handler rethrows after reverting.
        expect(componentErrors.map((e) => e.message)).toEqual(['disk full']);
    });

    it('step buttons follow the orientation and disable at the edges', async () => {
        appState.value['user-settings'].resizeHandle.stepCount = 3;
        const w = mountHandle();
        await w.get('#step-left').trigger('click');
        await w.get('#step-right').trigger('click');
        expect(resize.collapseLeft).toHaveBeenCalledTimes(1);
        expect(resize.collapseRight).toHaveBeenCalledTimes(1);
        expect(w.get('#step-left').attributes('title')).toMatch(/Decrease Scene Size/);

        layout.toggleOrientation();
        await nextTick();
        resize.collapseLeft.mockClear();
        resize.collapseRight.mockClear();
        await w.get('#step-left').trigger('click');
        expect(resize.collapseRight).toHaveBeenCalledTimes(1);
        expect(resize.collapseLeft).not.toHaveBeenCalled();
        expect(w.get('#step-left').attributes('title')).toMatch(/Increase Scene Size/);

        // Scene-right at max scene (≥95) disables the left (increase) button.
        resize.percentage.value = 96;
        await nextTick();
        expect(w.get('#step-left').attributes('disabled')).toBeDefined();
        expect(w.get('#step-right').attributes('disabled')).toBeUndefined();
        resize.percentage.value = 4;
        await nextTick();
        expect(w.get('#step-left').attributes('disabled')).toBeUndefined();
        expect(w.get('#step-right').attributes('disabled')).toBeDefined();
    });

    it('layout toggle flips orientation and previews the move direction on hover', async () => {
        const w = mountHandle();
        const btn = w.get('#layout-toggle');
        expect(btn.text()).toBe('←');
        await btn.trigger('mouseenter');
        expect(btn.text()).toBe('→');
        await btn.trigger('mouseleave');
        await btn.trigger('click');
        expect(layout.toggleOrientation).toHaveBeenCalledTimes(1);
        expect(btn.text()).toBe('→');
        expect(btn.attributes('title')).toMatch(/on the right/);
    });

    it('tri-state button cycles LOCKED → FOLLOWING → DRAGGING → LOCKED and shows the tooltip only on hover', async () => {
        const w = mountHandle();
        const btn = w.get('#tri-state-toggle');
        expect(tooltipHidden(w)).toBe(true);
        expect(btn.find('img.tri-state-icon-img').attributes('src')).toMatch(/locked-15-white\.png$/);

        await btn.trigger('mouseenter');
        expect(tooltipHidden(w)).toBe(false);
        expect(w.get('#tri-state-tooltip-text').text()).toMatch(/locked at viewport center/);
        expect(btn.find('img.tri-state-icon-img').attributes('src')).toMatch(/locked-15-black\.png$/);

        await btn.trigger('click');
        expect(setFocalPointMode).toHaveBeenLastCalledWith('FOLLOWING');
        expect(btn.find('svg.tri-state-reticle').exists()).toBe(true);
        expect(btn.classes()).toContain('following');
        await btn.trigger('click');
        expect(setFocalPointMode).toHaveBeenLastCalledWith('DRAGGING');
        expect(btn.find('img.tri-state-icon-img').attributes('src')).toMatch(/dragging-15-black\.png$/);
        await btn.trigger('click');
        expect(setFocalPointMode).toHaveBeenLastCalledWith('LOCKED');
        await btn.trigger('mouseleave');
        expect(tooltipHidden(w)).toBe(true);
    });

    it('mousedown on the bar starts a drag, but the button strip swallows it', async () => {
        const w = mountHandle();
        await w.get('.button-container').trigger('mousedown');
        expect(resize.startDrag).not.toHaveBeenCalled();
        await w.get('#resize-handle').trigger('mousedown');
        expect(resize.startDrag).toHaveBeenCalledTimes(1);
    });

    it('skill search lists scene skills, filters, and selects a card on click or Enter', async () => {
        addSceneCards();
        const w = mountHandle();
        expect(w.find('.skill-search-modal').exists()).toBe(false);
        await w.get('#skill-search-toggle').trigger('click');
        await flushPromises();
        const items = () => w.findAll('.skill-search-result-item');
        expect(items().map((i) => i.get('.skill-search-result-title').text())).toEqual([
            expect.stringMatching(/^Kafka/), expect.stringMatching(/^Vue/),
        ]);
        expect(items()[1].get('.skill-search-result-sub').text()).toBe('https://vuejs.org/');

        await w.get('.skill-search-input').setValue('vu');
        expect(items()).toHaveLength(1);
        await w.get('.skill-search-input').trigger('keydown', { key: 'Enter' });
        expect(selectCard).toHaveBeenCalledWith({ type: 'skill', skillCardId: 'skill-card-div-7' }, 'ResizeHandle.skillSearch');
        expect(document.getElementById('skill-card-div-7').scrollIntoView).toHaveBeenCalled();
        expect(w.find('.skill-search-modal').exists()).toBe(false);

        // Reopening resets the query and the mode.
        await w.get('#skill-search-toggle').trigger('click');
        await flushPromises();
        expect(w.get('.skill-search-input').element.value).toBe('');
        await w.get('.skill-search-input').setValue('zzz');
        expect(w.get('.skill-search-empty').text()).toBe('No matching skills.');
        await w.get('.skill-search-close').trigger('click');
        expect(w.find('.skill-search-modal').exists()).toBe(false);
    });

    it('builds the option list once per open and only filters it on each keystroke', async () => {
        addSceneCards();
        const w = mountHandle();
        await w.get('#skill-search-toggle').trigger('click');
        await flushPromises();
        const buildsAfterOpen = buildSkillSearchOptions.mock.calls.length;
        expect(buildsAfterOpen).toBeGreaterThanOrEqual(1);
        expect(buildsAfterOpen).toBeLessThanOrEqual(2);

        const input = w.get('.skill-search-input');
        for (const typed of ['k', 'ka', 'kaf', 'kafk', 'kafka']) {
            await input.setValue(typed);
            expect(w.findAll('.skill-search-result-item').map((i) => i.get('.skill-search-result-title').text()))
                .toEqual([expect.stringMatching(/^Kafka/)]);
        }
        expect(buildSkillSearchOptions.mock.calls.length).toBe(buildsAfterOpen);
        expect(buildJobSearchOptions).not.toHaveBeenCalled();

        // Switching mode builds the job list once; typing again does not rebuild it.
        await w.get('input[type="radio"][value="job"]').setValue(true);
        await nextTick();
        const jobBuilds = buildJobSearchOptions.mock.calls.length;
        expect(jobBuilds).toBe(1);
        await input.setValue('be');
        await input.setValue('bet');
        expect(buildJobSearchOptions.mock.calls.length).toBe(jobBuilds);
        expect(buildSkillSearchOptions.mock.calls.length).toBe(buildsAfterOpen);

        // Reopening rebuilds from the current scene cards.
        await w.get('.skill-search-close').trigger('click');
        await w.get('#skill-search-toggle').trigger('click');
        await flushPromises();
        expect(buildSkillSearchOptions.mock.calls.length).toBeGreaterThan(buildsAfterOpen);
    });

    it('job mode searches biz cards and selects by job number', async () => {
        addSceneCards();
        const w = mountHandle();
        await w.get('#skill-search-toggle').trigger('click');
        await flushPromises();
        await w.get('input[type="radio"][value="job"]').setValue(true);
        expect(w.get('.skill-search-input').attributes('placeholder')).toMatch(/employer or role/);
        await w.get('.skill-search-input').setValue('beta');
        const items = w.findAll('.skill-search-result-item');
        expect(items).toHaveLength(1);
        await items[0].trigger('click');
        expect(selectCard).toHaveBeenCalledWith({ type: 'biz', jobNumber: 1 }, 'ResizeHandle.jobSearch');
        expect(document.getElementById('biz-card-div-1').scrollIntoView).toHaveBeenCalled();
    });

    it('keeps typing routed to the finder input after switching the search mode', async () => {
        addSceneCards();
        const host = document.createElement('div');
        document.body.appendChild(host);
        const w = mount(ResizeHandle, {
            attachTo: host,
            global: { stubs: { Scene3DSettings: true }, config: { errorHandler: (err) => { componentErrors.push(err); } } },
        });
        try {
            await w.get('#skill-search-toggle').trigger('click');
            await flushPromises();
            const input = w.get('.skill-search-input');
            expect(document.activeElement).toBe(input.element);

            // A browser moves focus on mousedown; the modal must keep it on the text field.
            const rowDown = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
            w.get('.skill-search-mode-row').element.dispatchEvent(rowDown);
            expect(rowDown.defaultPrevented).toBe(true);
            const inputDown = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
            input.element.dispatchEvent(inputDown);
            expect(inputDown.defaultPrevented).toBe(false);

            // Focus that still lands on the radio (keyboard, or a browser that ignores the
            // prevented mousedown) is handed back to the text field once the mode changes.
            const jobRadio = w.get('input[type="radio"][value="job"]');
            jobRadio.element.focus();
            expect(document.activeElement).toBe(jobRadio.element);
            await jobRadio.setValue(true);
            await nextTick();
            expect(document.activeElement).toBe(input.element);

            await input.setValue('be');
            expect(input.element.value).toBe('be');
            expect(w.findAll('.skill-search-result-item').map((i) => i.get('.skill-search-result-title').text()))
                .toEqual([expect.stringMatching(/Beta$/)]);

            await w.get('input[type="radio"][value="skill"]').setValue(true);
            await nextTick();
            expect(document.activeElement).toBe(input.element);
            await input.setValue('ka');
            expect(input.element.value).toBe('ka');
            expect(w.findAll('.skill-search-result-item').map((i) => i.get('.skill-search-result-title').text()))
                .toEqual([expect.stringMatching(/^Kafka/)]);
        } finally {
            w.unmount();
            host.remove();
        }
    });

    it('clicking the overlay backdrop closes the search', async () => {
        const w = mountHandle();
        await w.get('#skill-search-toggle').trigger('click');
        await flushPromises();
        await w.get('.skill-search-modal').trigger('click');
        expect(w.find('.skill-search-modal').exists()).toBe(true);
        await w.get('.skill-search-modal-overlay').trigger('click');
        expect(w.find('.skill-search-modal').exists()).toBe(false);
    });
});
