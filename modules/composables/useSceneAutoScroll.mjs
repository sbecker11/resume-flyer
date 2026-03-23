/**
 * Mouse-driven auto-scroll for the scene view.
 * When the mouse nears the top or bottom quarter of the scene container,
 * the scene-content scrolls vertically (works in any focal point mode). The cursor is hidden
 * and 32x32 PNG icons at top-right and bottom-right indicate the active zone.
 *
 * Ported from flock-of-postcards main.mjs (updateAutoScrollVelocity / handleFocalPointMove).
 */

import { ref } from 'vue'
import { useAppStore } from '../stores/appStore.mjs'

const AUTOSCROLL_REPEAT_MILLIS = 10
const MAX_AUTOSCROLL_VELOCITY = 10.0
const MIN_AUTOSCROLL_VELOCITY = 2.0
const AUTOSCROLL_CHANGE_THRESHOLD = 2.0

const CURSORS_BASE = '/static_content/icons/cursors'
const EDGE_THRESHOLD_PX = 5

/** 32x32 PNG icons. */
export const AUTOSCROLL_UP_SRC = `${CURSORS_BASE}/up-32-grey.png`
export const AUTOSCROLL_DOWN_SRC = `${CURSORS_BASE}/down-32-grey.png`
export const AUTOSCROLL_TOP_SRC = `${CURSORS_BASE}/top-32-grey.png`
export const AUTOSCROLL_BOTTOM_SRC = `${CURSORS_BASE}/bottom-32-grey.png`

/** 'None' | 'Up' | 'Down' | 'Top' | 'Bottom'. Top/Bottom = at scroll edge during autoscroll only. */
export const AUTOSCROLL_DIRECTION = { NONE: 'None', UP: 'Up', DOWN: 'Down', TOP: 'Top', BOTTOM: 'Bottom' }

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
  /** 'Top' | 'Bottom' | null — sticky edge state after mouse leaves; cleared when mouse enters center. */
  let stickyEdge = null

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

  function stopAutoScrolling() {
    clearStickyEdge()
    if (autoScrollingInterval) {
      clearInterval(autoScrollingInterval)
      autoScrollingInterval = null
    }
    autoScrollVelocity = 0
    store.sceneView.isAutoscrolling = false
    removeCursorHidden()
    updateAutoscrollDirection()
  }

  function onScroll() {
    if (autoScrollingInterval) {
      updateAutoscrollDirection()
    }
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

  function handleMouseMove(e) {
    const content = getSceneContent()
    const container = getSceneContainer()
    if (!content || !container || !container.isConnected) return


    const rect = container.getBoundingClientRect()
    const mouseYContainerRelative = e.clientY - rect.top
    const topHeight = Math.floor(content.offsetHeight / 4)
    const centerTop = topHeight
    const centerBottom = topHeight * 3
    const inTopZone = mouseYContainerRelative < centerTop
    const inBottomZone = mouseYContainerRelative > centerBottom

    if (!inTopZone && !inBottomZone) {
      clearStickyEdge()
      stopAutoScrolling()
      return
    }

    if (stickyEdge === 'Top' && inTopZone) return
    if (stickyEdge === 'Bottom' && inBottomZone) return

    clearStickyEdge()
    updateAutoScrollVelocity(mouseYContainerRelative, content)
    applyCursorHidden()

    if (Math.abs(autoScrollVelocity - oldAutoScrollVelocity) >= AUTOSCROLL_CHANGE_THRESHOLD) {
      if (Math.abs(autoScrollVelocity) < MIN_AUTOSCROLL_VELOCITY) {
        stopAutoScrolling()
      } else {
        if (!autoScrollingInterval) {
          store.sceneView.isAutoscrolling = true
          autoScrollingInterval = setInterval(() => {
            const el = getSceneContent()
            if (!el?.isConnected) {
              stopAutoScrolling()
              return
            }
            const currentScrollTop = el.scrollTop
            const maxScrollTop = Math.max(0, el.scrollHeight - el.clientHeight)
            const newScrollTop = clamp(currentScrollTop + autoScrollVelocity, 0, maxScrollTop)
            const scrolled = Math.abs(newScrollTop - currentScrollTop) > 0
            if (scrolled) {
              el.scrollTop = newScrollTop
            } else {
              if (autoScrollVelocity < 0 && currentScrollTop <= EDGE_THRESHOLD_PX) {
                enterStickyEdge('Top')
                return
              }
              if (autoScrollVelocity > 0 && currentScrollTop >= maxScrollTop - EDGE_THRESHOLD_PX) {
                enterStickyEdge('Bottom')
                return
              }
            }
            updateAutoscrollDirection()
          }, AUTOSCROLL_REPEAT_MILLIS)
        }
        updateAutoscrollDirection()
      }
      oldAutoScrollVelocity = autoScrollVelocity
    } else if (autoScrollingInterval) {
      updateAutoscrollDirection()
    }
  }

  function onSceneMouseEnter() {
    isMouseOverScene = true
  }

  function onSceneMouseLeave() {
    isMouseOverScene = false
    if (stickyEdge) return
    if (!autoScrollingInterval) return
    if (autoScrollVelocity === 0) {
      stopAutoScrolling()
    }
  }

  function onDocumentMouseMove(e) {
    if (!stickyEdge) return
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
    installed = true
  }

  function teardown() {
    if (!installed) return
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
    stopAutoScrolling()
    removeCursorHidden()
    installed = false
  }

  return { install, teardown, autoscrollDirection }
}
