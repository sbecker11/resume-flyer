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

// Parallax constants (flock-of-postcards–aligned: Z 1 = far, Z 14 = close; higher Z = more parallax)
const PARALLAX_X_EXAGGERATION_FACTOR = 0.9
const PARALLAX_Y_EXAGGERATION_FACTOR = 1.0
const CLONE_Z_SCALE = 0
const MAX_Z_SCALE = parseFloat(import.meta.env.VITE_PARALLAX_SCALE_AT_MAX_Z, 10) || 0.9
const PARALLAX_Z_MIN = zUtils.FLOCK_PARALLAX_Z_MIN
const PARALLAX_Z_MAX = zUtils.FLOCK_PARALLAX_Z_MAX
const PARALLAX_Z_RANGE = zUtils.FLOCK_PARALLAX_Z_RANGE

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
  const previousCenterLog = ref({ bullsEyeCenterX2D: null, firstBizCardCenterX2D: null, diff: null })
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

    // Z = distance from viewer (high Z = far). Closeness = PARALLAX_Z_MAX - Z; more closeness = more parallax.
    const closeness = PARALLAX_Z_MAX - sceneZ
    const zScale = (closeness / PARALLAX_Z_RANGE) * MAX_Z_SCALE

    const translateX = bullsEyeCenterXSceneView + dh * zScale
    const translateY = dv * zScale
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
      const layout = orientation.value === 'scene-left' ? 'scene-left' : 'scene-right'
      console.log('** SCENEVIEW **', layout, 'topLeft:', sceneViewTopLeft.left.toFixed(0), sceneViewTopLeft.top.toFixed(0))
      previousSceneViewTopLeft.value = { left: sceneViewTopLeft.left, top: sceneViewTopLeft.top }
    }
    // SceneView-relative X so projection works for both scene-left and scene-right (viewport .x alone is wrong when scene is on the right).
    const bullsEyeCenterXSceneView = bullsEyeCenter.x - sceneViewRect.left
    const dh = (bullsEyeCenter.x - focal.x) * PARALLAX_X_EXAGGERATION_FACTOR
    const dv = (bullsEyeCenter.y - focal.y) * PARALLAX_Y_EXAGGERATION_FACTOR

    const prev = previousDisplacements.value
    if (prev.dh === dh && prev.dv === dv && prev.bullsEyeCenterXSceneView === bullsEyeCenterXSceneView) return

    const FOCAL_MATCH_TOLERANCE_PX = 1.0
    const bullsEyeMatchesFocal = Math.abs(focal.x - bullsEyeCenter.x) <= FOCAL_MATCH_TOLERANCE_PX

    // Always query from the plane so every card gets the transform (no stale registry cache).
    const bizCardDivs = Array.from(plane.querySelectorAll('.biz-card-div'))
    const skillCardDivs = Array.from(plane.querySelectorAll('.skill-card-div'))
    const firstBiz = bizCardDivs.find(div => div.getAttribute('data-job-number') === '0') || bizCardDivs[0]

    for (const div of bizCardDivs) {
      applyParallaxToCardDiv(div, bullsEyeCenterXSceneView, dh, dv)
    }
    for (const div of skillCardDivs) {
      applyParallaxToCardDiv(div, bullsEyeCenterXSceneView, dh, dv)
    }
    if (firstBiz && bullsEyeMatchesFocal) {
      const rect = firstBiz.getBoundingClientRect()
      const firstBizCardCenterX2D = rect.left + rect.width / 2
      const bullsEyeCenterX2D = bullsEyeCenter.x
      const diff = firstBizCardCenterX2D - bullsEyeCenterX2D
      const prev = previousCenterLog.value
      const b1 = bullsEyeCenterX2D.toFixed(1)
      const c1 = firstBizCardCenterX2D.toFixed(1)
      const d1 = diff.toFixed(1)
      const changed = prev.bullsEyeCenterX2D !== b1 || prev.firstBizCardCenterX2D !== c1 || prev.diff !== d1
      if (changed) {
        console.log('* CENTER * [Parallax] ------------------------------')
        console.log('* CENTER * [Parallax] bullsEyeCenterX 2D :', bullsEyeCenterX2D.toFixed(1))
        console.log('* CENTER * [Parallax] first bizCardCenterX 2D :', firstBizCardCenterX2D.toFixed(1))
        console.log('* CENTER * [Parallax] error 2D: (' + firstBizCardCenterX2D.toFixed(1) + '-' + bullsEyeCenterX2D.toFixed(1) + ') =', diff.toFixed(1))
        previousCenterLog.value = { bullsEyeCenterX2D: b1, firstBizCardCenterX2D: c1, diff: d1 }
      }
    }
    previousDisplacements.value = { dh, dv, bullsEyeCenterXSceneView }
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
        console.warn(`[ParallaxEnhanced] Slow render: ${lastRenderTime.value.toFixed(2)}ms`)
      }
    } catch (error) {
      console.error('[ParallaxEnhanced] Render error:', error)
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
    const checks = {
      'bullsEye service': !!bullsEye,
      'focalPoint service': !!focalPoint,
      'debugFunctions service': !!debugFunctions,
      'bullsEye ready': bullsEye?.isReady?.() || false
    }
    
    Object.entries(checks).forEach(([check, result]) => {
      console.log(`[ParallaxEnhanced] ${check}: ${result ? '✅' : '❌'}`)
    })
    
    return checks
  }
  
  // Initialization
  const initialize = () => {
    console.log('[ParallaxEnhanced] Initializing with provide/inject services...')
    
    const serviceChecks = checkServices()
    
    setupEventListeners()
    isInitialized.value = true
    // Initial parallax run when scene is ready (may be no-op if scene not ready yet)
    requestAnimationFrame(() => refreshAllParallaxTransforms())

    // Make functions available globally for backwards compatibility
    window.getBullsEyePosition = getBullsEyePosition
    window.getFocalPointPosition = getFocalPointPosition
    window.getViewportOrigin = getViewportOrigin
    // NOTE: Do NOT assign renderAllCDivs to window to avoid circular reference
    
    console.log('[ParallaxEnhanced] ✅ Initialization complete')
  }
  
  const destroy = () => {
    removeEventListeners()
    isInitialized.value = false
    renderCount.value = 0
    console.log('[ParallaxEnhanced] Destroyed')
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
