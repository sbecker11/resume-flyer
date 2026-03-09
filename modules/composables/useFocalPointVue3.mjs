// modules/composables/useFocalPointVue3.mjs
// Pure Vue 3 focal point system (replaces IM hybrid approach)

import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useAppStore } from '../stores/appStore.mjs'
import { useAppContext, FOCAL_POINT_KEY, provideDependency } from './useAppContext.mjs'
import { useBullsEyeService } from '../core/globalServices'
import { injectGlobalElementRegistry } from './useGlobalElementRegistry.mjs'

// Focal point modes:
// - LOCKED: Focal point is fixed to the bulls-eye (scene center). Parallax stays centered; no mouse tracking.
// - FOLLOWING: Focal point follows the mouse with smoothing/easing, so it lags behind the cursor. Normal focal icon shown.
// - DRAGGING: No lag. Focal point updates immediately on mouse motion. The smaller circles/lines display is hidden;
//   the larger focal display is the actual cursor file (crosshair). Element position still drives scene/parallax.
export const FOCALPOINT_MODES = {
  LOCKED: 'LOCKED',
  FOLLOWING: 'FOLLOWING',
  DRAGGING: 'DRAGGING'
}

// Larger focal display: cursor file used only in DRAGGING mode (smaller display = circles/lines in LOCKED/FOLLOWING)
const CROSSHAIR_CURSOR = 'url(\'/static_content/icons/x-hairs/icons8-accuracy-32-whiter.png\') 16 16, crosshair'

