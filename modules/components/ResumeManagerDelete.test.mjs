import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

const api = {
    listResumes: vi.fn(),
    deleteResume: vi.fn(),
    reparseResume: vi.fn(),
    getResumeHasLocalChanges: vi.fn(),
};
vi.mock('../api/resumeManagerApi.mjs', () => api);
let serverAvailable = true;
vi.mock('@/modules/core/hasServer.mjs', () => ({ hasServer: () => serverAvailable }));
const reportError = vi.fn();
vi.mock('@/modules/utils/errorReporting.mjs', () => ({ reportError }));

const { default: ResumeManagerDelete } = await import('./ResumeManagerDelete.vue');

const resumes = () => [
    { id: 'default', displayName: 'Default' },
    { id: 'alpha', displayName: 'Alpha Résumé' },
    { id: 'beta', displayName: '' },
];

/** Mount closed, then open so the isOpen watcher loads the list. Teleport renders into document.body. */
async function openManager(props = {}) {
    const w = mount(ResumeManagerDelete, {
        props: { isOpen: false, currentResumeId: 'default', ...props },
        global: { stubs: { Teleport: true, Transition: false } },
    });
    await w.setProps({ isOpen: true });
    await flushPromises();
    return w;
}

const rowFor = (w, id) => w.findAll('li.resume-row').find((li) => li.get('.resume-id').text() === id);

beforeEach(() => {
    serverAvailable = true;
    Object.values(api).forEach((fn) => fn.mockReset());
    api.listResumes.mockResolvedValue(resumes());
    api.deleteResume.mockResolvedValue({ success: true });
    api.reparseResume.mockResolvedValue({ success: true });
    api.getResumeHasLocalChanges.mockResolvedValue({ hasLocalChanges: false });
    reportError.mockClear();
});
afterEach(() => { document.body.innerHTML = ''; });

