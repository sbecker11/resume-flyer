import { normalizePaletteColors, hexToRgb } from './resumeFlockPaletteColors.mjs';

/**
 * Fast-fail validation for palette catalog bundle (S3 NDJSON → parsePaletteBundleFromImageMetadataJsonl).
 * Mutates `bundle.palettes[].colors` via {@link normalizePaletteColors}.
 *
 * @param {{ version?: number, palettes?: Array<{ name: string, colors: string[] }> }} bundle
 * @throws {Error} if structure or any swatch hex is invalid
 */
export function assertValidPaletteCatalogBundle(bundle) {
    if (!bundle || bundle.version !== 2 || !Array.isArray(bundle.palettes) || bundle.palettes.length === 0) {
        throw new Error(
            '[paletteCatalogValidate] Invalid catalog bundle (expected { version: 2, palettes: non-empty array })'
        );
    }

    for (const p of bundle.palettes) {
        if (!p || typeof p.name !== 'string' || !Array.isArray(p.colors)) {
            throw new Error('[paletteCatalogValidate] Invalid palette entry in bundle');
        }
        normalizePaletteColors(p.colors);
    }

    for (const p of bundle.palettes) {
        for (let i = 0; i < p.colors.length; i++) {
            if (!hexToRgb(p.colors[i])) {
                throw new Error(
                    `[paletteCatalogValidate] Invalid hex in palette "${p.name}" at index ${i}: "${p.colors[i]}"`
                );
            }
        }
    }
}
