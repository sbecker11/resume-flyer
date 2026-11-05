/**
 * Route tests for the resume / state / skill-URL API in server.mjs.
 * server.mjs only calls listen() when run as the main module, so importing it here
 * registers the routes without binding a port. supertest drives the app directly.
 * Directories are redirected to a temp folder via PARSED_RESUMES_DIR, APP_STATE_FILE,
 * and SKILL_URLS_FILE before the import. Anthropic is mocked; nothing leaves the machine.
 */
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkResumeDataConsistency, hasBlockingFindings } from '../data/resumeDataConsistency.mjs';

vi.mock('../utils/anthropicEnv.mjs', () => ({
    getAnthropicApiKey: vi.fn(() => ''),
    getSkillInfoModel: vi.fn(() => 'test-model'),
    getParserSpawnEnv: vi.fn(() => ({})),
}));
vi.mock('../utils/anthropicLlm.mjs', () => ({
    callAnthropicMessages: vi.fn(async () => 'A mocked summary.'),
}));
// Spy that calls through: server.mjs must report route failures via reportError, not bare console.error.
vi.mock('../utils/errorReporting.mjs', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, reportError: vi.fn(actual.reportError) };
});

const PROJECT_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');

let tmpRoot;
let parsedDir;
let app;
let anthropicEnv;
let anthropicLlm;
let errorReporting;

const RESUME_ID = 'fixture-resume';

function fixtureJobs() {
    return [
        {
            employer: 'Acme', role: 'Engineer', start: '2020-01', end: '2021-01',
            Description: '• Built a [Vue 3] + [Express] app.', skillIDs: ['vue-3', 'Express'],
        },
        {
            employer: 'Beta', role: 'Lead', start: '2021-02', end: '2022-01',
            Description: '• [Express] services on [AWS].', skillIDs: ['Express', 'aws'],
        },
        {
            employer: 'Gamma', role: 'Staff', start: '2022-02', end: '2023-01',
            Description: '• [Python] tooling.', skillIDs: ['python'],
        },
    ];
}

function fixtureSkills() {
    return {
        'vue-3': { name: 'Vue 3', url: 'https://vuejs.org/', jobIDs: [0] },
        Vue: { name: 'Vue', jobIDs: [] },
        Express: { name: 'Express', url: 'https://expressjs.com/en/starter/installing.html', jobIDs: [0, 1] },
        'express-js': { name: 'Express.js', url: 'https://expressjs.com/', jobIDs: [] },
        aws: { name: 'AWS', jobIDs: [1] },
        python: { name: 'Python', url: 'https://python.org/', jobIDs: [2] },
    };
}

/** Atomic writes may still be releasing locks; retry until the folder is gone. */
async function removeFixtureDir(dir) {
    for (let attempt = 0; attempt < 20; attempt++) {
        try {
            await fs.rm(dir, { recursive: true, force: true });
            return;
        } catch (e) {
            if (e.code !== 'ENOTEMPTY' && e.code !== 'EBUSY') throw e;
            await new Promise((r) => setTimeout(r, 25));
        }
    }
    await fs.rm(dir, { recursive: true, force: true });
}

async function writeFixture() {
    const dir = path.join(parsedDir, RESUME_ID);
    await removeFixtureDir(dir);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'jobs.json'), JSON.stringify(fixtureJobs(), null, 2));
    await fs.writeFile(path.join(dir, 'skills.json'), JSON.stringify(fixtureSkills(), null, 2));
    await fs.writeFile(path.join(dir, 'meta.json'), JSON.stringify({ displayName: 'Fixture' }, null, 2));
}

async function readJson(rel) {
    return JSON.parse(await fs.readFile(path.join(parsedDir, RESUME_ID, rel), 'utf-8'));
}

async function readText(rel) {
    return fs.readFile(path.join(parsedDir, RESUME_ID, rel), 'utf-8');
}

/** Parser-style output: ensure_ascii escapes plus a trailing newline. */
function asciiJson(value) {
    return `${JSON.stringify(value, null, 2).replace(/[\u007f-\uffff]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)}\n`;
}

/**
 * The React 18 → React case from the Skill jobs tab: job 1 lists the retired skill by display
 * name (so react-18.jobIDs never knew about it), an education entry lists it by key, and two
 * categories carry the key. jobs.json is written parser-style (escaped, trailing newline).
 */
async function writeReactMergeScenario() {
    const dir = path.join(parsedDir, RESUME_ID);
    const jobs = fixtureJobs();
    jobs[1].skillIDs = ['Express', 'React 18', 'aws'];
    jobs[1].Description = '• [React 18] services on [AWS] → fast.';
    jobs[2].skillIDs = ['python', 'react'];
    const skills = {
        ...fixtureSkills(),
        'react-18': { name: 'React 18', url: 'https://react.dev/blog/2022/03/29/react-v18', jobIDs: [] },
        react: { name: 'React', jobIDs: [2] },
    };
    const education = {
        phd: { index: 0, degree: 'PhD', institution: 'MIT', start: '1990/09', end: '1996/06', description: 'Built demos in [React 18] — early.', skillIDs: ['react-18'] },
    };
    const categories = {
        frontend: { name: 'Frontend', skillIDs: ['vue-3', 'react-18', 'react'] },
        framework: { name: 'Framework', skillIDs: ['Express', 'react-18'] },
        data: { name: 'Data', skillIDs: ['python'] },
    };
    await fs.writeFile(path.join(dir, 'jobs.json'), asciiJson(jobs));
    await fs.writeFile(path.join(dir, 'skills.json'), JSON.stringify(skills, null, 2));
    await fs.writeFile(path.join(dir, 'education.json'), JSON.stringify(education, null, 2));
    await fs.writeFile(path.join(dir, 'categories.json'), `${JSON.stringify(categories, null, 2)}\n`);
}

