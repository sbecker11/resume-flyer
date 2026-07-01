/**
 * Pointer- and focus-aware vertical scroll for scene (#scene-content) and resume (#resume-content-listing).
 * Works regardless of layout-toggle orientation (scene-left vs scene-right) — uses container IDs, not screen side.
 */

import { scrollResumeListingElementIntoView } from './resumeListScroll.mjs'

/** Fraction of scrollport height moved per arrow key press. */
export const PANEL_ARROW_SCROLL_STEP_RATIO = 0.2
export const PANEL_ARROW_SCROLL_MIN_PX = 48

let lastPointerClientX = null
let lastPointerClientY = null
/** @type {'scene' | 'resume' | null} Last panel the user interacted with (hover, click, or focus). */
let activePanel = null
/** Frozen during one ↑/↓ key handling chain so async selection handlers use the same target. */
let keyboardScrollTargetPanel = null
let pointerTrackingInstalled = false

function getSceneContainerEl() {
    if (typeof document === 'undefined') return null
    return document.getElementById('scene-container')
}

function getResizeHandleEl() {
    if (typeof document === 'undefined') return null
    return document.getElementById('resize-handle')
}

function getResumeContainerEl() {
    if (typeof document === 'undefined') return null
    return document.getElementById('resume-container')
}

function isPointInElementRect(clientX, clientY, el) {
    if (!el || clientX == null || clientY == null) return false
    const rect = el.getBoundingClientRect()
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
}

function isElementInSceneFocalZone(el) {
    if (!el) return false
    const sceneContainer = getSceneContainerEl()
    if (sceneContainer?.contains(el)) return true
    const resizeHandle = getResizeHandleEl()
    return !!(resizeHandle && resizeHandle.contains(el))
}

function isElementInResumeZone(el) {
    if (!el) return false
    const resumeContainer = getResumeContainerEl()
    return !!(resumeContainer && resumeContainer.contains(el))
}

function recordPointer(clientX, clientY) {
    lastPointerClientX = clientX
    lastPointerClientY = clientY
}

/** @param {'scene' | 'resume'} panel */
export function setActivePanel(panel) {
    activePanel = panel
}

/** @returns {'scene' | 'resume' | null} */
export function getActivePanel() {
    return activePanel
}

/** @returns {{ clientX: number | null, clientY: number | null }} */
export function getLastPointerPosition() {
    return { clientX: lastPointerClientX, clientY: lastPointerClientY }
}

/** Scene-side zone: #scene-container and #resize-handle (rect hit-test only — layout-toggle safe). */
export function isPointerInsideSceneView(clientX, clientY) {
    if (clientX == null || clientY == null || typeof document === 'undefined') return false
    return isPointInElementRect(clientX, clientY, getSceneContainerEl())
        || isPointInElementRect(clientX, clientY, getResizeHandleEl())
}

/** Resume zone: #resume-container (rect hit-test only). */
export function isPointerInsideResumeView(clientX, clientY) {
    if (clientX == null || clientY == null || typeof document === 'undefined') return false
    return isPointInElementRect(clientX, clientY, getResumeContainerEl())
}

function updateActivePanelFromPoint(clientX, clientY) {
    if (isPointerInsideResumeView(clientX, clientY)) {
        activePanel = 'resume'
    } else if (isPointerInsideSceneView(clientX, clientY)) {
        activePanel = 'scene'
    }
}

function getArrowScrollTargetFromFocus() {
    if (typeof document === 'undefined') return null
    const active = document.activeElement
    if (!active || active === document.body || active === document.documentElement) return null
    if (active.closest('#resume-container')) return 'resume'
    if (active.closest('#scene-container, #resize-handle')) return 'scene'
    return null
}

function focusPanelScrollport(panel) {
    const el = panel === 'resume' ? getResumeListingScrollport() : getSceneContentScrollport()
    if (!el) return
    if (!el.hasAttribute('tabindex')) {
        el.setAttribute('tabindex', '-1')
    }
    try {
        el.focus({ preventScroll: true })
    } catch {
        el.focus()
    }
}

