// modules/composables/useKeyboardNavigation.mjs
// Vue 3 keyboard navigation — ↑/↓ scroll scene or resume panel based on pointer position.

import { onMounted, onUnmounted } from 'vue'
import { reportError } from '../utils/errorReporting.mjs'
import {
  installPanelPointerTracking,
  beginKeyboardNavigationPanel,
  endKeyboardNavigationPanel,
  scrollSelectedResumeListingIntoView,
  focusResumePanelScrollport,
  focusScenePanelScrollport,
} from '../utils/panelKeyboardScroll.mjs'

function resolveResumeListController() {
  return window.resumeFlyer?.resumeListController ?? null
}

export function useKeyboardNavigation() {
  installPanelPointerTracking()

  const isInputContext = (element) => {
    if (!element) return false

    const tagName = element.tagName.toLowerCase()

    if (element.id === 'resume-content-listing' || element.id === 'scene-content') {
      return false
    }

    const inputTypes = ['input', 'textarea', 'select']

    if (inputTypes.includes(tagName)) return true
    if (tagName === 'button' && !element.closest('#resume-divs-controls')) return true
    if (element.contentEditable === 'true') return true
    if (element.closest('.dropdown-menu, .modal, [role="combobox"]')) return true
    if (element.closest('.color-palette-dropdown, .sort-dropdown')) return true

    return false
  }

  const handleKeyDown = (event) => {
    const activeElement = document.activeElement

    if (isInputContext(activeElement)) {
      return
    }

    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') {
      return
    }

    event.preventDefault()

    const resumeListController = resolveResumeListController()
    if (!resumeListController) {
      console.warn('[KeyboardNavigation] Resume list controller not available')
      return
    }

    const scrollTarget = beginKeyboardNavigationPanel()

    try {
      if (event.key === 'ArrowUp') {
        resumeListController.goToPreviousResumeItem()
      } else {
        resumeListController.goToNextResumeItem()
      }

      requestAnimationFrame(() => {
        if (scrollTarget === 'resume') {
          scrollSelectedResumeListingIntoView({ behavior: 'smooth' })
          focusResumePanelScrollport()
        } else {
          focusScenePanelScrollport()
        }
      })
    } catch (error) {
      reportError(error, '[KeyboardNavigation] Arrow key navigation failed')
      throw error
    } finally {
      setTimeout(() => endKeyboardNavigationPanel(), 600)
    }
  }

  const checkServiceAvailability = () => {
    const isAvailable = !!resolveResumeListController()
    console.log(`[KeyboardNavigation] Resume list controller available: ${isAvailable ? '✅' : '❌'}`)
    return isAvailable
  }

  const initialize = () => {
    console.log('[KeyboardNavigation] Initializing pointer-first ↑/↓ panel scrolling')
    checkServiceAvailability()
    document.addEventListener('keydown', handleKeyDown)
  }

  const destroy = () => {
    document.removeEventListener('keydown', handleKeyDown)
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
