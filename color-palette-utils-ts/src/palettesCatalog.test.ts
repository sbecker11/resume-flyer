import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseColorPalette,
  fetchColorPalettesJsonl,
  getColorPalettesS3Url,
  fetchColorPalettesFromS3,
  type ColorPaletteRecord,
} from './palettesCatalog.js';

const S3_URL = 'https://sbecker11-color-palette-images.s3.us-west-1.amazonaws.com/metadata/color_palettes.jsonl';

function stubS3UrlEnv(url: string | null) {
  const meta = import.meta as { env?: Record<string, string | undefined> };
  if (!meta.env) meta.env = {};
  if (url !== null) meta.env.S3_COLOR_PALETTES_JSON_URL = url;
  else delete meta.env.S3_COLOR_PALETTES_JSON_URL;
}

describe('parseColorPalette', () => {
  it('returns empty array for null, undefined, empty string, whitespace', () => {
    expect(parseColorPalette(null)).toEqual([]);
    expect(parseColorPalette(undefined)).toEqual([]);
    expect(parseColorPalette('')).toEqual([]);
    expect(parseColorPalette('   \n  \t  ')).toEqual([]);
  });

  it('parses a single line', () => {
    expect(parseColorPalette('{"paletteName":"A","colorPalette":["#111"]}')).toEqual([
      { paletteName: 'A', colorPalette: ['#111'] },
    ]);
  });

  it('parses multiple lines', () => {
    const text = '{"a":1}\n{"b":2}\n';
    expect(parseColorPalette(text)).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it('ignores blank lines between records', () => {
    const text = '{"x":1}\n\n{"y":2}';
    expect(parseColorPalette(text)).toEqual([{ x: 1 }, { y: 2 }]);
  });

  it('throws with line number on invalid JSON', () => {
    expect(() => parseColorPalette('not-json')).toThrow(/line 1/);
    expect(() => parseColorPalette('{"ok":true}\nnot-json')).toThrow(/line 2/);
  });

  it('rejects non-object JSON on a line', () => {
    expect(() => parseColorPalette('[1,2]')).toThrow(/line 1/);
  });
});

describe('fetchColorPalettesJsonl', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('returns parsed records on 200', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: () => Promise.resolve('{"n":1}\n{"n":2}\n'),
    });

    const out = await fetchColorPalettesJsonl('https://example.com/p.jsonl');

    expect(out).toEqual([{ n: 1 }, { n: 2 }]);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://example.com/p.jsonl',
      expect.objectContaining({ method: 'GET', cache: 'no-store' })
    );
  });

  it('throws when response is not ok', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: () => Promise.resolve(''),
    });

    await expect(fetchColorPalettesJsonl('https://example.com/missing')).rejects.toThrow(
      /404 Not Found/
    );
  });

  it('merges custom fetch init', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: () => Promise.resolve('{}\n'),
    });

    await fetchColorPalettesJsonl('https://x', { headers: { 'X-Test': '1' } });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://x',
      expect.objectContaining({
        method: 'GET',
        headers: { 'X-Test': '1' },
      })
    );
  });
});

describe('getColorPalettesS3Url', () => {
  afterEach(() => stubS3UrlEnv(null));

  it('returns null when S3_COLOR_PALETTES_JSON_URL is not set', () => {
    stubS3UrlEnv(null);
    expect(getColorPalettesS3Url()).toBeNull();
  });

  it('returns S3_COLOR_PALETTES_JSON_URL from env', () => {
    stubS3UrlEnv('  https://cdn.example/p.jsonl  ');
    expect(getColorPalettesS3Url()).toBe('https://cdn.example/p.jsonl');
  });
});

describe('fetchColorPalettesFromS3', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    stubS3UrlEnv(null);
    vi.restoreAllMocks();
  });

  it('fetches using S3_COLOR_PALETTES_JSON_URL from env, returns ColorPaletteRecord[], outputs each record fields', async () => {
    const ndjson =
      '{"paletteName":"jungle","colorPalette":["#81a936","#56831c"],"imagePublicUrl":"https://example.com/a.jpeg","backgroundSwatchIndex":0}\n' +
      '{"paletteName":"snow","colorPalette":["#fff","#ccc"],"imagePublicUrl":"https://example.com/b.jpeg"}';

    stubS3UrlEnv(S3_URL);
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: () => Promise.resolve(ndjson),
    });

    const palettes: ColorPaletteRecord[] = await fetchColorPalettesFromS3();

    expect(Array.isArray(palettes)).toBe(true);
    expect(palettes).toHaveLength(2);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      S3_URL,
      expect.objectContaining({ method: 'GET' })
    );

    for (const rec of palettes) {
      expect(rec && typeof rec === 'object' && !Array.isArray(rec)).toBe(true);
      // Output internal fields for each ColorPaletteRecord
      console.log(JSON.stringify(rec, null, 2));
    }
  });

  it('throws when S3_COLOR_PALETTES_JSON_URL is not set', async () => {
    stubS3UrlEnv(null);
    await expect(fetchColorPalettesFromS3()).rejects.toThrow(/No palette JSONL URL/);
  });
});
