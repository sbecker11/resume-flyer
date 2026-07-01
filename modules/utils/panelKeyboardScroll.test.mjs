import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
    resolveArrowScrollTargetPanel,
    isPointerInsideResumeView,
    isPointerInsideSceneView,
    scrollScrollportByArrow,
    installPanelPointerTracking,
    setActivePanel,
    getActivePanel,
    shouldScrollScenePanel,
    shouldScrollResumePanel,
    beginKeyboardNavigationPanel,
    endKeyboardNavigationPanel,
} from './panelKeyboardScroll.mjs'

function mockRect(el, { left, top, width, height }) {
    if (!el) return
    const rect = {
        left,
        top,
        right: left + width,
        bottom: top + height,
        width,
        height,
        x: left,
        y: top,
        toJSON: () => ({}),
    }
    el.getBoundingClientRect = () => rect
}

describe('panelKeyboardScroll', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <div id="scene-container"></div>
            <div id="resize-handle"></div>
            <div id="resume-container">
                <div id="resume-content-listing">
                    <div id="resume-scroll-content"></div>
                </div>
            </div>
        `
        mockRect(document.getElementById('scene-container'), { left: 0, top: 0, width: 400, height: 600 })
        mockRect(document.getElementById('resize-handle'), { left: 400, top: 0, width: 20, height: 600 })
        mockRect(document.getElementById('resume-container'), { left: 420, top: 0, width: 400, height: 600 })
        setActivePanel(null)
        installPanelPointerTracking()
    })

    afterEach(() => {
        document.body.innerHTML = ''
        setActivePanel(null)
    })

    it('detects resume vs scene pointer zones regardless of screen position', () => {
        expect(isPointerInsideSceneView(100, 100)).toBe(true)
        expect(isPointerInsideResumeView(100, 100)).toBe(false)
        expect(isPointerInsideResumeView(500, 100)).toBe(true)
        expect(isPointerInsideSceneView(500, 100)).toBe(false)
    })

    it('uses pointer position when available', () => {
        expect(resolveArrowScrollTargetPanel(500, 100)).toBe('resume')
        expect(resolveArrowScrollTargetPanel(100, 100)).toBe('scene')
    })

    it('uses active panel when pointer is unknown (no click required after hover/focus)', () => {
        setActivePanel('resume')
        expect(resolveArrowScrollTargetPanel(null, null)).toBe('resume')
        expect(shouldScrollResumePanel(null, null)).toBe(true)
        expect(shouldScrollScenePanel(null, null)).toBe(false)

        setActivePanel('scene')
        expect(resolveArrowScrollTargetPanel(null, null)).toBe('scene')
        expect(shouldScrollScenePanel(null, null)).toBe(true)
    })

    it('pointer over resume wins over scene scrollport focus', () => {
        const sceneContent = document.getElementById('scene-content') || document.createElement('div')
        sceneContent.id = 'scene-content'
        document.body.appendChild(sceneContent)
        sceneContent.setAttribute('tabindex', '-1')
        sceneContent.focus()

        expect(resolveArrowScrollTargetPanel(500, 100)).toBe('resume')
        expect(shouldScrollScenePanel(500, 100)).toBe(false)
        expect(shouldScrollResumePanel(500, 100)).toBe(true)
    })

    it('pointer over scene wins over resume listing focus', () => {
        const listing = document.getElementById('resume-content-listing')
        listing.setAttribute('tabindex', '-1')
        listing.focus()

        expect(resolveArrowScrollTargetPanel(100, 100)).toBe('scene')
        expect(shouldScrollScenePanel(100, 100)).toBe(true)
        expect(shouldScrollResumePanel(100, 100)).toBe(false)
    })

    it('prefers active panel when pointer is unknown and focus unchanged', () => {
        setActivePanel('resume')
        expect(resolveArrowScrollTargetPanel(null, null)).toBe('resume')
        expect(shouldScrollScenePanel(null, null)).toBe(false)
    })

    it('prefers keyboard focus inside resume container when pointer is unknown', () => {
        const listing = document.getElementById('resume-content-listing')
        listing.setAttribute('tabindex', '-1')
        listing.focus()
        expect(resolveArrowScrollTargetPanel(null, null)).toBe('resume')
        expect(shouldScrollScenePanel(null, null)).toBe(false)
    })

    it('defaults to resume when pointer and active panel are unknown', () => {
        expect(getActivePanel()).toBe(null)
        expect(resolveArrowScrollTargetPanel(null, null)).toBe('resume')
    })

    it('detects zones after layout-toggle swap (scene on right, resume on left)', () => {
        mockRect(document.getElementById('scene-container'), { left: 420, top: 0, width: 400, height: 600 })
        mockRect(document.getElementById('resize-handle'), { left: 400, top: 0, width: 20, height: 600 })
        mockRect(document.getElementById('resume-container'), { left: 0, top: 0, width: 400, height: 600 })

        expect(isPointerInsideResumeView(100, 100)).toBe(true)
        expect(isPointerInsideSceneView(100, 100)).toBe(false)
        expect(isPointerInsideSceneView(500, 100)).toBe(true)
        expect(resolveArrowScrollTargetPanel(100, 100)).toBe('resume')
        expect(resolveArrowScrollTargetPanel(500, 100)).toBe('scene')
    })

    it('freezes panel target for async keyboard handlers', () => {
        setActivePanel('scene')
        const target = beginKeyboardNavigationPanel(500, 100)
        expect(target).toBe('resume')
        expect(shouldScrollScenePanel(null, null)).toBe(false)
        expect(shouldScrollResumePanel(null, null)).toBe(true)
        endKeyboardNavigationPanel()
        expect(shouldScrollScenePanel(null, null)).toBe(true)
    })

    it('scrollScrollportByArrow moves scrollTop', () => {
        const scrollport = document.getElementById('resume-content-listing')
        Object.defineProperty(scrollport, 'clientHeight', { configurable: true, value: 200 })
        Object.defineProperty(scrollport, 'scrollHeight', { configurable: true, value: 800 })
        scrollport.scrollTop = 0
        scrollScrollportByArrow(scrollport, 'down', { behavior: 'auto' })
        expect(scrollport.scrollTop).toBeGreaterThan(0)
    })
})
