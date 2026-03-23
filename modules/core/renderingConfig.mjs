// modules/core/renderingConfig.mjs
// Parallax/depth rendering constants from app_state.json system-constants.rendering.
// Synced when app state loads; used by filters.mjs and useParallaxVue3Enhanced.mjs.
// Min/max/step for 3D sliders: ONLY from app_state.json (local) or app_state.default.json (GitHub Pages).
// renderingConfig does not define limits; callers pass system-constants.renderingLimits from state.

const DEFAULTS = {
  parallaxScaleAtMinZ: 1.0,  // at min scene Z (1 = near; scene Z is distance-from-viewer, not z-index)
  parallaxScaleAtMaxZ: 1.0,   // at max scene Z (14 = far)
  saturationAtMaxZ: 100,      // percentage 0–100; 100 = no change
  brightnessAtMaxZ: 100,     // percentage 0–100; 100 = no z-based darkness
  blurAtMaxZ: 0
}

/**
 * Clamp a value using rendering limits from app state (app_state.json or app_state.default.json).
 * If limits or limits[field] is missing, returns value unchanged (no hardcoded fallback).
 * @param {object} limits - system-constants.renderingLimits from state
 * @param {string} field - key e.g. 'brightnessAtMaxZ'
 * @param {number} value
 * @returns {number}
 */
export function clampRenderingValue(limits, field, value) {
  const lim = limits && limits[field]
  if (!lim) return value
  const n = Number(value)
  if (Number.isNaN(n)) return lim.min
  return Math.max(lim.min, Math.min(lim.max, n))
}

let current = { ...DEFAULTS }

/**
 * Update config from app state (system-constants.rendering). Call after loadAppState().
 * If limits provided, values are clamped to renderingLimits (e.g. from app_state.json).
 * @param {object} [rendering] - state['system-constants'].rendering
 * @param {object} [limits] - state['system-constants'].renderingLimits (optional; when omitted, no clamping)
 */
export function setFromAppState(rendering, limits) {
  if (!rendering || typeof rendering !== 'object') return
  const clamp = (val, field) => clampRenderingValue(limits || null, field, val)
  if (rendering.parallaxScaleAtMinZ !== undefined) current.parallaxScaleAtMinZ = clamp(Number(rendering.parallaxScaleAtMinZ), 'parallaxScaleAtMinZ')
  if (rendering.parallaxScaleAtMaxZ !== undefined) current.parallaxScaleAtMaxZ = clamp(Number(rendering.parallaxScaleAtMaxZ), 'parallaxScaleAtMaxZ')
  // MinZ = near cards, MaxZ = far cards; allow any order; no constraint needed
  if (rendering.saturationAtMaxZ !== undefined) {
    const v = Number(rendering.saturationAtMaxZ)
    const pct = (v >= 0 && v <= 1) ? Math.round(v * 100) : v
    current.saturationAtMaxZ = Number.isNaN(pct) ? DEFAULTS.saturationAtMaxZ : clamp(pct, 'saturationAtMaxZ')
  }
  if (rendering.brightnessAtMaxZ !== undefined) {
    const v = Number(rendering.brightnessAtMaxZ)
    const pct = (v <= 1 && v > 0) ? Math.round(v * 100) : v
    current.brightnessAtMaxZ = Number.isNaN(pct) ? DEFAULTS.brightnessAtMaxZ : clamp(pct, 'brightnessAtMaxZ')
  }
  if (rendering.blurAtMaxZ !== undefined) current.blurAtMaxZ = clamp(Number(rendering.blurAtMaxZ), 'blurAtMaxZ') ?? DEFAULTS.blurAtMaxZ
}

/**
 * Current rendering constants (always has all keys; defaults until app state loads).
 */
export function getRendering() {
  return { ...current }
}
