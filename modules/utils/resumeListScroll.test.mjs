import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
    scrollResumeListingElementIntoView,
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
