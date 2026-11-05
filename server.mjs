import express from 'express';
import fs from 'fs/promises'; // Use promises for async/await
import fsSync from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import { spawn } from 'child_process';
import sanitizeFilename from 'sanitize-filename';
import fetch from 'node-fetch';
import { parseMjsExport } from './modules/data/parseMjsExport.mjs';
import { normalizeParserJobs, normalizeParserSkills, normalizeParserCategories } from './modules/data/parsedResumeAdapter.mjs';
import { removeSkillFromResumeData } from './modules/resume-details-editor/removeSkillFromResume.mjs';
import { atomicWriteWithLock, cleanStaleLock } from './modules/utils/atomicFileUtils.mjs';
import { assertSkillInfoUrl } from './modules/utils/skillUrlCatalog.mjs';
import {
    readSharedSkillUrlCatalog,
    skillUrlsMirrorPath,
    upsertSharedSkillUrl,
} from './modules/utils/skillUrlCatalogStore.mjs';
import { reportError } from './modules/utils/errorReporting.mjs';
import { createLocalDevQuitHandler } from './modules/server/localDevQuit.mjs';
import { mergeSkillEntryInto } from './modules/server/skillMerge.mjs';
import { writeResumeJson } from './modules/server/resumeJsonFile.mjs';
import { ResumeConsistencyError, commitResume, loadResume } from './modules/server/resumeStore.mjs';
import {
    mirrorCategoriesIntoSkills,
    replaceSkillKeyInCategories,
    replaceSkillNameInDescriptions,
    resolveSkillKey,
    rewriteSkillIdInRecords,
    skillAliasSet,
    slugifyDisplayName,
    withDerivedMetaPaths as withDerivedMetaPathsIn,
} from './modules/server/resumeDataHelpers.mjs';
import {
    archiveReparseBackup,
    listReparseHistory,
    restoreReparseBackup,
    restoreReparseHistoryEntry,
    stashDerivedFilesForReparse,
} from './modules/resume/reparseHistory.mjs';
import {
    refreshPaletteCatalogCache,
    getCachedPaletteCatalogBundle,
    getLastPaletteCatalogSourceUrl,
    hasPaletteCatalogCache,
    primePaletteCatalogCacheFromBundle,
} from './modules/utils/paletteCatalogServerCache.mjs';
import { resolvePaletteCatalogS3UrlFromRecord } from './modules/utils/paletteCatalogS3Url.mjs';
import { getAnthropicApiKey, getParserSpawnEnv, getSkillInfoModel } from './modules/utils/anthropicEnv.mjs';
import { callAnthropicMessages } from './modules/utils/anthropicLlm.mjs';
import {
    RESUME_PARSER_PYTHON_MODULE_UNSET_ENV,
    RESUME_PARSER_PROJECT_PATH_RELATIVE_UNSET_ENV,
} from './modules/config/defaultResumeParserModule.mjs';
// Load .env from project root (see docs/REPLICATE-PORTS-CONFIG.md)
dotenv.config({ path: path.join(process.cwd(), '.env') });

const PROJECT_ROOT = process.cwd();
/** Local palette JSON directory (GET /api/palette-catalog, startup cache when S3 unset). */
const PALETTE_DIR_PATH = path.resolve(PROJECT_ROOT, 'static_content', 'colorPalettes');
const CSS_FILE_PATH = path.resolve(PROJECT_ROOT, 'static_content', 'css', 'palette-styles.css');
/** Persisted app state (layout, theme, currentResumeId, system-constants, etc.). Overridable via APP_STATE_FILE for tests. */
const STATE_FILE_PATH = process.env.APP_STATE_FILE
    ? path.resolve(PROJECT_ROOT, process.env.APP_STATE_FILE)
    : path.resolve(PROJECT_ROOT, 'app_state.json');
const STATE_DEFAULT_PATH = path.resolve(PROJECT_ROOT, 'public', 'app_state.default.json');
/** Overridable via process.env.PARSED_RESUMES_DIR for integration tests */
const PARSED_RESUMES_DIR = process.env.PARSED_RESUMES_DIR
    ? (path.isAbsolute(process.env.PARSED_RESUMES_DIR)
        ? process.env.PARSED_RESUMES_DIR
        : path.resolve(PROJECT_ROOT, process.env.PARSED_RESUMES_DIR))
    : path.resolve(PROJECT_ROOT, 'parsed_resumes');

/** Absolute folder of jobs.json / skills.json for a resume id. Not persisted in meta.json. */
const withDerivedMetaPaths = (id, meta) => withDerivedMetaPathsIn(PARSED_RESUMES_DIR, id, meta);

const SYNC_LOGS_DIR = path.resolve(PROJECT_ROOT, 'sync-logs');
const SYNC_LOGS_INDEX_FILE = path.resolve(SYNC_LOGS_DIR, 'index.json');
const EVENT_DATA_DIR = path.resolve(PROJECT_ROOT, 'event-data');
const ANALYSIS_REPORTS_DIR = path.resolve(PROJECT_ROOT, 'analysis-reports');

const app = express();

/**
 * Active resume-parser child processes (explicitly terminated on Ctrl-C / shutdown).
 * Only long-running resume parsing spawns are tracked.
 */
const ACTIVE_RESUME_PARSER_CHILDREN = new Set();

function trackResumeParserChild(child, label = 'resume-parser') {
    if (!child) return;
    ACTIVE_RESUME_PARSER_CHILDREN.add(child);

    const untrack = () => {
        try { ACTIVE_RESUME_PARSER_CHILDREN.delete(child); } catch { /* ignore */ }
    };
    child.once('exit', untrack);
    child.once('close', untrack);

    try {
        console.log(`[${label}] Spawned pid=${child.pid}`);
    } catch {
        /* ignore */
    }
}

function killActiveResumeParserChildren(signal = 'SIGTERM') {
    const children = Array.from(ACTIVE_RESUME_PARSER_CHILDREN);
    if (!children.length) return;

    console.log(`Remedy: Killing ${children.length} active resume-parser process(es) with ${signal}`);

    for (const child of children) {
        try {
            if (!child.killed) child.kill(signal);
        } catch (e) {
            reportError(e, '[Shutdown] Failed to kill resume-parser child process');
        }
    }
}

// Ensure Ctrl-C (SIGINT) kills active parser processes.
process.on('SIGINT', () => {
    killActiveResumeParserChildren('SIGTERM');
    setTimeout(() => {
        killActiveResumeParserChildren('SIGKILL');
        process.exit(0);
    }, 800);
});

// Ensure external stop/kill (SIGTERM) kills active parser processes.
process.on('SIGTERM', () => {
    killActiveResumeParserChildren('SIGTERM');
    setTimeout(() => {
        killActiveResumeParserChildren('SIGKILL');
        process.exit(0);
    }, 800);
});

// --- Middleware ---
// Enable CORS for all origins (adjust for production if needed)
app.use(cors());

// Parse JSON bodies for the state endpoint
app.use(express.json());
// Parse text bodies for the CSS endpoint
app.use(express.text());

/**
 * Find a unique folder name under PARSED_RESUMES_DIR based on displayName.
 * Returns the base slug if available, otherwise appends (1), (2), … until unique.
 */
async function generateUniqueResumeId(displayName) {
    const base = slugifyDisplayName(displayName);
    try {
        await fs.access(path.join(PARSED_RESUMES_DIR, base));
        // Base exists — find the next available suffix
        let counter = 1;
        while (true) {
            const candidate = `${base} (${counter})`;
            try {
                await fs.access(path.join(PARSED_RESUMES_DIR, candidate));
                counter++;
            } catch {
                return candidate;
            }
        }
    } catch {
        return base;
    }
}

/** Parse resume data file: JSON.parse for .json, parseMjsExport for .mjs. */
function parseResumeFile(content, filePath, varName) {
    if (filePath.endsWith('.json')) return JSON.parse(content);
    return parseMjsExport(content, varName);
}

/**
 * Read jobs, skills, and optional categories from paths and return normalized data
 * for API consumption (jobs array, name-keyed skills, categories dict).
 * Supports .json (parsed_resumes) and .mjs (static_content) formats.
 */
async function readAndNormalizeResumeData(jobsPath, skillsPath, categoriesPath = null) {
    const jobsContent = await fs.readFile(jobsPath, 'utf-8');
    const rawJobs = parseResumeFile(jobsContent, jobsPath, 'jobs');
    let rawSkills = {};
    try {
        const skillsContent = await fs.readFile(skillsPath, 'utf-8');
        rawSkills = parseResumeFile(skillsContent, skillsPath, 'skills') || {};
    } catch (e) {
        if (e.code !== 'ENOENT') throw e;
    }
    let rawCategories = {};
    if (categoriesPath) {
        try {
            const categoriesContent = await fs.readFile(categoriesPath, 'utf-8');
            rawCategories = parseResumeFile(categoriesContent, categoriesPath, 'categories') || {};
        } catch (e) {
            if (e.code !== 'ENOENT') throw e;
        }
    }
    const jobs = normalizeParserJobs(rawJobs);
    const skills = normalizeParserSkills(rawSkills);
    const categories = normalizeParserCategories(rawCategories);
    return { jobs, skills, categories };
}


/** Derived JSON files whose edits would be lost on reparse (hashed for local-change detection). */
const DERIVED_SNAPSHOT_FILES = [
    'jobs.json',
    'skills.json',
    'education.json',
    'other-sections.json',
    'categories.json',
];

/**
 * Stable content hash of derived resume JSON. Used as a parse baseline in meta.json
 * so reparse can warn when the user has made local edits since the last parse.
 * @param {string} dir
 * @returns {Promise<string>}
 */
async function computeDerivedSnapshotHash(dir) {
    const hash = createHash('sha256');
    for (const name of DERIVED_SNAPSHOT_FILES) {
        hash.update(name);
        hash.update('\0');
        try {
            hash.update(await fs.readFile(path.join(dir, name)));
        } catch (e) {
            if (e.code !== 'ENOENT') throw e;
            hash.update('');
        }
        hash.update('\0');
    }
    return hash.digest('hex');
}

/**
 * Write meta.json including derivedSnapshotHash from the current derived files.
 * Call after parser output is in place so the hash matches a clean parse.
 * @param {string} metaPath
 * @param {Record<string, unknown>} metadata
 * @param {string} dir
 * @returns {Promise<Record<string, unknown>>}
 */
async function writeMetaWithParseBaseline(metaPath, metadata, dir) {
    const derivedSnapshotHash = await computeDerivedSnapshotHash(dir);
    const out = { ...metadata, derivedSnapshotHash };
    await fs.writeFile(metaPath, JSON.stringify(out, null, 2));
    return out;
}

/** Keep a successful reparse's stash as a dated history entry. A history-write failure leaves the stash in place. */
async function keepReparseBackup(dir, backupDir) {
    try {
        await archiveReparseBackup(dir, backupDir, { reason: 'reparse' });
    } catch (archiveErr) {
        reportError(
            archiveErr,
            '[ResumeReparse] Failed to archive pre-reparse backup',
            'Leaving the stash in .reparse-backup; parsed files were kept'
        );
    }
}

/**
 * Run the parser's (or a restored backup's) files through the one write path: normalize,
 * re-bake enriched-jobs.json, check. Consistency failures are reported and returned, not
 * thrown: the parser output is kept as written so the resume can be opened and repaired
 * in the editor (or with `npm run check:data -- --resume <id> --fix`). Other failures throw.
 * The caller regenerates the index itself, so updateIndex is off.
 *
 * @param {string} id
 * @param {string} label  log prefix
 * @returns {Promise<{ ok: boolean, findings: object[], appliedFixes: object[], writtenFiles: string[] }>}
 */
async function finalizeParsedResume(id, label) {
    try {
        const data = await loadResume(PARSED_RESUMES_DIR, id);
        const result = await commitResume(PARSED_RESUMES_DIR, id, data, { updateIndex: false });
        return { ok: true, findings: [], appliedFixes: result.appliedFixes, writtenFiles: result.writtenFiles };
    } catch (err) {
        if (err instanceof ResumeConsistencyError) {
            reportError(
                err,
                `[${label}] Parsed files for "${id}" violate the resume data invariants`,
                `Keeping the files as written; fix the findings in the editor or run: npm run check:data -- --resume ${id} --fix`
            );
            return { ok: false, findings: err.findings, appliedFixes: [], writtenFiles: [] };
        }
        throw err;
    }
}

/**
 * Create skills named in a route's `newSkills` list that do not exist yet (by key or display name).
 * @param {Record<string, object>} skills
 * @param {unknown} newSkills  strings or { name } objects
 */
function createMissingSkills(skills, newSkills) {
    for (const entry of (Array.isArray(newSkills) ? newSkills : [])) {
        const name = typeof entry === 'string' ? entry.trim() : (entry?.name && String(entry.name).trim());
        if (!name) continue;
        if (skills[name] == null && resolveSkillKey(skills, name) == null) {
            skills[name] = { name, jobIDs: [] };
        }
    }
}

const RESUME_NOT_FOUND = 'Resume not found.';

/**
 * The one exit for route catch blocks.
 * - ResumeConsistencyError → 422 with the findings (expected refusal; one info-level line, not an error).
 * - ENOENT → 404 with `notFoundMessage` when the route passes one (expected; one info-level line).
 * - Anything else is reported through reportError with what the server does next, then answered
 *   with `status` (default 500) and either `body`, `{ error: message ?? err.message }`, or `html` for page routes.
 * @param {import('express').Response} res
 * @param {unknown} err
 * @param {string} label  log prefix, e.g. 'PATCH meta'
 * @param {{
 *   notFoundMessage?: string,
 *   status?: number,
 *   message?: string,
 *   body?: unknown,
 *   html?: string,
 *   remedy?: string,
 * }} [options]
 */
function sendRouteError(res, err, label, options = {}) {
    const { notFoundMessage, status = 500, message, body, html, remedy } = options;
    if (err instanceof ResumeConsistencyError) {
        console.log(`[${label}] Refused (422): ${err.message}`);
        return res.status(422).json({ error: err.message, findings: err.findings });
    }
    if (notFoundMessage && err?.code === 'ENOENT') {
        console.log(`[${label}] Not found (404): ${err.message}`);
        return res.status(404).json({ error: notFoundMessage });
    }
    reportError(err, `[${label}]`, remedy ?? `Responding ${status}; nothing further written`);
    if (html !== undefined) {
        return res.status(status).send(html);
    }
    if (body !== undefined) {
        return res.status(status).json(body);
    }
    return res.status(status).json({ error: message ?? (err?.message || String(err)) });
}

/** If state file is missing, create it from app_state.default.json (safe defaults). */
async function ensureAppStateFile() {
    try {
        await fs.access(STATE_FILE_PATH);
    } catch (err) {
        if (err.code === 'ENOENT') {
            try {
                const defaultState = await fs.readFile(STATE_DEFAULT_PATH, 'utf-8');
                await fs.writeFile(STATE_FILE_PATH, defaultState, 'utf-8');
                console.log('📄 Initialized app_state.json from app_state.default.json');
            } catch (e) {
                reportError(e, '[server] Could not initialize app_state.json from default', 'Continuing without a state file; GET /api/state responds 404 until it exists');
            }
        }
    }
}

// --- API Endpoints ---
// These must be defined *before* the static file server.

// GET /api/state: Read application state from app_state.json
app.get('/api/state', async (req, res) => {
    try {
        await ensureAppStateFile();
        const stateData = await fs.readFile(STATE_FILE_PATH, 'utf-8');
        const parsedState = JSON.parse(stateData);
        const sizeKB = (Buffer.byteLength(stateData, 'utf8') / 1024).toFixed(1);
        console.log('📖 Loaded app state from app_state.json - size:', sizeKB, 'KB');
        res.json(parsedState);
    } catch (error) {
        if (error.code === 'ENOENT') {
            res.status(404).json({ error: 'State file not found.' });
        } else {
            sendRouteError(res, error, 'GET state', { message: 'Failed to read state file.' });
        }
    }
});

// POST /api/state: Write application state to app_state.json
app.post('/api/state', async (req, res) => {
    try {
        const stateData = JSON.stringify(req.body, null, 2);
        await atomicWriteWithLock(STATE_FILE_PATH, stateData);
        const sizeKB = (Buffer.byteLength(stateData, 'utf8') / 1024).toFixed(1);
        console.log('💾 Saved app state to app_state.json - size:', sizeKB, 'KB');
        res.json({ success: true });
    } catch (error) {
        sendRouteError(res, error, 'POST state', { message: 'Failed to write state file.', remedy: 'Responding 500; app_state.json left as it was' });
    }
});

// --- Static serving for parsed resumes ---
// Useful for static hosting / debugging: allows fetching /parsed_resumes/<id>/jobs.json, etc.
// Note: GitHub Pages cannot write back to these files; writes still require the API.
app.use('/parsed_resumes', express.static(PARSED_RESUMES_DIR));

const NON_LOCAL_RESUMES_INDEX_FILENAME = 'non-local-resumes.json';
const GENERATE_PARSED_RESUMES_INDEX_SCRIPT_PATH = path.join(PROJECT_ROOT, 'scripts', 'generate-parsed-resumes-index.mjs');

async function regenerateNonLocalResumesIndex(reason) {
    try {
        console.log(`Remedy: Regenerating ${NON_LOCAL_RESUMES_INDEX_FILENAME} (${reason})`);

        await new Promise((resolve, reject) => {
            const child = spawn(process.execPath, [GENERATE_PARSED_RESUMES_INDEX_SCRIPT_PATH], {
                cwd: PROJECT_ROOT,
                env: {
                    ...process.env,
                    PARSED_RESUMES_DIR: PARSED_RESUMES_DIR
                },
                stdio: ['ignore', 'pipe', 'pipe']
            });

            let stdout = '';
            let stderr = '';
            child.stdout.on('data', (d) => { stdout += d.toString(); });
            child.stderr.on('data', (d) => { stderr += d.toString(); });

            child.on('close', (code) => {
                if (code === 0) resolve();
                else reject(new Error(`generate-parsed-resumes-index exited with code ${code}${stderr ? `: ${stderr}` : ''}\n${stdout ? `STDOUT:\n${stdout}` : ''}`));
            });
            child.on('error', (err) => reject(err));
        });
    } catch (e) {
        reportError(
            e,
            '[ResumeIndex] Failed to regenerate non-local-resumes.json',
            'Continuing without updating static resume index (static listing may be stale until next successful generation)'
        );
    }
}