/** Every discrepancy the merge must leave behind: none. */
async function expectReactFullyMerged() {
    const [skills, jobs, education, categories] = await Promise.all([
        readJson('skills.json'), readJson('jobs.json'), readJson('education.json'), readJson('categories.json'),
    ]);
    expect(skills['react-18']).toBeUndefined();
    // Job 1 (display-name reference), job 2 (already on react), education row at merged index 3.
    // categoryIDs mirror the two categories.json lists that now name react.
    expect(skills.react).toEqual({ name: 'React', jobIDs: [1, 2, 3], url: 'https://react.dev/blog/2022/03/29/react-v18', categoryIDs: ['frontend', 'framework'] });
    expect(jobs[1].skillIDs).toEqual(['Express', 'react', 'aws']);
    expect(jobs[1].Description).toBe('• [React] services on [AWS] → fast.');
    expect(jobs[2].skillIDs).toEqual(['python', 'react']);
    expect(education.phd.skillIDs).toEqual(['react']);
    expect(education.phd.description).toBe('Built demos in [React] — early.');
    expect(categories.frontend.skillIDs).toEqual(['vue-3', 'react']);
    expect(categories.framework.skillIDs).toEqual(['Express', 'react']);
    expect(categories.data.skillIDs).toEqual(['python']);
    for (const rel of ['skills.json', 'jobs.json', 'education.json', 'categories.json']) {
        const text = await readText(rel);
        expect(text, rel).not.toMatch(/react-18|React 18/);
        expect(text.endsWith('\n'), `${rel} ends with one newline`).toBe(true);
        expect(text.endsWith('\n\n'), `${rel} ends with one newline`).toBe(false);
    }
    // jobs.json stays in the parser's ensure_ascii style; the others stay raw UTF-8.
    const jobsText = await readText('jobs.json');
    expect(jobsText).toContain('\\u2022 [React] services on [AWS] \\u2192 fast.');
    expect(jobsText).not.toMatch(/[^\x00-\x7f]/);
    expect(await readText('education.json')).toContain('[React] — early.');
}

/** commitResume rebakes enriched-jobs.json synchronously; this confirms the file exists before the checker reads it. */
async function waitForBake() {
    const p = path.join(parsedDir, RESUME_ID, 'enriched-jobs.json');
    await vi.waitFor(async () => { await fs.access(p); }, { timeout: 2000 });
}

async function readOptionalJson(absPath) {
    try {
        return JSON.parse(await fs.readFile(absPath, 'utf-8'));
    } catch (e) {
        if (e.code === 'ENOENT') return undefined;
        throw e;
    }
}

/**
 * The checker is the gate: after any mutating route, the files on disk must hold every
 * invariant (no error or warning findings). Prints the findings when they do not.
 */
async function expectConsistent(resumeId = RESUME_ID) {
    const dir = path.join(parsedDir, resumeId);
    const [jobs, skills, education, categories, enrichedJobs, skillUrls] = await Promise.all([
        readOptionalJson(path.join(dir, 'jobs.json')),
        readOptionalJson(path.join(dir, 'skills.json')),
        readOptionalJson(path.join(dir, 'education.json')),
        readOptionalJson(path.join(dir, 'categories.json')),
        readOptionalJson(path.join(dir, 'enriched-jobs.json')),
        readOptionalJson(path.join(parsedDir, 'skill-urls.json')),
    ]);
    const findings = checkResumeDataConsistency({
        jobs, skills, education, categories, enrichedJobs: enrichedJobs ?? null, skillUrls, resumeId,
    });
    const blocking = findings.filter((f) => f.severity !== 'info');
    expect(hasBlockingFindings(findings), `consistency findings after route:\n${JSON.stringify(blocking, null, 2)}`).toBe(false);
}

beforeAll(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'resume-flyer-routes-'));
    parsedDir = path.join(tmpRoot, 'parsed_resumes');
    await fs.mkdir(parsedDir, { recursive: true });
    process.env.PARSED_RESUMES_DIR = parsedDir;
    process.env.APP_STATE_FILE = path.join(tmpRoot, 'app_state.json');
    process.env.SKILL_URLS_FILE = path.join(tmpRoot, 'shared-skill-urls.json');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    ({ app } = await import('../../server.mjs'));
    anthropicEnv = await import('../utils/anthropicEnv.mjs');
    anthropicLlm = await import('../utils/anthropicLlm.mjs');
    errorReporting = await import('../utils/errorReporting.mjs');
});

afterAll(async () => {
    vi.restoreAllMocks();
    await fs.rm(tmpRoot, { recursive: true, force: true });
});

