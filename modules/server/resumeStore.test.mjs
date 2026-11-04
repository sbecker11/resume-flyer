import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResumeConsistencyError, commitResume, loadResume } from './resumeStore.mjs';
import { checkResumeDataConsistency, hasBlockingFindings } from '../data/resumeDataConsistency.mjs';

const ID = 'r1';

function fixtureJobs() {
  return [
    { employer: 'Acme', role: 'Dev', start: '2020-01', end: '2021-01', Description: '\u2022 Built a [Vue.js] app', skillIDs: ['Vue.js'] },
    { employer: 'Beta', role: 'Eng', start: '2021-02', end: '2022-01', Description: '\u2022 [Python] tooling', skillIDs: ['python', 'Python'] },
  ];
}

function fixtureSkills() {
  return {
    'vue-js': { name: 'Vue.js', url: 'https://vuejs.org/', jobIDs: [], categoryIDs: ['frontend'] },
    python: { name: 'Python', jobIDs: [5] },
    Bash: { name: 'Bash', jobIDs: [] },
  };
}

describe('resumeStore', () => {
  let tmp;
  let dir;
  let logs;
  const log = (line) => logs.push(line);

  async function write(rel, value, { text } = {}) {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, rel), text ?? JSON.stringify(value, null, 2));
  }
  async function readJson(rel) {
    return JSON.parse(await fs.readFile(path.join(dir, rel), 'utf-8'));
  }
  async function exists(rel) {
    try { await fs.access(path.join(dir, rel)); return true; } catch { return false; }
  }

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'resume-store-'));
    dir = path.join(tmp, ID);
    logs = [];
    await write('jobs.json', fixtureJobs());
    await write('skills.json', fixtureSkills());
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(tmp, { recursive: true, force: true });
  });

  describe('loadResume', () => {
    it('loads the primary files and defaults the optional ones to {}', async () => {
      const data = await loadResume(tmp, ID);
      expect(data.jobs).toEqual(fixtureJobs());
      expect(data.skills).toEqual(fixtureSkills());
      expect(data.education).toEqual({});
      expect(data.categories).toEqual({});
      expect(data.meta).toEqual({});
    });

    it('loads education, categories, and meta when present', async () => {
      await write('education.json', { phd: { index: 0, degree: 'PhD', skillIDs: ['Bash'] } });
      await write('categories.json', { frontend: { name: 'Frontend', skillIDs: ['vue-js'] } });
      await write('meta.json', { displayName: 'Fixture' });
      const data = await loadResume(tmp, ID);
      expect(data.education.phd.degree).toBe('PhD');
      expect(data.categories.frontend.skillIDs).toEqual(['vue-js']);
      expect(data.meta.displayName).toBe('Fixture');
    });

    it('fails with ENOENT for a missing resume and fast on bad JSON, bad shapes, or bad ids', async () => {
      await expect(loadResume(tmp, 'nope')).rejects.toMatchObject({ code: 'ENOENT' });
      vi.spyOn(console, 'error').mockImplementation(() => {});
      await write('skills.json', null, { text: '{ nope' });
      await expect(loadResume(tmp, ID)).rejects.toThrow();
      await write('skills.json', ['not', 'a', 'map']);
      await expect(loadResume(tmp, ID)).rejects.toThrow(/must hold an object/);
      await write('skills.json', fixtureSkills());
      await write('jobs.json', null, { text: '"a string"' });
      await expect(loadResume(tmp, ID)).rejects.toThrow(/array or a jobID-keyed object/);
      await expect(loadResume(tmp, '../x')).rejects.toThrow(/invalid resume id/);
      await expect(loadResume('', ID)).rejects.toThrow(/parsedDir is required/);
    });
  });

  describe('commitResume', () => {
    it('normalizes, bakes, writes the changed files, creates the index, and reports what it did', async () => {
      const data = await loadResume(tmp, ID);
      const result = await commitResume(tmp, ID, data, { log });
      expect(result.writtenFiles).toEqual(['jobs.json', 'skills.json', 'enriched-jobs.json', 'non-local-resumes.json']);
      expect(result.appliedFixes.map((f) => f.code)).toEqual(expect.arrayContaining(['skill-ids-canonicalized', 'skill-jobids-recomputed']));

      const jobs = await readJson('jobs.json');
      const skills = await readJson('skills.json');
      expect(jobs[0].skillIDs).toEqual(['vue-js']);
      expect(jobs[1].skillIDs).toEqual(['python']);
      expect(skills['vue-js'].jobIDs).toEqual([0]);
      expect(skills.python.jobIDs).toEqual([1]);
      expect(skills.Bash.jobIDs).toEqual([]);
      // categoryIDs naming a category that does not exist is not mechanical: left alone, and
      // categories.json is not created because the folder never had one and nothing links to one.
      expect(skills['vue-js'].categoryIDs).toEqual(['frontend']);
      expect(await exists('categories.json')).toBe(false);
      expect(await exists('education.json')).toBe(false);

      const enriched = await readJson('enriched-jobs.json');
      expect(enriched).toHaveLength(2);
      expect(enriched[0]['job-skills']).toEqual({ 'vue-js': 'vue-js' });
      expect(result.data.enrichedJobs).toEqual(enriched);

      const index = JSON.parse(await fs.readFile(path.join(tmp, 'non-local-resumes.json'), 'utf-8'));
      expect(index.resumes).toEqual([expect.objectContaining({ id: ID, jobCount: 2, skillCount: 3 })]);

      expect(logs.some((l) => l.includes('[skill-jobids-recomputed]'))).toBe(true);
      expect(logs.at(-1)).toMatch(/normalization fix\(es\); wrote jobs.json, skills.json, enriched-jobs.json, non-local-resumes.json/);

      expect(hasBlockingFindings(checkResumeDataConsistency({
        jobs, skills, enrichedJobs: enriched, index, resumeId: ID,
      }))).toBe(false);
    });

    it('writes nothing when the data is already consistent and the index counts match', async () => {
      await commitResume(tmp, ID, await loadResume(tmp, ID), { log });
      const before = await fs.readFile(path.join(tmp, 'non-local-resumes.json'), 'utf-8');
      const data = await loadResume(tmp, ID);
      const result = await commitResume(tmp, ID, data, { log });
      expect(result.appliedFixes).toEqual([]);
      expect(result.writtenFiles).toEqual([]);
      expect(await fs.readFile(path.join(tmp, 'non-local-resumes.json'), 'utf-8')).toBe(before);
      expect(logs.at(-1)).toMatch(/wrote nothing/);
    });

    it('writes only the files whose data changed and refreshes the index when a count changes', async () => {
      await commitResume(tmp, ID, await loadResume(tmp, ID), { log });
      const data = await loadResume(tmp, ID);
      data.skills.Kafka = { name: 'Kafka' };
      const result = await commitResume(tmp, ID, data, { log });
      expect(result.writtenFiles).toEqual(['skills.json', 'non-local-resumes.json']);
      expect((await readJson('skills.json')).Kafka).toEqual({ name: 'Kafka', jobIDs: [] });
      const index = JSON.parse(await fs.readFile(path.join(tmp, 'non-local-resumes.json'), 'utf-8'));
      expect(index.resumes[0].skillCount).toBe(4);

      const again = await loadResume(tmp, ID);
      again.jobs[1].role = 'Staff';
      expect((await commitResume(tmp, ID, again, { log })).writtenFiles).toEqual(['jobs.json', 'enriched-jobs.json']);
    });

    it('updateIndex: false leaves the index alone', async () => {
      const result = await commitResume(tmp, ID, await loadResume(tmp, ID), { log, updateIndex: false });
      expect(result.writtenFiles).not.toContain('non-local-resumes.json');
      await expect(fs.access(path.join(tmp, 'non-local-resumes.json'))).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it('syncs categories both ways, drops dangling keys, and keeps the file style', async () => {
      await write('categories.json', null, { text: '{\n  "frontend": {\n    "name": "Frontend",\n    "skillIDs": ["Vue.js", "ghost"]\n  },\n  "lang": {\n    "name": "Lang",\n    "skillIDs": ["python"]\n  }\n}' });
      await write('jobs.json', null, { text: `${JSON.stringify(fixtureJobs(), null, 2).replace(/\u2022/g, '\\u2022')}\n` });
      const data = await loadResume(tmp, ID);
      await commitResume(tmp, ID, data, { log });
      const categories = await readJson('categories.json');
      expect(categories.frontend.skillIDs).toEqual(['vue-js']);
      const skills = await readJson('skills.json');
      expect(skills.python.categoryIDs).toEqual(['lang']);
      const jobsText = await fs.readFile(path.join(dir, 'jobs.json'), 'utf-8');
      expect(jobsText).toContain('\\u2022');
      expect(jobsText.endsWith('\n')).toBe(true);
      expect(hasBlockingFindings(checkResumeDataConsistency({ jobs: await readJson('jobs.json'), skills, categories }))).toBe(false);
    });

    it('creates an absent optional file only when it gained content', async () => {
      const data = await loadResume(tmp, ID);
      data.education = { phd: { index: 0, degree: 'PhD', institution: 'MIT', description: '', skillIDs: ['bash'] } };
      const result = await commitResume(tmp, ID, data, { log });
      expect(result.writtenFiles).toContain('education.json');
      expect((await readJson('education.json')).phd.skillIDs).toEqual(['Bash']);
      expect((await readJson('skills.json')).Bash.jobIDs).toEqual([2]);
      expect(await readJson('enriched-jobs.json')).toHaveLength(3);
      expect(await exists('categories.json')).toBe(false);
    });

    it('refuses to write and reports the findings when an invariant would be violated', async () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const data = await loadResume(tmp, ID);
      data.jobs[0].Description = '\u2022 Built a [Vue.js] app with [Rust]';
      data.jobs[1].skillIDs = [];
      let caught;
      try {
        await commitResume(tmp, ID, data, { log });
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(ResumeConsistencyError);
      expect(caught.statusCode).toBe(422);
      expect(caught.resumeId).toBe(ID);
      expect(caught.message).toMatch(/nothing was written/);
      const codes = caught.findings.map((f) => f.code);
      expect(codes).toEqual(expect.arrayContaining(['bracket-unresolved', 'bracket-not-linked']));
      expect(caught.findings.every((f) => f.severity !== 'info')).toBe(true);
      expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('Refusing to write resume "r1"'), expect.any(Error));
      expect(errSpy.mock.calls[0][0]).toContain('[bracket-not-linked] jobs.json[1].Description');

      expect(await readJson('jobs.json')).toEqual(fixtureJobs());
      expect(await readJson('skills.json')).toEqual(fixtureSkills());
      expect(await exists('enriched-jobs.json')).toBe(false);
      await expect(fs.access(path.join(tmp, 'non-local-resumes.json'))).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it('treats a duplicate display name as blocking (warning)', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const data = await loadResume(tmp, ID);
      data.skills['python-3'] = { name: 'python' };
      await expect(commitResume(tmp, ID, data, { log })).rejects.toMatchObject({
        findings: [expect.objectContaining({ code: 'skill-name-duplicate', severity: 'warning' })],
      });
    });

    it('accepts jobs stored as a jobID-keyed object and skills missing from disk', async () => {
      await fs.rm(path.join(dir, 'skills.json'));
      await write('jobs.json', { 1: { employer: 'A', Description: 'plain', skillIDs: [] } });
      const data = await loadResume(tmp, ID);
      expect(data.skills).toEqual({});
      const result = await commitResume(tmp, ID, data, { log });
      expect(result.writtenFiles).toEqual(['skills.json', 'enriched-jobs.json', 'non-local-resumes.json']);
      expect(await readJson('skills.json')).toEqual({});
      expect(await readJson('jobs.json')).toEqual({ 1: { employer: 'A', Description: 'plain', skillIDs: [] } });
    });

    it('validates its arguments', async () => {
      await expect(commitResume(tmp, ID, null)).rejects.toThrow(/data is required/);
      await expect(commitResume(tmp, 'a/b', { jobs: [] })).rejects.toThrow(/invalid resume id/);
    });
  });
});