/** First non-_local- resume folder in parsed_resumes (by displayName, matching generate-parsed-resumes-index). */
async function getDefaultResumeId() {
    const entries = await fs.readdir(PARSED_RESUMES_DIR, { withFileTypes: true });
    const candidates = [];
    for (const ent of entries) {
        if (!ent.isDirectory()) continue;
        if (ent.name.startsWith('.') || ent.name.startsWith('_local-')) continue;
        const dir = path.join(PARSED_RESUMES_DIR, ent.name);
        const jobsPath = path.join(dir, 'jobs.json');
        let displayName = ent.name;
        try {
            await fs.access(jobsPath);
            const metaPath = path.join(dir, 'meta.json');
            try {
                const meta = JSON.parse(await fs.readFile(metaPath, 'utf-8'));
                displayName = meta.displayName || meta.name || ent.name;
            } catch {
                /* use id */
            }
            candidates.push({ id: ent.name, displayName });
        } catch {
            /* skip */
        }
    }
    candidates.sort((a, b) => String(a.displayName).localeCompare(String(b.displayName)));
    return candidates.length > 0 ? candidates[0].id : null;
}

// GET /api/resumes/default/data: Jobs and skills from first parsed_resumes folder (non-_local-)
app.get('/api/resumes/default/data', async (req, res) => {
    try {
        const defaultId = await getDefaultResumeId();
        if (!defaultId) {
            return res.status(404).json({ error: 'Default resume not found (no parsed_resumes folder with jobs.json).' });
        }
        const dir = path.join(PARSED_RESUMES_DIR, defaultId);
        const jobsPath = path.join(dir, 'jobs.json');
        const skillsPath = path.join(dir, 'skills.json');
        const categoriesPath = path.join(dir, 'categories.json');
        const { jobs, skills, categories } = await readAndNormalizeResumeData(jobsPath, skillsPath, categoriesPath);
        res.json({ jobs, skills, categories });
    } catch (error) {
        if (error.code === 'ENOENT') {
            res.status(404).json({ error: 'Default resume data not found (parsed_resumes).' });
        } else {
            sendRouteError(res, error, 'GET default resume data', { message: 'Failed to read default resume data.' });
        }
    }
});

// GET /api/resumes/:id/data: Jobs and skills for a parsed resume (parsed_resumes/<id>/)
// Flat layout, JSON format: jobs.json, skills.json, categories.json at folder root.
app.get('/api/resumes/:id/data', async (req, res) => {
    const { id } = req.params;
    if (!id || id === 'default') {
        return res.status(400).json({ error: 'Invalid resume id.' });
    }
    const dir = path.join(PARSED_RESUMES_DIR, id);
    try {
        const jobsPath = path.join(dir, 'jobs.json');
        await fs.access(jobsPath);
        const skillsPath = path.join(dir, 'skills.json');
        const categoriesPath = path.join(dir, 'categories.json');
        const { jobs, skills, categories } = await readAndNormalizeResumeData(jobsPath, skillsPath, categoriesPath);
        res.json({ jobs, skills, categories });
    } catch (error) {
        if (error.code === 'ENOENT') {
            res.status(404).json({ error: `Resume "${id}" not found.` });
        } else {
            sendRouteError(res, error, 'GET resume data', { message: 'Failed to read resume data.' });
        }
    }
});

// PATCH /api/resumes/:id/jobs/:jobIndex/skills: Replace one job's skillIDs. Optional newSkills: names to create if missing.
// commitResume canonicalizes the ids to skills.json keys and recomputes every skill.jobIDs.
app.patch('/api/resumes/:id/jobs/:jobIndex/skills', async (req, res) => {
    const { id, jobIndex } = req.params;
    const { skillIDs, newSkills } = req.body;
    if (!id || jobIndex == null || !Array.isArray(skillIDs)) {
        return res.status(400).json({ error: 'Missing id, jobIndex, or skillIDs array.' });
    }
    try {
        const data = await loadResume(PARSED_RESUMES_DIR, id);
        const idx = String(jobIndex);
        if (!data.jobs[idx]) return res.status(404).json({ error: `Job index ${jobIndex} not found.` });
        createMissingSkills(data.skills, newSkills);
        data.jobs[idx].skillIDs = skillIDs;
        const { data: saved } = await commitResume(PARSED_RESUMES_DIR, id, data);
        res.json({ ok: true, skillIDs: saved.jobs[idx].skillIDs });
    } catch (err) {
        sendRouteError(res, err, 'PATCH jobs skills', { notFoundMessage: RESUME_NOT_FOUND });
    }
});

// PATCH /api/resumes/:id/education/:educationKey/skills: Replace one education entry's skillIDs.
// jobIDs (merged work + education indices) are recomputed by commitResume.
app.patch('/api/resumes/:id/education/:educationKey/skills', async (req, res) => {
    const { id, educationKey } = req.params;
    const { skillIDs, newSkills } = req.body;
    if (!id || educationKey == null || !Array.isArray(skillIDs)) {
        return res.status(400).json({ error: 'Missing id, educationKey, or skillIDs array.' });
    }
    try {
        const data = await loadResume(PARSED_RESUMES_DIR, id);
        const eduEntry = data.education[educationKey];
        if (eduEntry == null || typeof eduEntry !== 'object') {
            return res.status(404).json({ error: `Education key "${educationKey}" not found.` });
        }
        createMissingSkills(data.skills, newSkills);
        eduEntry.skillIDs = skillIDs.map(String);
        const { data: saved } = await commitResume(PARSED_RESUMES_DIR, id, data);
        res.json({ ok: true, skillIDs: saved.education[educationKey].skillIDs });
    } catch (err) {
        sendRouteError(res, err, 'PATCH education skills', { notFoundMessage: 'education.json or related file not found.' });
    }
});

// Resolve skill key: use direct key if present, else find key where skill.name matches (handles id-keyed skills from parser).
/**
 * After a skill key goes away (merge or rename), re-key its shared-catalog row so the
 * saved URL is not orphaned under a slug no resume uses any more. The surviving key's
 * own row wins if it already has one. Optional step: the resume files are already
 * written, so a catalog failure is reported and does not fail the request.
 */
async function carrySharedSkillUrlEntry(fromKey, toKey) {
    try {
        const catalog = await readSharedSkillUrlCatalog();
        const fromEntry = catalog.entries[fromKey];
        if (!fromEntry || catalog.entries[toKey]) return;
        await upsertSharedSkillUrl({
            key: toKey,
            url: fromEntry.url,
            updatedAt: fromEntry.updatedAt || new Date().toISOString(),
            mirrorPath: skillUrlsMirrorPath(PARSED_RESUMES_DIR),
        });
        console.log(`[skill-urls] carried shared URL row "${fromKey}" → "${toKey}"`);
    } catch (err) {
        reportError(err, `[skill-urls] Failed to carry shared URL row "${fromKey}" → "${toKey}"`, 'Resume files are saved; the shared catalog row stays under the old key');
    }
}

/**
 * Point every reference to a retired skill at its survivor, in place: job and education
 * skillIDs, [bracket] text in their descriptions, and category lists. skill.jobIDs and the
 * categories <-> categoryIDs mirror are derived by commitResume afterwards.
 *
 * @param {{ jobs: unknown, education: object, categories: object, skills: Record<string, object>,
 *           fromAliases: Set<string>, fromName: string, toKey: string }} data
 * @returns {number} descriptions rewritten
 */
function retargetSkillReferences({ jobs, education, categories, skills, fromAliases, fromName, toKey }) {
    const toSkill = skills[toKey];
    if (!toSkill || typeof toSkill !== 'object') throw new Error(`[retargetSkillReferences] surviving skill "${toKey}" is missing`);
    const toName = toSkill.name || toKey;
    rewriteSkillIdInRecords(jobs, fromAliases, toKey);
    let descriptionFixes = replaceSkillNameInDescriptions(jobs, fromName, toName);
    rewriteSkillIdInRecords(education, fromAliases, toKey);
    descriptionFixes += replaceSkillNameInDescriptions(education, fromName, toName);
    replaceSkillKeyInCategories(categories, fromAliases, toKey);
    return descriptionFixes;
}

// PATCH /api/resumes/:id/skills/rename: Rename a skill (update key and all references). If newName names an existing skill (key or display name), merge into it.
app.patch('/api/resumes/:id/skills/rename', async (req, res) => {
    const { id } = req.params;
    const { oldKey, newName } = req.body;
    const newNameTrimmed = newName != null ? String(newName).trim() : '';
    if (!id || id === 'default' || !oldKey || !newNameTrimmed) {
        return res.status(400).json({ error: 'Missing id, oldKey, or newName.' });
    }
    if (oldKey === newNameTrimmed) {
        return res.json({ ok: true, key: oldKey });
    }
    try {
        const data = await loadResume(PARSED_RESUMES_DIR, id);
        const { skills } = data;
        const resolvedOldKey = resolveSkillKey(skills, oldKey);
        if (resolvedOldKey == null) {
            return res.status(404).json({ error: `Skill "${oldKey}" not found.` });
        }
        const oldSkill = skills[resolvedOldKey];
        const oldSkillName = oldSkill.name || resolvedOldKey;
        delete skills[resolvedOldKey];
        const existingKey = resolveSkillKey(skills, newNameTrimmed);
        const newKey = existingKey ?? newNameTrimmed;
        if (existingKey != null) {
            // Renaming onto an existing skill is a merge: keep the manually defined URL (shortest when both have one).
            mergeSkillEntryInto(oldSkill, skills[existingKey]);
        } else {
            skills[newKey] = { ...oldSkill, name: newNameTrimmed };
        }
        // Bracket text in descriptions must match the surviving skill's display name, not its key.
        const newSkillName = skills[newKey].name || newKey;
        const descFixes = retargetSkillReferences({
            ...data,
            fromAliases: skillAliasSet(resolvedOldKey, oldKey, oldSkillName),
            fromName: oldSkillName,
            toKey: newKey,
        });
        console.log(`[PATCH skills/rename] replaced [${oldSkillName}] → [${newSkillName}] in ${descFixes} descriptions`);
        await commitResume(PARSED_RESUMES_DIR, id, data);
        await carrySharedSkillUrlEntry(resolvedOldKey, newKey);
        res.json({ ok: true, key: newKey, descriptionFixes: descFixes });
    } catch (err) {
        sendRouteError(res, err, 'PATCH skills/rename', { notFoundMessage: RESUME_NOT_FOUND });
    }
});

// PATCH /api/resumes/:id/skills/merge: Merge one skill into another (replace fromKey with toKey everywhere, then remove fromKey)
app.patch('/api/resumes/:id/skills/merge', async (req, res) => {
    const { id } = req.params;
    const { fromKey, toKey } = req.body;
    if (!id || id === 'default' || !fromKey || !toKey) {
        return res.status(400).json({ error: 'Missing id, fromKey, or toKey.' });
    }
    if (fromKey === toKey) {
        return res.status(400).json({ error: 'fromKey and toKey must be different.' });
    }
    try {
        const data = await loadResume(PARSED_RESUMES_DIR, id);
        const { skills } = data;
        const resolvedFromKey = resolveSkillKey(skills, fromKey);
        const resolvedToKey = resolveSkillKey(skills, toKey);
        if (resolvedFromKey == null) {
            return res.status(404).json({ error: `Skill "${fromKey}" not found.` });
        }
        if (resolvedToKey == null) {
            return res.status(404).json({ error: `Target skill "${toKey}" not found.` });
        }
        if (resolvedFromKey === resolvedToKey) {
            return res.status(400).json({ error: 'fromKey and toKey must be different.' });
        }
        const fromSkillName = skills[resolvedFromKey].name || resolvedFromKey;
        const toSkillName = skills[resolvedToKey].name || resolvedToKey;
        // Keep the manually defined URL (shortest when both skills have one).
        mergeSkillEntryInto(skills[resolvedFromKey], skills[resolvedToKey]);
        delete skills[resolvedFromKey];
        const descFixes = retargetSkillReferences({
            ...data,
            fromAliases: skillAliasSet(resolvedFromKey, fromKey, fromSkillName),
            fromName: fromSkillName,
            toKey: resolvedToKey,
        });
        console.log(`[PATCH skills/merge] replaced [${fromSkillName}] → [${toSkillName}] in ${descFixes} descriptions`);
        await commitResume(PARSED_RESUMES_DIR, id, data);
        await carrySharedSkillUrlEntry(resolvedFromKey, resolvedToKey);
        res.json({ ok: true, mergedInto: toKey, descriptionFixes: descFixes });
    } catch (err) {
        sendRouteError(res, err, 'PATCH skills/merge', { notFoundMessage: RESUME_NOT_FOUND });
    }
});

// PATCH /api/resumes/:id/skills/remove: Delete one skill and every job, education, and [bracket] reference to it.
// Category lists drop the dangling key in commitResume.
app.patch('/api/resumes/:id/skills/remove', async (req, res) => {
    const { id } = req.params;
    const key = req.body?.key != null ? String(req.body.key).trim() : '';
    if (!id || id === 'default' || !key) {
        return res.status(400).json({ error: 'Missing id or key.' });
    }
    try {
        const data = await loadResume(PARSED_RESUMES_DIR, id);
        const removed = removeSkillFromResumeData({ jobs: data.jobs, skills: data.skills, education: data.education, key });
        if (!removed.ok) {
            return res.status(404).json({ error: removed.error });
        }
        await commitResume(PARSED_RESUMES_DIR, id, data);
        console.log(`[PATCH skills/remove] removed "${removed.name}" (${removed.key}); ${removed.descriptionFixes} descriptions updated`);
        res.json({ ok: true, key: removed.key, name: removed.name, descriptionFixes: removed.descriptionFixes });
    } catch (err) {
        sendRouteError(res, err, 'PATCH skills/remove', { notFoundMessage: `Resume "${id}" not found.` });
    }
});

// PATCH /api/resumes/:id/skills/url: Set or clear a skill's custom info URL (used by the ? modal source link).
app.patch('/api/resumes/:id/skills/url', async (req, res) => {
    const { id } = req.params;
    const { key, url } = req.body ?? {};
    if (!id || id === 'default' || !key) {
        return res.status(400).json({ error: 'Missing id or key.' });
    }
    const urlTrimmed = url == null ? '' : String(url).trim();
    if (urlTrimmed) {
        try {
            const parsed = new URL(urlTrimmed);
            if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
                return res.status(400).json({ error: 'url must be an absolute http(s) URL.' });
            }
        } catch {
            return res.status(400).json({ error: 'url must be an absolute http(s) URL.' });
        }
    }
    try {
        const data = await loadResume(PARSED_RESUMES_DIR, id);
        const { skills } = data;
        const resolvedKey = resolveSkillKey(skills, key);
        if (resolvedKey == null) {
            return res.status(404).json({ error: `Skill "${key}" not found.` });
        }
        if (!skills[resolvedKey] || typeof skills[resolvedKey] !== 'object') {
            skills[resolvedKey] = { name: resolvedKey };
        }
        skills[resolvedKey].url = urlTrimmed;
        await commitResume(PARSED_RESUMES_DIR, id, data);
        res.json({ ok: true, key: resolvedKey, url: urlTrimmed });
    } catch (err) {
        sendRouteError(res, err, 'PATCH skills/url', { notFoundMessage: 'skills.json not found.' });
    }
});

// GET /api/skill-urls: Shared skill-info URL catalog (all resumes, all resume-flyer apps on this machine).
app.get('/api/skill-urls', async (req, res) => {
    try {
        const catalog = await readSharedSkillUrlCatalog();
        res.set('Cache-Control', 'no-store');
        res.json(catalog);
    } catch (err) {
        sendRouteError(res, err, 'GET /api/skill-urls', { remedy: 'Responding 500; shared skill URL catalog not read' });
    }
});

// PUT /api/skill-urls: Merge one slug. Last updatedAt wins. Mirrors parsed_resumes/skill-urls.json.
app.put('/api/skill-urls', async (req, res) => {
    const { key, url, updatedAt } = req.body ?? {};
    if (!key || typeof key !== 'string' || !key.trim()) {
        return res.status(400).json({ error: 'Missing key.' });
    }
    let urlTrimmed;
    try {
        urlTrimmed = assertSkillInfoUrl(url);
    } catch (err) {
        return res.status(400).json({ error: err.message });
    }
    try {
        const catalog = await upsertSharedSkillUrl({
            key: key.trim(),
            url: urlTrimmed,
            updatedAt: typeof updatedAt === 'string' && updatedAt ? updatedAt : new Date().toISOString(),
            mirrorPath: skillUrlsMirrorPath(PARSED_RESUMES_DIR),
        });
        res.set('Cache-Control', 'no-store');
        res.json(catalog);
    } catch (err) {
        sendRouteError(res, err, 'PUT /api/skill-urls', { remedy: 'Responding 500; shared skill URL not saved' });
    }
});

// PATCH /api/resumes/:id/jobs/:jobIndex: Update one job's fields (label, role, start, end, Description,
// projectGithubRepoUrl, projectGithubPagesUrl).
// A Description whose [Brackets] do not resolve to skills linked on the job is refused (422) by commitResume.
app.patch('/api/resumes/:id/jobs/:jobIndex', async (req, res) => {
    const { id, jobIndex } = req.params;
    if (!id || id === 'default' || jobIndex == null) {
        return res.status(400).json({ error: 'Invalid resume id or job index.' });
    }
    const allowed = ['label', 'role', 'employer', 'start', 'end', 'Description', 'outlineIndex', 'outlineKind', 'projectGithubRepoUrl', 'projectGithubPagesUrl'];
    const updates = {};
    for (const key of allowed) {
        if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'No allowed job fields provided.' });
    }
    try {
        const data = await loadResume(PARSED_RESUMES_DIR, id);
        const idx = Array.isArray(data.jobs) ? parseInt(jobIndex, 10) : String(jobIndex);
        if (data.jobs[idx] == null) return res.status(404).json({ error: `Job index ${jobIndex} not found.` });
        Object.assign(data.jobs[idx], updates);
        const { data: saved } = await commitResume(PARSED_RESUMES_DIR, id, data);
        res.json({ ok: true, job: saved.jobs[idx] });
    } catch (err) {
        sendRouteError(res, err, 'PATCH job', { notFoundMessage: 'Resume or jobs.json not found.' });
    }
});