beforeEach(async () => {
    await writeFixture();
    await fs.rm(process.env.SKILL_URLS_FILE, { force: true });
    await fs.rm(path.join(parsedDir, 'skill-urls.json'), { force: true });
});

describe('app state', () => {
    it('creates app_state.json from the committed default on first read', async () => {
        await fs.rm(process.env.APP_STATE_FILE, { force: true });
        const res = await request(app).get('/api/state');
        expect(res.status).toBe(200);
        const expected = JSON.parse(await fs.readFile(path.join(PROJECT_ROOT, 'public', 'app_state.default.json'), 'utf-8'));
        expect(res.body).toEqual(expected);
        await fs.access(process.env.APP_STATE_FILE);
    });

    it('round-trips a posted state', async () => {
        const state = { layout: 'test', currentResumeId: RESUME_ID, nested: { a: 1 } };
        const post = await request(app).post('/api/state').send(state);
        expect(post.status).toBe(200);
        expect(post.body).toEqual({ success: true });
        const get = await request(app).get('/api/state');
        expect(get.body).toEqual(state);
    });
});

describe('GET /api/resumes/:id/data', () => {
    it('returns normalized jobs, skills, and categories', async () => {
        const res = await request(app).get(`/api/resumes/${RESUME_ID}/data`);
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.jobs)).toBe(true);
        expect(res.body.jobs).toHaveLength(3);
        // A skills map whose keys are slugs or self-named passes through unchanged (no re-keying by display name).
        expect(res.body.skills.python.url).toBe('https://python.org/');
        expect(res.body.skills.Python).toBeUndefined();
        expect(res.body.categories).toEqual({});
    });

    it('404s for an unknown resume', async () => {
        const res = await request(app).get('/api/resumes/nope/data');
        expect(res.status).toBe(404);
        expect(res.body.error).toMatch(/not found/);
    });
});

describe('PATCH /api/resumes/:id/jobs/:jobIndex/skills', () => {
    it('updates the job, creates new skills, canonicalizes display names, and syncs skills.jobIDs both ways', async () => {
        // 'Vue 3' is a display name; [Python] stays bracketed in job 2's Description so python must stay linked.
        const res = await request(app)
            .patch(`/api/resumes/${RESUME_ID}/jobs/2/skills`)
            .send({ skillIDs: ['Vue 3', 'python', 'Kafka'], newSkills: ['Kafka', '  ', { name: 'Ignored?' }] });
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ ok: true, skillIDs: ['vue-3', 'python', 'Kafka'] });

        const jobs = await readJson('jobs.json');
        const skills = await readJson('skills.json');
        expect(jobs[2].skillIDs).toEqual(['vue-3', 'python', 'Kafka']);
        expect(skills.Kafka).toEqual({ name: 'Kafka', jobIDs: [2] });
        expect(skills['Ignored?']).toEqual({ name: 'Ignored?', jobIDs: [] });
        expect(skills['vue-3'].jobIDs).toEqual([0, 2]);
        expect(skills.python.jobIDs).toEqual([2]);
        await waitForBake();
        await expectConsistent();
    });

    it('reuses an existing skill when newSkills retypes its name in a different case', async () => {
        const res = await request(app)
            .patch(`/api/resumes/${RESUME_ID}/jobs/1/skills`)
            .send({ skillIDs: ['Express', 'aws', 'PYTHON'], newSkills: ['PYTHON'] });
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ ok: true, skillIDs: ['Express', 'aws', 'python'] });
        const skills = await readJson('skills.json');
        expect(skills.PYTHON).toBeUndefined();
        expect(skills.python.jobIDs).toEqual([1, 2]);
        await waitForBake();
        await expectConsistent();
    });

    it('refuses (422, nothing written) to unlink a skill the Description still references in [brackets]', async () => {
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        errorReporting.reportError.mockClear();
        const before = await readText('jobs.json');
        const res = await request(app)
            .patch(`/api/resumes/${RESUME_ID}/jobs/0/skills`)
            .send({ skillIDs: ['vue-3'] });
        errSpy.mockRestore();
        expect(res.status).toBe(422);
        // The refusal is an expected client-facing outcome: the route logs it at info level, not as an error.
        expect(errorReporting.reportError).not.toHaveBeenCalledWith(expect.anything(), '[PATCH jobs skills]', expect.anything());
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('[PATCH jobs skills] Refused (422)'));
        expect(res.body.error).toMatch(/bracket-not-linked/);
        expect(res.body.findings).toEqual([expect.objectContaining({ code: 'bracket-not-linked', where: 'jobs.json[0].Description' })]);
        expect(await readText('jobs.json')).toBe(before);
        expect((await readJson('skills.json')).Express.jobIDs).toEqual([0, 1]);
        await fs.access(path.join(parsedDir, RESUME_ID, 'enriched-jobs.json')).then(() => { throw new Error('enriched-jobs.json should not be written'); }, (e) => expect(e.code).toBe('ENOENT'));
    });

    it('rejects an unknown skill id that is not in newSkills', async () => {
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const res = await request(app).patch(`/api/resumes/${RESUME_ID}/jobs/2/skills`).send({ skillIDs: ['python', 'Nope'] });
        errSpy.mockRestore();
        expect(res.status).toBe(422);
        expect(res.body.findings.map((f) => f.code)).toEqual(['skill-id-unknown']);
        expect((await readJson('jobs.json'))[2].skillIDs).toEqual(['python']);
    });

    it('rejects a missing skillIDs array and an unknown job index', async () => {
        const bad = await request(app).patch(`/api/resumes/${RESUME_ID}/jobs/0/skills`).send({ skillIDs: 'x' });
        expect(bad.status).toBe(400);
        const missing = await request(app).patch(`/api/resumes/${RESUME_ID}/jobs/9/skills`).send({ skillIDs: [] });
        expect(missing.status).toBe(404);
    });
});

