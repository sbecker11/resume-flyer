import { describe, it, expect, beforeEach } from 'vitest';
import {
  ALL_CARDS_Z_INDEX_MIN,
  ALL_CARDS_Z_INDEX_MAX,
  FLYER_Z_MAX,
  FLYER_BIZCARD_Z_INDEX_MIN,
  FLYER_BIZCARD_Z_INDEX_MAX,
  FLYER_SKILL_Z_INDEX_MIN,
  FLYER_SKILL_Z_INDEX_MAX,
  Z_from_z_index,
  z_index_from_Z,
  z_from_z_index,
  z_index_from_z,
  get_z_index_from_z,
  validate_zIndexStr,
  validate_z_index,
  validate_zIndex,
  validate_z,
  get_z_from_zIndexStr,
  get_zIndexStr_from_z,
  test_zUtils,
} from './zUtils.mjs';

beforeEach(() => {
  if (globalThis.window) globalThis.window.CONSOLE_LOG_IGNORE = () => {};
});

describe('zUtils', () => {
  describe('z_from_z_index and z_index_from_z', () => {
    it('round-trip', () => {
      const zIndex = ALL_CARDS_Z_INDEX_MIN;
      expect(z_index_from_z(z_from_z_index(zIndex))).toBe(zIndex);
    });
  });

  describe('get_z_index_from_z', () => {
    it('returns z_index for valid z', () => {
      const z = 15;
      expect(get_z_index_from_z(z)).toBeDefined();
    });
  });

  describe('validate_zIndexStr', () => {
    it('accepts valid string', () => {
      expect(() => validate_zIndexStr(String(ALL_CARDS_Z_INDEX_MIN))).not.toThrow();
    });
    it('throws for invalid', () => {
      expect(() => validate_zIndexStr('')).toThrow();
      expect(() => validate_zIndexStr('999')).toThrow();
    });
  });

  describe('validate_z_index and validate_zIndex', () => {
    it('accept valid range', () => {
      expect(() => validate_z_index(ALL_CARDS_Z_INDEX_MIN)).not.toThrow();
      expect(() => validate_zIndex(ALL_CARDS_Z_INDEX_MIN)).not.toThrow();
    });
    it('throw for out of range', () => {
      expect(() => validate_zIndex(ALL_CARDS_Z_INDEX_MAX + 1)).toThrow();
    });
  });

  describe('validate_z', () => {
    it('accepts valid z', () => {
      expect(() => validate_z(15)).not.toThrow();
    });
    it('throws for invalid', () => {
      expect(() => validate_z(0)).toThrow();
    });
  });

  describe('get_z_from_zIndexStr and get_zIndexStr_from_z', () => {
    it('round-trip', () => {
      const z = 15;
      const str = get_zIndexStr_from_z(z);
      expect(get_z_from_zIndexStr(str)).toBe(z);
    });
  });

  describe('test_zUtils', () => {
    it('runs without throwing', () => {
      test_zUtils();
    });
  });

  describe('Z = maxZ - z_index mapping', () => {
    it('Z_from_z_index gives distance (higher z_index = lower Z)', () => {
      expect(Z_from_z_index(1)).toBe(FLYER_Z_MAX - 1);
      expect(Z_from_z_index(FLYER_Z_MAX)).toBe(0);
    });
    it('z_index_from_Z round-trips with Z_from_z_index', () => {
      expect(z_index_from_Z(Z_from_z_index(5))).toBe(5);
    });
  });

  describe('bizCard vs skillCard z_index invariant', () => {
    it('biz z_index max is less than skill z_index min so skill cards render above biz cards', () => {
      expect(FLYER_BIZCARD_Z_INDEX_MAX).toBeLessThan(FLYER_SKILL_Z_INDEX_MIN);
    });
    it('biz and skill z_index ranges do not overlap', () => {
      expect(FLYER_BIZCARD_Z_INDEX_MAX).toBeLessThan(FLYER_SKILL_Z_INDEX_MIN);
    });
  });
});
