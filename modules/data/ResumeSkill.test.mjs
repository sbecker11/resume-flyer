import { describe, expect, it } from 'vitest';
import { skillsObjectToResumeSkills } from './ResumeSkill.mjs';

describe('skillsObjectToResumeSkills', () => {
    it('returns an empty map for null, undefined, or non-object input', () => {
        expect(skillsObjectToResumeSkills(null)).toEqual({});
        expect(skillsObjectToResumeSkills(undefined)).toEqual({});
        expect(skillsObjectToResumeSkills('nope')).toEqual({});
        expect(skillsObjectToResumeSkills(7)).toEqual({});
    });

    it('builds one ResumeSkill per key with id, name, url, img defaults', () => {
        const out = skillsObjectToResumeSkills({
            python: { name: 'Python', url: 'https://python.org', jobIDs: [1, 2] },
            'bare-key': {},
        });
        expect(Object.keys(out)).toEqual(['python', 'bare-key']);
        expect(out.python.id).toBe('python');
        expect(out.python.name).toBe('Python');
        expect(out.python.url).toBe('https://python.org');
        expect(out.python.img).toBe('');
        expect(out.python.jobIDs).toEqual([1, 2]);

        // Name falls back to the key; url/img default to ''.
        expect(out['bare-key'].name).toBe('bare-key');
        expect(out['bare-key'].url).toBe('');
        expect(out['bare-key'].img).toBe('');
    });

    it('tolerates non-object raw values by treating them as empty entries', () => {
        const out = skillsObjectToResumeSkills({ sql: null, aws: 'string', k8s: 3 });
        expect(out.sql.id).toBe('sql');
        expect(out.sql.name).toBe('sql');
        expect(out.aws.name).toBe('aws');
        expect(out.k8s.name).toBe('k8s');
    });

    it('coerces id, name, url, and img to strings and keeps the key as id even if data has one', () => {
        const out = skillsObjectToResumeSkills({ 12: { id: 'other', name: 99, url: null, img: 0 } });
        expect(out['12'].id).toBe('12');
        expect(out['12'].name).toBe('99');
        // null url means "not provided" and falls back to ''.
        expect(out['12'].url).toBe('');
        expect(out['12'].img).toBe('0');
    });

    it('returns the same instance from fromPlain when given a ResumeSkill', () => {
        const first = skillsObjectToResumeSkills({ java: { name: 'Java' } });
        const second = skillsObjectToResumeSkills(first);
        expect(second.java).toBe(first.java);
    });

    it('round-trips through toPlainObject with extra fields preserved', () => {
        const out = skillsObjectToResumeSkills({
            vue: { name: 'Vue', url: 'https://vuejs.org/', categoryIDs: ['frontend'], jobIDs: [2] },
        });
        expect(out.vue.toPlainObject()).toEqual({
            id: 'vue',
            name: 'Vue',
            url: 'https://vuejs.org/',
            img: '',
            categoryIDs: ['frontend'],
            jobIDs: [2],
        });
    });
});
