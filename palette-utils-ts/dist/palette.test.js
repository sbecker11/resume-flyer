import { describe, it, expect } from 'vitest';
import { isExportedPalette, parsePaletteJson, normalizePaletteColors, } from './palette.js';
describe('isExportedPalette', () => {
    it('returns true for valid ExportedPalette', () => {
        expect(isExportedPalette({ name: 'Test', colors: ['#ff0000', '#00ff00'] })).toBe(true);
        expect(isExportedPalette({ name: '', colors: [] })).toBe(true);
    });
    it('returns false for null or non-object', () => {
        expect(isExportedPalette(null)).toBe(false);
        expect(isExportedPalette(undefined)).toBe(false);
        expect(isExportedPalette(42)).toBe(false);
        expect(isExportedPalette('string')).toBe(false);
    });
    it('returns false when name is not a string', () => {
        expect(isExportedPalette({ name: 1, colors: [] })).toBe(false);
        expect(isExportedPalette({ name: null, colors: [] })).toBe(false);
        expect(isExportedPalette({ colors: [] })).toBe(false);
    });
    it('returns false when colors is not an array', () => {
        expect(isExportedPalette({ name: 'x', colors: null })).toBe(false);
        expect(isExportedPalette({ name: 'x', colors: {} })).toBe(false);
        expect(isExportedPalette({ name: 'x' })).toBe(false);
    });
    it('returns false when any color is not a string', () => {
        expect(isExportedPalette({ name: 'x', colors: [123] })).toBe(false);
        expect(isExportedPalette({ name: 'x', colors: ['#fff', null] })).toBe(false);
    });
});
describe('parsePaletteJson', () => {
    it('parses valid JSON and returns ExportedPalette', () => {
        const json = JSON.stringify({ name: 'My Palette', colors: ['#f00', '#0f0'] });
        const result = parsePaletteJson(json);
        expect(result).toEqual({ name: 'My Palette', colors: ['#f00', '#0f0'] });
    });
    it('returns null for invalid JSON', () => {
        expect(parsePaletteJson('')).toBeNull();
        expect(parsePaletteJson('not json')).toBeNull();
        expect(parsePaletteJson('{ invalid }')).toBeNull();
    });
    it('returns null for JSON that is not ExportedPalette shape', () => {
        expect(parsePaletteJson('{}')).toBeNull();
        expect(parsePaletteJson('{"name": "x"}')).toBeNull();
        expect(parsePaletteJson('{"colors": []}')).toBeNull();
        expect(parsePaletteJson('{"name": 1, "colors": []}')).toBeNull();
        expect(parsePaletteJson('{"name": "x", "colors": [1, 2]}')).toBeNull();
    });
});
describe('normalizePaletteColors', () => {
    it('mutates and normalizes hex to #rrggbb lowercase', () => {
        const colors = ['#F00', '00ff00', '#abc'];
        const result = normalizePaletteColors(colors);
        expect(result).toBe(colors);
        expect(colors[0]).toBe('#ff0000');
        expect(colors[1]).toBe('#00ff00');
        expect(colors[2]).toBe('#aabbcc');
    });
    it('returns the same array reference', () => {
        const colors = ['#fff'];
        expect(normalizePaletteColors(colors)).toBe(colors);
    });
    it('handles empty array', () => {
        const colors = [];
        expect(normalizePaletteColors(colors)).toEqual([]);
    });
});
