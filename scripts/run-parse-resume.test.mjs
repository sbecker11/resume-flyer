import { describe, it, expect } from 'vitest';
import path from 'path';
import { parseArgs, getParserEnv } from './run-parse-resume.mjs';

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
});
