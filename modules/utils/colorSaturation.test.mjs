import { describe, it, expect } from 'vitest';
import { rgbToHsl, hslToRgb, applySaturationMultiplier, applySaturationMultiplierToPalette } from './colorSaturation.mjs';

describe('rgbToHsl / hslToRgb round-trip', () => {
  it('round-trips a saturated color', () => {
    const { h, s, l } = rgbToHsl(200, 50, 50);
    const rgb = hslToRgb(h, s, l);
    expect(rgb.r).toBeCloseTo(200, 0);
    expect(rgb.g).toBeCloseTo(50, 0);
    expect(rgb.b).toBeCloseTo(50, 0);
  });

  it('treats a gray color as saturation 0', () => {
    const { s } = rgbToHsl(128, 128, 128);
    expect(s).toBe(0);
  });
});

function hexToHslParts(hex) {
  return rgbToHsl(
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16)
  );
}

describe('applySaturationMultiplier', () => {
  it('is a no-op at factor = 1.0 (hex unchanged)', () => {
    expect(applySaturationMultiplier('#3366cc', 1.0)).toBe('#3366cc');
  });

  it('fully desaturates (grayscale) at factor = 0.0', () => {
    const result = applySaturationMultiplier('#3366cc', 0.0);
    const rgb = { r: parseInt(result.slice(1, 3), 16), g: parseInt(result.slice(3, 5), 16), b: parseInt(result.slice(5, 7), 16) };
    expect(rgb.r).toBe(rgb.g);
    expect(rgb.g).toBe(rgb.b);
  });

  it('partially desaturates for a factor between 0 and 1 (e.g. 0.5)', () => {
    const original = hexToHslParts('#3366cc');
    const result = applySaturationMultiplier('#3366cc', 0.5);
    const adjusted = hexToHslParts(result);
    expect(adjusted.s).toBeCloseTo(original.s * 0.5, 0);
    expect(adjusted.h).toBeCloseTo(original.h, 0);
    expect(adjusted.l).toBeCloseTo(original.l, 0);
  });

  it('increases saturation for a factor above 1 (e.g. 2.0), clamped at s = 100', () => {
    const original = hexToHslParts('#3366cc');
    const result = applySaturationMultiplier('#3366cc', 2.0);
    const adjusted = hexToHslParts(result);
    const expectedS = Math.min(100, original.s * 2.0);
    expect(adjusted.s).toBeCloseTo(expectedS, 0);
  });

  it('clamps saturation at s = 100 for an aggressive factor (e.g. 3.0, the max)', () => {
    const result = applySaturationMultiplier('#3366cc', 3.0);
    const { s } = hexToHslParts(result);
    expect(s).toBeCloseTo(100, 0);
  });

  it('leaves an already-gray color unchanged for any factor (s = 0 stays 0)', () => {
    const result = applySaturationMultiplier('#808080', 3.0);
    expect(result).toBe('#808080');
  });

  it('clamps out-of-range factor values to [0.0, 3.0]', () => {
    expect(applySaturationMultiplier('#3366cc', -5)).toBe(applySaturationMultiplier('#3366cc', 0.0));
    expect(applySaturationMultiplier('#3366cc', 500)).toBe(applySaturationMultiplier('#3366cc', 3.0));
  });

  it('returns the normalized original for an invalid hex color', () => {
    // formatHexDisplay prefixes non-'#'-leading strings with '#' rather than validating hex digits.
    expect(applySaturationMultiplier('not-a-color', 2.0)).toBe('#not-a-color');
    expect(applySaturationMultiplier('', 0.5)).toBe('');
  });

  it('handles 3-digit hex shorthand via normalization', () => {
    const result = applySaturationMultiplier('#36c', 0.0);
    const rgb = { r: parseInt(result.slice(1, 3), 16), g: parseInt(result.slice(3, 5), 16), b: parseInt(result.slice(5, 7), 16) };
    expect(rgb.r).toBe(rgb.g);
    expect(rgb.g).toBe(rgb.b);
  });

  it('treats a non-finite factor as the default (1.0, no-op)', () => {
    expect(applySaturationMultiplier('#3366cc', NaN)).toBe('#3366cc');
  });
});

describe('applySaturationMultiplierToPalette', () => {
  it('returns the same array reference when factor is 1.0 (no-op fast path)', () => {
    const colors = ['#3366cc', '#ff0000'];
    expect(applySaturationMultiplierToPalette(colors, 1.0)).toBe(colors);
  });

  it('returns the same array reference when factor is not finite', () => {
    const colors = ['#3366cc'];
    expect(applySaturationMultiplierToPalette(colors, NaN)).toBe(colors);
  });

  it('maps every color through applySaturationMultiplier when factor is not 1.0', () => {
    const colors = ['#3366cc', '#ff0000'];
    const result = applySaturationMultiplierToPalette(colors, 0.0);
    expect(result).toEqual([
      applySaturationMultiplier('#3366cc', 0.0),
      applySaturationMultiplier('#ff0000', 0.0),
    ]);
  });

  it('passes through non-array input unchanged', () => {
    expect(applySaturationMultiplierToPalette(null, 2.0)).toBe(null);
    expect(applySaturationMultiplierToPalette(undefined, 2.0)).toBe(undefined);
  });
});
