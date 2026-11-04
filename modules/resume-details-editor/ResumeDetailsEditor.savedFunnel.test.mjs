import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { jobsMutated, jobFieldsSaved, jobSkills, removedSkill, skillMerged, resumeRefreshAction, needsResumeListRefetch } from './savedPayload.mjs';

const api = {
    getResumeMeta: vi.fn(async () => ({})),
    getResumeOtherSections: vi.fn(async () => ({})),
    getResumeEducation: vi.fn(async () => ({})),
    updateResumeMeta: vi.fn(async (_id, u) => u),
    updateResumeOtherSections: vi.fn(async () => ({})),
    updateResumeEducation: vi.fn(async () => ({})),
    getResumeData: vi.fn(async () => ({ jobs: [], skills: {} })),
    updateJob: vi.fn(),
    addJobAfter: vi.fn(),
    deleteJob: vi.fn(),
    updateResumeCategories: vi.fn(),
};
vi.mock('./api.mjs', () => api);
vi.mock('@/modules/core/hasServer.mjs', () => ({ hasServer: () => true }));
vi.mock('@/modules/api/resumeManagerApi.mjs', () => ({
    listReparseHistory: vi.fn(async () => []),
    reparseResumeWithParserStream: vi.fn(),
    restoreReparseHistory: vi.fn(),
}));
const reportError = vi.fn();
vi.mock('@/modules/utils/errorReporting.mjs', () => ({ reportError }));

const { default: ResumeDetailsEditor } = await import('./ResumeDetailsEditor.vue');

const tabStub = (name) => ({
    name,
    props: ['resumeId', 'reloadNonce', 'selectedJobIndex'],
    emits: ['saved', 'update:selectedJobIndex', 'content-ready', 'open-skills-for-job', 'open-education-for-job', 'update:meta', 'update:data', 'autosave'],
    template: `<div data-stub="${name}" :data-reload-nonce="reloadNonce"></div>`,
});

const readNonce = (w) => Number(w.get('[data-stub="JobsTab"]').attributes('data-reload-nonce'));

async function mountOpenOn(initialTab) {
    const w = mount(ResumeDetailsEditor, {
        props: { isOpen: true, resumeId: 'r1', initialTab },
        global: {
            stubs: {
                Teleport: true,
                MetaTab: tabStub('MetaTab'),
                OtherSectionsTab: tabStub('OtherSectionsTab'),
                EducationTab: tabStub('EducationTab'),
                JobsTab: tabStub('JobsTab'),
                SkillsTab: tabStub('SkillsTab'),
                SkillJobsTab: tabStub('SkillJobsTab'),
            },
        },
    });
    await vi.runAllTimersAsync();
    await flushPromises();
    return w;
}

beforeEach(() => {
    for (const fn of Object.values(api)) fn.mockClear();
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('alert', vi.fn());
    reportError.mockClear();
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
});

