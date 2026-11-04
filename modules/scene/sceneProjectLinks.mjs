/**
 * Scene biz cards crop overflow and keep a 20px clear band above the bottom edge.
 * GitHub / GitHub Pages anchors stay on a scene card only when every anchor is
 * fully inside that crop. Resume cards are self-sizing and always keep their links;
 * do not run this gate on `.biz-resume-div`.
 */

import { getElementVerticalExtent } from '@/modules/utils/skillInfoModal.mjs'

/** Matches `.biz-card-div` padding-bottom and the skills-section crop inset. */
export const SCENE_CARD_CROP_BOTTOM_INSET_PX = 20

/**
 * @param {{ top: number, bottom: number, left: number, right: number, width: number, height: number }} cardRect
 * @param {{ top: number, bottom: number, left: number, right: number, width: number, height: number }[]} anchorRects
 * @param {number} [cropInset]
 * @returns {true|false|null} null when layout is not measurable yet
 */
export function sceneProjectLinksFitInCrop(cardRect, anchorRects, cropInset = SCENE_CARD_CROP_BOTTOM_INSET_PX) {
    const cardH = Number(cardRect?.height) || 0
    const cardW = Number(cardRect?.width) || 0
    if (cardH <= 0 || cardW <= 0) return null
    if (!anchorRects?.length) return null
    const cropBottom = cardRect.bottom - cropInset
    for (const rect of anchorRects) {
        const h = Number(rect?.height) || 0
        const w = Number(rect?.width) || 0
        if (h <= 0 || w <= 0) return null
        if (rect.top < cardRect.top - 0.5) return false
        if (rect.bottom > cropBottom + 0.5) return false
        if (rect.left < cardRect.left - 0.5) return false
        if (rect.right > cardRect.right + 0.5) return false
    }
    return true
}

function anchorLayoutBox(anchor) {
    const extent = getElementVerticalExtent(anchor)
    const box = anchor.getBoundingClientRect()
    const width = box.width || (Number(box.right) - Number(box.left)) || 0
    return {
        top: extent.top,
        bottom: extent.bottom,
        height: extent.height,
        left: box.left,
        right: box.right,
        width,
    }
}

/**
 * Drop scene-card project links when they would be clipped. Leave them in place
 * when they fit, or when the card has not been laid out yet.
 * Also drops the same block from the prebuilt scene clone, which copies this card's geometry.
 * @param {HTMLElement | null | undefined} card
 */
export function omitSceneProjectLinksUnlessTheyFit(card) {
    if (!card?.classList?.contains('biz-card-div')) return
    if (card.classList.contains('biz-resume-div')) return
    const linksEl = card.querySelector('.biz-card-project-links')
    if (!linksEl) return
    const anchors = [...linksEl.querySelectorAll('a.biz-card-project-link')]
    const fits = sceneProjectLinksFitInCrop(
        card.getBoundingClientRect(),
        anchors.map(anchorLayoutBox),
    )
    if (fits !== false) return
    linksEl.remove()
    const cloneId = card.id ? `${card.id}-clone` : ''
    if (!cloneId || typeof document === 'undefined') return
    document.getElementById(cloneId)?.querySelector('.biz-card-project-links')?.remove()
}