describe('PATCH /api/resumes/:id/skills/rename', () => {
    it('renames the key, rewrites job skillIDs and [brackets], and keeps the URL', async () => {
        const res = await request(app)
            .patch(`/api/resumes/${RESUME_ID}/skills/rename`)
            .send({ oldKey: 'python', newName: 'Python 3' });
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ ok: true, key: 'Python 3', descriptionFixes: 1 });

        const skills = await readJson('skills.json');
        const jobs = await readJson('jobs.json');
        expect(skills.python).toBeUndefined();
        expect(skills['Python 3']).toEqual({ name: 'Python 3', jobIDs: [2], url: 'https://python.org/' });
        expect(jobs[2].skillIDs).toEqual(['Python 3']);
        expect(jobs[2].Description).toBe('• [Python 3] tooling.');
        await waitForBake();
        await expectConsistent();
    });

    it('merges onto an existing name, keeping the shortest manually defined URL', async () => {
        // Express (long URL) renamed onto Express.js (short URL) → short URL survives.
        const res = await request(app)
            .patch(`/api/resumes/${RESUME_ID}/skills/rename`)
            .send({ oldKey: 'Express', newName: 'express-js' });
        expect(res.status).toBe(200);
        const skills = await readJson('skills.json');
        expect(skills.Express).toBeUndefined();
        expect(skills['express-js'].url).toBe('https://expressjs.com/');
        expect(skills['express-js'].jobIDs).toEqual([0, 1]);
        const jobs = await readJson('jobs.json');
        expect(jobs[0].skillIDs).toEqual(['vue-3', 'express-js']);
        expect(jobs[1].skillIDs).toEqual(['express-js', 'aws']);
        // Brackets follow the surviving skill's display name, so the bake can resolve them.
        expect(jobs[0].Description).toBe('• Built a [Vue 3] + [Express.js] app.');
        expect(jobs[1].Description).toBe('• [Express.js] services on [AWS].');
        await waitForBake();
        await expectConsistent();
    });

    it('renaming onto an existing key is a full merge: display-name refs, education, categories, jobIDs', async () => {
        await writeReactMergeScenario();
        const res = await request(app)
            .patch(`/api/resumes/${RESUME_ID}/skills/rename`)
            .send({ oldKey: 'react-18', newName: 'react' });
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ ok: true, key: 'react', descriptionFixes: 2 });
        await expectReactFullyMerged();
        await waitForBake();
        await expectConsistent();
    });

    it('a plain rename moves the key in categories and picks up display-name job references', async () => {
        const dir = path.join(parsedDir, RESUME_ID);
        const jobs = fixtureJobs();
        jobs[1].skillIDs = ['Express', 'aws', 'Python'];
        await fs.writeFile(path.join(dir, 'jobs.json'), JSON.stringify(jobs, null, 2));
        await fs.writeFile(path.join(dir, 'categories.json'), JSON.stringify({ lang: { name: 'Languages', skillIDs: ['python', 'other'] } }, null, 2));
        const res = await request(app)
            .patch(`/api/resumes/${RESUME_ID}/skills/rename`)
            .send({ oldKey: 'python', newName: 'Python 3' });
        expect(res.status).toBe(200);
        const skills = await readJson('skills.json');
        const after = await readJson('jobs.json');
        expect(skills['Python 3'].jobIDs).toEqual([1, 2]);
        expect(skills['Python 3'].categoryIDs).toEqual(['lang']);
        expect(after[1].skillIDs).toEqual(['Express', 'aws', 'Python 3']);
        // The dangling 'other' entry (no such skill) is dropped on write.
        expect((await readJson('categories.json')).lang.skillIDs).toEqual(['Python 3']);
        await waitForBake();
        await expectConsistent();
    });

    it('is a no-op for an identical name and 404s for an unknown key', async () => {
        const same = await request(app).patch(`/api/resumes/${RESUME_ID}/skills/rename`).send({ oldKey: 'aws', newName: 'aws' });
        expect(same.status).toBe(200);
        expect(same.body).toEqual({ ok: true, key: 'aws' });
        const unknown = await request(app).patch(`/api/resumes/${RESUME_ID}/skills/rename`).send({ oldKey: 'nope', newName: 'x' });
        expect(unknown.status).toBe(404);
        const bad = await request(app).patch('/api/resumes/default/skills/rename').send({ oldKey: 'a', newName: 'b' });
        expect(bad.status).toBe(400);
    });
});

