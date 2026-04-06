import express from 'express';
import fs from 'fs/promises'; // Use promises for async/await
import fsSync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import { spawn } from 'child_process';
import sanitizeFilename from 'sanitize-filename';
import fetch from 'node-fetch';
import { parseMjsExport } from './modules/data/parseMjsExport.mjs';
import { normalizeParserJobs, normalizeParserSkills, normalizeParserCategories } from './modules/data/parsedResumeAdapter.mjs';
import { mergeJobsWithEducation, toJobsArray } from './modules/data/mergeEducationIntoJobs.mjs';
import { enrichJobsWithSkills } from './modules/data/enrichedJobs.mjs';
import { atomicWriteWithLock, cleanStaleLock } from './modules/utils/atomicFileUtils.mjs';
import { reportError } from './modules/utils/errorReporting.mjs';
import {
    refreshPaletteCatalogCache,
    getCachedPaletteCatalogBundle,
    getLastPaletteCatalogSourceUrl,
    hasPaletteCatalogCache,
    primePaletteCatalogCacheFromBundle,
} from './modules/utils/paletteCatalogServerCache.mjs';
import { resolvePaletteCatalogS3UrlFromRecord } from './modules/utils/paletteCatalogS3Url.mjs';
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
/** Persisted app state (layout, theme, currentResumeId, system-constants, etc.). */
const STATE_FILE_PATH = path.resolve(PROJECT_ROOT, 'app_state.json');
const STATE_DEFAULT_PATH = path.resolve(PROJECT_ROOT, 'public', 'app_state.default.json');
/** Overridable via process.env.PARSED_RESUMES_DIR for integration tests */
const PARSED_RESUMES_DIR = process.env.PARSED_RESUMES_DIR
    ? (path.isAbsolute(process.env.PARSED_RESUMES_DIR)
        ? process.env.PARSED_RESUMES_DIR
        : path.resolve(PROJECT_ROOT, process.env.PARSED_RESUMES_DIR))
    : path.resolve(PROJECT_ROOT, 'parsed_resumes');
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
 * Convert a display name to a slug suitable for use as a folder name.
 * Lowercases, collapses non-alphanumeric runs to hyphens, trims leading/trailing hyphens.
 */
function slugifyDisplayName(name) {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        || 'resume';
}

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

/**
 * Run enrichJobsWithSkills on the current jobs+skills+education for a resume
 * folder and write the result to enriched-jobs.json.  Called automatically
 * after any write that touches jobs.json, skills.json, or education.json so
 * the file stays current without a separate build step.  Errors are logged but
 * never thrown — a stale or missing enriched-jobs.json is not fatal; the
 * client falls back to live enrichment.
 *
 * @param {string} dir          - absolute path to the resume folder
 * @param {Array}  jobs         - already-normalized work-jobs array
 * @param {object} skills       - already-normalized skills map
 */
async function bakeEnrichedJobs(dir, jobs, skills) {
    try {
        // Always read education.json fresh so education-derived jobs are included.
        let education = {};
        try {
            const eduContent = await fs.readFile(path.join(dir, 'education.json'), 'utf-8');
            education = JSON.parse(eduContent);
        } catch (e) {
            if (e.code !== 'ENOENT') throw e;
        }
        const merged = mergeJobsWithEducation(jobs, education);
        const enriched = enrichJobsWithSkills(merged, skills);
        const enrichedPath = path.join(dir, 'enriched-jobs.json');
        await atomicWriteWithLock(enrichedPath, JSON.stringify(enriched, null, 2));
        console.log(`[bakeEnrichedJobs] ✅ Wrote enriched-jobs.json (${enriched.length} jobs incl. ${enriched.length - jobs.length} education)`);
    } catch (e) {
        reportError(e, '[bakeEnrichedJobs] Failed to write enriched-jobs.json — static host will fall back to live enrichment');
    }
}

/**
 * Replace every [OldName] bracket reference in all job Descriptions with [NewName].
 * Called after a skill rename or merge so descriptions stay in sync with skills.json.
 * Mutates jobs in place; returns the number of replacements made.
 *
 * @param {Array<object>} jobs
 * @param {string} oldName  - the old skill.name (text inside brackets to replace)
 * @param {string} newName  - the new skill.name (replacement text inside brackets)
 * @returns {number}
 */
