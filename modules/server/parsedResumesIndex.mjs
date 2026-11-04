/**
 * parsed_resumes/non-local-resumes.json: the static listing of parsed resumes (id, displayName,
 * jobCount, skillCount, ...) that the client uses when no server is available.
 *
 * One producer: buildParsedResumesIndex walks the folder; writeParsedResumesIndex persists it.
 * Used by scripts/generate-parsed-resumes-index.mjs and by resumeStore.commitResume when a
 * commit changed a resume's job or skill count.
 */
import fs from 'fs/promises';
import path from 'path';
import { reportError } from '../utils/errorReporting.mjs';

export const PARSED_RESUMES_INDEX_FILENAME = 'non-local-resumes.json';

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Parse one JSON file for the index. A broken file is reported and counted as unknown
 * (null) rather than failing the whole listing: the static site must still build.
 * @param {string} p
 * @returns {Promise<unknown|undefined>} undefined when missing or unreadable
 */
async function readJsonForIndex(p) {
  if (!(await exists(p))) return undefined;
  try {
    return JSON.parse(await fs.readFile(p, 'utf8'));
  } catch (error) {
    reportError(error, `[parsedResumesIndex] Cannot read ${p}`, 'Listing the resume with unknown counts');
    return undefined;
  }
}

/** @param {unknown} jobs */
export function countJobs(jobs) {
  if (jobs == null) return null;
  return Array.isArray(jobs) ? jobs.length : Object.keys(jobs || {}).length;
}

/** @param {unknown} skills */
export function countSkills(skills) {
  if (skills == null) return null;
  return Object.keys(skills || {}).length;
}

/**
 * Index row for one resume folder.
 * @param {string} id
 * @param {{ meta?: Record<string, unknown>|null, jobs: unknown, skills?: unknown }} data
 */
export function buildResumeIndexEntry(id, { meta, jobs, skills }) {
  const m = meta && typeof meta === 'object' ? meta : {};
  return {
    id,
    displayName: m.displayName || m.name || id,
    fileName: m.fileName,
    createdAt: m.createdAt,
    jobCount: countJobs(jobs),
    skillCount: countSkills(skills),
  };
}

/**
 * Walk `parsedDir` (created when missing so static builds still succeed) and build the index.
 * Dot-folders, `_local-*` folders, and folders without jobs.json are skipped.
 * @param {string} parsedDir
 * @returns {Promise<{ resumes: object[], defaultResumeId: string|null, generatedAt: string }>}
 */
export async function buildParsedResumesIndex(parsedDir) {
  if (!parsedDir) throw new Error('[parsedResumesIndex] parsedDir is required');
  if (!(await exists(parsedDir))) {
    await fs.mkdir(parsedDir, { recursive: true });
  }
  const entries = await fs.readdir(parsedDir, { withFileTypes: true });
  const resumes = [];
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const id = ent.name;
    if (id.startsWith('.') || id.startsWith('_local-')) continue;
    const dir = path.join(parsedDir, id);
    const jobsPath = path.join(dir, 'jobs.json');
    if (!(await exists(jobsPath))) continue;
    const [meta, jobs, skills] = await Promise.all([
      readJsonForIndex(path.join(dir, 'meta.json')),
      readJsonForIndex(jobsPath),
      readJsonForIndex(path.join(dir, 'skills.json')),
    ]);
    resumes.push(buildResumeIndexEntry(id, { meta: meta ?? {}, jobs, skills }));
  }
  resumes.sort((a, b) => String(a.displayName).localeCompare(String(b.displayName)));
  return {
    resumes,
    defaultResumeId: resumes.length > 0 ? resumes[0].id : null,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * @param {string} parsedDir
 * @returns {Promise<{ outPath: string, index: { resumes: object[], defaultResumeId: string|null, generatedAt: string } }>}
 */
export async function writeParsedResumesIndex(parsedDir) {
  const index = await buildParsedResumesIndex(parsedDir);
  const outPath = path.join(parsedDir, PARSED_RESUMES_INDEX_FILENAME);
  await fs.writeFile(outPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
  return { outPath, index };
}

/**
 * The index row for `id`, or null when the index is missing, unreadable, or has no such row.
 * @param {string} parsedDir
 * @param {string} id
 * @returns {Promise<{ jobCount?: number|null, skillCount?: number|null }|null>}
 */
export async function readParsedResumesIndexEntry(parsedDir, id) {
  const index = await readJsonForIndex(path.join(parsedDir, PARSED_RESUMES_INDEX_FILENAME));
  const list = Array.isArray(index?.resumes) ? index.resumes : [];
  return list.find((r) => r && r.id === id) ?? null;
}
