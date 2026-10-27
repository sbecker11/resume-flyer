import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/modules/composables/useJobsDependency.mjs', () => ({
    getGlobalJobsDependency: () => ({
        getSkillsData: () => mockSkillsData,
    }),
}));

let mockSkillsData = {};

const {
    isAbsoluteHttpUrl,
    resolveSkillInfoSourceUrl,
} = await import('./skillInfoModal.mjs');

describe('skillInfoModal source URL', () => {
    beforeEach(() => {
        mockSkillsData = {};
    });

    afterEach(() => {
        vi.unstubAllEnvs?.();
    });

    describe('isAbsoluteHttpUrl', () => {
        it('accepts http and https absolute URLs', () => {
            expect(isAbsoluteHttpUrl('https://en.wikipedia.org/wiki/CNN_(software)')).toBe(true);
            expect(isAbsoluteHttpUrl('http://example.com/path')).toBe(true);
        });

        it('rejects empty, relative, and non-http schemes', () => {
            expect(isAbsoluteHttpUrl('')).toBe(false);
            expect(isAbsoluteHttpUrl('   ')).toBe(false);
            expect(isAbsoluteHttpUrl(null)).toBe(false);
            expect(isAbsoluteHttpUrl('/wiki/CNN')).toBe(false);
            expect(isAbsoluteHttpUrl('ftp://example.com')).toBe(false);
            expect(isAbsoluteHttpUrl('not a url')).toBe(false);
        });
    });

    describe('resolveSkillInfoSourceUrl', () => {
        it('prefers a skill custom absolute http(s) url', () => {
            const skills = {
                cnn: { name: 'CNN', url: 'https://en.wikipedia.org/wiki/Convolutional_neural_network' },
            };
            expect(resolveSkillInfoSourceUrl('cnn', 'CNN', skills)).toBe(
                'https://en.wikipedia.org/wiki/Convolutional_neural_network'
            );
        });

        it('falls back to Wikipedia-from-name when url is empty', () => {
            const skills = { cnn: { name: 'CNN', url: '' } };
            const url = resolveSkillInfoSourceUrl('cnn', 'CNN', skills);
            expect(url).toContain('wikipedia');
            expect(url).toContain(encodeURIComponent('cnn'));
        });

        it('falls back when url is invalid / non-http', () => {
            const skills = { cnn: { name: 'CNN', url: 'javascript:alert(1)' } };
            const url = resolveSkillInfoSourceUrl('cnn', 'CNN', skills);
            expect(url).toContain('wikipedia');
            expect(url).not.toContain('javascript');
        });

        it('falls back when skill has no url field', () => {
            const skills = { pyspark: { name: 'PySpark' } };
            const url = resolveSkillInfoSourceUrl('pyspark', 'PySpark', skills);
            expect(url).toContain('wikipedia');
            expect(url).toContain(encodeURIComponent('pyspark'));
        });

        it('reads skills from jobs dependency when skillsData omitted', () => {
            mockSkillsData = {
                cnn: { name: 'CNN', url: 'https://example.com/cnn' },
            };
            expect(resolveSkillInfoSourceUrl('cnn', 'CNN')).toBe('https://example.com/cnn');
        });
    });
});
