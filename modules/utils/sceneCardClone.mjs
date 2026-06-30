/**
 * Shared scene-card clone helpers for biz and skill cards.
 *
 * Architecture:
 * - Static 3D placement (left/top/width/height/data-sceneZ on originals) is set once at init.
 * - A matching clone is provisioned at init with the same static placement; geometry never changes.
 * - Selection toggles visibility only: original OR clone is renderable (parallax applies to the visible one).
 */

/** Wait for parallax to apply transforms (e.g. before reading layout after restore). */
export async function waitForParallaxSettle() {
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('focal-point-changed', { detail: {} }))
    }
    await new Promise((resolve) => requestAnimationFrame(resolve))
    await new Promise((resolve) => requestAnimationFrame(resolve))
}

/**
 * @typedef {{ left: string, top: string, width: string, height: string }} StaticSceneCardGeometry
 */

/**
 * Read static scene-plane placement from a card (never parallax transform).
 * @param {HTMLElement} original
 * @param {Partial<StaticSceneCardGeometry>} [defaults]
 * @returns {StaticSceneCardGeometry}
 */
export function captureStaticSceneCardGeometry(original, defaults = {}) {
    const origStyle = original.style
    const origComputed = typeof window.getComputedStyle === 'function' ? window.getComputedStyle(original) : null
    const heightFallback = origComputed?.height || origComputed?.minHeight || defaults.height || '180px'
    return {
        left: origStyle.left || origComputed?.left || defaults.left || '0px',
        top: origStyle.top || origComputed?.top || defaults.top || '0px',
        width: origStyle.width || origComputed?.width || defaults.width || '180px',
        height: origStyle.height || heightFallback,
    }
}

/** @deprecated Use captureStaticSceneCardGeometry */
export const captureSceneCardGeometry = (original, defaults = {}) => {
    const geo = captureStaticSceneCardGeometry(original, defaults)
    return { ...geo, transform: 'none' }
}

/** Apply fixed static placement to a clone (init only — never call on selection). */
export function applyStaticGeometryToClone(clone, geometry) {
    clone.style.setProperty('position', 'absolute', 'important')
    clone.style.setProperty('left', geometry.left, 'important')
    clone.style.setProperty('top', geometry.top, 'important')
    clone.style.setProperty('width', geometry.width, 'important')
    if (geometry.height && geometry.height !== 'auto') {
        clone.style.setProperty('height', geometry.height, 'important')
    }
    clone.style.setProperty('transform', 'none', 'important')
}

/** Hide original while its prebuilt clone is the selected (visible) instance. */
export function hideOriginalForClone(original) {
    if (!original) return
    original.classList.add('hasClone', 'force-hidden-for-clone')
    original.style.setProperty('display', 'none', 'important')
    original.style.setProperty('visibility', 'hidden', 'important')
    original.style.setProperty('opacity', '0', 'important')
    original.style.setProperty('pointer-events', 'none', 'important')
}

/** Restore original visibility when deselected. */
export function showOriginalAfterClone(original, { removeZIndex = true } = {}) {
    if (!original) return
    original.classList.remove('hasClone', 'force-hidden-for-clone')
    original.style.removeProperty('display')
    original.style.setProperty('visibility', 'visible', 'important')
    original.style.setProperty('opacity', '1', 'important')
    original.style.removeProperty('pointer-events')
    if (removeZIndex) original.style.removeProperty('z-index')
}

/** Mark prebuilt clone as not renderable (deselected). */
export function hideSceneCardCloneElement(clone) {
    if (!clone) return
    clone.classList.add('clone-hidden')
    clone.classList.remove('selected')
    clone.style.setProperty('display', 'none', 'important')
    clone.style.setProperty('visibility', 'hidden', 'important')
    clone.style.setProperty('opacity', '0', 'important')
    clone.style.setProperty('pointer-events', 'none', 'important')
}

