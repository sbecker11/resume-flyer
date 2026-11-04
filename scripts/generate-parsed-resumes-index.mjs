import path from 'path';
import { writeParsedResumesIndex } from '../modules/server/parsedResumesIndex.mjs';

const projectRoot = process.cwd();
const parsedResumesDir = process.env.PARSED_RESUMES_DIR || path.join(projectRoot, 'parsed_resumes');

async function main() {
  // In CI / GitHub Pages builds, parsed_resumes/ may not exist (it can be local-only);
  // buildParsedResumesIndex creates it and emits an empty index so the static site still builds.
  const { outPath, index } = await writeParsedResumesIndex(parsedResumesDir);
  console.log(`[generate-parsed-resumes-index] Wrote ${index.resumes.length} resumes to ${outPath}`);
}

main().catch((e) => {
  console.error('[generate-parsed-resumes-index] Failed:', e);
  process.exitCode = 1;
});
