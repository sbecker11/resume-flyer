// modules/composables/useKeyboardNavigation.mjs
// Vue 3 keyboard navigation — scene/resume panel scroll based on pointer position.

import { onMounted, onUnmounted } from 'vue'
import { reportError } from '../utils/errorReporting.mjs'
import {
  installPanelPointerTracking,
  beginKeyboardNavigationPanel,
  endKeyboardNavigationPanel,
  scrollSelectedResumeListingIntoView,
  focusResumePanelScrollport,
  focusScenePanelScrollport,
  isSceneKeyboardChevronContext,
  isResumeViewHovered,
  isPointerInsideResumeView,
  getLastPointerPosition,
} from '../utils/panelKeyboardScroll.mjs'
import {
  notifySceneKeyboardChevron,
  notifySceneKeyboardChevronEnd,
  notifySceneScrollToEdge,
  notifySceneScrollByPage,
} from './useSceneAutoScroll.mjs'

let keyboardNavEndTimer = null
let sceneChevronEndTimer = null

const ARROW_UP_DOWN = new Set(['ArrowUp', 'ArrowDown'])
const PAGE_UP_DOWN = new Set(['PageUp', 'PageDown'])
const HOME_END = new Set(['Home', 'End'])
const SCENE_SCROLL_KEYS = new Set([...ARROW_UP_DOWN, ...PAGE_UP_DOWN, ...HOME_END])

/** @type {Set<'ArrowUp' | 'ArrowDown'>} */
const heldArrowKeys = new Set()
/** @type {Set<'PageUp' | 'PageDown'>} */
const heldPageKeys = new Set()
/** @type {Set<'Home' | 'End'>} */
const heldEdgeKeys = new Set()
/** @type {'ArrowUp' | 'ArrowDown' | null} */
let optionEdgeScrollKey = null
let sceneChevronsActiveFromKeyboard = false
/** @type {'up' | 'down' | null} */
let sceneChevronDirection = null

function resolveResumeListController() {
  return window.resumeFlyer?.resumeListController ?? null
}

