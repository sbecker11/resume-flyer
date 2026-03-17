import fs from 'fs/promises';
import path from 'path';

const projectRoot = process.cwd();
const parsedResumesDir = process.env.PARSED_RESUMES_DIR || path.join(projectRoot, 'parsed_resumes');

const PUBLIC_FOLDER = 'shawn-becker-full-stack-developer-ai-ml-engineer';
const PREFIX = '_local-';

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function readJson(p) {
  return JSON.parse(await fs.readFile(p, 'utf8'));
}

async function writeJson(p, data) {
  await fs.writeFile(p, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

async function main() {
  if (!(await exists(parsedResumesDir))) {
    console.log(`[prefix-local-resume-folders] parsed_resumes not found at ${parsedResumesDir}; nothing to do.`);
    return;
  }

  const entries = await fs.readdir(parsedResumesDir, { withFileTypes: true });
  const renames = [];

  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const name = ent.name;
    if (name.startsWith('.')) continue;
    if (name === PUBLIC_FOLDER) continue;
    if (name.startsWith(PREFIX)) continue;

    const from = path.join(parsedResumesDir, name);
    const toName = `${PREFIX}${name}`;
    const to = path.join(parsedResumesDir, toName);
    if (await exists(to)) {
      console.warn(`[prefix-local-resume-folders] Skip rename; target exists: ${toName}`);
      continue;
    }

    await fs.rename(from, to);
    renames.push({ from: name, to: toName });

    const metaPath = path.join(to, 'meta.json');
    if (await exists(metaPath)) {
      try {
        const meta = await readJson(metaPath);
        meta.id = toName;
        await writeJson(metaPath, meta);
      } catch (e) {
        console.warn(`[prefix-local-resume-folders] Failed to update meta.json for ${toName}: ${e?.message || e}`);
      }
    }
  }

  console.log(`[prefix-local-resume-folders] Renamed ${renames.length} folders:`);
  for (const r of renames) {
    console.log(`- ${r.from} -> ${r.to}`);
  }
}

main().catch((e) => {
  console.error('[prefix-local-resume-folders] Failed:', e);
  process.exitCode = 1;
});