// POST /api/resumes/:id/jobs: Insert empty work job after `afterIndex` (-1 = at index 0). skills.jobIDs follow in commitResume.
app.post('/api/resumes/:id/jobs', async (req, res) => {
    const { id } = req.params;
    if (!id || id === 'default') {
        return res.status(400).json({ error: 'Invalid resume id.' });
    }
    const rawAfter = req.body?.afterIndex;
    try {
        const data = await loadResume(PARSED_RESUMES_DIR, id);
        const arr = normalizeParserJobs(data.jobs);
        let insertAt = 0;
        if (rawAfter != null && rawAfter !== '' && Number(rawAfter) >= 0) {
            insertAt = Number(rawAfter) + 1;
        }
        if (insertAt > arr.length) insertAt = arr.length;
        if (insertAt < 0) insertAt = 0;
        const newJob = {
            employer: '',
            role: '',
            start: '',
            end: '',
            Description: '',
            skillIDs: [],
        };
        arr.splice(insertAt, 0, newJob);
        data.jobs = arr;
        await commitResume(PARSED_RESUMES_DIR, id, data);
        res.json({ ok: true, insertIndex: insertAt });
    } catch (err) {
        sendRouteError(res, err, 'POST jobs', { notFoundMessage: 'Resume or jobs.json not found.' });
    }
});

// DELETE /api/resumes/:id/jobs/:jobIndex: Remove one work job. skills.jobIDs are recomputed in commitResume.
app.delete('/api/resumes/:id/jobs/:jobIndex', async (req, res) => {
    const { id, jobIndex } = req.params;
    if (!id || id === 'default' || jobIndex == null) {
        return res.status(400).json({ error: 'Invalid resume id or job index.' });
    }
    const idx = parseInt(jobIndex, 10);
    if (Number.isNaN(idx) || idx < 0) {
        return res.status(400).json({ error: 'Invalid job index.' });
    }
    try {
        const data = await loadResume(PARSED_RESUMES_DIR, id);
        const arr = normalizeParserJobs(data.jobs);
        if (arr[idx] == null) {
            return res.status(404).json({ error: `Job index ${jobIndex} not found.` });
        }
        arr.splice(idx, 1);
        data.jobs = arr;
        await commitResume(PARSED_RESUMES_DIR, id, data);
        res.json({ ok: true });
    } catch (err) {
        sendRouteError(res, err, 'DELETE jobs', { notFoundMessage: 'Resume or jobs.json not found.' });
    }
});

// GET /api/resumes/:id/has-local-changes: True when derived JSON differs from last parse baseline
// (or, for legacy folders without derivedSnapshotHash, when a derived file is newer than meta.json).
app.get('/api/resumes/:id/has-local-changes', async (req, res) => {
    const { id } = req.params;
    if (!id || id === 'default') {
        return res.status(400).json({ error: 'Invalid resume id.' });
    }
    const dir = path.join(PARSED_RESUMES_DIR, id);
    const metaPath = path.join(dir, 'meta.json');
    try {
        const metaRaw = await fs.readFile(metaPath, 'utf-8');
        const meta = JSON.parse(metaRaw) || {};
        const currentHash = await computeDerivedSnapshotHash(dir);
        if (typeof meta.derivedSnapshotHash === 'string' && meta.derivedSnapshotHash.length > 0) {
            return res.json({
                hasLocalChanges: currentHash !== meta.derivedSnapshotHash,
                reason: currentHash !== meta.derivedSnapshotHash ? 'derived-differs-from-parse-baseline' : 'matches-parse-baseline',
            });
        }
        // Legacy folders: treat derived files meaningfully newer than meta as local edits.
        const metaStat = await fs.stat(metaPath);
        for (const name of DERIVED_SNAPSHOT_FILES) {
            try {
                const st = await fs.stat(path.join(dir, name));
                if (st.mtimeMs > metaStat.mtimeMs + 2000) {
                    return res.json({
                        hasLocalChanges: true,
                        reason: 'legacy-derived-newer-than-meta',
                        changedFile: name,
                    });
                }
            } catch (e) {
                if (e.code !== 'ENOENT') throw e;
            }
        }
        return res.json({ hasLocalChanges: false, reason: 'legacy-no-baseline' });
    } catch (err) {
        return sendRouteError(res, err, 'has-local-changes', { notFoundMessage: RESUME_NOT_FOUND, remedy: 'Responding 500; resume folder not inspected' });
    }
});

// GET /api/resumes/:id/meta: Return meta.json for a parsed resume
app.get('/api/resumes/:id/meta', async (req, res) => {
    const { id } = req.params;
    if (!id || id === 'default') return res.status(400).json({ error: 'Invalid or default resume id.' });
    const metaPath = path.join(PARSED_RESUMES_DIR, id, 'meta.json');
    try {
        const content = await fs.readFile(metaPath, 'utf-8');
        res.json(withDerivedMetaPaths(id, JSON.parse(content)));
    } catch (e) {
        if (e.code === 'ENOENT') return res.status(404).json({ error: 'meta.json not found for this resume.' });
        throw e;
    }
});

// PATCH /api/resumes/:id/meta: Update displayName, fileName, originalPath in meta.json
app.patch('/api/resumes/:id/meta', async (req, res) => {
    const { id } = req.params;
    if (!id || id === 'default') return res.status(400).json({ error: 'Cannot update meta for default resume.' });
    const { displayName, fileName, originalPath } = req.body;
    const metaPath = path.join(PARSED_RESUMES_DIR, id, 'meta.json');
    try {
        let meta = {};
        try {
            const content = await fs.readFile(metaPath, 'utf-8');
            meta = JSON.parse(content);
        } catch (e) {
            if (e.code === 'ENOENT') return res.status(404).json({ error: 'meta.json not found for this resume.' });
            throw e;
        }
        if (displayName !== undefined) meta.displayName = displayName;
        if (fileName !== undefined) meta.fileName = fileName;
        if (originalPath !== undefined) meta.originalPath = String(originalPath ?? '').trim();
        await writeResumeJson(metaPath, meta);

        // displayName affects static index ordering/default resume selection,
        // but regenerate on any rename-related meta update to keep static listing in sync.
        if (displayName !== undefined || fileName !== undefined) {
            await regenerateNonLocalResumesIndex(`resume renamed (meta update) [${id}]`);
        }
        res.json(withDerivedMetaPaths(id, meta));
    } catch (err) {
        sendRouteError(res, err, 'PATCH meta');
    }
});

// GET /api/resumes/:id/other-sections: Return other-sections.json data (contact, title, summary, etc.)
app.get('/api/resumes/:id/other-sections', async (req, res) => {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'Invalid resume id.' });
    const filePath = path.join(PARSED_RESUMES_DIR, id, 'other-sections.json');
    try {
        const content = await fs.readFile(filePath, 'utf-8');
        const data = JSON.parse(content);
        res.json(data || {});
    } catch {
        res.status(404).json({ error: 'other-sections.json not found for this resume.' });
    }
});

// PATCH /api/resumes/:id/other-sections: Update or create other-sections.json
app.patch('/api/resumes/:id/other-sections', async (req, res) => {
    const { id } = req.params;
    if (!id || id === 'default') return res.status(400).json({ error: 'Cannot update other-sections for default resume.' });
    const payload = req.body;
    if (!payload || typeof payload !== 'object') return res.status(400).json({ error: 'Invalid payload.' });
    const dir = path.join(PARSED_RESUMES_DIR, id);
    const filePath = path.join(dir, 'other-sections.json');
    try {
        await fs.mkdir(dir, { recursive: true });
        await writeResumeJson(filePath, payload);
        res.json(payload);
    } catch (err) {
        sendRouteError(res, err, 'PATCH other-sections');
    }
});

// GET /api/resumes/:id/education: Return education.json data
app.get('/api/resumes/:id/education', async (req, res) => {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'Invalid resume id.' });
    const filePath = path.join(PARSED_RESUMES_DIR, id, 'education.json');
    try {
        const content = await fs.readFile(filePath, 'utf-8');
        const data = JSON.parse(content);
        res.json(data || {});
    } catch {
        res.status(404).json({ error: 'education.json not found for this resume.' });
    }
});

// PATCH /api/resumes/:id/education: Replace education.json. skillIDs are canonicalized and
// skills.jobIDs recomputed (education rows follow work jobs in the merged index) by commitResume.
app.patch('/api/resumes/:id/education', async (req, res) => {
    const { id } = req.params;
    if (!id || id === 'default') return res.status(400).json({ error: 'Cannot update education for default resume.' });
    const payload = req.body;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return res.status(400).json({ error: 'Invalid payload.' });
    try {
        const data = await loadResume(PARSED_RESUMES_DIR, id);
        data.education = payload;
        const { data: saved } = await commitResume(PARSED_RESUMES_DIR, id, data);
        res.json(saved.education);
    } catch (err) {
        sendRouteError(res, err, 'PATCH education', { notFoundMessage: RESUME_NOT_FOUND });
    }
});

// PATCH /api/resumes/:id/categories: Replace categories.json. The payload is authoritative:
// every skill.categoryIDs is re-derived from it before commitResume syncs and checks the mirror.
app.patch('/api/resumes/:id/categories', async (req, res) => {
    const { id } = req.params;
    if (!id || id === 'default') return res.status(400).json({ error: 'Cannot update categories for default resume.' });
    const { categories } = req.body;
    if (!categories || typeof categories !== 'object' || Array.isArray(categories)) return res.status(400).json({ error: 'Invalid categories payload.' });
    try {
        const data = await loadResume(PARSED_RESUMES_DIR, id);
        data.categories = categories;
        mirrorCategoriesIntoSkills(data.skills, categories);
        const { data: saved } = await commitResume(PARSED_RESUMES_DIR, id, data);
        res.json({ categories: saved.categories });
    } catch (err) {
        sendRouteError(res, err, 'PATCH categories', { notFoundMessage: RESUME_NOT_FOUND });
    }
});

// GET /api/resumes/:id/html: Serve the pre-rendered resume.html for printing
app.get('/api/resumes/:id/html', async (req, res) => {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'Invalid resume id.' });
    const htmlPath = path.join(PARSED_RESUMES_DIR, id, 'resume.html');
    try {
        await fs.access(htmlPath);
        res.sendFile(htmlPath);
    } catch {
        res.status(404).json({ error: 'resume.html not found for this resume.' });
    }
});

// DELETE /api/resumes/:id: Remove a parsed resume folder entirely
app.delete('/api/resumes/:id', async (req, res) => {
    const { id } = req.params;
    if (!id || id === 'default') {
        return res.status(400).json({ error: 'Cannot delete the default resume.' });
    }
    const dir = path.join(PARSED_RESUMES_DIR, id);
    try {
        await fs.rm(dir, { recursive: true, force: true });
        console.log(`[DELETE resume] Removed: ${dir}`);

        await regenerateNonLocalResumesIndex(`resume deleted (${id})`);

        res.json({ ok: true });
    } catch (err) {
        sendRouteError(res, err, 'DELETE resume', { remedy: 'Responding 500; the resume folder may be partially removed' });
    }
});

// POST /api/resumes/:id/reparse: Delete derived files in the resume folder,
// keep only the original .docx/.pdf, and re-run resume-parser into the same folder.
app.post('/api/resumes/:id/reparse', async (req, res) => {
    const { id } = req.params;
    if (!id || id === 'default') {
        return res.status(400).json({ error: 'Invalid resume id.' });
    }

    const dir = path.join(PARSED_RESUMES_DIR, id);
    const metaPath = path.join(dir, 'meta.json');

    try {
        // Validate folder exists
        await fs.access(dir);

        // Load existing meta to preserve displayName/originalFilename where possible.
        let existingMeta = {};
        try {
            const content = await fs.readFile(metaPath, 'utf-8');
            existingMeta = JSON.parse(content) || {};
        } catch {
            /* meta may be missing; we'll derive from the document file */
        }

        // Find the original resume document file in this folder.
        const entries = await fs.readdir(dir, { withFileTypes: true });
        const docLikeFiles = entries.filter(ent =>
            ent.isFile() && (ent.name.toLowerCase().endsWith('.docx') || ent.name.toLowerCase().endsWith('.pdf'))
        );

        if (docLikeFiles.length === 0) {
            return res.status(404).json({
                error: 'Original .docx/.pdf not found for this resume folder.',
                resumeId: id
            });
        }

        const preferredBaseName = existingMeta?.originalFilename
            ? path.basename(String(existingMeta.originalFilename))
            : null;
        const keepEntry = (preferredBaseName
            ? docLikeFiles.find(e => e.name === preferredBaseName)
            : null) || docLikeFiles[0];

        const keepDocPath = path.join(dir, keepEntry.name);

        // Stash derived files so a failed parser run can restore them (do not leave only the PDF).
        const backupDir = await stashDerivedFilesForReparse(dir, keepEntry.name);

        // Re-run resume-parser into the same output directory.
        const parserModule = process.env.RESUME_PARSER_MODULE || RESUME_PARSER_PYTHON_MODULE_UNSET_ENV;
        const resumeParserProjectPath = process.env.RESUME_PARSER_PROJECT_PATH
            ? path.resolve(PROJECT_ROOT, process.env.RESUME_PARSER_PROJECT_PATH)
            : path.resolve(PROJECT_ROOT, RESUME_PARSER_PROJECT_PATH_RELATIVE_UNSET_ENV);

        const defaultResumeParserPythonBin = path.join(resumeParserProjectPath, 'venv', 'bin', 'python3');
        const pythonBinCandidates = [
            defaultResumeParserPythonBin,
            'python3',
            'python3.11',
            'python',
        ].filter((value, idx, arr) => Boolean(value) && arr.indexOf(value) === idx);

        const cleanEnv = getParserSpawnEnv(process.env);

        async function runParserWithPythonBin(pythonBin) {
            const commandHeader = [
                '=== resume-parser ===',
                `Command: ${pythonBin} -m ${parserModule} "${keepDocPath}" -o "${dir}"`,
                `Cwd: ${resumeParserProjectPath}`,
                `Input: ${keepDocPath}`,
                `Output: ${dir}`,
                '-----------------------',
            ].join('\n');

            const pythonProcess = spawn(pythonBin, [
                '-u',
                '-m',
                parserModule,
                keepDocPath,
                '-o',
                dir
            ], {
                env: cleanEnv,
                cwd: resumeParserProjectPath
            });

            trackResumeParserChild(pythonProcess, 'resume-parser-reparse');

            let stdout = '';
            let stderr = '';
            pythonProcess.stdout.on('data', (data) => {
                const t = data.toString();
                stdout += t;
                console.log(`[Parser stdout]: ${t.trim()}`);
            });
            pythonProcess.stderr.on('data', (data) => {
                const t = data.toString();
                stderr += t;
                process.stderr.write(`[Parser stderr]: ${t.trim()}\n`);
            });

            await new Promise((resolve, reject) => {
                pythonProcess.on('close', (code) => {
                    const combinedOutput = `${commandHeader}\n${stdout}${stderr}`;
                    if (code === 0) return resolve(combinedOutput);
                    const err = new Error(`Parser exited with code ${code}. Error: ${stderr}`);
                    err.parserOutput = combinedOutput;
                    reject(err);
                });
                pythonProcess.on('error', (error) => {
                    reject(new Error(`Failed to run parser with ${pythonBin}: ${error.message}`));
                });
            });
        }

        let parserRunError = null;
        try {
            for (const pythonBin of pythonBinCandidates) {
                try {
                    await runParserWithPythonBin(pythonBin);
                    parserRunError = null;
                    break;
                } catch (error) {
                    parserRunError = error;
                    const details = String(error?.message || error);
                    const isModuleNotFound = details.includes('ModuleNotFoundError') && details.includes('resume_parser');
                    if (isModuleNotFound) {
                        reportError(error, `[ResumeReparse] Parser module missing with ${pythonBin}`, `Retrying parser with another Python binary (${pythonBinCandidates.join(', ')})`);
                        continue;
                    }
                    throw error;
                }
            }
            if (parserRunError) throw parserRunError;

            // Read and normalize parsed outputs so we can return counts, then stamp meta last
            // (derivedSnapshotHash must match post-parse derived files).
            const jobsPath = path.join(dir, 'jobs.json');
            const skillsPath = path.join(dir, 'skills.json');
            const categoriesPath = path.join(dir, 'categories.json');
            const { jobs, skills } = await readAndNormalizeResumeData(jobsPath, skillsPath, categoriesPath);
            // Normalize + bake through the one write path before stamping the parse baseline.
            const consistency = await finalizeParsedResume(id, 'ResumeReparse');

            // Recreate meta.json (it was stashed as part of the reparse).
            const metadata = await writeMetaWithParseBaseline(metaPath, {
                id,
                displayName: existingMeta?.displayName || existingMeta?.name || id,
                originalFilename: keepEntry.name,
                originalPath: existingMeta?.originalPath || '',
                fileName: existingMeta?.fileName,
                sourceUrl: existingMeta?.sourceUrl || null,
                sourceType: existingMeta?.sourceType || (existingMeta?.sourceUrl ? 'url' : 'upload'),
                createdAt: new Date().toISOString(),
                uploadedBy: existingMeta?.uploadedBy || 'user',
                fileSize: (await fs.stat(keepDocPath)).size
            }, dir);

            await keepReparseBackup(dir, backupDir);
            await regenerateNonLocalResumesIndex(`resume re-parsed (${id})`);

            res.json({
                success: true,
                resumeId: id,
                displayName: metadata.displayName,
                jobCount: jobs.length,
                skillCount: Object.keys(skills).length,
                metadata,
                consistencyFindings: consistency.findings
            });
        } catch (parseError) {
            const failedLogPath = path.join(dir, 'parser-output.log');
            let failedLog = '';
            try {
                failedLog = await fs.readFile(failedLogPath, 'utf-8');
            } catch {
                if (parseError?.parserOutput) failedLog = String(parseError.parserOutput);
            }
            await restoreReparseBackup(dir, backupDir);
            if (failedLog) {
                await fs.writeFile(failedLogPath, failedLog, 'utf-8').catch(() => {});
            }
            console.log('Remedy: Restored previous jobs/skills/meta after failed reparse');
            throw parseError;
        }
    } catch (error) {
        sendRouteError(res, error, 'ResumeReparse', {
            remedy: 'Responding 500; previous derived files restored when a backup existed',
            body: {
                error: 'Failed to reparse resume',
                details: error?.message || String(error),
                parserOutput: error?.parserOutput || ''
            },
        });
    }
});

