// modules/resume-details-editor/constants.test.mjs

import { describe, it, expect } from 'vitest';
import { DEFAULT_OTHER_SECTIONS, TAB_IDS } from './constants.mjs';

describe('resume-details-editor constants', () => {
    describe('DEFAULT_OTHER_SECTIONS', () => {
        it('has expected shape', () => {
            expect(DEFAULT_OTHER_SECTIONS).toHaveProperty('summary', '');
            expect(DEFAULT_OTHER_SECTIONS).toHaveProperty('title', '');
            expect(DEFAULT_OTHER_SECTIONS).toHaveProperty('contact');
            expect(DEFAULT_OTHER_SECTIONS.contact).toMatchObject({
                name: '',
                email: '',
                phone: '',
                location: '',
                linkedin: '',
                website: ''
            });
            expect(DEFAULT_OTHER_SECTIONS).toHaveProperty('certifications', []);
            expect(DEFAULT_OTHER_SECTIONS).toHaveProperty('websites', []);
            expect(DEFAULT_OTHER_SECTIONS).toHaveProperty('custom_sections', []);
        });

        it('is frozen', () => {
            expect(Object.isFrozen(DEFAULT_OTHER_SECTIONS)).toBe(true);
        });
    });

    describe('TAB_IDS', () => {
        it('has meta, other-sections, categories', () => {
            expect(TAB_IDS.META).toBe('meta');
            expect(TAB_IDS.OTHER_SECTIONS).toBe('other-sections');
            expect(TAB_IDS.CATEGORIES).toBe('categories');
        });
    });
});
