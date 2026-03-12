// modules/composables/useBullsEyeVue3.mjs
// Pure Vue 3 bulls-eye system

import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useAppStore } from '../stores/appStore.mjs'
import { useAppContext, BULLS_EYE_KEY, provideDependency } from './useAppContext.mjs'

export function useBullsEye() {
  const { store, actions } = useAppStore()
  const appContext = useAppContext()
  
  // Template refs
  const bullsEyeElement = ref(null)
  const sceneContainerElement = ref(null)
  
  // Reactive state from store
  const position = computed(() => ({
    x: store.bullsEye.x,
    y: store.bullsEye.y
  }))
  
  const x = computed(() => store.bullsEye.x)
  const y = computed(() => store.bullsEye.y)
  const isVisible = computed(() => store.bullsEye.isVisible)
  
  // Set template refs
  function setBullsEyeElement(element) {
    bullsEyeElement.value = element
    console.log('[BullsEye] Bulls-eye element set via template ref')
    if (sceneContainerElement.value) {
      centerBullsEye()
    }
  }
  
  function setSceneContainerElement(element) {
    sceneContainerElement.value = element
    console.log('[BullsEye] Scene container element set via template ref')
    if (bullsEyeElement.value) {
      centerBullsEye()
    }
  }
  
  // Update DOM element position
  function updateElementPosition() {
    if (!bullsEyeElement.value) return
    
    const element = bullsEyeElement.value
    element.style.position = 'fixed'
    element.style.left = `${store.bullsEye.x}px`
    element.style.top = `${store.bullsEye.y}px`
    element.style.transform = 'translate(-50%, -50%)'
    element.style.zIndex = '98'
    element.style.pointerEvents = 'none'
    element.style.visibility = isVisible.value ? 'visible' : 'hidden'
  }
  
  // Center bulls-eye in scene container
  function centerBullsEye() {
    if (!bullsEyeElement.value || !sceneContainerElement.value) {
      console.log('[BullsEye] Cannot center - missing elements:', {
        bullsEyeElement: !!bullsEyeElement.value,
        sceneContainerElement: !!sceneContainerElement.value
      })
      return
    }
    
    const rect = sceneContainerElement.value.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    
    // Update store
    actions.setBullsEye(centerX, centerY)
    
    console.log('[BullsEye] sceneView:', { width: rect.width, height: rect.height, left: rect.left, top: rect.top }, 'bullsEyeCenter:', { x: centerX, y: centerY })
    
    // Emit custom event for other systems that might need it
    window.dispatchEvent(new CustomEvent('bulls-eye-moved', {
      detail: { position: { x: centerX, y: centerY } }
    }))
    
    window.dispatchEvent(new CustomEvent('bullseye-recentered', {
      detail: { position: { x: centerX, y: centerY } }
    }))
  }
  
  // Set bulls-eye position directly
  function setPosition(x, y, source = 'api') {
    actions.setBullsEye(x, y)
    console.log(`[BullsEye] Position set to (${x}, ${y}) from ${source}`)
  }
  
  // Set visibility
  function setVisible(visible) {
    store.bullsEye.isVisible = visible
    updateElementPosition()
  }
  
  // Recenter (public API for compatibility)
  function recenter() {
    centerBullsEye()
  }
  
  // Check if bulls-eye is ready
  const isReady = computed(() => 
    bullsEyeElement.value !== null && sceneContainerElement.value !== null
  )
  
  // Event handlers for layout changes
  function handleResize() {
    console.log('[BullsEye] Window resize - recentering')
    nextTick(() => centerBullsEye())
  }
  
  function handleResizeHandleChange() {
    console.log('[BullsEye] Resize handle changed - recentering')
    nextTick(() => centerBullsEye())
  }
  
  function handleLayoutChange() {
    console.log('[BullsEye] Layout orientation changed - recentering')
    // Add delay to ensure DOM has updated
    setTimeout(() => centerBullsEye(), 100)
  }
  
  // Watch for position changes to update DOM
  watch(() => store.bullsEye, () => {
    updateElementPosition()
  }, { deep: true })
  
  // Watch for layout changes in store
  watch(() => store.orientation, () => {
    handleLayoutChange()
  })
  
  // Watch for scene percentage changes
  watch(() => store.scenePercentage, () => {
    nextTick(() => centerBullsEye())
  })
  
  // Initialize
  function initialize() {
    console.log('[BullsEye] Initializing Vue 3 bulls-eye system')
    
    // Set up event listeners
    window.addEventListener('resize', handleResize)
    window.addEventListener('resize-handle-changed', handleResizeHandleChange)
    window.addEventListener('layout-orientation-changed', handleLayoutChange)
    window.addEventListener('scene-force-update', handleResizeHandleChange)
    window.addEventListener('programmatic-soft-refresh-complete', handleResizeHandleChange)
    
    // Register with dependency injection
    const bullsEyeInstance = {
      position,
      x,
      y,
      isVisible,
      isReady,
      setPosition,
      setVisible,
      setBullsEyeElement,
      setSceneContainerElement,
      centerBullsEye,
      recenter
    }
    
    appContext.registerDependency(BULLS_EYE_KEY, bullsEyeInstance)
    provideDependency(BULLS_EYE_KEY, bullsEyeInstance)
    
    // Single app-state object: window.resumeFlock
    if (typeof window !== 'undefined') {
      const bullsEyeApi = {
        recenter: () => recenter(),
        getPosition: () => ({ x: x.value, y: y.value }),
        isReady: () => isReady.value
      }
      window.resumeFlock = window.resumeFlock || {}
      window.resumeFlock.bullsEye = bullsEyeApi
    }
    
    return bullsEyeInstance
  }
  
  // Cleanup
  function cleanup() {
    console.log('[BullsEye] Cleaning up')
    window.removeEventListener('resize', handleResize)
    window.removeEventListener('resize-handle-changed', handleResizeHandleChange)
    window.removeEventListener('layout-orientation-changed', handleLayoutChange)
    window.removeEventListener('scene-force-update', handleResizeHandleChange)
    window.removeEventListener('programmatic-soft-refresh-complete', handleResizeHandleChange)
  }
  
  // Auto-initialize
  onMounted(() => {
    initialize()
  })
  
  onUnmounted(() => {
    cleanup()
  })
  
  // Return public API
  return {
    // Reactive state
    position,
    x,
    y,
    isVisible,
    isReady,
    
    // Methods
    setPosition,
    setVisible,
    setBullsEyeElement,
    setSceneContainerElement,
    centerBullsEye,
    recenter,
    initialize,
    cleanup
  }
}