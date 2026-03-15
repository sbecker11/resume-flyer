#!/usr/bin/env node
/**
 * Invoke the resume parser (resume_to_flock.py) with a given resume.docx path.
 * Usage:
 *   node scripts/run-parse-resume.mjs --docx <path-to.docx> [--out <output-dir>] [--id <id>] [--force]
 *   Or set RESUME_PARSER_PATH (default: ../../workspace-resume/resume-parser).
 * If --id is given, --out defaults to RESUME_PARSER_PATH/parsed_resumes/<id> (parser repo).
 * If output dir already has jobs.mjs at root, exit unless --force.
 */
import 'dotenv/config';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const PARSED_RESUMES_DIR = path.join(PROJECT_ROOT, 'parsed_resumes');

const PARSER_SCRIPT = 'resume_to_flock.py';
const DEFAULT_PARSER_PATH = path.resolve(PROJECT_ROOT, '..', '..', 'workspace-resume', 'resume-parser');
const TIMEOUT_MS = 120_000;

/** Env var names that should not be inherited so the parser uses its own .env (resume-parser repo). */
const PARSER_STRIP_ENV_KEYS = ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'LLM_PROVIDER'];

/** Return env for the parser subprocess: current env minus API keys so parser .env is used. */
function getParserEnv() {
  const env = { ...process.env };
  for (const key of PARSER_STRIP_ENV_KEYS) {
    delete env[key];
  }
  return env;
}

function printHelp() {
  console.log(`
Parse a resume .docx into a parsed-resume folder (jobs.mjs, skills.mjs, categories.mjs at folder root).

Usage:
  npm run parse-resume -- --docx <path-to.docx> (--id <id> | --out <dir>) [--force]

  (Use "--" so npm passes --docx/--id to the script, not to npm.)

Required:
  --docx <path>   Path to the resume .docx file to parse.

Output (exactly one):
  --id <id>       Output folder will be <parser>/parsed_resumes/<id>. E.g. --id 6 → .../parsed_resumes/6; --id resume-6 → .../parsed_resumes/resume-6
  --out <dir>     Output directory; relative paths are resolved from the parser repo (e.g. parsed_resumes/resume-6). (If both --id and --out are given, --out wins.)

Options:
  --force         Overwrite output dir if it already contains jobs (default: exit with error).
  --help, -h      Show this help.

Environment:
  RESUME_PARSER_PATH  Path to the Python parser (default: ../../workspace-resume/resume-parser).

Example:
  npm run parse-resume -- --docx ~/Documents/resume.docx --id my-resume

After a successful run, set app_state.json user-settings.currentResumeId to the same <id> value (e.g. "6" or "resume-6")
to use this parsed resume in the app. If resume-flock's parsed_resumes is a symlink to the parser's parsed_resumes, the folder will appear there.
`);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { docx: null, out: null, id: null, force: false, help: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--help' || args[i] === '-h') {
      out.help = true;
    } else if (args[i] === '--docx' && args[i + 1]) {
      out.docx = path.resolve(process.cwd(), args[++i]);
    } else if (args[i] === '--out' && args[i + 1]) {
      out.out = args[++i]; // resolved in main() relative to parser path if not absolute
    } else if (args[i] === '--id' && args[i + 1]) {
      out.id = args[++i];
    } else if (args[i] === '--force') {
      out.force = true;
    }
  }
  // --id without --out: outDir is set in main() from parser's parsed_resumes/resume-<id>
  if (out.id && !out.out) {
    out.out = null;
  }
  return out;
}

async function outputDirHasJobs(outDir) {
  try {
    await fs.access(path.join(outDir, 'jobs.mjs'));
    return true;
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  return false;
}

function getParserPath() {
  return process.env.RESUME_PARSER_PATH
    ? path.resolve(process.cwd(), process.env.RESUME_PARSER_PATH)
    : DEFAULT_PARSER_PATH;
}

async function main() {
  const { docx, out: outArg, id, force, help } = parseArgs();
  if (help || (!docx && process.argv.length <= 2)) {
    printHelp();
    process.exit(help || !docx ? 0 : 1);
  }
  if (!docx) {
    console.error('Missing --docx. Run with --help for usage.');
    process.exit(1);
  }

  const parserPath = getParserPath();
  let outDir = outArg ?? (id != null ? path.join(parserPath, 'parsed_resumes', id) : null);
  if (outDir && outArg && !path.isAbsolute(outArg)) {
    outDir = path.resolve(parserPath, outArg);
  }
  if (!outDir) {
    console.error('Provide either --out <dir> or --id <id>. Run with --help for usage.');
    process.exit(1);
  }

  const hasExisting = await outputDirHasJobs(outDir);
  if (hasExisting && !force) {
    console.error('Output dir already contains jobs.mjs. Use --force to overwrite.');
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

  const scriptPath = path.join(parserPath, PARSER_SCRIPT);
  let pythonBin = 'python3';
  for (const venvDir of ['venv']) {
    try {
      const venvPython = path.join(parserPath, venvDir, 'bin', 'python');
      await fs.access(venvPython);
      pythonBin = venvPython;
      break;
    } catch {}
  }
  try {
    await fs.access(scriptPath);
  } catch (e) {
    if (e.code === 'ENOENT') {
      console.error('Parser not found:', scriptPath);
      console.error('Expected a directory containing resume_to_flock.py.');
      console.error('Default is ../../workspace-resume/resume-parser (relative to resume-flock).');
      console.error('Set RESUME_PARSER_PATH to your parser directory, e.g.:');
      console.error('  export RESUME_PARSER_PATH=/path/to/resume-parser');
      console.error('  npm run parse-resume -- --docx file.docx --id my-resume');
      process.exit(1);
    }
    throw e;
  }

  await fs.mkdir(outDir, { recursive: true });

  return new Promise((resolve, reject) => {
    const child = spawn(pythonBin, [scriptPath, docx, '-o', outDir], {
      cwd: parserPath,
      stdio: ['ignore', 'inherit', 'inherit'],
      env: getParserEnv(),
    });
    const t = setTimeout(() => {
      child.kill('SIGTERM');
      console.error('Parser timed out after', TIMEOUT_MS / 1000, 's');
      reject(new Error('Parser timeout'));
    }, TIMEOUT_MS);
    child.on('error', (err) => {
      clearTimeout(t);
      console.error('Failed to start parser:', err.message);
      reject(err);
    });
    child.on('close', (code, signal) => {
      clearTimeout(t);
      if (code === 0) {
        console.log('Parser wrote output to:', outDir);
        if (id != null) {
          console.log('To use in resume-flock, set app_state.json user-settings.currentResumeId to:', JSON.stringify(id));
        }
        resolve();
      } else {
        reject(new Error(`Parser exited with code ${code}${signal ? ` signal ${signal}` : ''}`));
      }
    });
  });
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
