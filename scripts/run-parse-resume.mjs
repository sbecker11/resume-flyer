#!/usr/bin/env node
/**
 * Invoke the resume parser (resume-parser package) with a given resume.docx path.
 * Usage:
 *   node scripts/run-parse-resume.mjs --docx <path-to.docx> [--out <output-dir>] [--id <id>] [--force]
 * Requires: pip install -r requirements.txt (resume-parser package).
 * If --id is given, --out defaults to parsed_resumes/<id>.
 * If output dir already has jobs.json at root, exit unless --force.
 */
import 'dotenv/config';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import {
  RESUME_PARSER_PYTHON_MODULE_UNSET_ENV,
  RESUME_PARSER_PROJECT_PATH_RELATIVE_UNSET_ENV,
} from '../modules/config/defaultResumeParserModule.mjs';
import { reportError } from '../modules/utils/errorReporting.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const PARSED_RESUMES_DIR = process.env.PARSED_RESUMES_DIR || path.join(PROJECT_ROOT, 'parsed_resumes');

/** Python module to run (resume-parser package). Override with RESUME_PARSER_MODULE if the package uses a different entry point. */
const PARSER_MODULE = process.env.RESUME_PARSER_MODULE || RESUME_PARSER_PYTHON_MODULE_UNSET_ENV;
const RESUME_PARSER_PROJECT_PATH = process.env.RESUME_PARSER_PROJECT_PATH
  ? path.resolve(PROJECT_ROOT, process.env.RESUME_PARSER_PROJECT_PATH)
  : path.resolve(PROJECT_ROOT, RESUME_PARSER_PROJECT_PATH_RELATIVE_UNSET_ENV);
const RESUME_PARSER_PYTHON_BIN = path.join(RESUME_PARSER_PROJECT_PATH, 'venv', 'bin', 'python3');
const TIMEOUT_MS = 120_000;

/** Env var names that should not be inherited so the parser uses its own .env. */
const PARSER_STRIP_ENV_KEYS = ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'LLM_PROVIDER'];

/** Exported for unit tests. */
export function getParserEnv(env = process.env) {
  const result = { ...env };
  for (const key of PARSER_STRIP_ENV_KEYS) {
    delete result[key];
  }
  return result;
}

function printHelp() {
  console.log(`
Parse a resume .docx into a parsed-resume folder (jobs.json, skills.json, categories.json at folder root).

Usage:
  npm run parse-resume -- --docx <path-to.docx> (--id <id> | --out <dir>) [--force]

  (Use "--" so npm passes --docx/--id to the script, not to npm.)

Required:
  --docx <path>   Path to the resume .docx file to parse.

Output (exactly one):
  --id <id>       Output folder will be parsed_resumes/<id>.
  --out <dir>     Output directory; use --out ./parsed_resumes/<id> to write to resume-flyer's folder. (If both --id and --out are given, --out wins.)

Options:
  --force         Overwrite output dir if it already contains jobs (default: exit with error).
  --help, -h      Show this help.

Environment:
  PARSED_RESUMES_DIR  Default output parent (default: ./parsed_resumes).
  RESUME_PARSER_PROJECT_PATH  Path to resume-parser project (default: ../resume-parser).
  RESUME_PARSER_MODULE  Python -m module (default: resume_parser.resume_to_json). Install package: pip install -r requirements.txt

Example:
  npm run parse-resume -- --docx ~/Documents/resume.docx --id my-resume

After a successful run, set app_state.json user-settings.currentResumeId to the same <id> value (e.g. "6" or "resume-6")
to use this parsed resume in the app. Use --out ./parsed_resumes/<id> to write directly to resume-flyer's parsed_resumes folder.
`);
}

/**
 * Parse CLI argv. Exported for unit tests.
 * @param {string[]} [argv=process.argv.slice(2)]
 * @param {string} [cwd=process.cwd()]
 * @returns {{ docx: string | null, out: string | null, id: string | null, force: boolean, help: boolean }}
 */
