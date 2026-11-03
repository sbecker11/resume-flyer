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

vi.mock('../utils/anthropicEnv.mjs', () => ({
    getAnthropicApiKey: vi.fn(() => ''),
    getSkillInfoModel: vi.fn(() => 'test-model'),
    getParserSpawnEnv: vi.fn(() => ({})),
}));
vi.mock('../utils/anthropicLlm.mjs', () => ({
    callAnthropicMessages: vi.fn(async () => 'A mocked summary.'),
}));

const PROJECT_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');

let tmpRoot;
let parsedDir;
let app;
let anthropicEnv;
let anthropicLlm;

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

/** bakeEnrichedJobs is fire-and-forget; rm can race it. Retry until the folder is gone. */
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

/** bakeEnrichedJobs runs fire-and-forget; wait for it so temp cleanup does not race it. */
async function waitForBake() {
    const p = path.join(parsedDir, RESUME_ID, 'enriched-jobs.json');
    await vi.waitFor(async () => { await fs.access(p); }, { timeout: 2000 });
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
    it('updates the job, creates new skills, and syncs skills.jobIDs both ways', async () => {
        const res = await request(app)
            .patch(`/api/resumes/${RESUME_ID}/jobs/0/skills`)
            .send({ skillIDs: ['vue-3', 'Kafka'], newSkills: ['Kafka', '  ', { name: 'Ignored?' }] });
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ ok: true, skillIDs: ['vue-3', 'Kafka'] });

        const jobs = await readJson('jobs.json');
        const skills = await readJson('skills.json');
        expect(jobs[0].skillIDs).toEqual(['vue-3', 'Kafka']);
        expect(skills.Kafka).toEqual({ name: 'Kafka', jobIDs: [0] });
        expect(skills['Ignored?']).toEqual({ name: 'Ignored?', jobIDs: [] });
        // Express lost job 0 but still has job 1.
        expect(skills.Express.jobIDs).toEqual([1]);
        await waitForBake();
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
        expect(jobs[0].Description).not.toContain('[Express]');
        await waitForBake();
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
    });

    it('inserts at the front when afterIndex is -1 or omitted, clamping to the array', async () => {
        const front = await request(app).post(`/api/resumes/${RESUME_ID}/jobs`).send({ afterIndex: -1 });
        expect(front.body.insertIndex).toBe(0);
        // 3 fixture jobs + the front insert = 4; an out-of-range afterIndex clamps to the end.
        const far = await request(app).post(`/api/resumes/${RESUME_ID}/jobs`).send({ afterIndex: 99 });
        expect(far.body.insertIndex).toBe(4);
        expect((await request(app).post('/api/resumes/missing/jobs').send({})).status).toBe(404);
        await waitForBake();
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
    });

    it('validates the job index', async () => {
        expect((await request(app).delete(`/api/resumes/${RESUME_ID}/jobs/abc`)).status).toBe(400);
        expect((await request(app).delete(`/api/resumes/${RESUME_ID}/jobs/42`)).status).toBe(404);
        expect((await request(app).delete('/api/resumes/missing/jobs/0')).status).toBe(404);
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
        const res = await request(app).get('/api/skills/airflow/info');
        expect(res.status).toBe(502);
        expect(res.body.error).toBe('upstream down');
        expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('[skill-info] Failed to fetch from Anthropic'), expect.any(Error));
        errSpy.mockRestore();
    });
});
