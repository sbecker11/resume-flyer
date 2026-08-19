import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
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
    shouldSyncSceneScrollOnSelection,
    beginKeyboardNavigationPanel,
    endKeyboardNavigationPanel,
    getArrowScrollTargetPanel,
    isSceneKeyboardChevronContext,
    arrowKeyToScrollDirection,
    blurPanelScrollport,
    blurActivePanelScrollports,
    focusResumePanelScrollport,
    focusScenePanelScrollport,
    scrollSelectedResumeListingIntoView,
    scrollPanelForArrowKey,
    getSceneContentScrollport,
    getResumeListingScrollport,
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
        // installPanelPointerTracking's mousemove/focusin listeners are bound once (module-level
        // `pointerTrackingInstalled` flag) and persist across tests; the last recorded pointer
        // position is module state too, so reset it to somewhere outside every panel's rect
        // before each test to avoid a previous test's coordinates leaking into this one.
        document.dispatchEvent(new MouseEvent('mousemove', { clientX: -1000, clientY: -1000 }))
        setActivePanel(null)
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

    it('does not focus resume listing on bare background mousedown', () => {
        const listing = document.getElementById('resume-content-listing')
        listing.setAttribute('tabindex', '-1')
        listing.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 1, clientY: 1 }))
        expect(document.activeElement).not.toBe(listing)
    })

    it('defaults to resume when pointer and active panel are unknown', () => {
        expect(getActivePanel()).toBe(null)
        expect(resolveArrowScrollTargetPanel(null, null)).toBe('resume')
    })

    it('uses CSS :hover for scene when pointer coords are unknown', () => {
        const scene = document.getElementById('scene-container')
        scene.matches = vi.fn((sel) => sel === ':hover')
        setActivePanel(null)
        expect(resolveArrowScrollTargetPanel(null, null)).toBe('scene')
        expect(getActivePanel()).toBe('scene')
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
        expect(shouldSyncSceneScrollOnSelection()).toBe(false)
        endKeyboardNavigationPanel()
        expect(shouldScrollScenePanel(null, null)).toBe(true)
        expect(shouldSyncSceneScrollOnSelection()).toBe(true)
    })

    it('syncs scene scroll on rDiv click even when pointer is over resume', () => {
        expect(shouldScrollScenePanel(500, 100)).toBe(false)
        expect(shouldSyncSceneScrollOnSelection()).toBe(true)
    })

    it('scrollScrollportByArrow moves scrollTop', () => {
        const scrollport = document.getElementById('resume-content-listing')
        Object.defineProperty(scrollport, 'clientHeight', { configurable: true, value: 200 })
        Object.defineProperty(scrollport, 'scrollHeight', { configurable: true, value: 800 })
        scrollport.scrollTop = 0
        scrollScrollportByArrow(scrollport, 'down', { behavior: 'auto' })
        expect(scrollport.scrollTop).toBeGreaterThan(0)
    })

    it('scrollScrollportByArrow does nothing for a disconnected scrollport', () => {
        const detached = document.createElement('div')
        expect(() => scrollScrollportByArrow(detached, 'down')).not.toThrow()
    })

    it('scrollScrollportByArrow uses scrollTo when behavior is smooth', () => {
        const scrollport = document.getElementById('resume-content-listing')
        Object.defineProperty(scrollport, 'clientHeight', { configurable: true, value: 200 })
        Object.defineProperty(scrollport, 'scrollHeight', { configurable: true, value: 800 })
        scrollport.scrollTop = 0
        scrollport.scrollTo = vi.fn()
        scrollScrollportByArrow(scrollport, 'up', { behavior: 'smooth' })
        expect(scrollport.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'smooth' }))
    })

    it('getArrowScrollTargetPanel (deprecated) delegates to resolveArrowScrollTargetPanel', () => {
        expect(getArrowScrollTargetPanel(500, 100)).toBe('resume')
        expect(getArrowScrollTargetPanel(100, 100)).toBe('scene')
    })

    it('arrowKeyToScrollDirection maps arrow keys', () => {
        expect(arrowKeyToScrollDirection('ArrowUp')).toBe('up')
        expect(arrowKeyToScrollDirection('ArrowDown')).toBe('down')
    })

    it('scrollPanelForArrowKey scrolls the resolved panel and returns its name', () => {
        const scrollport = document.getElementById('resume-content-listing')
        Object.defineProperty(scrollport, 'clientHeight', { configurable: true, value: 200 })
        Object.defineProperty(scrollport, 'scrollHeight', { configurable: true, value: 800 })
        scrollport.scrollTop = 0
        scrollport.scrollTo = vi.fn() // scrollPanelForArrowKey defaults to smooth; jsdom's real scrollTo is a no-op.
        const target = scrollPanelForArrowKey('ArrowDown', 500, 100)
        expect(target).toBe('resume')
        expect(scrollport.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'smooth' }))
    })

    it('scrollPanelForArrowKey returns null when the target scrollport is missing', () => {
        document.getElementById('resume-content-listing').remove()
        expect(scrollPanelForArrowKey('ArrowDown', 500, 100)).toBe(null)
    })

    it('scrollSelectedResumeListingIntoView is a no-op with no scrollport or no selection', () => {
        expect(() => scrollSelectedResumeListingIntoView()).not.toThrow()
        const listing = document.getElementById('resume-content-listing')
        expect(listing.querySelector('.selected')).toBe(null)
    })

    it('scrollSelectedResumeListingIntoView scrolls the selected resume div into view', () => {
        const listing = document.getElementById('resume-content-listing')
        const selected = document.createElement('div')
        selected.className = 'biz-resume-div selected'
        listing.appendChild(selected)
        expect(() => scrollSelectedResumeListingIntoView({ behavior: 'auto' })).not.toThrow()
    })

    it('blurPanelScrollport blurs only when the scrollport is currently focused', () => {
        const listing = document.getElementById('resume-content-listing')
        listing.setAttribute('tabindex', '-1')
        listing.focus()
        expect(document.activeElement).toBe(listing)
        blurPanelScrollport('resume')
        expect(document.activeElement).not.toBe(listing)
    })

    it('blurActivePanelScrollports blurs both panels', () => {
        const listing = document.getElementById('resume-content-listing')
        listing.setAttribute('tabindex', '-1')
        listing.focus()
        expect(() => blurActivePanelScrollports()).not.toThrow()
        expect(document.activeElement).not.toBe(listing)
    })

    it('focusResumePanelScrollport sets active panel and focuses the resume listing', () => {
        focusResumePanelScrollport()
        expect(getActivePanel()).toBe('resume')
        expect(document.activeElement).toBe(getResumeListingScrollport())
    })

    it('focusScenePanelScrollport is a no-op when #scene-content does not exist', () => {
        expect(getSceneContentScrollport()).toBe(null)
        expect(() => focusScenePanelScrollport()).not.toThrow()
        expect(getActivePanel()).toBe('scene')
    })

    it('focusScenePanelScrollport focuses #scene-content when present', () => {
        const sceneContent = document.createElement('div')
        sceneContent.id = 'scene-content'
        document.body.appendChild(sceneContent)
        focusScenePanelScrollport()
        expect(document.activeElement).toBe(sceneContent)
    })

    it('focusPanelScrollport falls back to a plain focus() call if preventScroll throws', () => {
        const listing = document.getElementById('resume-content-listing')
        const original = listing.focus.bind(listing)
        let calls = 0
        listing.focus = (opts) => {
            calls += 1
            if (opts && calls === 1) throw new Error('preventScroll unsupported')
            return original()
        }
        expect(() => focusResumePanelScrollport()).not.toThrow()
        expect(calls).toBe(2)
    })

    it('resolveArrowScrollTargetPanel prefers the element under the pointer at panel overlap', () => {
        // Force geometric overlap: resume-container fully covers the resize-handle rect.
        mockRect(document.getElementById('resume-container'), { left: 0, top: 0, width: 1000, height: 600 })
        const handle = document.getElementById('resize-handle')
        document.elementFromPoint = vi.fn(() => handle)
        expect(resolveArrowScrollTargetPanel(400, 100)).toBe('scene')
    })

    it('resolveArrowScrollTargetPanel defaults to resume at overlap when no element resolves either zone', () => {
        mockRect(document.getElementById('resume-container'), { left: 0, top: 0, width: 1000, height: 600 })
        document.elementFromPoint = vi.fn(() => document.body)
        expect(resolveArrowScrollTargetPanel(400, 100)).toBe('resume')
    })

    it('resolveArrowScrollTargetPanel uses elementFromPoint when pointer is outside both zones', () => {
        const scene = document.getElementById('scene-container')
        document.elementFromPoint = vi.fn(() => scene)
        expect(resolveArrowScrollTargetPanel(9999, 9999)).toBe('scene')
    })

    describe('isSceneKeyboardChevronContext', () => {
        it('is true when the frozen keyboard target panel is scene', () => {
            setActivePanel('scene')
            beginKeyboardNavigationPanel(100, 100)
            expect(isSceneKeyboardChevronContext(100, 100)).toBe(true)
            endKeyboardNavigationPanel()
        })

        it('is true when pointer resolves to the scene panel', () => {
            expect(isSceneKeyboardChevronContext(100, 100)).toBe(true)
        })

        it('is true via CSS :hover when coords are unknown', () => {
            const scene = document.getElementById('scene-container')
            scene.matches = vi.fn((sel) => sel === ':hover')
            expect(isSceneKeyboardChevronContext(null, null)).toBe(true)
        })

        it('is false when pointer/hover/focus all resolve away from scene', () => {
            expect(isSceneKeyboardChevronContext(500, 100)).toBe(false)
        })
    })

    describe('document/window pointer + focus tracking (bound once by installPanelPointerTracking)', () => {
        it('mousemove updates the last pointer position and active panel', () => {
            document.dispatchEvent(new MouseEvent('mousemove', { clientX: 500, clientY: 100 }))
            expect(getActivePanel()).toBe('resume')
        })

        it('pointermove updates the last pointer position and active panel', () => {
            document.dispatchEvent(new PointerEvent('pointermove', { clientX: 100, clientY: 100 }))
            expect(getActivePanel()).toBe('scene')
        })

        it('capture-phase mousedown updates active panel from point', () => {
            document.body.dispatchEvent(new MouseEvent('mousedown', { clientX: 500, clientY: 100, bubbles: true }))
            expect(getActivePanel()).toBe('resume')
        })

        it('focusin prefers pointer position over the focused element zone', () => {
            document.dispatchEvent(new MouseEvent('mousemove', { clientX: 100, clientY: 100 }))
            const listing = document.getElementById('resume-content-listing')
            listing.setAttribute('tabindex', '-1')
            listing.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
            expect(getActivePanel()).toBe('scene')
        })

        it('focusin falls back to the focused element zone when pointer is stale', () => {
            document.dispatchEvent(new MouseEvent('mousemove', { clientX: 9999, clientY: 9999 }))
            const listing = document.getElementById('resume-content-listing')
            listing.setAttribute('tabindex', '-1')
            listing.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
            expect(getActivePanel()).toBe('resume')
        })

        it('re-binds panel container listeners on scene-container-ready and tracks mouseenter/mousedown', () => {
            window.dispatchEvent(new Event('scene-container-ready'))

            const scene = document.getElementById('scene-container')
            scene.dispatchEvent(new MouseEvent('mouseenter', { clientX: 10, clientY: 10, bubbles: false }))
            expect(getActivePanel()).toBe('scene')

            const resumeContainer = document.getElementById('resume-container')
            resumeContainer.dispatchEvent(new PointerEvent('pointerenter', { clientX: 500, clientY: 10 }))
            expect(getActivePanel()).toBe('resume')
        })

        it('mousedown on a card element inside the scene focuses the scene scrollport', () => {
            window.dispatchEvent(new Event('scene-container-ready'))
            const sceneContent = document.createElement('div')
            sceneContent.id = 'scene-content'
            document.getElementById('scene-container').appendChild(sceneContent)
            window.dispatchEvent(new Event('scene-container-ready'))

            const card = document.createElement('div')
            card.className = 'biz-card-div'
            sceneContent.appendChild(card)
            card.dispatchEvent(new MouseEvent('mousedown', { clientX: 10, clientY: 10, bubbles: true }))
            expect(getActivePanel()).toBe('scene')
            expect(document.activeElement).toBe(sceneContent)
        })

        it('mousedown on the bare scene-content background does not steal focus', () => {
            window.dispatchEvent(new Event('scene-container-ready'))
            const sceneContent = document.createElement('div')
            sceneContent.id = 'scene-content'
            document.getElementById('scene-container').appendChild(sceneContent)
            window.dispatchEvent(new Event('scene-container-ready'))

            sceneContent.dispatchEvent(new MouseEvent('mousedown', { clientX: 10, clientY: 10, bubbles: true }))
            expect(document.activeElement).not.toBe(sceneContent)
        })

        it('mousedown directly on the resume listing scrollport focuses it', () => {
            window.dispatchEvent(new Event('scene-container-ready'))
            const listing = document.getElementById('resume-content-listing')
            const card = document.createElement('div')
            card.className = 'skill-resume-div'
            listing.appendChild(card)
            card.dispatchEvent(new MouseEvent('mousedown', { clientX: 500, clientY: 10, bubbles: true }))
            expect(getActivePanel()).toBe('resume')
            expect(document.activeElement).toBe(listing)
        })

        it('layout-orientation-changed and resume-listing-changed re-bind without throwing', () => {
            expect(() => window.dispatchEvent(new Event('layout-orientation-changed'))).not.toThrow()
            expect(() => window.dispatchEvent(new Event('resume-listing-changed'))).not.toThrow()
        })

        it('installPanelPointerTracking is idempotent (second call is a no-op)', () => {
            expect(() => installPanelPointerTracking()).not.toThrow()
        })
    })
})
