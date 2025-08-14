// modules/composables/useParallaxVue3.mjs
// Pure Vue 3 parallax system

import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useAppStore } from '../stores/appStore.mjs'
import { useAppContext, provideDependency } from './useAppContext.mjs'
import * as zUtils from '../utils/zUtils.mjs'
import { injectGlobalElementRegistry } from './useGlobalElementRegistry.mjs'

// Parallax constants
export const PARALLAX_X_EXAGGERATION_FACTOR = 0.9
export const PARALLAX_Y_EXAGGERATION_FACTOR = 1.0
export const CLONE_Z_SCALE = 0 // Clones have no parallax effect
export const MAX_Z_SCALE = 0.9 // Maximum Z scale for non-clones
export const EPSILON = 0.01

const PARALLAX_KEY = Symbol('Parallax')

export function useParallax() {
  const { store } = useAppStore()
  const appContext = useAppContext()
  const elementRegistry = injectGlobalElementRegistry()
  
  // Reactive state
  const isInitialized = ref(false)
  const sceneContainerRect = ref({ left: 0, top: 0, width: 0, height: 0 })
  const previousDisplacements = ref({ dh: null, dv: null })
  
  // Debouncing state
  const renderTimeout = ref(null)
  
  // Constants
  const Z_RANGE = zUtils.ALL_CARDS_Z_MAX - zUtils.ALL_CARDS_Z_MIN
  
  // Computed positions from store
  const bullsEyePosition = computed(() => ({
    x: store.bullsEye.x,
    y: store.bullsEye.y
  }))
  
  const focalPointPosition = computed(() => ({
    x: store.focalPoint.x,
    y: store.focalPoint.y
  }))
  
  // Calculate parallax displacements
  const parallaxDisplacements = computed(() => {
    const bullsEye = bullsEyePosition.value
    const focalPoint = focalPointPosition.value
    
    const dh = (bullsEye.x - focalPoint.x) * PARALLAX_X_EXAGGERATION_FACTOR
    const dv = (bullsEye.y - focalPoint.y) * PARALLAX_Y_EXAGGERATION_FACTOR
    
    return { dh, dv }
  })
  
  // Utility functions for card classification
  function isClone(bizCardDiv) {
    return bizCardDiv.id.indexOf('clone') !== -1
  }
  
  function hasClone(bizCardDiv) {
    return bizCardDiv.classList.contains('hasClone')
  }
  
  // Apply parallax transform to a single card
  function applyParallaxToBizCardDiv(bizCardDiv, dh, dv) {
    if (!bizCardDiv) return false
    
    if (hasClone(bizCardDiv)) {
      console.log(`[Parallax] ⏭️ Skipping ${bizCardDiv.id} - has clone (selected)`)
      return false
    }
    
    const sceneZ = parseFloat(bizCardDiv.getAttribute('data-sceneZ'))
    if (isNaN(sceneZ)) {
      // console.log(`[Parallax] ⏭️ Skipping ${bizCardDiv.id} - no valid sceneZ`)
      return false
    }

    // Calculate Z scale for parallax effect
    let zScale = CLONE_Z_SCALE // default for clones
    if (!isClone(bizCardDiv) && sceneZ > 0) {
      zScale = MAX_Z_SCALE - ((sceneZ - zUtils.ALL_CARDS_Z_MIN - 1) / Z_RANGE)
    } else if (!isClone(bizCardDiv) && sceneZ <= 0) {
      throw new Error(`Invalid sceneZ value: ${sceneZ} for bizCardDiv: ${bizCardDiv.id}`)
    }

    // Apply parallax transformation
    const translateX = dh * zScale
    const translateY = dv * zScale
    
    const transformString = `translateX(${translateX}px) translateY(${translateY}px)`
    bizCardDiv.style.transform = transformString
    
    return true
  }
  
  // Refresh all parallax transforms
  function refreshAllParallaxTransforms() {
    const { dh, dv } = parallaxDisplacements.value
    
    // Skip if no displacement
    if (dh === 0 && dv === 0) {
      console.log('[Parallax] ⏹️ No displacement, skipping parallax update')
      return
    }
    
    // Skip if no change from previous
    if (dh === previousDisplacements.value.dh && dv === previousDisplacements.value.dv) {
      console.log('[Parallax] ⏹️ No change in displacement, skipping parallax update')
      return
    }
    
    const bizCardDivs = elementRegistry.getAllBizCardDivs()
    console.log(`[Parallax] 🎴 Applying parallax to ${bizCardDivs.length} cards`)
    
    let appliedCount = 0
    let skippedCount = 0
    
    // Apply to all cards
    for (const bizCardDiv of bizCardDivs) {
      const wasApplied = applyParallaxToBizCardDiv(bizCardDiv, dh, dv)
      if (wasApplied) appliedCount++
      else skippedCount++
    }
    
    // Update previous displacements
    previousDisplacements.value = { dh, dv }
    
    console.log(`[Parallax] ✅ Parallax applied to ${appliedCount} cards, skipped ${skippedCount}`)
  }
  
  // Debounced render function
  function debouncedRenderAllCDivs(delay = 0) {
    if (renderTimeout.value) {
      clearTimeout(renderTimeout.value)
    }
    
    renderTimeout.value = setTimeout(() => {
      requestAnimationFrame(() => {
        refreshAllParallaxTransforms()
        renderTimeout.value = null
      })
    }, delay)
  }
  
  // Main render function
  function renderAllCDivs() {
    debouncedRenderAllCDivs(0)
  }
  
  // Update scene container rect
  function updateSceneContainerRect() {
    const sceneContainer = elementRegistry.getSceneContainer()
    if (sceneContainer) {
      const rect = sceneContainer.getBoundingClientRect()
      sceneContainerRect.value = {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height
      }
    }
  }
  
  // Event handlers for various triggers
  const eventHandlers = {
    'viewport-changed': () => {
      console.log('[Parallax] 🎯 Viewport changed')
      debouncedRenderAllCDivs(0)
    },
    'resize-handle-changed': () => {
      console.log('[Parallax] 🎯 Resize handle changed')
      updateSceneContainerRect()
      debouncedRenderAllCDivs(0)
    },
    'resize': () => {
      console.log('[Parallax] 🎯 Window resized')
      updateSceneContainerRect()
      debouncedRenderAllCDivs(0)
    },
    'bullseye-recentered': () => {
      console.log('[Parallax] 🎯 Bulls-eye recentered')
      debouncedRenderAllCDivs(0)
    },
    'layout-orientation-changed': () => {
      console.log('[Parallax] 🎯 Layout orientation changed')
      updateSceneContainerRect()
      debouncedRenderAllCDivs(100) // Small delay for layout to settle
    }
  }
  
  // Watch for store changes that affect parallax
  watch(bullsEyePosition, () => {
    console.log('[Parallax] Bulls-eye position changed')
    debouncedRenderAllCDivs(0)
  }, { deep: true })
  
  watch(focalPointPosition, () => {
    const mode = store.focalPoint.mode
    console.log(`[Parallax] Focal point changed (mode: ${mode})`)
    debouncedRenderAllCDivs(0)
  }, { deep: true })
  
  watch(() => store.orientation, () => {
    console.log('[Parallax] Layout orientation changed via store')
    nextTick(() => {
      updateSceneContainerRect()
      debouncedRenderAllCDivs(100)
    })
  })
  
  watch(() => store.scenePercentage, () => {
    console.log('[Parallax] Scene percentage changed')
    nextTick(() => {
      updateSceneContainerRect()
      debouncedRenderAllCDivs(50)
    })
  })
  
  // Initialize parallax system
  function initialize() {
    console.log('[Parallax] Initializing Vue 3 parallax system')
    
    // Set up event listeners for legacy events during migration
    Object.entries(eventHandlers).forEach(([event, handler]) => {
      window.addEventListener(event, handler)
      console.log(`[Parallax] ✅ Registered listener for '${event}'`)
    })
    
    // Update scene container rect
    updateSceneContainerRect()
    
    // Make functions globally available for debugging
    if (typeof window !== 'undefined') {
      window.renderAllCDivs = renderAllCDivs
      window.getBullsEyePosition = () => bullsEyePosition.value
      window.getFocalPointPosition = () => focalPointPosition.value
      window.getViewportOrigin = () => bullsEyePosition.value
    }
    
    // Register with dependency injection
    const parallaxInstance = {
      renderAllCDivs,
      applyParallaxToBizCardDiv,
      isClone,
      hasClone,
      bullsEyePosition,
      focalPointPosition,
      parallaxDisplacements
    }
    
    provideDependency(PARALLAX_KEY, parallaxInstance)
    appContext.registerDependency(PARALLAX_KEY, parallaxInstance)
    
    isInitialized.value = true
    console.log('[Parallax] Vue 3 parallax system initialized')
    
    return parallaxInstance
  }
  
  // Cleanup
  function cleanup() {
    console.log('[Parallax] Cleaning up')
    
    // Remove event listeners
    Object.entries(eventHandlers).forEach(([event, handler]) => {
      window.removeEventListener(event, handler)
    })
    
    // Clear timeouts
    if (renderTimeout.value) {
      clearTimeout(renderTimeout.value)
      renderTimeout.value = null
    }
    
    isInitialized.value = false
  }
  
  // Auto-initialize
  onMounted(() => {
    // Small delay to ensure DOM is ready
    setTimeout(() => {
      initialize()
    }, 100)
  })
  
  onUnmounted(() => {
    cleanup()
  })
  
  // Return public API
  return {
    // State
    isInitialized,
    bullsEyePosition,
    focalPointPosition,
    parallaxDisplacements,
    
    // Methods
    renderAllCDivs,
    applyParallaxToBizCardDiv,
    isClone,
    hasClone,
    initialize,
    cleanup
  }
}