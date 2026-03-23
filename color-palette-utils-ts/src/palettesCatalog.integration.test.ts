/**
 * Integration test: fetches from real S3 using S3_COLOR_PALETTES_JSON_URL.
 * Reads from .env.example in this package. FAIL FAST if URL is missing or wrong.
 */
import { config } from 'dotenv';
import { resolve } from 'path';
import { describe, it, expect, beforeAll } from 'vitest';
import {
  fetchColorPalettesFromS3,
  type ColorPaletteRecord,
} from './palettesCatalog.js';

// Load .env.example from package dir only (runs in isolation)
beforeAll(() => {
  config({ path: resolve(process.cwd(), '.env.example') });
});

describe('fetchColorPalettesFromS3 (integration)', () => {
  it('fetches from S3, returns ColorPaletteRecord[], outputs each record fields', async () => {
    const url = process.env.S3_COLOR_PALETTES_JSON_URL?.trim();
    if (!url) {
      throw new Error('S3_COLOR_PALETTES_JSON_URL is missing or empty in .env.example');
    }

    const palettes: ColorPaletteRecord[] = await fetchColorPalettesFromS3();

    expect(Array.isArray(palettes)).toBe(true);
    expect(palettes.length).toBeGreaterThan(0);

    for (const rec of palettes) {
      expect(rec && typeof rec === 'object' && !Array.isArray(rec)).toBe(true);
      console.log(JSON.stringify(rec, null, 2));
    }
  });
});
