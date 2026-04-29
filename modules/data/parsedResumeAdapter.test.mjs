// modules/data/parsedResumeAdapter.test.mjs
// Unit tests for parser output normalization

import { describe, it, expect } from 'vitest';
import { normalizeParserJobs, normalizeParserSkills, normalizeParserCategories } from './parsedResumeAdapter.mjs';

describe('parsedResumeAdapter', () => {
    describe('normalizeParserJobs', () => {
        it('should return arrays unchanged', () => {
            const jobs = [
                { title: 'Engineer', company: 'ACME' },
                { title: 'Manager', company: 'Corp' }
            ];
            expect(normalizeParserJobs(jobs)).toEqual(jobs);
        });

        it('should convert object with numeric keys to sorted array', () => {
            const jobs = {
                '2': { title: 'Second Job' },
                '1': { title: 'First Job' },
                '3': { title: 'Third Job' }
            };

            const result = normalizeParserJobs(jobs);

            expect(result).toHaveLength(3);
            expect(result[0]).toEqual({ title: 'First Job', jobID: '1' });
            expect(result[1]).toEqual({ title: 'Second Job', jobID: '2' });
            expect(result[2]).toEqual({ title: 'Third Job', jobID: '3' });
        });

        it('should convert object with string keys using localeCompare', () => {
            const jobs = {
                'job-c': { title: 'Job C' },
                'job-a': { title: 'Job A' },
                'job-b': { title: 'Job B' }
            };

            const result = normalizeParserJobs(jobs);

            expect(result).toHaveLength(3);
            expect(result[0].jobID).toBe('job-a');
            expect(result[1].jobID).toBe('job-b');
            expect(result[2].jobID).toBe('job-c');
        });

        it('should handle mixed numeric and string keys', () => {
            const jobs = {
                '10': { title: 'Numeric 10' },
                'abc': { title: 'String abc' },
                '2': { title: 'Numeric 2' }
            };

            const result = normalizeParserJobs(jobs);

            expect(result).toHaveLength(3);
            // Numeric keys should sort numerically: 2, 10, then string key
            expect(result[0].jobID).toBe('2');
            expect(result[1].jobID).toBe('10');
        });

        it('should return empty array for null', () => {
            expect(normalizeParserJobs(null)).toEqual([]);
        });

        it('should return empty array for undefined', () => {
            expect(normalizeParserJobs(undefined)).toEqual([]);
        });

        it('should return empty array for non-object types', () => {
            expect(normalizeParserJobs('not an object')).toEqual([]);
            expect(normalizeParserJobs(123)).toEqual([]);
            expect(normalizeParserJobs(true)).toEqual([]);
        });

        it('should preserve existing properties when adding jobID', () => {
            const jobs = {
                '1': { title: 'Engineer', salary: 100000, benefits: ['health', 'dental'] }
            };

            const result = normalizeParserJobs(jobs);

            expect(result[0]).toEqual({
                title: 'Engineer',
                salary: 100000,
                benefits: ['health', 'dental'],
                jobID: '1'
            });
        });
    });

    describe('normalizeParserSkills', () => {
        it('should return empty object for null', () => {
            expect(normalizeParserSkills(null)).toEqual({});
        });

        it('should return empty object for undefined', () => {
            expect(normalizeParserSkills(undefined)).toEqual({});
        });

        it('should return empty object for non-object types', () => {
            expect(normalizeParserSkills('string')).toEqual({});
            expect(normalizeParserSkills(123)).toEqual({});
        });

        it('should handle legacy format (name-keyed)', () => {
            const skills = {
                'JavaScript': { url: 'https://js.org', img: 'js.png' },
                'Python': { url: 'https://python.org', img: 'py.png' }
            };

            const result = normalizeParserSkills(skills);

            expect(result).toEqual(skills);
        });

        it('should preserve slug-keyed maps with name property as canonical', () => {
            const skills = {
                'skill-1': { name: 'JavaScript', url: 'https://js.org', img: 'js.png' },
                'skill-2': { name: 'Python', url: 'https://python.org' }
            };

            const result = normalizeParserSkills(skills);

            expect(result).toEqual(skills);
        });

        it('should preserve keys even when skill names contain whitespace', () => {
            const skills = {
                'skill-1': { name: '  JavaScript  ', url: 'https://js.org' },
                'skill-2': { name: '\tPython\n' }
            };

            const result = normalizeParserSkills(skills);

            expect(result).toHaveProperty('skill-1');
            expect(result).toHaveProperty('skill-2');
        });

        it('should preserve slug keys even when names are empty', () => {
            const skills = {
                'skill-1': { name: '   ', url: 'https://example.com' },
                'skill-2': { name: 'JavaScript', url: 'https://js.org' }
            };

            const result = normalizeParserSkills(skills);

            expect(Object.keys(result)).toEqual(['skill-1', 'skill-2']);
        });

        it('should treat skills without name property as legacy format', () => {
            const skills = {
                'skill-1': { url: 'https://example.com' },
                'skill-2': { name: 'JavaScript' }
            };

            const result = normalizeParserSkills(skills);

            // First skill has no 'name', so treated as legacy format (returned as-is)
            expect(result).toEqual(skills);
        });

        it('should convert parser-style ID keys (non-slug) to name-keyed entries', () => {
            const skills = {
                'SkillID-1': { name: 'JavaScript', url: 'https://js.org', img: 'js.png' },
                'SkillID-2': { name: 'Python', url: 'https://python.org' },
                'SkillID-3': { name: '   ' }
            };

            const result = normalizeParserSkills(skills);

            expect(result).toEqual({
                JavaScript: { url: 'https://js.org', img: 'js.png' },
                Python: { url: 'https://python.org', img: undefined }
            });
        });

        it('should preserve duplicate names when keys differ', () => {
            const skills = {
                'skill-1': { name: 'JavaScript', url: 'https://first.com' },
                'skill-2': { name: 'JavaScript', url: 'https://second.com' }
            };

            const result = normalizeParserSkills(skills);

            expect(result['skill-1'].url).toBe('https://first.com');
            expect(result['skill-2'].url).toBe('https://second.com');
        });

        it('should handle empty skills object', () => {
            expect(normalizeParserSkills({})).toEqual({});
        });

        it('should handle skills with no url or img', () => {
            const skills = {
                'skill-1': { name: 'JavaScript' }
            };

            const result = normalizeParserSkills(skills);

            expect(result).toEqual(skills);
        });
    });

    describe('normalizeParserCategories', () => {
        it('should return empty object for null', () => {
            expect(normalizeParserCategories(null)).toEqual({});
        });

        it('should return empty object for undefined', () => {
            expect(normalizeParserCategories(undefined)).toEqual({});
        });

        it('should return empty object for non-object types', () => {
            expect(normalizeParserCategories('string')).toEqual({});
            expect(normalizeParserCategories(123)).toEqual({});
            expect(normalizeParserCategories(true)).toEqual({});
        });

        it('should return categories object unchanged', () => {
            const categories = {
                'cat-1': { name: 'Frontend', skillIDs: ['skill-1', 'skill-2'] },
                'cat-2': { name: 'Backend', skillIDs: ['skill-3'] }
            };

            const result = normalizeParserCategories(categories);

            expect(result).toEqual(categories);
        });

        it('should handle categories without skillIDs', () => {
            const categories = {
                'cat-1': { name: 'General' }
            };

            const result = normalizeParserCategories(categories);

            expect(result).toEqual(categories);
        });

        it('should handle empty categories object', () => {
            expect(normalizeParserCategories({})).toEqual({});
        });
    });
});