describe('ResumeManagerDelete.vue', () => {
    it('loads the list when opened, marks the active resume, and falls back to the id as a name', async () => {
        const w = await openManager();
        expect(api.listResumes).toHaveBeenCalledTimes(1);
        const rows = w.findAll('li.resume-row');
        expect(rows).toHaveLength(3);
        expect(rowFor(w, 'default').classes()).toContain('is-current');
        expect(rowFor(w, 'default').find('.active-badge').exists()).toBe(true);
        expect(rowFor(w, 'beta').get('.resume-name').text()).toBe('beta');
        expect(w.get('.btn-save').attributes('disabled')).toBeDefined();
        expect(w.get('.btn-reparse').attributes('disabled')).toBeDefined();
    });

    it('shows load errors and the empty state', async () => {
        api.listResumes.mockRejectedValueOnce(new Error('boom'));
        const w = await openManager();
        expect(w.get('.error-message').text()).toBe('boom');

        api.listResumes.mockResolvedValueOnce([]);
        const w2 = await openManager();
        expect(w2.get('.empty-state').text()).toContain('No parsed resumes found.');
    });

    it('selecting another resume enables Save and emits selected + close on save', async () => {
        const w = await openManager();
        await rowFor(w, 'alpha').trigger('click');
        expect(rowFor(w, 'alpha').classes()).toContain('is-selected');
        expect(w.get('.btn-save').attributes('disabled')).toBeUndefined();
        expect(w.get('.btn-reparse').attributes('disabled')).toBeUndefined();

        await w.get('.btn-save').trigger('click');
        await flushPromises();
        expect(api.deleteResume).not.toHaveBeenCalled();
        expect(w.emitted('selected')).toEqual([['alpha']]);
        expect(w.emitted('close')).toHaveLength(1);
        expect(w.emitted('deleted')).toBeUndefined();
    });

    it('double-click opens a resume immediately; Cancel and the × just close', async () => {
        const w = await openManager();
        await rowFor(w, 'alpha').trigger('dblclick');
        expect(w.emitted('selected')).toEqual([['alpha']]);
        expect(w.emitted('close')).toHaveLength(1);
        await w.get('.btn-cancel').trigger('click');
        await w.get('.close-button').trigger('click');
        expect(w.emitted('close')).toHaveLength(3);
    });

    it('delete flow: confirm dialog → immediate delete → row removed and deleted emitted', async () => {
        const w = await openManager();
        await rowFor(w, 'alpha').get('.delete-toggle').trigger('click');
        expect(w.get('.confirm-dialog .confirm-message').text()).toBe('Delete Alpha Résumé?');

        await w.get('.confirm-dialog .btn-cancel').trigger('click');
        expect(w.find('.confirm-dialog').exists()).toBe(false);
        expect(api.deleteResume).not.toHaveBeenCalled();

        await rowFor(w, 'alpha').get('.delete-toggle').trigger('click');
        await w.get('.btn-confirm-delete').trigger('click');
        await flushPromises();
        expect(api.deleteResume).toHaveBeenCalledWith('alpha');
        expect(rowFor(w, 'alpha')).toBeUndefined();
        expect(w.emitted('deleted')).toEqual([[['alpha']]]);
    });

    it('surfaces a failed delete instead of removing the row', async () => {
        api.deleteResume.mockRejectedValueOnce(new Error('locked'));
        const w = await openManager();
        await rowFor(w, 'alpha').get('.delete-toggle').trigger('click');
        await w.get('.btn-confirm-delete').trigger('click');
        await flushPromises();
        expect(w.get('.error-message').text()).toBe('Delete failed: locked');
        expect(w.emitted('deleted')).toBeUndefined();
    });

    it('reparse runs directly when there are no local changes and refreshes the list', async () => {
        const w = await openManager();
        await rowFor(w, 'alpha').trigger('click');
        await w.get('.btn-reparse').trigger('click');
        await flushPromises();
        expect(api.getResumeHasLocalChanges).toHaveBeenCalledWith('alpha');
        expect(api.reparseResume).toHaveBeenCalledWith('alpha');
        expect(api.listResumes).toHaveBeenCalledTimes(2);
        expect(w.emitted('reparsed')).toEqual([['alpha']]);
        expect(w.find('.confirm-dialog').exists()).toBe(false);
    });

    it('reparse asks for confirmation when local edits exist, and when the check itself fails', async () => {
        api.getResumeHasLocalChanges.mockResolvedValueOnce({ hasLocalChanges: true });
        const w = await openManager();
        await rowFor(w, 'alpha').trigger('click');
        await w.get('.btn-reparse').trigger('click');
        await flushPromises();
        expect(api.reparseResume).not.toHaveBeenCalled();
        expect(w.get('.confirm-dialog-wide .confirm-message').text()).toBe('Reparse Alpha Résumé?');
        await w.get('.btn-confirm-reparse').trigger('click');
        await flushPromises();
        expect(api.reparseResume).toHaveBeenCalledWith('alpha');
        expect(w.emitted('reparsed')).toEqual([['alpha']]);

        api.getResumeHasLocalChanges.mockRejectedValueOnce(new Error('offline'));
        await w.get('.btn-reparse').trigger('click');
        await flushPromises();
        expect(reportError).toHaveBeenCalledWith(
            expect.any(Error),
            '[ResumeManager] Failed to check for local changes before reparse',
            'Proceeding to confirmation dialog as a safe fallback',
        );
        expect(w.find('.confirm-dialog-wide').exists()).toBe(true);
    });

    it('reports and displays a reparse failure', async () => {
        api.reparseResume.mockRejectedValueOnce(new Error('parser crashed'));
        const w = await openManager();
        await rowFor(w, 'alpha').trigger('click');
        await w.get('.btn-reparse').trigger('click');
        await flushPromises();
        expect(reportError).toHaveBeenCalledWith(expect.any(Error), '[ResumeManager] Reparse failed');
        expect(w.get('.error-message').text()).toBe('Reparse failed: parser crashed');
        expect(w.emitted('reparsed')).toBeUndefined();
    });

    it('the default resume cannot be reparsed and Upload New emits open-upload', async () => {
        const w = await openManager();
        await rowFor(w, 'default').trigger('click');
        expect(w.get('.btn-reparse').attributes('disabled')).toBeDefined();
        await w.get('.btn-upload').trigger('click');
        expect(w.emitted('open-upload')).toHaveLength(1);
    });

    it('is read-only without a server: delete, upload and save are disabled', async () => {
        serverAvailable = false;
        vi.resetModules();
        const { default: StaticManager } = await import('./ResumeManagerDelete.vue');
        const w = mount(StaticManager, {
            props: { isOpen: false, currentResumeId: 'default' },
            global: { stubs: { Teleport: true, Transition: false } },
        });
        await w.setProps({ isOpen: true });
        await flushPromises();
        expect(rowFor(w, 'alpha').get('.delete-toggle').attributes('disabled')).toBeDefined();
        expect(w.get('.btn-upload').attributes('disabled')).toBeDefined();
        await rowFor(w, 'alpha').trigger('click');
        expect(w.get('.btn-save').attributes('disabled')).toBeDefined();
        expect(w.get('.btn-reparse').attributes('disabled')).toBeDefined();
    });
});
