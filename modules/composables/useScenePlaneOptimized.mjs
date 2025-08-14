// modules/composables/useScenePlaneOptimized.mjs
// Optimized Vue 3 scene-plane management with advanced reactivity APIs

import { 
  ref, 
  shallowRef, 
  readonly, 
  triggerRef, 
  computed, 
  watch, 
  nextTick,
  onMounted, 
  onUnmounted 
} from 'vue'

/**
 * Optimized scene-plane composable using Vue 3 advanced reactivity APIs
 * Features:
 * - shallowRef() for performance optimization where deep reactivity isn't needed
 * - readonly() for preventing accidental mutations  
 * - triggerRef() for manual reactivity triggers
 * - Template refs replacing document.getElementById() calls
 */
export function useScenePlaneOptimized() {
  // ==========================================
  // TEMPLATE REFS (replacing DOM queries)
  // ==========================================
  
  // Use shallowRef for DOM elements - we don't need deep reactivity on DOM properties
  const scenePlaneRef = shallowRef(null)
  const sceneContainerRef = shallowRef(null)
  const sceneContentRef = shallowRef(null)
  
  // ==========================================
  // REACTIVE STATE WITH PERFORMANCE OPTIMIZATION
  // ==========================================
  
  // Use shallowRef for dimensions - simple object, no deep watching needed
  const dimensions = shallowRef({
    width: 500,      // default width
    height: 0,       // calculated based on content
    left: 0,
    top: 0
  })
  
  // Use shallowRef for element counts - we only care about the number, not deep structure
  const elementCounts = shallowRef({
    cards: 0
    // connections: 0
  })
  
  // Optimization flags
  const isInitialized = ref(false)
  const isResizing = ref(false)
  const needsRecalculation = ref(false)
  
  // ==========================================
  // READONLY COMPUTED PROPERTIES
  // ==========================================
  
  // Use readonly() to prevent accidental mutations of computed values
  const readonlyDimensions = readonly(computed(() => dimensions.value))
  const readonlyCounts = readonly(computed(() => elementCounts.value))
  
  // Scene plane position calculations (optimized)
  const sceneRect = computed(() => {
    if (!sceneContainerRef.value) return { left: 0, top: 0, width: 0, height: 0 }
    
    const rect = sceneContainerRef.value.getBoundingClientRect()
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height
    }
  })
  
  const scenePlanePosition = readonly(computed(() => {
    const rect = sceneRect.value
    return {
      centerX: rect.left + rect.width / 2,
      centerY: rect.top + rect.height / 2,
      bounds: rect
    }
  }))
  
  // ==========================================
  // OPTIMIZED MEASUREMENT FUNCTIONS
  // ==========================================
  
  /**
   * Update dimensions using template refs instead of DOM queries
   * Uses triggerRef() for manual reactivity control
   */
  const updateDimensions = () => {
    if (!scenePlaneRef.value || !sceneContainerRef.value) {
      console.warn('[ScenePlaneOptimized] Template refs not available for dimension update')
      return
    }
    
    const scenePlaneRect = scenePlaneRef.value.getBoundingClientRect()
    const containerRect = sceneContainerRef.value.getBoundingClientRect()
    
    // Update dimensions object (shallow)
    dimensions.value = {
      width: scenePlaneRect.width,
      height: scenePlaneRect.height,
      left: scenePlaneRect.left - containerRect.left,
      top: scenePlaneRect.top - containerRect.top
    }
    
    // Manually trigger reactivity since we're using shallowRef
    triggerRef(dimensions)
    
    console.log('[ScenePlaneOptimized] Dimensions updated:', dimensions.value)
  }
  
  /**
   * Count elements within scene-plane (optimized with querySelectorAll on template refs)
   */
  const updateElementCounts = () => {
    if (!scenePlaneRef.value) return
    
    const cardElements = scenePlaneRef.value.querySelectorAll('.biz-card-div')
    // const connectionElements = scenePlaneRef.value.querySelectorAll('.connection-line')
    
    elementCounts.value = {
      cards: cardElements.length,
      // connections: connectionElements.length
    }
    
    // Manually trigger reactivity
    triggerRef(elementCounts)
    
    console.log('[ScenePlaneOptimized] Element counts updated:', elementCounts.value)
  }
  
  /**
   * Optimized recalculation with debouncing
   */
  let recalculationTimeout = null
  const scheduleRecalculation = () => {
    needsRecalculation.value = true
    
    if (recalculationTimeout) {
      clearTimeout(recalculationTimeout)
    }
    
    recalculationTimeout = setTimeout(() => {
      if (needsRecalculation.value) {
        updateDimensions()
        updateElementCounts()
        needsRecalculation.value = false
      }
    }, 16) // ~60fps
  }
  
  // ==========================================
  // TEMPLATE REF SETTERS (replacing getElementById)
  // ==========================================
  
  const setScenePlaneElement = (element) => {
    scenePlaneRef.value = element
    console.log('[ScenePlaneOptimized] Scene plane element set via template ref')
    
    // Trigger initial calculations when element becomes available
    if (element && isInitialized.value) {
      nextTick(() => {
        updateDimensions()
        updateElementCounts()
      })
    }
  }
  
  const setSceneContainerElement = (element) => {
    sceneContainerRef.value = element
    console.log('[ScenePlaneOptimized] Scene container element set via template ref')
  }
  
  const setSceneContentElement = (element) => {
    sceneContentRef.value = element
    console.log('[ScenePlaneOptimized] Scene content element set via template ref')
  }
  
  // ==========================================
  // RESIZE OPTIMIZATION
  // ==========================================
  
  let resizeObserver = null
  
  const initializeResizeObserver = () => {
    if (!window.ResizeObserver || !sceneContainerRef.value) return
    
    resizeObserver = new ResizeObserver((entries) => {
      if (isResizing.value) return // Prevent cascading updates
      
      isResizing.value = true
      
      for (const entry of entries) {
        console.log('[ScenePlaneOptimized] Resize detected:', entry.contentRect)
        scheduleRecalculation()
      }
      
      // Reset flag after a brief delay
      setTimeout(() => {
        isResizing.value = false
      }, 100)
    })
    
    resizeObserver.observe(sceneContainerRef.value)
    console.log('[ScenePlaneOptimized] ResizeObserver initialized')
  }
  
  // ==========================================
  // LIFECYCLE AND WATCHERS
  // ==========================================
  
  // Watch for template ref availability
  watch(scenePlaneRef, (newRef) => {
    if (newRef && isInitialized.value) {
      console.log('[ScenePlaneOptimized] Scene plane ref available, updating dimensions')
      scheduleRecalculation()
    }
  })
  
  watch(sceneContainerRef, (newRef) => {
    if (newRef) {
      console.log('[ScenePlaneOptimized] Scene container ref available, initializing ResizeObserver')
      nextTick(() => {
        initializeResizeObserver()
        scheduleRecalculation()
      })
    }
  })
  
  // ==========================================
  // INITIALIZATION AND CLEANUP
  // ==========================================
  
  const initialize = () => {
    console.log('[ScenePlaneOptimized] Initializing optimized scene plane system')
    isInitialized.value = true
    
    // Initial calculations if refs are already available
    if (scenePlaneRef.value && sceneContainerRef.value) {
      scheduleRecalculation()
    }
  }
  
  const cleanup = () => {
    console.log('[ScenePlaneOptimized] Cleaning up')
    
    if (resizeObserver) {
      resizeObserver.disconnect()
      resizeObserver = null
    }
    
    if (recalculationTimeout) {
      clearTimeout(recalculationTimeout)
      recalculationTimeout = null
    }
    
    isInitialized.value = false
    needsRecalculation.value = false
    isResizing.value = false
  }
  
  // Auto-initialize on mount
  onMounted(() => {
    initialize()
  })
  
  onUnmounted(() => {
    cleanup()
  })
  
  // ==========================================
  // PUBLIC API
  // ==========================================
  
  return {
    // Template refs (for parent components to bind)
    scenePlaneRef,
    sceneContainerRef,
    sceneContentRef,
    
    // Template ref setters (for legacy compatibility)
    setScenePlaneElement,
    setSceneContainerElement,
    setSceneContentElement,
    
    // Readonly state (prevent mutations)
    dimensions: readonlyDimensions,
    elementCounts: readonlyCounts,
    scenePlanePosition,
    sceneRect,
    
    // Status flags
    isInitialized: readonly(isInitialized),
    isResizing: readonly(isResizing),
    needsRecalculation: readonly(needsRecalculation),
    
    // Manual update functions
    updateDimensions,
    updateElementCounts,
    scheduleRecalculation,
    
    // Lifecycle
    initialize,
    cleanup
  }
}
