#!/usr/bin/env node
/**
 * Check (and optionally mechanically fix) cross-file consistency of parsed resume data.
 *
 * Usage:
 *   node scripts/check-resume-data-consistency.mjs [--resume <id>] [--fix] [--dry-run] [--warnings-ok] [--parsed-dir <dir>]
 *
 *   (no flags)     report findings for every resume under parsed_resumes/; exit 1 on any error/warning
 *   --resume id    limit to one resume folder
 *   --fix          apply mechanical fixes through resumeStore.commitResume (the one write path);
 *                  refuses to write when a non-mechanical finding would remain
 *   --dry-run      show what --fix would change without writing
 *   --warnings-ok  exit 0 when only warnings/info remain (CI gate: errors still fail)
 *
 * Exit codes: 0 clean (or only informational findings; with --warnings-ok, only warnings/info) · 1 blocking findings remain · 2 usage / IO failure
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import {
  checkResumeDataConsistency,
  findSkillUrlOrphans,
  fixResumeDataConsistency,
  groupFindingsBySeverity,
  hasBlockingFindings,
  SEVERITY,
} from '../modules/data/resumeDataConsistency.mjs';
import { ResumeConsistencyError, commitResume } from '../modules/server/resumeStore.mjs';
import { reportError } from '../modules/utils/errorReporting.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const DEFAULT_PARSED_DIR = process.env.PARSED_RESUMES_DIR
  ? path.resolve(PROJECT_ROOT, process.env.PARSED_RESUMES_DIR)
  : path.join(PROJECT_ROOT, 'parsed_resumes');

const RESUME_FILES = {
  jobs: 'jobs.json',
  skills: 'skills.json',
  categories: 'categories.json',
  education: 'education.json',
  enrichedJobs: 'enriched-jobs.json',
};

/**
 * @param {string[]} argv
 * @returns {{ resume: string|null, fix: boolean, dryRun: boolean, warningsOk: boolean, parsedDir: string, help: boolean }}
 */
export function parseArgs(argv, defaultParsedDir = DEFAULT_PARSED_DIR) {
  const out = { resume: null, fix: false, dryRun: false, warningsOk: false, parsedDir: defaultParsedDir, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--resume') {
      out.resume = argv[++i] ?? null;
      if (!out.resume) throw new Error('--resume requires a resume id');
    } else if (a.startsWith('--resume=')) {
      out.resume = a.slice('--resume='.length) || null;
    } else if (a === '--fix') {
      out.fix = true;
    } else if (a === '--dry-run') {
      out.dryRun = true;
    } else if (a === '--warnings-ok') {
      out.warningsOk = true;
    } else if (a === '--parsed-dir') {
      const dir = argv[++i];
      if (!dir) throw new Error('--parsed-dir requires a path');
      out.parsedDir = path.resolve(dir);
    } else if (a === '--help' || a === '-h') {
      out.help = true;
    } else {
      throw new Error(`Unknown argument: ${a}`);
    }
  }
  return out;
}

const USAGE = 'Usage: node scripts/check-resume-data-consistency.mjs [--resume <id>] [--fix] [--dry-run] [--warnings-ok] [--parsed-dir <dir>]';

async function readTextIfExists(filePath) {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    throw error;
  }
}

/**
 * @param {string} dir resume folder
 * @returns {Promise<{ data: Record<string, unknown> }>}
 */
export async function loadResumeFolder(dir) {
  const data = {};
  for (const [field, fileName] of Object.entries(RESUME_FILES)) {
    const text = await readTextIfExists(path.join(dir, fileName));
    if (text == null) {
      data[field] = undefined;
      continue;
    }
    try {
      data[field] = JSON.parse(text);
    } catch (error) {
      reportError(error, `[check-resume-data-consistency] ${fileName} in ${dir} is not valid JSON`);
      throw error;
    }
  }
  if (data.jobs === undefined) throw new Error(`[check-resume-data-consistency] ${path.join(dir, 'jobs.json')} not found`);
  if (data.skills === undefined) throw new Error(`[check-resume-data-consistency] ${path.join(dir, 'skills.json')} not found`);
  if (data.enrichedJobs === undefined) data.enrichedJobs = null;
  return { data };
}

/**
 * @param {string} parsedDir
 * @returns {Promise<string[]>}
 */
export async function listResumeIds(parsedDir) {
  const entries = await fs.readdir(parsedDir, { withFileTypes: true });
  const ids = [];
  for (const ent of entries) {
    if (!ent.isDirectory() || ent.name.startsWith('.') || ent.name.startsWith('_local-')) continue;
    if ((await readTextIfExists(path.join(parsedDir, ent.name, 'jobs.json'))) == null) continue;
    ids.push(ent.name);
  }
  return ids.sort();
}

function printGroup(log, title, items) {
  if (!items.length) return;
  log(`\n${title} (${items.length})`);
  for (const f of items) {
    log(`  [${f.code}] ${f.where}`);
    log(`      ${f.message}`);
  }
}

/**
 * @param {string[]} argv
 * @param {{ log?: (line: string) => void, error?: (line: string) => void }} [io]
 * @returns {Promise<number>} exit code
 */
