/**
 * The one write path for a parsed resume folder (parsed_resumes/<id>/).
 *
 *   loadResume(parsedDir, id)                → { jobs, skills, education, categories, meta }
 *   commitResume(parsedDir, id, data, opts)  → normalize → re-bake → check → write changed files
 *
 * Every route or script that changes jobs.json, skills.json, education.json or categories.json
 * mutates the loaded data for the one thing it is about and hands it to commitResume, which:
 *   (a) runs normalizeResumeData (the same implementation the CLI --fix uses): skillIDs become
 *       exact keys and are deduped, categories <-> skill.categoryIDs are synced, dangling
 *       category keys are dropped, every skill.jobIDs is recomputed from references;
 *   (b) re-bakes enriched-jobs.json from the normalized primary files;
 *   (c) runs checkResumeDataConsistency and, when any error or warning remains, reports the
 *       findings and throws ResumeConsistencyError without writing anything;
 *   (d) writes only the files whose data changed (format preserving);
 *   (e) regenerates parsed_resumes/non-local-resumes.json when the job or skill count no longer
 *       matches the index row.
 *
 * skill.jobIDs and enriched-jobs.json therefore have exactly one producer: this module.
 * meta.json is loaded for convenience (index counts, display name) but never written here.
 */
import fs from 'fs/promises';
import path from 'path';
import {
  checkResumeDataConsistency,
  groupFindingsBySeverity,
  hasBlockingFindings,
  normalizeResumeData,
  rebuildEnrichedJobs,
} from '../data/resumeDataConsistency.mjs';
import { reportError } from '../utils/errorReporting.mjs';
import { writeResumeJsonIfChanged } from './resumeJsonFile.mjs';
import {
  PARSED_RESUMES_INDEX_FILENAME,
  countJobs,
  countSkills,
  readParsedResumesIndexEntry,
  writeParsedResumesIndex,
} from './parsedResumesIndex.mjs';

export const RESUME_FILES = Object.freeze({
  jobs: 'jobs.json',
  skills: 'skills.json',
  education: 'education.json',
  categories: 'categories.json',
  meta: 'meta.json',
  enrichedJobs: 'enriched-jobs.json',
});

/** Thrown by commitResume when the data would violate an invariant; nothing was written. */
export class ResumeConsistencyError extends Error {
  /**
   * @param {string} id
   * @param {Array<{ code: string, severity: string, message: string, where: string }>} findings
   */
  constructor(id, findings) {
    const blocking = findings.filter((f) => f.severity !== 'info');
    const codes = [...new Set(blocking.map((f) => f.code))];
    super(`Resume "${id}" would be inconsistent (${blocking.length} finding(s): ${codes.join(', ')}); nothing was written`);
    this.name = 'ResumeConsistencyError';
    this.resumeId = id;
    this.findings = blocking;
    this.statusCode = 422;
  }
}

/**
 * @param {string} filePath
 * @returns {Promise<unknown|undefined>} parsed JSON, undefined when the file does not exist
 */
async function readJsonIfExists(filePath) {
  let text;
  try {
    text = await fs.readFile(filePath, 'utf-8');
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    reportError(error, `[resumeStore] Cannot read ${filePath}`);
    throw error;
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    reportError(error, `[resumeStore] ${filePath} is not valid JSON`);
    throw error;
  }
}

function assertLocation(parsedDir, id) {
  if (!parsedDir || typeof parsedDir !== 'string') throw new Error('[resumeStore] parsedDir is required');
  if (!id || typeof id !== 'string' || id === '.' || id === '..' || id.includes('/') || id.includes(path.sep)) {
    throw new Error(`[resumeStore] invalid resume id ${JSON.stringify(id)}`);
  }
}

/**
 * Load the primary files of one resume. jobs.json is required (a missing folder surfaces as
 * an ENOENT error so routes can answer 404); skills.json, education.json, categories.json and
 * meta.json default to {} when absent. commitResume only creates an absent optional file
 * when it gained content.
 *
 * @param {string} parsedDir
 * @param {string} id
 * @returns {Promise<{ jobs: unknown, skills: Record<string, object>, education: Record<string, object>, categories: Record<string, object>, meta: Record<string, unknown> }>}
 */
export async function loadResume(parsedDir, id) {
  assertLocation(parsedDir, id);
  const dir = path.join(parsedDir, id);
  const [jobs, skills, education, categories, meta] = await Promise.all([
    readJsonIfExists(path.join(dir, RESUME_FILES.jobs)),
    readJsonIfExists(path.join(dir, RESUME_FILES.skills)),
    readJsonIfExists(path.join(dir, RESUME_FILES.education)),
    readJsonIfExists(path.join(dir, RESUME_FILES.categories)),
    readJsonIfExists(path.join(dir, RESUME_FILES.meta)),
  ]);
  if (jobs === undefined) {
    const error = new Error(`[resumeStore] ${path.join(dir, RESUME_FILES.jobs)} not found`);
    error.code = 'ENOENT';
    throw error;
  }
  if (jobs == null || typeof jobs !== 'object') {
    throw new Error(`[resumeStore] ${path.join(dir, RESUME_FILES.jobs)} must hold an array or a jobID-keyed object`);
  }
  return {
    jobs,
    skills: asRecord(skills, path.join(dir, RESUME_FILES.skills)),
    education: asRecord(education, path.join(dir, RESUME_FILES.education)),
    categories: asRecord(categories, path.join(dir, RESUME_FILES.categories)),
    meta: asRecord(meta, path.join(dir, RESUME_FILES.meta)),
  };
}