// POST /api/resumes/:id/reparse-stream: SSE stream resume-parser output for reparse.
app.post('/api/resumes/:id/reparse-stream', async (req, res) => {
    const { id } = req.params;
    if (!id || id === 'default') {
        res.status(400).json({ error: 'Invalid resume id.' });
        return;
    }

    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    if (typeof res.flushHeaders === 'function') res.flushHeaders();

    let child = null;
    let outputFilePath = null;
    let tailTimer = null;
    let lastLen = 0;
    let remainder = '';

    const sendEvent = (eventType, payload) => {
        if (res.writableEnded) return;
        const safe = String(payload).replace(/\r/g, '');
        res.write(`event: ${eventType}\n`);
        res.write(`data: ${safe}\n\n`);
    };
    const sendOutputLine = (line) => {
        const cleaned = String(line).replace(/\r?\n/g, '');
        sendEvent('output', cleaned);
    };
    const sendStatus = (status) => sendEvent('status', status);

    const tailOnce = async (flushRemainder = false) => {
        if (!outputFilePath) return;
        const text = await fs.readFile(outputFilePath, 'utf-8').catch(() => '');
        if (text.length <= lastLen) return;
        const newText = text.slice(lastLen);
        lastLen = text.length;

        remainder += newText;
        const parts = remainder.split(/\r?\n/);
        remainder = parts.pop() || '';

        for (const line of parts) {
            if (line) sendOutputLine(line);
        }
        if (flushRemainder && remainder) {
            sendOutputLine(remainder);
            remainder = '';
        }
    };

    req.on('close', () => {
        try {
            if (child) child.kill('SIGTERM');
        } catch {
            /* ignore */
        }
    });

    try {
        const dir = path.join(PARSED_RESUMES_DIR, id);
        const metaPath = path.join(dir, 'meta.json');

        sendStatus(`Preparing reparse for ${id}...`);

        await fs.access(dir);

        // Load existing meta to preserve displayName/originalFilename where possible.
        let existingMeta = {};
        try {
            const content = await fs.readFile(metaPath, 'utf-8');
            existingMeta = JSON.parse(content) || {};
        } catch {
            /* meta may be missing */
        }

        // Find the original resume document file in this folder.
        const entries = await fs.readdir(dir, { withFileTypes: true });
        const docLikeFiles = entries.filter(ent =>
            ent.isFile() && (ent.name.toLowerCase().endsWith('.docx') || ent.name.toLowerCase().endsWith('.pdf'))
        );
        if (docLikeFiles.length === 0) {
            sendEvent('error', JSON.stringify({ message: 'Original .docx/.pdf not found for this resume folder.' }));
            res.end();
            return;
        }

        const preferredBaseName = existingMeta?.originalFilename
            ? path.basename(String(existingMeta.originalFilename))
            : null;
        const keepEntry = (preferredBaseName
            ? docLikeFiles.find(e => e.name === preferredBaseName)
            : null) || docLikeFiles[0];
        const keepDocPath = path.join(dir, keepEntry.name);

        sendStatus('Stashing derived files for safe reparse...');

        const backupDir = await stashDerivedFilesForReparse(dir, keepEntry.name);

        // Prepare parser output log and stream it.
        outputFilePath = path.join(dir, 'parser-output.log');
        const outStream = fsSync.createWriteStream(outputFilePath, { flags: 'w' });

        const parserModule = process.env.RESUME_PARSER_MODULE || RESUME_PARSER_PYTHON_MODULE_UNSET_ENV;
        const resumeParserProjectPath = process.env.RESUME_PARSER_PROJECT_PATH
            ? path.resolve(PROJECT_ROOT, process.env.RESUME_PARSER_PROJECT_PATH)
            : path.resolve(PROJECT_ROOT, RESUME_PARSER_PROJECT_PATH_RELATIVE_UNSET_ENV);
        const pythonBin = path.join(resumeParserProjectPath, 'venv', 'bin', 'python3');

        const cleanEnv = getParserSpawnEnv(process.env);

        const commandHeader = [
            '=== resume-parser ===',
            `Command: ${pythonBin} -m ${parserModule} "${keepDocPath}" -o "${dir}"`,
            `Cwd: ${resumeParserProjectPath}`,
            `Input: ${keepDocPath}`,
            `Output: ${dir}`,
            '-----------------------',
        ].join('\n');
        outStream.write(commandHeader + '\n');

        sendStatus('Processing resume...');

        child = spawn(pythonBin, ['-u', '-m', parserModule, keepDocPath, '-o', dir], {
            env: cleanEnv,
            cwd: resumeParserProjectPath,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        trackResumeParserChild(child, 'resume-parser-reparse-stream');

        child.stdout.pipe(outStream);
        child.stderr.pipe(outStream);

        tailTimer = setInterval(() => {
            tailOnce(false).catch(() => {});
        }, 160);

        let exitCode = 0;
        try {
            exitCode = await new Promise((resolve, reject) => {
                child.on('close', (code) => resolve(code ?? 1));
                child.on('error', reject);
            });
        } catch (spawnErr) {
            clearInterval(tailTimer);
            outStream.end();
            await tailOnce(true).catch(() => {});
            const failedLog = await fs.readFile(outputFilePath, 'utf-8').catch(() => '');
            await restoreReparseBackup(dir, backupDir);
            if (failedLog) await fs.writeFile(outputFilePath, failedLog, 'utf-8').catch(() => {});
            console.log('Remedy: Restored previous jobs/skills/meta after failed reparse');
            throw spawnErr;
        }

        clearInterval(tailTimer);
        await tailOnce(true);
        outStream.end();

        if (exitCode !== 0) {
            const failedLog = await fs.readFile(outputFilePath, 'utf-8').catch(() => '');
            await restoreReparseBackup(dir, backupDir);
            if (failedLog) await fs.writeFile(outputFilePath, failedLog, 'utf-8').catch(() => {});
            console.log('Remedy: Restored previous jobs/skills/meta after failed reparse');
            throw new Error(
                `Parser exited with code ${exitCode}. ` +
                `See parser-output.log in the resume folder for details.`
            );
        }

        // Ensure parser wrote expected output.
        const jobsPath = path.join(dir, 'jobs.json');
        const skillsPath = path.join(dir, 'skills.json');
        const categoriesPath = path.join(dir, 'categories.json');
        let jobs;
        let skills;
        try {
            ({ jobs, skills } = await readAndNormalizeResumeData(jobsPath, skillsPath, categoriesPath));
        } catch (readErr) {
            const failedLog = await fs.readFile(outputFilePath, 'utf-8').catch(() => '');
            await restoreReparseBackup(dir, backupDir);
            if (failedLog) await fs.writeFile(outputFilePath, failedLog, 'utf-8').catch(() => {});
            console.log('Remedy: Restored previous jobs/skills/meta after failed reparse');
            throw new Error(
                `Parser finished but jobs.json was missing or unreadable: ${readErr.message}`
            );
        }

        // Normalize + bake through the one write path before stamping the parse baseline.
        const consistency = await finalizeParsedResume(id, 'ResumeReparseStream');

        // Recreate meta.json with parse baseline (derivedSnapshotHash) after parser output is ready.
        const metadata = await writeMetaWithParseBaseline(metaPath, {
            id,
            displayName: existingMeta?.displayName || existingMeta?.name || id,
            originalFilename: keepEntry.name,
            originalPath: existingMeta?.originalPath || '',
            fileName: existingMeta?.fileName,
            sourceUrl: existingMeta?.sourceUrl || null,
            sourceType: existingMeta?.sourceType || (existingMeta?.sourceUrl ? 'url' : 'upload'),
            createdAt: new Date().toISOString(),
            uploadedBy: existingMeta?.uploadedBy || 'user',
            fileSize: (await fs.stat(keepDocPath)).size
        }, dir);

        await keepReparseBackup(dir, backupDir);
        await regenerateNonLocalResumesIndex(`resume re-parsed (${id})`);

        sendEvent('done', JSON.stringify({
            success: true,
            resumeId: id,
            displayName: metadata.displayName,
            jobCount: jobs.length,
            skillCount: Object.keys(skills).length,
            metadata,
            consistencyFindings: consistency.findings
        }));
        res.end();
    } catch (e) {
        try { if (tailTimer) clearInterval(tailTimer); } catch {}
        try { await tailOnce(true); } catch {}
        reportError(e, '[ResumeReparseStream] Failed to reparse with stream', 'Sent SSE error event; previous derived files restored when backup existed');
        sendEvent('error', JSON.stringify({ message: e instanceof Error ? e.message : String(e) }));
        res.end();
    }
});

// GET /api/resumes/:id/reparse-history: dated snapshots taken before each successful reparse or restore.
app.get('/api/resumes/:id/reparse-history', async (req, res) => {
    const { id } = req.params;
    if (!id || id === 'default') {
        return res.status(400).json({ error: 'Invalid resume id.' });
    }
    const dir = path.join(PARSED_RESUMES_DIR, id);
    try {
        await fs.access(dir);
        const history = await listReparseHistory(dir);
        res.setHeader('Cache-Control', 'no-store');
        res.json({ history });
    } catch (error) {
        sendRouteError(res, error, 'GET reparse-history', {
            notFoundMessage: RESUME_NOT_FOUND,
            message: error?.message || 'Failed to list resume backups',
            remedy: 'Responding 500; resume backups not listed',
        });
    }
});

// POST /api/resumes/:id/reparse-history/:backupId/restore: copy one snapshot back over derived files.
app.post('/api/resumes/:id/reparse-history/:backupId/restore', async (req, res) => {
    const { id, backupId } = req.params;
    if (!id || id === 'default') {
        return res.status(400).json({ error: 'Invalid resume id.' });
    }
    const dir = path.join(PARSED_RESUMES_DIR, id);
    try {
        await fs.access(dir);
        const restored = await restoreReparseHistoryEntry(dir, backupId);
        // Restored files go through the one write path (normalize + re-bake enriched-jobs.json).
        const consistency = await finalizeParsedResume(id, 'POST reparse-history restore');
        await regenerateNonLocalResumesIndex(`resume backup restored (${id} ${restored.id})`);
        res.json({ ok: true, id: restored.id, consistencyFindings: consistency.findings });
    } catch (error) {
        const status = error?.statusCode || (error?.code === 'ENOENT' ? 404 : 500);
        reportError(
            error,
            '[POST reparse-history restore] Failed to restore resume backup',
            status >= 500
                ? 'If a before-restore snapshot was written, restore that entry to return to the previous files'
                : 'Rejected the request; current resume files were left unchanged'
        );
        res.status(status).json({ error: error?.message || 'Failed to restore resume backup' });
    }
});

// GET /api/resumes: List all parsed resumes with metadata
app.get('/api/resumes', async (req, res) => {
    try {
        await fs.mkdir(PARSED_RESUMES_DIR, { recursive: true });
        const entries = await fs.readdir(PARSED_RESUMES_DIR, { withFileTypes: true });
        const resumeFolders = entries.filter(entry => entry.isDirectory());

        const resumes = [];

        for (const folder of resumeFolders) {
            const resumeId = folder.name;
            const dir = path.join(PARSED_RESUMES_DIR, resumeId);

            try {
                // Read meta.json - skip if it doesn't exist (not a valid parsed resume)
                let metadata = {};
                const metaPath = path.join(dir, 'meta.json');
                try {
                    const metaContent = await fs.readFile(metaPath, 'utf-8');
                    metadata = JSON.parse(metaContent);
                } catch (e) {
                    // meta.json doesn't exist - skip this folder (not a parsed resume)
                    continue;
                }

                // Get jobs and skills data to count items (flat layout, JSON format)
                const jobsPath = path.join(dir, 'jobs.json');
                const skillsPath = path.join(dir, 'skills.json');
                const categoriesPath = path.join(dir, 'categories.json');
                const { jobs, skills } = await readAndNormalizeResumeData(jobsPath, skillsPath, categoriesPath);

                // Get folder creation time
                const stats = await fs.stat(dir);

                // Skip hidden resumes (e.g., guide documents that aren't actual resumes)
                if (metadata.hidden) {
                    continue;
                }

                resumes.push({
                    id: resumeId,
                    displayName: metadata.displayName || resumeId,
                    createdAt: metadata.createdAt || stats.birthtime.toISOString(),
                    jobCount: jobs.length,
                    skillCount: Object.keys(skills).length,
                    metadata
                });
            } catch (error) {
                console.warn(`Failed to read resume ${resumeId}:`, error.message);
            }
        }

        // Sort by creation date (newest first)
        resumes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        res.json(resumes);
    } catch (error) {
        sendRouteError(res, error, 'GET resumes', { message: 'Failed to list resumes.', remedy: 'Responding 500; resume list not built' });
    }
});

// Configure multer for file uploads
const upload = multer({
    dest: path.join(PROJECT_ROOT, 'uploads'),
    fileFilter: (req, file, cb) => {
        const isDocx = file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
                       file.originalname.endsWith('.docx');
        const isPdf = file.mimetype === 'application/pdf' || file.originalname.endsWith('.pdf');

        if (isDocx || isPdf) {
            cb(null, true);
        } else {
            cb(new Error('Only .docx and .pdf files are allowed'));
        }
    },
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    }
});

// POST /api/resumes/upload: Upload and parse a .docx or .pdf resume (file or URL)
app.post('/api/resumes/upload', upload.single('resume'), async (req, res) => {
    try {
        let uploadedFile = req.file;
        let originalFilename = null;
        let fileSize = 0;
        let tempFilePath = null;

        // Check if URL is provided instead of file
        if (!uploadedFile && req.body.resumeUrl) {
            const resumeUrl = req.body.resumeUrl;
            console.log(`🌐 Fetching resume from URL: ${resumeUrl}`);

            try {
                const response = await fetch(resumeUrl);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                // Extract filename from URL or Content-Disposition header
                const contentDisposition = response.headers.get('content-disposition');
                if (contentDisposition) {
                    const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
                    if (filenameMatch) {
                        originalFilename = filenameMatch[1].replace(/['"]/g, '');
                    }
                }
                if (!originalFilename) {
                    originalFilename = path.basename(new URL(resumeUrl).pathname) || 'resume.pdf';
                }

                // Sanitize filename
                originalFilename = sanitizeFilename(originalFilename);

                // Ensure proper extension
                if (!originalFilename.endsWith('.docx') && !originalFilename.endsWith('.pdf')) {
                    // Try to detect from Content-Type
                    const contentType = response.headers.get('content-type');
                    if (contentType?.includes('pdf')) {
                        originalFilename += '.pdf';
                    } else {
                        originalFilename += '.docx';
                    }
                }

                // Create temp file
                const buffer = Buffer.from(await response.arrayBuffer());
                fileSize = buffer.length;
                tempFilePath = path.join(PARSED_RESUMES_DIR, `temp-${Date.now()}-${originalFilename}`);
                await fs.writeFile(tempFilePath, buffer);

                console.log(`✅ Downloaded resume: ${originalFilename} (${fileSize} bytes)`);

                // Create a file-like object for consistent handling
                uploadedFile = {
                    originalname: originalFilename,
                    path: tempFilePath,
                    size: fileSize
                };
            } catch (error) {
                return sendRouteError(res, error, 'ResumeUpload fetch URL', {
                    status: 400,
                    body: { error: 'Failed to fetch resume from URL', details: error.message },
                    remedy: 'Responding 400; nothing downloaded or parsed',
                });
            }
        }

        if (!uploadedFile) {
            return res.status(400).json({ error: 'No file uploaded or URL provided' });
        }

        const displayName = req.body.displayName || path.basename(uploadedFile.originalname, path.extname(uploadedFile.originalname));
        const resumeId = await generateUniqueResumeId(displayName);
        const outputDir = path.join(PARSED_RESUMES_DIR, resumeId);

        console.log(`📤 Processing resume: ${uploadedFile.originalname}`);
        console.log(`   Output directory: ${outputDir}`);

        // Create output directory
        await fs.mkdir(outputDir, { recursive: true });

        // Move/copy uploaded file to output directory
        const targetPath = path.join(outputDir, sanitizeFilename(uploadedFile.originalname));
        if (tempFilePath) {
            // URL fetch: move temp file
            await fs.rename(uploadedFile.path, targetPath);
        } else {
            // Regular upload: move uploaded file
            await fs.rename(uploadedFile.path, targetPath);
        }

        // Invoke resume-parser package (pip install -r requirements.txt). Module override via RESUME_PARSER_MODULE.
        const parserModule = process.env.RESUME_PARSER_MODULE || RESUME_PARSER_PYTHON_MODULE_UNSET_ENV;
        const resumeParserProjectPath = process.env.RESUME_PARSER_PROJECT_PATH
            ? path.resolve(PROJECT_ROOT, process.env.RESUME_PARSER_PROJECT_PATH)
            : path.resolve(PROJECT_ROOT, RESUME_PARSER_PROJECT_PATH_RELATIVE_UNSET_ENV);
        const defaultResumeParserPythonBin = path.join(resumeParserProjectPath, 'venv', 'bin', 'python3');
        const pythonBinCandidates = [
            defaultResumeParserPythonBin,
            'python3',
            'python3.11',
            'python',
        ].filter((value, idx, arr) => Boolean(value) && arr.indexOf(value) === idx);
        const cleanEnv = getParserSpawnEnv(process.env);

        async function runParserWithPythonBin(pythonBin) {
            console.log(`   Using parser: ${pythonBin} -m ${parserModule}`);

            const commandHeader = [
                '=== resume-parser ===',
                `Command: ${pythonBin} -m ${parserModule} "${targetPath}" -o "${outputDir}"`,
                `Cwd: ${resumeParserProjectPath}`,
                `Input: ${targetPath}`,
                `Output: ${outputDir}`,
                '-----------------------',
            ].join('\n');
            const pythonProcess = spawn(pythonBin, [
                '-u',
                '-m',
                parserModule,
                targetPath,
                '-o',
                outputDir
            ], {
                env: cleanEnv,
                cwd: resumeParserProjectPath,
            });
            trackResumeParserChild(pythonProcess, 'resume-parser');

            let stdout = '';
            let stderr = '';
            pythonProcess.stdout.on('data', (data) => {
                const t = data.toString();
                stdout += t;
                console.log(`[Parser stdout]: ${t.trim()}`);
            });
            pythonProcess.stderr.on('data', (data) => {
                stderr += data.toString();
                process.stderr.write(`[Parser stderr]: ${data.toString().trim()}\n`);
            });

            await new Promise((resolve, reject) => {
                pythonProcess.on('close', (code) => {
                    const combinedOutput = `${commandHeader}\n${stdout}${stderr}`;
                    if (code === 0) {
                        resolve(combinedOutput);
                        return;
                    }
                    const err = new Error(`Parser exited with code ${code}. Error: ${stderr}`);
                    err.parserOutput = combinedOutput;
                    reject(err);
                });

                pythonProcess.on('error', (error) => {
                    reject(new Error(`Failed to run parser with ${pythonBin}: ${error.message}`));
                });
            });
        }

        let parserRunError = null;
        let parserOutput = '';
        for (const pythonBin of pythonBinCandidates) {
            try {
                parserOutput = await runParserWithPythonBin(pythonBin);
                parserRunError = null;
                break;
            } catch (error) {
                parserRunError = error;
                parserOutput = error?.parserOutput || parserOutput;
                const details = String(error?.message || error);
                const isModuleNotFound = details.includes('ModuleNotFoundError') && details.includes('resume_parser');
                if (isModuleNotFound) {
                    reportError(error, `[ResumeUpload] Parser module missing with ${pythonBin}`, `Retrying parser with another Python binary (${pythonBinCandidates.join(', ')})`);
                    continue;
                }
                throw error;
            }
        }
        if (parserRunError) {
            throw parserRunError;
        }

        console.log(`✅ Resume parsed successfully: ${resumeId}`);

        // Read the parsed data to return in response (parser outputs jobs.json, skills.json, categories.json)
        const jobsPath = path.join(outputDir, 'jobs.json');
        const skillsPath = path.join(outputDir, 'skills.json');
        const categoriesPath = path.join(outputDir, 'categories.json');

        const { jobs, skills } = await readAndNormalizeResumeData(jobsPath, skillsPath, categoriesPath);
        // Normalize + bake through the one write path before stamping the parse baseline.
        const consistency = await finalizeParsedResume(resumeId, 'ResumeUpload');

        // Stamp meta last so derivedSnapshotHash matches clean parser output.
        const metaPath = path.join(outputDir, 'meta.json');
        const metadata = await writeMetaWithParseBaseline(metaPath, {
            id: resumeId,
            displayName: displayName,
            originalFilename: uploadedFile.originalname,
            sourceUrl: req.body.resumeUrl || null, // Original URL if fetched from web
            sourceType: req.body.resumeUrl ? 'url' : 'upload', // 'url' or 'upload'
            createdAt: new Date().toISOString(),
            uploadedBy: req.body.uploadedBy || 'user',
            fileSize: uploadedFile.size
        }, outputDir);

        await regenerateNonLocalResumesIndex(`resume created (${resumeId})`);

        res.json({
            success: true,
            resumeId: resumeId,
            displayName: displayName,
            jobCount: jobs.length,
            skillCount: Object.keys(skills).length,
            metadata: metadata,
            parserOutput,
            consistencyFindings: consistency.findings
        });

    } catch (error) {
        let cleanupNote = '';
        if (req.file && req.file.path) {
            try {
                await fs.unlink(req.file.path);
                cleanupNote = '; uploaded temp file removed';
            } catch (e) {
                if (e?.code !== 'ENOENT') {
                    reportError(e, '[ResumeUpload] Failed to remove uploaded temp file', `Leaving ${req.file.path} in place`);
                }
            }
        }

        sendRouteError(res, error, 'ResumeUpload', {
            remedy: `Responding 500${cleanupNote}`,
            body: {
                error: 'Failed to process resume upload',
                details: error.message,
                parserOutput: error?.parserOutput || ''
            },
        });
    }
});

// POST /api/resumes/upload-stream: stream resume-parser stdout/stderr line-by-line to client.
app.post('/api/resumes/upload-stream', upload.single('resume'), async (req, res) => {
    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    if (typeof res.flushHeaders === 'function') res.flushHeaders();

    let child = null;
    let outputFilePath = null;
    let tailTimer = null;
    let lastLen = 0;
    let remainder = '';

    const sendEvent = (eventType, payload) => {
        if (res.writableEnded) return;
        const safe = String(payload).replace(/\r/g, '');
        res.write(`event: ${eventType}\n`);
        res.write(`data: ${safe}\n\n`);
    };

    const sendOutputLine = (line) => {
        // Ensure no embedded newlines so SSE doesn't break.
        const cleaned = String(line).replace(/\r?\n/g, '');
        sendEvent('output', cleaned);
    };

    const sendStatus = (status) => sendEvent('status', status);

    const tailOnce = async (flushRemainder = false) => {
        if (!outputFilePath) return;
        const text = await fs.readFile(outputFilePath, 'utf-8').catch(() => '');
        if (text.length <= lastLen) return;
        const newText = text.slice(lastLen);
        lastLen = text.length;

        remainder += newText;
        const parts = remainder.split(/\r?\n/);
        remainder = parts.pop() || '';

        for (const line of parts) {
            if (line) sendOutputLine(line);
        }
        if (flushRemainder && remainder) {
            sendOutputLine(remainder);
            remainder = '';
        }
    };

    req.on('close', () => {
        try {
            if (child) child.kill('SIGTERM');
        } catch {
            /* ignore */
        }
    });

    try {
        sendStatus('Preparing resume upload...');

        let uploadedFile = req.file;
        let originalFilename = null;
        let fileSize = 0;
        let tempFilePath = null;

        // Check if URL is provided instead of file
        if (!uploadedFile && req.body.resumeUrl) {
            const resumeUrl = req.body.resumeUrl;
            sendStatus('Downloading resume...');

            const response = await fetch(resumeUrl);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            // Extract filename from Content-Disposition header when possible
            const contentDisposition = response.headers.get('content-disposition');
            if (contentDisposition) {
                const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
                if (filenameMatch) originalFilename = filenameMatch[1].replace(/['"]/g, '');
            }
            if (!originalFilename) {
                originalFilename = path.basename(new URL(resumeUrl).pathname) || 'resume.pdf';
            }

            originalFilename = sanitizeFilename(originalFilename);
            if (!originalFilename.endsWith('.docx') && !originalFilename.endsWith('.pdf')) {
                const contentType = response.headers.get('content-type');
                originalFilename += contentType?.includes('pdf') ? '.pdf' : '.docx';
            }

            const buffer = Buffer.from(await response.arrayBuffer());
            fileSize = buffer.length;
            tempFilePath = path.join(PARSED_RESUMES_DIR, `temp-${Date.now()}-${originalFilename}`);
            await fs.writeFile(tempFilePath, buffer);

            uploadedFile = { originalname: originalFilename, path: tempFilePath, size: fileSize };
        }

        if (!uploadedFile) {
            throw new Error('No file uploaded or URL provided');
        }

        const displayName = req.body.displayName || path.basename(uploadedFile.originalname, path.extname(uploadedFile.originalname));
        const resumeId = await generateUniqueResumeId(displayName);
        const outputDir = path.join(PARSED_RESUMES_DIR, resumeId);
        await fs.mkdir(outputDir, { recursive: true });

        sendStatus(`Staging resume: ${uploadedFile.originalname}`);

        // Move uploaded file into outputDir
        const targetPath = path.join(outputDir, sanitizeFilename(uploadedFile.originalname));
        await fs.rename(uploadedFile.path, targetPath);

        // Invoke resume-parser (stream stdout/stderr to file)
        const parserModule = process.env.RESUME_PARSER_MODULE || RESUME_PARSER_PYTHON_MODULE_UNSET_ENV;
        const resumeParserProjectPath = process.env.RESUME_PARSER_PROJECT_PATH
            ? path.resolve(PROJECT_ROOT, process.env.RESUME_PARSER_PROJECT_PATH)
            : path.resolve(PROJECT_ROOT, RESUME_PARSER_PROJECT_PATH_RELATIVE_UNSET_ENV);
        const pythonBin = path.join(resumeParserProjectPath, 'venv', 'bin', 'python3');

        const cleanEnv = getParserSpawnEnv(process.env);

        const commandHeader = [
            '=== resume-parser ===',
            `Command: ${pythonBin} -m ${parserModule} "${targetPath}" -o "${outputDir}"`,
            `Cwd: ${resumeParserProjectPath}`,
            `Input: ${targetPath}`,
            `Output: ${outputDir}`,
            '-----------------------',
        ].join('\n');

        outputFilePath = path.join(outputDir, 'parser-output.log');
        const outStream = fsSync.createWriteStream(outputFilePath, { flags: 'w' });
        outStream.write(commandHeader + '\n');

        sendStatus('Processing resume...');

        child = spawn(pythonBin, ['-u', '-m', parserModule, targetPath, '-o', outputDir], {
            env: cleanEnv,
            cwd: resumeParserProjectPath,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        trackResumeParserChild(child, 'resume-parser-stream');

        // Write stdout/stderr to the same file (combined)
        child.stdout.pipe(outStream);
        child.stderr.pipe(outStream);

        tailTimer = setInterval(() => {
            tailOnce(false).catch(() => {});
        }, 160);

        await new Promise((resolve, reject) => {
            child.on('close', (code) => {
                resolve(code);
            });
            child.on('error', reject);
        });

        clearInterval(tailTimer);
        await tailOnce(true);
        outStream.end();

        // If parser wrote no json, treat as failure
        const jobsPath = path.join(outputDir, 'jobs.json');
        const skillsPath = path.join(outputDir, 'skills.json');
        const categoriesPath = path.join(outputDir, 'categories.json');
        const { jobs, skills } = await readAndNormalizeResumeData(jobsPath, skillsPath, categoriesPath);
        // Normalize + bake through the one write path.
        const consistency = await finalizeParsedResume(resumeId, 'ResumeUploadStream');

        const metadata = { id: resumeId, displayName, createdAt: new Date().toISOString() };
        sendEvent('done', JSON.stringify({
            success: true,
            resumeId,
            displayName,
            jobCount: jobs.length,
            skillCount: Object.keys(skills).length,
            metadata,
            consistencyFindings: consistency.findings,
        }));

        await regenerateNonLocalResumesIndex(`resume created via upload-stream (${resumeId})`);

        res.end();
    } catch (e) {
        try { if (tailTimer) clearInterval(tailTimer); } catch {}
        try { await tailOnce(true); } catch {}
        sendEvent('error', JSON.stringify({ message: e instanceof Error ? e.message : String(e) }));
        res.end();
    }
});

/** Sorted list of palette filenames under static_content/colorPalettes (shared by manifest + catalog routes). */
async function getPaletteFilenameList() {
    const allEntries = await fs.readdir(PALETTE_DIR_PATH);
    const jsonFiles = allEntries.filter(entry => entry.endsWith('.json'));
    jsonFiles.sort((a, b) => {
        const regex = /^(\d+)-/;
        const matchA = a.match(regex);
        const matchB = b.match(regex);
        const numA = matchA ? parseInt(matchA[1], 10) : -1;
        const numB = matchB ? parseInt(matchB[1], 10) : -1;
        if (numA !== -1 && numB !== -1) return numA - numB;
        if (numA !== -1) return -1;
        if (numB !== -1) return 1;
        return a.localeCompare(b);
    });
    return jsonFiles;
}

/**
 * Palette catalog for clients that validate with paletteCatalogValidate (version 2 bundle).
 * Each entry includes filename (for theme.colorPalette), name, colors, optional backgroundSwatchIndex.
 */
async function getPaletteCatalogBundleV2() {
    const jsonFiles = await getPaletteFilenameList();
    const palettes = [];
    for (const filename of jsonFiles) {
        const filePath = path.join(PALETTE_DIR_PATH, filename);
        try {
            const raw = await fs.readFile(filePath, 'utf-8');
            const data = JSON.parse(raw);
            if (!data || typeof data !== 'object' || typeof data.name !== 'string' || !Array.isArray(data.colors)) {
                console.warn(`[server] Skipping invalid palette JSON (need name + colors[]): ${filename}`);
                continue;
            }
            const entry = {
                key: filename,
                filename,
                name: data.name,
                colors: data.colors
            };
            if (data.backgroundSwatchIndex != null) {
                entry.backgroundSwatchIndex = data.backgroundSwatchIndex;
            }
            palettes.push(entry);
        } catch (e) {
            console.warn(`[server] Could not read palette ${filename}:`, e.message);
        }
    }
    if (palettes.length === 0) {
        const err = new Error(`No valid palettes under ${PALETTE_DIR_PATH}`);
        err.code = 'ENOENT';
        throw err;
    }
    return { version: 2, palettes };
}

/** Filenames from S3-warmed in-memory bundle (same sort as getPaletteFilenameList). */
function paletteFilenamesFromCachedBundle(bundle) {
    const jsonFiles = [];
    for (const p of bundle.palettes) {
        const fn = p && (p.filename || p.key);
        if (typeof fn === 'string' && fn.length > 0) {
            jsonFiles.push(fn);
        }
    }
    jsonFiles.sort((a, b) => {
        const regex = /^(\d+)-/;
        const matchA = a.match(regex);
        const matchB = b.match(regex);
        const numA = matchA ? parseInt(matchA[1], 10) : -1;
        const numB = matchB ? parseInt(matchB[1], 10) : -1;
        if (numA !== -1 && numB !== -1) return numA - numB;
        if (numA !== -1) return -1;
        if (numB !== -1) return 1;
        return a.localeCompare(b);
    });
    return jsonFiles;
}

/** Log once: serve from in-memory catalog when the local palette dir is absent — avoid spamming the terminal. */
let loggedMissingLocalPaletteDirNotice = false;
function logMissingLocalPaletteDirOnce() {
    if (loggedMissingLocalPaletteDirNotice) return;
    loggedMissingLocalPaletteDirNotice = true;
    console.log(
        `[palette-catalog] static_content/colorPalettes not found — serving from in-memory catalog (${getLastPaletteCatalogSourceUrl()}). Expected for S3-only setup; add that folder to prefer local JSON files.`
    );
}

/** Prefer local JSON; if the directory is missing or empty, use startup S3/local-memory catalog. */
async function getPaletteCatalogBundleV2ForApi() {
    try {
        return await getPaletteCatalogBundleV2();
    } catch (e) {
        if (hasPaletteCatalogCache()) {
            logMissingLocalPaletteDirOnce();
            return getCachedPaletteCatalogBundle();
        }
        throw e;
    }
}

async function getPaletteManifestForApi() {
    try {
        return await getPaletteFilenameList();
    } catch (e) {
        if (hasPaletteCatalogCache()) {
            logMissingLocalPaletteDirOnce();
            return paletteFilenamesFromCachedBundle(getCachedPaletteCatalogBundle());
        }
        throw e;
    }
}

// GET /api/palette-manifest: Provides a sorted list of color palettes
app.get('/api/palette-manifest', async (req, res) => {
    try {
        res.json(await getPaletteManifestForApi());
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        sendRouteError(res, error, 'palette-catalog GET /api/palette-manifest', {
            status: 503,
            remedy: 'Responding 503; configure S3 or add palette JSON files under static_content/colorPalettes',
            body: {
                error: 'Palette catalog unavailable',
                message: msg,
                hint: 'No local static_content/colorPalettes and no warmed server catalog — configure S3 or add palette JSON files',
            },
        });
    }
});

// GET /api/palette-catalog: version-2 bundle { version: 2, palettes: [...] } for S3-style catalog clients
app.get('/api/palette-catalog', async (req, res) => {
    try {
        res.json(await getPaletteCatalogBundleV2ForApi());
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log(`[GET /api/palette-catalog] Not found (404): ${error.message}`);
            return res.status(404).json({ error: 'Failed to build palette catalog.', details: error.message });
        }
        sendRouteError(res, error, 'GET /api/palette-catalog', {
            body: { error: 'Failed to build palette catalog.', details: error.message },
        });
    }
});

// POST /api/write-css: Writes dynamic CSS content to a file
app.post('/api/write-css', async (req, res) => {
    try {
        await fs.mkdir(path.dirname(CSS_FILE_PATH), { recursive: true });
        await fs.writeFile(CSS_FILE_PATH, req.body);
        res.json({ success: true });
    } catch (error) {
        sendRouteError(res, error, 'POST write-css', { message: 'Failed to write CSS file.', remedy: 'Responding 500; palette-styles.css left as it was' });
    }
});

// === AUTOMATED BIDIRECTIONAL SYNC FIX ===

// Serve the auto-bidirectional fix script
app.get('/auto-bidirectional-fix', (req, res) => {
    const script = `
// AUTO BIDIRECTIONAL FIX - Automatically loads when page loads
// This script will automatically run when you click any rDiv

(function() {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeAutoBidirectionalFix);
    } else {
        initializeAutoBidirectionalFix();
    }
    
    function initializeAutoBidirectionalFix() {
        console.log('🤖 AUTO BIDIRECTIONAL FIX: Initializing...');
        
        // Wait a bit for app components to load
        setTimeout(() => {
            setupAutomaticBidirectionalSync();
        }, 2000);
    }
    
    function setupAutomaticBidirectionalSync() {
        console.log('🤖 AUTO BIDIRECTIONAL FIX: Setting up automatic sync...');
        
        // Function to apply the fix to all resume divs
        function applyFixToResumeDivs() {
            const resumeDivs = document.querySelectorAll('.biz-resume-div');
            const sceneContainer = document.getElementById('scene-container');
            
            if (resumeDivs.length === 0 || !sceneContainer) {
                console.log('🤖 AUTO FIX: Waiting for elements to load...');
                setTimeout(applyFixToResumeDivs, 1000);
                return;
            }
            
            console.log('🤖 AUTO FIX: Found ' + resumeDivs.length + ' resume divs, applying automatic fix...');
            
            resumeDivs.forEach(rDiv => {
                const jobNumber = parseInt(rDiv.getAttribute('data-job-number'));
                
                // Remove existing listeners by cloning
                const newRDiv = rDiv.cloneNode(true);
                rDiv.parentNode.replaceChild(newRDiv, rDiv);
                
                // Add the automatic bidirectional sync
                newRDiv.addEventListener('click', function(event) {
                    console.log('🎯 AUTO SYNC: Clicked rDiv job ' + jobNumber);
                    
                    // Find target cDiv with multiple strategies
                    const targetCDiv = document.querySelector('#biz-card-div-' + jobNumber) ||
                                      document.querySelector('#biz-card-div-' + jobNumber + '-clone') ||
                                      document.querySelector('[data-job-number="' + jobNumber + '"].biz-card-div');
                    
                    if (!targetCDiv) {
                        console.log('❌ AUTO SYNC: No cDiv found for job ' + jobNumber);
                        return;
                    }
                    
                    console.log('✅ AUTO SYNC: Found target cDiv: ' + targetCDiv.id);
                    
                    // Update selection state
                    if (window.selectionManager) {
                        try {
                            window.selectionManager.selectJobNumber(jobNumber, 'auto-bidirectional-fix');
                        } catch (error) {
                            console.log('⚠️ AUTO SYNC: Selection update failed: ' + error.message);
                        }
                    }
                    
                    // Apply selected styling
                    document.querySelectorAll('.biz-resume-div').forEach(div => {
                        div.classList.remove('selected');
                    });
                    newRDiv.classList.add('selected');
                    
                    // AUTOMATIC SCROLL TO CENTER THE cDiv
                    const sceneRect = sceneContainer.getBoundingClientRect();
                    const cDivRect = targetCDiv.getBoundingClientRect();
                    
                    const scrollTop = sceneContainer.scrollTop + (cDivRect.top - sceneRect.top) - (sceneRect.height / 2) + (cDivRect.height / 2);
                    
                    console.log('🔄 AUTO SYNC: Scrolling to center job ' + jobNumber + ' (position ' + Math.round(scrollTop) + 'px)');
                    
                    sceneContainer.scrollTo({
                        top: scrollTop,
                        behavior: 'smooth'
                    });
                    
                    // Verify the sync worked
                    setTimeout(() => {
                        const finalCDivRect = targetCDiv.getBoundingClientRect();
                        const finalSceneRect = sceneContainer.getBoundingClientRect();
                        const isVisible = finalCDivRect.top >= finalSceneRect.top && 
                                         finalCDivRect.bottom <= finalSceneRect.bottom;
                        
                        if (isVisible) {
                            console.log('✅ AUTO SYNC SUCCESS: Job ' + jobNumber + ' cDiv is now visible and centered!');
                        } else {
                            console.log('⚠️ AUTO SYNC PARTIAL: Job ' + jobNumber + ' cDiv scrolled but not fully centered');
                        }
                    }, 1000);
                });
            });
            
            console.log('🎉 AUTO BIDIRECTIONAL FIX: All resume divs now have automatic sync!');
            console.log('🎯 Click any resume item to see automatic bidirectional synchronization');
        }
        
        // Start applying the fix
        applyFixToResumeDivs();
        
        // Also watch for new resume divs being added dynamically
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.classList && node.classList.contains('biz-resume-div')) {
                        console.log('🤖 AUTO FIX: New resume div detected, applying fix...');
                        setTimeout(applyFixToResumeDivs, 100);
                    }
                });
            });
        });
        
        observer.observe(document.body, { childList: true, subtree: true });
    }
    
    console.log('🤖 AUTO BIDIRECTIONAL FIX: Loaded and ready!');
})();
`;
    res.setHeader('Content-Type', 'application/javascript');
    res.send(script);
});

// === AUTOMATED EVENT RECORDING AND ANALYSIS SYSTEM ===

// Serve the automated testing script automatically when requested
app.get('/automated-test-script', (req, res) => {
    const script = `
// AUTOMATED BIDIRECTIONAL SYNC TESTER - Auto-injected by server
(function() {
    console.log('🤖 SERVER-INJECTED AUTOMATED TESTER LOADING...');
    
    let isRecording = false;
    let testData = null;
    let startTime = null;
    
    // Automatically detect rDiv clicks
    document.addEventListener('click', function(event) {
        const resumeDiv = event.target.closest('.biz-resume-div');
        if (resumeDiv && !isRecording) {
            const jobNumber = parseInt(resumeDiv.getAttribute('data-job-number'));
            startAutomatedTest(jobNumber, event);
        }
    }, true);
    
    // ESC key to stop
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape' && isRecording) {
            event.preventDefault();
            stopAutomatedTest();
        }
    }, true);
    
    function startAutomatedTest(jobNumber, clickEvent) {
        isRecording = true;
        startTime = Date.now();
        
        testData = {
            sessionId: 'server-injected-' + Date.now(),
            startTime: new Date().toISOString(),
            triggeredByJob: jobNumber,
            trigger: {
                type: 'rDiv',
                jobNumber: jobNumber,
                coordinates: { x: clickEvent.clientX, y: clickEvent.clientY }
            },
            apiCalls: [],
            scrollEvents: [],
            stateSnapshots: []
        };
        
        console.log('🎬 SERVER-AUTOMATED TEST STARTED - Job ' + jobNumber);
        
        // Monitor API calls
        if (window.selectionManager && window.selectionManager.selectJobNumber) {
            const orig = window.selectionManager.selectJobNumber.bind(window.selectionManager);
            window.selectionManager.selectJobNumber = function(job, source) {
                if (isRecording) {
                    console.log('📞 API: selectJobNumber(' + job + ', "' + source + '")');
                    testData.apiCalls.push({
                        function: 'selectJobNumber',
                        jobNumber: job,
                        source: source,
                        timestamp: Date.now()
                    });
                }
                return orig(job, source);
            };
        }
        
        // Monitor scrolling
        const sceneContainer = document.getElementById('scene-container');
        if (sceneContainer) {
            const initialScroll = sceneContainer.scrollTop;
            const checkScroll = () => {
                if (!isRecording) return;
                const currentScroll = sceneContainer.scrollTop;
                const delta = Math.abs(currentScroll - initialScroll);
                if (delta > 10) {
                    console.log('📜 SCROLL: Scene container scrolled ' + delta + 'px');
                    testData.scrollEvents.push({
                        container: 'scene-container',
                        delta: delta,
                        timestamp: Date.now()
                    });
                }
                setTimeout(checkScroll, 200);
            };
            setTimeout(checkScroll, 100);
        }
        
        // Auto-stop after 5 seconds
        setTimeout(() => {
            if (isRecording) stopAutomatedTest();
        }, 5000);
    }
    
    async function stopAutomatedTest() {
        if (!isRecording) return;
        isRecording = false;
        
        testData.endTime = new Date().toISOString();
        testData.duration = Date.now() - startTime;
        
        console.log('⏹️ AUTOMATED TEST STOPPED');
        console.log('📊 Captured: ' + testData.apiCalls.length + ' API calls, ' + testData.scrollEvents.length + ' scroll events');
        
        // Simple analysis
        const hasAPI = testData.apiCalls.length > 0;
        const hasCorrectSource = testData.apiCalls.some(call => call.source && call.source.includes('Resume'));
        const hasScroll = testData.scrollEvents.length > 0;
        
        console.log('🔬 ANALYSIS:');
        console.log('   API Call: ' + (hasAPI ? '✅' : '❌'));
        console.log('   Correct Source: ' + (hasCorrectSource ? '✅' : '❌')); 
        console.log('   Scrolling: ' + (hasScroll ? '✅' : '❌'));
        
        const score = [hasAPI, hasCorrectSource, hasScroll].filter(Boolean).length;
        const result = score >= 2 ? 'SUCCESS' : 'FAILURE';
        
        console.log('🎯 RESULT: ' + result + ' (' + Math.round(score/3*100) + '%)');
        
        // Send to server automatically
        try {
            const response = await fetch('/api/event-data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(testData)
            });
            
            if (response.ok) {
                console.log('✅ Results automatically sent to server');
                console.log('📊 View analysis at: http://localhost:${actualBackendPort}/analysis-dashboard');
            }
        } catch (error) {
            console.log('⚠️ Could not send to server: ' + error.message);
        }
    }
    
    console.log('✅ SERVER-INJECTED AUTOMATED TESTER READY');
    console.log('🎯 Click any rDiv to automatically start test');
    console.log('⏹️ Press ESC to stop and get results');
})();
`;
    
    res.setHeader('Content-Type', 'application/javascript');
    res.send(script);
});

// Auto-inject the testing script into the main page
app.get('/auto-inject-test-script', (req, res) => {
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Auto-Inject Test Script</title>
    </head>
    <body>
        <h1>Loading Automated Test Script...</h1>
        <script>
            // Auto-load the test script
            const script = document.createElement('script');
            script.src = '/automated-test-script';
            document.head.appendChild(script);
            
            // Redirect to main app after loading
            setTimeout(() => {
                window.location.href = 'http://localhost:${viteDevPort}';
            }, 1000);
        </script>
    </body>
    </html>
    `;
    
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
});

// Initialize event data directories
async function initializeEventDataDirectories() {
    try {
        await fs.mkdir(EVENT_DATA_DIR, { recursive: true });
        await fs.mkdir(ANALYSIS_REPORTS_DIR, { recursive: true });
        console.log('📁 Event data directories initialized');
    } catch (error) {
        reportError(error, '[server] Failed to initialize event data directories', 'Continuing startup; event-data and analysis routes will fail until the directories can be created');
    }
}

// Automated rDiv-cDiv Synchronization Analysis Engine
class SynchronizationAnalyzer {
    constructor() {
        this.testCriteria = {
            trigger: { weight: 0.15, description: 'Valid rDiv click detection' },
            apiCall: { weight: 0.25, description: 'selectJobNumber API called correctly' },
            sourceParam: { weight: 0.20, description: 'Correct source parameter used' },
            scrollBehavior: { weight: 0.25, description: 'Scene container scrolled appropriately' },
            targetVisibility: { weight: 0.15, description: 'Target cDiv scrolled into view' }
        };
    }

    analyzeEventData(eventData) {
        console.log('🔬 Starting automated synchronization analysis...');
        
        const analysis = {
            sessionId: eventData.sessionId,
            timestamp: new Date().toISOString(),
            testResults: {},
            overallScore: 0,
            determination: 'UNKNOWN',
            issues: [],
            recommendations: []
        };

        // Test 1: Trigger Analysis
        analysis.testResults.trigger = this.analyzeTrigger(eventData);
        
        // Test 2: API Call Analysis  
        analysis.testResults.apiCall = this.analyzeAPICalls(eventData);
        
        // Test 3: Source Parameter Analysis
        analysis.testResults.sourceParam = this.analyzeSourceParameters(eventData);
        
        // Test 4: Scroll Behavior Analysis
        analysis.testResults.scrollBehavior = this.analyzeScrollBehavior(eventData);
        
        // Test 5: Target Visibility Analysis
        analysis.testResults.targetVisibility = this.analyzeTargetVisibility(eventData);

        // Calculate overall score and determination
        this.calculateOverallResult(analysis);
        
        // Generate issues and recommendations
        this.generateRecommendations(analysis);

        console.log(`🎯 Analysis complete: ${analysis.determination} (${analysis.overallScore}%)`);
        return analysis;
    }

    analyzeTrigger(eventData) {
        const trigger = eventData.trigger || eventData.initialClick;
        
        if (!trigger) {
            return {
                passed: false,
                score: 0,
                details: 'No trigger event detected',
                rawData: null
            };
        }

        const isValidRDiv = trigger.type === 'rDiv' || 
                           (trigger.element && trigger.element.className?.includes('resume'));
        
        const hasJobNumber = trigger.jobNumber && !isNaN(parseInt(trigger.jobNumber));
        
        return {
            passed: isValidRDiv && hasJobNumber,
            score: (isValidRDiv && hasJobNumber) ? 100 : 0,
            details: `${trigger.type || 'unknown'} click on Job ${trigger.jobNumber}`,
            rawData: {
                triggerType: trigger.type,
                jobNumber: trigger.jobNumber,
                coordinates: trigger.coordinates,
                semanticArea: trigger.semanticArea || trigger.clickLocation
            }
        };
    }

    analyzeAPICalls(eventData) {
        const apiCalls = eventData.apiCalls || [];
        const targetJob = eventData.trigger?.jobNumber || eventData.triggeredByJob;
        
        if (!targetJob) {
            return {
                passed: false,
                score: 0,
                details: 'No target job number identified',
                rawData: { totalCalls: apiCalls.length }
            };
        }

        // Look for selectJobNumber call with correct job number
        const selectCalls = apiCalls.filter(call => 
            call.function === 'selectJobNumber' && 
            parseInt(call.jobNumber || call.parameters?.jobNumber) === parseInt(targetJob)
        );

        const hasCorrectCall = selectCalls.length > 0;
        
        return {
            passed: hasCorrectCall,
            score: hasCorrectCall ? 100 : 0,
            details: hasCorrectCall 
                ? `selectJobNumber(${targetJob}) called successfully`
                : `selectJobNumber(${targetJob}) not called`,
            rawData: {
                totalAPICalls: apiCalls.length,
                selectJobNumberCalls: selectCalls.length,
                targetJob: targetJob,
                allCalls: apiCalls.map(call => ({
                    function: call.function,
                    jobNumber: call.jobNumber || call.parameters?.jobNumber,
                    source: call.source || call.parameters?.source
                }))
            }
        };
    }

    analyzeSourceParameters(eventData) {
        const apiCalls = eventData.apiCalls || [];
        const targetJob = eventData.trigger?.jobNumber || eventData.triggeredByJob;
        
        const relevantCalls = apiCalls.filter(call => 
            call.function === 'selectJobNumber' && 
            parseInt(call.jobNumber || call.parameters?.jobNumber) === parseInt(targetJob)
        );

        if (relevantCalls.length === 0) {
            return {
                passed: false,
                score: 0,
                details: 'No relevant API calls found for source analysis',
                rawData: { relevantCalls: 0 }
            };
        }

        // Check for correct source parameter (should include ResumeListController for rDiv clicks)
        const hasCorrectSource = relevantCalls.some(call => {
            const source = call.source || call.parameters?.source || '';
            return source.includes('ResumeListController') || source.includes('handleBizResumeDivClickEvent');
        });

        const sourceUsed = relevantCalls[0]?.source || relevantCalls[0]?.parameters?.source || 'unknown';

        return {
            passed: hasCorrectSource,
            score: hasCorrectSource ? 100 : 0,
            details: hasCorrectSource 
                ? `Correct source parameter: ${sourceUsed}`
                : `Incorrect source parameter: ${sourceUsed}`,
            rawData: {
                expectedSource: 'ResumeListController',
                actualSource: sourceUsed,
                allSources: relevantCalls.map(call => call.source || call.parameters?.source)
            }
        };
    }

    analyzeScrollBehavior(eventData) {
        const scrollEvents = eventData.scrollEvents || [];
        const stateSnapshots = eventData.stateSnapshots || eventData.domSnapshots || [];
        
        // Check if scene container scrolled (expected for rDiv click)
        let sceneScrolled = false;
        let scrollDelta = 0;

        // Method 1: Check scroll events
        const sceneScrollEvents = scrollEvents.filter(event => 
            event.container === 'scene-container' || 
            event.container === 'sceneContainer'
        );

        if (sceneScrollEvents.length > 0) {
            const maxDelta = Math.max(...sceneScrollEvents.map(event => Math.abs(event.delta)));
            sceneScrolled = maxDelta > 10;
            scrollDelta = maxDelta;
        }

        // Method 2: Check state snapshots for scroll position changes
        if (!sceneScrolled && stateSnapshots.length >= 2) {
            const firstSnapshot = stateSnapshots[0];
            const lastSnapshot = stateSnapshots[stateSnapshots.length - 1];
            
            const initialScroll = firstSnapshot.scrollPositions?.sceneContainer?.scrollTop || 
                                 firstSnapshot.systemState?.scrollPositions?.sceneContainer?.scrollTop || 0;
            const finalScroll = lastSnapshot.scrollPositions?.sceneContainer?.scrollTop || 
                               lastSnapshot.systemState?.scrollPositions?.sceneContainer?.scrollTop || 0;
            
            scrollDelta = Math.abs(finalScroll - initialScroll);
            sceneScrolled = scrollDelta > 10;
        }

        return {
            passed: sceneScrolled,
            score: sceneScrolled ? 100 : 0,
            details: sceneScrolled 
                ? `Scene container scrolled ${Math.round(scrollDelta)}px`
                : `Scene container did not scroll (delta: ${Math.round(scrollDelta)}px)`,
            rawData: {
                scrollEvents: sceneScrollEvents.length,
                scrollDelta: scrollDelta,
                totalScrollEvents: scrollEvents.length,
                hasStateSnapshots: stateSnapshots.length > 0
            }
        };
    }

    analyzeTargetVisibility(eventData) {
        const targetJob = eventData.trigger?.jobNumber || eventData.triggeredByJob;
        const finalSnapshot = eventData.stateSnapshots?.[eventData.stateSnapshots.length - 1] || 
                             eventData.domSnapshots?.[eventData.domSnapshots.length - 1] ||
                             eventData.finalState;

        if (!targetJob || !finalSnapshot) {
            return {
                passed: false,
                score: 0,
                details: 'Insufficient data for visibility analysis',
                rawData: { targetJob, hasSnapshot: !!finalSnapshot }
            };
        }

        // Look for target cDiv in visible elements
        let targetVisible = false;
        let visibilityPercentage = 0;
        let headersVisible = 0;

        // Check different data structures
        const visibleElements = finalSnapshot.visibleElements || finalSnapshot.elementsInView;
        
        if (visibleElements) {
            const targetCDiv = visibleElements.cardDivs?.find(card => 
                parseInt(card.jobNumber) === parseInt(targetJob)
            ) || visibleElements.cDiv;

            if (targetCDiv) {
                visibilityPercentage = targetCDiv.visibilityPercentage || 0;
                targetVisible = visibilityPercentage >= 50;
                
                // Count visible headers
                if (targetCDiv.headers) {
                    headersVisible = targetCDiv.headers.filter(header => 
                        header.visible || header.visibilityPercentage >= 50
                    ).length;
                }
            }
        }

        const passed = targetVisible && headersVisible > 0;

        return {
            passed: passed,
            score: passed ? 100 : (targetVisible ? 75 : 0),
            details: passed 
                ? `Target cDiv visible (${visibilityPercentage}%) with ${headersVisible} visible headers`
                : `Target cDiv not sufficiently visible (${visibilityPercentage}%, ${headersVisible} headers)`,
            rawData: {
                targetJob: targetJob,
                visibilityPercentage: visibilityPercentage,
                headersVisible: headersVisible,
                targetFound: !!visibleElements
            }
        };
    }

    calculateOverallResult(analysis) {
        let weightedScore = 0;
        
        Object.keys(this.testCriteria).forEach(testKey => {
            const test = analysis.testResults[testKey];
            const criteria = this.testCriteria[testKey];
            
            if (test) {
                weightedScore += (test.score / 100) * criteria.weight;
            }
        });

        analysis.overallScore = Math.round(weightedScore * 100);

        // Determine result based on score
        if (analysis.overallScore >= 85) {
            analysis.determination = 'SUCCESS - Bidirectional sync working correctly';
        } else if (analysis.overallScore >= 70) {
            analysis.determination = 'PARTIAL SUCCESS - Minor issues detected';
        } else if (analysis.overallScore >= 50) {
            analysis.determination = 'FAILURE - Significant synchronization problems';
        } else {
            analysis.determination = 'CRITICAL FAILURE - Bidirectional sync not functioning';
        }
    }

    generateRecommendations(analysis) {
        const issues = [];
        const recommendations = [];

        Object.keys(analysis.testResults).forEach(testKey => {
            const test = analysis.testResults[testKey];
            const criteria = this.testCriteria[testKey];
            
            if (!test.passed) {
                issues.push(`${criteria.description}: ${test.details}`);
                
                // Generate specific recommendations
                switch(testKey) {
                    case 'trigger':
                        recommendations.push('Verify rDiv click detection is working properly');
                        break;
                    case 'apiCall':
                        recommendations.push('Check if selectionManager.selectJobNumber is being called');
                        break;
                    case 'sourceParam':
                        recommendations.push('Verify ResumeListController is passing correct source parameter');
                        break;
                    case 'scrollBehavior':
                        recommendations.push('Check if scene container scroll functionality is implemented');
                        break;
                    case 'targetVisibility':
                        recommendations.push('Verify target cDiv is being scrolled into view correctly');
                        break;
                }
            }
        });

        analysis.issues = issues;
        analysis.recommendations = recommendations;
    }
}

// POST /api/event-data - Receive and automatically analyze event data
app.post('/api/event-data', async (req, res) => {
    try {
        const eventData = req.body;
        
        if (!eventData.sessionId) {
            eventData.sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        }

        console.log(`📊 Received event data for automated analysis: ${eventData.sessionId}`);

        // Save raw event data
        const eventDataFilename = `event-${eventData.sessionId}.json`;
        const eventDataPath = path.resolve(EVENT_DATA_DIR, eventDataFilename);
        await fs.writeFile(eventDataPath, JSON.stringify(eventData, null, 2));

        // Perform automated analysis
        const analyzer = new SynchronizationAnalyzer();
        const analysisResult = analyzer.analyzeEventData(eventData);

        // Save analysis report
        const reportFilename = `analysis-${eventData.sessionId}.json`;
        const reportPath = path.resolve(ANALYSIS_REPORTS_DIR, reportFilename);
        await fs.writeFile(reportPath, JSON.stringify(analysisResult, null, 2));

        // Generate human-readable report
        const humanReport = generateHumanReadableReport(analysisResult);
        const humanReportPath = path.resolve(ANALYSIS_REPORTS_DIR, `report-${eventData.sessionId}.txt`);
        await fs.writeFile(humanReportPath, humanReport);

        console.log(`✅ Analysis complete: ${analysisResult.determination}`);
        console.log(`📄 Reports saved: ${reportFilename}, report-${eventData.sessionId}.txt`);

        res.json({
            success: true,
            sessionId: eventData.sessionId,
            analysis: analysisResult,
            files: {
                eventData: eventDataFilename,
                analysisReport: reportFilename,
                humanReport: `report-${eventData.sessionId}.txt`
            }
        });

    } catch (error) {
        sendRouteError(res, error, 'POST event-data', {
            body: { error: 'Failed to process event data', details: error.message },
            remedy: 'Responding 500; event data or analysis report may be partially written',
        });
    }
});

// GET /api/analysis/:sessionId - Retrieve analysis results
app.get('/api/analysis/:sessionId', async (req, res) => {
    try {
        const sessionId = req.params.sessionId;
        const reportPath = path.resolve(ANALYSIS_REPORTS_DIR, `analysis-${sessionId}.json`);
        
        const analysisData = await fs.readFile(reportPath, 'utf-8');
        const analysis = JSON.parse(analysisData);
        
        res.json(analysis);
    } catch (error) {
        if (error.code === 'ENOENT') {
            res.status(404).json({ error: 'Analysis not found' });
        } else {
            sendRouteError(res, error, 'GET analysis', { message: 'Failed to retrieve analysis' });
        }
    }
});

// GET /analysis-dashboard - HTML dashboard for viewing all analyses
app.get('/analysis-dashboard', async (req, res) => {
    try {
        const reportFiles = await fs.readdir(ANALYSIS_REPORTS_DIR);
        const analysisFiles = reportFiles.filter(file => file.startsWith('analysis-') && file.endsWith('.json'));
        
        const analyses = [];
        for (const filename of analysisFiles.slice(-20)) { // Last 20 analyses
            try {
                const filePath = path.resolve(ANALYSIS_REPORTS_DIR, filename);
                const analysisData = await fs.readFile(filePath, 'utf-8');
                const analysis = JSON.parse(analysisData);
                analyses.push({
                    filename: filename,
                    sessionId: analysis.sessionId,
                    timestamp: analysis.timestamp,
                    determination: analysis.determination,
                    overallScore: analysis.overallScore
                });
            } catch (err) {
                console.warn(`Failed to read analysis file ${filename}:`, err.message);
            }
        }

        analyses.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        const html = generateAnalysisDashboardHTML(analyses);
        res.setHeader('Content-Type', 'text/html');
        res.send(html);

    } catch (error) {
        sendRouteError(res, error, 'GET analysis-dashboard', { html: 'Failed to generate analysis dashboard' });
    }
});

function generateHumanReadableReport(analysis) {
    const lines = [];
    
    lines.push('='.repeat(60));
    lines.push('BIDIRECTIONAL SYNCHRONIZATION ANALYSIS REPORT');
    lines.push('='.repeat(60));
    lines.push('');
    lines.push(`Session ID: ${analysis.sessionId}`);
    lines.push(`Timestamp: ${analysis.timestamp}`);
    lines.push(`Overall Score: ${analysis.overallScore}%`);
    lines.push(`Determination: ${analysis.determination}`);
    lines.push('');
    
    lines.push('DETAILED TEST RESULTS:');
    lines.push('-'.repeat(40));
    
    Object.keys(analysis.testResults).forEach(testKey => {
        const test = analysis.testResults[testKey];
        const status = test.passed ? '✅ PASS' : '❌ FAIL';
        lines.push(`${status} ${testKey.toUpperCase()}: ${test.details} (${test.score}%)`);
    });
    
    if (analysis.issues.length > 0) {
        lines.push('');
        lines.push('ISSUES IDENTIFIED:');
        lines.push('-'.repeat(40));
        analysis.issues.forEach((issue, index) => {
            lines.push(`${index + 1}. ${issue}`);
        });
    }
    
    if (analysis.recommendations.length > 0) {
        lines.push('');
        lines.push('RECOMMENDATIONS:');
        lines.push('-'.repeat(40));
        analysis.recommendations.forEach((rec, index) => {
            lines.push(`${index + 1}. ${rec}`);
        });
    }
    
    lines.push('');
    lines.push('='.repeat(60));
    
    return lines.join('\n');
}

function generateAnalysisDashboardHTML(analyses) {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Bidirectional Sync Analysis Dashboard</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
            .header { background: #2c3e50; color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
            .analysis-list { background: white; border-radius: 8px; padding: 20px; }
            .analysis-item { 
                border: 1px solid #ddd; margin: 10px 0; padding: 15px; border-radius: 5px;
                display: flex; justify-content: space-between; align-items: center;
            }
            .success { border-left: 4px solid #27ae60; }
            .partial { border-left: 4px solid #f39c12; }
            .failure { border-left: 4px solid #e74c3c; }
            .score { font-size: 1.2em; font-weight: bold; }
            .btn { padding: 8px 12px; border: none; border-radius: 4px; cursor: pointer; text-decoration: none; }
            .btn-view { background: #3498db; color: white; }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>🔬 Bidirectional Sync Analysis Dashboard</h1>
            <p>Automated analysis results for rDiv-cDiv synchronization tests</p>
        </div>
        
        <div class="analysis-list">
            <h2>Recent Analysis Results</h2>
            ${analyses.length === 0 ? 
                '<p>No analyses available yet. Run a test to see results here.</p>' :
                analyses.map(analysis => {
                    const cssClass = analysis.overallScore >= 85 ? 'success' : 
                                   analysis.overallScore >= 70 ? 'partial' : 'failure';
                    const scoreColor = analysis.overallScore >= 85 ? '#27ae60' : 
                                     analysis.overallScore >= 70 ? '#f39c12' : '#e74c3c';
                    
                    return `
                        <div class="analysis-item ${cssClass}">
                            <div>
                                <strong>${analysis.sessionId}</strong><br>
                                <small>${new Date(analysis.timestamp).toLocaleString()}</small><br>
                                <em>${analysis.determination}</em>
                            </div>
                            <div style="text-align: right;">
                                <div class="score" style="color: ${scoreColor};">${analysis.overallScore}%</div>
                                <a href="/api/analysis/${analysis.sessionId}" class="btn btn-view" target="_blank">View Details</a>
                            </div>
                        </div>
                    `;
                }).join('')
            }
        </div>
    </body>
    </html>
    `;
}

// === BIDIRECTIONAL SYNC LOGGING ENDPOINTS ===

// Initialize sync logs directory and index
async function initializeSyncLogsDirectory() {
    try {
        await fs.mkdir(SYNC_LOGS_DIR, { recursive: true });
        
        // Initialize index file if it doesn't exist
        try {
            await fs.access(SYNC_LOGS_INDEX_FILE);
        } catch {
            const initialIndex = {
                created: new Date().toISOString(),
                totalSessions: 0,
                sessions: []
            };
            await fs.writeFile(SYNC_LOGS_INDEX_FILE, JSON.stringify(initialIndex, null, 2));
            console.log('📝 Created sync logs index file');
        }
    } catch (error) {
        reportError(error, '[server] Failed to initialize sync logs directory', 'Continuing startup; sync-log routes will fail until the directory and index can be created');
    }
}

// Helper function to update the index file
async function updateSyncLogsIndex(sessionData) {
    try {
        const indexData = await fs.readFile(SYNC_LOGS_INDEX_FILE, 'utf-8');
        const index = JSON.parse(indexData);
        
        // Add new session to index
        index.sessions.push({
            sessionId: sessionData.sessionId,
            timestamp: sessionData.sessionStart,
            interactions: sessionData.interactions?.length || 0,
            evaluations: sessionData.evaluations?.length || 0,
            successRate: calculateSuccessRate(sessionData.evaluations),
            filename: `${sessionData.sessionId}.json`
        });
        
        index.totalSessions = index.sessions.length;
        index.lastUpdated = new Date().toISOString();
        
        await fs.writeFile(SYNC_LOGS_INDEX_FILE, JSON.stringify(index, null, 2));
    } catch (error) {
        reportError(error, '[server] Failed to update sync logs index', 'Rethrowing so POST /api/sync-logs responds 500 (the session file was written; index.json is stale)');
        throw error;
    }
}

// Helper function to calculate success rate
function calculateSuccessRate(evaluations) {
    if (!evaluations || evaluations.length === 0) return 0;
    const successful = evaluations.filter(e => e.overall === 'SUCCESS').length;
    return Math.round((successful / evaluations.length) * 100);
}

// POST /api/sync-logs: Save bidirectional sync log data
app.post('/api/sync-logs', async (req, res) => {
    try {
        const logData = req.body;
        
        // Generate session ID if not provided
        if (!logData.sessionId) {
            logData.sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        }
        
        // Add server-side metadata
        logData.serverMetadata = {
            savedAt: new Date().toISOString(),
            serverVersion: '1.0.0',
            clientIP: req.ip || req.connection.remoteAddress,
            userAgent: req.headers['user-agent']
        };
        
        // Save the log file
        const filename = `${logData.sessionId}.json`;
        const filepath = path.resolve(SYNC_LOGS_DIR, filename);
        await fs.writeFile(filepath, JSON.stringify(logData, null, 2));
        
        // Update the index
        await updateSyncLogsIndex(logData);
        
        console.log(`📝 Saved sync log session: ${logData.sessionId}`);
        console.log(`   📊 ${logData.interactions?.length || 0} interactions, ${logData.evaluations?.length || 0} evaluations`);
        
        res.json({ 
            success: true, 
            sessionId: logData.sessionId,
            filename: filename,
            interactions: logData.interactions?.length || 0,
            evaluations: logData.evaluations?.length || 0
        });
        
    } catch (error) {
        sendRouteError(res, error, 'POST sync-logs', { message: 'Failed to save sync log.' });
    }
});

// GET /api/sync-logs: Get list of all sync log sessions
app.get('/api/sync-logs', async (req, res) => {
    try {
        const indexData = await fs.readFile(SYNC_LOGS_INDEX_FILE, 'utf-8');
        const index = JSON.parse(indexData);
        
        // Sort sessions by timestamp (newest first)
        index.sessions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        res.json(index);
        
    } catch (error) {
        if (error.code === 'ENOENT') {
            res.json({ totalSessions: 0, sessions: [] });
        } else {
            sendRouteError(res, error, 'GET sync-logs', { message: 'Failed to get sync logs index.' });
        }
    }
});

// GET /api/sync-logs/:sessionId: Get specific sync log session
app.get('/api/sync-logs/:sessionId', async (req, res) => {
    try {
        const sessionId = req.params.sessionId;
        const filename = `${sessionId}.json`;
        const filepath = path.resolve(SYNC_LOGS_DIR, filename);
        
        const logData = await fs.readFile(filepath, 'utf-8');
        const parsedLog = JSON.parse(logData);
        
        res.json(parsedLog);
        
    } catch (error) {
        if (error.code === 'ENOENT') {
            res.status(404).json({ error: 'Sync log session not found.' });
        } else {
            sendRouteError(res, error, 'GET sync-logs session', { message: 'Failed to get sync log session.' });
        }
    }
});

// DELETE /api/sync-logs/:sessionId: Delete specific sync log session
app.delete('/api/sync-logs/:sessionId', async (req, res) => {
    try {
        const sessionId = req.params.sessionId;
        const filename = `${sessionId}.json`;
        const filepath = path.resolve(SYNC_LOGS_DIR, filename);
        
        // Delete the log file
        await fs.unlink(filepath);
        
        // Update the index by removing the session
        const indexData = await fs.readFile(SYNC_LOGS_INDEX_FILE, 'utf-8');
        const index = JSON.parse(indexData);
        
        index.sessions = index.sessions.filter(session => session.sessionId !== sessionId);
        index.totalSessions = index.sessions.length;
        index.lastUpdated = new Date().toISOString();
        
        await fs.writeFile(SYNC_LOGS_INDEX_FILE, JSON.stringify(index, null, 2));
        
        console.log(`🗑️ Deleted sync log session: ${sessionId}`);
        res.json({ success: true, deletedSessionId: sessionId });
        
    } catch (error) {
        if (error.code === 'ENOENT') {
            res.status(404).json({ error: 'Sync log session not found.' });
        } else {
            sendRouteError(res, error, 'DELETE sync-logs session', {
                message: 'Failed to delete sync log session.',
                remedy: 'Responding 500; the session file may be deleted while index.json still lists it',
            });
        }
    }
});

// GET /sync-logs-dashboard: HTML dashboard for viewing sync logs
app.get('/sync-logs-dashboard', async (req, res) => {
    try {
        const indexData = await fs.readFile(SYNC_LOGS_INDEX_FILE, 'utf-8');
        const index = JSON.parse(indexData);
        
        const html = generateSyncLogsDashboard(index);
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
        
    } catch (error) {
        sendRouteError(res, error, 'GET sync-logs-dashboard', {
            html: `
            <html>
                <head><title>Sync Logs Dashboard Error</title></head>
                <body>
                    <h1>Error Loading Dashboard</h1>
                    <p>${error.message}</p>
                </body>
            </html>
        `,
        });
    }
});

// Helper function to generate sync logs dashboard HTML
function generateSyncLogsDashboard(index) {
    const sessions = index.sessions || [];
    const totalSessions = sessions.length;
    const avgSuccessRate = totalSessions > 0 ? 
        Math.round(sessions.reduce((sum, s) => sum + s.successRate, 0) / totalSessions) : 0;
    
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Bidirectional Sync Logs Dashboard</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
                .header { background: #2c3e50; color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
                .stats { display: flex; gap: 20px; margin-bottom: 20px; }
                .stat-card { background: white; padding: 15px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); flex: 1; }
                .stat-number { font-size: 2em; font-weight: bold; color: #3498db; }
                .stat-label { color: #666; }
                .sessions { background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
                .session { padding: 15px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; }
                .session:last-child { border-bottom: none; }
                .session-info { display: flex; flex-direction: column; }
                .session-id { font-weight: bold; color: #2c3e50; }
                .session-meta { color: #666; font-size: 0.9em; }
                .success-rate { padding: 5px 10px; border-radius: 20px; color: white; font-weight: bold; }
                .success-high { background: #27ae60; }
                .success-medium { background: #f39c12; }
                .success-low { background: #e74c3c; }
                .actions { display: flex; gap: 10px; }
                .btn { padding: 8px 12px; border: none; border-radius: 4px; cursor: pointer; text-decoration: none; font-size: 0.9em; }
                .btn-view { background: #3498db; color: white; }
                .btn-delete { background: #e74c3c; color: white; }
                .no-sessions { padding: 40px; text-align: center; color: #666; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>📊 Bidirectional Sync Logs Dashboard</h1>
                <p>Monitor and analyze bidirectional synchronization test results</p>
            </div>
            
            <div class="stats">
                <div class="stat-card">
                    <div class="stat-number">${totalSessions}</div>
                    <div class="stat-label">Total Sessions</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">${avgSuccessRate}%</div>
                    <div class="stat-label">Average Success Rate</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">${sessions.reduce((sum, s) => sum + s.interactions, 0)}</div>
                    <div class="stat-label">Total Interactions</div>
                </div>
            </div>
            
            <div class="sessions">
                ${sessions.length === 0 ? 
                    '<div class="no-sessions">No sync log sessions found.<br>Start testing bidirectional sync to see results here.</div>' :
                    sessions.map(session => `
                        <div class="session">
                            <div class="session-info">
                                <div class="session-id">${session.sessionId}</div>
                                <div class="session-meta">
                                    ${new Date(session.timestamp).toLocaleString()} • 
                                    ${session.interactions} interactions • 
                                    ${session.evaluations} evaluations
                                </div>
                            </div>
                            <div style="display: flex; align-items: center; gap: 15px;">
                                <div class="success-rate ${session.successRate >= 80 ? 'success-high' : session.successRate >= 50 ? 'success-medium' : 'success-low'}">
                                    ${session.successRate}%
                                </div>
                                <div class="actions">
                                    <a href="/api/sync-logs/${session.sessionId}" class="btn btn-view" target="_blank">View JSON</a>
                                    <button onclick="deleteSession('${session.sessionId}')" class="btn btn-delete">Delete</button>
                                </div>
                            </div>
                        </div>
                    `).join('')
                }
            </div>
            
            <script>
                function deleteSession(sessionId) {
                    if (confirm('Are you sure you want to delete session ' + sessionId + '?')) {
                        fetch('/api/sync-logs/' + sessionId, { method: 'DELETE' })
                            .then(response => response.json())
                            .then(result => {
                                if (result.success) {
                                    location.reload();
                                } else {
                                    alert('Failed to delete session: ' + (result.error || 'Unknown error'));
                                }
                            })
                            .catch(error => {
                                alert('Error deleting session: ' + error.message);
                            });
                    }
                }
            </script>
        </body>
        </html>
    `;
}

// GET /api/check-dependencies: Server-side dependency compliance check
app.get('/api/check-dependencies', async (req, res) => {
    try {
        console.log('🔍 Server: Running dependency compliance check...');
        
        // Scan project for dependency violations
        
        // Generate detailed report
        
        // Check for violations
        const hasViolations = scanResults.violatingComponents.length > 0;
        
        if (hasViolations) {
            console.warn(`❌ Server: Found ${scanResults.violatingComponents.length} dependency violations`);
            
            // Return violation details
            res.status(400).json({
                success: false,
                hasViolations: true,
                violationCount: scanResults.violatingComponents.length,
                violations: scanResults.violatingComponents,
                summary: {
                    scannedFiles: scanResults.scannedFiles,
                    foundComponents: scanResults.foundComponents.length,
                    violatingComponents: scanResults.violatingComponents.length
                },
                report: report,
                message: `Found ${scanResults.violatingComponents.length} components with dependency management violations`
            });
        } else {
            console.log('✅ Server: All components comply with dependency management');
            
            res.json({
                success: true,
                hasViolations: false,
                violationCount: 0,
                summary: {
                    scannedFiles: scanResults.scannedFiles,
                    foundComponents: scanResults.foundComponents.length,
                    violatingComponents: 0
                },
                message: 'All components comply with dependency management requirements'
            });
        }
        
    } catch (error) {
        sendRouteError(res, error, 'GET check-dependencies', {
            body: { success: false, error: 'Dependency check failed', message: error.message },
        });
    }
});

// GET /violations: Dynamic HTML page showing all dependency violations
app.get('/violations', async (req, res) => {
    try {
        console.log('🌐 Server: Generating violations page...');
        
        // Run dependency scan
        
        // Generate HTML page
        const html = generateViolationsHTML(scanResults, report);
        
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
        
    } catch (error) {
        sendRouteError(res, error, 'GET violations', {
            html: `
            <html>
                <head><title>Error</title></head>
                <body>
                    <h1>Error Generating Violations Page</h1>
                    <p>${error.message}</p>
                </body>
            </html>
        `,
        });
    }
});

// Function to generate violations HTML page
function generateViolationsHTML(scanResults, report) {
    const hasViolations = scanResults.violatingComponents.length > 0;
    const violationCount = scanResults.violatingComponents.length;
    
    let html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dependency Violations Report</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            background: #f5f5f5;
        }
        .header {
            background: ${hasViolations ? '#dc3545' : '#28a745'};
            color: white;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 20px;
        }
        .violation-card {
            background: white;
            border-left: 4px solid #dc3545;
            margin-bottom: 20px;
            border-radius: 4px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .violation-header {
            padding: 15px 20px;
            background: #f8f9fa;
            border-bottom: 1px solid #dee2e6;
        }
        .violation-body {
            padding: 20px;
        }
        .component-name {
            font-size: 1.3em;
            font-weight: bold;
            color: #dc3545;
        }
        .file-path {
            color: #6c757d;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
            font-size: 0.9em;
            margin-top: 5px;
        }
        .issues-list {
            margin: 15px 0;
        }
        .issue-item {
            background: #fff5f5;
            border: 1px solid #fed7d7;
            padding: 10px;
            margin: 5px 0;
            border-radius: 4px;
            color: #742a2a;
        }
        .fix-section {
            background: #f0f8ff;
            border: 1px solid #b8daff;
            padding: 15px;
            border-radius: 4px;
            margin-top: 15px;
        }
        .fix-title {
            font-weight: bold;
            color: #0056b3;
            margin-bottom: 10px;
        }
        .fix-steps {
            list-style: none;
            padding: 0;
        }
        .fix-steps li {
            padding: 5px 0;
            border-bottom: 1px solid #e3f2fd;
        }
        .fix-steps li:last-child {
            border-bottom: none;
        }
        .code {
            background: #f8f9fa;
            border: 1px solid #e9ecef;
            border-radius: 4px;
            padding: 2px 6px;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
            font-size: 0.9em;
        }
        .stats {
            background: white;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 20px;
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
        }
        .stat-item {
            text-align: center;
        }
        .stat-number {
            font-size: 2em;
            font-weight: bold;
            color: ${hasViolations ? '#dc3545' : '#28a745'};
        }
        .stat-label {
            color: #6c757d;
            font-size: 0.9em;
        }
        .no-violations {
            background: white;
            padding: 40px;
            text-align: center;
            border-radius: 8px;
            border: 2px solid #28a745;
        }
        .refresh-btn {
            background: #007bff;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 1em;
        }
        .refresh-btn:hover {
            background: #0056b3;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🔒 Dependency Violations Report</h1>
        <p>Generated: ${new Date().toLocaleString()}</p>
        ${hasViolations 
            ? `<p>⚠️ Found ${violationCount} component${violationCount !== 1 ? 's' : ''} with dependency management violations</p>`
            : `<p>✅ All components comply with dependency management requirements</p>`
        }
    </div>

    <div class="stats">
        <div class="stat-item">
            <div class="stat-number">${scanResults.scannedFiles}</div>
            <div class="stat-label">Files Scanned</div>
        </div>
        <div class="stat-item">
            <div class="stat-number">${scanResults.foundComponents.length}</div>
            <div class="stat-label">Components Found</div>
        </div>
        <div class="stat-item">
            <div class="stat-number">${violationCount}</div>
            <div class="stat-label">Violations</div>
        </div>
        <div class="stat-item">
            <button class="refresh-btn" onclick="location.reload()">🔄 Refresh</button>
        </div>
    </div>
`;

    if (hasViolations) {
        html += `<h2>📋 Violations Details</h2>`;
        
        scanResults.violatingComponents.forEach((violation, index) => {
            html += `
            <div class="violation-card">
                <div class="violation-header">
                    <div class="component-name">${index + 1}. ${violation.name}</div>
                    <div class="file-path">${violation.file}</div>
                </div>
                <div class="violation-body">
                    <div class="issues-list">
                        <h4>🚨 Issues Found:</h4>
                        ${violation.violations.map(issue => {
                            const issueText = typeof issue === 'string' ? issue : (issue.message || issue.toString());
                            return `<div class="issue-item">• ${issueText}</div>`;
                        }).join('')}
                    </div>
                    
                    <div class="fix-section">
                        <div class="fix-title">🔧 How to Fix:</div>
                        ${generateFixInstructions(violation)}
                    </div>
                </div>
            </div>
            `;
        });
    } else {
        html += `
        <div class="no-violations">
            <h2>🎉 No Violations Found!</h2>
            <p>All components are properly following dependency management patterns.</p>
            <p>Your application is compliant and ready to run.</p>
        </div>
        `;
    }

    html += `
    <footer style="text-align: center; margin-top: 40px; color: #6c757d;">
        <p>Generated by Dependency Enforcement System</p>
        <p><a href="http://localhost:${viteDevPort}/">← Back to Application</a></p>
    </footer>
</body>
</html>
    `;

    return html;
}

// Generate specific fix instructions for each violation type
function generateFixInstructions(violation) {
    const isVueComponent = violation.file && violation.file.endsWith('.vue');
    const componentName = violation.name;
    
    if (componentName === 'BadgePositioner') {
        return `
            <ol class="fix-steps">
                <li><strong>Open file:</strong> <code class="code">${violation.file}</code></li>
                <li><strong>Add import:</strong> <code class="code">import { BaseComponent } from '../core/abstracts/BaseComponent.mjs';</code></li>
                <li><strong>Change class declaration:</strong><br>
                    From: <code class="code">export class BadgePositioner {</code><br>
                    To: <code class="code">export class BadgePositioner extends BaseComponent {</code>
                </li>
                <li><strong>Update constructor:</strong> Add <code class="code">super('BadgePositioner')</code> as first line</li>
                <li><strong>Add initialize method:</strong> <code class="code">async initialize({ selectionManager }) { /* setup code */ }</code></li>
                <li><strong>Add destroy method:</strong> <code class="code">destroy() { /* cleanup code */ }</code></li>
            </ol>
        `;
    } else if (isVueComponent) {
        return `
            <ol class="fix-steps">
                <li><strong>Open file:</strong> <code class="code">${violation.file}</code></li>
                <li><strong>Add import:</strong> <code class="code">import { BaseVueComponentMixin } from '@/modules/core/abstracts/BaseComponent.mjs';</code></li>
                <li><strong>Add mixin:</strong> <code class="code">mixins: [BaseVueComponentMixin]</code></li>
                <li><strong>Add initialize method:</strong> <code class="code">initialize(dependencies) { /* and save references */ this.component1 = dependencies.component1; }</code></li>
                <li><strong>Add cleanup method:</strong> <code class="code">cleanupDependencies() { /* cleanup */ }</code></li>
            </ol>
        `;
    } else {
        // Handle different violation types with specific instructions
        let instructions = `
            <ol class="fix-steps">
                <li><strong>Open file:</strong> <code class="code">${violation.file}</code></li>
        `;

        // Helper function to get violation text (handles both string and object violations)
        const getViolationText = (v) => typeof v === 'string' ? v : (v.message || v.toString());
        
        // Check for specific violation types and add targeted instructions
        if (violation.violations && violation.violations.some(v => getViolationText(v).includes('manually set this.isInitialized'))) {
            instructions += `
                <li><strong>Remove manual isInitialized assignments:</strong> Delete lines with <code class="code">this.isInitialized = true</code> or <code class="code">this.isInitialized = false</code></li>
                <li><strong>BaseComponent handles this automatically:</strong> After your <code class="code">initialize()</code> method completes, BaseComponent sets <code class="code">this.isInitialized = true</code></li>
                <li><strong>Only read, don't write:</strong> Use <code class="code">if (this.isInitialized)</code> to check status, but never assign values</li>
            `;
        } else if (violation.violations && violation.violations.some(v => getViolationText(v).includes('custom isInitialized getter'))) {
            instructions += `
                <li><strong>Remove custom getter:</strong> Delete <code class="code">get isInitialized() { ... }</code> method</li>
                <li><strong>BaseComponent provides this:</strong> Use <code class="code">this.isInitialized</code> directly as a property</li>
            `;
        } else if (violation.violations && violation.violations.some(v => getViolationText(v).includes('private _isInitialized'))) {
            instructions += `
                <li><strong>Remove private property:</strong> Delete <code class="code">this._isInitialized</code> assignments and references</li>
                <li><strong>Use BaseComponent's property:</strong> Replace with <code class="code">this.isInitialized</code></li>
            `;
        } else if (violation.violations && violation.violations.some(v => getViolationText(v).includes('getIsInitialized'))) {
            instructions += `
                <li><strong>Remove deprecated method:</strong> Delete <code class="code">getIsInitialized()</code> method</li>
                <li><strong>Use property access:</strong> Replace <code class="code">component.getIsInitialized()</code> with <code class="code">component.isInitialized</code></li>
            `;
        } else {
            // General IM component setup
            instructions += `
                <li><strong>Add import:</strong> <code class="code">import { BaseComponent } from '../core/abstracts/BaseComponent.mjs';</code></li>
                <li><strong>Extend BaseComponent:</strong> <code class="code">class ${componentName} extends BaseComponent</code></li>
                <li><strong>Add constructor:</strong> <code class="code">super('${componentName}')</code></li>
                <li><strong>Override initialize():</strong> <code class="code">async initialize({ manager1, manager2 }) { /* setup logic */ }</code></li>
                <li><strong>Override destroy():</strong> Cleanup logic</li>
            `;
        }

        instructions += `
            </ol>
        `;
        return instructions;
    }
}

// --- Start the server with port finding ---
// --- Static File Serving ---
// Serve static content (including color palettes)
app.use('/static_content', express.static(path.resolve(PROJECT_ROOT, 'static_content')));

// ---------------------------------------------------------------------------
// GET /api/skills/:slug/info  — LLM-generated skill definition (cached)
// Requires ANTHROPIC_API_KEY in .env. Returns { slug, summary, cached }.
// ---------------------------------------------------------------------------
const skillInfoCache = new Map(); // in-memory; cleared on server restart

app.get('/api/skills/:slug/info', async (req, res) => {
    const { slug } = req.params;
    if (!slug || !/^[a-z0-9][a-z0-9\-._]*$/.test(slug)) {
        return res.status(400).json({ error: 'Invalid skill slug.' });
    }
    if (skillInfoCache.has(slug)) {
        return res.json({ slug, summary: skillInfoCache.get(slug), cached: true });
    }
    if (!getAnthropicApiKey()) {
        return res.status(503).json({ error: 'ANTHROPIC_API_KEY not configured on server.' });
    }
    try {
        const summary = await callAnthropicMessages({
            model: getSkillInfoModel(),
            maxTokens: 300,
            system: 'You are a concise technical reference. Answer in 2–4 sentences. No markdown, no bullet points, plain prose only.',
            user: `What is "${slug.replace(/-/g, ' ')}" in the context of software engineering and data engineering? Give a brief, plain-English definition suitable for a resume portfolio.`,
        });
        skillInfoCache.set(slug, summary);
        res.json({ slug, summary, cached: false });
    } catch (e) {
        sendRouteError(res, e, 'skill-info', { status: 502, remedy: 'Responding 502; nothing cached for this slug' });
    }
});

const MAX_PORT_RETRIES = 10; // Limit how many ports to try
const START_PORT = parseInt(process.env.EXPRESS_PORT, 10) || parseInt(process.env.PORT, 10) || 3001;

// Actual bound port (set in listen callback); used by route handlers for URLs
let actualBackendPort = START_PORT;
const viteDevPort = parseInt(process.env.VITE_DEV_PORT, 10) || 5174;

function startServer(port) {
    if (port >= START_PORT + MAX_PORT_RETRIES) {
        reportError(
            new Error(`Failed to bind server after trying ports ${START_PORT} to ${port - 1}`),
            '[server] No free port',
            'Exiting with code 1'
        );
        process.exit(1);
    }

    const server = app.listen(port, async () => {
        actualBackendPort = port;
        // Success!
        console.log(`Server listening on http://localhost:${port}`);
        // Clean up any stale lock files from previous crashed processes
        await cleanStaleLock(STATE_FILE_PATH, 30000);

        // Initialize sync logs directory and index
        await initializeSyncLogsDirectory();
        console.log(`📝 Sync logs available at /sync-logs-dashboard`);
        console.log(`📝 Sync logs API at /api/sync-logs`);

        // Initialize event data directories
        await initializeEventDataDirectories();
        console.log(`🔬 Automated analysis available at /analysis-dashboard`);
        console.log(`📊 Event data API at /api/event-data`);
    });

    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.warn(`Port ${port} is already in use. Trying port ${port + 1}...`);
            server.close(() => {
                startServer(port + 1);
            });
        } else {
            reportError(err, '[server] Server failed to start', 'Exiting with code 1');
            process.exit(1);
        }
    });
}

// Local dev only. start-dev.mjs sets RESUME_FLYER_LOCAL_DEV=1. Without that flag
// this route refuses and does not run the checkout stop script.
app.post('/api/local-dev/quit', createLocalDevQuitHandler());

export { app };

// Start server only when this file is run as the main module (not when imported by tests)
const __filename = fileURLToPath(import.meta.url);
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isMain) {
    (async () => {
        try {
            // Fail-fast validation: resume-parser runtime must be present before we do any warmup.
            const resumeParserProjectPath = process.env.RESUME_PARSER_PROJECT_PATH
                ? path.resolve(PROJECT_ROOT, process.env.RESUME_PARSER_PROJECT_PATH)
                : path.resolve(PROJECT_ROOT, RESUME_PARSER_PROJECT_PATH_RELATIVE_UNSET_ENV);
            const pythonBin = path.join(resumeParserProjectPath, 'venv', 'bin', 'python3');

            // Validate parsed resumes directory early so later endpoints don't fail unexpectedly.
            await fs.mkdir(PARSED_RESUMES_DIR, { recursive: true });

            await fs.access(resumeParserProjectPath);
            await fs.access(pythonBin);

            // Validate the module can be imported from that interpreter.
            await new Promise((resolve, reject) => {
                const child = spawn(pythonBin, ['-c', 'import resume_parser'], {
                    stdio: ['ignore', 'pipe', 'pipe'],
                    env: process.env,
                    cwd: resumeParserProjectPath,
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

            const s3Url = resolvePaletteCatalogS3UrlFromRecord(process.env);
            if (!s3Url) {
                throw new Error(
                    'S3 palette catalog URL not configured (S3_COLOR_PALETTES_JSON_URL or S3_IMAGES_BUCKET + AWS_REGION/S3_REGION + S3_PALETTES_JSONL_KEY)'
                );
            }

            // Internet timing issues: retry transient fetch failures.
            const maxAttempts = 3;
            const retryBaseMs = 800;
            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                try {
                    await refreshPaletteCatalogCache();
                    break;
                } catch (e) {
                    const message = e instanceof Error ? e.message : String(e);
                    const isRetriable =
                        /ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN/i.test(message) ||
                        /S3 catalog HTTP 5\d\d/i.test(message);

                    if (!isRetriable || attempt === maxAttempts) throw e;

                    reportError(
                        e,
                        '[palette-catalog] S3 fetch transient failure',
                        `Retrying palette catalog fetch (attempt ${attempt + 1}/${maxAttempts}) in ${retryBaseMs * attempt}ms`
                    );

                    await new Promise((r) => setTimeout(r, retryBaseMs * attempt));
                }
            }
            const bundle = getCachedPaletteCatalogBundle();
            console.log(
                `[palette-catalog] Startup: catalog ready (${getLastPaletteCatalogSourceUrl()}) — ${bundle.palettes.length} palette(s)`
            );
        } catch (e) {
            reportError(
                e,
                '[ResumeFlyer] Startup fast-fail',
                'Verify resume-parser project/venv and palette catalog env (S3_COLOR_PALETTES_JSON_URL or S3_* values).'
            );
            process.exit(1);
        }
        startServer(START_PORT);
    })();
}