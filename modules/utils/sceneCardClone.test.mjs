import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
    captureStaticSceneCardGeometry,
    hideOriginalForClone,
    showOriginalAfterClone,
    applyStaticGeometryToClone,
    hideSceneCardCloneElement,
    showSceneCardCloneElement,
    assertSceneCloneVisible,
    provisionSceneCardCloneAtInit,
    setSceneCardSelectionVisible,
    hideAllSceneCardClones,
} from './sceneCardClone.mjs'

describe('sceneCardClone', () => {
    describe('captureStaticSceneCardGeometry', () => {
        it('prefers inline style over defaults', () => {
            const el = document.createElement('div')
            el.style.left = '10px'
            el.style.top = '20px'
            el.style.width = '100px'
            el.style.height = '80px'
            el.style.transform = 'translateX(5px) translateY(0px)'
            const geo = captureStaticSceneCardGeometry(el, { width: '180px', height: '180px' })
            expect(geo.left).toBe('10px')
            expect(geo.top).toBe('20px')
            expect(geo.width).toBe('100px')
            expect(geo.height).toBe('80px')
        })

        it('uses defaults when inline style is empty', () => {
            const el = document.createElement('div')
            const geo = captureStaticSceneCardGeometry(el, { width: '200px', height: '120px' })
            expect(geo.width).toBe('200px')
            expect(geo.height).toBe('120px')
            expect(geo.left).toBe('0px')
            expect(geo.top).toBe('0px')
        })
    })

    describe('hideOriginalForClone / showOriginalAfterClone', () => {
        it('round-trips hide and show classes/styles', () => {
            const el = document.createElement('div')
            hideOriginalForClone(el)
            expect(el.classList.contains('hasClone')).toBe(true)
            expect(el.style.display).toBe('none')
            showOriginalAfterClone(el)
            expect(el.classList.contains('hasClone')).toBe(false)
            expect(el.style.display).toBe('')
        })
    })

    describe('applyStaticGeometryToClone / clone visibility', () => {
        it('sets static geometry and toggles clone-hidden', () => {
            const clone = document.createElement('div')
            clone.style.transform = 'translateX(99px)'
            applyStaticGeometryToClone(clone, { left: '1px', top: '2px', width: '3px', height: '4px' })
            expect(clone.style.left).toBe('1px')
            expect(clone.style.top).toBe('2px')
            expect(clone.style.transform).toBe('none')

            hideSceneCardCloneElement(clone)
            expect(clone.classList.contains('clone-hidden')).toBe(true)

            showSceneCardCloneElement(clone, { display: 'flex' })
            expect(clone.classList.contains('selected')).toBe(true)
            expect(clone.classList.contains('clone-hidden')).toBe(false)
            expect(clone.style.display).toBe('flex')
        })
    })

    describe('assertSceneCloneVisible', () => {
        it('sets display visibility opacity when clone is shown', () => {
            const clone = document.createElement('div')
            showSceneCardCloneElement(clone)
            assertSceneCloneVisible(clone, 'flex')
            expect(clone.style.display).toBe('flex')
            expect(clone.style.visibility).toBe('visible')
            expect(clone.style.opacity).toBe('1')
        })

        it('does not show a clone-hidden element', () => {
            const clone = document.createElement('div')
            hideSceneCardCloneElement(clone)
            assertSceneCloneVisible(clone, 'flex')
            expect(clone.style.display).toBe('none')
        })
    })

    describe('provisionSceneCardCloneAtInit', () => {
        it('creates a hidden prebuilt clone with static geometry', () => {
            const original = document.createElement('div')
            original.id = 'skill-card-div-1'
            original.className = 'skill-card-div'
            original.style.left = '5px'
            original.style.top = '6px'
            original.style.width = '100px'
            original.style.height = '50px'
            original.textContent = 'skill'

            const clone = provisionSceneCardCloneAtInit({
                original,
                cloneId: 'skill-card-div-1-clone',
                selectedCloneSceneZ: 14,
            })

            expect(clone).not.toBeNull()
            expect(clone.id).toBe('skill-card-div-1-clone')
            expect(clone.classList.contains('clone-hidden')).toBe(true)
            expect(clone.style.left).toBe('5px')
            expect(clone.getAttribute('data-sceneZ')).toBe('14')
        })
    })

    describe('setSceneCardSelectionVisible', () => {
        beforeEach(() => {
            document.body.innerHTML = ''
        })

        afterEach(() => {
            document.body.innerHTML = ''
        })

        it('toggles original vs prebuilt clone without removing DOM nodes', () => {
            const plane = document.createElement('div')
            plane.id = 'scene-plane'
            const original = document.createElement('div')
            original.id = 'skill-card-div-1'
            original.className = 'skill-card-div'
            const clone = document.createElement('div')
            clone.id = 'skill-card-div-1-clone'
            clone.className = 'skill-card-div clone clone-hidden'
            plane.appendChild(original)
            plane.appendChild(clone)
            document.body.appendChild(plane)

            setSceneCardSelectionVisible({ originalId: 'skill-card-div-1', visible: true })
            expect(original.classList.contains('hasClone')).toBe(true)
            expect(clone.classList.contains('clone-hidden')).toBe(false)

            setSceneCardSelectionVisible({ originalId: 'skill-card-div-1', visible: false })
            expect(original.classList.contains('hasClone')).toBe(false)
            expect(clone.classList.contains('clone-hidden')).toBe(true)
            expect(document.getElementById('skill-card-div-1-clone')).not.toBeNull()
        })
    })

    describe('hideAllSceneCardClones', () => {
        beforeEach(() => {
            document.body.innerHTML = ''
        })

        afterEach(() => {
            document.body.innerHTML = ''
        })

        it('hides all clones and restores originals', () => {
            const plane = document.createElement('div')
            plane.id = 'scene-plane'
            const original = document.createElement('div')
            original.id = 'biz-card-div-0'
            original.className = 'biz-card-div hasClone'
            const clone = document.createElement('div')
            clone.id = 'biz-card-div-0-clone'
            clone.className = 'biz-card-div clone selected'
            plane.appendChild(original)
            plane.appendChild(clone)
            document.body.appendChild(plane)

            hideAllSceneCardClones(plane)
            expect(original.classList.contains('hasClone')).toBe(false)
            expect(clone.classList.contains('clone-hidden')).toBe(true)
        })
    })
})
