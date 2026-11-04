import { describe, expect, it } from 'vitest';
import {
    recomputeSkillJobIds,
    recordIndicesReferencingSkill,
    reindexSkillJobIdsAfterJobDelete,
    reindexSkillJobIdsAfterJobInsert,
    replaceSkillKeyInCategories,
    replaceSkillNameInDescriptions,
    resolveSkillKey,
    rewriteSkillIdInRecords,
    skillAliasSet,
    slugifyDisplayName,
    withDerivedMetaPaths,
} from './resumeDataHelpers.mjs';

describe('slugifyDisplayName', () => {
    it('lowercases, collapses punctuation runs, and trims edge hyphens', () => {
        expect(slugifyDisplayName('Shawn Becker — Full Résumé (indexed)')).toBe('shawn-becker-full-r-sum-indexed');
        expect(slugifyDisplayName('  --Already-slug--  ')).toBe('already-slug');
    });

    it('falls back to "resume" when nothing survives', () => {
        expect(slugifyDisplayName('')).toBe('resume');
        expect(slugifyDisplayName('—!!—')).toBe('resume');
        expect(slugifyDisplayName(null)).toBe('resume');
    });
});

describe('withDerivedMetaPaths', () => {
    it('attaches the resume folder path without mutating the input', () => {
        const meta = { displayName: 'Mine' };
        const out = withDerivedMetaPaths('/tmp/parsed', 'mine', meta);
        expect(out).toEqual({ displayName: 'Mine', parsedFolderPath: '/tmp/parsed/mine' });
        expect(meta).toEqual({ displayName: 'Mine' });
    });
});

describe('replaceSkillNameInDescriptions', () => {
    it('replaces every bracketed old name across array or object jobs and counts changed jobs', () => {
        const jobs = [
            { Description: '• [Vue 3] + [TypeScript] SPA; later [Vue 3] again.' },
            { Description: '• No match here.' },
            { Description: null },
            { Description: '• [Vue 3] alone' },
        ];
        expect(replaceSkillNameInDescriptions(jobs, 'Vue 3', 'Vue')).toBe(2);
        expect(jobs[0].Description).toBe('• [Vue] + [TypeScript] SPA; later [Vue] again.');
        expect(jobs[3].Description).toBe('• [Vue] alone');

        const keyed = { a: { Description: '[C++] and [C++]' } };
        expect(replaceSkillNameInDescriptions(keyed, 'C++', 'C plus plus')).toBe(1);
        expect(keyed.a.Description).toBe('[C plus plus] and [C plus plus]');
    });

    it('escapes regex metacharacters in the old name', () => {
        const jobs = [{ Description: '[DALL·E 3] and [Node.js] and [Nodexjs]' }];
        expect(replaceSkillNameInDescriptions(jobs, 'Node.js', 'Node')).toBe(1);
        expect(jobs[0].Description).toBe('[DALL·E 3] and [Node] and [Nodexjs]');
    });

    it('is a no-op for empty or identical names', () => {
        const jobs = [{ Description: '[X]' }];
        expect(replaceSkillNameInDescriptions(jobs, '', 'Y')).toBe(0);
        expect(replaceSkillNameInDescriptions(jobs, 'X', '')).toBe(0);
        expect(replaceSkillNameInDescriptions(jobs, 'X', 'X')).toBe(0);
        expect(jobs[0].Description).toBe('[X]');
    });

    it('also rewrites the lowercase description field used by education entries', () => {
        const education = { phd: { description: 'Thesis on [React 18].' }, ms: { description: 'none' } };
        expect(replaceSkillNameInDescriptions(education, 'React 18', 'React')).toBe(1);
        expect(education.phd.description).toBe('Thesis on [React].');
    });
});

describe('skillAliasSet', () => {
    it('collects trimmed, lowercased, non-empty ids', () => {
        expect([...skillAliasSet('react-18', ' React 18 ', '', null, 'react-18')]).toEqual(['react-18', 'react 18']);
    });
});

describe('rewriteSkillIdInRecords', () => {
    it('rewrites key, request key, and display-name references, dedupes, and counts changed records', () => {
        const jobs = [
            { skillIDs: ['vue', 'react-18', 'aws'] },
            { skillIDs: ['React 18', 'react'] },
            { skillIDs: ['python'] },
            { skillIDs: null },
            null,
        ];
        const aliases = skillAliasSet('react-18', 'React 18');
        expect(rewriteSkillIdInRecords(jobs, aliases, 'react')).toBe(2);
        expect(jobs[0].skillIDs).toEqual(['vue', 'react', 'aws']);
        expect(jobs[1].skillIDs).toEqual(['react']);
        expect(jobs[2].skillIDs).toEqual(['python']);
    });

    it('accepts id-keyed records and a plain string alias', () => {
        const education = { phd: { skillIDs: ['react-18'] } };
        expect(rewriteSkillIdInRecords(education, 'react-18', 'react')).toBe(1);
        expect(education.phd.skillIDs).toEqual(['react']);
        expect(rewriteSkillIdInRecords(undefined, 'x', 'y')).toBe(0);
    });

    it('leaves lists that never mention the skill untouched, duplicates included', () => {
        const ids = ['aws', 'aws'];
        const jobs = [{ skillIDs: ids }];
        expect(rewriteSkillIdInRecords(jobs, 'react-18', 'react')).toBe(0);
        expect(jobs[0].skillIDs).toBe(ids);
    });
});