describe('PATCH /api/resumes/:id/skills/merge', () => {
    it('folds the source skill into the target and carries the manually defined URL', async () => {
        const res = await request(app)
            .patch(`/api/resumes/${RESUME_ID}/skills/merge`)
            .send({ fromKey: 'Vue 3', toKey: 'Vue' });
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ ok: true, mergedInto: 'Vue', descriptionFixes: 1 });

        const skills = await readJson('skills.json');
        const jobs = await readJson('jobs.json');
        expect(skills['vue-3']).toBeUndefined();
        expect(skills.Vue).toEqual({ name: 'Vue', jobIDs: [0], url: 'https://vuejs.org/' });
        expect(jobs[0].skillIDs).toEqual(['Vue', 'Express']);
        expect(jobs[0].Description).toBe('• Built a [Vue] + [Express] app.');
        await waitForBake();
        await expectConsistent();
    });

    it('leaves no trace of the retired skill: display-name job refs, education, categories, jobIDs, file style', async () => {
        await writeReactMergeScenario();
        const res = await request(app)
            .patch(`/api/resumes/${RESUME_ID}/skills/merge`)
            .send({ fromKey: 'react-18', toKey: 'react' });
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ ok: true, mergedInto: 'react', descriptionFixes: 2 });
        await expectReactFullyMerged();
        await waitForBake();
        await expectConsistent();
    });

    it('does not rewrite education.json or categories.json when they hold no reference', async () => {
        const dir = path.join(parsedDir, RESUME_ID);
        const categoriesText = '{\n  "cloud": {\n    "name": "Cloud",\n    "skillIDs": [\n      "aws"\n    ]\n  }\n}';
        await fs.writeFile(path.join(dir, 'categories.json'), categoriesText);
        const res = await request(app).patch(`/api/resumes/${RESUME_ID}/skills/merge`).send({ fromKey: 'vue-3', toKey: 'Vue' });
        expect(res.status).toBe(200);
        expect(await readText('categories.json')).toBe(categoriesText);
        await fs.access(path.join(dir, 'education.json')).then(() => { throw new Error('education.json should not be created'); }, (e) => expect(e.code).toBe('ENOENT'));
        await waitForBake();
        await expectConsistent();
    });

    it('re-keys the shared catalog row from the retired slug to the surviving one', async () => {
        await request(app).put('/api/skill-urls').send({ key: 'vue-3', url: 'https://vuejs.org/guide/', updatedAt: '2026-01-01T00:00:00.000Z' });
        const res = await request(app).patch(`/api/resumes/${RESUME_ID}/skills/merge`).send({ fromKey: 'vue-3', toKey: 'Vue' });
        expect(res.status).toBe(200);
        const catalog = (await request(app).get('/api/skill-urls')).body;
        expect(catalog.entries.Vue).toEqual({ url: 'https://vuejs.org/guide/', updatedAt: '2026-01-01T00:00:00.000Z' });
        // The old row is left in place (last-write-wins history); the surviving slug now resolves.
        expect(catalog.entries['vue-3']).toBeTruthy();
        await waitForBake();
        await expectConsistent();
    });

    it('validates keys', async () => {
        const same = await request(app).patch(`/api/resumes/${RESUME_ID}/skills/merge`).send({ fromKey: 'aws', toKey: 'AWS' });
        expect(same.status).toBe(400);
        const missingFrom = await request(app).patch(`/api/resumes/${RESUME_ID}/skills/merge`).send({ fromKey: 'nope', toKey: 'aws' });
        expect(missingFrom.status).toBe(404);
        const missingTo = await request(app).patch(`/api/resumes/${RESUME_ID}/skills/merge`).send({ fromKey: 'aws', toKey: 'nope' });
        expect(missingTo.status).toBe(404);
        const noBody = await request(app).patch(`/api/resumes/${RESUME_ID}/skills/merge`).send({});
        expect(noBody.status).toBe(400);
    });
});

describe('PATCH /api/resumes/:id/skills/remove', () => {
    it('removes the skill and every reference to it', async () => {
        const res = await request(app).patch(`/api/resumes/${RESUME_ID}/skills/remove`).send({ key: 'Express' });
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ ok: true, key: 'Express', name: 'Express' });
        const skills = await readJson('skills.json');
        const jobs = await readJson('jobs.json');
        expect(skills.Express).toBeUndefined();
        expect(jobs[0].skillIDs).toEqual(['vue-3']);
        expect(jobs[1].skillIDs).toEqual(['aws']);
        expect(jobs[0].Description).toBe('• Built a [Vue 3] + Express app.');
        expect(jobs[1].Description).toBe('• Express services on [AWS].');
        await waitForBake();
        await expectConsistent();
    });

    it('404s for an unknown skill or resume and 400s without a key', async () => {
        expect((await request(app).patch(`/api/resumes/${RESUME_ID}/skills/remove`).send({ key: 'nope' })).status).toBe(404);
        expect((await request(app).patch('/api/resumes/missing/skills/remove').send({ key: 'aws' })).status).toBe(404);
        expect((await request(app).patch(`/api/resumes/${RESUME_ID}/skills/remove`).send({})).status).toBe(400);
    });
});

