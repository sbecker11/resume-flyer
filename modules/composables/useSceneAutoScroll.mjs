/**
 * Focal-point-driven auto-scroll for the scene view.
 * When the focal point (mouse) nears the top or bottom edges of the scene container,
 * the scene-content scrolls vertically with velocity proportional to distance into the edge zone.
 *
 * Ported from flock-of-postcards main.mjs (updateAutoScrollVelocity / handleFocalPointMove).
 */

import { useAppStore } from '../stores/appStore.mjs'

const AUTOSCROLL_REPEAT_MILLIS = 10
const MAX_AUTOSCROLL_VELOCITY = 10.0
const MIN_AUTOSCROLL_VELOCITY = 2.0
const AUTOSCROLL_CHANGE_THRESHOLD = 2.0
const FOCALPOINT_MODES = { LOCKED: 'LOCKED', FOLLOWING: 'FOLLOWING', DRAGGING: 'DRAGGING' }

function clamp(val, minVal, maxVal) {
  return Math.max(minVal, Math.min(maxVal, val))
}

/**
 * @param {() => HTMLElement | null} getSceneContent - returns scroll container (#scene-content)
 * @param {() => HTMLElement | null} getSceneContainer - returns bounds container (#scene-container)
 * @returns {{ install: () => void, teardown: () => void }}
 */
export function useSceneAutoScroll(getSceneContent, getSceneContainer) {
  const { store } = useAppStore()

  let autoScrollingInterval = null
  let autoScrollVelocity = 0
  let oldAutoScrollVelocity = 0
  let isMouseOverScene = false
  let boundContainer = null
  let installed = false

  function stopAutoScrolling() {
    if (autoScrollingInterval) {
      clearInterval(autoScrollingInterval)
      autoScrollingInterval = null
    }
    autoScrollVelocity = 0
  }

  function updateAutoScrollVelocity(focalPointYContainerRelative, scrollEl) {
    if (!scrollEl || !scrollEl.isConnected) return

    const topHeight = Math.floor(scrollEl.offsetHeight / 4)
    const centerTop = topHeight
    const centerHeight = topHeight * 2
    const centerBottom = topHeight + centerHeight

    if (focalPointYContainerRelative < centerTop) {
      autoScrollVelocity = (focalPointYContainerRelative - centerTop) / topHeight * MAX_AUTOSCROLL_VELOCITY
    } else if (focalPointYContainerRelative > centerBottom) {
      autoScrollVelocity = (focalPointYContainerRelative - centerBottom) / topHeight * MAX_AUTOSCROLL_VELOCITY
    } else {
      autoScrollVelocity = 0
    }
  }

  function handleFocalPointChanged() {
    const content = getSceneContent()
    const container = getSceneContainer()
    if (!content || !container || !isMouseOverScene) {
      stopAutoScrolling()
      return
    }

    const mode = store.focalPoint?.mode
    if (mode !== FOCALPOINT_MODES.FOLLOWING && mode !== FOCALPOINT_MODES.DRAGGING) {
      stopAutoScrolling()
      return
    }

    const focalY = store.focalPoint?.y ?? 0
    const rect = container.getBoundingClientRect()
    const focalYContainerRelative = focalY - rect.top

    updateAutoScrollVelocity(focalYContainerRelative, content)

    if (Math.abs(autoScrollVelocity - oldAutoScrollVelocity) >= AUTOSCROLL_CHANGE_THRESHOLD) {
      if (Math.abs(autoScrollVelocity) < MIN_AUTOSCROLL_VELOCITY) {
        stopAutoScrolling()
      } else {
        if (!autoScrollingInterval) {
          autoScrollingInterval = setInterval(() => {
            const el = getSceneContent()
            if (!el?.isConnected) {
              stopAutoScrolling()
              return
            }
            const currentScrollTop = el.scrollTop
            const maxScrollTop = Math.max(0, el.scrollHeight - el.clientHeight)
            const newScrollTop = clamp(currentScrollTop + autoScrollVelocity, 0, maxScrollTop)

            if (Math.abs(newScrollTop - currentScrollTop) > 0) {
              el.scrollTop = newScrollTop
            } else {
              stopAutoScrolling()
            }
          }, AUTOSCROLL_REPEAT_MILLIS)
        }
      }
      oldAutoScrollVelocity = autoScrollVelocity
    }
  }

  function onSceneMouseEnter() {
    isMouseOverScene = true
  }

  function onSceneMouseLeave() {
    isMouseOverScene = false
    stopAutoScrolling()
  }

  function install() {
    if (installed) return
    boundContainer = getSceneContainer()
    if (!boundContainer) return
    window.addEventListener('focal-point-changed', handleFocalPointChanged)
    boundContainer.addEventListener('mouseenter', onSceneMouseEnter)
    boundContainer.addEventListener('mouseleave', onSceneMouseLeave)
    installed = true
  }

  function teardown() {
    if (!installed) return
    window.removeEventListener('focal-point-changed', handleFocalPointChanged)
    if (boundContainer) {
      boundContainer.removeEventListener('mouseenter', onSceneMouseEnter)
      boundContainer.removeEventListener('mouseleave', onSceneMouseLeave)
      boundContainer = null
    }
    stopAutoScrolling()
    installed = false
  }

  return { install, teardown }
}
