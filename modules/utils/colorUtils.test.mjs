import { describe, it, expect } from 'vitest';
import {
    formatHexDisplay,
    rgbToHex,
    hexToRgb,
    getHighContrastMono,
    getHighContrastForBackground,
    getIconSetForBackgroundColor,
    getContrastIconSet,
    getHighlightColor,
    isExportedPalette,
    parsePaletteJson,
    normalizePaletteColors
} from './colorUtils.mjs';

describe('colorUtils', () => {
    describe('formatHexDisplay', () => {
        it('returns empty for nullish or non-string', () => {
            expect(formatHexDisplay(null)).toBe('');
            expect(formatHexDisplay(undefined)).toBe('');
            expect(formatHexDisplay('')).toBe('');
            expect(formatHexDisplay(123)).toBe('');
        });
        it('normalizes 6-digit hex to lowercase', () => {
            expect(formatHexDisplay('#ABCDEF')).toBe('#abcdef');
            expect(formatHexDisplay('#003087')).toBe('#003087');
        });
        it('expands 3-digit shorthand', () => {
            expect(formatHexDisplay('#abc')).toBe('#aabbcc');
            expect(formatHexDisplay('#fff')).toBe('#ffffff');
        });
        it('trims and adds hash when missing', () => {
            expect(formatHexDisplay('  ff00aa  ')).toBe('#ff00aa');
        });
    });

    describe('rgbToHex', () => {
        it('pads channels', () => {
            expect(rgbToHex(0, 0, 0)).toBe('#000000');
            expect(rgbToHex(255, 255, 255)).toBe('#ffffff');
            expect(rgbToHex(0, 128, 255)).toBe('#0080ff');
        });
    });

    describe('hexToRgb', () => {
        it('parses valid 6-digit hex', () => {
            expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 });
            expect(hexToRgb('#ffffff')).toEqual({ r: 255, g: 255, b: 255 });
            expect(hexToRgb('#003087')).toEqual({ r: 0, g: 48, b: 135 });
        });
        it('accepts shorthand via formatHexDisplay', () => {
            expect(hexToRgb('#fff')).toEqual({ r: 255, g: 255, b: 255 });
        });
        it('returns null for invalid hex', () => {
            expect(hexToRgb('not-a-color')).toBeNull();
            expect(hexToRgb('#gg0000')).toBeNull();
            expect(hexToRgb('#12')).toBeNull();
        });
    });

    describe('getHighContrastMono', () => {
        it('uses white text on very dark backgrounds', () => {
            expect(getHighContrastMono('#000000')).toBe('#ffffff');
            expect(getHighContrastMono('#111111')).toBe('#ffffff');
        });
        it('uses black text on very light backgrounds', () => {
            expect(getHighContrastMono('#ffffff')).toBe('#000000');
            expect(getHighContrastMono('#f5f5f5')).toBe('#000000');
        });
    });

    describe('getHighContrastForBackground', () => {
        it('returns textColor and iconSet with matching variant', () => {
            const dark = getHighContrastForBackground('#000000');
            expect(dark.textColor).toBe('#ffffff');
            expect(dark.iconSet.variant).toBe('white');
            expect(dark.iconSet.url).toContain('icons8-url-16-black.png');
        });
        it('respects iconBase option', () => {
            const { iconSet } = getHighContrastForBackground('#ffffff', {
                iconBase: '/static_content/icons'
            });
            expect(iconSet.url).toBe('/static_content/icons/icons8-url-16-black.png');
            expect(iconSet.variant).toBe('black');
        });
    });

    describe('getIconSetForBackgroundColor / getContrastIconSet', () => {
        it('matches getHighContrastForBackground iconSet', () => {
            const full = getHighContrastForBackground('#222222');
            expect(getIconSetForBackgroundColor('#222222')).toEqual(full.iconSet);
            expect(getContrastIconSet('#222222')).toEqual(full.iconSet);
        });
    });

    describe('getHighlightColor', () => {
        it('returns a hex string for valid input', () => {
            const out = getHighlightColor('#4488cc');
            expect(out).toMatch(/^#[0-9a-f]{6}$/);
        });
        it('returns original string when hex is invalid', () => {
            expect(getHighlightColor('garbage')).toBe('garbage');
        });
        it('accepts highlightPercent override', () => {
            const a = getHighlightColor('#666666', { highlightPercent: 100 });
            const b = getHighlightColor('#666666', { highlightPercent: 150 });
            expect(a).toMatch(/^#/);
            expect(b).toMatch(/^#/);
            expect(a).not.toBe(b);
        });
    });

    describe('isExportedPalette', () => {
        it('returns true for valid palette shape', () => {
            expect(isExportedPalette({ name: 'Test', colors: ['#ff0000', '#00ff00'] })).toBe(true);
            expect(
                isExportedPalette({ name: 'T', colors: ['#000000'], backgroundSwatchIndex: 0 })
            ).toBe(true);
        });
        it('returns false for invalid shapes', () => {
            expect(isExportedPalette(null)).toBe(false);
            expect(isExportedPalette({})).toBe(false);
            expect(isExportedPalette({ name: 'x', colors: 'nope' })).toBe(false);
            expect(isExportedPalette({ name: 'x', colors: [1, 2] })).toBe(false);
            expect(
                isExportedPalette({ name: 'x', colors: ['#fff'], backgroundSwatchIndex: -1 })
            ).toBe(false);
        });
    });

    describe('parsePaletteJson', () => {
        it('parses valid JSON palette', () => {
            const raw = JSON.stringify({ name: 'Ocean', colors: ['#003087', '#005b96'] });
            const p = parsePaletteJson(raw);
            expect(p).toEqual({ name: 'Ocean', colors: ['#003087', '#005b96'] });
        });
        it('returns null for invalid JSON', () => {
            expect(parsePaletteJson('{')).toBeNull();
        });
        it('returns null when JSON is not an exported palette', () => {
            expect(parsePaletteJson('{"foo":1}')).toBeNull();
        });
    });

    describe('normalizePaletteColors', () => {
        it('mutates array entries to normalized hex', () => {
            const colors = ['#ABC', '  #ff00aa ', '#112233'];
            normalizePaletteColors(colors);
            expect(colors[0]).toBe('#aabbcc');
            expect(colors[1]).toBe('#ff00aa');
            expect(colors[2]).toBe('#112233');
        });
        it('returns same array reference', () => {
            const c = ['#fff'];
            expect(normalizePaletteColors(c)).toBe(c);
        });
    });
});
