/**
 * Resolve the public HTTPS URL for the palette catalog NDJSON.
 *
 * Matches color-palette-utils-ts conventions (README-ts.md, palettesCatalog.test.ts):
 * - Full URL: `S3_COLOR_PALETTES_JSON_URL`
 *   e.g. `https://sbecker11-color-palette-images.s3.us-west-1.amazonaws.com/metadata/color_palettes.jsonl`
 * - Or compose virtual-hosted–style URL from bucket + region + object key (same example decomposes to):
 *   - bucket: `sbecker11-color-palette-images`
 *   - region: `us-west-1`
 *   - key: `metadata/color_palettes.jsonl`
 *
 * Priority: explicit URL wins; else bucket + region + key.
 *
 * @param {Record<string, string | undefined>} [env] - defaults to `import.meta.env` in Vite
 * @returns {string} trimmed URL or '' if not configured
 */
export function resolvePaletteCatalogS3Url(env) {
    const e =
        env ??
        (typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {});

    const full = typeof e.S3_COLOR_PALETTES_JSON_URL === 'string' ? e.S3_COLOR_PALETTES_JSON_URL.trim() : '';
    if (full) return full;

    const bucket = typeof e.S3_BUCKET === 'string' ? e.S3_BUCKET.trim() : '';
    const region = typeof e.S3_REGION === 'string' ? e.S3_REGION.trim() : '';
    const objectKey = typeof e.S3_COLOR_PALETTES_OBJECT_KEY === 'string' ? e.S3_COLOR_PALETTES_OBJECT_KEY.trim() : '';

    if (bucket && region && objectKey) {
        const key = objectKey.replace(/^\/+/, '');
        return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
    }

    return '';
}