describe('PATCH /api/resumes/:id/skills/url', () => {
    it('sets and clears a skill URL, resolving by display name too', async () => {
        const set = await request(app).patch(`/api/resumes/${RESUME_ID}/skills/url`).send({ key: 'AWS', url: ' https://aws.amazon.com/ ' });
        expect(set.status).toBe(200);
        expect(set.body).toEqual({ ok: true, key: 'aws', url: 'https://aws.amazon.com/' });
        expect((await readJson('skills.json')).aws.url).toBe('https://aws.amazon.com/');

        const clear = await request(app).patch(`/api/resumes/${RESUME_ID}/skills/url`).send({ key: 'aws', url: '' });
        expect(clear.status).toBe(200);
        expect((await readJson('skills.json')).aws.url).toBe('');
        await waitForBake();
        await expectConsistent();
    });

    it('rejects non-http URLs and unknown skills', async () => {
        expect((await request(app).patch(`/api/resumes/${RESUME_ID}/skills/url`).send({ key: 'aws', url: 'ftp://x' })).status).toBe(400);
        expect((await request(app).patch(`/api/resumes/${RESUME_ID}/skills/url`).send({ key: 'aws', url: 'not a url' })).status).toBe(400);
        expect((await request(app).patch(`/api/resumes/${RESUME_ID}/skills/url`).send({ key: 'nope', url: 'https://x.y' })).status).toBe(404);
        expect((await request(app).patch(`/api/resumes/${RESUME_ID}/skills/url`).send({})).status).toBe(400);
    });
});

describe('/api/skill-urls', () => {
    it('starts empty, accepts upserts, and mirrors into parsed_resumes/skill-urls.json', async () => {
        const empty = await request(app).get('/api/skill-urls');
        expect(empty.status).toBe(200);
        expect(empty.body).toEqual({ entries: {} });
        expect(empty.headers['cache-control']).toBe('no-store');

        const put = await request(app).put('/api/skill-urls').send({ key: ' lcel ', url: 'https://langchain.com/lcel', updatedAt: '2026-02-02T00:00:00.000Z' });
        expect(put.status).toBe(200);
        expect(put.body.entries.lcel).toEqual({ url: 'https://langchain.com/lcel', updatedAt: '2026-02-02T00:00:00.000Z' });

        const mirror = JSON.parse(await fs.readFile(path.join(parsedDir, 'skill-urls.json'), 'utf-8'));
        expect(mirror.entries.lcel.url).toBe('https://langchain.com/lcel');

        // An older updatedAt does not clobber the newer row.
        const stale = await request(app).put('/api/skill-urls').send({ key: 'lcel', url: 'https://old.example', updatedAt: '2020-01-01T00:00:00.000Z' });
        expect(stale.body.entries.lcel.url).toBe('https://langchain.com/lcel');
    });

    it('rejects a missing key or invalid URL', async () => {
        expect((await request(app).put('/api/skill-urls').send({ url: 'https://x.y' })).status).toBe(400);
        expect((await request(app).put('/api/skill-urls').send({ key: 'a', url: 'javascript:alert(1)' })).status).toBe(400);
    });
});

describe('job insert and delete', () => {
    it('inserts an empty job after an index and shifts skills.jobIDs', async () => {
        const res = await request(app).post(`/api/resumes/${RESUME_ID}/jobs`).send({ afterIndex: 0 });
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ ok: true, insertIndex: 1 });
        const jobs = await readJson('jobs.json');
        const skills = await readJson('skills.json');
        expect(jobs).toHaveLength(4);
        expect(jobs[1]).toMatchObject({ employer: '', role: '', skillIDs: [] });
        expect(skills.Express.jobIDs).toEqual([0, 2]);
        expect(skills.aws.jobIDs).toEqual([2]);
        expect(skills.python.jobIDs).toEqual([3]);
        await waitForBake();
        await expectConsistent();
    });

    it('inserts at the front when afterIndex is -1 or omitted, clamping to the array', async () => {
        const front = await request(app).post(`/api/resumes/${RESUME_ID}/jobs`).send({ afterIndex: -1 });
        expect(front.body.insertIndex).toBe(0);
        // 3 fixture jobs + the front insert = 4; an out-of-range afterIndex clamps to the end.
        const far = await request(app).post(`/api/resumes/${RESUME_ID}/jobs`).send({ afterIndex: 99 });
        expect(far.body.insertIndex).toBe(4);
        expect((await request(app).post('/api/resumes/missing/jobs').send({})).status).toBe(404);
        await waitForBake();
        await expectConsistent();
    });

    it('deletes a job and compacts skills.jobIDs', async () => {
        const res = await request(app).delete(`/api/resumes/${RESUME_ID}/jobs/1`);
        expect(res.status).toBe(200);
        const jobs = await readJson('jobs.json');
        const skills = await readJson('skills.json');
        expect(jobs.map((j) => j.employer)).toEqual(['Acme', 'Gamma']);
        expect(skills.Express.jobIDs).toEqual([0]);
        expect(skills.aws.jobIDs).toEqual([]);
        expect(skills.python.jobIDs).toEqual([1]);
        await waitForBake();
        await expectConsistent();
    });

    it('validates the job index', async () => {
        expect((await request(app).delete(`/api/resumes/${RESUME_ID}/jobs/abc`)).status).toBe(400);
        expect((await request(app).delete(`/api/resumes/${RESUME_ID}/jobs/42`)).status).toBe(404);
        expect((await request(app).delete('/api/resumes/missing/jobs/0')).status).toBe(404);
    });
});

