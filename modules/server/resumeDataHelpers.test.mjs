import { describe, expect, it } from 'vitest';
import {
    mirrorCategoriesIntoSkills,
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

describe('mirrorCategoriesIntoSkills', () => {
    it('rewrites every skill.categoryIDs from the category lists, matching by key or display name', () => {
        const skills = {
            react: { name: 'React', categoryIDs: ['frontend', 'stale'] },
            aws: { name: 'AWS', categoryIDs: [] },
            python: { name: 'Python' },
            bare: null,
        };
        const categories = {
            frontend: { name: 'Frontend', skillIDs: ['React'] },
            cloud: ['aws'],
            empty: { name: 'Empty' },
        };
        expect(mirrorCategoriesIntoSkills(skills, categories)).toBe(2);
        expect(skills.react.categoryIDs).toEqual(['frontend']);
        expect(skills.aws.categoryIDs).toEqual(['cloud']);
        expect(skills.python).toEqual({ name: 'Python' });
    });

    it('removes memberships the categories no longer list and tolerates missing categories', () => {
        const skills = { react: { name: 'React', categoryIDs: ['frontend'] }, vue: { name: 'Vue', categoryIDs: ['frontend'] } };
        expect(mirrorCategoriesIntoSkills(skills, { frontend: { skillIDs: ['vue'] } })).toBe(1);
        expect(skills.react.categoryIDs).toEqual([]);
        expect(mirrorCategoriesIntoSkills(skills, null)).toBe(1);
        expect(skills.vue.categoryIDs).toEqual([]);
        expect(mirrorCategoriesIntoSkills(skills, null)).toBe(0);
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

    it('falls back to a case-insensitive match on key or name, so a retyped name cannot fork a skill', () => {
        const withKmeans = { ...skills, 'k-means': { name: 'K-means' } };
        expect(resolveSkillKey(withKmeans, 'K-Means')).toBe('k-means');
        expect(resolveSkillKey(withKmeans, 'K-MEANS')).toBe('k-means');
        expect(resolveSkillKey(withKmeans, 'EXPRESS.JS')).toBe('express-js');
        expect(resolveSkillKey(withKmeans, 'vue')).toBe('Vue');
    });

    it('still prefers an exact key when two skills differ only by case', () => {
        const pair = { ML: { name: 'ML' }, ml: { name: 'Machine Learning' } };
        expect(resolveSkillKey(pair, 'ML')).toBe('ML');
        expect(resolveSkillKey(pair, 'ml')).toBe('ml');
    });

    it('returns null for unknown, empty, or null-valued keys', () => {
        expect(resolveSkillKey(skills, 'Angular')).toBeNull();
        expect(resolveSkillKey(skills, '')).toBeNull();
        expect(resolveSkillKey(skills, '   ')).toBeNull();
        expect(resolveSkillKey(skills, 'bare')).toBeNull();
    });
});
