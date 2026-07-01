/**
 * Mouse-driven auto-scroll for the scene view.
 * When the mouse nears the top or bottom quarter of the scene container,
 * the scene-content scrolls vertically (works in any focal point mode). The cursor is hidden
 * and 32x32 PNG icons at top-right and bottom-right indicate the active zone.
 *
 * Ported from legacy postcard-stack main (updateAutoScrollVelocity / handleFocalPointMove).
 */

import { ref } from 'vue'
import { useAppStore } from '../stores/appStore.mjs'
import { getLastPointerPosition } from '../utils/panelKeyboardScroll.mjs'

const AUTOSCROLL_REPEAT_MILLIS = 10
const MAX_AUTOSCROLL_VELOCITY = 10.0
const MIN_AUTOSCROLL_VELOCITY = 2.0
const AUTOSCROLL_CHANGE_THRESHOLD = 2.0

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

const CURSORS_BASE = basePathJoin('static_content/icons/cursors')
const EDGE_THRESHOLD_PX = 5

/** 32x32 PNG icons (base-path aware for GitHub Pages). */
export const AUTOSCROLL_UP_SRC = `${CURSORS_BASE}/up-32-grey.png`
export const AUTOSCROLL_DOWN_SRC = `${CURSORS_BASE}/down-32-grey.png`
export const AUTOSCROLL_TOP_SRC = `${CURSORS_BASE}/top-32-grey.png`
export const AUTOSCROLL_BOTTOM_SRC = `${CURSORS_BASE}/bottom-32-grey.png`

/** 'None' | 'Up' | 'Down' | 'Top' | 'Bottom'. Top/Bottom = at scroll edge during autoscroll only. */
export const AUTOSCROLL_DIRECTION = { NONE: 'None', UP: 'Up', DOWN: 'Down', TOP: 'Top', BOTTOM: 'Bottom' }

/** Dispatched when ↑/↓ targets the scene panel (detail: { direction: 'up' | 'down' }). */
export const SCENE_PANEL_ARROW_KEY_EVENT = 'scene-panel-arrow-key'
/** Dispatched after scene-panel ↑/↓ handling finishes (debounced with keyboard nav). */
export const SCENE_PANEL_ARROW_KEY_END_EVENT = 'scene-panel-arrow-key-end'
/** Dispatched for Option+↑/↓ in scene view (detail: { edge: 'top' | 'bottom' }). */
export const SCENE_PANEL_SCROLL_EDGE_EVENT = 'scene-panel-scroll-edge'
/** Dispatched for PageUp/PageDown in scene view (detail: { direction: 'up' | 'down' }). */
export const SCENE_PANEL_PAGE_SCROLL_EVENT = 'scene-panel-page-scroll'

/** @type {((direction: 'up' | 'down') => void) | null} */
let sceneKeyboardChevronHandler = null
/** @type {(() => void) | null} */
let sceneKeyboardChevronEndHandler = null
/** @type {((edge: 'top' | 'bottom') => void) | null} */
let sceneScrollEdgeHandler = null
/** @type {((direction: 'up' | 'down') => void) | null} */
let scenePageScrollHandler = null

/** @param {(direction: 'up' | 'down') => void} handler */
export function registerSceneKeyboardChevronHandler(handler) {
  sceneKeyboardChevronHandler = handler
}

/** @param {() => void} handler */
export function registerSceneKeyboardChevronEndHandler(handler) {
  sceneKeyboardChevronEndHandler = handler
}

/** @param {(edge: 'top' | 'bottom') => void} handler */
export function registerSceneScrollEdgeHandler(handler) {
  sceneScrollEdgeHandler = handler
}

/** @param {(direction: 'up' | 'down') => void} handler */
export function registerScenePageScrollHandler(handler) {
  scenePageScrollHandler = handler
}

export function unregisterSceneKeyboardChevronHandlers() {
  sceneKeyboardChevronHandler = null
  sceneKeyboardChevronEndHandler = null
  sceneScrollEdgeHandler = null
  scenePageScrollHandler = null
}

/** @param {'up' | 'down'} direction */
export function notifySceneKeyboardChevron(direction) {
  if (sceneKeyboardChevronHandler) {
    sceneKeyboardChevronHandler(direction)
    return
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SCENE_PANEL_ARROW_KEY_EVENT, { detail: { direction } }))
  }
}

