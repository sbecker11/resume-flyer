import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

const api = {
    getResumeData: vi.fn(),
    updateJob: vi.fn(),
    addJobAfter: vi.fn(),
    deleteJob: vi.fn(),
};
vi.mock('../api.mjs', () => api);
vi.mock('@/modules/core/hasServer.mjs', () => ({ hasServer: () => true }));
const reportError = vi.fn();
vi.mock('@/modules/utils/errorReporting.mjs', () => ({ reportError }));

const { default: JobsTab } = await import('./JobsTab.vue');

const sampleJobs = () => [
    { employer: 'Acme', role: 'Engineer', start: '2020-01', end: '2021-06-15', Description: '• Built things' },
    { employer: 'Beta', role: 'Lead', start: '2022-03', end: 'Present', Description: '' },
    { employer: 'MIT', title: 'PhD', educationKey: 'mit-phd', start: '1990', end: '1995' },
];

/** Mount and let the two deferred macrotasks (fetch, then selection) run. */
async function mountLoaded(props = {}) {
    const w = mount(JobsTab, { props: { resumeId: 'r1', ...props }, global: { stubs: { Teleport: true } } });
    await vi.runAllTimersAsync();
    await flushPromises();
    return w;
}

const select = (w) => w.get('#rde-jobs-job-select');
const optionLabels = (w) => select(w).findAll('option').slice(1).map((o) => o.text());

beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('alert', vi.fn());
    Object.values(api).forEach((fn) => fn.mockReset());
    api.getResumeData.mockImplementation(async () => ({ jobs: sampleJobs() }));
    api.updateJob.mockResolvedValue({ success: true });
    api.addJobAfter.mockResolvedValue({ insertIndex: 1 });
    api.deleteJob.mockResolvedValue({ success: true });
    reportError.mockClear();
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
});

