import { describe, expect, it } from 'vitest';
import {
    validateCategories,
    validateEducationSkillIds,
    validateJobs,
    validateJobSkillIds,
    validateOtherSections,
    validateSkills,
} from './parsedResumeFormatValidator.mjs';

const SKILLS = {
    'vue-3': { name: 'Vue 3' },
    Bash: { name: 'Bash' },
    python: { name: 'Python' },
};

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

describe('validateJobSkillIds', () => {
    it('accepts exact keys (slug or self-named) in array and jobID-keyed jobs, and jobs without skillIDs', () => {
        expect(() => validateJobSkillIds([{ employer: 'Acme', skillIDs: ['vue-3', 'Bash'] }, { employer: 'Beta' }], SKILLS)).not.toThrow();
        expect(() => validateJobSkillIds({ 0: { employer: 'Acme', skillIDs: ['python'] }, 1: { skillIDs: [] } }, SKILLS)).not.toThrow();
        expect(() => validateJobSkillIds([], SKILLS)).not.toThrow();
        expect(() => validateJobSkillIds([{ skillIDs: [] }], undefined)).not.toThrow();
        expect(() => validateJobSkillIds([null, 'junk'], SKILLS)).not.toThrow();
    });

    it('rejects a display name, naming the job, the id, and the key to use instead', () => {
        const jobs = [{ employer: 'Acme', skillIDs: ['vue-3'] }, { employer: 'Gamma', skillIDs: ['python', 'Vue 3'] }];
        expect(() => validateJobSkillIds(jobs, SKILLS)).toThrow(
            '[ParsedResumeFormat] jobs[1] (Gamma).skillIDs[1] "Vue 3" is not an exact skills.json key; it resolves to key "vue-3" — replace it with that key',
        );
    });

    it('rejects case variants and padded keys the same way', () => {
        expect(() => validateJobSkillIds([{ role: 'Dev', skillIDs: ['bash'] }], SKILLS)).toThrow(
            'jobs[0] (Dev).skillIDs[0] "bash" is not an exact skills.json key; it resolves to key "Bash"',
        );
        expect(() => validateJobSkillIds({ 7: { skillIDs: [' python '] } }, SKILLS)).toThrow(
            'jobs["7"].skillIDs[0] " python " is not an exact skills.json key; it resolves to key "python"',
        );
    });

    it('rejects an id no skill has as key or name, telling the user to add or remove it', () => {
        expect(() => validateJobSkillIds([{ employer: 'Acme', skillIDs: ['python', 'Nope'] }], SKILLS)).toThrow(
            '[ParsedResumeFormat] jobs[0] (Acme).skillIDs[1] "Nope" is not an exact skills.json key; no skills entry has that key or name — add the skill to skills.json or remove the id',
        );
        expect(() => validateJobSkillIds([{ skillIDs: [''] }], SKILLS)).toThrow(/skillIDs\[0\] "" is not an exact skills.json key; no skills entry/);
        expect(() => validateJobSkillIds([{ skillIDs: [3] }], SKILLS)).toThrow(/skillIDs\[0\] 3 is not an exact skills.json key; no skills entry/);
        expect(() => validateJobSkillIds([{ skillIDs: ['python'] }], undefined)).toThrow(/"python" is not an exact skills.json key; no skills entry/);
    });

    it('rejects a non-array skillIDs field and still runs the shape checks first', () => {
        expect(() => validateJobSkillIds([{ employer: 'Acme', skillIDs: 'python' }], SKILLS)).toThrow(
            '[ParsedResumeFormat] jobs[0] (Acme).skillIDs must be array; got string',
        );
        expect(() => validateJobSkillIds([{ skillIDs: null }], SKILLS)).toThrow(/skillIDs must be array; got null/);
        expect(() => validateJobSkillIds(null, SKILLS)).toThrow(/jobs is required/);
        expect(() => validateJobSkillIds([], [])).toThrow(/skills must be object; got array/);
    });
});

describe('validateEducationSkillIds', () => {
    it('accepts a missing file, exact keys, and entries without skillIDs', () => {
        expect(() => validateEducationSkillIds(undefined, SKILLS)).not.toThrow();
        expect(() => validateEducationSkillIds(null, SKILLS)).not.toThrow();
        expect(() => validateEducationSkillIds({ phd: { institution: 'MIT', skillIDs: ['python'] }, bs: { degree: 'BS' } }, SKILLS)).not.toThrow();
        expect(() => validateEducationSkillIds([{ institution: 'BYU', skillIDs: ['Bash'] }], SKILLS)).not.toThrow();
    });

    it('rejects non-key ids using the education key and institution in the message', () => {
        expect(() => validateEducationSkillIds({ phd: { institution: 'MIT', skillIDs: ['Python'] } }, SKILLS)).toThrow(
            '[ParsedResumeFormat] education["phd"] (MIT).skillIDs[0] "Python" is not an exact skills.json key; it resolves to key "python" — replace it with that key',
        );
        expect(() => validateEducationSkillIds({ 0: { degree: 'BS', skillIDs: ['Rust'] } }, SKILLS)).toThrow(
            /education\["0"\] \(BS\)\.skillIDs\[0\] "Rust" is not an exact skills.json key; no skills entry/,
        );
    });

    it('rejects a primitive education value', () => {
        expect(() => validateEducationSkillIds('x', SKILLS)).toThrow(/education must be array or object; got string/);
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