export function notifySceneKeyboardChevronEnd(options = {}) {
  if (sceneKeyboardChevronEndHandler) {
    sceneKeyboardChevronEndHandler(options)
    return
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SCENE_PANEL_ARROW_KEY_END_EVENT, { detail: options }))
  }
}

/** @param {'top' | 'bottom'} edge */
export function notifySceneScrollToEdge(edge) {
  if (sceneScrollEdgeHandler) {
    sceneScrollEdgeHandler(edge)
    return
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SCENE_PANEL_SCROLL_EDGE_EVENT, { detail: { edge } }))
  }
}

/** @param {'up' | 'down'} direction */
export function notifySceneScrollByPage(direction) {
  if (scenePageScrollHandler) {
    scenePageScrollHandler(direction)
    return
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SCENE_PANEL_PAGE_SCROLL_EVENT, { detail: { direction } }))
  }
}

/**
 * @param {number} scrollTop
 * @param {number} clientHeight
 * @param {number} scrollHeight
 * @param {'up' | 'down'} direction
 */
export function getScenePageScrollTarget(scrollTop, clientHeight, scrollHeight, direction) {
  const maxScrollTop = Math.max(0, scrollHeight - clientHeight)
  const delta = direction === 'up' ? -clientHeight : clientHeight
  return Math.max(0, Math.min(maxScrollTop, scrollTop + delta))
}

/**
 * Pointer at the center of the top or bottom autoscroll band (for keyboard ↑/↓ visuals).
 * @param {DOMRect} containerRect
 * @param {number} contentOffsetHeight
 * @param {'up' | 'down'} direction
 */
export function getSyntheticPointerForAutoscrollDirection(containerRect, contentOffsetHeight, direction) {
  const topHeight = Math.floor(contentOffsetHeight / 4)
  const clientX = containerRect.left + containerRect.width / 2
  const clientY = direction === 'up'
    ? containerRect.top + topHeight / 2
    : containerRect.top + topHeight * 3 + topHeight / 2
  return { clientX, clientY }
}

function clamp(val, minVal, maxVal) {
  return Math.max(minVal, Math.min(maxVal, val))
}

/**
 * @param {() => HTMLElement | null} getSceneContent - returns scroll container (#scene-content)
 * @param {() => HTMLElement | null} getSceneContainer - returns bounds container (#scene-container)
 * @returns {{ install: () => void, teardown: () => void, autoscrollDirection: import('vue').Ref<'None'|'Up'|'Down'> }}
 */
