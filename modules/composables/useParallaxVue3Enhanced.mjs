// modules/composables/useParallaxVue3Enhanced.mjs
// Enhanced Vue 3 parallax composable with provide/inject support.
//
// ARCHITECTURE: Bizcard and skill card positions in 3D scene space are constant and fixed
// after initialization. Motion parallax is ONLY applied here during focal-point–sensitive
// rendering: we set transform (translateX/translateY) on cards; we never mutate left/top
// or move elements in the scene.

import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useBullsEyeService, useFocalPointService, useDebugFunctions } from '../core/globalServices'
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

  // Reactive state
  const isInitialized = ref(false)
  const lastRenderTime = ref(0)
  const renderCount = ref(0)
  const previousDisplacements = ref({ dh: null, dv: null })
  // Mouse-over-scene: use actual mouse position for parallax so it works regardless of focal point mode
  const mouseOverScenePosition = ref(null)
  let rafScheduled = false

  // Get positions using injected services instead of window globals
  const getBullsEyePosition = () => {
    if (bullsEye?.getPosition) {
      return bullsEye.getPosition()
    }
    return debugFunctions?.getBullsEyePosition?.() || { x: 0, y: 0 }
  }

  const getFocalPointPosition = () => {
    if (focalPoint?.getPosition) {
      return focalPoint.getPosition()
    }
    return debugFunctions?.getFocalPointPosition?.() || { x: window.innerWidth / 2, y: window.innerHeight / 2 }
  }

  /** Effective focal position for parallax: mouse when over scene, otherwise store focal point */
  const getEffectiveFocalPosition = () => {
    if (mouseOverScenePosition.value) {
      return mouseOverScenePosition.value
    }
    return getFocalPointPosition()
  }

  const getViewportOrigin = () => {
    return debugFunctions?.getViewportOrigin?.() || { x: 0, y: 0 }
  }

  function isClone(cardDiv) {
    return cardDiv.id && cardDiv.id.indexOf('clone') !== -1
  }

  function hasClone(cardDiv) {
    return cardDiv.classList && cardDiv.classList.contains('hasClone')
  }
  // Clones (selected card copy) use FLOCK_SELECTED_CLONE_Z (-10), are skipped here, and are not subject to motion parallax; they follow scene vertical scroll only.

  /** Apply parallax transform only (render-time). Scene position left/top is never changed. */
  function applyParallaxToCardDiv(cardDiv, dh, dv) {
    if (!cardDiv) return false
    if (hasClone(cardDiv)) return false

    const sceneZ = parseFloat(cardDiv.getAttribute('data-sceneZ'))
    if (isNaN(sceneZ) || sceneZ < PARALLAX_Z_MIN || sceneZ > PARALLAX_Z_MAX) return false

    // Z = distance from viewer (high Z = far). Closeness = PARALLAX_Z_MAX - Z; more closeness = more parallax.
    const closeness = PARALLAX_Z_MAX - sceneZ
    const zScale = (closeness / PARALLAX_Z_RANGE) * MAX_Z_SCALE

    const translateX = dh * zScale
    const translateY = dv * zScale
    cardDiv.style.transform = `translateX(${translateX}px) translateY(${translateY}px)`
    return true
  }

  /** Refresh all parallax transforms using current bulls-eye and effective focal (mouse or store) */
  function refreshAllParallaxTransforms() {
    const bulls = getBullsEyePosition()
    const focal = getEffectiveFocalPosition()
    const dh = (bulls.x - focal.x) * PARALLAX_X_EXAGGERATION_FACTOR
    const dv = (bulls.y - focal.y) * PARALLAX_Y_EXAGGERATION_FACTOR

    const prev = previousDisplacements.value
    if (dh === 0 && dv === 0) return
    if (prev.dh === dh && prev.dv === dv) return

    let bizCardDivs = []
    if (typeof window !== 'undefined' && window.globalElementRegistry?.getAllBizCardDivs) {
      bizCardDivs = window.globalElementRegistry.getAllBizCardDivs()
    }
    if (bizCardDivs.length === 0) {
      bizCardDivs = Array.from(document.querySelectorAll('.biz-card-div'))
    }
    const skillCardDivs = Array.from(document.querySelectorAll('.skill-card-div'))

    for (const div of bizCardDivs) {
      applyParallaxToCardDiv(div, dh, dv)
    }
    for (const div of skillCardDivs) {
      applyParallaxToCardDiv(div, dh, dv)
    }
    previousDisplacements.value = { dh, dv }
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
    }
  }
  
  // Event handlers using provide/inject services
  const handleFocalPointChanged = () => {
    renderAllCDivs()
  }

  const handleBullsEyeMoved = () => {
    renderAllCDivs()
  }

  /** Throttled refresh for mousemove (one per frame) */
  function scheduleParallaxRefresh() {
    if (rafScheduled || !isInitialized.value) return
    rafScheduled = true
    requestAnimationFrame(() => {
      rafScheduled = false
      refreshAllParallaxTransforms()
    })
  }

  function handleSceneMouseMove(event) {
    mouseOverScenePosition.value = { x: event.clientX, y: event.clientY }
    scheduleParallaxRefresh()
  }

  function handleSceneMouseLeave() {
    mouseOverScenePosition.value = null
    scheduleParallaxRefresh()
  }

  function attachSceneMouseListeners() {
    const scene = typeof document !== 'undefined' && document.getElementById('scene-container')
    if (!scene) return false
    scene.addEventListener('mousemove', handleSceneMouseMove, { passive: true })
    scene.addEventListener('mouseleave', handleSceneMouseLeave, { passive: true })
    return true
  }

  function detachSceneMouseListeners() {
    const scene = typeof document !== 'undefined' && document.getElementById('scene-container')
    if (!scene) return
    scene.removeEventListener('mousemove', handleSceneMouseMove)
    scene.removeEventListener('mouseleave', handleSceneMouseLeave)
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
    detachSceneMouseListeners()
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
    // Mouse-over-scene drives parallax; scene may not be in DOM yet so retry
    if (!attachSceneMouseListeners()) {
      const retry = () => { attachSceneMouseListeners() }
      setTimeout(retry, 150)
      setTimeout(retry, 500)
    }
    // Apply initial parallax (e.g. when focal point is already offset from bulls-eye)
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