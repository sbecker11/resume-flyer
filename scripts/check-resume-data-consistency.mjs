#!/usr/bin/env node
/**
 * Check (and optionally mechanically fix) cross-file consistency of parsed resume data.
 *
 * Usage:
 *   node scripts/check-resume-data-consistency.mjs [--resume <id>] [--fix] [--dry-run] [--parsed-dir <dir>]
 *
 *   (no flags)   report findings for every resume under parsed_resumes/; exit 1 on any error/warning
 *   --resume id  limit to one resume folder
 *   --fix        apply mechanical fixes and write files back (formatting preserved)
 *   --dry-run    show what --fix would change without writing
 *
 * Exit codes: 0 clean (or only informational findings) · 1 blocking findings remain · 2 usage / IO failure
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
} from '../modules/data/resumeDataConsistency.mjs';
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
 * @returns {{ resume: string|null, fix: boolean, dryRun: boolean, parsedDir: string, help: boolean }}
 */
export function parseArgs(argv, defaultParsedDir = DEFAULT_PARSED_DIR) {
  const out = { resume: null, fix: false, dryRun: false, parsedDir: defaultParsedDir, help: false };
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

const UNICODE_ESCAPE_RE = /\\u[0-9a-fA-F]{4}/;

/**
 * Serialize like the existing file: 2-space indent, \uXXXX escapes for non-ASCII when the
 * current text uses them (resume-parser writes ensure_ascii JSON), and the same trailing-newline
 * state. New files get a trailing newline.
 * @param {unknown} value
 * @param {string|null} existingText
 */
export function formatJsonLike(value, existingText) {
  let text = JSON.stringify(value, null, 2);
  if (existingText != null && UNICODE_ESCAPE_RE.test(existingText)) {
    text = text.replace(/[\u0080-\uffff]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
  }
  const wantNewline = existingText == null || existingText.length === 0 || existingText.endsWith('\n');
  return wantNewline ? `${text}\n` : text;
}

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
 * @returns {Promise<{ data: Record<string, unknown>, texts: Record<string, string|null> }>}
 */
export async function loadResumeFolder(dir) {
  const texts = {};
  const data = {};
  for (const [field, fileName] of Object.entries(RESUME_FILES)) {
    const text = await readTextIfExists(path.join(dir, fileName));
    texts[field] = text;
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
  return { data, texts };
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
    errorLog('Usage: node scripts/check-resume-data-consistency.mjs [--resume <id>] [--fix] [--dry-run] [--parsed-dir <dir>]');
    return 2;
  }
  if (args.help) {
    log('Usage: node scripts/check-resume-data-consistency.mjs [--resume <id>] [--fix] [--dry-run] [--parsed-dir <dir>]');
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

  for (const id of ids) {
    const dir = path.join(args.parsedDir, id);
    let loaded;
    try {
      loaded = await loadResumeFolder(dir);
    } catch (error) {
      reportError(error, `[check-resume-data-consistency] Failed to load resume "${id}"`);
      return 2;
    }
    const { data, texts } = loaded;
    allSkillsMaps.push(data.skills);

    let findings = checkResumeDataConsistency({ ...data, skillUrls, index, resumeId: id });
    if (checkingAll) findings = findings.filter((f) => f.code !== 'skill-url-orphan');

    log(`\n=== ${id} (${dir}) ===`);
    const groups = groupFindingsBySeverity(findings);
    printGroup(log, 'ERRORS', groups.error);
    printGroup(log, 'WARNINGS', groups.warning);
    printGroup(log, 'INFO', groups.info);
    log(`\n${groups.error.length} error(s), ${groups.warning.length} warning(s), ${groups.info.length} info`);

    if (args.fix || args.dryRun) {
      const fixed = fixResumeDataConsistency(data);
      const changedFiles = [];
      for (const [field, fileName] of Object.entries(RESUME_FILES)) {
        const before = data[field];
        const after = fixed[field];
        if (after == null && before == null) continue;
        if (JSON.stringify(before) === JSON.stringify(after)) continue;
        changedFiles.push({ field, fileName, after });
      }
      log(`\n${args.fix && !args.dryRun ? 'FIXES APPLIED' : 'DRY-RUN: fixes --fix would apply'} (${fixed.applied.length})`);
      for (const a of fixed.applied) log(`  [${a.code}] ${a.where}\n      ${a.message}`);
      log(`  files that would change: ${changedFiles.length ? changedFiles.map((c) => c.fileName).join(', ') : 'none'}`);

      if (args.fix && !args.dryRun) {
        for (const { field, fileName, after } of changedFiles) {
          const filePath = path.join(dir, fileName);
          try {
            await fs.writeFile(filePath, formatJsonLike(after, texts[field]), 'utf-8');
            log(`  wrote ${filePath}`);
          } catch (error) {
            reportError(error, `[check-resume-data-consistency] Failed to write ${filePath}`);
            throw error;
          }
        }
        const after = checkResumeDataConsistency({ ...fixed, skillUrls, index, resumeId: id })
          .filter((f) => !checkingAll || f.code !== 'skill-url-orphan');
        const remaining = groupFindingsBySeverity(after);
        log(`\nAfter fix: ${remaining.error.length} error(s), ${remaining.warning.length} warning(s), ${remaining.info.length} info`);
        printGroup(log, 'REMAINING ERRORS', remaining.error);
        printGroup(log, 'REMAINING WARNINGS', remaining.warning);
        if (hasBlockingFindings(after)) blocking = true;
        continue;
      }
    }
    if (hasBlockingFindings(findings)) blocking = true;
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