describe('PATCH /api/resumes/:id/jobs/:jobIndex (fields)', () => {
    it('updates fields and a Description whose brackets stay linked, baking synchronously', async () => {
        const res = await request(app)
            .patch(`/api/resumes/${RESUME_ID}/jobs/2`)
            .send({ role: 'Principal', Description: '• [Python] tooling and more [Python].', ignored: 'x' });
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(res.body.job).toMatchObject({ employer: 'Gamma', role: 'Principal', Description: '• [Python] tooling and more [Python].', skillIDs: ['python'] });
        const jobs = await readJson('jobs.json');
        expect(jobs[2].role).toBe('Principal');
        const enriched = await readJson('enriched-jobs.json');
        expect(enriched[2]['job-skills']).toEqual({ python: 'python' });
        await waitForBake();
        await expectConsistent();
    });

    it('refuses a Description with an unresolved or unlinked [Bracket] and leaves the file alone', async () => {
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const before = await readText('jobs.json');
        const unresolved = await request(app).patch(`/api/resumes/${RESUME_ID}/jobs/2`).send({ Description: '• [Python] and [Rust].' });
        expect(unresolved.status).toBe(422);
        expect(unresolved.body.findings.map((f) => f.code)).toContain('bracket-unresolved');
        const unlinked = await request(app).patch(`/api/resumes/${RESUME_ID}/jobs/2`).send({ Description: '• [Python] on [AWS].' });
        expect(unlinked.status).toBe(422);
        expect(unlinked.body.findings.map((f) => f.code)).toEqual(['bracket-not-linked']);
        errSpy.mockRestore();
        expect(await readText('jobs.json')).toBe(before);
    });

    it('validates input and the job index', async () => {
        expect((await request(app).patch(`/api/resumes/${RESUME_ID}/jobs/2`).send({ nothing: 1 })).status).toBe(400);
        expect((await request(app).patch(`/api/resumes/${RESUME_ID}/jobs/9`).send({ role: 'x' })).status).toBe(404);
        expect((await request(app).patch('/api/resumes/missing/jobs/0').send({ role: 'x' })).status).toBe(404);
    });

    it('updates projectGithubRepoUrl and projectGithubPagesUrl and persists them to jobs.json', async () => {
        const res = await request(app)
            .patch(`/api/resumes/${RESUME_ID}/jobs/0`)
            .send({ projectGithubRepoUrl: 'https://github.com/acme/widget', projectGithubPagesUrl: 'https://acme.github.io/widget' });
        expect(res.status).toBe(200);
        expect(res.body.job).toMatchObject({
            projectGithubRepoUrl: 'https://github.com/acme/widget',
            projectGithubPagesUrl: 'https://acme.github.io/widget',
        });
        const jobs = await readJson('jobs.json');
        expect(jobs[0].projectGithubRepoUrl).toBe('https://github.com/acme/widget');
        expect(jobs[0].projectGithubPagesUrl).toBe('https://acme.github.io/widget');
        await waitForBake();
        await expectConsistent();
    });
});

describe('PATCH /api/resumes/:id/education/:educationKey/skills', () => {
    it('updates the entry, canonicalizes ids, creates new skills, and indexes jobIDs after the work jobs', async () => {
        await writeReactMergeScenario();
        const res = await request(app)
            .patch(`/api/resumes/${RESUME_ID}/education/phd/skills`)
            .send({ skillIDs: ['React', 'Python', 'Vision'], newSkills: ['Vision'] });
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ ok: true, skillIDs: ['react', 'python', 'Vision'] });
        const education = await readJson('education.json');
        const skills = await readJson('skills.json');
        expect(education.phd.skillIDs).toEqual(['react', 'python', 'Vision']);
        // Merged index 3 = 3 work jobs + the first education row.
        expect(skills.react.jobIDs).toEqual([2, 3]);
        expect(skills.python.jobIDs).toEqual([2, 3]);
        expect(skills.Vision).toEqual({ name: 'Vision', jobIDs: [3] });
        expect(skills['react-18'].jobIDs).toEqual([1]);
        await waitForBake();
        await expectConsistent();
    });

    it('rejects (422, nothing written) an unknown skill id that is not in newSkills', async () => {
        await writeReactMergeScenario();
        const before = await readText('education.json');
        const skillsBefore = await readText('skills.json');
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const res = await request(app)
            .patch(`/api/resumes/${RESUME_ID}/education/phd/skills`)
            .send({ skillIDs: ['react-18', 'Nope'] });
        errSpy.mockRestore();
        expect(res.status).toBe(422);
        expect(res.body.error).toMatch(/skill-id-unknown/);
        expect(res.body.findings).toEqual([expect.objectContaining({
            code: 'skill-id-unknown', severity: 'error', where: 'education.json["phd"].skillIDs[1]', details: { skillID: 'Nope' },
        })]);
        expect(await readText('education.json')).toBe(before);
        expect(await readText('skills.json')).toBe(skillsBefore);
    });

    it('404s for an unknown education key or resume and 400s without skillIDs', async () => {
        expect((await request(app).patch(`/api/resumes/${RESUME_ID}/education/phd/skills`).send({ skillIDs: [] })).status).toBe(404);
        expect((await request(app).patch('/api/resumes/missing/education/phd/skills').send({ skillIDs: [] })).status).toBe(404);
        expect((await request(app).patch(`/api/resumes/${RESUME_ID}/education/phd/skills`).send({})).status).toBe(400);
    });
});

