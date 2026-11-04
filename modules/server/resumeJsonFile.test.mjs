import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { escapeNonAscii, formatResumeJson, usesUnicodeEscapes, writeResumeJson } from './resumeJsonFile.mjs';

describe('usesUnicodeEscapes', () => {
    it('detects \\uXXXX escapes and nothing else', () => {
        expect(usesUnicodeEscapes('{"a": "\\u2022 bullet"}')).toBe(true);
        expect(usesUnicodeEscapes('{"a": "• bullet"}')).toBe(false);
        expect(usesUnicodeEscapes('{"a": "\\u12"}')).toBe(false);
        expect(usesUnicodeEscapes(null)).toBe(false);
    });
});

describe('escapeNonAscii', () => {
    it('escapes non-ASCII as lowercase \\u escapes, splitting astral characters into surrogates', () => {
        expect(escapeNonAscii('"• é → ×"')).toBe('"\\u2022 \\u00e9 \\u2192 \\u00d7"');
        expect(escapeNonAscii('"\u{1F600}"')).toBe('"\\ud83d\\ude00"');
        expect(escapeNonAscii('"plain ascii"')).toBe('"plain ascii"');
    });
});

describe('formatResumeJson', () => {
    it('pretty-prints with one trailing newline and raw UTF-8 for a new or raw file', () => {
        expect(formatResumeJson({ a: '•' })).toBe('{\n  "a": "•"\n}\n');
        expect(formatResumeJson({ a: '•' }, '{\n  "a": "é"\n}')).toBe('{\n  "a": "•"\n}\n');
    });

    it('re-escapes non-ASCII when the existing text is escaped', () => {
        const out = formatResumeJson({ a: 'café →' }, '{\n  "a": "caf\\u00e9"\n}\n');
        expect(out).toBe('{\n  "a": "caf\\u00e9 \\u2192"\n}\n');
        expect(JSON.parse(out)).toEqual({ a: 'café →' });
    });

    it('fails fast on a non-serializable value', () => {
        expect(() => formatResumeJson(undefined)).toThrow(/not JSON-serializable/);
    });
});

describe('writeResumeJson', () => {
    let dir;
    beforeAll(async () => {
        dir = await fs.mkdtemp(path.join(os.tmpdir(), 'resume-json-file-'));
    });
    afterAll(async () => {
        await fs.rm(dir, { recursive: true, force: true });
    });

    it('creates a raw UTF-8 file with a trailing newline when none exists', async () => {
        const file = path.join(dir, 'new.json');
        await writeResumeJson(file, { bullet: '•' });
        expect(await fs.readFile(file, 'utf-8')).toBe('{\n  "bullet": "•"\n}\n');
    });

    it('keeps an escaped file escaped across rewrites', async () => {
        const file = path.join(dir, 'escaped.json');
        await fs.writeFile(file, '[\n  "\\u2022 one"\n]\n');
        await writeResumeJson(file, ['• one', 'é two']);
        const text = await fs.readFile(file, 'utf-8');
        expect(text).toBe('[\n  "\\u2022 one",\n  "\\u00e9 two"\n]\n');
        await writeResumeJson(file, ['• one']);
        expect(await fs.readFile(file, 'utf-8')).toBe('[\n  "\\u2022 one"\n]\n');
    });

    it('reports and rethrows a read failure other than a missing file', async () => {
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        await expect(writeResumeJson(dir, {})).rejects.toMatchObject({ code: 'EISDIR' });
        expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('[resumeJsonFile] Failed to read'), expect.any(Error));
        errSpy.mockRestore();
    });
});
