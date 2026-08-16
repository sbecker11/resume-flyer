/**
 * Drag a viewport-positioned modal via Pointer Events (mouse + touch + pen).
 * Use on a header/handle with touch-action: none; call startPointerDrag on pointerdown.
 *
 * @param {object} [options]
 * @param {() => ({ width: number, height: number })} [options.getModalSize]
 * @param {'center' | 'top-center'} [options.anchor='center']
 *        center: left/top 50% + translate(-50%+x, -50%+y)
 *        top-center: left 50% + fixed CSS top; translate(-50%+x, y) only
 * @param {() => number} [options.getTopInset] CSS `top` in px when anchor is top-center (default 48)
 */
import { ref, computed, onUnmounted, getCurrentInstance } from 'vue'

export function usePointerDragOffset(options = {}) {
  const getModalSize = typeof options.getModalSize === 'function'
    ? options.getModalSize
    : () => ({ width: 320, height: 400 })
  const anchor = options.anchor === 'top-center' ? 'top-center' : 'center'
  const getTopInset = typeof options.getTopInset === 'function'
    ? options.getTopInset
    : () => 48

  const dragOffset = ref({ x: 0, y: 0 })
  const isDragging = ref(false)

  let dragStart = { x: 0, y: 0, ox: 0, oy: 0 }
  let activePointerId = null
  /** @type {Element | null} */
  let captureEl = null

  function clamp(x, y) {
    const { width, height } = getModalSize()
    const vw = typeof window !== 'undefined' ? window.innerWidth : width
    const vh = typeof window !== 'undefined' ? window.innerHeight : height
    const halfW = width / 2
    const maxX = Math.max(0, vw / 2 - halfW)

    if (anchor === 'top-center') {
      const topInset = getTopInset()
      const minY = -topInset
      const maxY = Math.max(minY, vh - topInset - height)
      return {
        x: Math.max(-maxX, Math.min(maxX, x)),
        y: Math.max(minY, Math.min(maxY, y)),
      }
    }

    const halfH = height / 2
    const maxY = Math.max(0, vh / 2 - halfH)
    return {
      x: Math.max(-maxX, Math.min(maxX, x)),
      y: Math.max(-maxY, Math.min(maxY, y)),
    }
  }

  function onPointerMove(e) {
    if (!isDragging.value) return
    if (activePointerId != null && e.pointerId !== activePointerId) return
    dragOffset.value = clamp(
      dragStart.ox + (e.clientX - dragStart.x),
      dragStart.oy + (e.clientY - dragStart.y),
    )
  }

  function endDrag(e) {
    if (!isDragging.value) return
    if (e && activePointerId != null && e.pointerId !== activePointerId) return
    isDragging.value = false
    document.removeEventListener('pointermove', onPointerMove)
    document.removeEventListener('pointerup', endDrag)
    document.removeEventListener('pointercancel', endDrag)
    if (captureEl && activePointerId != null) {
      try {
        captureEl.releasePointerCapture(activePointerId)
      } catch (_) { /* already released */ }
    }
    captureEl = null
    activePointerId = null
  }

  /**
   * @param {PointerEvent} e
   */
  function startPointerDrag(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    isDragging.value = true
    activePointerId = e.pointerId
    captureEl = e.currentTarget instanceof Element ? e.currentTarget : null
    dragStart = {
      x: e.clientX,
      y: e.clientY,
      ox: dragOffset.value.x,
      oy: dragOffset.value.y,
    }
    try {
      captureEl?.setPointerCapture?.(e.pointerId)
    } catch (_) { /* ignore */ }
    document.addEventListener('pointermove', onPointerMove)
    document.addEventListener('pointerup', endDrag)
    document.addEventListener('pointercancel', endDrag)
  }

  function resetDragOffset() {
    dragOffset.value = { x: 0, y: 0 }
  }

  function clampDragOffset() {
    dragOffset.value = clamp(dragOffset.value.x, dragOffset.value.y)
  }

  /** Style for a modal positioned with left/top 50% (center anchor). */
  const centerTransformStyle = computed(() => ({
    transform: `translate(calc(-50% + ${dragOffset.value.x}px), calc(-50% + ${dragOffset.value.y}px))`,
  }))

  /** Style for left 50% + fixed CSS top (top-center anchor). */
  const topCenterTransformStyle = computed(() => ({
    transform: `translate(calc(-50% + ${dragOffset.value.x}px), ${dragOffset.value.y}px)`,
  }))

  if (getCurrentInstance()) {
    onUnmounted(() => {
      endDrag()
    })
  }

  return {
    dragOffset,
    isDragging,
    startPointerDrag,
    resetDragOffset,
    clampDragOffset,
    centerTransformStyle,
    topCenterTransformStyle,
  }
}