function replaceSkillNameInDescriptions(jobs, oldName, newName) {
    if (!oldName || !newName || oldName === newName) return 0;
    const jobsArr = Array.isArray(jobs) ? jobs : Object.values(jobs);
    const escaped = oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\[${escaped}\\]`, 'g');
    let count = 0;
    for (const job of jobsArr) {
        if (!job.Description) continue;
        const before = job.Description;
        job.Description = job.Description.replace(regex, `[${newName}]`);
        if (job.Description !== before) count++;
    }
    return count;
}

/** Shift skill.jobIDs at/after insert so indices stay aligned with jobs.json (0-based). */
function reindexSkillJobIdsAfterJobInsert(skills, insertAt) {
    const at = Number(insertAt);
    if (!Number.isFinite(at) || at < 0) return;
    for (const s of Object.values(skills)) {
        if (!s || typeof s !== 'object' || !Array.isArray(s.jobIDs)) continue;
        const next = s.jobIDs.map((j) => {
            const n = Number(j);
            return Number.isFinite(n) && n >= at ? n + 1 : n;
        });
        s.jobIDs = [...new Set(next)].sort((a, b) => a - b);
    }
}

/** Remove deleted job index from skill.jobIDs and decrement higher indices. */
function reindexSkillJobIdsAfterJobDelete(skills, deletedIndex) {
    const d = Number(deletedIndex);
    if (!Number.isFinite(d) || d < 0) return;
    for (const s of Object.values(skills)) {
        if (!s || typeof s !== 'object' || !Array.isArray(s.jobIDs)) continue;
        const next = s.jobIDs
            .map((j) => Number(j))
            .filter((n) => Number.isFinite(n) && n !== d)
            .map((n) => (n > d ? n - 1 : n));
        s.jobIDs = [...new Set(next)].sort((a, b) => a - b);
    }
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
                console.error('[server] Could not initialize app_state.json from default:', e.message);
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
            console.error('Error reading state file:', error);
            res.status(500).json({ error: 'Failed to read state file.' });
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
        console.error('Error writing state file:', error);
        res.status(500).json({ error: 'Failed to write state file.' });
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
            console.error('Error reading default resume data:', error);
            res.status(500).json({ error: 'Failed to read default resume data.' });
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
            console.error('Error reading resume data:', error);
            res.status(500).json({ error: 'Failed to read resume data.' });
        }
    }
});

// PATCH /api/resumes/:id/jobs/:jobIndex/skills: Update skillIDs for one job, sync skills.json jobIDs. Optional newSkills: names to create if missing.
app.patch('/api/resumes/:id/jobs/:jobIndex/skills', async (req, res) => {
    const { id, jobIndex } = req.params;
    const { skillIDs, newSkills } = req.body;
    if (!id || jobIndex == null || !Array.isArray(skillIDs)) {
        return res.status(400).json({ error: 'Missing id, jobIndex, or skillIDs array.' });
    }
    const dir = path.join(PARSED_RESUMES_DIR, id);
    const jobsPath = path.join(dir, 'jobs.json');
    const skillsPath = path.join(dir, 'skills.json');
    try {
        const [jobsContent, skillsContent] = await Promise.all([
            fs.readFile(jobsPath, 'utf-8'),
            fs.readFile(skillsPath, 'utf-8'),
        ]);
        const jobs = parseResumeFile(jobsContent, jobsPath, 'jobs');
        const skills = parseResumeFile(skillsContent, skillsPath, 'skills');

        const idx = String(jobIndex);
        if (!jobs[idx]) return res.status(404).json({ error: `Job index ${jobIndex} not found.` });

        // Create any new skills so they exist before sync
        const toCreate = Array.isArray(newSkills) ? newSkills : [];
        for (const entry of toCreate) {
            const name = typeof entry === 'string' ? entry.trim() : (entry?.name && String(entry.name).trim());
            if (!name) continue;
            if (skills[name] == null) {
                skills[name] = { name, jobIDs: [] };
            }
        }

        const oldSkillIDs = jobs[idx].skillIDs || [];
        const newSkillIDs = skillIDs;
        jobs[idx].skillIDs = newSkillIDs;

        // Sync skills.jobIDs: remove jobIndex from removed skills, add to new ones
        const jobNum = parseInt(jobIndex, 10);
        const removed = oldSkillIDs.filter(s => !newSkillIDs.includes(s));
        const added   = newSkillIDs.filter(s => !oldSkillIDs.includes(s));
        for (const sid of removed) {
            if (skills[sid]) skills[sid].jobIDs = (skills[sid].jobIDs || []).filter(j => j !== jobNum);
        }
        for (const sid of added) {
            if (skills[sid] && !skills[sid].jobIDs.includes(jobNum)) skills[sid].jobIDs.push(jobNum);
        }

        await Promise.all([
            atomicWriteWithLock(jobsPath, JSON.stringify(jobs, null, 2)),
            atomicWriteWithLock(skillsPath, JSON.stringify(skills, null, 2)),
        ]);
        bakeEnrichedJobs(dir, normalizeParserJobs(jobs), normalizeParserSkills(skills));
        res.json({ ok: true, skillIDs: newSkillIDs });
    } catch (err) {
        console.error('[PATCH jobs skills]', err);
        res.status(500).json({ error: err.message });
    }
});

// PATCH /api/resumes/:id/education/:educationKey/skills: Update skillIDs on one education entry; sync skills.json jobIDs using merged job index.
app.patch('/api/resumes/:id/education/:educationKey/skills', async (req, res) => {
    const { id, educationKey } = req.params;
    const { skillIDs, newSkills } = req.body;
    if (!id || educationKey == null || !Array.isArray(skillIDs)) {
        return res.status(400).json({ error: 'Missing id, educationKey, or skillIDs array.' });
    }
    const dir = path.join(PARSED_RESUMES_DIR, id);
    const jobsPath = path.join(dir, 'jobs.json');
    const skillsPath = path.join(dir, 'skills.json');
    const educationPath = path.join(dir, 'education.json');
    try {
        const [jobsContent, skillsContent, educationContent] = await Promise.all([
            fs.readFile(jobsPath, 'utf-8'),
            fs.readFile(skillsPath, 'utf-8'),
            fs.readFile(educationPath, 'utf-8'),
        ]);
        const rawJobs = parseResumeFile(jobsContent, jobsPath, 'jobs');
        const workJobs = normalizeParserJobs(rawJobs);
        const skills = parseResumeFile(skillsContent, skillsPath, 'skills');
        const educationData = JSON.parse(educationContent);
        if (!educationData || typeof educationData !== 'object' || educationData[educationKey] == null) {
            return res.status(404).json({ error: `Education key "${educationKey}" not found.` });
        }
        const merged = mergeJobsWithEducation(toJobsArray(workJobs), educationData);
        const mergedIdx = merged.findIndex((j) => {
            const ek = j?.educationKey ?? j?.__educationKey;
            return ek != null && String(ek) === String(educationKey);
        });
        if (mergedIdx < 0) {
            return res.status(404).json({ error: `Education key "${educationKey}" not found in merged jobs.` });
        }

        const toCreate = Array.isArray(newSkills) ? newSkills : [];
        for (const entry of toCreate) {
            const name = typeof entry === 'string' ? entry.trim() : (entry?.name && String(entry.name).trim());
            if (!name) continue;
            if (skills[name] == null) {
                skills[name] = { name, jobIDs: [] };
            }
        }

        const eduEntry = educationData[educationKey];
        const oldSkillIDs = Array.isArray(eduEntry.skillIDs) ? eduEntry.skillIDs.map(String) : [];
        const newSkillIDs = skillIDs.map(String);
        eduEntry.skillIDs = newSkillIDs;

        const jobNum = mergedIdx;
        const removed = oldSkillIDs.filter((s) => !newSkillIDs.includes(s));
        const added = newSkillIDs.filter((s) => !oldSkillIDs.includes(s));
        for (const sid of removed) {
            if (skills[sid]) skills[sid].jobIDs = (skills[sid].jobIDs || []).filter((j) => j !== jobNum);
        }
        for (const sid of added) {
            if (skills[sid] && !skills[sid].jobIDs.includes(jobNum)) skills[sid].jobIDs.push(jobNum);
        }
        for (const s of Object.values(skills)) {
            if (s && typeof s === 'object' && Array.isArray(s.jobIDs)) {
                s.jobIDs = [...new Set(s.jobIDs)].sort((a, b) => a - b);
            }
        }

        await Promise.all([
            atomicWriteWithLock(educationPath, JSON.stringify(educationData, null, 2)),
            atomicWriteWithLock(skillsPath, JSON.stringify(skills, null, 2)),
        ]);
        // Re-bake using current jobs.json (education changes affect enrichment too)
        try {
            const jobsContent = await fs.readFile(path.join(dir, 'jobs.json'), 'utf-8');
            const rawJobs = parseResumeFile(jobsContent, path.join(dir, 'jobs.json'), 'jobs');
            bakeEnrichedJobs(dir, normalizeParserJobs(rawJobs), normalizeParserSkills(skills));
        } catch { /* bake failure is non-fatal */ }
        res.json({ ok: true, skillIDs: newSkillIDs });
    } catch (err) {
        if (err.code === 'ENOENT') {
            return res.status(404).json({ error: 'education.json or related file not found.' });
        }
        console.error('[PATCH education skills]', err);
        res.status(500).json({ error: err.message });
    }
});

// Resolve skill key: use direct key if present, else find key where skill.name matches (handles id-keyed skills from parser).
function resolveSkillKey(skills, keyOrName) {
    if (skills[keyOrName] != null) return keyOrName;
    const want = (keyOrName && String(keyOrName).trim()) || '';
    if (!want) return null;
    for (const [k, s] of Object.entries(skills)) {
        if (s && typeof s === 'object' && s.name != null && String(s.name).trim() === want) return k;
    }
    return null;
}

// PATCH /api/resumes/:id/skills/rename: Rename a skill (update key and all job references). If newName already exists, merge into it.
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
    const dir = path.join(PARSED_RESUMES_DIR, id);
    const jobsPath = path.join(dir, 'jobs.json');
    const skillsPath = path.join(dir, 'skills.json');
    try {
        const [jobsContent, skillsContent] = await Promise.all([
            fs.readFile(jobsPath, 'utf-8'),
            fs.readFile(skillsPath, 'utf-8'),
        ]);
        const jobs = parseResumeFile(jobsContent, jobsPath, 'jobs');
        const skills = parseResumeFile(skillsContent, skillsPath, 'skills');
        const resolvedOldKey = resolveSkillKey(skills, oldKey);
        if (resolvedOldKey == null) {
            return res.status(404).json({ error: `Skill "${oldKey}" not found.` });
        }
        const oldSkillName = skills[resolvedOldKey].name || resolvedOldKey;
        const jobIDsFromOld = skills[resolvedOldKey].jobIDs || [];
        delete skills[resolvedOldKey];
        if (skills[newNameTrimmed] != null) {
            const existingJobIDs = new Set(skills[newNameTrimmed].jobIDs || []);
            jobIDsFromOld.forEach(j => existingJobIDs.add(j));
            skills[newNameTrimmed].jobIDs = [...existingJobIDs];
        } else {
            skills[newNameTrimmed] = { name: newNameTrimmed, jobIDs: [...jobIDsFromOld] };
        }
        const jobEntries = Array.isArray(jobs) ? jobs.map((j, i) => [i, j]) : Object.entries(jobs);
        for (const [, job] of jobEntries) {
            const ids = job.skillIDs;
            if (!Array.isArray(ids)) continue;
            const out = [];
            const seen = new Set();
            for (const sid of ids) {
                const use = (sid === resolvedOldKey || sid === oldKey) ? newNameTrimmed : sid;
                if (!seen.has(use)) { out.push(use); seen.add(use); }
            }
            job.skillIDs = out;
        }
        // Replace [OldName] → [NewName] in all job descriptions
        const descFixes = replaceSkillNameInDescriptions(jobs, oldSkillName, newNameTrimmed);
        console.log(`[PATCH skills/rename] replaced [${oldSkillName}] → [${newNameTrimmed}] in ${descFixes} descriptions`);
        await Promise.all([
            atomicWriteWithLock(jobsPath, JSON.stringify(jobs, null, 2)),
            atomicWriteWithLock(skillsPath, JSON.stringify(skills, null, 2)),
        ]);
        bakeEnrichedJobs(dir, normalizeParserJobs(jobs), normalizeParserSkills(skills));
        res.json({ ok: true, key: newNameTrimmed, descriptionFixes: descFixes });
    } catch (err) {
        console.error('[PATCH skills/rename]', err);
        res.status(500).json({ error: err.message });
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
    const dir = path.join(PARSED_RESUMES_DIR, id);
    const jobsPath = path.join(dir, 'jobs.json');
    const skillsPath = path.join(dir, 'skills.json');
    try {
        const [jobsContent, skillsContent] = await Promise.all([
            fs.readFile(jobsPath, 'utf-8'),
            fs.readFile(skillsPath, 'utf-8'),
        ]);
        const jobs = parseResumeFile(jobsContent, jobsPath, 'jobs');
        const skills = parseResumeFile(skillsContent, skillsPath, 'skills');
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
        const fromJobIDs = new Set(skills[resolvedFromKey].jobIDs || []);
        const toJobIDsSet = new Set(skills[resolvedToKey].jobIDs || []);
        fromJobIDs.forEach(j => toJobIDsSet.add(j));
        skills[resolvedToKey].jobIDs = [...toJobIDsSet];
        delete skills[resolvedFromKey];
        const jobEntries = Array.isArray(jobs) ? jobs.map((j, i) => [i, j]) : Object.entries(jobs);
        for (const [, job] of jobEntries) {
            const ids = job.skillIDs;
            if (!Array.isArray(ids)) continue;
            const out = [];
            const seen = new Set();
            for (const sid of ids) {
                if (sid === resolvedFromKey || sid === fromKey) {
                    if (!seen.has(resolvedToKey)) { out.push(resolvedToKey); seen.add(resolvedToKey); }
                } else {
                    if (!seen.has(sid)) { out.push(sid); seen.add(sid); }
                }
            }
            job.skillIDs = out;
        }
        // Replace [FromName] → [ToName] in all job descriptions
        const descFixes = replaceSkillNameInDescriptions(jobs, fromSkillName, toSkillName);
        console.log(`[PATCH skills/merge] replaced [${fromSkillName}] → [${toSkillName}] in ${descFixes} descriptions`);
        await Promise.all([
            atomicWriteWithLock(jobsPath, JSON.stringify(jobs, null, 2)),
            atomicWriteWithLock(skillsPath, JSON.stringify(skills, null, 2)),
        ]);
        bakeEnrichedJobs(dir, normalizeParserJobs(jobs), normalizeParserSkills(skills));
        res.json({ ok: true, mergedInto: toKey, descriptionFixes: descFixes });
    } catch (err) {
        console.error('[PATCH skills/merge]', err);
        res.status(500).json({ error: err.message });
    }
});

// PATCH /api/resumes/:id/jobs/:jobIndex: Update one job's fields (label, role, start, end, Description)
app.patch('/api/resumes/:id/jobs/:jobIndex', async (req, res) => {
    const { id, jobIndex } = req.params;
    if (!id || id === 'default' || jobIndex == null) {
        return res.status(400).json({ error: 'Invalid resume id or job index.' });
    }
    const allowed = ['label', 'role', 'employer', 'start', 'end', 'Description'];
    const updates = {};
    for (const key of allowed) {
        if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'No allowed job fields provided.' });
    }
    const dir = path.join(PARSED_RESUMES_DIR, id);
    const jobsPath = path.join(dir, 'jobs.json');
    try {
        await fs.access(jobsPath);
    } catch (e) {
        if (e.code === 'ENOENT') return res.status(404).json({ error: 'Resume or jobs.json not found.' });
        throw e;
    }
    const content = await fs.readFile(jobsPath, 'utf-8');
    const jobs = parseResumeFile(content, jobsPath, 'jobs');
    const idx = Array.isArray(jobs) ? parseInt(jobIndex, 10) : String(jobIndex);
    if (jobs[idx] == null) return res.status(404).json({ error: `Job index ${jobIndex} not found.` });
    Object.assign(jobs[idx], updates);
    await atomicWriteWithLock(jobsPath, JSON.stringify(jobs, null, 2));
    // Bake if Description changed (affects job-skills / references)
    if ('Description' in updates) {
        try {
            const skillsContent = await fs.readFile(path.join(dir, 'skills.json'), 'utf-8').catch(() => '{}');
            const rawSkills = parseResumeFile(skillsContent, path.join(dir, 'skills.json'), 'skills') || {};
            bakeEnrichedJobs(dir, normalizeParserJobs(jobs), normalizeParserSkills(rawSkills));
        } catch { /* bake failure is non-fatal */ }
    }
    res.json({ ok: true, job: jobs[idx] });
});

// POST /api/resumes/:id/jobs: Insert empty work job after `afterIndex` (-1 = at index 0)
app.post('/api/resumes/:id/jobs', async (req, res) => {
    const { id } = req.params;
    if (!id || id === 'default') {
        return res.status(400).json({ error: 'Invalid resume id.' });
    }
    const rawAfter = req.body?.afterIndex;
    const dir = path.join(PARSED_RESUMES_DIR, id);
    const jobsPath = path.join(dir, 'jobs.json');
    const skillsPath = path.join(dir, 'skills.json');
    try {
        await fs.access(jobsPath);
    } catch (e) {
        if (e.code === 'ENOENT') return res.status(404).json({ error: 'Resume or jobs.json not found.' });
        throw e;
    }
    try {
        const jobsContent = await fs.readFile(jobsPath, 'utf-8');
        let skills = {};
        try {
            const skillsContent = await fs.readFile(skillsPath, 'utf-8');
            skills = parseResumeFile(skillsContent, skillsPath, 'skills') || {};
        } catch (e2) {
            if (e2.code !== 'ENOENT') throw e2;
        }
        const arr = normalizeParserJobs(parseResumeFile(jobsContent, jobsPath, 'jobs'));
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
        reindexSkillJobIdsAfterJobInsert(skills, insertAt);
        await Promise.all([
            atomicWriteWithLock(jobsPath, JSON.stringify(arr, null, 2)),
            atomicWriteWithLock(skillsPath, JSON.stringify(skills, null, 2)),
        ]);
        bakeEnrichedJobs(dir, arr, normalizeParserSkills(skills));
        res.json({ ok: true, insertIndex: insertAt });
    } catch (err) {
        console.error('[POST jobs]', err);
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/resumes/:id/jobs/:jobIndex: Remove one work job; reindex skills.json jobIDs
app.delete('/api/resumes/:id/jobs/:jobIndex', async (req, res) => {
    const { id, jobIndex } = req.params;
    if (!id || id === 'default' || jobIndex == null) {
        return res.status(400).json({ error: 'Invalid resume id or job index.' });
    }
    const idx = parseInt(jobIndex, 10);
    if (Number.isNaN(idx) || idx < 0) {
        return res.status(400).json({ error: 'Invalid job index.' });
    }
    const dir = path.join(PARSED_RESUMES_DIR, id);
    const jobsPath = path.join(dir, 'jobs.json');
    const skillsPath = path.join(dir, 'skills.json');
    try {
        await fs.access(jobsPath);
    } catch (e) {
        if (e.code === 'ENOENT') return res.status(404).json({ error: 'Resume or jobs.json not found.' });
        throw e;
    }
    try {
        const jobsContent = await fs.readFile(jobsPath, 'utf-8');
        let skills = {};
        try {
            const skillsContent = await fs.readFile(skillsPath, 'utf-8');
            skills = parseResumeFile(skillsContent, skillsPath, 'skills') || {};
        } catch (e2) {
            if (e2.code !== 'ENOENT') throw e2;
        }
        const arr = normalizeParserJobs(parseResumeFile(jobsContent, jobsPath, 'jobs'));
        if (arr[idx] == null) {
            return res.status(404).json({ error: `Job index ${jobIndex} not found.` });
        }
        arr.splice(idx, 1);
        reindexSkillJobIdsAfterJobDelete(skills, idx);
        await Promise.all([
            atomicWriteWithLock(jobsPath, JSON.stringify(arr, null, 2)),
            atomicWriteWithLock(skillsPath, JSON.stringify(skills, null, 2)),
        ]);
        bakeEnrichedJobs(dir, arr, normalizeParserSkills(skills));
        res.json({ ok: true });
    } catch (err) {
        console.error('[DELETE jobs]', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/resumes/:id/meta: Return meta.json for a parsed resume
app.get('/api/resumes/:id/meta', async (req, res) => {
    const { id } = req.params;
    if (!id || id === 'default') return res.status(400).json({ error: 'Invalid or default resume id.' });
    const metaPath = path.join(PARSED_RESUMES_DIR, id, 'meta.json');
    try {
        const content = await fs.readFile(metaPath, 'utf-8');
        res.json(JSON.parse(content));
    } catch (e) {
        if (e.code === 'ENOENT') return res.status(404).json({ error: 'meta.json not found for this resume.' });
        throw e;
    }
});

// PATCH /api/resumes/:id/meta: Update displayName, fileName in meta.json
app.patch('/api/resumes/:id/meta', async (req, res) => {
    const { id } = req.params;
    if (!id || id === 'default') return res.status(400).json({ error: 'Cannot update meta for default resume.' });
    const { displayName, fileName } = req.body;
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
        await atomicWriteWithLock(metaPath, JSON.stringify(meta, null, 2));

        // displayName affects static index ordering/default resume selection,
        // but regenerate on any rename-related meta update to keep static listing in sync.
        if (displayName !== undefined || fileName !== undefined) {
            await regenerateNonLocalResumesIndex(`resume renamed (meta update) [${id}]`);
        }
        res.json(meta);
    } catch (err) {
        console.error('[PATCH meta]', err);
        res.status(500).json({ error: err.message });
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
        await atomicWriteWithLock(filePath, JSON.stringify(payload, null, 2));
        res.json(payload);
    } catch (err) {
        console.error('[PATCH other-sections]', err);
        res.status(500).json({ error: err.message });
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

// PATCH /api/resumes/:id/education: Update or create education.json
app.patch('/api/resumes/:id/education', async (req, res) => {
    const { id } = req.params;
    if (!id || id === 'default') return res.status(400).json({ error: 'Cannot update education for default resume.' });
    const payload = req.body;
    if (!payload || typeof payload !== 'object') return res.status(400).json({ error: 'Invalid payload.' });
    const dir = path.join(PARSED_RESUMES_DIR, id);
    const filePath = path.join(dir, 'education.json');
    try {
        await fs.mkdir(dir, { recursive: true });
        await atomicWriteWithLock(filePath, JSON.stringify(payload, null, 2));
        res.json(payload);
    } catch (err) {
        console.error('[PATCH education]', err);
        res.status(500).json({ error: err.message });
    }
});

// PATCH /api/resumes/:id/categories: Update or create categories.json
app.patch('/api/resumes/:id/categories', async (req, res) => {
    const { id } = req.params;
    if (!id || id === 'default') return res.status(400).json({ error: 'Cannot update categories for default resume.' });
    const { categories } = req.body;
    if (!categories || typeof categories !== 'object') return res.status(400).json({ error: 'Invalid categories payload.' });
    const dir = path.join(PARSED_RESUMES_DIR, id);
    const filePath = path.join(dir, 'categories.json');
    try {
        await fs.mkdir(dir, { recursive: true });
        await atomicWriteWithLock(filePath, JSON.stringify(categories, null, 2));
        res.json({ categories });
    } catch (err) {
        console.error('[PATCH categories]', err);
        res.status(500).json({ error: err.message });
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
        console.error('[DELETE resume]', err);
        res.status(500).json({ error: err.message });
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

        // Delete everything except the original docx/pdf file.
        // This intentionally removes meta/jobs/skills/html/etc so we always rebuild from source.
        for (const ent of entries) {
            if (ent.name === keepEntry.name) continue;
            const target = path.join(dir, ent.name);
            await fs.rm(target, { recursive: true, force: true });
        }

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

        const cleanEnv = {};
        for (const [key, value] of Object.entries(process.env)) {
            if (!key.includes('API')) cleanEnv[key] = value;
        }

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
                console.error(`[Parser stderr]: ${t.trim()}`);
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
                    console.error(`[ResumeReparse] Parser module missing with ${pythonBin}:`, details);
                    console.log(`Remedy: retrying parser with another Python binary (${pythonBinCandidates.join(', ')})`);
                    continue;
                }
                throw error;
            }
        }
        if (parserRunError) throw parserRunError;

        // Recreate meta.json (it was deleted as part of the reparse).
        const metadata = {
            id,
            displayName: existingMeta?.displayName || existingMeta?.name || id,
            originalFilename: keepEntry.name,
            sourceUrl: existingMeta?.sourceUrl || null,
            sourceType: existingMeta?.sourceType || (existingMeta?.sourceUrl ? 'url' : 'upload'),
            createdAt: new Date().toISOString(),
            uploadedBy: existingMeta?.uploadedBy || 'user',
            fileSize: (await fs.stat(keepDocPath)).size
        };
        await fs.writeFile(metaPath, JSON.stringify(metadata, null, 2));

        // Read and normalize parsed outputs so we can return counts.
        const jobsPath = path.join(dir, 'jobs.json');
        const skillsPath = path.join(dir, 'skills.json');
        const categoriesPath = path.join(dir, 'categories.json');
        const { jobs, skills } = await readAndNormalizeResumeData(jobsPath, skillsPath, categoriesPath);

        await regenerateNonLocalResumesIndex(`resume re-parsed (${id})`);

        res.json({
            success: true,
            resumeId: id,
            displayName: metadata.displayName,
            jobCount: jobs.length,
            skillCount: Object.keys(skills).length,
            metadata
        });
    } catch (error) {
        reportError(error, '[ResumeReparse] Failed to reparse resume folder', 'No remedy: request fails and client should retry');
        res.status(500).json({
            error: 'Failed to reparse resume',
            details: error?.message || String(error)
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

        sendStatus('Deleting derived files...');

        for (const ent of entries) {
            if (ent.name === keepEntry.name) continue;
            const target = path.join(dir, ent.name);
            await fs.rm(target, { recursive: true, force: true });
        }

        // Prepare parser output log and stream it.
        outputFilePath = path.join(dir, 'parser-output.log');
        const outStream = fsSync.createWriteStream(outputFilePath, { flags: 'w' });

        const parserModule = process.env.RESUME_PARSER_MODULE || RESUME_PARSER_PYTHON_MODULE_UNSET_ENV;
        const resumeParserProjectPath = process.env.RESUME_PARSER_PROJECT_PATH
            ? path.resolve(PROJECT_ROOT, process.env.RESUME_PARSER_PROJECT_PATH)
            : path.resolve(PROJECT_ROOT, RESUME_PARSER_PROJECT_PATH_RELATIVE_UNSET_ENV);
        const pythonBin = path.join(resumeParserProjectPath, 'venv', 'bin', 'python3');

        const cleanEnv = {};
        for (const [key, value] of Object.entries(process.env)) {
            if (!key.includes('API')) cleanEnv[key] = value;
        }

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

        await new Promise((resolve, reject) => {
            child.on('close', (code) => resolve(code));
            child.on('error', reject);
        });

        clearInterval(tailTimer);
        await tailOnce(true);
        outStream.end();

        // Ensure parser wrote expected output.
        const jobsPath = path.join(dir, 'jobs.json');
        const skillsPath = path.join(dir, 'skills.json');
        const categoriesPath = path.join(dir, 'categories.json');
        const { jobs, skills } = await readAndNormalizeResumeData(jobsPath, skillsPath, categoriesPath);

        // Recreate meta.json (it was deleted as part of the reparse).
        const metadata = {
            id,
            displayName: existingMeta?.displayName || existingMeta?.name || id,
            originalFilename: keepEntry.name,
            sourceUrl: existingMeta?.sourceUrl || null,
            sourceType: existingMeta?.sourceType || (existingMeta?.sourceUrl ? 'url' : 'upload'),
            createdAt: new Date().toISOString(),
            uploadedBy: existingMeta?.uploadedBy || 'user',
            fileSize: (await fs.stat(keepDocPath)).size
        };
        await fs.writeFile(metaPath, JSON.stringify(metadata, null, 2));

        await regenerateNonLocalResumesIndex(`resume re-parsed (${id})`);

        sendEvent('done', JSON.stringify({
            success: true,
            resumeId: id,
            displayName: metadata.displayName,
            jobCount: jobs.length,
            skillCount: Object.keys(skills).length,
            metadata
        }));
        res.end();
    } catch (e) {
        try { if (tailTimer) clearInterval(tailTimer); } catch {}
        try { await tailOnce(true); } catch {}
        reportError(e, '[ResumeReparseStream] Failed to reparse with stream');
        sendEvent('error', JSON.stringify({ message: e instanceof Error ? e.message : String(e) }));
        res.end();
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
        console.error('Error listing resumes:', error?.code || error?.message, error);
        res.status(500).json({ error: 'Failed to list resumes.' });
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
                console.error('❌ Failed to fetch resume from URL:', error);
                return res.status(400).json({
                    error: 'Failed to fetch resume from URL',
                    details: error.message
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
        const cleanEnv = {};
        for (const [key, value] of Object.entries(process.env)) {
            if (!key.includes('API')) {
                cleanEnv[key] = value;
            }
        }

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
                console.error(`[Parser stderr]: ${data.toString().trim()}`);
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
                    console.error(`[ResumeUpload] Parser module missing with ${pythonBin}:`, details);
                    console.log(`Remedy: retrying parser with another Python binary (${pythonBinCandidates.join(', ')})`);
                    continue;
                }
                throw error;
            }
        }
        if (parserRunError) {
            throw parserRunError;
        }

        // Generate meta.json
        const metadata = {
            id: resumeId,
            displayName: displayName,
            originalFilename: uploadedFile.originalname,
            sourceUrl: req.body.resumeUrl || null, // Original URL if fetched from web
            sourceType: req.body.resumeUrl ? 'url' : 'upload', // 'url' or 'upload'
            createdAt: new Date().toISOString(),
            uploadedBy: req.body.uploadedBy || 'user',
            fileSize: uploadedFile.size
        };

        const metaPath = path.join(outputDir, 'meta.json');
        await fs.writeFile(metaPath, JSON.stringify(metadata, null, 2));

        console.log(`✅ Resume parsed successfully: ${resumeId}`);

        // Read the parsed data to return in response (parser outputs jobs.json, skills.json, categories.json)
        const jobsPath = path.join(outputDir, 'jobs.json');
        const skillsPath = path.join(outputDir, 'skills.json');
        const categoriesPath = path.join(outputDir, 'categories.json');

        const { jobs, skills } = await readAndNormalizeResumeData(jobsPath, skillsPath, categoriesPath);

        await regenerateNonLocalResumesIndex(`resume created (${resumeId})`);

        res.json({
            success: true,
            resumeId: resumeId,
            displayName: displayName,
            jobCount: jobs.length,
            skillCount: Object.keys(skills).length,
            metadata: metadata,
            parserOutput
        });

    } catch (error) {
        reportError(error, '[ResumeUpload] Failed to process resume upload');

        // Clean up uploaded file if it exists
        if (req.file && req.file.path) {
            try {
                await fs.unlink(req.file.path);
            } catch (e) {
                // Ignore cleanup errors
            }
        }

        res.status(500).json({
            error: 'Failed to process resume upload',
            details: error.message,
            parserOutput: error?.parserOutput || ''
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

        const cleanEnv = {};
        for (const [key, value] of Object.entries(process.env)) {
            if (!key.includes('API')) cleanEnv[key] = value;
        }

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

        const metadata = { id: resumeId, displayName, createdAt: new Date().toISOString() };
        sendEvent('done', JSON.stringify({
            success: true,
            resumeId,
            displayName,
            jobCount: jobs.length,
            skillCount: Object.keys(skills).length,
            metadata,
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
        console.error('[palette-catalog] GET /api/palette-manifest failed:', msg);
        res.status(503).json({
            error: 'Palette catalog unavailable',
            message: msg,
            hint: 'No local static_content/colorPalettes and no warmed server catalog — configure S3 or add palette JSON files',
        });
    }
});

// GET /api/palette-catalog: version-2 bundle { version: 2, palettes: [...] } for S3-style catalog clients
app.get('/api/palette-catalog', async (req, res) => {
    try {
        res.json(await getPaletteCatalogBundleV2ForApi());
    } catch (error) {
        const status = error.code === 'ENOENT' ? 404 : 500;
        res.status(status).json({ error: 'Failed to build palette catalog.', details: error.message });
    }
});

// POST /api/write-css: Writes dynamic CSS content to a file
app.post('/api/write-css', async (req, res) => {
    try {
        await fs.mkdir(path.dirname(CSS_FILE_PATH), { recursive: true });
        await fs.writeFile(CSS_FILE_PATH, req.body);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to write CSS file.' });
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
        console.error('❌ Failed to initialize event data directories:', error);
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
        console.error('❌ Failed to process event data:', error);
        res.status(500).json({ error: 'Failed to process event data', details: error.message });
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
            res.status(500).json({ error: 'Failed to retrieve analysis' });
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
        console.error('❌ Failed to generate analysis dashboard:', error);
        res.status(500).send('Failed to generate analysis dashboard');
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
        console.error('❌ Failed to initialize sync logs directory:', error);
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
        console.error('❌ Failed to update sync logs index:', error);
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
        console.error('❌ Failed to save sync log:', error);
        res.status(500).json({ error: 'Failed to save sync log.' });
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
            console.error('❌ Failed to get sync logs index:', error);
            res.status(500).json({ error: 'Failed to get sync logs index.' });
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
            console.error('❌ Failed to get sync log session:', error);
            res.status(500).json({ error: 'Failed to get sync log session.' });
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
            console.error('❌ Failed to delete sync log session:', error);
            res.status(500).json({ error: 'Failed to delete sync log session.' });
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
        console.error('❌ Failed to generate sync logs dashboard:', error);
        res.status(500).send(`
            <html>
                <head><title>Sync Logs Dashboard Error</title></head>
                <body>
                    <h1>Error Loading Dashboard</h1>
                    <p>${error.message}</p>
                </body>
            </html>
        `);
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
            console.error(`❌ Server: Found ${scanResults.violatingComponents.length} dependency violations`);
            
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
        console.error('❌ Server: Dependency check failed:', error);
        res.status(500).json({
            success: false,
            error: 'Dependency check failed',
            message: error.message
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
        console.error('❌ Server: Failed to generate violations page:', error);
        res.status(500).send(`
            <html>
                <head><title>Error</title></head>
                <body>
                    <h1>Error Generating Violations Page</h1>
                    <p>${error.message}</p>
                </body>
            </html>
        `);
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
// Requires OPENAI_API_KEY in .env. Returns { slug, summary, cached }.
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
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        return res.status(503).json({ error: 'OPENAI_API_KEY not configured on server.' });
    }
    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                max_tokens: 300,
                messages: [
                    {
                        role: 'system',
                        content: 'You are a concise technical reference. Answer in 2–4 sentences. No markdown, no bullet points, plain prose only.',
                    },
                    {
                        role: 'user',
                        content: `What is "${slug.replace(/-/g, ' ')}" in the context of software engineering and data engineering? Give a brief, plain-English definition suitable for a resume portfolio.`,
                    },
                ],
            }),
        });
        if (!response.ok) {
            const body = await response.text().catch(() => '');
            return res.status(502).json({ error: `OpenAI API error ${response.status}: ${body.slice(0, 200)}` });
        }
        const data = await response.json();
        const summary = data.choices?.[0]?.message?.content?.trim() || '';
        if (!summary) return res.status(502).json({ error: 'Empty response from OpenAI.' });
        skillInfoCache.set(slug, summary);
        res.json({ slug, summary, cached: false });
    } catch (e) {
        reportError(e, '[skill-info] Failed to fetch from OpenAI');
        res.status(500).json({ error: e.message });
    }
});

const MAX_PORT_RETRIES = 10; // Limit how many ports to try
const START_PORT = parseInt(process.env.EXPRESS_PORT, 10) || parseInt(process.env.PORT, 10) || 3001;

// Actual bound port (set in listen callback); used by route handlers for URLs
let actualBackendPort = START_PORT;
const viteDevPort = parseInt(process.env.VITE_DEV_PORT, 10) || 5174;

function startServer(port) {
    if (port >= START_PORT + MAX_PORT_RETRIES) {
        console.error(`Failed to bind server after trying ports ${START_PORT} to ${port - 1}. Exiting.`);
        process.exit(1); // Exit if no port found
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
            console.error("Server failed to start:", err);
            process.exit(1);
        }
    });
}

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