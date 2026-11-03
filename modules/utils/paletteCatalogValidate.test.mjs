import { describe, expect, it } from 'vitest';
import { assertValidPaletteCatalogBundle } from './paletteCatalogValidate.mjs';

function bundle(palettes) {
    return { version: 2, palettes };
}

describe('assertValidPaletteCatalogBundle', () => {
    it('accepts a v2 bundle and normalizes swatch hex in place', () => {
        const b = bundle([{ name: 'Ocean', colors: ['006688', '#FFFFFF', '#abc'] }]);
        expect(() => assertValidPaletteCatalogBundle(b)).not.toThrow();
        expect(b.palettes[0].colors).toEqual(['#006688', '#ffffff', '#aabbcc']);
    });

    it('rejects a missing, wrong-version, or empty bundle', () => {
        expect(() => assertValidPaletteCatalogBundle(null)).toThrow(/Invalid catalog bundle/);
        expect(() => assertValidPaletteCatalogBundle({ version: 1, palettes: [{ name: 'x', colors: ['#000000'] }] }))
            .toThrow(/Invalid catalog bundle/);
        expect(() => assertValidPaletteCatalogBundle({ version: 2, palettes: [] })).toThrow(/Invalid catalog bundle/);
        expect(() => assertValidPaletteCatalogBundle({ version: 2, palettes: 'nope' })).toThrow(/Invalid catalog bundle/);
    });

    it('rejects a malformed palette entry', () => {
        expect(() => assertValidPaletteCatalogBundle(bundle([null]))).toThrow(/Invalid palette entry/);
        expect(() => assertValidPaletteCatalogBundle(bundle([{ colors: ['#000000'] }]))).toThrow(/Invalid palette entry/);
        expect(() => assertValidPaletteCatalogBundle(bundle([{ name: 'x', colors: '#000000' }]))).toThrow(/Invalid palette entry/);
    });

    it('names the palette and index of an invalid swatch (after # normalization)', () => {
        const b = bundle([
            { name: 'Good', colors: ['#000000'] },
            { name: 'Bad', colors: ['#000000', 'not-a-color'] },
        ]);
        expect(() => assertValidPaletteCatalogBundle(b)).toThrow(/Invalid hex in palette "Bad" at index 1: "#not-a-color"/);
        expect(() => assertValidPaletteCatalogBundle(bundle([{ name: 'Short', colors: ['#12'] }])))
            .toThrow(/Invalid hex in palette "Short" at index 0/);
    });
});
