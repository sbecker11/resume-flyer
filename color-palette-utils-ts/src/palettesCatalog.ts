/**
 * Fetch and parse public palette catalog (NDJSON from S3).
 * Same line format as color_palettes.jsonl.
 */

/**
 * One color palette record (one line in the jsonl catalog).
 * Structure: paletteName, colorPalette, imagePublicUrl, backgroundSwatchIndex — see README-ts.md.
 */
export type ColorPaletteRecord = Record<string, unknown>;

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * Parse newline-delimited JSON (one JSON object per line).
 */
export function parseColorPalette(jsonString: string | null | undefined): ColorPaletteRecord[] {
  if (jsonString == null || String(jsonString).trim() === '') return [];
  return String(jsonString)
    .trim()
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line, index) => {
      try {
        const value: unknown = JSON.parse(line);
        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
          return value as ColorPaletteRecord;
        }
        throw new Error('Expected a JSON object per line');
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const err = new Error(`Invalid JSON on NDJSON line ${index + 1}: ${msg}`);
        if (e instanceof Error) (err as Error & { cause?: unknown }).cause = e;
        throw err;
      }
    });
}

/**
 * GET a URL and return parsed palette records.
 */
export async function fetchColorPalettesJsonl(
  url: string,
  init: RequestInit = {}
): Promise<ColorPaletteRecord[]> {
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

function readVitePalettesUrl(): string | null {
  try {
    const env = (import.meta as { env?: Record<string, string | undefined> }).env;
    const u = env?.S3_COLOR_PALETTES_JSON_URL ?? process.env?.S3_COLOR_PALETTES_JSON_URL;
    if (isNonEmptyString(u)) return u.trim();
  } catch {
    /* non-Vite bundle */
  }
  return null;
}

/**
 * Returns catalog URL from `import.meta.env.S3_COLOR_PALETTES_JSON_URL` (.env file).
 */
export function getColorPalettesS3Url(): string | null {
  return readVitePalettesUrl();
}

/**
 * Fetch catalog using {@link getColorPalettesS3Url}.
 */
export async function fetchColorPalettesFromS3(): Promise<ColorPaletteRecord[]> {
  const url = getColorPalettesS3Url();
  if (!url) {
    throw new Error(
      'No palette JSONL URL: set S3_COLOR_PALETTES_JSON_URL in .env'
    );
  }
  return fetchColorPalettesJsonl(url);
}