export function useSceneAutoScroll(getSceneContent, getSceneContainer) {
  const { store } = useAppStore()

  /** 'None' | 'Up' | 'Down' | 'Top' | 'Bottom'. */
  const autoscrollDirection = ref(AUTOSCROLL_DIRECTION.NONE)

  let autoScrollingInterval = null
  let scrollContentEl = null
  let autoScrollVelocity = 0
  let oldAutoScrollVelocity = 0
  let isMouseOverScene = false
  let boundContainer = null
  let installed = false
  /** null until first sample; then whether pointer is over #scene-container (not resize handle / resume). */
  let pointerInsideSceneContainer = null
  /** Last known pointer position (document mousemove / mouseenter). */
  let lastPointerClientX = null
  let lastPointerClientY = null
  /** 'Top' | 'Bottom' | null — sticky edge state after mouse leaves; cleared when mouse enters center. */
  let stickyEdge = null
  /** True while scene-target ↑/↓ is showing autoscroll chevrons. */
  let keyboardAutoscrollActive = false
  /** @type {'up' | 'down' | null} */
  let lastKeyboardChevronDirection = null
  /** @type {'up' | 'down' | null} */
  let lastPageScrollDirection = null
  /** True while a PageUp/PageDown scroll is in progress or showing page chevrons. */
  let pageKeyboardScrollActive = false
  /** True while Home/End edge scroll is active until key release. */
  let edgeKeyboardScrollActive = false
  let pageScrollChevronTimer = null
  /** @type {((event: Event) => void) | null} */
  let pageScrollListener = null
  /** @type {HTMLElement | null} */
  let pageScrollContentEl = null

  function clearPageScrollChevronTimer() {
    if (pageScrollChevronTimer) {
      clearTimeout(pageScrollChevronTimer)
      pageScrollChevronTimer = null
    }
  }

  function cancelPageScrollFinalization() {
    clearPageScrollChevronTimer()
    if (pageScrollListener && pageScrollContentEl) {
      pageScrollContentEl.removeEventListener('scroll', pageScrollListener)
    }
    pageScrollListener = null
    pageScrollContentEl = null
  }

  function applyCursorHidden() {
    const container = getSceneContainer()
    if (container) container.style.setProperty('cursor', 'none', 'important')
  }

  function removeCursorHidden() {
    const container = getSceneContainer()
    if (container) container.style.removeProperty('cursor')
  }

  function clearStickyEdge() {
    if (stickyEdge) {
      stickyEdge = null
      if (keyboardAutoscrollActive) return
      store.sceneView.isAutoscrolling = false
      autoscrollDirection.value = AUTOSCROLL_DIRECTION.NONE
    }
  }

  function enterStickyEdge(edge) {
    if (autoScrollingInterval) {
      clearInterval(autoScrollingInterval)
      autoScrollingInterval = null
    }
    autoScrollVelocity = 0
    stickyEdge = edge
    store.sceneView.isAutoscrolling = true
    autoscrollDirection.value = edge === 'Top' ? AUTOSCROLL_DIRECTION.TOP : AUTOSCROLL_DIRECTION.BOTTOM
    removeCursorHidden()
  }

  function updateAutoscrollDirection() {
    if (keyboardAutoscrollActive) return
    if (stickyEdge) {
      return
    }
    if (autoScrollingInterval) {
      store.sceneView.isAutoscrolling = true
      const el = getSceneContent()
      if (!el?.isConnected) {
        autoscrollDirection.value = AUTOSCROLL_DIRECTION.NONE
        return
      }
      const scrollTop = el.scrollTop
      const maxScrollTop = Math.max(0, el.scrollHeight - el.clientHeight)
      if (autoScrollVelocity < 0) {
        autoscrollDirection.value = (maxScrollTop > 0 && scrollTop <= EDGE_THRESHOLD_PX)
          ? AUTOSCROLL_DIRECTION.TOP
          : AUTOSCROLL_DIRECTION.UP
      } else if (autoScrollVelocity > 0) {
        autoscrollDirection.value = (maxScrollTop > 0 && scrollTop >= maxScrollTop - EDGE_THRESHOLD_PX)
          ? AUTOSCROLL_DIRECTION.BOTTOM
          : AUTOSCROLL_DIRECTION.DOWN
      } else {
        autoscrollDirection.value = AUTOSCROLL_DIRECTION.NONE
      }
      return
    }
    store.sceneView.isAutoscrolling = false
    autoscrollDirection.value = AUTOSCROLL_DIRECTION.NONE
  }

  function isPointerInSceneContainer(clientX, clientY) {
    const container = getSceneContainer()
    if (!container?.isConnected) return false
    const rect = container.getBoundingClientRect()
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
  }

  /** Top/bottom autoscroll bands from pointer Y inside #scene-container. */
  function getPointerBandInfo(clientX, clientY) {
    const content = getSceneContent()
    const container = getSceneContainer()
    if (!content || !container?.isConnected || !isPointerInSceneContainer(clientX, clientY)) {
      return { inTopZone: false, inBottomZone: false }
    }
    const mouseYContainerRelative = clientY - container.getBoundingClientRect().top
    const topHeight = Math.floor(content.offsetHeight / 4)
    const centerTop = topHeight
    const centerBottom = topHeight * 3
    return {
      inTopZone: mouseYContainerRelative < centerTop,
      inBottomZone: mouseYContainerRelative > centerBottom,
    }
  }

  /** Show edge chevrons when pointer is in a band even if scroll motion has not started yet. */
  function refreshChevronVisibility(clientX, clientY) {
    syncAutoscrollChevronVisibility(clientX, clientY)
  }

  /** Stop scroll interval/velocity without clearing edge-band chevrons (caller may refresh). */
  function stopAutoScrollMotion() {
    if (autoScrollingInterval) {
      clearInterval(autoScrollingInterval)
      autoScrollingInterval = null
    }
    autoScrollVelocity = 0
    oldAutoScrollVelocity = 0
    removeCursorHidden()
  }

  /** Recompute chevrons and autoscroll after pointer (re)enters #scene-container. */
  function recomputeAutoscrollOnSceneReenter(clientX, clientY) {
    if (!isPointerInSceneContainer(clientX, clientY)) return
    isMouseOverScene = true
    oldAutoScrollVelocity = 0
    evaluateAutoScrollAtPointer(clientX, clientY, { forceVelocityUpdate: true })
    refreshChevronVisibility(clientX, clientY)
    requestAnimationFrame(() => {
      if (!isPointerInSceneContainer(clientX, clientY)) return
      refreshChevronVisibility(clientX, clientY)
    })
  }

  function syncSceneContainerPointerBoundary(clientX, clientY) {
    const inside = isPointerInSceneContainer(clientX, clientY)
    if (pointerInsideSceneContainer === null) {
      pointerInsideSceneContainer = inside
      if (inside) {
        recomputeAutoscrollOnSceneReenter(clientX, clientY)
      }
      return
    }
    if (pointerInsideSceneContainer !== inside) {
      pointerInsideSceneContainer = inside
      if (inside) {
        recomputeAutoscrollOnSceneReenter(clientX, clientY)
      } else {
        isMouseOverScene = false
        stopAutoScrolling({ force: true })
      }
    }
  }

  function stopAutoScrolling({ force = false } = {}) {
    if (keyboardAutoscrollActive && !force) return
    clearStickyEdge()
    stopAutoScrollMotion()
    store.sceneView.isAutoscrolling = false
    updateAutoscrollDirection()
  }

  function evaluateAutoScrollAtPointer(clientX, clientY, { forceVelocityUpdate = false } = {}) {
    const content = getSceneContent()
    const container = getSceneContainer()
    if (!content || !container || !container.isConnected) return

    const rect = container.getBoundingClientRect()
    const mouseYContainerRelative = clientY - rect.top
    const topHeight = Math.floor(content.offsetHeight / 4)
    const centerTop = topHeight
    const centerBottom = topHeight * 3
    const inTopZone = mouseYContainerRelative < centerTop
    const inBottomZone = mouseYContainerRelative > centerBottom

    if (!inTopZone && !inBottomZone) {
      if (keyboardAutoscrollActive) return
      clearStickyEdge()
      stopAutoScrolling({ force: true })
      return
    }

    if (stickyEdge === 'Top' && inTopZone) return
    if (stickyEdge === 'Bottom' && inBottomZone) return

    clearStickyEdge()
    updateAutoScrollVelocity(mouseYContainerRelative, content)
    applyCursorHidden()

    const velocityDelta = Math.abs(autoScrollVelocity - oldAutoScrollVelocity)
    if (forceVelocityUpdate || velocityDelta >= AUTOSCROLL_CHANGE_THRESHOLD) {
      if (Math.abs(autoScrollVelocity) < MIN_AUTOSCROLL_VELOCITY) {
        stopAutoScrollMotion()
        refreshChevronVisibility(clientX, clientY)
      } else {
        if (!autoScrollingInterval) {
          store.sceneView.isAutoscrolling = true
          autoScrollingInterval = setInterval(runAutoScrollIntervalTick, AUTOSCROLL_REPEAT_MILLIS)
        }
        updateAutoscrollDirection()
      }
      oldAutoScrollVelocity = autoScrollVelocity
    } else if (autoScrollingInterval) {
      updateAutoscrollDirection()
    } else {
      refreshChevronVisibility(clientX, clientY)
    }
  }

  function handleMouseMove(e) {
    if (keyboardAutoscrollActive) {
      syncAutoscrollChevronVisibility(e.clientX, e.clientY)
      return
    }
    evaluateAutoScrollAtPointer(e.clientX, e.clientY)
    syncAutoscrollChevronVisibility(e.clientX, e.clientY)
  }

  function onScroll() {
    syncAutoscrollChevronVisibility()
  }

  function updateAutoScrollVelocity(mouseYContainerRelative, scrollEl) {
    if (!scrollEl || !scrollEl.isConnected) return

    const topHeight = Math.floor(scrollEl.offsetHeight / 4)
    const centerTop = topHeight
    const centerHeight = topHeight * 2
    const centerBottom = topHeight + centerHeight

    if (mouseYContainerRelative < centerTop) {
      autoScrollVelocity = (mouseYContainerRelative - centerTop) / topHeight * MAX_AUTOSCROLL_VELOCITY
    } else if (mouseYContainerRelative > centerBottom) {
      autoScrollVelocity = (mouseYContainerRelative - centerBottom) / topHeight * MAX_AUTOSCROLL_VELOCITY
    } else {
      autoScrollVelocity = 0
    }
  }

  function onSceneViewPointerEntered(event) {
    const { clientX, clientY } = event.detail || {}
    if (clientX == null || clientY == null) return
    // Scene view = scene-container OR resize-handle; only sync container boundary (do not set inside=true on handle).
    syncSceneContainerPointerBoundary(clientX, clientY)
  }

  function onSceneMouseEnter(e) {
    if (e?.clientX != null && e?.clientY != null) {
      syncSceneContainerPointerBoundary(e.clientX, e.clientY)
      if (isPointerInSceneContainer(e.clientX, e.clientY)) {
        recomputeAutoscrollOnSceneReenter(e.clientX, e.clientY)
      }
      return
    }
    isMouseOverScene = true
  }

  function onSceneMouseLeave() {
    pointerInsideSceneContainer = false
    isMouseOverScene = false
    keyboardAutoscrollActive = false
    lastKeyboardChevronDirection = null
    stopAutoScrolling({ force: true })
  }

  function onSceneViewPointerLeft() {
    pointerInsideSceneContainer = false
    keyboardAutoscrollActive = false
    lastKeyboardChevronDirection = null
    stopAutoScrolling({ force: true })
  }

  function onDocumentMouseEnter(e) {
    if (e?.clientX == null || e?.clientY == null) return
    lastPointerClientX = e.clientX
    lastPointerClientY = e.clientY
    syncSceneContainerPointerBoundary(e.clientX, e.clientY)
    requestAnimationFrame(() => {
      if (lastPointerClientX == null || lastPointerClientY == null) return
      syncSceneContainerPointerBoundary(lastPointerClientX, lastPointerClientY)
      if (isPointerInSceneContainer(lastPointerClientX, lastPointerClientY)) {
        recomputeAutoscrollOnSceneReenter(lastPointerClientX, lastPointerClientY)
      }
    })
  }

  function onDocumentMouseLeave() {
    pointerInsideSceneContainer = false
    isMouseOverScene = false
    keyboardAutoscrollActive = false
    lastKeyboardChevronDirection = null
    stopAutoScrolling({ force: true })
  }

  function showKeyboardAutoscrollChevrons(direction) {
    const content = getSceneContent()
    if (!content?.isConnected) return
    const scrollTop = content.scrollTop
    const maxScrollTop = Math.max(0, content.scrollHeight - content.clientHeight)
    store.sceneView.isAutoscrolling = true
    if (direction === 'up') {
      autoscrollDirection.value = (maxScrollTop > 0 && scrollTop <= EDGE_THRESHOLD_PX)
        ? AUTOSCROLL_DIRECTION.TOP
        : AUTOSCROLL_DIRECTION.UP
    } else {
      autoscrollDirection.value = (maxScrollTop > 0 && scrollTop >= maxScrollTop - EDGE_THRESHOLD_PX)
        ? AUTOSCROLL_DIRECTION.BOTTOM
        : AUTOSCROLL_DIRECTION.DOWN
    }
  }

  /** Keep chevrons aligned with keyboard arrows, pointer bands, or active scroll motion. */
  function syncAutoscrollChevronVisibility(clientX = null, clientY = null) {
    if (keyboardAutoscrollActive && lastKeyboardChevronDirection) {
      showKeyboardAutoscrollChevrons(lastKeyboardChevronDirection)
      return
    }

    if (stickyEdge) {
      store.sceneView.isAutoscrolling = true
      autoscrollDirection.value = stickyEdge === 'Top'
        ? AUTOSCROLL_DIRECTION.TOP
        : AUTOSCROLL_DIRECTION.BOTTOM
      return
    }

    if (autoScrollingInterval) {
      updateAutoscrollDirection()
      return
    }

    if (pageKeyboardScrollActive && lastPageScrollDirection) {
      showKeyboardAutoscrollChevrons(lastPageScrollDirection)
      return
    }

    const resolved = (clientX != null && clientY != null)
      ? { clientX, clientY }
      : resolvePointerClientPosition()
    const { clientX: px, clientY: py } = resolved
    if (px != null && py != null && isPointerInSceneContainer(px, py)) {
      const content = getSceneContent()
      if (!content?.isConnected) return
      const { inTopZone, inBottomZone } = getPointerBandInfo(px, py)
      if (inTopZone || inBottomZone) {
        const scrollTop = content.scrollTop
        const maxScrollTop = Math.max(0, content.scrollHeight - content.clientHeight)
        store.sceneView.isAutoscrolling = true
        if (inTopZone) {
          autoscrollDirection.value = (maxScrollTop > 0 && scrollTop <= EDGE_THRESHOLD_PX)
            ? AUTOSCROLL_DIRECTION.TOP
            : AUTOSCROLL_DIRECTION.UP
        } else {
          autoscrollDirection.value = (maxScrollTop > 0 && scrollTop >= maxScrollTop - EDGE_THRESHOLD_PX)
            ? AUTOSCROLL_DIRECTION.BOTTOM
            : AUTOSCROLL_DIRECTION.DOWN
        }
        return
      }
    }

    store.sceneView.isAutoscrolling = false
    autoscrollDirection.value = AUTOSCROLL_DIRECTION.NONE
  }

  function runAutoScrollIntervalTick() {
    const el = getSceneContent()
    if (!el?.isConnected) {
      stopAutoScrolling({ force: true })
      return
    }
    const currentScrollTop = el.scrollTop
    const maxScrollTop = Math.max(0, el.scrollHeight - el.clientHeight)
    const newScrollTop = clamp(currentScrollTop + autoScrollVelocity, 0, maxScrollTop)
    const scrolled = Math.abs(newScrollTop - currentScrollTop) > 0
    if (scrolled) {
      el.scrollTop = newScrollTop
    } else if (!keyboardAutoscrollActive) {
      if (autoScrollVelocity < 0 && currentScrollTop <= EDGE_THRESHOLD_PX) {
        enterStickyEdge('Top')
        return
      }
      if (autoScrollVelocity > 0 && currentScrollTop >= maxScrollTop - EDGE_THRESHOLD_PX) {
        enterStickyEdge('Bottom')
        return
      }
    } else if (keyboardAutoscrollActive && lastKeyboardChevronDirection) {
      if (autoScrollVelocity < 0 && currentScrollTop <= EDGE_THRESHOLD_PX) {
        enterStickyEdge('Top')
        return
      }
      if (autoScrollVelocity > 0 && currentScrollTop >= maxScrollTop - EDGE_THRESHOLD_PX) {
        enterStickyEdge('Bottom')
        return
      }
    }
    syncAutoscrollChevronVisibility()
  }

  function ensureAutoScrollIntervalRunning() {
    if (autoScrollingInterval) return
    store.sceneView.isAutoscrolling = true
    autoScrollingInterval = setInterval(runAutoScrollIntervalTick, AUTOSCROLL_REPEAT_MILLIS)
  }

  function startKeyboardSceneAutoScroll(direction) {
    if (direction !== 'up' && direction !== 'down') return
    stickyEdge = null
    lastKeyboardChevronDirection = direction
    keyboardAutoscrollActive = true
    autoScrollVelocity = direction === 'up' ? -MAX_AUTOSCROLL_VELOCITY : MAX_AUTOSCROLL_VELOCITY
    oldAutoScrollVelocity = autoScrollVelocity
    applyCursorHidden()
    showKeyboardAutoscrollChevrons(direction)
    ensureAutoScrollIntervalRunning()
  }

  function onScenePanelArrowKey(event) {
    const direction = (event && typeof event === 'object' && 'detail' in event)
      ? event.detail?.direction
      : event
    startKeyboardSceneAutoScroll(direction)
  }

  function scrollToSceneEdge(edge) {
    if (edge !== 'top' && edge !== 'bottom') return
    cancelPageScrollFinalization()
    pageKeyboardScrollActive = false
    edgeKeyboardScrollActive = true
    keyboardAutoscrollActive = false
    lastKeyboardChevronDirection = null
    stopAutoScrollMotion()
    removeCursorHidden()

    const content = getSceneContent()
    if (!content?.isConnected) return

    const maxScrollTop = Math.max(0, content.scrollHeight - content.clientHeight)
    const targetTop = edge === 'top' ? 0 : maxScrollTop
    if (typeof content.scrollTo === 'function') {
      content.scrollTo({ top: targetTop, behavior: 'smooth' })
    } else {
      content.scrollTop = targetTop
    }
    enterStickyEdge(edge === 'top' ? 'Top' : 'Bottom')
  }

  function finishPageScrollChevrons(direction) {
    if (!pageKeyboardScrollActive) return
    clearPageScrollChevronTimer()
    const content = getSceneContent()
    if (!content?.isConnected) return
    const maxScrollTop = Math.max(0, content.scrollHeight - content.clientHeight)
    const scrollTop = content.scrollTop
    if (direction === 'up' && scrollTop <= EDGE_THRESHOLD_PX) {
      pageKeyboardScrollActive = false
      enterStickyEdge('Top')
      return
    }
    if (direction === 'down' && scrollTop >= maxScrollTop - EDGE_THRESHOLD_PX) {
      pageKeyboardScrollActive = false
      enterStickyEdge('Bottom')
      return
    }
    showKeyboardAutoscrollChevrons(direction)
  }

  function scrollSceneByPage(direction) {
    if (direction !== 'up' && direction !== 'down') return
    cancelPageScrollFinalization()
    pageKeyboardScrollActive = true
    lastPageScrollDirection = direction
    if (keyboardAutoscrollActive) {
      keyboardAutoscrollActive = false
      lastKeyboardChevronDirection = null
      stopAutoScrollMotion()
    }
    stickyEdge = null
    removeCursorHidden()

    const content = getSceneContent()
    if (!content?.isConnected) {
      pageKeyboardScrollActive = false
      lastPageScrollDirection = null
      return
    }

    const targetTop = getScenePageScrollTarget(
      content.scrollTop,
      content.clientHeight,
      content.scrollHeight,
      direction
    )

    showKeyboardAutoscrollChevrons(direction)
    store.sceneView.isAutoscrolling = true

    pageScrollContentEl = content
    const finalize = () => {
      if (!pageKeyboardScrollActive) {
        cancelPageScrollFinalization()
        return
      }
      cancelPageScrollFinalization()
      finishPageScrollChevrons(direction)
    }
    pageScrollListener = () => {
      if (!pageKeyboardScrollActive) return
      clearPageScrollChevronTimer()
      pageScrollChevronTimer = setTimeout(finalize, 120)
    }
    content.addEventListener('scroll', pageScrollListener, { passive: true })
    pageScrollChevronTimer = setTimeout(finalize, 600)

    if (typeof content.scrollTo === 'function') {
      content.scrollTo({ top: targetTop, behavior: 'smooth' })
    } else {
      content.scrollTop = targetTop
      finalize()
    }
  }

  function onScenePanelScrollEdge(event) {
    const edge = (event && typeof event === 'object' && 'detail' in event)
      ? event.detail?.edge
      : event
    scrollToSceneEdge(edge)
  }

  function onScenePanelPageScroll(event) {
    const direction = (event && typeof event === 'object' && 'detail' in event)
      ? event.detail?.direction
      : event
    scrollSceneByPage(direction)
  }

  function resolvePointerClientPosition() {
    if (lastPointerClientX != null && lastPointerClientY != null) {
      return { clientX: lastPointerClientX, clientY: lastPointerClientY }
    }
    const { clientX, clientY } = getLastPointerPosition()
    if (clientX != null && clientY != null) {
      lastPointerClientX = clientX
      lastPointerClientY = clientY
    }
    return { clientX, clientY }
  }

  function handOffToPointerAutoscroll() {
    const { clientX, clientY } = resolvePointerClientPosition()
    if (clientX != null && clientY != null && isPointerInSceneContainer(clientX, clientY)) {
      pointerInsideSceneContainer = true
      isMouseOverScene = true
      recomputeAutoscrollOnSceneReenter(clientX, clientY)
      return
    }
    stopAutoScrolling({ force: true })
  }

  function onSceneKeyboardScrollEnd(options = {}) {
    const { handOffToPointer = true } = (options && typeof options === 'object' && 'detail' in options)
      ? (options.detail || {})
      : (options || {})
    const wasPageScroll = pageKeyboardScrollActive
    const wasEdgeScroll = edgeKeyboardScrollActive
    pageKeyboardScrollActive = false
    edgeKeyboardScrollActive = false
    lastPageScrollDirection = null
    cancelPageScrollFinalization()
    if (keyboardAutoscrollActive) {
      keyboardAutoscrollActive = false
      lastKeyboardChevronDirection = null
      removeCursorHidden()
      stopAutoScrollMotion()
      if (handOffToPointer) {
        handOffToPointerAutoscroll()
      } else {
        syncAutoscrollChevronVisibility()
      }
      return
    }
    if (stickyEdge && !wasPageScroll && !wasEdgeScroll) return
    if (!wasPageScroll && !wasEdgeScroll) {
      store.sceneView.isAutoscrolling = false
      autoscrollDirection.value = AUTOSCROLL_DIRECTION.NONE
    }
    if (wasPageScroll || wasEdgeScroll) {
      stickyEdge = null
    }
    if (handOffToPointer) {
      handOffToPointerAutoscroll()
    } else {
      syncAutoscrollChevronVisibility()
    }
  }

  function onDocumentMouseMove(e) {
    lastPointerClientX = e.clientX
    lastPointerClientY = e.clientY
    syncSceneContainerPointerBoundary(e.clientX, e.clientY)

    if (!stickyEdge) return
    if (keyboardAutoscrollActive) return
    const container = getSceneContainer()
    const content = getSceneContent()
    if (!container || !content || !container.isConnected) return
    const rect = container.getBoundingClientRect()
    if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
      return
    }
    const mouseYContainerRelative = e.clientY - rect.top
    const topHeight = Math.floor(content.offsetHeight / 4)
    const centerTop = topHeight
    const centerBottom = topHeight * 3
    const inCenterZone = mouseYContainerRelative >= centerTop && mouseYContainerRelative <= centerBottom
    if (inCenterZone) {
      clearStickyEdge()
    }
  }

  function install() {
    if (installed) return
    boundContainer = getSceneContainer()
    scrollContentEl = getSceneContent()
    if (!boundContainer || !scrollContentEl) return
    boundContainer.addEventListener('mousemove', handleMouseMove)
    boundContainer.addEventListener('mouseenter', onSceneMouseEnter)
    boundContainer.addEventListener('mouseleave', onSceneMouseLeave)
    scrollContentEl.addEventListener('scroll', onScroll, { passive: true })
    document.addEventListener('mousemove', onDocumentMouseMove, { passive: true })
    document.addEventListener('mouseenter', onDocumentMouseEnter)
    document.addEventListener('mouseleave', onDocumentMouseLeave)
    window.addEventListener('scene-view-pointer-left', onSceneViewPointerLeft)
    window.addEventListener('scene-view-pointer-entered', onSceneViewPointerEntered)
    window.addEventListener(SCENE_PANEL_ARROW_KEY_EVENT, onScenePanelArrowKey)
    window.addEventListener(SCENE_PANEL_ARROW_KEY_END_EVENT, onSceneKeyboardScrollEnd)
    window.addEventListener(SCENE_PANEL_SCROLL_EDGE_EVENT, onScenePanelScrollEdge)
    window.addEventListener(SCENE_PANEL_PAGE_SCROLL_EVENT, onScenePanelPageScroll)
    registerSceneKeyboardChevronHandler(onScenePanelArrowKey)
    registerSceneKeyboardChevronEndHandler(onSceneKeyboardScrollEnd)
    registerSceneScrollEdgeHandler(scrollToSceneEdge)
    registerScenePageScrollHandler(scrollSceneByPage)
    installed = true
  }

  function teardown() {
    if (!installed) return
    unregisterSceneKeyboardChevronHandlers()
    pageKeyboardScrollActive = false
    edgeKeyboardScrollActive = false
    cancelPageScrollFinalization()
    window.removeEventListener(SCENE_PANEL_PAGE_SCROLL_EVENT, onScenePanelPageScroll)
    window.removeEventListener(SCENE_PANEL_SCROLL_EDGE_EVENT, onScenePanelScrollEdge)
    window.removeEventListener(SCENE_PANEL_ARROW_KEY_END_EVENT, onSceneKeyboardScrollEnd)
    window.removeEventListener(SCENE_PANEL_ARROW_KEY_EVENT, onScenePanelArrowKey)
    window.removeEventListener('scene-view-pointer-left', onSceneViewPointerLeft)
    window.removeEventListener('scene-view-pointer-entered', onSceneViewPointerEntered)
    document.removeEventListener('mouseenter', onDocumentMouseEnter)
    document.removeEventListener('mouseleave', onDocumentMouseLeave)
    document.removeEventListener('mousemove', onDocumentMouseMove)
    if (scrollContentEl) {
      scrollContentEl.removeEventListener('scroll', onScroll)
      scrollContentEl = null
    }
    if (boundContainer) {
      boundContainer.removeEventListener('mousemove', handleMouseMove)
      boundContainer.removeEventListener('mouseenter', onSceneMouseEnter)
      boundContainer.removeEventListener('mouseleave', onSceneMouseLeave)
      boundContainer = null
    }
    stopAutoScrolling({ force: true })
    removeCursorHidden()
    pointerInsideSceneContainer = null
    lastPointerClientX = null
    lastPointerClientY = null
    keyboardAutoscrollActive = false
    lastKeyboardChevronDirection = null
    installed = false
  }

  return { install, teardown, autoscrollDirection }
}
