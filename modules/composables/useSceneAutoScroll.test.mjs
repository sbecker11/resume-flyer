import { describe, it, expect } from 'vitest'
import {
  getSyntheticPointerForAutoscrollDirection,
  getScenePageScrollTarget,
} from './useSceneAutoScroll.mjs'

describe('getSyntheticPointerForAutoscrollDirection', () => {
  const rect = { left: 100, top: 50, width: 400, height: 600 }

  it('places pointer in top autoscroll band for up', () => {
    const { clientX, clientY } = getSyntheticPointerForAutoscrollDirection(rect, 400, 'up')
    expect(clientX).toBe(300)
    expect(clientY).toBe(100) // top + (400/4)/2 = 50 + 50
  })

  it('places pointer in bottom autoscroll band for down', () => {
    const { clientX, clientY } = getSyntheticPointerForAutoscrollDirection(rect, 400, 'down')
    expect(clientX).toBe(300)
    expect(clientY).toBe(400) // top + 300 + 50 = 50+350=400
    expect(clientY).toBe(400)
  })
})

describe('getScenePageScrollTarget', () => {
  it('moves up by one viewport height', () => {
    expect(getScenePageScrollTarget(500, 200, 1200, 'up')).toBe(300)
  })

  it('moves down by one viewport height', () => {
    expect(getScenePageScrollTarget(100, 200, 1200, 'down')).toBe(300)
  })

  it('clamps at top and bottom edges', () => {
    expect(getScenePageScrollTarget(50, 200, 1200, 'up')).toBe(0)
    expect(getScenePageScrollTarget(900, 200, 1200, 'down')).toBe(1000)
  })
})
