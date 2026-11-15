import { describe, it, expect, afterEach } from 'vitest';
import {
  CARD_MIN_Z,
  CARD_MAX_Z,
  get_brightness_value_from_z,
  get_brightness_str_from_z,
  get_blur_str_from_z,
  get_contrast_str_from_z,
  get_saturation_str_from_z,
  get_filterStr_from_z,
  shouldApplyZEffects,
} from './filters.mjs';
import { setFromAppState } from './renderingConfig.mjs';

describe('core/filters', () => {
  it('exports Z constants', () => {
    expect(CARD_MIN_Z).toBe(1);
    expect(CARD_MAX_Z).toBe(14);
  });

  it('get_brightness_value_from_z: min Z = 100%, max Z from rendering', () => {
    expect(get_brightness_value_from_z(7)).toBeGreaterThan(0);
    expect(get_brightness_value_from_z(7)).toBeLessThanOrEqual(1);
    expect(get_brightness_value_from_z(0)).toBe(1.0); // fixed min Z = 100%
  });

  it('get_brightness_str_from_z returns CSS brightness', () => {
    expect(get_brightness_str_from_z(7)).toMatch(/^brightness\(/);
  });

  it('get_blur_str_from_z: min Z = 0px', () => {
    expect(get_blur_str_from_z(5)).toMatch(/^blur\(/);
    expect(get_blur_str_from_z(0)).toBe('blur(0px)');
  });

  it('get_contrast_str_from_z returns CSS contrast', () => {
    expect(get_contrast_str_from_z(7)).toMatch(/^contrast\(/);
  });

  it('get_saturation_str_from_z returns CSS saturate', () => {
    expect(get_saturation_str_from_z(7)).toMatch(/^saturate\(/);
  });

  it('get_filterStr_from_z returns combined filter (no contrast)', () => {
    const s = get_filterStr_from_z(7);
    expect(s).toMatch(/brightness/);
    expect(s).toMatch(/blur/);
    expect(s).not.toMatch(/contrast/);
    expect(s).toMatch(/saturate/);
  });

  describe('zEffectsScope (biz-only restriction)', () => {
    afterEach(() => {
      // Reset to default scope so other tests in this file are unaffected.
      setFromAppState({ zEffectsScope: 'all' });
    });

    it('shouldApplyZEffects is true for any card type when scope is "all" (default)', () => {
      expect(shouldApplyZEffects('biz')).toBe(true);
      expect(shouldApplyZEffects('skill')).toBe(true);
      expect(shouldApplyZEffects(undefined)).toBe(true);
    });

    it('shouldApplyZEffects is false only for skill cards when scope is "biz-only"', () => {
      setFromAppState({ zEffectsScope: 'biz-only' });
      expect(shouldApplyZEffects('biz')).toBe(true);
      expect(shouldApplyZEffects('skill')).toBe(false);
    });

    it('biz-only scope: skill cards get no brightness/blur/saturation effect at Z', () => {
      setFromAppState({ zEffectsScope: 'biz-only', brightnessAtMaxZ: 50, blurAtMaxZ: 4, saturationAtMaxZ: 20 });
      expect(get_brightness_value_from_z(CARD_MAX_Z, 'skill')).toBe(1.0);
      expect(get_brightness_str_from_z(CARD_MAX_Z, 'skill')).toBe('brightness(100%)');
      expect(get_blur_str_from_z(CARD_MAX_Z, 'skill')).toBe('blur(0px)');
      expect(get_saturation_str_from_z(CARD_MAX_Z, 'skill')).toBe('saturate(1)');
      expect(get_filterStr_from_z(CARD_MAX_Z, 'skill')).toBe('brightness(100%) blur(0px) saturate(1)');
    });

    it('biz-only scope: biz cards still get the full Z effect', () => {
      setFromAppState({ zEffectsScope: 'biz-only', brightnessAtMaxZ: 50, blurAtMaxZ: 4, saturationAtMaxZ: 20 });
      expect(get_brightness_value_from_z(CARD_MAX_Z, 'biz')).toBeCloseTo(0.5);
      expect(get_blur_str_from_z(CARD_MAX_Z, 'biz')).toBe('blur(4px)');
      expect(get_saturation_str_from_z(CARD_MAX_Z, 'biz')).toMatch(/^saturate\(0\.19+6?\)$/);
    });

    it('"all" scope (default): skill cards also get the full Z effect', () => {
      setFromAppState({ zEffectsScope: 'all', brightnessAtMaxZ: 50, blurAtMaxZ: 4, saturationAtMaxZ: 20 });
      expect(get_brightness_value_from_z(CARD_MAX_Z, 'skill')).toBeCloseTo(0.5);
      expect(get_blur_str_from_z(CARD_MAX_Z, 'skill')).toBe('blur(4px)');
      expect(get_saturation_str_from_z(CARD_MAX_Z, 'skill')).toMatch(/^saturate\(0\.19+6?\)$/);
    });
  });
});