describe('JobsTab.vue', () => {
    it('does nothing for the default resume and shows a loading state until jobs arrive', async () => {
        const w = mount(JobsTab, { props: { resumeId: 'default' } });
        expect(api.getResumeData).not.toHaveBeenCalled();
        expect(w.find('.rde-loading').exists()).toBe(false);
        w.unmount();

        const w2 = mount(JobsTab, { props: { resumeId: 'r1' } });
        expect(w2.get('.rde-loading').text()).toBe('Loading jobs…');
        await vi.runAllTimersAsync();
        await flushPromises();
        expect(w2.find('.rde-loading').exists()).toBe(false);
        w2.unmount();
    });

    it('loads jobs, selects the first work job, fills the fields and announces readiness', async () => {
        const w = await mountLoaded();
        expect(api.getResumeData).toHaveBeenCalledWith('r1');
        expect(optionLabels(w)).toEqual(['Acme -- Engineer', 'Beta -- Lead', expect.stringContaining('MIT')]);
        expect(select(w).element.value).toBe('0');
        expect(w.emitted('update:selectedJobIndex')).toEqual([[0]]);
        expect(w.emitted('content-ready')).toHaveLength(1);
        expect(w.get('#rde-jobs-employer').element.value).toBe('Acme');
        expect(w.get('#rde-jobs-title').element.value).toBe('Engineer');
        expect(w.get('#rde-jobs-start-yy').element.value).toBe('2020');
        expect(w.get('#rde-jobs-start-mm').element.value).toMatch(/^0?1$/);
        expect(w.get('#rde-jobs-start-dd').element.value).toBe('');
        expect(w.get('#rde-jobs-end-yy').element.value).toBe('2021');
        expect(w.get('#rde-jobs-end-dd').element.value).toBe('15');
        expect(w.get('#rde-jobs-description').element.value).toBe('• Built things');
        expect(w.get('.rde-btn-nav[aria-label="Previous job"]').attributes('disabled')).toBeDefined();
        expect(w.get('.rde-btn-nav[aria-label="Next job"]').attributes('disabled')).toBeUndefined();
    });

    it('honours a preselected job index and follows later prop changes', async () => {
        const w = await mountLoaded({ selectedJobIndex: 1 });
        expect(select(w).element.value).toBe('1');
        expect(w.get('#rde-jobs-employer').element.value).toBe('Beta');
        expect(w.get('#rde-jobs-end-yy').element.value).toBe('');
        await w.setProps({ selectedJobIndex: 0 });
        expect(w.get('#rde-jobs-employer').element.value).toBe('Acme');
    });

    it('reports a failed load in place', async () => {
        api.getResumeData.mockRejectedValueOnce(new Error('offline'));
        const w = await mountLoaded();
        expect(w.get('.rde-error').text()).toBe('Failed to load jobs: offline');
        expect(w.emitted('content-ready')).toHaveLength(1);
    });

    it('blur normalises dates and autosaves a patch of the edited job', async () => {
        const w = await mountLoaded();
        await w.get('#rde-jobs-employer').setValue('Acme Corp');
        await w.get('#rde-jobs-start-mm').setValue('3');
        await w.get('#rde-jobs-employer').trigger('blur');
        await flushPromises();
        expect(w.get('#rde-jobs-start-mm').element.value).toBe('03');
        expect(api.updateJob).toHaveBeenCalledWith('r1', 0, expect.objectContaining({
            employer: 'Acme Corp', role: 'Engineer', start: '2020-03', end: '2021-06-15', Description: '• Built things',
            githubRepoUrl: '', githubPagesUrl: '',
        }));
        expect(w.emitted('saved')).toEqual([[{ jobFieldsSaved: true }]]);
        // The dropdown label reflects the in-memory update.
        expect(optionLabels(w)[0]).toBe('Acme Corp -- Engineer');
    });

    it('loads, edits, and saves github repo URL and github page URL', async () => {
        api.getResumeData.mockImplementation(async () => ({
            jobs: [{
                ...sampleJobs()[0],
                githubRepoUrl: 'https://github.com/sbecker11/color-palette-maker',
                githubPagesUrl: '',
            }],
        }));
        const w = await mountLoaded();
        const repo = w.get('#rde-jobs-github-repo-url');
        const page = w.get('#rde-jobs-github-page-url');
        expect(repo.element.value).toBe('https://github.com/sbecker11/color-palette-maker');
        expect(page.element.value).toBe('');
        expect(w.get('label[for="rde-jobs-github-repo-url"]').text()).toBe('github repo URL');
        expect(w.get('label[for="rde-jobs-github-page-url"]').text()).toBe('github page URL');
        await page.setValue('sbecker11.github.io/color-palette-maker/');
        await page.trigger('blur');
        await flushPromises();
        expect(page.element.value).toBe('https://sbecker11.github.io/color-palette-maker/');
        expect(api.updateJob).toHaveBeenCalledWith('r1', 0, expect.objectContaining({
            githubRepoUrl: 'https://github.com/sbecker11/color-palette-maker',
            githubPagesUrl: 'https://sbecker11.github.io/color-palette-maker/',
        }));
        await repo.setValue('');
        await repo.trigger('blur');
        await flushPromises();
        expect(api.updateJob).toHaveBeenLastCalledWith('r1', 0, expect.objectContaining({
            githubRepoUrl: '',
            githubPagesUrl: 'https://sbecker11.github.io/color-palette-maker/',
        }));
    });

    it('rejects an invalid start month with an alert, clears it, and does not save', async () => {
        const w = await mountLoaded();
        await w.get('#rde-jobs-start-mm').setValue('13');
        await w.get('#rde-jobs-start-mm').trigger('blur');
        await flushPromises();
        expect(alert).toHaveBeenCalledWith('Start month must be between 1 and 12');
        expect(w.get('#rde-jobs-start-mm').element.value).toBe('');
        expect(api.updateJob).not.toHaveBeenCalled();
    });

    it('surfaces a failed save via alert and keeps the tab usable', async () => {
        api.updateJob.mockRejectedValueOnce(new Error('500'));
        const w = await mountLoaded();
        await w.get('#rde-jobs-title').setValue('Principal');
        await w.get('#rde-jobs-title').trigger('blur');
        await flushPromises();
        expect(alert).toHaveBeenCalledWith('Failed to save job: 500');
        expect(w.emitted('saved')).toBeUndefined();
        expect(w.get('.rde-btn.skills').attributes('disabled')).toBeUndefined();
    });

    it('Previous/Next step through work jobs only, saving first, and Skills hands off the index', async () => {
        const w = await mountLoaded();
        await w.get('.rde-btn-nav[aria-label="Next job"]').trigger('click');
        await flushPromises();
        expect(api.updateJob).toHaveBeenCalledTimes(1);
        expect(select(w).element.value).toBe('1');
        expect(w.emitted('update:selectedJobIndex').at(-1)).toEqual([1]);
        // Education row (index 2) is not reachable through Next.
        expect(w.get('.rde-btn-nav[aria-label="Next job"]').attributes('disabled')).toBeDefined();
        await w.get('.rde-btn-nav[aria-label="Previous job"]').trigger('click');
        await flushPromises();
        expect(select(w).element.value).toBe('0');

        await w.get('.rde-btn.skills').trigger('click');
        await flushPromises();
        expect(w.emitted('open-skills-for-job')).toEqual([[0]]);
    });

    it('education rows are read-only and cannot be deleted', async () => {
        const w = await mountLoaded({ selectedJobIndex: 2 });
        expect(w.get('#rde-jobs-employer').attributes('disabled')).toBeDefined();
        expect(w.get('.rde-btn.delete-job').attributes('disabled')).toBeDefined();
        await w.get('#rde-jobs-employer').trigger('blur');
        await flushPromises();
        expect(api.updateJob).not.toHaveBeenCalled();
    });

    it('Add Job saves, inserts after the current job, and selects the new row', async () => {
        api.getResumeData
            .mockResolvedValueOnce({ jobs: sampleJobs() })
            .mockResolvedValueOnce({ jobs: [sampleJobs()[0], { employer: '', role: '' }, ...sampleJobs().slice(1)] });
        const w = await mountLoaded();
        await w.get('.rde-btn.add-job').trigger('click');
        await flushPromises();
        expect(api.addJobAfter).toHaveBeenCalledWith('r1', 0);
        expect(select(w).element.value).toBe('1');
        expect(optionLabels(w)[1]).toBe('Job 2');
        expect(w.emitted('saved').at(-1)).toEqual([{ jobsMutated: true }]);
    });

    it('Delete Job confirms, deletes, reloads and emits jobsMutated; failures are reported', async () => {
        api.getResumeData
            .mockResolvedValueOnce({ jobs: sampleJobs() })
            .mockResolvedValueOnce({ jobs: sampleJobs().slice(1) });
        const w = await mountLoaded();
        await w.get('.rde-btn.delete-job').trigger('click');
        expect(w.get('.rde-delete-job-label').text()).toBe('Acme -- Engineer');
        await w.get('.rde-btn.cancel').trigger('click');
        expect(w.find('.rde-delete-job-dialog').exists()).toBe(false);
        expect(api.deleteJob).not.toHaveBeenCalled();

        await w.get('.rde-btn.delete-job').trigger('click');
        await w.get('.rde-btn.delete-confirm').trigger('click');
        await flushPromises();
        expect(api.deleteJob).toHaveBeenCalledWith('r1', 0);
        expect(optionLabels(w)[0]).toBe('Beta -- Lead');
        expect(select(w).element.value).toBe('0');
        expect(w.emitted('saved').at(-1)).toEqual([{ jobsMutated: true }]);

        api.deleteJob.mockRejectedValueOnce(new Error('locked'));
        await w.get('.rde-btn.delete-job').trigger('click');
        await w.get('.rde-btn.delete-confirm').trigger('click');
        await flushPromises();
        expect(reportError).toHaveBeenCalledWith(expect.any(Error), '[JobsTab] Delete job failed', '');
        expect(alert).toHaveBeenCalledWith('Failed to delete job: locked');
    });
});
