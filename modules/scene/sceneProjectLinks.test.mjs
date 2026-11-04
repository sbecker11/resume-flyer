import { describe, expect, it, afterEach } from 'vitest'
import {
    omitSceneProjectLinksUnlessTheyFit,
    sceneProjectLinksFitInCrop,
} from './sceneProjectLinks.mjs'

const cardBox = { top: 100, bottom: 300, left: 10, right: 210, width: 200, height: 200 }

function anchor(box) {
    return box
}

describe('sceneProjectLinksFitInCrop', () => {
    it('keeps anchors that sit fully inside the 20px bottom crop', () => {
        expect(sceneProjectLinksFitInCrop(cardBox, [
            anchor({ top: 140, bottom: 158, left: 20, right: 110, width: 90, height: 18 }),
            anchor({ top: 140, bottom: 158, left: 120, right: 200, width: 80, height: 18 }),
        ])).toBe(true)
    })

    it('drops anchors that cross the crop line', () => {
        expect(sceneProjectLinksFitInCrop(cardBox, [
            anchor({ top: 270, bottom: 290, left: 20, right: 110, width: 90, height: 20 }),
        ])).toBe(false)
    })

    it('drops an anchor that extends past the card right edge', () => {
        expect(sceneProjectLinksFitInCrop(cardBox, [
            anchor({ top: 140, bottom: 158, left: 20, right: 220, width: 200, height: 18 }),
        ])).toBe(false)
    })

    it('returns null until the card and anchors have been laid out', () => {
        expect(sceneProjectLinksFitInCrop(
            { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 },
            [anchor({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 })],
        )).toBeNull()
        expect(sceneProjectLinksFitInCrop(cardBox, [])).toBeNull()
        expect(sceneProjectLinksFitInCrop(cardBox, [
            anchor({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 }),
        ])).toBeNull()
    })
})

describe('omitSceneProjectLinksUnlessTheyFit', () => {
    afterEach(() => {
        document.body.innerHTML = ''
    })

    function mount(bottom) {
        document.body.innerHTML = `
            <div class="biz-card-div" id="biz-card-div-2">
                <div class="biz-card-project-links">
                    <a class="biz-card-project-link" href="https://github.com/sbecker11/resume-flyer">GitHub project</a>
                    <a class="biz-card-project-link" href="https://sbecker11.github.io/resume-flyer/">GitHub Pages</a>
                </div>
            </div>
            <div class="biz-card-div clone" id="biz-card-div-2-clone">
                <div class="biz-card-project-links">
                    <a class="biz-card-project-link" href="https://github.com/sbecker11/resume-flyer">GitHub project</a>
                </div>
            </div>
        `
        const card = document.getElementById('biz-card-div-2')
        card.getBoundingClientRect = () => cardBox
        for (const anchorEl of card.querySelectorAll('a')) {
            const rect = { top: 140, bottom, left: 20, right: 120, width: 100, height: bottom - 140 }
            anchorEl.getBoundingClientRect = () => rect
            anchorEl.getClientRects = () => [rect]
        }
        return card
    }

    it('removes scene links and the clone copy when an anchor is clipped', () => {
        const card = mount(290)
        omitSceneProjectLinksUnlessTheyFit(card)
        expect(card.querySelector('.biz-card-project-links')).toBeNull()
        expect(document.getElementById('biz-card-div-2-clone').querySelector('.biz-card-project-links')).toBeNull()
    })

    it('keeps scene links when every anchor fits', () => {
        const card = mount(158)
        omitSceneProjectLinksUnlessTheyFit(card)
        expect(card.querySelectorAll('a.biz-card-project-link')).toHaveLength(2)
        expect(document.getElementById('biz-card-div-2-clone').querySelector('.biz-card-project-links')).not.toBeNull()
    })

    it('keeps links when the card has not been laid out', () => {
        const card = mount(158)
        card.getBoundingClientRect = () => ({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 })
        omitSceneProjectLinksUnlessTheyFit(card)
        expect(card.querySelector('.biz-card-project-links')).not.toBeNull()
    })

    it('does not strip links from a resume card', () => {
        document.body.innerHTML = `
            <div class="biz-resume-div" id="resume">
                <div class="biz-card-project-links">
                    <a class="biz-card-project-link" href="https://github.com/sbecker11/resume-flyer">GitHub project</a>
                </div>
            </div>
        `
        const card = document.getElementById('resume')
        card.getBoundingClientRect = () => cardBox
        const anchorEl = card.querySelector('a')
        const rect = { top: 270, bottom: 290, left: 20, right: 120, width: 100, height: 20 }
        anchorEl.getBoundingClientRect = () => rect
        anchorEl.getClientRects = () => [rect]
        omitSceneProjectLinksUnlessTheyFit(card)
        expect(card.querySelector('.biz-card-project-links')).not.toBeNull()
    })
})