export function useKeyboardNavigation() {
  installPanelPointerTracking()

  const shouldBlockPanelScrollKeys = (element) => {
    if (!element) return false

    const tagName = element.tagName.toLowerCase()

    if (element.id === 'resume-content-listing' || element.id === 'scene-content') {
      return false
    }

    if (['input', 'textarea', 'select'].includes(tagName)) return true
    if (element.contentEditable === 'true') return true
    if (element.closest('.dropdown-menu, .modal, [role="dialog"][aria-modal="true"], [role="combobox"]')) return true
    if (element.closest('.color-palette-dropdown, .sort-dropdown, .resume-selector-menu, .rde-overlay, .rde-modal')) {
      return true
    }

    if (isSceneKeyboardChevronContext() && element.closest('#scene-container, #resize-handle')) {
      return false
    }

    const { clientX, clientY } = getLastPointerPosition()
    const resumeActive = isResumeViewHovered() || isPointerInsideResumeView(clientX, clientY)
    if (resumeActive && element.closest('#resume-container, #resume-divs-controls')) {
      return false
    }

    if (tagName === 'button') return true

    return false
  }

  const endSceneKeyboardChevrons = () => {
    clearTimeout(sceneChevronEndTimer)
    sceneChevronEndTimer = null
    if (!sceneChevronsActiveFromKeyboard) return
    notifySceneKeyboardChevronEnd()
    sceneChevronsActiveFromKeyboard = false
    sceneChevronDirection = null
  }

  const finishKeyboardNavPanel = () => {
    clearTimeout(keyboardNavEndTimer)
    keyboardNavEndTimer = setTimeout(() => {
      endKeyboardNavigationPanel()
      keyboardNavEndTimer = null
    }, 600)
  }

  const runSceneScrollAction = (action) => {
    try {
      action()
      requestAnimationFrame(() => {
        focusScenePanelScrollport()
      })
    } catch (error) {
      reportError(error, '[KeyboardNavigation] Scene keyboard scroll failed')
      throw error
    } finally {
      finishKeyboardNavPanel()
    }
  }

  const handleSceneEdgeScroll = (edge) => {
    runSceneScrollAction(() => {
      notifySceneScrollToEdge(edge)
    })
  }

  const handleKeyDown = (event) => {
    const activeElement = document.activeElement

    if (shouldBlockPanelScrollKeys(activeElement)) {
      return
    }

    const key = event.key

    if (event.altKey && ARROW_UP_DOWN.has(key)) {
      event.preventDefault()
      const scrollTarget = beginKeyboardNavigationPanel()
      if (scrollTarget !== 'scene') {
        return
      }
      if (heldEdgeKeys.size === 0 && !optionEdgeScrollKey) {
        endSceneKeyboardChevrons()
      }
      optionEdgeScrollKey = key
      sceneChevronsActiveFromKeyboard = true
      handleSceneEdgeScroll(key === 'ArrowUp' ? 'top' : 'bottom')
      return
    }

    if (!SCENE_SCROLL_KEYS.has(key)) {
      return
    }

    event.preventDefault()

    const scrollTarget = beginKeyboardNavigationPanel()
    const sceneScroll = scrollTarget === 'scene'

    if (sceneScroll) {
      if (HOME_END.has(key)) {
        if (heldEdgeKeys.size === 0) {
          endSceneKeyboardChevrons()
        }
        heldEdgeKeys.add(key)
        sceneChevronsActiveFromKeyboard = true
        handleSceneEdgeScroll(key === 'Home' ? 'top' : 'bottom')
        return
      }

      if (PAGE_UP_DOWN.has(key)) {
        if (heldPageKeys.size === 0) {
          endSceneKeyboardChevrons()
        }
        const direction = key === 'PageUp' ? 'up' : 'down'
        heldPageKeys.add(key)
        sceneChevronDirection = direction
        sceneChevronsActiveFromKeyboard = true
        runSceneScrollAction(() => {
          notifySceneScrollByPage(direction)
        })
        return
      }

      const chevronDirection = key === 'ArrowUp' ? 'up' : 'down'
      heldArrowKeys.add(key)
      clearTimeout(sceneChevronEndTimer)
      sceneChevronEndTimer = null
      sceneChevronDirection = chevronDirection
      notifySceneKeyboardChevron(chevronDirection)
      sceneChevronsActiveFromKeyboard = true
      try {
        requestAnimationFrame(() => {
          focusScenePanelScrollport()
        })
      } catch (error) {
        reportError(error, '[KeyboardNavigation] Scene arrow autoscroll failed')
        throw error
      } finally {
        finishKeyboardNavPanel()
      }
      return
    }

    if (!ARROW_UP_DOWN.has(key)) {
      return
    }

    const resumeListController = resolveResumeListController()
    if (!resumeListController) {
      console.warn('[KeyboardNavigation] Resume list controller not available')
      return
    }

    try {
      if (key === 'ArrowUp') {
        resumeListController.goToPreviousResumeItem()
      } else {
        resumeListController.goToNextResumeItem()
      }

      requestAnimationFrame(() => {
        scrollSelectedResumeListingIntoView({ behavior: 'smooth' })
        focusResumePanelScrollport()
      })
    } catch (error) {
      reportError(error, '[KeyboardNavigation] Arrow key navigation failed')
      throw error
    } finally {
      finishKeyboardNavPanel()
    }
  }

  const getHeldArrowAutoscrollDirection = () => {
    if (heldArrowKeys.has('ArrowUp')) return 'up'
    if (heldArrowKeys.has('ArrowDown')) return 'down'
    return null
  }

  const finishSuppressedSceneScroll = () => {
    clearTimeout(sceneChevronEndTimer)
    sceneChevronEndTimer = null
    const resumeDirection = getHeldArrowAutoscrollDirection()
    notifySceneKeyboardChevronEnd({ handOffToPointer: resumeDirection == null })
    if (resumeDirection) {
      sceneChevronDirection = resumeDirection
      notifySceneKeyboardChevron(resumeDirection)
      sceneChevronsActiveFromKeyboard = true
      return
    }
    sceneChevronsActiveFromKeyboard = false
    sceneChevronDirection = null
  }

  const handleKeyUp = (event) => {
    const key = event.key

    if (PAGE_UP_DOWN.has(key)) {
      heldPageKeys.delete(key)
      if (heldPageKeys.size === 0) {
        finishSuppressedSceneScroll()
      }
      return
    }

    if (HOME_END.has(key)) {
      heldEdgeKeys.delete(key)
      if (heldEdgeKeys.size === 0) {
        finishSuppressedSceneScroll()
      }
      return
    }

    if (key === 'Alt' && optionEdgeScrollKey) {
      optionEdgeScrollKey = null
      finishSuppressedSceneScroll()
      return
    }

    if (!ARROW_UP_DOWN.has(key)) {
      return
    }

    const wasOptionEdgeScroll = optionEdgeScrollKey === key
    if (wasOptionEdgeScroll) {
      optionEdgeScrollKey = null
    }

    heldArrowKeys.delete(key)

    if (wasOptionEdgeScroll) {
      finishSuppressedSceneScroll()
      return
    }

    if (!sceneChevronsActiveFromKeyboard) {
      return
    }

    if (heldArrowKeys.has('ArrowUp')) {
      sceneChevronDirection = 'up'
      notifySceneKeyboardChevron('up')
      return
    }
    if (heldArrowKeys.has('ArrowDown')) {
      sceneChevronDirection = 'down'
      notifySceneKeyboardChevron('down')
      return
    }

    endSceneKeyboardChevrons()
  }

  const handleWindowBlur = () => {
    heldArrowKeys.clear()
    heldPageKeys.clear()
    heldEdgeKeys.clear()
    optionEdgeScrollKey = null
    endSceneKeyboardChevrons()
  }

  const checkServiceAvailability = () => {
    const isAvailable = !!resolveResumeListController()
    console.log(`[KeyboardNavigation] Resume list controller available: ${isAvailable ? '✅' : '❌'}`)
    return isAvailable
  }

  const initialize = () => {
    console.log('[KeyboardNavigation] Initializing pointer-first scene/resume keyboard scrolling')
    checkServiceAvailability()
    document.addEventListener('keydown', handleKeyDown, true)
    document.addEventListener('keyup', handleKeyUp, true)
    window.addEventListener('blur', handleWindowBlur)
  }

  const destroy = () => {
    clearTimeout(keyboardNavEndTimer)
    clearTimeout(sceneChevronEndTimer)
    keyboardNavEndTimer = null
    sceneChevronEndTimer = null
    heldArrowKeys.clear()
    heldPageKeys.clear()
    heldEdgeKeys.clear()
    optionEdgeScrollKey = null
    sceneChevronsActiveFromKeyboard = false
    sceneChevronDirection = null
    document.removeEventListener('keydown', handleKeyDown, true)
    document.removeEventListener('keyup', handleKeyUp, true)
    window.removeEventListener('blur', handleWindowBlur)
  }

  onMounted(() => {
    initialize()
  })

  onUnmounted(() => {
    destroy()
  })

  return {
    isServiceAvailable: checkServiceAvailability,
    initialize,
    destroy,
    handleKeyDown,
    resumeListController: resolveResumeListController(),
  }
}
