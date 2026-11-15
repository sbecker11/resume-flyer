/**
 * Scroll #resume-content-listing so a resume row (rDiv / skill copy) is fully visible,
 * including selected-state outer box-shadow rings.
 */

/** Matches .selected box-shadow outer ring (0 0 0 8px #801a81). */
export const RESUME_SELECTED_RING_SPREAD_PX = 8
/** Drop shadow below selected row (0 3px 12px). */
export const RESUME_SELECTED_DROP_SHADOW_BOTTOM_PX = 16
/** Visible gap between row chrome and scrollport edge (matches horizontal inset). */
export const RESUME_LIST_EDGE_GAP_PX = 12
/** #resume-content-listing padding-bottom / scroll-padding-bottom. */
export const RESUME_LIST_BOTTOM_PADDING_PX = RESUME_LIST_EDGE_GAP_PX

export const RESUME_LIST_SCROLL_GAP_PX = 8

/**
 * @param {HTMLElement} el
 * @returns {{ top: number, right: number, bottom: number, left: number }}
 */
export function getResumeListingVisualInsets(el) {
    const gap = RESUME_LIST_SCROLL_GAP_PX
    if (!el?.classList.contains('selected')) {
        return { top: gap, right: gap, bottom: gap, left: gap }
    }
    const side = RESUME_SELECTED_RING_SPREAD_PX
    const bottom = RESUME_SELECTED_RING_SPREAD_PX + RESUME_SELECTED_DROP_SHADOW_BOTTOM_PX
    return { top: side, right: side, bottom, left: side }
}

function getResumeListingScrollport(scrollportEl) {
    if (scrollportEl?.isConnected) return scrollportEl
    if (typeof document === 'undefined') return null
    return document.getElementById('resume-content-listing')
}

function getScrollportViewBand(scrollport) {
    const portRect = scrollport.getBoundingClientRect()
    const style = getComputedStyle(scrollport)
    const paddingTop = parseFloat(style.paddingTop) || 0
    const paddingBottom = parseFloat(style.paddingBottom) || 0
    return {
        viewTop: portRect.top + paddingTop,
        viewBottom: portRect.bottom - paddingBottom,
    }
}

function computeTargetScrollTop(el, scrollport, insets) {
    const elRect = el.getBoundingClientRect()
    const { viewTop, viewBottom } = getScrollportViewBand(scrollport)
    const viewHeight = viewBottom - viewTop

    const visualTop = elRect.top - insets.top
    const visualBottom = elRect.bottom + insets.bottom
    const visualHeight = visualBottom - visualTop

    let scrollDelta = 0
    if (visualHeight > viewHeight) {
        scrollDelta = visualTop - viewTop
    } else if (visualTop < viewTop) {
        scrollDelta = visualTop - viewTop
    } else if (visualBottom > viewBottom) {
        scrollDelta = visualBottom - viewBottom
    }

    const maxScrollTop = Math.max(0, scrollport.scrollHeight - scrollport.clientHeight)
    return Math.max(0, Math.min(maxScrollTop, scrollport.scrollTop + scrollDelta))
}

/**
 * @param {HTMLElement} el - .biz-resume-div, .skill-resume-div, or .appended-skill-resume-div
 * @param {HTMLElement | null} [scrollportEl]
 * @param {{ behavior?: 'auto' | 'smooth' }} [options]
 */
export function scrollResumeListingElementIntoView(el, scrollportEl = null, { behavior = 'auto' } = {}) {
    const scrollport = getResumeListingScrollport(scrollportEl)
    if (!scrollport || !el?.isConnected) return

    const insets = getResumeListingVisualInsets(el)
    const targetScrollTop = computeTargetScrollTop(el, scrollport, insets)

    if (behavior === 'smooth' && typeof scrollport.scrollTo === 'function') {
        scrollport.scrollTo({ top: targetScrollTop, behavior: 'smooth' })
    } else {
        scrollport.scrollTop = targetScrollTop
    }
}

/**
 * Like {@link scrollResumeListingElementIntoView}, but computes the target scroll position from
 * the union of two elements' visual boxes — e.g. a card's header plus a specific skill title
 * within it — so both can be visible together, not just the bottom-most target.
 *
 * When the combined span is taller than the scrollport (rare: very tall card + short viewport),
 * falls back to scrolling just `bottomEl` into view, since that is the actual navigation target.
 *
 * @param {HTMLElement} topEl - element whose top edge should be included (e.g. card header)
 * @param {HTMLElement} bottomEl - element whose bottom edge should be included (e.g. clicked skill)
 * @param {HTMLElement | null} [scrollportEl]
 * @param {{ behavior?: 'auto' | 'smooth' }} [options]
 */
export function scrollResumeListingRangeIntoView(topEl, bottomEl, scrollportEl = null, { behavior = 'auto' } = {}) {
    const scrollport = getResumeListingScrollport(scrollportEl)
    if (!scrollport || !bottomEl?.isConnected) return

    if (!topEl?.isConnected || topEl === bottomEl) {
        scrollResumeListingElementIntoView(bottomEl, scrollport, { behavior })
        return
    }

    const topInsets = getResumeListingVisualInsets(topEl)
    const bottomInsets = getResumeListingVisualInsets(bottomEl)
    const topRect = topEl.getBoundingClientRect()
    const bottomRect = bottomEl.getBoundingClientRect()
    const { viewTop, viewBottom } = getScrollportViewBand(scrollport)
    const viewHeight = viewBottom - viewTop

    const visualTop = topRect.top - topInsets.top
    const visualBottom = bottomRect.bottom + bottomInsets.bottom
    const visualHeight = visualBottom - visualTop

    if (visualHeight > viewHeight) {
        // Can't fit both — the clicked skill (bottomEl) is the actual navigation target.
        scrollResumeListingElementIntoView(bottomEl, scrollport, { behavior })
        return
    }

    let scrollDelta = 0
    if (visualTop < viewTop) {
        scrollDelta = visualTop - viewTop
    } else if (visualBottom > viewBottom) {
        scrollDelta = visualBottom - viewBottom
    }
    if (scrollDelta === 0) return

    const maxScrollTop = Math.max(0, scrollport.scrollHeight - scrollport.clientHeight)
    const targetScrollTop = Math.max(0, Math.min(maxScrollTop, scrollport.scrollTop + scrollDelta))

    if (behavior === 'smooth' && typeof scrollport.scrollTo === 'function') {
        scrollport.scrollTo({ top: targetScrollTop, behavior: 'smooth' })
    } else {
        scrollport.scrollTop = targetScrollTop
    }
}