/** Mark prebuilt clone as renderable (selected). Parallax updates transform while visible. */
export function showSceneCardCloneElement(clone, { display = 'flex' } = {}) {
    if (!clone) return
    clone.classList.remove('clone-hidden')
    clone.classList.add('selected', 'clone')
    clone.classList.remove('hovered', 'hasClone', 'force-hidden-for-clone')
    clone.style.removeProperty('display')
    clone.style.setProperty('visibility', 'visible', 'important')
    clone.style.setProperty('opacity', '1', 'important')
    clone.style.removeProperty('pointer-events')
    clone.style.setProperty('display', display, 'important')
    clone.style.setProperty('z-index', '99', 'important')
    clone.style.setProperty('filter', 'none', 'important')
}

/** Re-assert clone visibility after palette updates. */
export function assertSceneCloneVisible(clone, display = 'flex') {
    if (!clone || clone.classList.contains('clone-hidden')) return
    clone.style.setProperty('display', display, 'important')
    clone.style.setProperty('visibility', 'visible', 'important')
    clone.style.setProperty('opacity', '1', 'important')
}

/**
 * Create a prebuilt clone at init (append to scene plane by caller). Geometry is fixed forever.
 * @returns {HTMLElement|null}
 */
export function provisionSceneCardCloneAtInit({
    original,
    cloneId,
    geometryDefaults = {},
    selectedCloneSceneZ,
    display = 'flex',
}) {
    if (!original || !cloneId) return null
    if (typeof document !== 'undefined' && document.getElementById(cloneId)) {
        return document.getElementById(cloneId)
    }

    const geometry = captureStaticSceneCardGeometry(original, geometryDefaults)
    const clone = original.cloneNode(true)
    clone.id = cloneId
    clone.classList.add('clone')
    clone.classList.remove('hovered', 'hasClone', 'force-hidden-for-clone')
    if (selectedCloneSceneZ != null) {
        clone.setAttribute('data-sceneZ', String(selectedCloneSceneZ))
    }
    applyStaticGeometryToClone(clone, geometry)
    hideSceneCardCloneElement(clone)
    return clone
}

/**
 * Toggle selection visibility between original and its prebuilt clone (no DOM create/remove).
 * @param {object} params
 * @param {string} params.originalId
 * @param {boolean} params.visible - true = show clone, hide original
 * @param {(original: HTMLElement, clone: HTMLElement) => void} [params.onShow]
 * @param {(original: HTMLElement, clone: HTMLElement) => void} [params.onHide]
 */
export function setSceneCardSelectionVisible({ originalId, visible, onShow, onHide }) {
    const original = typeof document !== 'undefined' ? document.getElementById(originalId) : null
    const clone = typeof document !== 'undefined' ? document.getElementById(`${originalId}-clone`) : null
    if (!original || !clone) return

    if (visible) {
        hideOriginalForClone(original)
        showSceneCardCloneElement(clone)
        onShow?.(original, clone)
    } else {
        showOriginalAfterClone(original)
        hideSceneCardCloneElement(clone)
        onHide?.(original, clone)
    }
}

/** Deselect all: hide every clone, restore every hidden original. */
export function hideAllSceneCardClones(scenePlaneEl) {
    const plane = scenePlaneEl || (typeof document !== 'undefined' ? document.getElementById('scene-plane') : null)
    if (!plane) return

    plane.querySelectorAll('.biz-card-div.clone, .skill-card-div.clone').forEach((clone) => {
        hideSceneCardCloneElement(clone)
    })
    plane.querySelectorAll('.biz-card-div.hasClone, .skill-card-div.hasClone').forEach((original) => {
        if (!original.classList.contains('clone')) {
            showOriginalAfterClone(original)
        }
    })
}

/** @deprecated Clones are prebuilt at init; use setSceneCardSelectionVisible({ visible: false }). */
export function removeSceneCardCloneById({ originalId, scenePlaneEl, onRestoreOriginal }) {
    setSceneCardSelectionVisible({
        originalId,
        visible: false,
        onHide: (original) => onRestoreOriginal?.(original),
    })
}