describe('PATCH /api/resumes/:id/education and /categories (whole-file)', () => {
    it('replacing education.json re-indexes skills.jobIDs for the shifted education rows', async () => {
        await writeReactMergeScenario();
        const payload = {
            ms: { index: 0, degree: 'MS', institution: 'BYU', start: '1988/09', end: '1990/06', description: '', skillIDs: ['python'] },
            phd: { index: 1, degree: 'PhD', institution: 'MIT', start: '1990/09', end: '1996/06', description: 'Built demos in [React 18] — early.', skillIDs: ['React 18'] },
        };
        const res = await request(app).patch(`/api/resumes/${RESUME_ID}/education`).send(payload);
        expect(res.status).toBe(200);
        expect(res.body.phd.skillIDs).toEqual(['react-18']);
        const skills = await readJson('skills.json');
        expect(skills.python.jobIDs).toEqual([2, 3]);
        expect(skills['react-18'].jobIDs).toEqual([1, 4]);
        expect((await readJson('enriched-jobs.json'))).toHaveLength(5);
        await waitForBake();
        await expectConsistent();
    });

    it('replacing categories.json makes the payload authoritative for skill.categoryIDs', async () => {
        await writeReactMergeScenario();
        const first = await request(app).patch(`/api/resumes/${RESUME_ID}/categories`).send({ categories: { frontend: { name: 'Frontend', skillIDs: ['vue-3', 'React 18'] }, data: { name: 'Data', skillIDs: ['python', 'ghost'] } } });
        expect(first.status).toBe(200);
        expect(first.body).toEqual({ categories: { frontend: { name: 'Frontend', skillIDs: ['vue-3', 'react-18'] }, data: { name: 'Data', skillIDs: ['python'] } } });
        let skills = await readJson('skills.json');
        expect(skills['react-18'].categoryIDs).toEqual(['frontend']);
        expect(skills.python.categoryIDs).toEqual(['data']);
        await expectConsistent();

        // Dropping a membership sticks: additive sync does not re-add it from the stale categoryIDs.
        const second = await request(app).patch(`/api/resumes/${RESUME_ID}/categories`).send({ categories: { frontend: { name: 'Frontend', skillIDs: ['vue-3'] } } });
        expect(second.status).toBe(200);
        skills = await readJson('skills.json');
        expect(skills['react-18'].categoryIDs).toEqual([]);
        expect(skills.python.categoryIDs).toEqual([]);
        expect(await readJson('categories.json')).toEqual({ frontend: { name: 'Frontend', skillIDs: ['vue-3'] } });
        await waitForBake();
        await expectConsistent();
    });

    it('validates payloads and 404s for a missing resume', async () => {
        expect((await request(app).patch(`/api/resumes/${RESUME_ID}/education`).send([])).status).toBe(400);
        expect((await request(app).patch(`/api/resumes/${RESUME_ID}/categories`).send({})).status).toBe(400);
        expect((await request(app).patch('/api/resumes/missing/categories').send({ categories: {} })).status).toBe(404);
    });
});

describe('GET /api/skills/:slug/info', () => {
    it('rejects malformed slugs before touching the model', async () => {
        const res = await request(app).get('/api/skills/Bad%20Slug/info');
        expect(res.status).toBe(400);
        expect(anthropicLlm.callAnthropicMessages).not.toHaveBeenCalled();
    });

    it('returns 503 when no API key is configured', async () => {
        anthropicEnv.getAnthropicApiKey.mockReturnValue('');
        const res = await request(app).get('/api/skills/kafka/info');
        expect(res.status).toBe(503);
        expect(anthropicLlm.callAnthropicMessages).not.toHaveBeenCalled();
    });

    it('calls the model once and serves the cached summary afterwards', async () => {
        anthropicEnv.getAnthropicApiKey.mockReturnValue('sk-test');
        const first = await request(app).get('/api/skills/pgvector/info');
        expect(first.status).toBe(200);
        expect(first.body).toEqual({ slug: 'pgvector', summary: 'A mocked summary.', cached: false });
        expect(anthropicLlm.callAnthropicMessages).toHaveBeenCalledTimes(1);
        expect(anthropicLlm.callAnthropicMessages.mock.calls[0][0]).toMatchObject({ model: 'test-model', maxTokens: 300 });

        const second = await request(app).get('/api/skills/pgvector/info');
        expect(second.body).toEqual({ slug: 'pgvector', summary: 'A mocked summary.', cached: true });
        expect(anthropicLlm.callAnthropicMessages).toHaveBeenCalledTimes(1);
    });

    it('reports a model failure as 502', async () => {
        anthropicEnv.getAnthropicApiKey.mockReturnValue('sk-test');
        anthropicLlm.callAnthropicMessages.mockRejectedValueOnce(new Error('upstream down'));
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        errorReporting.reportError.mockClear();
        const res = await request(app).get('/api/skills/airflow/info');
        expect(res.status).toBe(502);
        expect(res.body.error).toBe('upstream down');
        expect(errorReporting.reportError).toHaveBeenCalledWith(expect.any(Error), '[skill-info]', expect.stringContaining('Responding 502'));
        errSpy.mockRestore();
    });
});
