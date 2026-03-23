import { describe, it, expect, beforeEach } from 'vitest';
import { getRendering, setFromAppState } from './renderingConfig.mjs';

const DEFAULTS = {
  parallaxScaleAtMinZ: 1.0,
  parallaxScaleAtMaxZ: 1.0,
  saturationAtMaxZ: 100,
  brightnessAtMaxZ: 100,
  blurAtMaxZ: 0
};

describe('core/renderingConfig', () => {
  beforeEach(() => {
    setFromAppState(DEFAULTS);
  });

  describe('getRendering', () => {
    it('returns all rendering keys with default values', () => {
      const r = getRendering();
      expect(r).toEqual(DEFAULTS);
      expect(r).toHaveProperty('parallaxScaleAtMinZ', 1.0);
      expect(r).toHaveProperty('parallaxScaleAtMaxZ', 1.0);
      expect(r).toHaveProperty('saturationAtMaxZ', 100);
      expect(r).toHaveProperty('brightnessAtMaxZ', 100);
      expect(r).toHaveProperty('blurAtMaxZ', 0);
    });

    it('returns a new object each time (copy)', () => {
      const a = getRendering();
      const b = getRendering();
      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    });
  });

  describe('setFromAppState', () => {
    it('updates all values when given full object', () => {
      setFromAppState({
        parallaxScaleAtMinZ: 0.2,
        parallaxScaleAtMaxZ: 0.8,
        saturationAtMaxZ: 60,
        brightnessAtMaxZ: 75,
        blurAtMaxZ: 2
      });
      const r = getRendering();
      expect(r.parallaxScaleAtMinZ).toBe(0.2);
      expect(r.parallaxScaleAtMaxZ).toBe(0.8);
      expect(r.saturationAtMaxZ).toBe(60);
      expect(r.brightnessAtMaxZ).toBe(75);
      expect(r.blurAtMaxZ).toBe(2);
    });

    it('updates only provided keys (partial merge)', () => {
      setFromAppState({ blurAtMaxZ: 3 });
      const r = getRendering();
      expect(r.parallaxScaleAtMinZ).toBe(1.0);
      expect(r.parallaxScaleAtMaxZ).toBe(1.0);
      expect(r.saturationAtMaxZ).toBe(100);
      expect(r.brightnessAtMaxZ).toBe(100);
      expect(r.blurAtMaxZ).toBe(3);
    });

    it('coerces string numbers and converts legacy 0–1 brightness to percentage', () => {
      setFromAppState({
        parallaxScaleAtMinZ: '0.2',
        parallaxScaleAtMaxZ: '0.8',
        saturationAtMaxZ: '50',
        brightnessAtMaxZ: '90',
        blurAtMaxZ: '1'
      });
      const r = getRendering();
      expect(r.parallaxScaleAtMinZ).toBe(0.2);
      expect(r.parallaxScaleAtMaxZ).toBe(0.8);
      expect(r.saturationAtMaxZ).toBe(50);
      expect(r.brightnessAtMaxZ).toBe(90);
      expect(r.blurAtMaxZ).toBe(1);
    });

    it('converts legacy brightness 0.75 to 75%', () => {
      setFromAppState({ brightnessAtMaxZ: 0.75 });
      const r = getRendering();
      expect(r.brightnessAtMaxZ).toBe(75);
    });

    it('clamps to limits when provided (e.g. blurAtMaxZ min 0)', () => {
      const limits = { blurAtMaxZ: { min: 0, max: 5, step: 0.5 } };
      setFromAppState({ blurAtMaxZ: -1 }, limits);
      const r = getRendering();
      expect(r.blurAtMaxZ).toBe(0);
    });

    it('ignores undefined rendering (no-op)', () => {
      setFromAppState({ blurAtMaxZ: 5 });
      setFromAppState(undefined);
      const r = getRendering();
      expect(r.blurAtMaxZ).toBe(5);
    });

    it('ignores null rendering (no-op)', () => {
      setFromAppState({ blurAtMaxZ: 5 });
      setFromAppState(null);
      const r = getRendering();
      expect(r.blurAtMaxZ).toBe(5);
    });

    it('ignores non-object (no-op)', () => {
      setFromAppState({ blurAtMaxZ: 5 });
      setFromAppState('invalid');
      const r = getRendering();
      expect(r.blurAtMaxZ).toBe(5);
    });

    it('accepts 0.0 for parallaxScaleAtMaxZ (far cards no parallax)', () => {
      setFromAppState({ parallaxScaleAtMaxZ: 0.0 });
      const r = getRendering();
      expect(r.parallaxScaleAtMaxZ).toBe(0.0);
      expect(r.parallaxScaleAtMinZ).toBe(1.0);
    });

    it('keeps values when no limits provided (no clamping)', () => {
      setFromAppState({ saturationAtMaxZ: 0, brightnessAtMaxZ: 0 });
      const r = getRendering();
      expect(r.saturationAtMaxZ).toBe(0);
      expect(r.brightnessAtMaxZ).toBe(0);
    });

    it('converts legacy saturation 0.6 to 60%', () => {
      setFromAppState({ saturationAtMaxZ: 0.6 });
      const r = getRendering();
      expect(r.saturationAtMaxZ).toBe(60);
    });

    it('uses custom limits when provided (e.g. brightness 0 allowed)', () => {
      const limits = { brightnessAtMaxZ: { min: 0, max: 100, step: 5 } };
      setFromAppState({ saturationAtMaxZ: 0, brightnessAtMaxZ: 0 }, limits);
      const r = getRendering();
      expect(r.saturationAtMaxZ).toBe(0);
      expect(r.brightnessAtMaxZ).toBe(0);
    });
  });
});