function bindPanelContainerListeners() {
    const bindings = [
        ['resume-container', 'resume'],
        ['scene-container', 'scene'],
        ['resize-handle', 'scene'],
    ]
    for (const [id, panel] of bindings) {
        const el = document.getElementById(id)
        if (!el || el.dataset.panelKeyboardScrollBound === '1') continue
        el.dataset.panelKeyboardScrollBound = '1'
        el.addEventListener('mouseenter', (e) => {
            recordPointer(e.clientX, e.clientY)
            activePanel = panel
        })
        el.addEventListener('mousedown', (e) => {
            recordPointer(e.clientX, e.clientY)
            activePanel = panel
            focusPanelScrollport(panel)
        })
    }
    const listing = getResumeListingScrollport()
    if (listing && listing.dataset.panelKeyboardScrollBound !== '1') {
        listing.dataset.panelKeyboardScrollBound = '1'
        listing.addEventListener('mousedown', (e) => {
            recordPointer(e.clientX, e.clientY)
            activePanel = 'resume'
            focusPanelScrollport('resume')
        })
    }
    const sceneContent = getSceneContentScrollport()
    if (sceneContent && sceneContent.dataset.panelKeyboardScrollBound !== '1') {
        sceneContent.dataset.panelKeyboardScrollBound = '1'
        sceneContent.addEventListener('mousedown', (e) => {
            recordPointer(e.clientX, e.clientY)
            activePanel = 'scene'
            focusPanelScrollport('scene')
        })
    }
}

export function installPanelPointerTracking() {
    if (pointerTrackingInstalled || typeof document === 'undefined') return
    pointerTrackingInstalled = true

    document.addEventListener('mousemove', (e) => {
        recordPointer(e.clientX, e.clientY)
        updateActivePanelFromPoint(e.clientX, e.clientY)
    }, { passive: true })

    document.addEventListener('mousedown', (e) => {
        recordPointer(e.clientX, e.clientY)
        updateActivePanelFromPoint(e.clientX, e.clientY)
    }, true)

    document.addEventListener('focusin', (e) => {
        const target = e.target
        const { clientX, clientY } = getLastPointerPosition()
        // Pointer position wins over programmatic focus (e.g. listing sync while hovering scene).
        if (isPointerInsideSceneView(clientX, clientY)) {
            activePanel = 'scene'
            return
        }
        if (isPointerInsideResumeView(clientX, clientY)) {
            activePanel = 'resume'
            return
        }
        if (isElementInResumeZone(target)) {
            activePanel = 'resume'
        } else if (isElementInSceneFocalZone(target)) {
            activePanel = 'scene'
        }
    }, true)

    bindPanelContainerListeners()

    window.addEventListener('layout-orientation-changed', () => {
        bindPanelContainerListeners()
    })

    window.addEventListener('resume-listing-changed', () => {
        bindPanelContainerListeners()
    })

    window.addEventListener('scene-container-ready', () => {
        bindPanelContainerListeners()
    })

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindPanelContainerListeners, { once: true })
    }
}

/**
 * Call at start of ↑/↓ handling so async selection/scene scroll uses the same panel.
 * @returns {'scene' | 'resume'}
 */
export function beginKeyboardNavigationPanel(clientX = lastPointerClientX, clientY = lastPointerClientY) {
    keyboardScrollTargetPanel = resolveArrowScrollTargetPanel(clientX, clientY)
    return keyboardScrollTargetPanel
}

export function endKeyboardNavigationPanel() {
    keyboardScrollTargetPanel = null
}

/**
 * Which panel should receive ↑/↓ scroll for the current pointer / last interaction.
 * Pointer position wins over keyboard focus (focus may still be on scene after hovering resume).
 * @returns {'scene' | 'resume'}
 */
export function resolveArrowScrollTargetPanel(clientX = lastPointerClientX, clientY = lastPointerClientY) {
    const inResume = isPointerInsideResumeView(clientX, clientY)
    const inScene = isPointerInsideSceneView(clientX, clientY)
    if (inResume && !inScene) return 'resume'
    if (inScene && !inResume) return 'scene'
    if (inResume && inScene) {
        // Overlap at panel edges: prefer element under pointer when available.
        const target = typeof document !== 'undefined' ? document.elementFromPoint(clientX, clientY) : null
        if (target && isElementInResumeZone(target)) return 'resume'
        if (target && isElementInSceneFocalZone(target)) return 'scene'
        return 'resume'
    }
    // Hover/click panel without a rect hit-test (or stale coords): prefer last panel interaction over focus.
    if (activePanel === 'resume' || activePanel === 'scene') return activePanel
    const fromFocus = getArrowScrollTargetFromFocus()
    if (fromFocus) return fromFocus
    return 'resume'
}