describe('ResumeDetailsEditor saved funnel', () => {
    it('forwards the JobsTab payload unchanged so jobsMutated reaches the container and reloads the scene', async () => {
        const w = await mountOpenOn('resume-jobs');
        const jobsTab = w.findComponent({ name: 'JobsTab' });
        expect(jobsTab.exists()).toBe(true);
        const nonceBefore = readNonce(w);

        jobsTab.vm.$emit('saved', jobsMutated());
        await nextTick();
        await flushPromises();
        await nextTick();

        expect(w.emitted('saved')).toEqual([[{ jobsMutated: true }]]);
        expect(resumeRefreshAction(w.emitted('saved')[0][0])).toBe('reload');
        expect(readNonce(w)).toBe(nonceBefore + 1);
        w.unmount();
    });

    it('forwards a job field save without bumping the reload nonce (no scene refresh)', async () => {
        const w = await mountOpenOn('resume-jobs');
        const jobsTab = w.findComponent({ name: 'JobsTab' });
        const nonceBefore = readNonce(w);

        jobsTab.vm.$emit('saved', jobFieldsSaved());
        await nextTick();
        await flushPromises();
        await nextTick();

        expect(w.emitted('saved')).toEqual([[{ jobFieldsSaved: true }]]);
        expect(resumeRefreshAction(w.emitted('saved')[0][0])).toBe('none');
        expect(readNonce(w)).toBe(nonceBefore);
        w.unmount();
    });

    it('forwards SkillsTab and SkillJobsTab payloads unchanged', async () => {
        const w = await mountOpenOn('job-skills');
        const skillsTab = w.findComponent({ name: 'SkillsTab' });
        const perJob = jobSkills({ jobIndex: 1, skillIDs: ['vue'], jobSkills: { vue: 'Vue' } });
        skillsTab.vm.$emit('saved', perJob);
        skillsTab.vm.$emit('saved', skillMerged());
        await flushPromises();
        expect(w.emitted('saved')).toEqual([[perJob], [{ skillMerged: true }]]);
        expect(w.emitted('saved')[0][0]).toBe(perJob);
        w.unmount();

        const w2 = await mountOpenOn('skill-jobs');
        const skillJobsTab = w2.findComponent({ name: 'SkillJobsTab' });
        skillJobsTab.vm.$emit('saved', removedSkill());
        await flushPromises();
        expect(w2.emitted('saved')).toEqual([[{ removedSkill: true }]]);
        w2.unmount();
    });

    describe('save() emits only what it flushed', () => {
        async function clickSave(w) {
            await w.get('.rde-btn.save').trigger('click');
            await flushPromises();
            await nextTick();
        }

        it('education pending → educationSaved (a reload, since education rows are scene jobs), then close', async () => {
            const w = await mountOpenOn('education');
            const education = { phd: { degree: 'PhD', institution: 'MIT', skillIDs: [] } };
            w.findComponent({ name: 'EducationTab' }).vm.$emit('update:data', education);
            await clickSave(w);

            expect(api.updateResumeEducation).toHaveBeenCalledWith('r1', education);
            expect(api.updateResumeMeta).not.toHaveBeenCalled();
            expect(api.updateResumeOtherSections).not.toHaveBeenCalled();
            expect(w.emitted('saved')).toEqual([[{ educationSaved: true }]]);
            expect(resumeRefreshAction(w.emitted('saved')[0][0])).toBe('reload');
            expect(needsResumeListRefetch(w.emitted('saved')[0][0])).toBe(false);
            expect(w.emitted('close')).toHaveLength(1);
            w.unmount();
        });

        it('meta pending → metaSaved only (refetch-list, no reload)', async () => {
            const w = await mountOpenOn('meta');
            w.findComponent({ name: 'MetaTab' }).vm.$emit('update:meta', { displayName: 'Renamed' });
            await clickSave(w);

            expect(api.updateResumeMeta).toHaveBeenCalledWith('r1', { displayName: 'Renamed' });
            expect(api.updateResumeEducation).not.toHaveBeenCalled();
            expect(w.emitted('saved')).toEqual([[{ metaSaved: true }]]);
            expect(resumeRefreshAction(w.emitted('saved')[0][0])).toBe('refetch-list');
            w.unmount();
        });

        it('other-sections pending reuses metaSaved (kept on purpose)', async () => {
            const w = await mountOpenOn('other-sections');
            w.findComponent({ name: 'OtherSectionsTab' }).vm.$emit('update:data', { summary: 'Hi' });
            await clickSave(w);

            expect(api.updateResumeOtherSections).toHaveBeenCalledWith('r1', { summary: 'Hi' });
            expect(w.emitted('saved')).toEqual([[{ metaSaved: true }]]);
            w.unmount();
        });

        it('meta + education pending → one combined payload; reload wins over refetch-list', async () => {
            const w = await mountOpenOn('education');
            w.findComponent({ name: 'EducationTab' }).vm.$emit('update:data', { phd: { degree: 'PhD' } });
            w.vm.pendingMeta = { displayName: 'Both' };
            await clickSave(w);

            expect(api.updateResumeMeta).toHaveBeenCalledWith('r1', { displayName: 'Both' });
            expect(api.updateResumeEducation).toHaveBeenCalledWith('r1', { phd: { degree: 'PhD' } });
            expect(w.emitted('saved')).toEqual([[{ metaSaved: true, educationSaved: true }]]);
            expect(resumeRefreshAction(w.emitted('saved')[0][0])).toBe('reload');
            expect(needsResumeListRefetch(w.emitted('saved')[0][0])).toBe(true);
            expect(w.emitted('close')).toHaveLength(1);
            w.unmount();
        });

        it('nothing pending → no saved payload from the editor itself, still closes', async () => {
            const w = await mountOpenOn('meta');
            await clickSave(w);
            expect(api.updateResumeMeta).not.toHaveBeenCalled();
            expect(w.emitted('saved')).toBeUndefined();
            expect(w.emitted('close')).toHaveLength(1);
            w.unmount();
        });

        it('a failed write is reported with the keep-open remedy, alerts, and does not close', async () => {
            const w = await mountOpenOn('education');
            w.findComponent({ name: 'EducationTab' }).vm.$emit('update:data', { phd: {} });
            api.updateResumeEducation.mockRejectedValueOnce(new Error('disk full'));
            await clickSave(w);

            expect(reportError).toHaveBeenCalledWith(expect.any(Error), '[ResumeDetailsEditor] Save failed', 'Keeping the editor open; nothing further written');
            expect(globalThis.alert).toHaveBeenCalledWith('Failed to save: disk full');
            expect(w.emitted('saved')).toBeUndefined();
            expect(w.emitted('close')).toBeUndefined();
            w.unmount();
        });
    });
});
