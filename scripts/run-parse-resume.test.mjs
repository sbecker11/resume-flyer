import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { finalizeParserOutput, parseArgs, getParserEnv } from './run-parse-resume.mjs';

describe('run-parse-resume', () => {
  const cwd = process.cwd();

  describe('parseArgs', () => {
    it('returns defaults when argv is empty', () => {
      const out = parseArgs([], cwd);
      expect(out).toEqual({ docx: null, out: null, id: null, force: false, help: false });
    });

    it('parses --docx and resolves against cwd', () => {
      const out = parseArgs(['--docx', 'resume.docx'], cwd);
      expect(out.docx).toBe(path.resolve(cwd, 'resume.docx'));
      expect(out.out).toBe(null);
      expect(out.id).toBe(null);
      expect(out.force).toBe(false);
      expect(out.help).toBe(false);
    });

    it('parses --docx --id and sets out to null (computed later from id)', () => {
      const out = parseArgs(['--docx', 'x.docx', '--id', 'my-resume'], cwd);
      expect(out.docx).toBe(path.resolve(cwd, 'x.docx'));
      expect(out.id).toBe('my-resume');
      expect(out.out).toBe(null);
    });

    it('parses --docx --out', () => {
      const out = parseArgs(['--docx', 'a.docx', '--out', '/tmp/out'], cwd);
      expect(out.docx).toBe(path.resolve(cwd, 'a.docx'));
      expect(out.out).toBe('/tmp/out');
      expect(out.id).toBe(null);
    });

    it('parses --force', () => {
      const out = parseArgs(['--docx', 'a.docx', '--out', '/tmp', '--force'], cwd);
      expect(out.force).toBe(true);
    });

    it('parses --help', () => {
      const out = parseArgs(['--help'], cwd);
      expect(out.help).toBe(true);
    });

    it('parses -h as help', () => {
      const out = parseArgs(['-h'], cwd);
      expect(out.help).toBe(true);
    });

    it('when both --id and --out given, out is the explicit --out value', () => {
      const out = parseArgs(['--docx', 'x.docx', '--id', 'foo', '--out', './parsed_resumes/bar'], cwd);
      expect(out.id).toBe('foo');
      expect(out.out).toBe('./parsed_resumes/bar');
    });
  });

  describe('getParserEnv', () => {
    it('strips OPENAI_API_KEY and forwards Anthropic to resume-parser', () => {
      const env = {
        PATH: '/usr/bin',
        OPENAI_API_KEY: 'secret',
        ANTHROPIC_API_KEY: 'sk-ant-test',
        LLM_PROVIDER: 'anthropic',
        ANTHROPIC_MODEL: 'claude-sonnet-4-6',
        FOO: 'bar',
      };
      const result = getParserEnv(env);
      expect(result.PATH).toBe('/usr/bin');
      expect(result.FOO).toBe('bar');
      expect(result).not.toHaveProperty('OPENAI_API_KEY');
      expect(result.ANTHROPIC_API_KEY).toBe('sk-ant-test');
      expect(result.LLM_PROVIDER).toBe('anthropic');
      expect(result.ANTHROPIC_MODEL).toBe('claude-sonnet-4-6');
    });

    it('does not mutate the original env', () => {
      const env = { ANTHROPIC_API_KEY: 'x', OPENAI_API_KEY: 'y' };
      const result = getParserEnv(env);
      expect(env.ANTHROPIC_API_KEY).toBe('x');
      expect(env.OPENAI_API_KEY).toBe('y');
      expect(result.ANTHROPIC_API_KEY).toBe('x');
      expect(result).not.toHaveProperty('OPENAI_API_KEY');
    });
  });

  describe('finalizeParserOutput', () => {
    let tmp;
    beforeEach(async () => { tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'run-parse-finalize-')); });
    afterEach(async () => { await fs.rm(tmp, { recursive: true, force: true }); });

    async function writeParserOutput(dir) {
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, 'jobs.json'), JSON.stringify([{ employer: 'A', Description: '[Python]', skillIDs: ['Python'] }]));
      await fs.writeFile(path.join(dir, 'skills.json'), JSON.stringify({ python: { name: 'Python', jobIDs: [] } }));
    }

    it('normalizes and bakes the parser output; the index is refreshed only under parsed_resumes', async () => {
      const parsedDir = path.join(tmp, 'parsed_resumes');
      const inside = path.join(parsedDir, 'r1');
      await writeParserOutput(inside);
      const result = await finalizeParserOutput(inside, parsedDir);
      expect(result.writtenFiles).toEqual(['jobs.json', 'skills.json', 'enriched-jobs.json', 'non-local-resumes.json']);
      expect(JSON.parse(await fs.readFile(path.join(inside, 'skills.json'), 'utf-8')).python.jobIDs).toEqual([0]);

      const outside = path.join(tmp, 'elsewhere', 'r2');
      await writeParserOutput(outside);
      const r2 = await finalizeParserOutput(outside, parsedDir);
      expect(r2.writtenFiles).not.toContain('non-local-resumes.json');
      await expect(fs.access(path.join(tmp, 'elsewhere', 'non-local-resumes.json'))).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it('rejects when the parser output violates an invariant, leaving the files as written', async () => {
      const dir = path.join(tmp, 'parsed_resumes', 'bad');
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, 'jobs.json'), JSON.stringify([{ employer: 'A', Description: '[Ghost]', skillIDs: [] }]));
      await fs.writeFile(path.join(dir, 'skills.json'), '{}');
      vi.spyOn(console, 'error').mockImplementation(() => {});
      await expect(finalizeParserOutput(dir, path.join(tmp, 'parsed_resumes'))).rejects.toMatchObject({ name: 'ResumeConsistencyError' });
      vi.restoreAllMocks();
      await expect(fs.access(path.join(dir, 'enriched-jobs.json'))).rejects.toMatchObject({ code: 'ENOENT' });
    });
  });
});
