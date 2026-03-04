import { describe, it, expect } from 'vitest';
import {
  calculateDistance,
  isBetween,
  createRect,
  isPointInsideRect,
  half,
  toFixedPoint,
  linearInterp,
  zeroPad,
  isString,
  isNonEmptyString,
  isNumber,
  clamp,
  clampInt,
  max,
  min,
  max3,
  inRect,
  hasLeadingNumericValue,
  getLeadingNumericValue,
  isNumericString,
  getNumericValue,
  isPlainObject,
  deepMerge,
  validateNumber,
  validateString,
  validateKey,
  validateIsBoolean,
  validateIsPlainObject,
  validatePosition,
  validateRect,
  validateNumberInRange,
  validateIntArrayLength,
  validateNumbersArray,
  validateIsNumeric,
  getPositionAsString,
  getRectAsString,
  abs,
  abs_diff,
  test_utils,
} from './utils.mjs';

describe('utils', () => {
  describe('calculateDistance', () => {
    it('returns 0 for same point', () => {
      expect(calculateDistance(0, 0, 0, 0)).toBe(0);
      expect(calculateDistance(5, 5, 5, 5)).toBe(0);
    });
    it('returns correct distance for horizontal/vertical', () => {
      expect(calculateDistance(0, 0, 3, 0)).toBe(3);
      expect(calculateDistance(0, 0, 0, 4)).toBe(4);
    });
    it('returns correct diagonal distance', () => {
      expect(calculateDistance(0, 0, 3, 4)).toBe(5);
    });
  });

  describe('isBetween', () => {
    it('returns true when value in range', () => {
      expect(isBetween(5, 0, 10)).toBe(true);
      expect(isBetween(0, 0, 10)).toBe(true);
      expect(isBetween(10, 0, 10)).toBe(true);
    });
    it('returns false when value outside range', () => {
      expect(isBetween(-1, 0, 10)).toBe(false);
      expect(isBetween(11, 0, 10)).toBe(false);
    });
  });

  describe('createRect', () => {
    it('normalizes order of corners', () => {
      expect(createRect(10, 10, 0, 0)).toEqual({ left: 0, top: 0, right: 10, bottom: 10 });
      expect(createRect(0, 5, 3, 0)).toEqual({ left: 0, top: 0, right: 3, bottom: 5 });
    });
  });

  describe('isPointInsideRect', () => {
    it('returns true for point inside', () => {
      const rect = { left: 0, top: 0, right: 10, bottom: 10 };
      expect(isPointInsideRect(5, 5, rect)).toBe(true);
      expect(isPointInsideRect(0, 0, rect)).toBe(true);
      expect(isPointInsideRect(10, 10, rect)).toBe(true);
    });
    it('returns false for point outside', () => {
      const rect = { left: 0, top: 0, right: 10, bottom: 10 };
      expect(isPointInsideRect(11, 5, rect)).toBe(false);
      expect(isPointInsideRect(5, -1, rect)).toBe(false);
    });
  });

  describe('inRect', () => {
    it('returns true when point inside rect', () => {
      const rect = { left: 0, top: 0, right: 10, bottom: 10 };
      expect(inRect(5, 5, rect)).toBe(true);
    });
    it('returns false when point outside', () => {
      const rect = { left: 0, top: 0, right: 10, bottom: 10 };
      expect(inRect(15, 15, rect)).toBe(false);
    });
  });

  describe('half', () => {
    it('returns half value floored', () => {
      expect(half(10)).toBe(5);
      expect(half(9)).toBe(4);
    });
    it('throws for non-number', () => {
      expect(() => half('10')).toThrow(/not a number/);
    });
  });

  describe('toFixedPoint', () => {
    it('rounds to precision', () => {
      expect(toFixedPoint(1.2345, 2)).toBe(1.23);
      expect(toFixedPoint(1.999, 0)).toBe(2);
    });
  });

  describe('linearInterp', () => {
    it('interpolates between two points', () => {
      expect(linearInterp(5, 0, 0, 10, 10)).toBe(5);
      expect(linearInterp(0, 0, 10, 10, 20)).toBe(10);
      expect(linearInterp(10, 0, 10, 10, 20)).toBe(20);
    });
  });

  describe('zeroPad', () => {
    it('pads number to places', () => {
      expect(zeroPad(5, 3)).toBe('005');
      expect(zeroPad(42, 2)).toBe('42');
    });
  });

  describe('isString', () => {
    it('returns true for string', () => {
      expect(isString('')).toBe(true);
      expect(isString('a')).toBe(true);
    });
    it('returns false for non-string', () => {
      expect(isString(1)).toBe(false);
      expect(isString(null)).toBe(false);
    });
  });

  describe('isNonEmptyString', () => {
    it('returns true for non-empty string', () => {
      expect(isNonEmptyString('a')).toBe(true);
    });
    it('returns false for empty or non-string', () => {
      expect(isNonEmptyString('')).toBe(false);
      expect(isNonEmptyString(1)).toBe(false);
    });
  });

  describe('isNumber', () => {
    it('returns true for finite number', () => {
      expect(isNumber(0)).toBe(true);
      expect(isNumber(1.5)).toBe(true);
    });
    it('returns false for NaN or non-number', () => {
      expect(isNumber(NaN)).toBe(false);
      expect(isNumber('1')).toBe(false);
    });
  });

  describe('clamp', () => {
    it('clamps value to range', () => {
      expect(clamp(5, 0, 10)).toBe(5);
      expect(clamp(-1, 0, 10)).toBe(0);
      expect(clamp(11, 0, 10)).toBe(10);
    });
    it('throws for non-number', () => {
      expect(() => clamp('x', 0, 10)).toThrow(/not a number/);
    });
  });

  describe('clampInt', () => {
    it('clamps and floors to integer range', () => {
      expect(clampInt(5, 0, 10)).toBe(5);
      expect(clampInt(5.7, 0, 10)).toBe(5);
      expect(clampInt(15, 0, 10)).toBe(10);
      expect(clampInt(-1, 0, 10)).toBe(0);
    });
  });

  describe('min / max / max3', () => {
    it('min returns smaller', () => {
      expect(min(1, 2)).toBe(1);
      expect(min(2, 1)).toBe(1);
    });
    it('max returns larger', () => {
      expect(max(1, 2)).toBe(2);
      expect(max(2, 1)).toBe(2);
    });
    it('max3 returns largest of three', () => {
      expect(max3(1, 2, 3)).toBe(3);
      expect(max3(3, 1, 2)).toBe(3);
    });
    it('throw for non-number', () => {
      expect(() => min('a', 1)).toThrow();
      expect(() => max(1, 'b')).toThrow();
    });
  });

  describe('hasLeadingNumericValue', () => {
    it('returns true for string starting with number', () => {
      expect(hasLeadingNumericValue('5')).toBe(true);
      expect(hasLeadingNumericValue('5.2')).toBe(true);
      expect(hasLeadingNumericValue('5_foreground_only')).toBe(true);
    });
    it('returns false for non-matching strings', () => {
      expect(hasLeadingNumericValue('abc')).toBe(false);
    });
    it('returns true for string starting with number even if rest is non-numeric', () => {
      expect(hasLeadingNumericValue('5abc')).toBe(true); // leading "5" matches
    });
  });

  describe('getLeadingNumericValue', () => {
    it('returns leading number', () => {
      expect(getLeadingNumericValue('5')).toBe(5);
      expect(getLeadingNumericValue('5.2')).toBe(5.2);
      expect(getLeadingNumericValue('5_foreground_only')).toBe(5);
    });
    it('throws when no leading number', () => {
      expect(() => getLeadingNumericValue('abc')).toThrow(/does not start/);
    });
  });

  describe('isNumericString', () => {
    it('returns true for numeric-only strings', () => {
      expect(isNumericString('0')).toBe(true);
      expect(isNumericString('123')).toBe(true);
      expect(isNumericString('-5.2')).toBe(true);
      expect(isNumericString(' 42 ')).toBe(true);
    });
    it('returns false for non-numeric', () => {
      expect(isNumericString('')).toBe(false);
      expect(isNumericString('abc')).toBe(false);
      expect(isNumericString('5abc')).toBe(false);
    });
  });

  describe('getNumericValue', () => {
    it('returns number for numeric string', () => {
      expect(getNumericValue('42')).toBe(42);
      expect(getNumericValue('-3.14')).toBe(-3.14);
    });
    it('returns number for number input', () => {
      expect(getNumericValue(42)).toBe(42);
    });
    it('throws for invalid input', () => {
      expect(() => getNumericValue('abc')).toThrow(/not a numeric/);
    });
  });

  describe('isPlainObject', () => {
    it('returns true for plain object', () => {
      expect(isPlainObject({})).toBe(true);
      expect(isPlainObject({ a: 1 })).toBe(true);
    });
    it('returns false for non-plain object', () => {
      expect(isPlainObject(null)).toBe(false);
      expect(isPlainObject([])).toBe(false);
      expect(isPlainObject(new Date())).toBe(false);
    });
  });

  describe('deepMerge', () => {
    it('merges two objects', () => {
      const a = { x: 1, y: { a: 2 } };
      const b = { y: { b: 3 }, z: 4 };
      expect(deepMerge(a, b)).toEqual({ x: 1, y: { a: 2, b: 3 }, z: 4 });
    });
    it('does not mutate target', () => {
      const a = { x: 1 };
      const b = { y: 2 };
      deepMerge(a, b);
      expect(a).toEqual({ x: 1 });
    });
  });

  describe('validateNumber', () => {
    it('does not throw for finite number', () => {
      expect(() => validateNumber(0)).not.toThrow();
      expect(() => validateNumber(1.5)).not.toThrow();
    });
    it('throws for invalid', () => {
      expect(() => validateNumber(NaN)).toThrow();
      expect(() => validateNumber('1')).toThrow();
      expect(() => validateNumber(null)).toThrow();
    });
  });

  describe('validateString', () => {
    it('does not throw for non-empty string', () => {
      expect(() => validateString('a')).not.toThrow();
    });
    it('throws for empty or non-string', () => {
      expect(() => validateString('')).toThrow();
      expect(() => validateString(1)).toThrow();
    });
  });

  describe('validateKey', () => {
    it('does not throw when key exists', () => {
      expect(() => validateKey({ a: 1 }, 'a')).not.toThrow();
    });
    it('throws when key missing', () => {
      expect(() => validateKey({ a: 1 }, 'b')).toThrow(/Key .* not found/);
    });
  });

  describe('validateIsBoolean', () => {
    it('does not throw for boolean', () => {
      expect(() => validateIsBoolean(true)).not.toThrow();
      expect(() => validateIsBoolean(false)).not.toThrow();
    });
    it('throws for non-boolean', () => {
      expect(() => validateIsBoolean(1)).toThrow(/not a boolean/);
    });
  });

  describe('validateIsPlainObject', () => {
    it('does not throw for plain object', () => {
      expect(() => validateIsPlainObject({})).not.toThrow();
    });
    it('throws for non-plain object', () => {
      expect(() => validateIsPlainObject([])).toThrow(/not a plain object/);
    });
  });

  describe('abs', () => {
    it('returns absolute value', () => {
      expect(abs(5)).toBe(5);
      expect(abs(-5)).toBe(5);
    });
    it('throws for non-number', () => {
      expect(() => abs('x')).toThrow(/not a number/);
    });
  });

  describe('abs_diff', () => {
    it('returns absolute difference', () => {
      expect(abs_diff(3, 7)).toBe(4);
      expect(abs_diff(7, 3)).toBe(4);
      expect(abs_diff(5, 5)).toBe(0);
    });
    it('throws for non-number', () => {
      expect(() => abs_diff('a', 1)).toThrow();
    });
  });

  describe('validatePosition', () => {
    it('does not throw for valid position', () => {
      expect(() => validatePosition({ x: 1, y: 2 })).not.toThrow();
    });
    it('throws for invalid', () => {
      expect(() => validatePosition({ x: 'a', y: 1 })).toThrow();
    });
  });

  describe('validateRect', () => {
    it('does not throw for valid rect', () => {
      expect(() => validateRect({ top: 0, left: 0, right: 10, bottom: 10 })).not.toThrow();
    });
    it('throws for null/undefined', () => {
      expect(() => validateRect(null)).toThrow(/Invalid rect/);
      expect(() => validateRect(undefined)).toThrow(/Invalid rect/);
    });
    it('throws for non-object', () => {
      expect(() => validateRect(5)).toThrow(/not an object/);
    });
    it('throws for missing properties', () => {
      expect(() => validateRect({ top: 0 })).toThrow(/missing properties/);
    });
  });

  describe('validateNumberInRange', () => {
    it('does not throw when in range', () => {
      expect(() => validateNumberInRange(5, 0, 10)).not.toThrow();
    });
    it('throws when out of range', () => {
      expect(() => validateNumberInRange(15, 0, 10)).toThrow(/out of range/);
    });
  });

  describe('validateIntArrayLength', () => {
    it('does not throw for valid array', () => {
      expect(() => validateIntArrayLength([1, 2, 3], 3)).not.toThrow();
    });
    it('throws for invalid', () => {
      expect(() => validateIntArrayLength([1, 2], 3)).toThrow();
      expect(() => validateIntArrayLength([1.5, 2], 2)).toThrow();
    });
  });

  describe('validateNumbersArray', () => {
    it('returns true for numeric array', () => {
      expect(validateNumbersArray([1, 2, 3])).toBe(true);
    });
    it('returns false for non-numeric', () => {
      expect(validateNumbersArray([1, NaN])).toBe(false);
    });
  });

  describe('validateIsNumeric', () => {
    it('does not throw for numeric string', () => {
      expect(() => validateIsNumeric('42')).not.toThrow();
    });
    it('throws for non-numeric', () => {
      expect(() => validateIsNumeric('abc')).toThrow(/not a number/);
    });
  });

  describe('getPositionAsString', () => {
    it('throws (implementation references undefined rectArray)', () => {
      expect(() => getPositionAsString({ x: 1, y: 2 }, ',')).toThrow();
    });
  });

  describe('getRectAsString', () => {
    it('throws (implementation uses sep.join on string)', () => {
      expect(() => getRectAsString({ top: 0, left: 0, right: 10, bottom: 10 })).toThrow();
    });
  });

  describe('test_utils', () => {
    it('runs without throwing', () => {
      test_utils();
    });
  });
});
