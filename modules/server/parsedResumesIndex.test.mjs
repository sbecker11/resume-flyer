import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PARSED_RESUMES_INDEX_FILENAME,
  buildParsedResumesIndex,
  buildResumeIndexEntry,
  countJobs,
  countSkills,
  readParsedResumesIndexEntry,
  writeParsedResumesIndex,
} from './parsedResumesIndex.mjs';

describe('parsedResumesIndex', () => {
  let tmp;

  async function writeFolder(id, { meta, jobs, skills, texts = {} } = {}) {
    const dir = path.join(tmp, id);
    await fs.mkdir(dir, { recursive: true });
    if (jobs !== undefined) await fs.writeFile(path.join(dir, 'jobs.json'), texts.jobs ?? JSON.stringify(jobs));
    if (skills !== undefined) await fs.writeFile(path.join(dir, 'skills.json'), texts.skills ?? JSON.stringify(skills));
    if (meta !== undefined) await fs.writeFile(path.join(dir, 'meta.json'), texts.meta ?? JSON.stringify(meta));
    return dir;
  }

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'parsed-index-'));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('counts jobs (array or jobID-keyed) and skills, null when missing', () => {
    expect(countJobs([{}, {}])).toBe(2);
    expect(countJobs({ 1: {}, 2: {}, 3: {} })).toBe(3);
    expect(countJobs(undefined)).toBeNull();
    expect(countSkills({ a: {}, b: {} })).toBe(2);
    expect(countSkills(null)).toBeNull();
  });

  it('builds an entry from meta with displayName/name fallbacks', () => {
    expect(buildResumeIndexEntry('x', { meta: { displayName: 'X', fileName: 'x.docx', createdAt: 't' }, jobs: [{}], skills: { a: {} } }))
      .toEqual({ id: 'x', displayName: 'X', fileName: 'x.docx', createdAt: 't', jobCount: 1, skillCount: 1 });
    expect(buildResumeIndexEntry('y', { meta: { name: 'Why' }, jobs: [] }).displayName).toBe('Why');
    expect(buildResumeIndexEntry('z', { meta: null, jobs: [] })).toMatchObject({ displayName: 'z', skillCount: null });
  });

  it('walks the folder, skipping dot/_local-/jobless folders, sorted by displayName with the first as default', async () => {
    await writeFolder('b', { meta: { displayName: 'Bravo' }, jobs: [{}, {}], skills: { a: {} } });
    await writeFolder('a', { meta: { displayName: 'Alpha' }, jobs: { 1: {} } });
    await writeFolder('.hidden', { jobs: [] });
    await writeFolder('_local-x', { jobs: [] });
    await writeFolder('nojobs', { skills: {} });
    await fs.writeFile(path.join(tmp, 'stray.json'), '{}');
    const index = await buildParsedResumesIndex(tmp);
    expect(index.resumes.map((r) => r.id)).toEqual(['a', 'b']);
    expect(index.resumes[0]).toMatchObject({ displayName: 'Alpha', jobCount: 1, skillCount: null });
    expect(index.resumes[1]).toMatchObject({ displayName: 'Bravo', jobCount: 2, skillCount: 1 });
    expect(index.defaultResumeId).toBe('a');
    expect(typeof index.generatedAt).toBe('string');
  });

  it('reports an unreadable file and lists the resume with unknown counts', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await writeFolder('broken', { meta: { displayName: 'B' }, jobs: [], skills: {}, texts: { jobs: '{ nope', meta: '[' } });
    const index = await buildParsedResumesIndex(tmp);
    expect(index.resumes).toEqual([expect.objectContaining({ id: 'broken', displayName: 'broken', jobCount: null, skillCount: 0 })]);
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('[parsedResumesIndex] Cannot read'), expect.any(Error));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Remedy'));
  });

  it('creates a missing parsed dir and writes an empty index; rejects a missing parsedDir argument', async () => {
    const fresh = path.join(tmp, 'new');
    const { outPath, index } = await writeParsedResumesIndex(fresh);
    expect(outPath).toBe(path.join(fresh, PARSED_RESUMES_INDEX_FILENAME));
    const onDisk = JSON.parse(await fs.readFile(outPath, 'utf-8'));
    expect(onDisk).toEqual({ resumes: [], defaultResumeId: null, generatedAt: index.generatedAt });
    expect((await fs.readFile(outPath, 'utf-8')).endsWith('}\n')).toBe(true);
    await expect(buildParsedResumesIndex('')).rejects.toThrow(/parsedDir is required/);
  });

  it('readParsedResumesIndexEntry returns the row, or null when the index or row is missing', async () => {
    expect(await readParsedResumesIndexEntry(tmp, 'a')).toBeNull();
    await writeFolder('a', { meta: { displayName: 'A' }, jobs: [{}], skills: {} });
    await writeParsedResumesIndex(tmp);
    expect(await readParsedResumesIndexEntry(tmp, 'a')).toMatchObject({ id: 'a', jobCount: 1, skillCount: 0 });
    expect(await readParsedResumesIndexEntry(tmp, 'zzz')).toBeNull();
  });
});
