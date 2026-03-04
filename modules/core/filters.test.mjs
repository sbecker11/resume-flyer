import { describe, it, expect } from 'vitest';
import {
  MIN_BRIGHTNESS_PERCENT,
  BLUR_Z_SCALE_FACTOR,
  CARD_MIN_Z,
  CARD_MAX_Z,
  get_brightness_value_from_z,
  get_brightness_str_from_z,
  get_blur_str_from_z,
  get_contrast_str_from_z,
  get_saturation_str_from_z,
  get_filterStr_from_z,
} from './filters.mjs';

describe('core/filters', () => {
  it('exports constants', () => {
    expect(MIN_BRIGHTNESS_PERCENT).toBe(75);
    expect(BLUR_Z_SCALE_FACTOR).toBe(4);
    expect(CARD_MIN_Z).toBe(1);
    expect(CARD_MAX_Z).toBe(14);
  });

  it('get_brightness_value_from_z returns number', () => {
    expect(get_brightness_value_from_z(7)).toBeGreaterThan(0);
    expect(get_brightness_value_from_z(7)).toBeLessThanOrEqual(1);
    expect(get_brightness_value_from_z(0)).toBe(1);
  });

  it('get_brightness_str_from_z returns CSS brightness', () => {
    expect(get_brightness_str_from_z(7)).toMatch(/^brightness\(/);
  });

  it('get_blur_str_from_z returns CSS blur', () => {
    expect(get_blur_str_from_z(5)).toMatch(/^blur\(/);
    expect(get_blur_str_from_z(0)).toBe('blur(0px)');
  });

  it('get_contrast_str_from_z returns CSS contrast', () => {
    expect(get_contrast_str_from_z(7)).toMatch(/^contrast\(/);
  });

  it('get_saturation_str_from_z returns CSS saturate', () => {
    expect(get_saturation_str_from_z(7)).toMatch(/^saturate\(/);
  });

  it('get_filterStr_from_z returns combined filter', () => {
    const s = get_filterStr_from_z(7);
    expect(s).toMatch(/brightness/);
    expect(s).toMatch(/blur/);
    expect(s).toMatch(/contrast/);
    expect(s).toMatch(/saturate/);
  });
});