function asRecord(value, filePath) {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`[resumeStore] ${filePath} must hold an object`);
  }
  return value;
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function hasContent(record) {
  return record != null && typeof record === 'object' && Object.keys(record).length > 0;
}

/**
 * @param {string} parsedDir
 * @param {string} id
 * @param {{ jobs: unknown, skills?: Record<string, object>, education?: Record<string, object>|null, categories?: Record<string, object>|null }} data
 * @param {{ log?: (line: string) => void, updateIndex?: boolean }} [options]
 *   updateIndex=false skips the non-local-resumes.json refresh (callers that regenerate it
 *   themselves, or folders outside parsed_resumes/).
 * @returns {Promise<{
 *   appliedFixes: Array<{ code: string, message: string, where: string }>,
 *   writtenFiles: string[],
 *   data: { jobs: unknown, skills: Record<string, object>, education: Record<string, object>, categories: Record<string, object>, enrichedJobs: object[] },
 * }>}
 */
export async function commitResume(parsedDir, id, data, { log = (line) => console.log(line), updateIndex = true } = {}) {
  assertLocation(parsedDir, id);
  if (!data || typeof data !== 'object') throw new Error('[resumeStore] commitResume: data is required');
  const dir = path.join(parsedDir, id);
  const paths = Object.fromEntries(Object.entries(RESUME_FILES).map(([k, f]) => [k, path.join(dir, f)]));
  const [hadEducation, hadCategories] = await Promise.all([
    fileExists(paths.education),
    fileExists(paths.categories),
  ]);

  const normalized = normalizeResumeData({
    skills: data.skills ?? {},
    jobs: data.jobs,
    education: data.education ?? {},
    categories: data.categories ?? {},
  });
  const education = asRecord(normalized.education, paths.education);
  const categories = asRecord(normalized.categories, paths.categories);
  const writeEducation = hadEducation || hasContent(education);
  const writeCategories = hadCategories || hasContent(categories);

  const rebuilt = rebuildEnrichedJobs({ jobs: normalized.jobs, skills: normalized.skills, education });
  const enrichedJobs = rebuilt.ok ? rebuilt.rows : null;

  const findings = checkResumeDataConsistency({
    skills: normalized.skills,
    jobs: normalized.jobs,
    education,
    categories: writeCategories ? categories : undefined,
    enrichedJobs,
  });
  if (hasBlockingFindings(findings)) {
    const error = new ResumeConsistencyError(id, findings);
    const groups = groupFindingsBySeverity(error.findings);
    const lines = [...groups.error, ...groups.warning].map((f) => `  [${f.severity}] [${f.code}] ${f.where}: ${f.message}`);
    reportError(error, `[resumeStore] Refusing to write resume "${id}"\n${lines.join('\n')}`);
    throw error;
  }

  const writes = [
    ['jobs', writeResumeJsonIfChanged(paths.jobs, normalized.jobs)],
    ['skills', writeResumeJsonIfChanged(paths.skills, normalized.skills)],
    ['enrichedJobs', writeResumeJsonIfChanged(paths.enrichedJobs, enrichedJobs)],
  ];
  if (writeEducation) writes.push(['education', writeResumeJsonIfChanged(paths.education, education)]);
  if (writeCategories) writes.push(['categories', writeResumeJsonIfChanged(paths.categories, categories)]);
  const results = await Promise.all(writes.map(([, p]) => p));
  const writtenFiles = writes.filter((_, i) => results[i]).map(([key]) => RESUME_FILES[key]);

  if (updateIndex) {
    const entry = await readParsedResumesIndexEntry(parsedDir, id);
    const jobCount = countJobs(normalized.jobs);
    const skillCount = countSkills(normalized.skills);
    if (!entry || entry.jobCount !== jobCount || entry.skillCount !== skillCount) {
      await writeParsedResumesIndex(parsedDir);
      writtenFiles.push(PARSED_RESUMES_INDEX_FILENAME);
    }
  }

  for (const fix of normalized.applied) log(`[resumeStore] ${id}: normalized [${fix.code}] ${fix.where}: ${fix.message}`);
  log(`[resumeStore] ${id}: ${normalized.applied.length} normalization fix(es); wrote ${writtenFiles.length ? writtenFiles.join(', ') : 'nothing (no changes)'}`);

  return {
    appliedFixes: normalized.applied,
    writtenFiles,
    data: { jobs: normalized.jobs, skills: normalized.skills, education, categories, enrichedJobs },
  };
}
