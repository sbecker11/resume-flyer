import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { listResumeIds, loadResumeFolder, parseArgs, runCli } from './check-resume-data-consistency.mjs';

const SKILLS = {
  'vue-js': { name: 'Vue.js', url: 'https://vuejs.org/', img: '', categoryIDs: ['frontend'], jobIDs: [] },
  python: { name: 'Python', url: '', img: '', categoryIDs: [], jobIDs: [0, 1] },
};
const JOBS = [
  { employer: 'Acme', start: '01/2020', end: '12/2020', Description: '\u2022 Built a [Vue.js] app', skillIDs: ['Vue.js'] },
  { employer: 'Beta', start: '01/2021', end: '12/2021', Description: '\u2022 Wrote [Python] tooling', skillIDs: ['python'] },
];
const CATEGORIES = { frontend: { name: 'Frontend', skillIDs: ['vue-js', 'ghost'] } };

async function writeResume(parsedDir, id, { jobsText, skillsText, categoriesText, enriched = true } = {}) {
  const dir = path.join(parsedDir, id);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'jobs.json'), jobsText ?? `${JSON.stringify(JOBS, null, 2).replace(/\u2022/g, '\\u2022')}\n`);
  await fs.writeFile(path.join(dir, 'skills.json'), skillsText ?? JSON.stringify(SKILLS, null, 2));
  await fs.writeFile(path.join(dir, 'categories.json'), categoriesText ?? `${JSON.stringify(CATEGORIES, null, 2)}\n`);
  if (enriched) await fs.writeFile(path.join(dir, 'enriched-jobs.json'), '[]');
  return dir;
}

