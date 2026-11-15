import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { scrollSceneContentForHeaderAndSkill } from './skillInfoModal.mjs'

describe('scrollSceneContentForHeaderAndSkill', () => {
    let sceneContent, header, skill

    beforeEach(() => {
        document.body.innerHTML = `
            <div id="scene-content">
                <div id="card" class="biz-card-div">
                    <div id="header" class="biz-details-employer-wrap"></div>
                    <span id="skill" class="biz-card-skill-title"></span>
                </div>
            </div>
        `
        sceneContent = document.getElementById('scene-content')
        header = document.getElementById('header')
        skill = document.getElementById('skill')
        skill.getClientRects = () => [skill.getBoundingClientRect()]
        header.getClientRects = () => [header.getBoundingClientRect()]
        sceneContent.scrollBy = (opts) => {
            sceneContent.scrollBy.lastCall = opts
            sceneContent.scrollTop = (sceneContent.scrollTop || 0) + (opts?.top || 0)
        }
    })

    afterEach(() => {
        document.body.innerHTML = ''
    })

    it('does nothing when header and skill are both already visible', () => {
        sceneContent.getBoundingClientRect = () => ({ top: 0, bottom: 300, left: 0, right: 400, width: 400, height: 300 })
        header.getBoundingClientRect = () => ({ top: 20, bottom: 50, left: 0, right: 400, width: 400, height: 30 })
        skill.getBoundingClientRect = () => ({ top: 200, bottom: 220, left: 0, right: 400, width: 400, height: 20 })
        scrollSceneContentForHeaderAndSkill(header, skill)
        expect(sceneContent.scrollBy.lastCall).toBeUndefined()
    })

    it('scrolls up to reveal the header when the combined span still fits the viewport', () => {
        sceneContent.getBoundingClientRect = () => ({ top: 0, bottom: 300, left: 0, right: 400, width: 400, height: 300 })
        // Header scrolled above the viewport top; skill already visible.
        header.getBoundingClientRect = () => ({ top: -40, bottom: -10, left: 0, right: 400, width: 400, height: 30 })
        skill.getBoundingClientRect = () => ({ top: 100, bottom: 120, left: 0, right: 400, width: 400, height: 20 })
        scrollSceneContentForHeaderAndSkill(header, skill)
        // margin = 8; viewTop = 8; delta = headerTop(-40) - viewTop(8) = -48
        expect(sceneContent.scrollBy.lastCall).toEqual({ top: -48, behavior: 'smooth' })
    })

    it('scrolls down to reveal the skill when header is visible but skill extends past the bottom', () => {
        sceneContent.getBoundingClientRect = () => ({ top: 0, bottom: 300, left: 0, right: 400, width: 400, height: 300 })
        header.getBoundingClientRect = () => ({ top: 20, bottom: 50, left: 0, right: 400, width: 400, height: 30 })
        skill.getBoundingClientRect = () => ({ top: 280, bottom: 310, left: 0, right: 400, width: 400, height: 30 })
        scrollSceneContentForHeaderAndSkill(header, skill)
        // margin = 8; viewBottom = 292; delta = skillBottom(310) - viewBottom(292) = 18
        expect(sceneContent.scrollBy.lastCall).toEqual({ top: 18, behavior: 'smooth' })
    })

    it('falls back to skill-only nearest-scroll when the combined header+skill span exceeds the viewport', () => {
        sceneContent.getBoundingClientRect = () => ({ top: 0, bottom: 150, left: 0, right: 400, width: 400, height: 150 })
        header.getBoundingClientRect = () => ({ top: -300, bottom: -270, left: 0, right: 400, width: 400, height: 30 })
        skill.getBoundingClientRect = () => ({ top: 500, bottom: 520, left: 0, right: 400, width: 400, height: 20 })
        scrollSceneContentForHeaderAndSkill(header, skill)
        // Falls back to scrollSceneContentSoElementVisible(skill): margin=8, contentRect.bottom-margin=142
        // skill.bottom(520) > 142 -> delta = 520 - 142 = 378
        expect(sceneContent.scrollBy.lastCall).toEqual({ top: 378, behavior: 'smooth' })
    })

    it('falls back to skill-only nearest-scroll when no header element is given', () => {
        sceneContent.getBoundingClientRect = () => ({ top: 0, bottom: 300, left: 0, right: 400, width: 400, height: 300 })
        skill.getBoundingClientRect = () => ({ top: 320, bottom: 340, left: 0, right: 400, width: 400, height: 20 })
        const detachedHeader = document.createElement('div')
        scrollSceneContentForHeaderAndSkill(detachedHeader, skill)
        // margin=8, contentRect.bottom-margin=292; delta = 340-292 = 48
        expect(sceneContent.scrollBy.lastCall).toEqual({ top: 48, behavior: 'smooth' })
    })
})
