import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
    scrollResumeListingElementIntoView,
    scrollResumeListingRangeIntoView,
    getResumeListingVisualInsets,
    RESUME_LIST_BOTTOM_PADDING_PX,
    RESUME_SELECTED_RING_SPREAD_PX,
} from './resumeListScroll.mjs'

describe('resumeListScroll', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <div id="resume-content-listing" style="height: 200px; overflow: auto; padding: 8px 8px 12px 8px;">
                <div id="resume-content-div-list">
                    <div id="resume-1" class="biz-resume-div selected"
                         style="height: 80px; margin-top: 300px;"></div>
                </div>
            </div>
        `
    })

    afterEach(() => {
        document.body.innerHTML = ''
    })

    it('uses larger bottom inset for selected rows', () => {
        const insets = getResumeListingVisualInsets({ classList: { contains: (c) => c === 'selected' } })
        expect(insets.bottom).toBeGreaterThan(RESUME_SELECTED_RING_SPREAD_PX + 8)
        expect(RESUME_LIST_BOTTOM_PADDING_PX).toBe(12)
    })

    it('scrolls down when selected row visual bottom extends past viewport', () => {
        const scrollport = document.getElementById('resume-content-listing')
        const row = document.getElementById('resume-1')
        scrollport.scrollTop = 0
        Object.defineProperty(scrollport, 'scrollHeight', { configurable: true, value: 600 })
        Object.defineProperty(scrollport, 'clientHeight', { configurable: true, value: 200 })
        scrollport.getBoundingClientRect = () => ({ top: 0, bottom: 200, left: 0, right: 400, width: 400, height: 200 })
        row.getBoundingClientRect = () => ({ top: 150, bottom: 230, left: 8, right: 392, width: 384, height: 80 })
        scrollResumeListingElementIntoView(row, scrollport)
        expect(scrollport.scrollTop).toBeGreaterThan(0)
    })
})

describe('scrollResumeListingRangeIntoView', () => {
    let scrollport, header, skill

    beforeEach(() => {
        document.body.innerHTML = `
            <div id="resume-content-listing" style="overflow: auto;">
                <div id="resume-content-div-list">
                    <div id="resume-1" class="biz-resume-div">
                        <div id="header" class="biz-details-employer-wrap"></div>
                        <span id="skill" class="biz-card-skill-title"></span>
                    </div>
                </div>
            </div>
        `
        scrollport = document.getElementById('resume-content-listing')
        header = document.getElementById('header')
        skill = document.getElementById('skill')
        Object.defineProperty(scrollport, 'scrollHeight', { configurable: true, value: 800 })
        Object.defineProperty(scrollport, 'clientHeight', { configurable: true, value: 300 })
    })

    afterEach(() => {
        document.body.innerHTML = ''
    })

    it('does nothing when both header and skill already fit fully in view', () => {
        scrollport.scrollTop = 20
        scrollport.getBoundingClientRect = () => ({ top: 0, bottom: 300, left: 0, right: 400, width: 400, height: 300 })
        header.getBoundingClientRect = () => ({ top: 50, bottom: 80, left: 0, right: 400, width: 400, height: 30 })
        skill.getBoundingClientRect = () => ({ top: 200, bottom: 220, left: 0, right: 400, width: 400, height: 20 })
        scrollResumeListingRangeIntoView(header, skill, scrollport)
        expect(scrollport.scrollTop).toBe(20)
    })

    it('scrolls up to reveal the header while the combined range still fits the viewport', () => {
        scrollport.scrollTop = 50
        scrollport.getBoundingClientRect = () => ({ top: 0, bottom: 300, left: 0, right: 400, width: 400, height: 300 })
        // Header scrolled above the top of the viewport; skill already visible below it.
        header.getBoundingClientRect = () => ({ top: -30, bottom: 0, left: 0, right: 400, width: 400, height: 30 })
        skill.getBoundingClientRect = () => ({ top: 100, bottom: 120, left: 0, right: 400, width: 400, height: 20 })
        scrollResumeListingRangeIntoView(header, skill, scrollport)
        // viewTop=0, visualTop = -30 - 8(gap) = -38 -> scrollDelta = -38 -> 50 + (-38) = 12
        expect(scrollport.scrollTop).toBe(12)
    })

    it('falls back to scrolling just the skill when the combined header+skill span exceeds the viewport', () => {
        scrollport.scrollTop = 0
        scrollport.getBoundingClientRect = () => ({ top: 0, bottom: 150, left: 0, right: 400, width: 400, height: 150 })
        Object.defineProperty(scrollport, 'clientHeight', { configurable: true, value: 150 })
        header.getBoundingClientRect = () => ({ top: -300, bottom: -270, left: 0, right: 400, width: 400, height: 30 })
        skill.getBoundingClientRect = () => ({ top: 500, bottom: 520, left: 0, right: 400, width: 400, height: 20 })
        scrollResumeListingRangeIntoView(header, skill, scrollport)
        // Combined span (830px) > viewport (150px) -> falls back to scrollResumeListingElementIntoView(skill, ...)
        expect(scrollport.scrollTop).toBeGreaterThan(0)
        expect(scrollport.scrollTop).toBe(378)
    })

    it('falls back to skill-only scroll when no header element is given', () => {
        scrollport.scrollTop = 0
        scrollport.getBoundingClientRect = () => ({ top: 0, bottom: 200, left: 0, right: 400, width: 400, height: 200 })
        Object.defineProperty(scrollport, 'clientHeight', { configurable: true, value: 200 })
        Object.defineProperty(scrollport, 'scrollHeight', { configurable: true, value: 600 })
        skill.getBoundingClientRect = () => ({ top: 250, bottom: 270, left: 0, right: 400, width: 400, height: 20 })
        const detachedHeader = document.createElement('div')
        scrollResumeListingRangeIntoView(detachedHeader, skill, scrollport)
        expect(scrollport.scrollTop).toBeGreaterThan(0)
    })
})