describe('replaceSkillKeyInCategories', () => {
    it('swaps the retired key for the survivor in place, dedupes, and leaves other lists alone', () => {
        const categories = {
            frontend: { name: 'Frontend', skillIDs: ['vue', 'react-18', 'react'] },
            framework: { name: 'Framework', skillIDs: ['express', 'react-18'] },
            data: { name: 'Data', skillIDs: ['pyspark'] },
            bare: ['react-18', 'd3'],
        };
        expect(replaceSkillKeyInCategories(categories, 'react-18', 'react')).toBe(3);
        expect(categories.frontend.skillIDs).toEqual(['vue', 'react']);
        expect(categories.framework.skillIDs).toEqual(['express', 'react']);
        expect(categories.data.skillIDs).toEqual(['pyspark']);
        expect(categories.bare).toEqual(['react', 'd3']);
    });

    it('removes the key when no survivor is given and tolerates missing data', () => {
        const categories = { frontend: { skillIDs: ['react-18', 'vue'] }, odd: { name: 'no list' }, nil: null };
        expect(replaceSkillKeyInCategories(categories, ['react-18'], '')).toBe(1);
        expect(categories.frontend.skillIDs).toEqual(['vue']);
        expect(replaceSkillKeyInCategories(null, 'a', 'b')).toBe(0);
        expect(replaceSkillKeyInCategories({ x: { skillIDs: ['a'] } }, 'zzz', 'b')).toBe(0);
    });
});

describe('recordIndicesReferencingSkill', () => {
    it('returns ascending merged indices that list the skill by key or display name', () => {
        const merged = [
            { skillIDs: ['react'] },
            { skillIDs: ['aws'] },
            { skillIDs: ['React'] },
            {},
            { skillIDs: ['vue', 'react'] },
        ];
        expect(recordIndicesReferencingSkill(merged, skillAliasSet('react', 'React'))).toEqual([0, 2, 4]);
        expect(recordIndicesReferencingSkill([], 'react')).toEqual([]);
    });
});

describe('recomputeSkillJobIds', () => {
    it('unions existing ids with referencing indices, sorted and deduped, dropping junk', () => {
        const skill = { name: 'React', jobIDs: [5, '5', 'x', -1, 2.5] };
        const merged = [
            { skillIDs: ['react'] },
            { skillIDs: ['aws'] },
            { skillIDs: ['React'] },
        ];
        expect(recomputeSkillJobIds(skill, merged, skillAliasSet('react', 'React'))).toBe(skill);
        expect(skill.jobIDs).toEqual([0, 2, 5]);
    });

    it('starts from an empty list when jobIDs is missing and fails fast without a skill', () => {
        const skill = { name: 'AWS' };
        recomputeSkillJobIds(skill, [{ skillIDs: ['aws'] }], 'aws');
        expect(skill.jobIDs).toEqual([0]);
        expect(() => recomputeSkillJobIds(null, [], 'aws')).toThrow(/skill entry is required/);
    });
});

describe('reindexSkillJobIdsAfterJobInsert', () => {
    it('shifts ids at or after the insert point, dedupes, and sorts', () => {
        const skills = {
            a: { jobIDs: [0, 2, 5] },
            b: { jobIDs: ['3', 1] },
            c: { name: 'no ids' },
            d: null,
        };
        reindexSkillJobIdsAfterJobInsert(skills, 2);
        expect(skills.a.jobIDs).toEqual([0, 3, 6]);
        expect(skills.b.jobIDs).toEqual([1, 4]);
        expect(skills.c).toEqual({ name: 'no ids' });
    });

    it('ignores invalid insert positions', () => {
        const skills = { a: { jobIDs: [1, 2] } };
        reindexSkillJobIdsAfterJobInsert(skills, -1);
        reindexSkillJobIdsAfterJobInsert(skills, 'x');
        expect(skills.a.jobIDs).toEqual([1, 2]);
    });
});

describe('reindexSkillJobIdsAfterJobDelete', () => {
    it('drops the deleted index, decrements higher ids, dedupes, and sorts', () => {
        const skills = {
            a: { jobIDs: [0, 2, 3, 5] },
            b: { jobIDs: ['2'] },
            c: { jobIDs: [3, 2, 'nan'] },
        };
        reindexSkillJobIdsAfterJobDelete(skills, 2);
        expect(skills.a.jobIDs).toEqual([0, 2, 4]);
        expect(skills.b.jobIDs).toEqual([]);
        expect(skills.c.jobIDs).toEqual([2]);
    });

    it('ignores invalid delete positions', () => {
        const skills = { a: { jobIDs: [1, 2] } };
        reindexSkillJobIdsAfterJobDelete(skills, -3);
        reindexSkillJobIdsAfterJobDelete(skills, undefined);
        expect(skills.a.jobIDs).toEqual([1, 2]);
    });
});

describe('resolveSkillKey', () => {
    const skills = {
        'express-js': { name: 'Express.js' },
        Vue: { name: 'Vue' },
        bare: null,
    };

    it('prefers an exact key, then a trimmed display-name match', () => {
        expect(resolveSkillKey(skills, 'express-js')).toBe('express-js');
        expect(resolveSkillKey(skills, 'Express.js')).toBe('express-js');
        expect(resolveSkillKey(skills, '  Vue ')).toBe('Vue');
    });

    it('returns null for unknown, empty, or null-valued keys', () => {
        expect(resolveSkillKey(skills, 'Angular')).toBeNull();
        expect(resolveSkillKey(skills, '')).toBeNull();
        expect(resolveSkillKey(skills, '   ')).toBeNull();
        expect(resolveSkillKey(skills, 'bare')).toBeNull();
    });
});
