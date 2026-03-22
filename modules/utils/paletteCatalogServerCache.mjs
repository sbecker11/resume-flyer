/**
 * In-memory S3 palette catalog for the Node server. Refreshed on process startup and when
 * GET /api/palette-catalog receives X-Palette-Catalog-Refresh: 1 (browser hard reload).
 */
import fetch from 'node-fetch';
import { parsePaletteBundleFromImageMetadataJsonl } from './paletteBundleFromImageMetadata.mjs';
import { resolvePaletteCatalogS3UrlFromRecord } from './paletteCatalogS3Url.mjs';
import { assertValidPaletteCatalogBundle } from './paletteCatalogValidate.mjs';
import { reportError } from './errorReporting.mjs';
import { complainLoudlyPaletteS3Failure } from './paletteS3LoudError.mjs';

/** @type {{ version: number, palettes: unknown[] } | null} */
let cachedBundle = null;

/** @type {string} */
let lastFetchedUrl = '';

/**
 * Fetch catalog from S3, validate, replace in-memory cache. Throws on any failure.
 */
export async function refreshPaletteCatalogCache() {
    try {
        const s3Url = resolvePaletteCatalogS3UrlFromRecord(process.env);
        if (!s3Url) {
            throw new Error(
                'S3 catalog URL not configured (S3_COLOR_PALETTES_JSON_URL or S3_IMAGES_BUCKET + AWS_REGION/S3_REGION + S3_PALETTES_JSONL_KEY)'
            );
        }

        const res = await fetch(s3Url, { method: 'GET', cache: 'no-store' });
        if (!res.ok) {
            throw new Error(`S3 catalog HTTP ${res.status} ${res.statusText} (${s3Url})`);
        }

        const raw = await res.text();
        const bundle = parsePaletteBundleFromImageMetadataJsonl(raw);
        assertValidPaletteCatalogBundle(bundle);

        cachedBundle = bundle;
        lastFetchedUrl = s3Url;
        return bundle;
    } catch (e) {
        complainLoudlyPaletteS3Failure('[paletteCatalogServerCache] refreshPaletteCatalogCache — S3 fetch/parse/validate failed', e);
        reportError(
            e,
            '[paletteCatalogServerCache] Cannot load palette catalog from S3',
            'No remedy: fix S3 URL, credentials/bucket policy, or NDJSON content; then restart the server'
        );
        throw e;
    }
}

/**
 * @returns {NonNullable<typeof cachedBundle>}
 */
export function getCachedPaletteCatalogBundle() {
    if (!cachedBundle) {
        const err = new Error('Catalog cache is empty (server warmup did not run or failed)');
        complainLoudlyPaletteS3Failure('[paletteCatalogServerCache] getCachedPaletteCatalogBundle — cache empty', err);
        reportError(err, '[paletteCatalogServerCache] No palette catalog in memory');
        throw err;
    }
    return cachedBundle;
}

export function getLastPaletteCatalogSourceUrl() {
    return lastFetchedUrl;
}

export function hasPaletteCatalogCache() {
    return cachedBundle != null;
}