export function useFocalPoint() {
  const { store, actions } = useAppStore()
  const appContext = useAppContext()
  
  // Resolve registry once during setup (inject() only valid here); use in nextTick/callbacks
  let elementRegistry = null;
  try {
    elementRegistry = injectGlobalElementRegistry();
  } catch (e) {
    if (typeof window !== 'undefined' && window.globalElementRegistry) {
      elementRegistry = window.globalElementRegistry;
    }
    if (!elementRegistry) throw e;
  }
  const getElementRegistry = () => elementRegistry;
  
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
  
  // Set focal point position (floor at 0 to prevent negative coords)
  function setPosition(x, y, source = 'api') {
    const safeX = Math.max(0, x)
    const safeY = Math.max(0, y)
    actions.setFocalPoint(safeX, safeY)
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
      
      // FOLLOWING: smaller factor = more lag (slower catch-up to mouse)
      const easingFactor = isDragging.value ? 1 : 0.04
      const newX = currentX + (dx * easingFactor)
      const newY = currentY + (dy * easingFactor)
      
      setPosition(newX, newY, 'animation-step')
      updateElementPosition()
      
      animationFrame.value = requestAnimationFrame(animate)
    }
    
    animate()
  }
  
  const FOCAL_POINT_EDGE_MARGIN = 30

  /** Clamp point to stay within scene container padded bounds. Focal point tracks mouse but cannot leave scene. */
  function clampToLeftColumn(mouseX, mouseY) {
    const leftColumn = typeof document !== 'undefined' && document.getElementById('scene-container')
    if (!leftColumn) {
      const w = typeof window !== 'undefined' ? window.innerWidth : 0
      const h = typeof window !== 'undefined' ? window.innerHeight : 0
      const m = FOCAL_POINT_EDGE_MARGIN
      return {
        x: Math.max(m, Math.min(w - m, mouseX)),
        y: Math.max(m, Math.min(h - m, mouseY))
      }
    }
    const rect = leftColumn.getBoundingClientRect()
    const m = FOCAL_POINT_EDGE_MARGIN
    const minX = Math.min(rect.left + m, rect.right - m)
    const maxX = Math.max(rect.left + m, rect.right - m)
    const minY = Math.min(rect.top + m, rect.bottom - m)
    const maxY = Math.max(rect.top + m, rect.bottom - m)
    const x = Math.max(minX, Math.min(maxX, mouseX))
    const y = Math.max(minY, Math.min(maxY, mouseY))
    return {
      x: Math.max(0, x),
      y: Math.max(0, y)
    }
  }

  // Follow mode: focal point eases toward mouse (lag) via setTarget → startEasing. rAF-throttled.
  let followRafScheduled = false
  let lastFollowMouse = { x: 0, y: 0 }
  function createVanillaFollowHandler() {
    return (event) => {
      if (!focalPointElement.value) return
      lastFollowMouse.x = event.clientX
      lastFollowMouse.y = event.clientY
      if (followRafScheduled) return
      followRafScheduled = true
      requestAnimationFrame(() => {
        followRafScheduled = false
        if (!focalPointElement.value || !isFollowing.value) return
        const { x, y } = clampToLeftColumn(lastFollowMouse.x, lastFollowMouse.y)
        // Use setTarget so easing runs: focal point lags behind mouse (unlike DRAGGING which sets position directly)
        setTarget(x, y, 'follow-mouse')
      })
    }
  }
  
  // Mouse handler for DRAGGING mode: immediate position update (no lag; parallax stays reactive)
  function createMouseHandler() {
    return (event) => {
      if (isDragging.value) {
        const { x, y } = clampToLeftColumn(event.clientX, event.clientY)
        setPosition(x, y, 'mouse-dragging')
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
      // Use Vue handler for DRAGGING mode (immediate follow)
      mouseHandler.value = createMouseHandler()
      console.log('[FocalPoint] Added Vue mouse listener for DRAGGING mode')
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
  
  // Cursor management for DRAGGING mode (crosshair cursor). Apply to viewport so it shows on load/refresh without moving mouse.
  function applyCrosshairCursor() {
    if (typeof document === 'undefined') return false
    const setCursor = (el) => {
      if (el) el.style.setProperty('cursor', CROSSHAIR_CURSOR, 'important')
    }
    setCursor(document.documentElement)
    setCursor(document.body)
    const registry = getElementRegistry()
    const sceneContainer = (registry && registry.getSceneContainer) ? registry.getSceneContainer() : null
    if (sceneContainer) {
      setCursor(sceneContainer)
      sceneContainer.querySelectorAll('*').forEach(setCursor)
    }
    const appContainer = document.getElementById('app-container')
    if (appContainer) setCursor(appContainer)
    return true
  }

  function removeCrosshairCursor() {
    if (typeof document === 'undefined') return
    const removeCursor = (el) => {
      if (el) el.style.removeProperty('cursor')
    }
    removeCursor(document.documentElement)
    removeCursor(document.body)
    const registry = getElementRegistry()
    const sceneContainer = (registry && registry.getSceneContainer) ? registry.getSceneContainer() : null
    if (sceneContainer) {
      removeCursor(sceneContainer)
      sceneContainer.querySelectorAll('*').forEach(removeCursor)
    }
    const appContainer = document.getElementById('app-container')
    if (appContainer) removeCursor(appContainer)
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
  
  // Watch for mode changes - restored tri-state functionality (defer DOM work so scene-container can exist)
  watch(mode, (newMode, oldMode) => {
    console.log(`[FocalPoint] Mode changed: ${oldMode} -> ${newMode}`)
    removeMouseListener()

    function runModeActions() {
      if (newMode === FOCALPOINT_MODES.DRAGGING) {
        // Single crosshair: only the img at focal position (no CSS cursor) so one size, visible at saved position on load
        if (focalPointElement.value) focalPointElement.value.style.display = 'flex'
        removeCrosshairCursor() // ensure no cursor-file crosshair; we use the img only
        addMouseListener()
      } else if (newMode === FOCALPOINT_MODES.FOLLOWING) {
        if (focalPointElement.value) focalPointElement.value.style.display = 'flex'
        removeCrosshairCursor()
        addMouseListener()
      } else {
        if (focalPointElement.value) focalPointElement.value.style.display = 'flex'
        removeCrosshairCursor()
        const ready = bullsEye && (typeof bullsEye.isReady === 'function' ? bullsEye.isReady() : (bullsEye.isReady?.value ?? false))
        const pos = bullsEye && (typeof bullsEye.getPosition === 'function' ? bullsEye.getPosition() : (bullsEye.x != null && bullsEye.y != null ? { x: bullsEye.x, y: bullsEye.y } : null))
        if (ready && pos) {
          setTarget(pos.x, pos.y, 'mode-locked')
        } else if (newMode === FOCALPOINT_MODES.LOCKED && !ready) {
          console.warn('[FocalPoint] Bulls-eye service not available via provide/inject')
        }
      }
    }

    nextTick(runModeActions)
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