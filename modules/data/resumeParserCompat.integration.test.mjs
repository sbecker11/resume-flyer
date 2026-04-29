/**
 * Integration tests: resume-flyer compatibility with resume-parser output.
 * Parser may produce legacy (jobs array, skills name-keyed) or new format (jobs/skills/categories dicts by ID).
 * Server normalizes via parsedResumeAdapter; these tests ensure parseMjsExport + adapter + enrichJobsWithSkills work.
 */
import { describe, it, expect } from 'vitest';
import { parseMjsExport } from './parseMjsExport.mjs';
import { enrichJobsWithSkills } from './enrichedJobs.mjs';
import { normalizeParserJobs, normalizeParserSkills } from './parsedResumeAdapter.mjs';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../..');

describe('resume-parser compatibility (integration)', () => {
  describe('parseMjsExport + enrichJobsWithSkills pipeline (legacy format)', () => {
    it('parses and enriches parser-format jobs and skills (inline fixture)', () => {
      const jobsContent = 'export const jobs = [{"index":0,"role":"Engineer","employer":"Acme","start":"2020-01-01","end":"2022-01-01","Description":"Built with [Python] and [AWS]."}];';
      const skillsContent = 'export const skills = {"Python":{"url":"https://python.org","img":""},"AWS":{"url":"https://aws.amazon.com","img":""}};';
      const rawJobs = parseMjsExport(jobsContent, 'jobs');
      const skills = parseMjsExport(skillsContent, 'skills');
      expect(Array.isArray(rawJobs)).toBe(true);
      expect(rawJobs[0]).toHaveProperty('index');
      expect(rawJobs[0]).toHaveProperty('Description');
      expect(typeof skills).toBe('object');
      expect(skills.Python).toHaveProperty('url');

      const enriched = enrichJobsWithSkills(rawJobs, skills);
      expect(enriched).toHaveLength(1);
      expect(enriched[0].references).toHaveLength(2);
      expect(enriched[0]['job-skills']).toHaveProperty('Python');
      expect(enriched[0]['job-skills']).toHaveProperty('AWS');
    });

    it('handles empty jobs array from parser', () => {
      const jobsContent = 'export const jobs = [];';
      const skillsContent = 'export const skills = {};';
      const rawJobs = parseMjsExport(jobsContent, 'jobs');
      const skills = parseMjsExport(skillsContent, 'skills');
      const enriched = enrichJobsWithSkills(rawJobs, skills);
      expect(enriched).toEqual([]);
    });
  });

  describe('adapter + enrich (new parser format: jobID/skillID dicts)', () => {
    it('normalizes jobID-keyed jobs and skillID-keyed skills then enriches', () => {
      const rawJobs = {
        0: { role: 'Engineer', employer: 'Acme', start: '2020-01-01', end: '2022-01-01', Description: 'Built with [Python] and [AWS].' },
        1: { role: 'Lead', employer: 'Beta', start: '2022-01-01', end: null, Description: 'Used [Python].' }
      };
      const rawSkills = {
        'python': { name: 'Python', url: 'https://python.org', img: '' },
        'aws': { name: 'AWS', url: 'https://aws.amazon.com', img: '', categoryIDs: ['cloud'], jobIDs: [0, 1] }
      };
      const jobs = normalizeParserJobs(rawJobs);
      const skills = normalizeParserSkills(rawSkills);
      expect(Array.isArray(jobs)).toBe(true);
      expect(jobs).toHaveLength(2);
      expect(jobs[0].jobID).toBe('0');
      expect(jobs[1].jobID).toBe('1');
      expect(skills.python).toEqual({ name: 'Python', url: 'https://python.org', img: '' });
      expect(skills.aws).toEqual({ name: 'AWS', url: 'https://aws.amazon.com', img: '', categoryIDs: ['cloud'], jobIDs: [0, 1] });

      const enriched = enrichJobsWithSkills(jobs, skills);
      expect(enriched).toHaveLength(2);
      expect(enriched[0].references).toHaveLength(2);
      expect(enriched[0]['job-skills']).toHaveProperty('python');
      expect(enriched[0]['job-skills']).toHaveProperty('aws');
      expect(enriched[1].references).toHaveLength(1);
      expect(enriched[1]['job-skills']).toHaveProperty('python');
    });
  });

  describe('parsed_resumes format (when default available)', () => {
    const parsedDir = path.join(PROJECT_ROOT, 'parsed_resumes');
    const indexPath = path.join(parsedDir, 'non-local-resumes.json');

    it('reads and parses default parsed_resumes jobs.json and skills.json when present', async () => {
      let index, jobsContent, skillsContent;
      try {
        index = JSON.parse(await fs.readFile(indexPath, 'utf-8'));
        const defaultId = index.defaultResumeId;
        if (!defaultId) return; // skip when no default
        const dir = path.join(parsedDir, defaultId);
        jobsContent = await fs.readFile(path.join(dir, 'jobs.json'), 'utf-8');
        skillsContent = await fs.readFile(path.join(dir, 'skills.json'), 'utf-8');
      } catch (e) {
        if (e.code === 'ENOENT') return; // skip when not in repo or path not available
        throw e;
      }
      const rawJobs = JSON.parse(jobsContent);
      const rawSkills = JSON.parse(skillsContent);
      const jobs = normalizeParserJobs(rawJobs);
      const skills = normalizeParserSkills(rawSkills);
      expect(Array.isArray(jobs)).toBe(true);
      expect(jobs.length).toBeGreaterThan(0);
      expect(jobs[0]).toHaveProperty('role');
      expect(jobs[0]).toHaveProperty('employer');
      expect(jobs[0]).toHaveProperty('Description');
      expect(typeof skills).toBe('object');

      const enriched = enrichJobsWithSkills(jobs, skills);
      expect(enriched).toHaveLength(jobs.length);
      enriched.forEach((job) => {
        expect(job).toHaveProperty('references');
        expect(job).toHaveProperty('job-skills');
        expect(Array.isArray(job.references)).toBe(true);
      });
    });
  });
});
