// modules/composables/useParallaxVue3Enhanced.mjs
// Enhanced Vue 3 parallax composable with provide/inject support.
//
// ARCHITECTURE: Bizcard and skill card positions in 3D scene space are constant and fixed
// after initialization. Motion parallax is ONLY applied here during focal-point–sensitive
// rendering: we set transform (translateX/translateY) on cards; we never mutate left/top
// or move elements in the scene.

import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useBullsEyeService, useFocalPointService, useDebugFunctions } from '../core/globalServices'
import { useLayoutToggle } from './useLayoutToggle.mjs'
import * as zUtils from '../utils/zUtils.mjs'
import { linearInterp } from '../utils/mathUtils.mjs'
import { getRendering } from '../core/renderingConfig.mjs'
import { logger } from '../utils/logger.mjs'

// Parallax constants (Z 1 = far, Z 14 = close; higher scene Z = more parallax)
const PARALLAX_X_EXAGGERATION = 0.9
const PARALLAX_Y_EXAGGERATION = 1.0
const CLONE_Z_SCALE = 0
// zUtils: master uses PARALLAX_SCENE_Z_*; this branch exports FLYER_PARALLAX_Z_* (same 1–14 range).
const PARALLAX_Z_MIN = zUtils.FLYER_PARALLAX_Z_MIN
const PARALLAX_Z_MAX = zUtils.FLYER_PARALLAX_Z_MAX
const PARALLAX_Z_RANGE = zUtils.FLYER_PARALLAX_Z_RANGE
// Base z-scale (built-in ramp): near = 0.9, far = 0; matches legacy MAX_Z_SCALE behavior.
const BASE_Z_SCALE_AT_NEAR = 0.9
const BASE_Z_SCALE_AT_FAR = 0

/** Base z-scale (built-in): linear ramp from near (0.9) to far (0). Same idea as legacy useParallaxVue3. */
function getBaseZScaleAtZ(sceneZ) {
  return linearInterp(sceneZ, PARALLAX_Z_MIN, BASE_Z_SCALE_AT_NEAR, PARALLAX_Z_MAX, BASE_Z_SCALE_AT_FAR)
}

/** User-configurable parallax scale at a given scene Z (3D Settings). AtMinZ = near, AtMaxZ = far. */
function getParallaxScaleAtZ(sceneZ) {
  const r = getRendering()
  const atMinZ = (typeof r.parallaxScaleAtMinZ === 'number' && !Number.isNaN(r.parallaxScaleAtMinZ)) ? r.parallaxScaleAtMinZ : 1.0  // at min scene Z (near)
  const atMaxZ = (typeof r.parallaxScaleAtMaxZ === 'number' && !Number.isNaN(r.parallaxScaleAtMaxZ)) ? r.parallaxScaleAtMaxZ : 1.0  // at max scene Z (far)
  return linearInterp(sceneZ, PARALLAX_Z_MIN, atMinZ, PARALLAX_Z_MAX, atMaxZ)
}

