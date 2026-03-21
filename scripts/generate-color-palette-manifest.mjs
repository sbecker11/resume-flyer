/**
 * Validates static_content/color_palettes.jsonl (palette source of truth).
 * Previously generated static_content/colorPalettes/manifest.json — that folder is removed.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parsePaletteBundleFromImageMetadataJsonl } from '../modules/utils/paletteBundleFromImageMetadata.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const jsonlPath = path.join(projectRoot, 'static_content', 'color_palettes.jsonl');

try {
    const raw = fs.readFileSync(jsonlPath, 'utf8');
    const bundle = parsePaletteBundleFromImageMetadataJsonl(raw);
    console.log(
        `[validate-color-palettes] OK — ${bundle.palettes.length} palette(s) in color_palettes.jsonl`
    );
} catch (e) {
    console.error('[validate-color-palettes] Failed:', e);
    process.exit(1);
}
