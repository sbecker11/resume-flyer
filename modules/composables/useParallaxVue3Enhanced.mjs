// modules/composables/useParallaxVue3Enhanced.mjs
// Enhanced Vue 3 parallax composable with provide/inject support

import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useBullsEyeService, useFocalPointService, useDebugFunctions } from '../core/globalServices'

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
  
  const getViewportOrigin = () => {
    return debugFunctions?.getViewportOrigin?.() || { x: 0, y: 0 }
  }
  
  // Enhanced render function that uses injected services
  const renderAllCDivs = () => {
    if (!isInitialized.value) {
      console.log('[ParallaxEnhanced] Not initialized, skipping render')
      return
    }
    
    const startTime = performance.now()
    
    try {
      // Use injected services if available, otherwise call legacy parallax system
      if (debugFunctions?.renderAllCDivs && typeof debugFunctions.renderAllCDivs === 'function') {
        debugFunctions.renderAllCDivs()
      } else {
        // Fallback: trigger a simple parallax update event instead of calling window.renderAllCDivs
        console.log('[ParallaxEnhanced] Triggering parallax update event')
        window.dispatchEvent(new CustomEvent('parallax-render-requested', {
          detail: { source: 'ParallaxEnhanced', timestamp: Date.now() }
        }))
      }
      
      const endTime = performance.now()
      lastRenderTime.value = endTime - startTime
      renderCount.value++
      
      if (lastRenderTime.value > 16) {
        console.warn(`[ParallaxEnhanced] Slow render: ${lastRenderTime.value.toFixed(2)}ms`)
      }
      
    } catch (error) {
      console.error('[ParallaxEnhanced] Render error:', error)
    }
  }
  
  // Event handlers using provide/inject services
  const handleFocalPointChanged = (event) => {
    const focalPointMode = focalPoint?.focalPointMode?.value || 'unknown'
    console.log(`[ParallaxEnhanced] Focal point changed (mode: ${focalPointMode})`)
    renderAllCDivs()
  }
  
  const handleBullsEyeMoved = (event) => {
    const focalPointMode = focalPoint?.focalPointMode?.value || 'unknown'
    console.log(`[ParallaxEnhanced] Bulls-eye moved (focal point mode: ${focalPointMode})`)
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