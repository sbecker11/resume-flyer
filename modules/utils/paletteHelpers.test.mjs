import { describe, it, expect } from 'vitest';
import {
  getLuminanceFromHex,
  getPerceivedBrightness,
  isHexColor,
  isHexColorString,
  validateHexColor,
  get_RGB_from_Hex,
  isGrey,
} from './paletteHelpers.mjs';

describe('paletteHelpers', () => {
  describe('getLuminanceFromHex', () => {
    it('returns 0 for black', () => {
      expect(getLuminanceFromHex('#000000')).toBe(0);
    });
    it('returns 1 for white', () => {
      expect(getLuminanceFromHex('#ffffff')).toBe(1);
    });
    it('returns ~0.21 for sRGB mid grey (linear luminance)', () => {
      const L = getLuminanceFromHex('#808080');
      expect(L).toBeGreaterThan(0.2);
      expect(L).toBeLessThan(0.25);
    });
    it('returns 0.5 for invalid hex', () => {
      expect(getLuminanceFromHex('not-hex')).toBe(0.5);
      expect(getLuminanceFromHex('')).toBe(0.5);
    });
    it('accepts 3-digit shorthand', () => {
      expect(getLuminanceFromHex('#fff')).toBe(1);
      expect(getLuminanceFromHex('#000')).toBe(0);
    });
  });

  describe('getPerceivedBrightness', () => {
    it('returns 0 for black', () => {
      expect(getPerceivedBrightness('#000000')).toBe(0);
    });
    it('returns 255 for white', () => {
      expect(getPerceivedBrightness('#ffffff')).toBe(255);
    });
    it('scales with luminance', () => {
      const mid = getPerceivedBrightness('#808080');
      expect(mid).toBeGreaterThan(50);
      expect(mid).toBeLessThan(60);
    });
  });

  describe('isHexColor', () => {
    it('returns true for valid 6-digit hex', () => {
      expect(isHexColor('#000000')).toBe(true);
      expect(isHexColor('#ffffff')).toBe(true);
      expect(isHexColor('#a1b2c3')).toBe(true);
      expect(isHexColor('#ABCDEF')).toBe(true);
    });
    it('returns true for valid 3-digit hex', () => {
      expect(isHexColor('#fff')).toBe(true);
      expect(isHexColor('#000')).toBe(true);
    });
    it('returns false for invalid input', () => {
      expect(isHexColor('')).toBe(false);
      expect(isHexColor(null)).toBe(false);
      expect(isHexColor(undefined)).toBe(false);
      expect(isHexColor('#gggggg')).toBe(false);
      expect(isHexColor('red')).toBe(false);
      expect(isHexColor('#12')).toBe(false);
      expect(isHexColor('#1234567')).toBe(false);
    });
  });

  describe('isHexColorString', () => {
    it('is alias for isHexColor', () => {
      expect(isHexColorString('#ffffff')).toBe(true);
      expect(isHexColorString('x')).toBe(false);
    });
  });

  describe('validateHexColor', () => {
    it('does not throw for valid hex', () => {
      expect(() => validateHexColor('#ffffff')).not.toThrow();
      expect(() => validateHexColor('#000')).not.toThrow();
    });
    it('throws for invalid hex', () => {
      expect(() => validateHexColor('bad')).toThrow(/Invalid hex color/);
      expect(() => validateHexColor('')).toThrow(/Invalid hex color/);
    });
    it('includes context in error when provided', () => {
      expect(() => validateHexColor('x', 'myFunc')).toThrow(/myFunc/);
    });
  });

  describe('get_RGB_from_Hex', () => {
    it('returns rgb object for valid hex', () => {
      expect(get_RGB_from_Hex('#000000')).toEqual({ r: 0, g: 0, b: 0 });
      expect(get_RGB_from_Hex('#ffffff')).toEqual({ r: 255, g: 255, b: 255 });
      expect(get_RGB_from_Hex('#ff0000')).toEqual({ r: 255, g: 0, b: 0 });
      expect(get_RGB_from_Hex('#010203')).toEqual({ r: 1, g: 2, b: 3 });
    });
    it('throws for invalid hex', () => {
      expect(() => get_RGB_from_Hex('nope')).toThrow(/Invalid hex/);
      expect(() => get_RGB_from_Hex('')).toThrow(/Invalid hex/);
    });
  });

  describe('isGrey', () => {
    it('returns true for grey shades', () => {
      expect(isGrey('#000000')).toBe(true);
      expect(isGrey('#ffffff')).toBe(true);
      expect(isGrey('#808080')).toBe(true);
      expect(isGrey('#7f7f7f', 1)).toBe(true);
    });
    it('returns false for colored hex', () => {
      expect(isGrey('#ff0000')).toBe(false);
      expect(isGrey('#00ff00')).toBe(false);
      expect(isGrey('#ff0066', 5)).toBe(false); // r,g,b differ more than tolerance
    });
    it('respects tolerance', () => {
      expect(isGrey('#808080', 0)).toBe(true);
      expect(isGrey('#807f80', 1)).toBe(true);
      expect(isGrey('#807f80', 0)).toBe(false);
    });
    it('returns false for invalid hex', () => {
      expect(isGrey('')).toBe(false);
      expect(isGrey('#xyz')).toBe(false);
    });
  });
});
