import fs from 'fs/promises';
import path from 'path';

const projectRoot = process.cwd();
const parsedResumesDir = process.env.PARSED_RESUMES_DIR || path.join(projectRoot, 'parsed_resumes');

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function readJson(p) {
  const content = await fs.readFile(p, 'utf8');
  return JSON.parse(content);
}

async function main() {
  // In CI / GitHub Pages builds, parsed_resumes/ may not exist (it can be local-only).
  // In that case, create it and emit an empty index.json so the static site still builds.
  if (!(await exists(parsedResumesDir))) {
    await fs.mkdir(parsedResumesDir, { recursive: true });
  }

  const entries = await fs.readdir(parsedResumesDir, { withFileTypes: true });
  const resumes = [];

  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const id = ent.name;
    if (id.startsWith('.')) continue;

    const dir = path.join(parsedResumesDir, id);
    const metaPath = path.join(dir, 'meta.json');
    const jobsPath = path.join(dir, 'jobs.json');
    const skillsPath = path.join(dir, 'skills.json');

    if (!(await exists(jobsPath))) continue;

    let meta = {};
    if (await exists(metaPath)) {
      try {
        meta = await readJson(metaPath);
      } catch {
        meta = {};
      }
    }

    let jobCount = null;
    try {
      const jobs = await readJson(jobsPath);
      jobCount = Array.isArray(jobs) ? jobs.length : Object.keys(jobs || {}).length;
    } catch {
      jobCount = null;
    }

    let skillCount = null;
    if (await exists(skillsPath)) {
      try {
        const skills = await readJson(skillsPath);
        skillCount = Object.keys(skills || {}).length;
      } catch {
        skillCount = null;
      }
    }

    const displayName =
      meta.displayName ||
      meta.name ||
      id;

    resumes.push({
      id,
      displayName,
      fileName: meta.fileName,
      createdAt: meta.createdAt,
      jobCount,
      skillCount,
    });
  }

  resumes.sort((a, b) => String(a.displayName).localeCompare(String(b.displayName)));
  const out = { resumes, generatedAt: new Date().toISOString() };
  const outPath = path.join(parsedResumesDir, 'index.json');
  await fs.writeFile(outPath, JSON.stringify(out, null, 2) + '\n', 'utf8');
  console.log(`[generate-parsed-resumes-index] Wrote ${resumes.length} resumes to ${outPath}`);
}

main().catch((e) => {
  console.error('[generate-parsed-resumes-index] Failed:', e);
  process.exitCode = 1;
});

