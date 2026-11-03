import { describe, expect, it } from 'vitest';
import {
    reindexSkillJobIdsAfterJobDelete,
    reindexSkillJobIdsAfterJobInsert,
    replaceSkillNameInDescriptions,
    resolveSkillKey,
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
