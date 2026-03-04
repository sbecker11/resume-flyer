import { describe, it, expect, beforeEach } from 'vitest';
import {
  getPositionsSquaredDistance,
  getSquaredDistance,
  getEuclideanDistance,
  getRectSquaredDifference,
  getRandomInt,
  getRandomSign,
  getRandomSignedOffset,
  linearInterp,
  linearInterpArray,
  isNumericArray,
  validateIsNumericArray,
  arrayHasNaNs,
  arraysAreEqual,
  validateIsArray,
  validateIsArrayOfArrays,
  formatNumber,
  test_mathutils,
} from './mathUtils.mjs';

beforeEach(() => {
  if (globalThis.window) globalThis.window.CONSOLE_LOG_IGNORE = () => {};
});

describe('mathUtils', () => {
  describe('getPositionsSquaredDistance', () => {
    it('returns squared distance for positions', () => {
      expect(getPositionsSquaredDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(25);
    });
  });

  describe('getSquaredDistance', () => {
    it('returns squared distance for arrays', () => {
      expect(getSquaredDistance([0, 0], [3, 4])).toBe(25);
    });
  });

  describe('getEuclideanDistance', () => {
    it('returns euclidean distance', () => {
      expect(getEuclideanDistance([0, 0], [3, 4])).toBe(5);
    });
  });

  describe('getRectSquaredDifference', () => {
    it('returns sum of squared diffs', () => {
      const r1 = { top: 0, left: 0, right: 10, bottom: 10 };
      const r2 = { top: 1, left: 0, right: 10, bottom: 10 };
      expect(getRectSquaredDifference(r1, r2)).toBe(1);
    });
  });

  describe('getRandomInt', () => {
    it('returns int in range', () => {
      for (let i = 0; i < 20; i++) {
        const n = getRandomInt(1, 5);
        expect(Number.isInteger(n)).toBe(true);
        expect(n).toBeGreaterThanOrEqual(1);
        expect(n).toBeLessThanOrEqual(5);
      }
    });
  });

  describe('getRandomSign', () => {
    it('returns 1 or -1', () => {
      const signs = new Set();
      for (let i = 0; i < 50; i++) signs.add(getRandomSign());
      expect(signs.has(1)).toBe(true);
      expect(signs.has(-1)).toBe(true);
    });
  });

  describe('getRandomSignedOffset', () => {
    it('returns value in [-max, max]', () => {
      for (let i = 0; i < 20; i++) {
        const v = getRandomSignedOffset(10);
        expect(v).toBeGreaterThanOrEqual(-10);
        expect(v).toBeLessThanOrEqual(10);
      }
    });
  });

  describe('linearInterp', () => {
    it('interpolates', () => {
      expect(linearInterp(0.5, 0, 0, 1, 10)).toBe(5);
    });
    it('throws when x0 === x1', () => {
      expect(() => linearInterp(0.5, 1, 0, 1, 10)).toThrow(/cannot be the same/);
    });
  });

  describe('linearInterpArray', () => {
    it('throws for unequal length', () => {
      expect(() => linearInterpArray(0.5, ['1', '2'], ['1', '2', '3'])).toThrow(/length not equal/);
    });
    it('validates input arrays are numeric', () => {
      expect(() => linearInterpArray(0.5, ['a'], ['1'])).toThrow(/numeric/);
    });
  });

  describe('isNumericArray', () => {
    it('returns true for numeric string array', () => {
      expect(isNumericArray(['1', '2'])).toBe(true);
    });
    it('returns false for non-numeric', () => {
      expect(isNumericArray(['a'])).toBe(false);
      expect(isNumericArray(1)).toBe(false);
    });
  });

  describe('validateIsNumericArray', () => {
    it('throws for invalid', () => {
      expect(() => validateIsNumericArray(['a'])).toThrow();
    });
  });

  describe('arrayHasNaNs', () => {
    it('returns true if any NaN', () => {
      expect(arrayHasNaNs([1, NaN, 3])).toBe(true);
    });
    it('returns false if no NaN', () => {
      expect(arrayHasNaNs([1, 2, 3])).toBe(false);
    });
  });

  describe('arraysAreEqual', () => {
    it('returns true for equal arrays', () => {
      expect(arraysAreEqual([1, 2], [1, 2])).toBe(true);
    });
    it('returns false for different', () => {
      expect(arraysAreEqual([1, 2], [1, 3])).toBe(false);
      expect(arraysAreEqual([1, 2], [1, 2, 3])).toBe(false);
    });
  });

  describe('validateIsArray', () => {
    it('throws for non-array', () => {
      expect(() => validateIsArray({})).toThrow();
    });
    it('throws for empty array', () => {
      expect(() => validateIsArray([])).toThrow(/length must be greater/);
    });
  });

  describe('validateIsArrayOfArrays', () => {
    it('accepts array of arrays', () => {
      expect(() => validateIsArrayOfArrays([[1], [2]])).not.toThrow();
    });
    it('throws for non-array', () => {
      expect(() => validateIsArrayOfArrays({})).toThrow();
    });
    it('throws for empty', () => {
      expect(() => validateIsArrayOfArrays([])).toThrow();
    });
  });

  describe('formatNumber', () => {
    it('formats with whole and decimal digits', () => {
      expect(formatNumber(1.5, '2.1')).toBe('01.5');
    });
    it('throws when whole part too large', () => {
      expect(() => formatNumber(1000, '2.1')).toThrow(/Format error/);
    });
  });

  describe('test_mathutils', () => {
    it('runs without throwing', () => {
      test_mathutils();
    });
  });
});
