import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

const api = { getResumeData: vi.fn(), updateJob: vi.fn() };
vi.mock('../api.mjs', () => api);
const mgr = { updateJobSkills: vi.fn(), updateEducationJobSkills: vi.fn(), deleteSkill: vi.fn() };
vi.mock('@/modules/api/resumeManagerApi.mjs', () => mgr);
vi.mock('@/modules/core/hasServer.mjs', () => ({ hasServer: () => true }));
const reportError = vi.fn();
vi.mock('@/modules/utils/errorReporting.mjs', () => ({ reportError }));

const { default: SkillJobsTab } = await import('./SkillJobsTab.vue');

const skills = () => ({
    vue: { name: 'Vue' },
    kafka: { name: 'Kafka' },
    python: { name: 'Python' },
});
const jobs = () => [
    { employer: 'Acme', role: 'Engineer', start: '2020-01', end: '2020-12', durationMonths: 12, skillIDs: ['vue'], Description: '• Built a [Vue] app' },
    { employer: 'Beta', role: 'Lead', start: '2022-01', end: '2023-12', durationMonths: 24, skillIDs: ['kafka', 'vue'], Description: '' },
    { employer: 'MIT', title: 'PhD', educationKey: 'mit-phd', start: '1990', end: '1995', skillIDs: ['python'] },
];

async function mountLoaded(props = {}) {
    const w = mount(SkillJobsTab, { props: { resumeId: 'r1', ...props }, global: { stubs: { Teleport: true } } });
    await vi.runAllTimersAsync();
    await flushPromises();
    return w;
}

/** Rows are sorted by skill name: Kafka, Python, Vue. Cells per row follow job order. */
const rowLabels = (w) => w.findAll('.rde-sj-skill-name').map((s) => s.text());
const cell = (w, skillIndex, jobIndex) => w.findAll('.rde-sj-cell')[skillIndex * 3 + jobIndex];
const linked = (w, skillIndex, jobIndex) => cell(w, skillIndex, jobIndex).attributes('aria-pressed') === 'true';

beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('alert', vi.fn());
    [...Object.values(api), ...Object.values(mgr)].forEach((fn) => fn.mockReset());
    api.getResumeData.mockImplementation(async () => ({ jobs: jobs(), skills: skills() }));
    api.updateJob.mockResolvedValue({ success: true });
    mgr.updateJobSkills.mockResolvedValue({ success: true });
    mgr.updateEducationJobSkills.mockResolvedValue({ success: true });
    mgr.deleteSkill.mockResolvedValue({ success: true });
    reportError.mockClear();
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
});

