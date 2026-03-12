import { describe, it, expect } from 'vitest';
import { formatHexDisplay, rgbToHex, hexToRgb, getHighContrastMono, getHighContrastForBackground, getContrastIconSet, getHighlightColor, } from './colors.js';
describe('formatHexDisplay', () => {
    it('returns empty string for null or undefined', () => {
        expect(formatHexDisplay(null)).toBe('');
        expect(formatHexDisplay(undefined)).toBe('');
    });
    it('returns empty string for empty string', () => {
        expect(formatHexDisplay('')).toBe('');
    });
    it('passes through valid 6-digit hex lowercase', () => {
        expect(formatHexDisplay('#ff0000')).toBe('#ff0000');
        expect(formatHexDisplay('#00ff00')).toBe('#00ff00');
    });
    it('normalizes valid 6-digit hex to lowercase', () => {
        expect(formatHexDisplay('#FF0000')).toBe('#ff0000');
        expect(formatHexDisplay('  #AbCdEf  ')).toBe('#abcdef');
    });
    it('expands 3-digit shorthand to 6-digit', () => {
        expect(formatHexDisplay('#f00')).toBe('#ff0000');
        expect(formatHexDisplay('#0f0')).toBe('#00ff00');
        expect(formatHexDisplay('#00f')).toBe('#0000ff');
        expect(formatHexDisplay('#fff')).toBe('#ffffff');
    });
    it('adds # prefix if missing', () => {
        expect(formatHexDisplay('ff0000')).toBe('#ff0000');
    });
});
describe('rgbToHex', () => {
    it('converts RGB 0-255 to hex', () => {
        expect(rgbToHex(255, 0, 0)).toBe('#ff0000');
        expect(rgbToHex(0, 255, 0)).toBe('#00ff00');
        expect(rgbToHex(0, 0, 255)).toBe('#0000ff');
        expect(rgbToHex(0, 0, 0)).toBe('#000000');
        expect(rgbToHex(255, 255, 255)).toBe('#ffffff');
    });
    it('pads single-digit hex components', () => {
        expect(rgbToHex(1, 2, 3)).toBe('#010203');
    });
});
describe('hexToRgb', () => {
    it('parses valid 6-digit hex to RGB', () => {
        expect(hexToRgb('#ff0000')).toEqual({ r: 255, g: 0, b: 0 });
        expect(hexToRgb('#00ff00')).toEqual({ r: 0, g: 255, b: 0 });
        expect(hexToRgb('#0000ff')).toEqual({ r: 0, g: 0, b: 255 });
        expect(hexToRgb('#ffffff')).toEqual({ r: 255, g: 255, b: 255 });
    });
    it('accepts formatHexDisplay-normalized input', () => {
        expect(hexToRgb('#f00')).toEqual({ r: 255, g: 0, b: 0 });
    });
    it('returns null for invalid hex', () => {
        expect(hexToRgb('')).toBeNull();
        expect(hexToRgb('not-a-color')).toBeNull();
        expect(hexToRgb('#gggggg')).toBeNull();
        expect(hexToRgb('#12345')).toBeNull();
    });
});
describe('getHighContrastMono', () => {
    it('returns #000000 for light backgrounds', () => {
        expect(getHighContrastMono('#ffffff')).toBe('#000000');
        expect(getHighContrastMono('#ffff00')).toBe('#000000');
        expect(getHighContrastMono('#f0f0f0')).toBe('#000000');
    });
    it('returns #ffffff for dark backgrounds (LAB L* < 37)', () => {
        expect(getHighContrastMono('#000000')).toBe('#ffffff');
        expect(getHighContrastMono('#333333')).toBe('#ffffff'); // dark grey, L* ~20
        expect(getHighContrastMono('#61478e')).toBe('#ffffff'); // purple L* ≈ 36, treat as dark
    });
    it('returns #000000 for light backgrounds (LAB L* >= 37)', () => {
        expect(getHighContrastMono('#ffffff')).toBe('#000000');
        expect(getHighContrastMono('#cb937f')).toBe('#000000'); // tan/salmon
        expect(getHighContrastMono('#cccccc')).toBe('#000000'); // light grey L* ~82
    });
});
describe('getHighContrastForBackground', () => {
    it('returns textColor and iconSet from a single light/dark decision', () => {
        const light = getHighContrastForBackground('#ffffff');
        expect(light.textColor).toBe('#000000');
        expect(light.iconSet.variant).toBe('black');
        const dark = getHighContrastForBackground('#61478e');
        expect(dark.textColor).toBe('#ffffff');
        expect(dark.iconSet.variant).toBe('white');
    });
    it('matches getHighContrastMono and getIconSetForBackgroundColor', () => {
        const hex = '#61478e';
        const unified = getHighContrastForBackground(hex);
        expect(unified.textColor).toBe(getHighContrastMono(hex));
        expect(unified.iconSet).toEqual(getContrastIconSet(hex));
    });
});
describe('getContrastIconSet', () => {
    it('returns url, back, img and variant', () => {
        const set = getContrastIconSet('#ffffff');
        expect(set).toHaveProperty('url');
        expect(set).toHaveProperty('back');
        expect(set).toHaveProperty('img');
        expect(set).toHaveProperty('variant');
        expect(['black', 'white']).toContain(set.variant);
    });
    it('uses default iconBase when not provided', () => {
        const set = getContrastIconSet('#fff');
        expect(set.url).toContain('/palette-utils/icons/anchors');
    });
    it('uses custom iconBase when provided', () => {
        const set = getContrastIconSet('#fff', { iconBase: '/my/icons' });
        expect(set.url).toBe('/my/icons/icons8-url-16-black.png');
        expect(set.back).toBe('/my/icons/icons8-back-16-black.png');
        expect(set.img).toBe('/my/icons/icons8-img-16-black.png');
    });
    it('variant is black for light background', () => {
        expect(getContrastIconSet('#ffffff').variant).toBe('black');
    });
    it('variant is white for dark background', () => {
        expect(getContrastIconSet('#000000').variant).toBe('white');
    });
});
describe('getHighlightColor', () => {
    it('returns a hex string', () => {
        const result = getHighlightColor('#c1543c');
        expect(result).toMatch(/^#[0-9a-f]{6}$/);
    });
    it('returns same hex for invalid input', () => {
        expect(getHighlightColor('invalid')).toBe('invalid');
    });
    it('brightens dark colors by default', () => {
        const dark = '#222222';
        const highlighted = getHighlightColor(dark);
        const darkRgb = hexToRgb(dark);
        const highRgb = hexToRgb(highlighted);
        const sum = (r, g, b) => r + g + b;
        expect(sum(highRgb.r, highRgb.g, highRgb.b)).toBeGreaterThan(sum(darkRgb.r, darkRgb.g, darkRgb.b));
    });
    it('accepts highlightPercent option', () => {
        const a = getHighlightColor('#4080c0', { highlightPercent: 110 });
        const b = getHighlightColor('#4080c0', { highlightPercent: 150 });
        expect(a).not.toBe(b);
    });
});
describe('getHighContrastForBackground — text color and icon variant must always match', () => {
    // Each entry: [hex, expectedVariant] where variant drives both textColor and iconSet
    const cases = [
        // Dark backgrounds reported as mismatched in production
        ['#d23f69', 'white'],
        ['#4057db', 'white'],
        ['#345418', 'white'],
        ['#823e55', 'white'],
        ['#1a6086', 'white'],
        ['#005277', 'white'],
        // Additional dark colors
        ['#000000', 'white'],
        ['#222222', 'white'],
        ['#61478e', 'white'],
        // Light backgrounds — must use black text/icons
        ['#ffffff', 'black'],
        ['#f0f0f0', 'black'],
        ['#ffff00', 'black'],
        ['#c8e6c9', 'black'],
    ];
    for (const [hex, expectedVariant] of cases) {
        it(`${hex}: textColor and iconSet.variant both '${expectedVariant}'`, () => {
            const result = getHighContrastForBackground(hex);
            const expectedText = expectedVariant === 'white' ? '#ffffff' : '#000000';
            expect(result.textColor).toBe(expectedText);
            expect(result.iconSet.variant).toBe(expectedVariant);
            // Core invariant: textColor and variant must agree
            if (result.textColor === '#ffffff') {
                expect(result.iconSet.variant).toBe('white');
            }
            else {
                expect(result.iconSet.variant).toBe('black');
            }
        });
    }
});
