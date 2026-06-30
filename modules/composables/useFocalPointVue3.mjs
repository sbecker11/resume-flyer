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

function getRuntimeBase() {
  const envBase = (import.meta?.env?.BASE_URL || '/')
  let base = envBase
  if (typeof window !== 'undefined') {
    const path = window.location.pathname || '/'
    const parts = path.split('/').filter(Boolean)
    const useSubpath = parts.length > 0 && (envBase === '/' || !path.startsWith(envBase))
    if (useSubpath) base = `/${parts[0]}/`
  }
  return base.endsWith('/') ? base : `${base}/`
}
function basePathJoin(relPath) {
  const b = getRuntimeBase()
  const p = relPath.startsWith('/') ? relPath.slice(1) : relPath
  return `${b}${p}`
}
function getCrosshairCursor() {
  const url = basePathJoin('static_content/icons/x-hairs/32/dragging-32-white.png')
  return `url('${url}') 16 16, crosshair`
}

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

  /** Mode pushed when pointer leaves #scene-container; restored on re-enter. */
  const modeStackForSceneLeave = []
  let sceneViewModeListenersAttached = false
  
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

  function cancelFocalEasing() {
    if (animationFrame.value) {
      cancelAnimationFrame(animationFrame.value)
      animationFrame.value = null
    }
  }

  /** Immediate snap (no easing) — used when locking focal to bulls-eye. */
  function snapFocalToBullsEye(source = 'bulls-eye-snap') {
    cancelFocalEasing()
    const el = typeof document !== 'undefined' ? document.getElementById('bulls-eye') : null
    let pos = null
    if (el) {
      const rect = el.getBoundingClientRect()
      pos = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    } else if (bullsEye && typeof bullsEye.getPosition === 'function') {
      pos = bullsEye.getPosition()
    } else if (bullsEye?.x != null && bullsEye?.y != null) {
      pos = { x: bullsEye.x, y: bullsEye.y }
    }
    if (!pos) return
    targetPosition.value = { x: pos.x, y: pos.y }
    setPosition(pos.x, pos.y, source)
    updateElementPosition()
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
      
      // FOLLOWING: smaller easing = more lag (slower catch-up to mouse)
      const easing = isDragging.value ? 1 : 0.04
      const newX = currentX + (dx * easing)
      const newY = currentY + (dy * easing)
      
      setPosition(newX, newY, 'animation-step')
      updateElementPosition()
      
      animationFrame.value = requestAnimationFrame(animate)
    }
    
    animate()
  }
  
  const FOCAL_POINT_EDGE_MARGIN = 30

  function getSceneContainerEl() {
    const registry = getElementRegistry()
    return (registry?.getSceneContainer?.()) || (typeof document !== 'undefined' ? document.getElementById('scene-container') : null)
  }

  function getResizeHandleEl() {
    return typeof document !== 'undefined' ? document.getElementById('resize-handle') : null
  }

  /** Scene-side focal zone: #scene-container plus #resize-handle (not #resume-container). */
  function isElementInSceneFocalZone(el) {
    if (!el) return false
    const sceneContainer = getSceneContainerEl()
    if (sceneContainer?.contains(el)) return true
    const resizeHandle = getResizeHandleEl()
    return !!(resizeHandle && resizeHandle.contains(el))
  }

  function isPointInElementRect(clientX, clientY, el) {
    if (!el) return false
    const rect = el.getBoundingClientRect()
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
  }

  /** True when pointer is over scene container or resize handle (resume panel = outside). */
  function isPointerInsideSceneView(clientX, clientY) {
    const sceneContainer = getSceneContainerEl()
    if (!sceneContainer || typeof document === 'undefined') return false
    const target = document.elementFromPoint(clientX, clientY)
    if (target && isElementInSceneFocalZone(target)) return true
    if (isPointInElementRect(clientX, clientY, sceneContainer)) return true
    return isPointInElementRect(clientX, clientY, getResizeHandleEl())
  }

  /** Clamp point to stay within scene container padded bounds. Focal point tracks mouse but cannot leave scene. */
  function clampToLeftColumn(mouseX, mouseY) {
    const leftColumn = getSceneContainerEl()
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
      if (!isPointerInsideSceneView(event.clientX, event.clientY)) return
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
        if (!isPointerInsideSceneView(event.clientX, event.clientY)) return
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
      if (el) el.style.setProperty('cursor', getCrosshairCursor(), 'important')
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

  /** Temporary mode change when leaving scene (does not persist to user-settings). */
  function setModeTransient(newMode) {
    store.focalPoint.mode = newMode
    console.log(`[FocalPoint] Mode (scene leave/enter transient): ${newMode}`)
  }

  function applyOutsideSceneFocalLock() {
    cancelFocalEasing()
    if (mode.value !== FOCALPOINT_MODES.LOCKED) {
      setModeTransient(FOCALPOINT_MODES.LOCKED)
    }
    snapFocalToBullsEye('scene-outside-locked')
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('scene-view-pointer-left', { detail: {} }))
    }
  }

  function pushModeAndLockToBullsEyeForSceneLeave() {
    if (modeStackForSceneLeave.length === 0 && mode.value !== FOCALPOINT_MODES.LOCKED) {
      modeStackForSceneLeave.push(mode.value)
    }
    applyOutsideSceneFocalLock()
  }

  function popModeOnSceneEnter() {
    if (modeStackForSceneLeave.length === 0) return
    const restored = modeStackForSceneLeave.pop()
    setModeTransient(restored)
  }

  /** null until first mousemove sample; then tracks scene-side focal zone (scene + resize handle). */
  let pointerInsideSceneView = null
  let sceneBoundaryMouseMoveHandler = null
  let sceneBoundaryDocumentMouseLeaveHandler = null
  let sceneBoundaryDocumentMouseEnterHandler = null

  function leaveSceneFocalZone() {
    if (pointerInsideSceneView === false) {
      if (mode.value !== FOCALPOINT_MODES.LOCKED) {
        applyOutsideSceneFocalLock()
      }
      return
    }
    pointerInsideSceneView = false
    pushModeAndLockToBullsEyeForSceneLeave()
  }

  function syncSceneViewPointerBoundary(clientX, clientY) {
    if (!getSceneContainerEl()) return
    const inside = isPointerInsideSceneView(clientX, clientY)

    if (pointerInsideSceneView === null) {
      pointerInsideSceneView = inside
      if (!inside) {
        pushModeAndLockToBullsEyeForSceneLeave()
      }
      return
    }

    if (pointerInsideSceneView !== inside) {
      pointerInsideSceneView = inside
      if (inside) {
        popModeOnSceneEnter()
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('scene-view-pointer-entered', { detail: { clientX, clientY } }))
        }
      } else {
        pushModeAndLockToBullsEyeForSceneLeave()
      }
      return
    }

    if (!inside && mode.value !== FOCALPOINT_MODES.LOCKED) {
      applyOutsideSceneFocalLock()
    }
  }

  function attachSceneViewModeListeners() {
    if (sceneViewModeListenersAttached) return !!getSceneContainerEl()
    if (!getSceneContainerEl()) return false

    sceneBoundaryMouseMoveHandler = (event) => {
      syncSceneViewPointerBoundary(event.clientX, event.clientY)
    }
    sceneBoundaryDocumentMouseLeaveHandler = () => {
      leaveSceneFocalZone()
    }
    sceneBoundaryDocumentMouseEnterHandler = (event) => {
      syncSceneViewPointerBoundary(event.clientX, event.clientY)
    }
    document.addEventListener('mousemove', sceneBoundaryMouseMoveHandler, { passive: true })
    document.addEventListener('mouseleave', sceneBoundaryDocumentMouseLeaveHandler)
    document.addEventListener('mouseenter', sceneBoundaryDocumentMouseEnterHandler)
    sceneViewModeListenersAttached = true
    console.log('[FocalPoint] Scene view boundary tracking attached (document mousemove/leave/enter)')
    return true
  }

  function detachSceneViewModeListeners() {
    if (!sceneViewModeListenersAttached) return
    if (sceneBoundaryMouseMoveHandler) {
      document.removeEventListener('mousemove', sceneBoundaryMouseMoveHandler, { passive: true })
      sceneBoundaryMouseMoveHandler = null
    }
    if (sceneBoundaryDocumentMouseLeaveHandler) {
      document.removeEventListener('mouseleave', sceneBoundaryDocumentMouseLeaveHandler)
      sceneBoundaryDocumentMouseLeaveHandler = null
    }
    if (sceneBoundaryDocumentMouseEnterHandler) {
      document.removeEventListener('mouseenter', sceneBoundaryDocumentMouseEnterHandler)
      sceneBoundaryDocumentMouseEnterHandler = null
    }
    pointerInsideSceneView = null
    sceneViewModeListenersAttached = false
    modeStackForSceneLeave.length = 0
    console.log('[FocalPoint] Scene view boundary tracking detached')
  }

  function tryAttachSceneViewModeListeners() {
    if (attachSceneViewModeListeners()) return
    window.addEventListener('scene-container-ready', tryAttachSceneViewModeListeners, { once: true })
    window.addEventListener('scene-plane-ready', tryAttachSceneViewModeListeners, { once: true })
  }
  
  // Bulls-eye event listener for locked mode
  function handleBullsEyeMoved(event) {
    if (isLocked.value) {
      const { position } = event.detail
      console.log(`[FocalPoint] Bulls-eye moved to (${position.x}, ${position.y}) - moving focal point (locked mode)`)
      setTarget(position.x, position.y, 'bulls-eye-locked')
    }
  }
  
  // Re-lock when user changes mode via ResizeHandle (etc.) while pointer is outside scene.
  watch(() => store.focalPoint.mode, () => {
    if (pointerInsideSceneView === false) {
      applyOutsideSceneFocalLock()
    }
  })

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
        if (ready) {
          snapFocalToBullsEye('mode-locked')
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

    nextTick(() => tryAttachSceneViewModeListeners())
    
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
    detachSceneViewModeListeners()
    
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