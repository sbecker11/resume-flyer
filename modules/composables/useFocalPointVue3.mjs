// modules/composables/useFocalPointVue3.mjs
// Pure Vue 3 focal point system (replaces IM hybrid approach)

import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useAppStore } from '../stores/appStore.mjs'
import { useAppContext, FOCAL_POINT_KEY, provideDependency } from './useAppContext.mjs'
import { useBullsEyeService } from '../core/globalServices'
import { injectGlobalElementRegistry } from './useGlobalElementRegistry.mjs'

// Focal point modes
export const FOCALPOINT_MODES = {
  LOCKED: 'LOCKED',
  FOLLOWING: 'FOLLOWING', 
  DRAGGING: 'DRAGGING'
}

// Cursor for drag mode
const CROSSHAIR_CURSOR = 'url(\'/static_content/icons/x-hairs/icons8-accuracy-32-whiter.png\') 16 16, crosshair'

export function useFocalPoint() {
  const { store, actions } = useAppStore()
  const appContext = useAppContext()
  const elementRegistry = injectGlobalElementRegistry()
  
  // Use provide/inject for bulls-eye service
  const bullsEye = useBullsEyeService()
  
  // Template ref for focal point element
  const focalPointElement = ref(null)
  
  // Reactive state from store
  const position = computed(() => ({
    x: store.focalPoint.x,
    y: store.focalPoint.y
  }))
  
  const mode = computed({
    get: () => store.focalPoint.mode,
    set: (value) => actions.setFocalPointMode(value)
  })
  
  const isLocked = computed(() => mode.value === FOCALPOINT_MODES.LOCKED)
  const isFollowing = computed(() => mode.value === FOCALPOINT_MODES.FOLLOWING)
  const isDragging = computed(() => mode.value === FOCALPOINT_MODES.DRAGGING)
  
  // Animation state
  const animationFrame = ref(null)
  const targetPosition = ref({ x: 0, y: 0 })
  
  // Mouse event handling
  const mouseHandler = ref(null)
  const isMouseListenerActive = ref(false)
  
  // Set template ref
  function setFocalPointElement(element) {
    focalPointElement.value = element
    console.log('[FocalPoint] Element set via template ref')
    updateElementPosition()
  }
  
  // Update DOM element position
  function updateElementPosition() {
    if (!focalPointElement.value) return
    
    const element = focalPointElement.value
    element.style.position = 'fixed'
    element.style.left = `${store.focalPoint.x}px`
    element.style.top = `${store.focalPoint.y}px`
    element.style.transform = 'translate(-50%, -50%)'
    element.style.zIndex = '100'
    element.style.pointerEvents = 'none'
    element.style.visibility = (store.focalPoint.x > 0 && store.focalPoint.y > 0) ? 'visible' : 'hidden'
  }
  
  // Set focal point position
  function setPosition(x, y, source = 'api') {
    actions.setFocalPoint(x, y)
    // console.log(`[FocalPoint] Position set to (${x}, ${y}) from ${source}`)
  }
  
  // Set target position with easing
  function setTarget(x, y, source = 'api') {
    targetPosition.value = { x, y }
    
    if (isDragging.value) {
      // Direct update in drag mode
      setPosition(x, y, source)
      updateElementPosition()
    } else {
      // Smooth animation for other modes
      startEasing()
    }
  }
  
  // Easing animation
  function startEasing() {
    if (animationFrame.value) {
      cancelAnimationFrame(animationFrame.value)
    }
    
    function animate() {
      const currentX = store.focalPoint.x
      const currentY = store.focalPoint.y
      const targetX = targetPosition.value.x
      const targetY = targetPosition.value.y
      
      const dx = targetX - currentX
      const dy = targetY - currentY
      const distance = Math.sqrt(dx * dx + dy * dy)
      
      if (distance < 1) {
        setPosition(targetX, targetY, 'animation-complete')
        updateElementPosition()
        animationFrame.value = null
        return
      }
      
      const easingFactor = isDragging.value ? 1 : 0.15
      const newX = currentX + (dx * easingFactor)
      const newY = currentY + (dy * easingFactor)
      
      setPosition(newX, newY, 'animation-step')
      updateElementPosition()
      
      animationFrame.value = requestAnimationFrame(animate)
    }
    
    animate()
  }
  
  // Pure vanilla JS handler for buttery smooth follow mode (same as drag)
  function createVanillaFollowHandler() {
    return (event) => {
      if (!focalPointElement.value) return
      
      // PURE VANILLA JS: Direct DOM manipulation for maximum performance
      const element = focalPointElement.value
      element.style.left = `${event.clientX}px`
      element.style.top = `${event.clientY}px`
      
      // Update store values for parallax system (minimal overhead)
      actions.setFocalPoint(event.clientX, event.clientY)
      
      // Dispatch event for parallax system
      window.dispatchEvent(new CustomEvent('focal-point-changed', {
        detail: { x: event.clientX, y: event.clientY }
      }))
    }
  }
  
  // Mouse event handler for drag mode
  function createMouseHandler() {
    return (event) => {
      if (isDragging.value) {
        setPosition(event.clientX, event.clientY, 'mouse-dragging')
        updateElementPosition()
      }
    }
  }
  
  function addMouseListener() {
    if (isMouseListenerActive.value) return
    
    if (isFollowing.value) {
      // Use pure vanilla JS handler for buttery smooth following
      mouseHandler.value = createVanillaFollowHandler()
      console.log('[FocalPoint] Added VANILLA JS mouse listener for follow mode')
    } else {
      // Use Vue handler for drag mode
      mouseHandler.value = createMouseHandler()
      console.log('[FocalPoint] Added Vue mouse listener for drag mode')
    }
    
    document.addEventListener('mousemove', mouseHandler.value, { passive: true })
    isMouseListenerActive.value = true
  }
  
  function removeMouseListener() {
    if (!isMouseListenerActive.value) return
    
    if (mouseHandler.value) {
      document.removeEventListener('mousemove', mouseHandler.value, { passive: true })
      mouseHandler.value = null
    }
    isMouseListenerActive.value = false
    console.log('[FocalPoint] Mouse listener removed')
  }
  
  // Cursor management for drag mode
  function applyCrosshairCursor() {
    const sceneContainer = elementRegistry.getSceneContainer()
    if (sceneContainer) {
      sceneContainer.style.setProperty('cursor', CROSSHAIR_CURSOR, 'important')
      const elements = sceneContainer.querySelectorAll('*')
      elements.forEach(el => {
        el.style.setProperty('cursor', CROSSHAIR_CURSOR, 'important')
      })
    }
  }
  
  function removeCrosshairCursor() {
    const sceneContainer = elementRegistry.getSceneContainer()
    if (sceneContainer) {
      sceneContainer.style.removeProperty('cursor')
      const elements = sceneContainer.querySelectorAll('*')
      elements.forEach(el => {
        el.style.removeProperty('cursor')
      })
    }
  }
  
  // Cycle through all three modes (tri-state button)
  function cycleMode() {
    const modes = Object.values(FOCALPOINT_MODES)
    const currentIndex = modes.indexOf(mode.value)
    const nextIndex = (currentIndex + 1) % modes.length
    mode.value = modes[nextIndex]
    console.log(`[FocalPoint] Mode cycled to: ${mode.value}`)
  }
  
  // Bulls-eye event listener for locked mode
  function handleBullsEyeMoved(event) {
    if (isLocked.value) {
      const { position } = event.detail
      console.log(`[FocalPoint] Bulls-eye moved to (${position.x}, ${position.y}) - moving focal point (locked mode)`)
      setTarget(position.x, position.y, 'bulls-eye-locked')
    }
  }
  
  // Watch for mode changes - restored tri-state functionality
  watch(mode, (newMode, oldMode) => {
    console.log(`[FocalPoint] Mode changed: ${oldMode} -> ${newMode}`)
    
    // Remove existing mouse listener
    removeMouseListener()
    
    if (newMode === FOCALPOINT_MODES.DRAGGING) {
      // DRAG MODE: Hide focal point element, show crosshair cursor
      if (focalPointElement.value) {
        focalPointElement.value.style.display = 'none'
      }
      applyCrosshairCursor()
      addMouseListener()
      
    } else if (newMode === FOCALPOINT_MODES.FOLLOWING) {
      // FOLLOW MODE: Show focal point element, add vanilla JS mouse listener
      if (focalPointElement.value) {
        focalPointElement.value.style.display = 'flex'
      }
      removeCrosshairCursor()
      addMouseListener() // Uses vanilla JS handler for buttery smoothness
      
    } else { // LOCKED MODE
      // LOCKED MODE: Show focal point element, no mouse listener
      if (focalPointElement.value) {
        focalPointElement.value.style.display = 'flex'
      }
      removeCrosshairCursor()
      
      // Move focal point to current bulls-eye position immediately using provide/inject
      if (bullsEye && bullsEye.isReady()) {
        const bullsEyePos = bullsEye.getPosition()
        console.log(`[FocalPoint] Locked mode activated - moving to bulls-eye at (${bullsEyePos.x}, ${bullsEyePos.y})`)
        setTarget(bullsEyePos.x, bullsEyePos.y, 'mode-locked')
      } else {
        console.warn('[FocalPoint] Bulls-eye service not available via provide/inject')
      }
    }
  }, { immediate: true })
  
  // Watch for position changes to update DOM
  watch(() => store.focalPoint, () => {
    updateElementPosition()
  }, { deep: true })
  
  // Initialize
  function initialize() {
    console.log('[FocalPoint] Initializing Vue 3 focal point system')
    
    // Set initial position to center
    const centerX = window.innerWidth / 2
    const centerY = window.innerHeight / 2
    setPosition(centerX, centerY, 'initialization')
    
    // Listen for bulls-eye movement events
    window.addEventListener('bulls-eye-moved', handleBullsEyeMoved)
    console.log('[FocalPoint] Added bulls-eye-moved event listener')
    
    // Register with dependency injection
    const focalPointInstance = {
      position,
      mode,
      isLocked,
      isFollowing,
      isDragging,
      setPosition,
      setTarget,
      setFocalPointElement,
      cycleMode
    }
    
    appContext.registerDependency(FOCAL_POINT_KEY, focalPointInstance)
    provideDependency(FOCAL_POINT_KEY, focalPointInstance)
    
    return focalPointInstance
  }
  
  // Cleanup
  function cleanup() {
    console.log('[FocalPoint] Cleaning up')
    removeMouseListener()
    removeCrosshairCursor()
    
    // Remove bulls-eye event listener
    window.removeEventListener('bulls-eye-moved', handleBullsEyeMoved)
    console.log('[FocalPoint] Removed bulls-eye-moved event listener')
    
    if (animationFrame.value) {
      cancelAnimationFrame(animationFrame.value)
      animationFrame.value = null
    }
  }
  
  // Auto-initialize on first use
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
    mode,
    isLocked,
    isFollowing,
    isDragging,
    
    // Methods
    setPosition,
    setTarget,
    setFocalPointElement,
    cycleMode,
    initialize,
    cleanup
  }
}