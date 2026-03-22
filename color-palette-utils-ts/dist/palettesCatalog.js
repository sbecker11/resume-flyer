/**
 * Fetch and parse public palette catalog (NDJSON from S3).
 * Same line format as color_palettes.jsonl.
 */
function isNonEmptyString(v) {
    return typeof v === 'string' && v.trim().length > 0;
}
/**
 * Parse newline-delimited JSON (one JSON object per line).
 */
export function parseColorPalette(jsonString) {
    if (jsonString == null || String(jsonString).trim() === '')
        return [];
    return String(jsonString)
        .trim()
        .split('\n')
        .filter((line) => line.length > 0)
        .map((line, index) => {
        try {
            const value = JSON.parse(line);
            if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
                return value;
            }
            throw new Error('Expected a JSON object per line');
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            const err = new Error(`Invalid JSON on NDJSON line ${index + 1}: ${msg}`);
            if (e instanceof Error)
                err.cause = e;
            throw err;
        }
    });
}
/**
 * GET a URL and return parsed palette records.
 */
export async function fetchColorPalettesJsonl(url, init = {}) {
    const res = await fetch(url, {
        ...init,
        method: 'GET',
        cache: init.cache ?? 'no-store',
    });
    if (!res.ok) {
        throw new Error(`Palettes JSONL fetch failed: ${res.status} ${res.statusText} (${url})`);
    }
    const text = await res.text();
    return parseColorPalette(text);
}
function readVitePalettesUrl() {
    try {
        const env = import.meta.env;
        const u = env?.S3_COLOR_PALETTES_JSON_URL ?? process.env?.S3_COLOR_PALETTES_JSON_URL;
        if (isNonEmptyString(u))
            return u.trim();
    }
    catch {
        /* non-Vite bundle */
    }
    return null;
}
/**
 * Returns catalog URL from `import.meta.env.S3_COLOR_PALETTES_JSON_URL` (.env file).
 */
export function getColorPalettesS3Url() {
    return readVitePalettesUrl();
}
/**
 * Fetch catalog using {@link getColorPalettesS3Url}.
 */
export async function fetchColorPalettesFromS3() {
    const url = getColorPalettesS3Url();
    if (!url) {
        throw new Error('No palette JSONL URL: set S3_COLOR_PALETTES_JSON_URL in .env');
    }
    return fetchColorPalettesJsonl(url);
}