export function parseArgs(argv = process.argv.slice(2), cwd = process.cwd()) {
  const out = { docx: null, out: null, id: null, force: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--help' || argv[i] === '-h') {
      out.help = true;
    } else if (argv[i] === '--docx' && argv[i + 1]) {
      out.docx = path.resolve(cwd, argv[++i]);
    } else if (argv[i] === '--out' && argv[i + 1]) {
      out.out = argv[++i];
    } else if (argv[i] === '--id' && argv[i + 1]) {
      out.id = argv[++i];
    } else if (argv[i] === '--force') {
      out.force = true;
    }
  }
  if (out.id && !out.out) {
    out.out = null;
  }
  return out;
}

async function outputDirHasJobs(outDir) {
  try {
    await fs.access(path.join(outDir, 'jobs.json'));
    return true;
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  return false;
}

async function main() {
  const { docx, out: outArg, id, force, help } = parseArgs(process.argv.slice(2), process.cwd());
  if (help || (!docx && process.argv.length <= 2)) {
    printHelp();
    process.exit(help || !docx ? 0 : 1);
  }
  if (!docx) {
    console.error('Missing --docx. Run with --help for usage.');
    process.exit(1);
  }

  let outDir = outArg ?? (id != null ? path.join(PARSED_RESUMES_DIR, id) : null);
  if (outDir && outArg && !path.isAbsolute(outArg)) {
    outDir = path.resolve(PROJECT_ROOT, outArg);
  }
  if (!outDir) {
    console.error('Provide either --out <dir> or --id <id>. Run with --help for usage.');
    process.exit(1);
  }

  const hasExisting = await outputDirHasJobs(outDir);
  if (hasExisting && !force) {
    console.error('Output dir already contains jobs.json. Use --force to overwrite.');
    process.exit(1);
  }

  try {
    await fs.access(docx);
  } catch (e) {
    if (e.code === 'ENOENT') {
      console.error('Docx file not found:', docx);
      process.exit(1);
    }
    throw e;
  }

  await fs.mkdir(outDir, { recursive: true });

  // Fail-fast: verify that the configured python can import resume_parser before parsing anything.
  await fs.access(RESUME_PARSER_PYTHON_BIN);
  await new Promise((resolve, reject) => {
    const child = spawn(RESUME_PARSER_PYTHON_BIN, ['-c', 'import resume_parser'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: getParserEnv(),
      cwd: RESUME_PARSER_PROJECT_PATH,
    });
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    const t = setTimeout(() => {
      try { child.kill('SIGTERM'); } catch {}
      reject(new Error('resume_parser import timed out'));
    }, 10_000);
    child.on('close', (code) => {
      clearTimeout(t);
      if (code === 0) resolve();
      else reject(new Error(`resume_parser import failed (code ${code}): ${stderr}`));
    });
    child.on('error', (err) => reject(err));
  });

  const pythonBin = RESUME_PARSER_PYTHON_BIN;
  const args = ['-m', PARSER_MODULE, docx, '-o', outDir];

  return new Promise((resolve, reject) => {
    const child = spawn(pythonBin, args, {
      stdio: ['ignore', 'inherit', 'inherit'],
      env: getParserEnv(),
      cwd: RESUME_PARSER_PROJECT_PATH,
    });
    const t = setTimeout(() => {
      child.kill('SIGTERM');
      console.error('Parser timed out after', TIMEOUT_MS / 1000, 's');
      reject(new Error('Parser timeout'));
    }, TIMEOUT_MS);
    child.on('error', (err) => {
      clearTimeout(t);
      console.error('Failed to start parser:', err.message);
      console.error('Ensure the resume-parser package is installed: pip install -r requirements.txt');
      reject(err);
    });
    child.on('close', (code, signal) => {
      clearTimeout(t);
      if (code === 0) {
        console.log('Parser wrote output to:', outDir);
        if (id != null) {
          console.log('To use in resume-flyer, set app_state.json user-settings.currentResumeId to:', JSON.stringify(id));
        }
        resolve();
      } else {
        reject(new Error(`Parser exited with code ${code}${signal ? ` signal ${signal}` : ''}`));
      }
    });
  });
}

const isMain = process.argv[1]?.includes('run-parse-resume');
if (isMain) {
  main().catch((err) => {
    reportError(err, '[run-parse-resume] Parser run failed');
    process.exit(1);
  });
}