describe('check-resume-data-consistency CLI', () => {
  let parsedDir;
  let lines;
  let errors;
  const io = { log: (l) => lines.push(l), error: (l) => errors.push(l) };

  beforeEach(async () => {
    parsedDir = await fs.mkdtemp(path.join(os.tmpdir(), 'resume-consistency-'));
    lines = [];
    errors = [];
  });

  afterEach(async () => {
    await fs.rm(parsedDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describe('parseArgs', () => {
    it('parses flags', () => {
      expect(parseArgs([], '/p')).toEqual({ resume: null, fix: false, dryRun: false, warningsOk: false, parsedDir: '/p', help: false });
      expect(parseArgs(['--resume', 'abc', '--fix', '--dry-run', '--warnings-ok'], '/p')).toMatchObject({ resume: 'abc', fix: true, dryRun: true, warningsOk: true });
      expect(parseArgs(['--resume=xyz'], '/p').resume).toBe('xyz');
      expect(parseArgs(['--parsed-dir', '/tmp/x'], '/p').parsedDir).toBe(path.resolve('/tmp/x'));
      expect(parseArgs(['-h'], '/p').help).toBe(true);
    });

    it('rejects bad arguments', () => {
      expect(() => parseArgs(['--resume'], '/p')).toThrow(/--resume requires/);
      expect(() => parseArgs(['--parsed-dir'], '/p')).toThrow(/--parsed-dir requires/);
      expect(() => parseArgs(['--bogus'], '/p')).toThrow(/Unknown argument/);
    });
  });

  describe('loadResumeFolder / listResumeIds', () => {
    it('lists only folders containing jobs.json and skips dot/_local- folders', async () => {
      await writeResume(parsedDir, 'b-resume');
      await writeResume(parsedDir, 'a-resume');
      await fs.mkdir(path.join(parsedDir, '.hidden'));
      await writeResume(parsedDir, '_local-x');
      await fs.mkdir(path.join(parsedDir, 'empty'));
      expect(await listResumeIds(parsedDir)).toEqual(['a-resume', 'b-resume']);
    });

    it('fails fast on missing jobs.json / skills.json and on invalid JSON', async () => {
      const dir = await writeResume(parsedDir, 'r');
      await fs.rm(path.join(dir, 'skills.json'));
      await expect(loadResumeFolder(dir)).rejects.toThrow(/skills.json.*not found/);
      await fs.writeFile(path.join(dir, 'skills.json'), '{ nope');
      vi.spyOn(console, 'error').mockImplementation(() => {});
      await expect(loadResumeFolder(dir)).rejects.toThrow();
      await expect(loadResumeFolder(path.join(parsedDir, 'missing'))).rejects.toThrow(/jobs.json.*not found/);
    });

    it('marks a missing enriched-jobs.json as null', async () => {
      const dir = await writeResume(parsedDir, 'r', { enriched: false });
      const { data } = await loadResumeFolder(dir);
      expect(data.enrichedJobs).toBeNull();
      expect(data.education).toBeUndefined();
    });
  });

  describe('runCli', () => {
    it('prints usage and returns 2 on bad args, 0 on --help', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(await runCli(['--nope'], io)).toBe(2);
      expect(errors[0]).toMatch(/Usage/);
      expect(await runCli(['--help'], io)).toBe(0);
      expect(lines.at(-1)).toMatch(/Usage/);
    });

    it('returns 2 when the parsed dir has no resumes or cannot be read', async () => {
      expect(await runCli(['--parsed-dir', parsedDir], io)).toBe(2);
      expect(errors[0]).toMatch(/No resume folders/);
      vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(await runCli(['--parsed-dir', path.join(parsedDir, 'nope')], io)).toBe(2);
      expect(await runCli(['--parsed-dir', parsedDir, '--resume', 'ghost'], io)).toBe(2);
    });

    it('reports findings grouped by severity and exits 1 on blocking findings', async () => {
      const jobs = JSON.parse(JSON.stringify(JOBS));
      jobs[1].skillIDs = ['python', 'python'];
      await writeResume(parsedDir, 'r1', { jobsText: JSON.stringify(jobs) });
      await fs.writeFile(path.join(parsedDir, 'skill-urls.json'), JSON.stringify({ entries: { Rust: { url: 'https://x/', updatedAt: '2026-01-01T00:00:00Z' } } }));
      await fs.writeFile(path.join(parsedDir, 'non-local-resumes.json'), JSON.stringify({ resumes: [{ id: 'r1', jobCount: 9, skillCount: 2 }] }));
      const code = await runCli(['--parsed-dir', parsedDir, '--resume', 'r1'], io);
      expect(code).toBe(1);
      const text = lines.join('\n');
      expect(text).toContain('=== r1 ');
      const errorsSection = text.slice(text.indexOf('ERRORS ('), text.indexOf('WARNINGS ('));
      expect(errorsSection).toContain('[category-skill-unknown]');
      expect(errorsSection).toContain('[enriched-jobs-stale]');
      expect(errorsSection).toContain('[skill-jobids-missing]');
      expect(errorsSection).toContain('[skill-id-not-key] jobs.json[0].skillIDs[0]');
      const warningsSection = text.slice(text.indexOf('WARNINGS ('), text.indexOf('INFO ('));
      expect(warningsSection).toContain('[skill-id-duplicate] jobs.json[1].skillIDs[1]');
      expect(warningsSection).not.toContain('[skill-id-not-key]');
      expect(text).toContain('INFO (');
      expect(text).toContain('[skill-url-orphan]');
      expect(text).toContain('[index-count-mismatch]');
      expect(text).not.toContain('DRY-RUN');
    });

    it('--warnings-ok passes a resume with only warnings and still fails on errors', async () => {
      await writeResume(parsedDir, 'warn', {
        jobsText: JSON.stringify([{ employer: 'A', Description: '[Python]', skillIDs: ['python', 'python'] }]),
        skillsText: JSON.stringify({ python: { name: 'Python', jobIDs: [0] } }),
        categoriesText: '{}',
        enriched: false,
      });
      expect(await runCli(['--parsed-dir', parsedDir, '--resume', 'warn'], io)).toBe(1);
      expect(lines.join('\n')).toContain('0 error(s), 1 warning(s)');
      expect(await runCli(['--parsed-dir', parsedDir, '--resume', 'warn', '--warnings-ok'], io)).toBe(0);
      await writeResume(parsedDir, 'err');
      expect(await runCli(['--parsed-dir', parsedDir, '--resume', 'err', '--warnings-ok'], io)).toBe(1);
    });

    it('a display-name skillID is an error that --warnings-ok does not excuse', async () => {
      await writeResume(parsedDir, 'name', {
        jobsText: JSON.stringify([{ employer: 'A', Description: '[Python]', skillIDs: ['Python'] }]),
        skillsText: JSON.stringify({ python: { name: 'Python', jobIDs: [0] } }),
        categoriesText: '{}',
        enriched: false,
      });
      expect(await runCli(['--parsed-dir', parsedDir, '--resume', 'name', '--warnings-ok'], io)).toBe(1);
      const text = lines.join('\n');
      expect(text).toContain('1 error(s), 0 warning(s)');
      expect(text).toContain('[skill-id-not-key] jobs.json[0].skillIDs[0]');
    });

    it('returns 0 when only informational findings remain', async () => {
      const dir = await writeResume(parsedDir, 'clean', {
        jobsText: JSON.stringify([{ employer: 'A', Description: '[Python]', skillIDs: ['python'] }]),
        skillsText: JSON.stringify({ python: { name: 'Python', jobIDs: [0] } }),
        categoriesText: JSON.stringify({}),
        enriched: false,
      });
      await runCli(['--parsed-dir', parsedDir, '--resume', 'clean', '--fix'], io);
      lines = [];
      await fs.writeFile(path.join(parsedDir, 'non-local-resumes.json'), JSON.stringify({ resumes: [{ id: 'clean', jobCount: 2, skillCount: 1 }] }));
      expect(await runCli(['--parsed-dir', parsedDir, '--resume', 'clean'], io)).toBe(0);
      expect(lines.join('\n')).toContain('0 error(s), 0 warning(s), 1 info');
      expect(JSON.parse(await fs.readFile(path.join(dir, 'enriched-jobs.json'), 'utf-8'))).toHaveLength(1);
    });

    it('--dry-run lists the fixes and files that would change without writing', async () => {
      const dir = await writeResume(parsedDir, 'r1');
      const before = await fs.readFile(path.join(dir, 'skills.json'), 'utf-8');
      const code = await runCli(['--parsed-dir', parsedDir, '--resume', 'r1', '--dry-run'], io);
      expect(code).toBe(1);
      const text = lines.join('\n');
      expect(text).toContain('DRY-RUN: fixes --fix would apply');
      expect(text).toContain('[skill-ids-canonicalized] jobs.json[0].skillIDs');
      expect(text).toContain('[skill-jobids-recomputed] skills.json["vue-js"].jobIDs');
      expect(text).toContain('[category-skill-ids-canonicalized] categories.json["frontend"].skillIDs');
      expect(text).toContain('files that would change: jobs.json, skills.json, categories.json, enriched-jobs.json');
      expect(await fs.readFile(path.join(dir, 'skills.json'), 'utf-8')).toBe(before);
      expect(text).not.toContain('wrote ');
    });

    it('--fix writes through commitResume, preserving escape style, and re-checks', async () => {
      const dir = await writeResume(parsedDir, 'r1');
      const code = await runCli(['--parsed-dir', parsedDir, '--resume', 'r1', '--fix'], io);
      expect(code).toBe(0);
      const text = lines.join('\n');
      expect(text).toContain('FIXES APPLIED');
      expect(text).toContain('After fix: 0 error(s), 0 warning(s)');

      const jobsText = await fs.readFile(path.join(dir, 'jobs.json'), 'utf-8');
      expect(jobsText).toContain('\\u2022');
      expect(jobsText.endsWith('\n')).toBe(true);
      expect(JSON.parse(jobsText)[0].skillIDs).toEqual(['vue-js']);

      const skillsText = await fs.readFile(path.join(dir, 'skills.json'), 'utf-8');
      // The one write path always ends a file in exactly one newline.
      expect(skillsText.endsWith('\n')).toBe(true);
      expect(skillsText.endsWith('\n\n')).toBe(false);
      expect(skillsText.startsWith('{\n  "vue-js": {\n    "name"')).toBe(true);
      expect(JSON.parse(skillsText)['vue-js'].jobIDs).toEqual([0]);

      const categories = JSON.parse(await fs.readFile(path.join(dir, 'categories.json'), 'utf-8'));
      expect(categories.frontend.skillIDs).toEqual(['vue-js']);
      const enriched = JSON.parse(await fs.readFile(path.join(dir, 'enriched-jobs.json'), 'utf-8'));
      expect(enriched).toHaveLength(2);
      expect(enriched[0].Description).toContain('\u2022');

      lines = [];
      expect(await runCli(['--parsed-dir', parsedDir, '--resume', 'r1'], io)).toBe(0);
    });

    it('--fix returns 1 when non-mechanical findings remain', async () => {
      await writeResume(parsedDir, 'r1', {
        jobsText: JSON.stringify([{ employer: 'A', Description: '[Ghost]', skillIDs: ['python'] }]),
        skillsText: JSON.stringify({ python: { name: 'Python', jobIDs: [] } }),
      });
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(console, 'log').mockImplementation(() => {});
      const before = await fs.readFile(path.join(parsedDir, 'r1', 'skills.json'), 'utf-8');
      expect(await runCli(['--parsed-dir', parsedDir, '--resume', 'r1', '--fix'], io)).toBe(1);
      expect(lines.join('\n')).toContain('FIX REFUSED');
      expect(lines.join('\n')).toContain('REMAINING ERRORS');
      expect(await fs.readFile(path.join(parsedDir, 'r1', 'skills.json'), 'utf-8')).toBe(before);
    });

    it('checks every resume and reports shared skill-urls orphans once', async () => {
      await writeResume(parsedDir, 'r1');
      await writeResume(parsedDir, 'r2', {
        jobsText: JSON.stringify([{ employer: 'A', Description: '', skillIDs: ['rust'] }]),
        skillsText: JSON.stringify({ rust: { name: 'Rust', jobIDs: [0] } }),
        categoriesText: '{}',
        enriched: false,
      });
      await fs.writeFile(path.join(parsedDir, 'skill-urls.json'), JSON.stringify({
        entries: { Rust: { url: 'https://x/', updatedAt: '' }, Zig: { url: 'https://y/', updatedAt: '' } },
      }));
      const code = await runCli(['--parsed-dir', parsedDir], io);
      expect(code).toBe(1);
      const text = lines.join('\n');
      expect(text).toContain('=== r1 ');
      expect(text).toContain('=== r2 ');
      expect(text).toContain('=== skill-urls.json (shared across 2 resume(s)) ===');
      expect(text).toContain('skill-urls.json.entries["Zig"]');
      expect(text).not.toContain('skill-urls.json.entries["Rust"]');
    });
  });
});
