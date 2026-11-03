import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick, ref } from 'vue';

const jobsData = ref([]);
vi.mock('@/modules/composables/useJobsDependency.mjs', () => ({
    getGlobalJobsDependency: () => ({ jobsData, getJobsData: () => jobsData.value }),
}));

const { default: Timeline } = await import('./Timeline.vue');

const jobs = () => [
    { employer: 'Acme', start: '2020-01', end: '2021-01' },
    { employer: 'Beta', start: '2022-03', end: '2024-06' },
];

beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    jobsData.value = [];
});
afterEach(() => vi.restoreAllMocks());

describe('Timeline.vue', () => {
    it('sizes the ruler from the loaded jobs and renders one year group with 12 month ticks each', async () => {
        jobsData.value = jobs();
        const w = mount(Timeline);
        await nextTick();
        const svg = w.get('svg.timeline-svg');
        const height = parseFloat(svg.element.style.height);
        expect(height).toBeGreaterThan(0);

        const yearGroups = w.findAll('g.timeline-year');
        const labels = yearGroups.map((g) => g.get('text.year-label').text());
        // Padded one year below the earliest start and covering the latest end.
        expect(labels[labels.length - 1]).toBe('2019');
        expect(Number(labels[0])).toBeGreaterThanOrEqual(2024);
        // Newest year at the top of the ruler.
        expect(labels).toEqual([...labels].sort((a, b) => Number(b) - Number(a)));
        expect(yearGroups[0].findAll('line.month-tick-line')).toHaveLength(12);
        expect(yearGroups[0].findAll('text.month-label')[0].text()).toBe(`${labels[0]}-01`);
        // Left alignment anchors labels at the start edge.
        expect(yearGroups[0].get('text.year-label').attributes('text-anchor')).toBe('start');
        expect(yearGroups[0].get('text.year-label').classes()).not.toContain('year-label-scene-left');
        w.unmount();
    });

    it('right alignment flips the anchors and uses the scene-left label style', async () => {
        jobsData.value = jobs();
        const w = mount(Timeline, { props: { alignment: 'right' } });
        await nextTick();
        const label = w.get('text.year-label');
        expect(label.attributes('text-anchor')).toBe('end');
        expect(label.classes()).toContain('year-label-scene-left');
        w.unmount();
    });

    it('re-syncs the bounds when the jobs payload changes (resume switch)', async () => {
        jobsData.value = jobs();
        const w = mount(Timeline);
        await nextTick();
        const before = parseFloat(w.get('svg').element.style.height);

        jobsData.value = [{ employer: 'Old', start: '2005-01', end: '2024-06' }];
        await nextTick();
        const after = parseFloat(w.get('svg').element.style.height);
        expect(after).toBeGreaterThan(before);
        const labels = w.findAll('text.year-label').map((l) => l.text());
        expect(labels[labels.length - 1]).toBe('2004');
        w.unmount();
    });

    it('leaves the current bounds alone when there are no jobs', async () => {
        jobsData.value = jobs();
        const w1 = mount(Timeline);
        await nextTick();
        const sized = parseFloat(w1.get('svg').element.style.height);
        w1.unmount();

        jobsData.value = [];
        const w2 = mount(Timeline);
        await nextTick();
        expect(parseFloat(w2.get('svg').element.style.height)).toBe(sized);
        w2.unmount();
    });
});
