// modules/core/renderingConfig.mjs
// Parallax/depth rendering constants from app_state.json system-constants.rendering.
// Synced when app state loads; used by filters.mjs and useParallaxVue3Enhanced.mjs.

const DEFAULTS = {
  parallaxScaleAtMinZ: 1.0,  // at min scene Z (1 = near; scene Z is distance-from-viewer, not z-index)
  parallaxScaleAtMaxZ: 1.0,   // at max scene Z (14 = far)
  saturationAtMaxZ: 100,      // percentage 0–100; 100 = no change
  brightnessAtMaxZ: 100,     // percentage 75–100; 100 = no z-based darkness
  blurAtMaxZ: 0
}

let current = { ...DEFAULTS }

/**
 * Update config from app state (system-constants.rendering). Call after loadAppState().
 * @param {object} [rendering] - state['system-constants'].rendering
 */
export function setFromAppState(rendering) {
  if (!rendering || typeof rendering !== 'object') return
  if (rendering.parallaxScaleAtMinZ !== undefined) current.parallaxScaleAtMinZ = Number(rendering.parallaxScaleAtMinZ)
  if (rendering.parallaxScaleAtMaxZ !== undefined) current.parallaxScaleAtMaxZ = Number(rendering.parallaxScaleAtMaxZ)
  // MinZ = near cards, MaxZ = far cards; allow any order; no constraint needed
  if (rendering.saturationAtMaxZ !== undefined) {
    const v = Number(rendering.saturationAtMaxZ)
    current.saturationAtMaxZ = (v >= 0 && v <= 1) ? Math.round(v * 100) : (Number.isNaN(v) ? DEFAULTS.saturationAtMaxZ : Math.max(0, Math.min(100, v)))
  }
  if (rendering.brightnessAtMaxZ !== undefined) {
    const v = Number(rendering.brightnessAtMaxZ)
    current.brightnessAtMaxZ = (v <= 1 && v > 0) ? Math.round(v * 100) : (Number.isNaN(v) ? DEFAULTS.brightnessAtMaxZ : Math.max(0, Math.min(100, v)))
  }
  if (rendering.blurAtMaxZ !== undefined) current.blurAtMaxZ = Math.max(0, Number(rendering.blurAtMaxZ)) ?? DEFAULTS.blurAtMaxZ
}

/**
 * Current rendering constants (always has all keys; defaults until app state loads).
 */
export function getRendering() {
  return { ...current }
}