// Enhanced parallax composable that uses provide/inject instead of window globals
export function useParallaxEnhanced() {
  // Use provide/inject services instead of window objects
  const bullsEye = useBullsEyeService()
  const focalPoint = useFocalPointService()
  const debugFunctions = useDebugFunctions()
  const { orientation } = useLayoutToggle()

  // Reactive state
  const isInitialized = ref(false)
  const lastRenderTime = ref(0)
  const renderCount = ref(0)
  const previousDisplacements = ref({ dh: null, dv: null, bullsEyeCenterXSceneView: null })
  const previousSceneViewTopLeft = ref({ left: null, top: null })
  let rafScheduled = false

  /** Bulls-eye center: read from #bulls-eye DOM (single source of truth) so projection always uses actual position. */
  const getBullsEyePosition = () => {
    const el = typeof document !== 'undefined' && document.getElementById('bulls-eye')
    if (el) {
      const rect = el.getBoundingClientRect()
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    }
    if (bullsEye?.getPosition) return bullsEye.getPosition()
    return debugFunctions?.getBullsEyePosition?.() || { x: 0, y: 0 }
  }

  /** Effective focal position for parallax: read directly from the displayed #focal-point element (single source of truth). */
  const getEffectiveFocalPosition = () => {
    const el = typeof document !== 'undefined' && document.getElementById('focal-point')
    if (el) {
      const style = window.getComputedStyle(el)
      if (style.visibility !== 'hidden' && style.display !== 'none') {
        const rect = el.getBoundingClientRect()
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
      }
    }
    if (focalPoint?.getPosition) return focalPoint.getPosition()
    return debugFunctions?.getFocalPointPosition?.() || { x: window.innerWidth / 2, y: window.innerHeight / 2 }
  }

  const getFocalPointPosition = () => getEffectiveFocalPosition()

  const getViewportOrigin = () => {
    return debugFunctions?.getViewportOrigin?.() || { x: 0, y: 0 }
  }

  function isClone(cardDiv) {
    return cardDiv.id && cardDiv.id.indexOf('clone') !== -1
  }

  function hasClone(cardDiv) {
    return cardDiv.classList && cardDiv.classList.contains('hasClone')
  }
  // Clones use SELECTED_CLONE_SCENE_Z (14, same range as cards); they are skipped here so their transform is never changed.

  /** Apply projection: X = bullsEyeCenterXSceneView + parallax; Y = parallax only. Clones are skipped so their geometry is never changed. */
  function applyParallaxToCardDiv(cardDiv, bullsEyeCenterXSceneView, dh, dv) {
    if (!cardDiv) return false
    if (hasClone(cardDiv)) return false
    if (isClone(cardDiv)) return false

    const sceneZ = parseFloat(cardDiv.getAttribute('data-sceneZ'))
    if (isNaN(sceneZ) || sceneZ < PARALLAX_Z_MIN || sceneZ > PARALLAX_Z_MAX) return false

    // Option B: base z-scale (built-in ramp) × user scale (3D Settings). Then apply to x,y displacements.
    const baseZScale = getBaseZScaleAtZ(sceneZ)
    const userScale = getParallaxScaleAtZ(sceneZ)
    const finalScale = baseZScale * userScale
    const displacementX = dh * finalScale
    const displacementY = dv * finalScale
    const translateX = bullsEyeCenterXSceneView + displacementX
    const translateY = displacementY

    cardDiv.style.transform = `translateX(${translateX}px) translateY(${translateY}px)`

    return true
  }

  /** True when scene container and scene elements (cards/plane) exist so parallax can run. */
  function isSceneReady() {
    const scene = typeof document !== 'undefined' && document.getElementById('scene-container')
    if (!scene) return false
    const plane = scene.querySelector('#scene-plane')
    return !!(plane && (scene.querySelector('.biz-card-div') || scene.querySelector('.skill-card-div')))
  }

  /** Refresh all projection transforms: projected X = bullsEyeCenterXSceneView + parallax; Y = parallax only. */
  function refreshAllParallaxTransforms() {
    if (!isSceneReady()) return

    const scene = document.getElementById('scene-container')
    const plane = scene && scene.querySelector('#scene-plane')
    if (!plane) return

    const bullsEyeCenter = getBullsEyePosition()
    const focal = getEffectiveFocalPosition()
    const sceneViewRect = scene.getBoundingClientRect()
    const sceneViewTopLeft = { left: sceneViewRect.left, top: sceneViewRect.top }
    const prevTopLeft = previousSceneViewTopLeft.value
    if (prevTopLeft.left !== sceneViewTopLeft.left || prevTopLeft.top !== sceneViewTopLeft.top) {
      previousSceneViewTopLeft.value = { left: sceneViewTopLeft.left, top: sceneViewTopLeft.top }
    }

    // SceneView-relative X so projection works for both scene-left and scene-right (viewport .x alone is wrong when scene is on the right).
    const bullsEyeCenterXSceneView = bullsEyeCenter.x - sceneViewRect.left
    const dh = (bullsEyeCenter.x - focal.x) * PARALLAX_X_EXAGGERATION
    const dv = (bullsEyeCenter.y - focal.y) * PARALLAX_Y_EXAGGERATION

    // DEBUG tracking disabled for performance (was causing sluggish hover motion)

    const prev = previousDisplacements.value
    const shouldSkipUpdate = prev.dh === dh && prev.dv === dv && prev.bullsEyeCenterXSceneView === bullsEyeCenterXSceneView

    if (shouldSkipUpdate) {
      return
    }

    // Always query from the plane so every card gets the transform (no stale registry cache).
    const bizCardDivs = Array.from(plane.querySelectorAll('.biz-card-div'))
    const skillCardDivs = Array.from(plane.querySelectorAll('.skill-card-div'))

    for (const div of bizCardDivs) {
      applyParallaxToCardDiv(div, bullsEyeCenterXSceneView, dh, dv)
    }
    for (const div of skillCardDivs) {
      applyParallaxToCardDiv(div, bullsEyeCenterXSceneView, dh, dv)
    }
    previousDisplacements.value = { dh, dv, bullsEyeCenterXSceneView, focal }
  }

  // Enhanced render function: apply parallax transforms directly
  const renderAllCDivs = () => {
    if (!isInitialized.value) return

    const startTime = performance.now()
    try {
      refreshAllParallaxTransforms()
      lastRenderTime.value = performance.now() - startTime
      renderCount.value++
      if (lastRenderTime.value > 16) {
        logger.warn(`[ParallaxEnhanced] Slow render: ${lastRenderTime.value.toFixed(2)}ms`)
      }
    } catch (error) {
      logger.error('[ParallaxEnhanced] Render error:', error)
      throw error
    }
  }
  
  // Event handlers using provide/inject services
  const handleFocalPointChanged = () => {
    renderAllCDivs()
  }

  const handleBullsEyeMoved = () => {
    renderAllCDivs()
  }

  // Setup event listeners
  const setupEventListeners = () => {
    window.addEventListener('focal-point-changed', handleFocalPointChanged)
    window.addEventListener('bulls-eye-moved', handleBullsEyeMoved)
    window.addEventListener('scene-width-changed', renderAllCDivs)
    window.addEventListener('resize', renderAllCDivs)
  }

  const removeEventListeners = () => {
    window.removeEventListener('focal-point-changed', handleFocalPointChanged)
    window.removeEventListener('bulls-eye-moved', handleBullsEyeMoved)
    window.removeEventListener('scene-width-changed', renderAllCDivs)
    window.removeEventListener('resize', renderAllCDivs)
  }
  
  // Service availability checks
  const checkServices = () => {
    return {
      'bullsEye service': !!bullsEye,
      'focalPoint service': !!focalPoint,
      'debugFunctions service': !!debugFunctions,
      'bullsEye ready': bullsEye?.isReady?.() || false
    }
  }
  
  // Initialization
  const initialize = () => {
    setupEventListeners()
    isInitialized.value = true
    // Initial parallax run when scene is ready (may be no-op if scene not ready yet)
    requestAnimationFrame(() => refreshAllParallaxTransforms())

    // Make functions available globally for backwards compatibility
    window.getBullsEyePosition = getBullsEyePosition
    window.getFocalPointPosition = getFocalPointPosition
    window.getViewportOrigin = getViewportOrigin
    // NOTE: Do NOT assign renderAllCDivs to window to avoid circular reference
  }

  const destroy = () => {
    removeEventListeners()
    isInitialized.value = false
    renderCount.value = 0
  }
  
  // Lifecycle hooks
  onMounted(() => {
    initialize()
  })
  
  onUnmounted(() => {
    destroy()
  })
  
  // Performance stats
  const stats = computed(() => ({
    initialized: isInitialized.value,
    renderCount: renderCount.value,
    lastRenderTime: lastRenderTime.value,
    averageRenderTime: renderCount.value > 0 ? lastRenderTime.value : 0,
    serviceAvailability: {
      bullsEye: !!bullsEye,
      focalPoint: !!focalPoint,
      debugFunctions: !!debugFunctions
    }
  }))
  
  return {
    // State
    isInitialized,
    stats,
    
    // Position getters (using injected services)
    getBullsEyePosition,
    getFocalPointPosition,
    getViewportOrigin,
    
    // Core functions
    renderAllCDivs,
    initialize,
    destroy,
    checkServices,
    
    // Service access
    bullsEye,
    focalPoint,
    debugFunctions
  }
}
