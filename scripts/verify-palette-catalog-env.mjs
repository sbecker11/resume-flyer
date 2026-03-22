/**
 * CI helper: ensure palette catalog URL can be resolved from process.env.
 * Never prints secret values — only which keys are set vs missing.
 */
import { resolvePaletteCatalogS3UrlFromRecord } from '../modules/utils/paletteCatalogS3Url.mjs';

const KEYS = [
    'S3_COLOR_PALETTES_JSON_URL',
    'S3_IMAGES_BUCKET',
    'AWS_REGION',
    'S3_PALETTES_JSONL_KEY',
    'S3_BUCKET',
    'S3_REGION',
    'S3_COLOR_PALETTES_OBJECT_KEY',
];

function keyStatus(name) {
    const v = process.env[name];
    if (v == null || String(v).trim() === '') return 'missing';
    return 'set';
}

const url = resolvePaletteCatalogS3UrlFromRecord(process.env);
if (url) {
    console.log('Palette catalog URL OK for build (length', url.length, ')');
    process.exit(0);
}

console.error('No palette catalog URL from env. Need one of these bundles:');
console.error('  • S3_COLOR_PALETTES_JSON_URL');
console.error('  • S3_IMAGES_BUCKET + AWS_REGION + S3_PALETTES_JSONL_KEY');
console.error('  • S3_BUCKET + S3_REGION + S3_COLOR_PALETTES_OBJECT_KEY');
console.error('');
console.error('Diagnostics (names only, never values):');
for (const k of KEYS) {
    console.error(`  ${k}: ${keyStatus(k)}`);
}
console.error('');
console.error('Where to add them:');
console.error('  1) Repo → Settings → Secrets and variables → Actions → Repository secrets (recommended), OR');
console.error('  2) Same names under Settings → Environments → github-pages (this workflow attaches the build job to that environment so those secrets are visible).');
console.error('See .env.example.');
process.exit(1);