export async function runCli(argv, io = {}) {
  const log = io.log ?? ((line) => console.log(line));
  const errorLog = io.error ?? ((line) => console.error(line));
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    reportError(error, '[check-resume-data-consistency] Invalid arguments');
    errorLog(USAGE);
    return 2;
  }
  if (args.help) {
    log(USAGE);
    return 0;
  }

  let ids;
  try {
    ids = args.resume ? [args.resume] : await listResumeIds(args.parsedDir);
  } catch (error) {
    reportError(error, `[check-resume-data-consistency] Cannot list resumes in ${args.parsedDir}`);
    return 2;
  }
  if (!ids.length) {
    errorLog(`No resume folders with jobs.json under ${args.parsedDir}`);
    return 2;
  }

  const skillUrlsText = await readTextIfExists(path.join(args.parsedDir, 'skill-urls.json'));
  const indexText = await readTextIfExists(path.join(args.parsedDir, 'non-local-resumes.json'));
  const skillUrls = skillUrlsText != null ? JSON.parse(skillUrlsText) : undefined;
  const index = indexText != null ? JSON.parse(indexText) : undefined;
  const checkingAll = !args.resume;

  let blocking = false;
  const allSkillsMaps = [];
  const isBlocking = (findings) => (args.warningsOk
    ? findings.some((f) => f.severity === SEVERITY.ERROR)
    : hasBlockingFindings(findings));

  for (const id of ids) {
    const dir = path.join(args.parsedDir, id);
    let loaded;
    try {
      loaded = await loadResumeFolder(dir);
    } catch (error) {
      reportError(error, `[check-resume-data-consistency] Failed to load resume "${id}"`);
      return 2;
    }
    const { data } = loaded;
    allSkillsMaps.push(data.skills);

    let findings = checkResumeDataConsistency({ ...data, skillUrls, index, resumeId: id });
    if (checkingAll) findings = findings.filter((f) => f.code !== 'skill-url-orphan');

    log(`\n=== ${id} (${dir}) ===`);
    const groups = groupFindingsBySeverity(findings);
    printGroup(log, 'ERRORS', groups.error);
    printGroup(log, 'WARNINGS', groups.warning);
    printGroup(log, 'INFO', groups.info);
    log(`\n${groups.error.length} error(s), ${groups.warning.length} warning(s), ${groups.info.length} info`);

    if (args.dryRun) {
      const fixed = fixResumeDataConsistency(data);
      const changedFiles = [];
      for (const [field, fileName] of Object.entries(RESUME_FILES)) {
        const before = data[field];
        const after = fixed[field];
        if (after == null && before == null) continue;
        if (JSON.stringify(before) === JSON.stringify(after)) continue;
        changedFiles.push(fileName);
      }
      log(`\nDRY-RUN: fixes --fix would apply (${fixed.applied.length})`);
      for (const a of fixed.applied) log(`  [${a.code}] ${a.where}\n      ${a.message}`);
      log(`  files that would change: ${changedFiles.length ? changedFiles.join(', ') : 'none'}`);
    } else if (args.fix) {
      let result;
      try {
        result = await commitResume(args.parsedDir, id, {
          jobs: data.jobs,
          skills: data.skills,
          education: data.education ?? {},
          categories: data.categories ?? {},
        }, { log: () => {} });
      } catch (error) {
        if (!(error instanceof ResumeConsistencyError)) throw error;
        const remaining = groupFindingsBySeverity(error.findings);
        log(`\nFIX REFUSED: ${remaining.error.length} error(s), ${remaining.warning.length} warning(s) are not mechanical; nothing written`);
        printGroup(log, 'REMAINING ERRORS', remaining.error);
        printGroup(log, 'REMAINING WARNINGS', remaining.warning);
        blocking = true;
        continue;
      }
      log(`\nFIXES APPLIED (${result.appliedFixes.length})`);
      for (const a of result.appliedFixes) log(`  [${a.code}] ${a.where}\n      ${a.message}`);
      for (const fileName of result.writtenFiles) {
        log(`  wrote ${fileName === 'non-local-resumes.json' ? path.join(args.parsedDir, fileName) : path.join(dir, fileName)}`);
      }
      const after = checkResumeDataConsistency({ ...result.data, skillUrls, index, resumeId: id })
        .filter((f) => !checkingAll || f.code !== 'skill-url-orphan');
      const remaining = groupFindingsBySeverity(after);
      log(`\nAfter fix: ${remaining.error.length} error(s), ${remaining.warning.length} warning(s), ${remaining.info.length} info`);
      printGroup(log, 'REMAINING ERRORS', remaining.error);
      printGroup(log, 'REMAINING WARNINGS', remaining.warning);
      if (isBlocking(after)) blocking = true;
      continue;
    }
    if (isBlocking(findings)) blocking = true;
  }

  if (checkingAll && skillUrls !== undefined) {
    const orphans = findSkillUrlOrphans(skillUrls, allSkillsMaps);
    log(`\n=== skill-urls.json (shared across ${ids.length} resume(s)) ===`);
    printGroup(log, 'INFO', orphans);
    if (!orphans.length) log('  every catalog slug matches a skill in at least one resume');
  }

  return blocking ? 1 : 0;
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isDirectRun) {
  runCli(process.argv.slice(2))
    .then((code) => { process.exitCode = code; })
    .catch((error) => {
      reportError(error, '[check-resume-data-consistency] Unhandled failure');
      process.exitCode = 2;
    });
}
