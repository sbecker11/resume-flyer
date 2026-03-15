/**
 * Format conformance tests: verify parsed resume data meets docs/PARSED-RESUME-FORMAT.md.
 * FAIL FAST: invalid format must throw.
 */
import { describe, it, expect } from 'vitest';
import {
  validateJobs,
  validateSkills,
  validateCategories,
  validateOtherSections
} from './parsedResumeFormatValidator.mjs';
import { parseMjsExport } from './parseMjsExport.mjs';
import { normalizeParserJobs, normalizeParserSkills, normalizeParserCategories } from './parsedResumeAdapter.mjs';
import {
  FIXTURE_JOBS_MJS,
  FIXTURE_SKILLS_MJS,
  FIXTURE_CATEGORIES_MJS,
  FIXTURE_OTHER_SECTIONS_MJS,
  FIXTURE_JOBS_PARSED,
  FIXTURE_SKILLS_PARSED,
  FIXTURE_CATEGORIES_PARSED,
  FIXTURE_OTHER_SECTIONS_PARSED
} from './parsedResumeFormatFixtures.mjs';

describe('parsedResumeFormat (PARSED-RESUME-FORMAT conformance)', () => {
  describe('validator - spec-compliant fixtures pass', () => {
    it('accepts valid jobs (object keyed by jobID)', () => {
      expect(() => validateJobs(FIXTURE_JOBS_PARSED)).not.toThrow();
    });

    it('accepts valid jobs (array legacy format)', () => {
      const legacy = [{ index: 0, role: 'Dev', employer: 'Acme', start: '2020', end: '2022', Description: '' }];
      expect(() => validateJobs(legacy)).not.toThrow();
    });

    it('accepts valid skills object', () => {
      expect(() => validateSkills(FIXTURE_SKILLS_PARSED)).not.toThrow();
    });

    it('accepts empty skills object', () => {
      expect(() => validateSkills({})).not.toThrow();
    });

    it('accepts null/undefined skills (optional)', () => {
      expect(() => validateSkills(null)).not.toThrow();
      expect(() => validateSkills(undefined)).not.toThrow();
    });

    it('accepts valid categories object', () => {
      expect(() => validateCategories(FIXTURE_CATEGORIES_PARSED)).not.toThrow();
    });

    it('accepts empty categories', () => {
      expect(() => validateCategories({})).not.toThrow();
    });

    it('accepts valid otherSections object', () => {
      expect(() => validateOtherSections(FIXTURE_OTHER_SECTIONS_PARSED)).not.toThrow();
    });

    it('accepts empty otherSections', () => {
      expect(() => validateOtherSections({})).not.toThrow();
    });
  });

  describe('validator - fail fast on invalid format', () => {
    it('throws on null jobs', () => {
      expect(() => validateJobs(null)).toThrow('[ParsedResumeFormat] jobs is required');
    });

    it('throws on undefined jobs', () => {
      expect(() => validateJobs(undefined)).toThrow('[ParsedResumeFormat] jobs is required');
    });

    it('throws when jobs is string', () => {
      expect(() => validateJobs('not jobs')).toThrow('[ParsedResumeFormat] jobs must be array or object');
    });

    it('throws when jobs is number', () => {
      expect(() => validateJobs(42)).toThrow('[ParsedResumeFormat] jobs must be array or object');
    });

    it('throws when skills is array', () => {
      expect(() => validateSkills([])).toThrow('[ParsedResumeFormat] skills must be object');
    });

    it('throws when skills is string', () => {
      expect(() => validateSkills('skills')).toThrow('[ParsedResumeFormat] skills must be object');
    });

    it('throws when categories is array', () => {
      expect(() => validateCategories([])).toThrow('[ParsedResumeFormat] categories must be object');
    });

    it('throws when otherSections.websites is not array', () => {
      expect(() => validateOtherSections({ websites: 'not-array' })).toThrow('otherSections.websites must be array');
    });

    it('throws when otherSections.custom_sections is not array', () => {
      expect(() => validateOtherSections({ custom_sections: {} })).toThrow('otherSections.custom_sections must be array');
    });
  });

  describe('parseMjsExport + fixtures', () => {
    it('parses canonical jobs.mjs content', () => {
      const jobs = parseMjsExport(FIXTURE_JOBS_MJS, 'jobs');
      expect(jobs).toEqual(FIXTURE_JOBS_PARSED);
      expect(() => validateJobs(jobs)).not.toThrow();
    });

    it('parses canonical skills.mjs content', () => {
      const skills = parseMjsExport(FIXTURE_SKILLS_MJS, 'skills');
      expect(skills).toEqual(FIXTURE_SKILLS_PARSED);
      expect(() => validateSkills(skills)).not.toThrow();
    });

    it('parses canonical categories.mjs content', () => {
      const categories = parseMjsExport(FIXTURE_CATEGORIES_MJS, 'categories');
      expect(categories).toEqual(FIXTURE_CATEGORIES_PARSED);
      expect(() => validateCategories(categories)).not.toThrow();
    });

    it('parses canonical other-sections.mjs content', () => {
      const other = parseMjsExport(FIXTURE_OTHER_SECTIONS_MJS, 'otherSections');
      expect(other).toEqual(FIXTURE_OTHER_SECTIONS_PARSED);
      expect(() => validateOtherSections(other)).not.toThrow();
    });
  });

  describe('full pipeline: parse → validate → normalize', () => {
    it('jobs pipeline succeeds with spec-compliant fixture', () => {
      const raw = parseMjsExport(FIXTURE_JOBS_MJS, 'jobs');
      validateJobs(raw);
      const jobs = normalizeParserJobs(raw);
      expect(jobs).toHaveLength(2);
      expect(jobs[0]).toHaveProperty('jobID', '0');
      expect(jobs[0]).toHaveProperty('role', 'Engineer');
    });

    it('skills pipeline succeeds with spec-compliant fixture', () => {
      const raw = parseMjsExport(FIXTURE_SKILLS_MJS, 'skills');
      validateSkills(raw);
      const skills = normalizeParserSkills(raw);
      expect(skills).toHaveProperty('Python');
      expect(skills).toHaveProperty('AWS');
    });

    it('categories pipeline succeeds with spec-compliant fixture', () => {
      const raw = parseMjsExport(FIXTURE_CATEGORIES_MJS, 'categories');
      validateCategories(raw);
      const categories = normalizeParserCategories(raw);
      expect(categories).toHaveProperty('cloud');
    });
  });
});