describe('SkillJobsTab.vue', () => {
    it('renders the skill × job matrix with linked cells, counts and month totals', async () => {
        const w = await mountLoaded();
        expect(api.getResumeData).toHaveBeenCalledWith('r1');
        expect(w.emitted('content-ready')).toHaveLength(1);
        expect(w.findAll('.rde-sj-head-job')).toHaveLength(3);
        expect(rowLabels(w)).toEqual([expect.stringMatching(/^Kafka/), expect.stringMatching(/^Python/), expect.stringMatching(/^Vue/)]);
        // Vue: linked to Acme (12 mo) + Beta (24 mo).
        expect(rowLabels(w)[2]).toMatch(/36/);
        expect(linked(w, 2, 0)).toBe(true);
        expect(linked(w, 2, 1)).toBe(true);
        expect(linked(w, 2, 2)).toBe(false);
        expect(linked(w, 0, 0)).toBe(false);
        expect(linked(w, 0, 1)).toBe(true);
        expect(linked(w, 1, 2)).toBe(true);
        expect(cell(w, 2, 0).attributes('aria-label')).toMatch(/linked$/);
        expect(cell(w, 0, 0).attributes('aria-label')).toMatch(/not linked$/);
        expect(w.get('.rde-sj-clear').attributes('disabled')).toBeUndefined();
        expect(w.get('.rde-sj-remove').attributes('disabled')).toBeDefined();
    });

    it('shows empty and error states, and is ready immediately for the default resume', async () => {
        api.getResumeData.mockResolvedValueOnce({ jobs: [], skills: skills() });
        const w = await mountLoaded();
        expect(w.get('.rde-skill-jobs-cross-empty').text()).toContain('No jobs in this resume.');

        api.getResumeData.mockRejectedValueOnce(new Error('offline'));
        const w2 = await mountLoaded();
        expect(w2.get('.rde-error').text()).toBe('Failed to load jobs: offline');
        expect(reportError).toHaveBeenCalledWith(expect.any(Error), '[SkillJobsTab] load failed', '');

        const w3 = await mountLoaded({ resumeId: 'default' });
        expect(api.getResumeData).toHaveBeenCalledTimes(2);
        expect(w3.emitted('content-ready')).toHaveLength(1);
    });

    it('toggling a work cell updates optimistically, emits saved, and persists skills plus the aligned description', async () => {
        const w = await mountLoaded();
        // Link Kafka to Acme.
        await cell(w, 0, 0).trigger('click');
        expect(linked(w, 0, 0)).toBe(true);
        expect(w.emitted('saved')[0][0]).toEqual({ jobIndex: 0, skillIDs: ['vue', 'kafka'], jobSkills: { vue: 'Vue', kafka: 'Kafka' } });
        await flushPromises();
        expect(mgr.updateJobSkills).toHaveBeenCalledWith('r1', 0, ['vue', 'kafka'], []);
        expect(api.updateJob).not.toHaveBeenCalled();

        // Unlink Vue from Acme: the [Vue] bracket in the description is dropped too.
        await cell(w, 2, 0).trigger('click');
        expect(linked(w, 2, 0)).toBe(false);
        await flushPromises();
        expect(mgr.updateJobSkills).toHaveBeenLastCalledWith('r1', 0, ['kafka'], []);
        expect(api.updateJob).toHaveBeenCalledWith('r1', 0, { Description: expect.not.stringContaining('[Vue]') });
        expect(rowLabels(w)[2]).toMatch(/24/);
    });

    it('education cells save through the education endpoint', async () => {
        const w = await mountLoaded();
        await cell(w, 0, 2).trigger('click');
        await flushPromises();
        expect(mgr.updateEducationJobSkills).toHaveBeenCalledWith('r1', 'mit-phd', ['python', 'kafka'], []);
        expect(mgr.updateJobSkills).not.toHaveBeenCalled();
    });

    it('a failed cell save is reported, resynced from the server and alerted', async () => {
        mgr.updateJobSkills.mockRejectedValueOnce(new Error('409'));
        const w = await mountLoaded();
        await cell(w, 0, 0).trigger('click');
        expect(linked(w, 0, 0)).toBe(true);
        await flushPromises();
        expect(reportError).toHaveBeenCalledWith(expect.any(Error), '[SkillJobsTab] Failed to save job–skill link', 'Refetching resume data to resync');
        expect(api.getResumeData).toHaveBeenCalledTimes(2);
        expect(alert).toHaveBeenCalledWith('Failed to save: 409');
        // Server truth restored: Kafka is not linked to Acme.
        expect(linked(w, 0, 0)).toBe(false);
    });

    it('name clicks highlight a column/row without toggling links; Escape and outside clicks clear it', async () => {
        const w = await mountLoaded();
        await w.findAll('.rde-sj-head-job')[1].trigger('click');
        expect(cell(w, 0, 1).classes()).toContain('rde-sj-hi-col');
        expect(mgr.updateJobSkills).not.toHaveBeenCalled();

        await w.findAll('.rde-sj-head-skill')[2].trigger('click');
        expect(cell(w, 2, 0).classes()).toContain('rde-sj-hi-row');
        expect(w.get('.rde-sj-remove').attributes('disabled')).toBeUndefined();

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        await flushPromises();
        expect(w.findAll('.rde-sj-hi-row')).toHaveLength(0);
        expect(w.findAll('.rde-sj-hi-col')).toHaveLength(0);

        await w.findAll('.rde-sj-head-skill')[0].trigger('click');
        expect(w.findAll('.rde-sj-hi-row').length).toBeGreaterThan(0);
        await w.get('.rde-skill-jobs').trigger('click');
        expect(w.findAll('.rde-sj-hi-row')).toHaveLength(0);
    });

    it('Delete selected skill confirms, deletes, refetches and emits removedSkill', async () => {
        api.getResumeData
            .mockResolvedValueOnce({ jobs: jobs(), skills: skills() })
            .mockResolvedValueOnce({ jobs: jobs(), skills: { vue: { name: 'Vue' }, python: { name: 'Python' } } });
        const w = await mountLoaded();
        await w.findAll('.rde-sj-head-skill')[0].trigger('click');
        await w.get('.rde-sj-toolbar .rde-sj-remove').trigger('click');
        expect(w.get('#rde-sj-remove-warning-title').text()).toBe('Delete Kafka?');
        await w.get('.rde-sj-confirm-cancel').trigger('click');
        expect(mgr.deleteSkill).not.toHaveBeenCalled();

        // With Teleport stubbed the dialog sits inside the page root, so Cancel's click bubbled to
        // the page-click handler and cleared the highlight; re-select the row as a user would.
        await w.findAll('.rde-sj-head-skill')[0].trigger('click');
        await w.get('.rde-sj-toolbar .rde-sj-remove').trigger('click');
        await w.get('.rde-sj-confirm .rde-sj-remove').trigger('click');
        await flushPromises();
        expect(mgr.deleteSkill).toHaveBeenCalledWith('r1', 'kafka');
        expect(rowLabels(w)).toHaveLength(2);
        expect(w.emitted('saved').at(-1)).toEqual([{ removedSkill: true }]);
        expect(w.get('.rde-sj-toolbar .rde-sj-remove').attributes('disabled')).toBeDefined();
    });

    it('Clear all unlinks every job (education included), aligns descriptions and refetches', async () => {
        const cleared = jobs().map((j) => ({ ...j, skillIDs: [], Description: (j.Description || '').replace('[Vue]', 'Vue') }));
        api.getResumeData
            .mockResolvedValueOnce({ jobs: jobs(), skills: skills() })
            .mockResolvedValueOnce({ jobs: cleared, skills: skills() });
        const w = await mountLoaded();
        await w.get('.rde-sj-toolbar .rde-sj-clear').trigger('click');
        expect(w.get('#rde-sj-clear-warning-title').exists()).toBe(true);
        await w.get('.rde-sj-confirm .rde-sj-clear').trigger('click');
        await flushPromises();
        expect(mgr.updateJobSkills).toHaveBeenCalledWith('r1', 0, [], []);
        expect(mgr.updateJobSkills).toHaveBeenCalledWith('r1', 1, [], []);
        expect(mgr.updateEducationJobSkills).toHaveBeenCalledWith('r1', 'mit-phd', [], []);
        expect(api.updateJob).toHaveBeenCalledWith('r1', 0, { Description: expect.not.stringContaining('[Vue]') });
        expect(w.emitted('saved').at(-1)).toEqual([{ clearAllJobSkillLinks: true }]);
        expect(w.findAll('.rde-sj-cell[aria-pressed="true"]')).toHaveLength(0);
        expect(w.get('.rde-sj-clear').attributes('disabled')).toBeDefined();
    });

    it('a failed Clear all is reported and alerted', async () => {
        mgr.updateJobSkills.mockRejectedValueOnce(new Error('nope'));
        const w = await mountLoaded();
        await w.get('.rde-sj-toolbar .rde-sj-clear').trigger('click');
        await w.get('.rde-sj-confirm .rde-sj-clear').trigger('click');
        await flushPromises();
        expect(reportError).toHaveBeenCalledWith(expect.any(Error), '[SkillJobsTab] Clear all grid cells failed', 'Refetching resume data to resync');
        expect(alert).toHaveBeenCalledWith('Failed to clear: nope');
    });
});
