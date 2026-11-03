import { describe, expect, it } from 'vitest';
import {
    validateCategories,
    validateJobs,
    validateOtherSections,
    validateSkills,
} from './parsedResumeFormatValidator.mjs';

describe('validateJobs', () => {
    it('accepts the array and keyed-object shapes the parser emits', () => {
        expect(() => validateJobs([])).not.toThrow();
        expect(() => validateJobs([{ index: 0, role: 'Engineer' }])).not.toThrow();
        expect(() => validateJobs({ 0: { role: 'Engineer' } })).not.toThrow();
    });

    it('throws when jobs is missing or a primitive', () => {
        expect(() => validateJobs(null)).toThrow(/jobs is required/);
        expect(() => validateJobs(undefined)).toThrow(/jobs is required/);
        expect(() => validateJobs('jobs')).toThrow(/must be array or object; got string/);
        expect(() => validateJobs(3)).toThrow(/got number/);
    });
});

describe('validateSkills', () => {
    it('allows missing skills (server substitutes {}) and plain objects', () => {
        expect(() => validateSkills(undefined)).not.toThrow();
        expect(() => validateSkills(null)).not.toThrow();
        expect(() => validateSkills({})).not.toThrow();
        expect(() => validateSkills({ python: { name: 'Python' } })).not.toThrow();
    });

    it('rejects arrays and primitives', () => {
        expect(() => validateSkills([])).toThrow(/skills must be object; got array/);
        expect(() => validateSkills('python')).toThrow(/got string/);
    });
});

describe('validateCategories', () => {
    it('allows missing or object categories', () => {
        expect(() => validateCategories(undefined)).not.toThrow();
        expect(() => validateCategories({ frontend: { name: 'Frontend', skillIDs: [] } })).not.toThrow();
    });

    it('rejects arrays and primitives', () => {
        expect(() => validateCategories([])).toThrow(/categories must be object; got array/);
        expect(() => validateCategories(true)).toThrow(/got boolean/);
    });
});

describe('validateOtherSections', () => {
    it('allows missing sections and a fully populated object', () => {
        expect(() => validateOtherSections(undefined)).not.toThrow();
        expect(() => validateOtherSections({
            summary: 'Senior engineer',
            title: 'Senior Software Engineer',
            contact: { email: 'a@b.c' },
            certifications: [{ name: 'CSM' }],
            websites: [{ url: 'https://example.com' }],
            custom_sections: [],
        })).not.toThrow();
    });

    it('rejects a non-object container', () => {
        expect(() => validateOtherSections([])).toThrow(/otherSections must be object; got array/);
        expect(() => validateOtherSections('x')).toThrow(/got string/);
    });

    it('type-checks each known field', () => {
        expect(() => validateOtherSections({ summary: 1 })).toThrow(/summary must be string/);
        expect(() => validateOtherSections({ title: [] })).toThrow(/title must be string/);
        expect(() => validateOtherSections({ contact: null })).toThrow(/contact must be object/);
        expect(() => validateOtherSections({ contact: ['a'] })).toThrow(/contact must be object/);
        expect(() => validateOtherSections({ certifications: {} })).toThrow(/certifications must be array/);
        expect(() => validateOtherSections({ websites: 'x' })).toThrow(/websites must be array/);
        expect(() => validateOtherSections({ custom_sections: {} })).toThrow(/custom_sections must be array/);
    });
});
