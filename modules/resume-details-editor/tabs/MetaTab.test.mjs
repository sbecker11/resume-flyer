import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import MetaTab from './MetaTab.vue';

const meta = () => ({
    id: 'shawn-2025',
    displayName: 'Shawn 2025',
    fileName: 'resume.docx',
    originalPath: '/tmp/resume.docx',
    parsedFolderPath: '/srv/parsed/shawn-2025',
    createdAt: '2026-10-01T12:00:00.000Z',
});

describe('MetaTab.vue', () => {
    it('renders editable fields from meta plus read-only folder, id and created date', () => {
        const w = mount(MetaTab, { props: { meta: meta() } });
        expect(w.get('#rde-meta-display-name').element.value).toBe('Shawn 2025');
        expect(w.get('#rde-meta-original-path').element.value).toBe('/tmp/resume.docx');
        expect(w.get('#rde-meta-file-name').element.value).toBe('resume.docx');
        const folder = w.get('#rde-meta-parsed-folder');
        expect(folder.element.value).toBe('/srv/parsed/shawn-2025');
        expect(folder.attributes('readonly')).toBeDefined();
        const readonly = w.findAll('.rde-readonly');
        expect(readonly).toHaveLength(2);
        expect(readonly[0].text()).toContain('shawn-2025');
        expect(readonly[1].text()).toContain(new Date('2026-10-01T12:00:00.000Z').toLocaleDateString());
    });

    it('omits id/created rows and shows the unavailable placeholder when meta is sparse', () => {
        const w = mount(MetaTab, { props: { meta: {} } });
        expect(w.findAll('.rde-readonly')).toHaveLength(0);
        expect(w.get('#rde-meta-parsed-folder').element.value).toBe('');
        expect(w.get('#rde-meta-parsed-folder').attributes('placeholder')).toMatch(/unavailable/);
        expect(w.get('#rde-meta-display-name').element.value).toBe('');
    });

    it('emits update:meta with the three editable fields as the user types', async () => {
        const w = mount(MetaTab, { props: { meta: meta() } });
        await w.get('#rde-meta-display-name').setValue('Renamed');
        await w.get('#rde-meta-file-name').setValue('new.pdf');
        const updates = w.emitted('update:meta');
        expect(updates.at(-1)).toEqual([{ displayName: 'Renamed', fileName: 'new.pdf', originalPath: '/tmp/resume.docx' }]);
        // Read-only fields are never part of the update payload.
        expect(Object.keys(updates.at(-1)[0]).sort()).toEqual(['displayName', 'fileName', 'originalPath']);
    });

    it('emits autosave on blur of each editable field only', async () => {
        const w = mount(MetaTab, { props: { meta: meta() } });
        await w.get('#rde-meta-display-name').trigger('blur');
        await w.get('#rde-meta-original-path').trigger('blur');
        await w.get('#rde-meta-file-name').trigger('blur');
        await w.get('#rde-meta-parsed-folder').trigger('blur');
        expect(w.emitted('autosave')).toHaveLength(3);
    });

    it('re-syncs local fields when the parent passes a new meta object', async () => {
        const w = mount(MetaTab, { props: { meta: meta() } });
        await w.get('#rde-meta-display-name').setValue('Dirty');
        await w.setProps({ meta: { ...meta(), displayName: 'From server', fileName: undefined } });
        await nextTick();
        expect(w.get('#rde-meta-display-name').element.value).toBe('From server');
        expect(w.get('#rde-meta-file-name').element.value).toBe('');
    });
});