/** @deprecated Use resolveArrowScrollTargetPanel */
export function getArrowScrollTargetPanel(clientX, clientY) {
    return resolveArrowScrollTargetPanel(clientX, clientY)
}

export function shouldScrollScenePanel(clientX = lastPointerClientX, clientY = lastPointerClientY) {
    if (keyboardScrollTargetPanel) return keyboardScrollTargetPanel === 'scene'
    return resolveArrowScrollTargetPanel(clientX, clientY) === 'scene'
}

export function shouldScrollResumePanel(clientX = lastPointerClientX, clientY = lastPointerClientY) {
    if (keyboardScrollTargetPanel) return keyboardScrollTargetPanel === 'resume'
    return resolveArrowScrollTargetPanel(clientX, clientY) === 'resume'
}

/**
 * @param {'ArrowUp' | 'ArrowDown'} key
 * @returns {'up' | 'down'}
 */
export function arrowKeyToScrollDirection(key) {
    return key === 'ArrowUp' ? 'up' : 'down'
}

/**
 * @param {HTMLElement} scrollport
 * @param {'up' | 'down'} direction
 * @param {{ behavior?: 'auto' | 'smooth' }} [options]
 */
export function scrollScrollportByArrow(scrollport, direction, { behavior = 'smooth' } = {}) {
    if (!scrollport?.isConnected) return
    const step = Math.max(PANEL_ARROW_SCROLL_MIN_PX, Math.round(scrollport.clientHeight * PANEL_ARROW_SCROLL_STEP_RATIO))
    const delta = direction === 'up' ? -step : step
    const maxTop = Math.max(0, scrollport.scrollHeight - scrollport.clientHeight)
    const targetTop = Math.max(0, Math.min(maxTop, scrollport.scrollTop + delta))
    if (behavior === 'smooth' && typeof scrollport.scrollTo === 'function') {
        scrollport.scrollTo({ top: targetTop, behavior: 'smooth' })
    } else {
        scrollport.scrollTop = targetTop
    }
}

export function getSceneContentScrollport() {
    if (typeof document === 'undefined') return null
    return document.getElementById('scene-content')
}

export function getResumeListingScrollport() {
    if (typeof document === 'undefined') return null
    return document.getElementById('resume-content-listing')
}

/** Keep keyboard ↑/↓ routed to resume listing after selection syncs scene. */
export function focusResumePanelScrollport() {
    setActivePanel('resume')
    focusPanelScrollport('resume')
}

/** Keep keyboard ↑/↓ routed to scene content after selection syncs listing. */
export function focusScenePanelScrollport() {
    setActivePanel('scene')
    focusPanelScrollport('scene')
}

export function scrollSelectedResumeListingIntoView({ behavior = 'smooth' } = {}) {
    const scrollport = getResumeListingScrollport()
    if (!scrollport) return
    const selected = scrollport.querySelector(
        '.biz-resume-div.selected, .skill-resume-div.selected, .appended-skill-resume-div.selected'
    )
    if (selected) {
        scrollResumeListingElementIntoView(selected, scrollport, { behavior })
    }
}

/**
 * @param {'ArrowUp' | 'ArrowDown'} key
 * @returns {'scene' | 'resume' | null}
 */
export function scrollPanelForArrowKey(key, clientX = lastPointerClientX, clientY = lastPointerClientY) {
    const direction = arrowKeyToScrollDirection(key)
    const target = resolveArrowScrollTargetPanel(clientX, clientY)
    const scrollport = target === 'scene' ? getSceneContentScrollport() : getResumeListingScrollport()
    if (!scrollport) return null
    scrollScrollportByArrow(scrollport, direction)
    return target
}
