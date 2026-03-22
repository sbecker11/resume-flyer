import { describe, it, expect } from 'vitest';
import { resolvePaletteCatalogS3Url } from './paletteCatalogS3Url.mjs';

describe('resolvePaletteCatalogS3Url', () => {
    it('returns full URL when S3_COLOR_PALETTES_JSON_URL is set (CPM-ts style)', () => {
        const url = resolvePaletteCatalogS3Url({
            S3_COLOR_PALETTES_JSON_URL: '  https://bucket.s3.us-west-1.amazonaws.com/metadata/color_palettes.jsonl  ',
            S3_BUCKET: 'ignored',
            S3_REGION: 'ignored',
            S3_COLOR_PALETTES_OBJECT_KEY: 'ignored',
        });
        expect(url).toBe('https://bucket.s3.us-west-1.amazonaws.com/metadata/color_palettes.jsonl');
    });

    it('builds URL from bucket + region + object key (matches palettesCatalog.test.ts S3_URL)', () => {
        const url = resolvePaletteCatalogS3Url({
            S3_BUCKET: 'sbecker11-color-palette-images',
            S3_REGION: 'us-west-1',
            S3_COLOR_PALETTES_OBJECT_KEY: 'metadata/color_palettes.jsonl',
        });
        expect(url).toBe(
            'https://sbecker11-color-palette-images.s3.us-west-1.amazonaws.com/metadata/color_palettes.jsonl'
        );
    });

    it('strips leading slashes from object key', () => {
        expect(
            resolvePaletteCatalogS3Url({
                S3_BUCKET: 'b',
                S3_REGION: 'us-east-1',
                S3_COLOR_PALETTES_OBJECT_KEY: '/path/to/file.jsonl',
            })
        ).toBe('https://b.s3.us-east-1.amazonaws.com/path/to/file.jsonl');
    });

    it('returns empty string when nothing configured', () => {
        expect(resolvePaletteCatalogS3Url({})).toBe('');
    });

    it('returns empty when bucket/region/key incomplete', () => {
        expect(resolvePaletteCatalogS3Url({ S3_BUCKET: 'x', S3_REGION: 'y' })).toBe('');
    });
});
