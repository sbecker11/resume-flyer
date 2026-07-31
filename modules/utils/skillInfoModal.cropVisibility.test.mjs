import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
    isSkillTitleVisibleInBizCardCrop,
    getElementVerticalExtent,
} from './skillInfoModal.mjs'

describe('getElementVerticalExtent', () => {
    it('unions all client rects for a multi-line inline element', () => {
        const el = {
            getClientRects: () => [
                { top: 10, bottom: 24, width: 80, height: 14 },
                { top: 26, bottom: 40, width: 40, height: 14 },
            ],
            getBoundingClientRect: () => ({ top: 10, bottom: 24, height: 14 }),
        }
        expect(getElementVerticalExtent(el)).toEqual({ top: 10, bottom: 40, height: 30 })
    })

    it('falls back to bounding rect when client rects are empty', () => {
        const el = {
            getClientRects: () => [],
            getBoundingClientRect: () => ({ top: 5, bottom: 20, height: 15 }),
        }
        expect(getElementVerticalExtent(el)).toEqual({ top: 5, bottom: 20, height: 15 })
    })
})

describe('isSkillTitleVisibleInBizCardCrop', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <div class="biz-card-div" id="card" style="position:absolute; top:0; left:0; width:200px; height:200px;">
                <div class="resume-skills" id="skills" style="overflow:hidden; height:80px;">
                    <span class="biz-card-skill-title" id="in-crop" data-skill-name="vue"></span>
                    <span class="biz-card-skill-title" id="past-crop" data-skill-name="java"></span>
                    <span class="biz-card-skill-title" id="wrapped" data-skill-name="proficient-in-spanish"></span>
                </div>
            </div>
        `
    })

    afterEach(() => {
        document.body.innerHTML = ''
    })

    it('returns true when skill title is fully inside T&S clip and card crop inset', () => {
        const card = document.getElementById('card')
        const skills = document.getElementById('skills')
        const skill = document.getElementById('in-crop')
        card.getBoundingClientRect = () => ({ top: 100, bottom: 300, left: 0, right: 200, width: 200, height: 200 })
        skills.getBoundingClientRect = () => ({ top: 200, bottom: 280, left: 0, right: 200, width: 200, height: 80 })
        skill.getClientRects = () => [{ top: 240, bottom: 260, left: 10, right: 80, width: 70, height: 20 }]
        skill.getBoundingClientRect = () => ({ top: 240, bottom: 260, left: 10, right: 80, width: 70, height: 20 })
        expect(isSkillTitleVisibleInBizCardCrop(skill, card)).toBe(true)
    })

    it('returns false when skill title extends past T&S / crop bottom', () => {
        const card = document.getElementById('card')
        const skills = document.getElementById('skills')
        const skill = document.getElementById('past-crop')
        card.getBoundingClientRect = () => ({ top: 100, bottom: 300, left: 0, right: 200, width: 200, height: 200 })
        skills.getBoundingClientRect = () => ({ top: 200, bottom: 280, left: 0, right: 200, width: 200, height: 80 })
        skill.getClientRects = () => [{ top: 270, bottom: 290, left: 10, right: 80, width: 70, height: 20 }]
        skill.getBoundingClientRect = () => ({ top: 270, bottom: 290, left: 10, right: 80, width: 70, height: 20 })
        expect(isSkillTitleVisibleInBizCardCrop(skill, card)).toBe(false)
    })

    it('returns false when a wrapped skill has only its first line above the crop', () => {
        const card = document.getElementById('card')
        const skills = document.getElementById('skills')
        const skill = document.getElementById('wrapped')
        card.getBoundingClientRect = () => ({ top: 100, bottom: 300, left: 0, right: 200, width: 200, height: 200 })
        skills.getBoundingClientRect = () => ({ top: 200, bottom: 280, left: 0, right: 200, width: 200, height: 80 })
        // First line in crop; second line past cropBottom (280)
        skill.getClientRects = () => [
            { top: 262, bottom: 276, left: 10, right: 120, width: 110, height: 14 },
            { top: 278, bottom: 292, left: 10, right: 70, width: 60, height: 14 },
        ]
        // Misleading single-line bounding rect (first line only) — must not pass
        skill.getBoundingClientRect = () => ({ top: 262, bottom: 276, left: 10, right: 120, width: 110, height: 14 })
        expect(isSkillTitleVisibleInBizCardCrop(skill, card)).toBe(false)
    })

    it('returns false when T&S section is hidden', () => {
        const card = document.getElementById('card')
        const skills = document.getElementById('skills')
        const skill = document.getElementById('in-crop')
        skills.style.display = 'none'
        card.getBoundingClientRect = () => ({ top: 100, bottom: 300, left: 0, right: 200, width: 200, height: 200 })
        skills.getBoundingClientRect = () => ({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 })
        skill.getClientRects = () => [{ top: 240, bottom: 260, left: 10, right: 80, width: 70, height: 20 }]
        skill.getBoundingClientRect = () => ({ top: 240, bottom: 260, left: 10, right: 80, width: 70, height: 20 })
        expect(isSkillTitleVisibleInBizCardCrop(skill, card)).toBe(false)
    })
})
