import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { nextTick } from 'vue'

describe('usePointerDragOffset', () => {
  beforeEach(() => {
    vi.stubGlobal('innerWidth', 800)
    vi.stubGlobal('innerHeight', 600)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('moves dragOffset on pointermove after pointerdown', async () => {
    const { usePointerDragOffset } = await import('./usePointerDragOffset.mjs')
    const { dragOffset, isDragging, startPointerDrag } = usePointerDragOffset({
      getModalSize: () => ({ width: 200, height: 100 }),
    })

    const handle = document.createElement('div')
    document.body.appendChild(handle)

    const down = new PointerEvent('pointerdown', {
      pointerId: 1,
      pointerType: 'touch',
      clientX: 100,
      clientY: 100,
      bubbles: true,
    })
    Object.defineProperty(down, 'currentTarget', { value: handle })
    startPointerDrag(down)
    expect(isDragging.value).toBe(true)

    document.dispatchEvent(new PointerEvent('pointermove', {
      pointerId: 1,
      pointerType: 'touch',
      clientX: 140,
      clientY: 130,
      bubbles: true,
    }))
    await nextTick()
    expect(dragOffset.value.x).toBe(40)
    expect(dragOffset.value.y).toBe(30)

    document.dispatchEvent(new PointerEvent('pointerup', {
      pointerId: 1,
      pointerType: 'touch',
      bubbles: true,
    }))
    expect(isDragging.value).toBe(false)
    handle.remove()
  })

  it('clamps top-center vertical offset so modal stays in viewport', async () => {
    const { usePointerDragOffset } = await import('./usePointerDragOffset.mjs')
    const { dragOffset, startPointerDrag } = usePointerDragOffset({
      anchor: 'top-center',
      getTopInset: () => 48,
      getModalSize: () => ({ width: 200, height: 100 }),
    })
    const handle = document.createElement('div')
    document.body.appendChild(handle)
    const down = new PointerEvent('pointerdown', {
      pointerId: 2,
      pointerType: 'touch',
      clientX: 0,
      clientY: 0,
      bubbles: true,
    })
    Object.defineProperty(down, 'currentTarget', { value: handle })
    startPointerDrag(down)
    document.dispatchEvent(new PointerEvent('pointermove', {
      pointerId: 2,
      clientX: 0,
      clientY: -200,
      bubbles: true,
    }))
    expect(dragOffset.value.y).toBe(-48)
    document.dispatchEvent(new PointerEvent('pointerup', { pointerId: 2, bubbles: true }))
    handle.remove()
  })
})
