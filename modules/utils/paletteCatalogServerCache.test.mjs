import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock S3 / NDJSON dependencies so we can deterministically exercise cache logic.
vi.mock('node-fetch', () => ({ default: vi.fn() }));
vi.mock('./paletteBundleFromImageMetadata.mjs', () => ({
    parsePaletteBundleFromImageMetadataJsonl: vi.fn()
}));
vi.mock('./paletteCatalogS3Url.mjs', () => ({
    resolvePaletteCatalogS3UrlFromRecord: vi.fn()
}));

import fetch from 'node-fetch';
import { parsePaletteBundleFromImageMetadataJsonl } from './paletteBundleFromImageMetadata.mjs';
import { resolvePaletteCatalogS3UrlFromRecord } from './paletteCatalogS3Url.mjs';

describe('paletteCatalogServerCache', () => {
    let consoleErrorSpy;

    beforeEach(() => {
        vi.resetModules();
        fetch.mockReset();
        parsePaletteBundleFromImageMetadataJsonl.mockReset();
        resolvePaletteCatalogS3UrlFromRecord.mockReset();
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('primePaletteCatalogCacheFromBundle validates and synthesizes filename/key', async () => {
        const { primePaletteCatalogCacheFromBundle, getCachedPaletteCatalogBundle, getLastPaletteCatalogSourceUrl, hasPaletteCatalogCache } =
            await import('./paletteCatalogServerCache.mjs');

        const bundle = {
            version: 2,
            palettes: [
                { name: 'Test Palette', colors: ['#ffffff', '#000000'] }
            ]
        };

        primePaletteCatalogCacheFromBundle(bundle, 'local-test');

        expect(hasPaletteCatalogCache()).toBe(true);
        expect(getLastPaletteCatalogSourceUrl()).toBe('local-test');

        const cached = getCachedPaletteCatalogBundle();
        expect(cached.palettes[0].filename).toBe('test-palette.json');
        expect(cached.palettes[0].key).toBe('test-palette.json');
    });

    it('primePaletteCatalogCacheFromBundle throws on invalid bundle', async () => {
        const { primePaletteCatalogCacheFromBundle } = await import('./paletteCatalogServerCache.mjs');

        expect(() =>
            primePaletteCatalogCacheFromBundle({ version: 1, palettes: [] }, 'local')
        ).toThrow(/\[paletteCatalogValidate\] Invalid catalog bundle/);
    });

    it('getCachedPaletteCatalogBundle throws and loudly logs when cache is empty', async () => {
        const { getCachedPaletteCatalogBundle } = await import('./paletteCatalogServerCache.mjs');

        expect(() => getCachedPaletteCatalogBundle()).toThrow(/Catalog cache is empty/);
        expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('refreshPaletteCatalogCache loads from S3, validates, and replaces cached bundle', async () => {
        const s3Url = 'https://s3.example.com/catalog.jsonl';
        const bundle = {
            version: 2,
            palettes: [
                { name: 'S3 Palette', colors: ['#ffffff', '#000000'] }
            ]
        };

        resolvePaletteCatalogS3UrlFromRecord.mockReturnValue(s3Url);
        fetch.mockResolvedValue({
            ok: true,
            status: 200,
            statusText: 'OK',
            text: async () => 'raw-ndjson'
        });
        parsePaletteBundleFromImageMetadataJsonl.mockReturnValue(bundle);

        const {
            refreshPaletteCatalogCache,
            hasPaletteCatalogCache,
            getCachedPaletteCatalogBundle
        } = await import('./paletteCatalogServerCache.mjs');

        const refreshed = await refreshPaletteCatalogCache();
        expect(refreshed.palettes[0].filename).toBe('s3-palette.json');
        expect(hasPaletteCatalogCache()).toBe(true);

        const cached = getCachedPaletteCatalogBundle();
        expect(cached.palettes[0].key).toBe('s3-palette.json');
    });

    it('refreshPaletteCatalogCache throws loudly when S3 URL is not configured', async () => {
        resolvePaletteCatalogS3UrlFromRecord.mockReturnValue('');

        const { refreshPaletteCatalogCache } = await import('./paletteCatalogServerCache.mjs');

        await expect(refreshPaletteCatalogCache()).rejects.toThrow('S3 catalog URL not configured');
        expect(consoleErrorSpy).toHaveBeenCalled();
    });
});

