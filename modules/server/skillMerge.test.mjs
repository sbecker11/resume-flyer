import { describe, expect, it } from 'vitest';
import { mergeSkillEntryInto, pickMergedSkillUrl } from './skillMerge.mjs';

describe('pickMergedSkillUrl', () => {
    it('keeps the only manually defined URL, whichever side it is on', () => {
        expect(pickMergedSkillUrl('https://vuejs.org/', '')).toBe('https://vuejs.org/');
        expect(pickMergedSkillUrl(undefined, 'https://vuejs.org/')).toBe('https://vuejs.org/');
        expect(pickMergedSkillUrl('  https://vuejs.org/  ', null)).toBe('https://vuejs.org/');
    });

    it('keeps the shortest URL when both skills define one', () => {
        expect(pickMergedSkillUrl('https://expressjs.com/', 'https://expressjs.com/en/starter/installing.html'))
            .toBe('https://expressjs.com/');
        expect(pickMergedSkillUrl('https://mlflow.org/docs/latest/index.html', 'https://mlflow.org/'))
            .toBe('https://mlflow.org/');
    });

    it('keeps the target URL on a length tie', () => {
        expect(pickMergedSkillUrl('https://a.example/', 'https://b.example/')).toBe('https://b.example/');
    });

    it('returns empty when neither skill has a URL', () => {
        expect(pickMergedSkillUrl('', '')).toBe('');
        expect(pickMergedSkillUrl(null, undefined)).toBe('');
    });
});

describe('mergeSkillEntryInto', () => {
    it('unions jobIDs with the target order first and carries the URL over', () => {
        const from = { name: 'Vue 3', url: 'https://vuejs.org/', jobIDs: [16] };
        const to = { name: 'Vue', jobIDs: [2] };
        const result = mergeSkillEntryInto(from, to);
        expect(result).toBe(to);
        expect(to.jobIDs).toEqual([2, 16]);
        expect(to.url).toBe('https://vuejs.org/');
    });

    it('does not add a url field when neither side has one', () => {
        const to = { name: 'Express.js', jobIDs: [] };
        mergeSkillEntryInto({ name: 'Express', jobIDs: [1, 2] }, to);
        expect(to).toEqual({ name: 'Express.js', jobIDs: [1, 2] });
    });

    it('tolerates a source with no jobIDs and dedupes shared ids', () => {
        const to = { name: 'MLflow', url: 'https://mlflow.org/', jobIDs: [8] };
        mergeSkillEntryInto({ name: 'MLFlow', jobIDs: [8] }, to);
        expect(to.jobIDs).toEqual([8]);
        mergeSkillEntryInto({ name: 'MLFlow' }, to);
        expect(to.jobIDs).toEqual([8]);
        expect(to.url).toBe('https://mlflow.org/');
    });

    it('fails fast without a target entry', () => {
        expect(() => mergeSkillEntryInto({ jobIDs: [1] }, null)).toThrow(/target skill entry/);
    });
});
