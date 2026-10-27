import { describe, it, expect } from 'vitest'
import {
    renderSkillCardSceneInnerHtml,
    renderSkillCardResumeInnerHtml,
    renderSkillCardContentHtml,
    renderBizCardSceneBodyHtml,
    renderBizResumeHeaderHtml,
} from './cardMarkup.mjs'

describe('cardMarkup', () => {
    const skillObj = { name: 'PySpark' }
    const backIconUrl = '/static_content/icons/anchors/icons8-back-16-black.png'

    it('renderSkillCardContentHtml uses shared classes and years label', () => {
        const html = renderSkillCardContentHtml({
            skillSlug: 'pyspark',
            skillObj,
            totalYears: 3,
            backLinks: [{ bizCardId: 'biz-card-div-1' }],
            backIconUrl,
        })
        expect(html).toContain('class="skill-card-content"')
        expect(html).toContain('class="skill-card-label"')
        expect(html).toContain('class="skill-card-back-icons"')
        expect(html).toContain('class="skill-card-years"')
        expect(html).toContain('(3 yrs exp.)')
        expect(html).toContain('PySpark')
        expect(html).not.toContain('skill-card-name-row')
    })

    it('renderSkillCardSceneInnerHtml includes modal btn and content only', () => {
        const html = renderSkillCardSceneInnerHtml({
            skillSlug: 'pyspark',
            skillObj,
            totalYears: 1,
            referencingBizCardIds: ['biz-card-div-2'],
            backIconUrl,
        })
        expect(html).toContain('skill-info-modal-btn')
        expect(html).toContain('skill-card-content')
        expect(html).not.toContain('skill-resume-div-close')
        expect(html).not.toContain('skill-resume-div-back-link')
        expect(html).not.toContain('skill-url-edit-btn')
        expect(html).not.toContain('skill-card-info-url')
    })

    it('renderSkillCardResumeInnerHtml adds resume-only chrome with info URL, no ?', () => {
        const infoUrl = 'https://en.wikipedia.org/wiki/Apache_Spark'
        const html = renderSkillCardResumeInnerHtml({
            skillSlug: 'pyspark',
            skillObj,
            totalYears: 1,
            referencingJobNumbers: [2],
            backIconUrl,
            bizCardIdForJob: (n) => `biz-card-div-${n}`,
            infoUrl,
        })
        expect(html).toContain('skill-resume-div-close')
        expect(html).toContain('skill-resume-div-back-link')
        expect(html).toContain('data-job-number="2"')
        expect(html).toContain('(1 yr exp.)')
        expect(html).toContain('skill-card-name-row')
        expect(html).toContain('skill-card-info-url')
        expect(html).toContain(infoUrl)
        expect(html).toContain('target="_blank"')
        expect(html).not.toContain('skill-info-modal-btn')
        expect(html).not.toContain('skill-url-edit-btn')
    })

    it('renderSkillCardResumeInnerHtml includes URL edit when showUrlEdit', () => {
        const html = renderSkillCardResumeInnerHtml({
            skillSlug: 'pyspark',
            skillObj,
            totalYears: 1,
            referencingJobNumbers: [2],
            backIconUrl,
            bizCardIdForJob: (n) => `biz-card-div-${n}`,
            infoUrl: 'https://example.com/pyspark',
            showUrlEdit: true,
        })
        expect(html).toContain('skill-url-edit-btn')
        expect(html).toContain('data-skill-slug="pyspark"')
        expect(html).toContain('skill-card-info-url')
        expect(html).not.toContain('skill-info-modal-btn')
    })

    it('renderBizCardSceneBodyHtml and renderBizResumeHeaderHtml share field classes', () => {
        const scene = renderBizCardSceneBodyHtml({
            employer: 'Acme',
            role: 'Engineer',
            datesDisplay: '2020 - 2021',
        })
        const resume = renderBizResumeHeaderHtml({
            employer: 'Acme',
            role: 'Engineer',
            datesDisplay: '2020 - 2021',
        })
        for (const cls of ['biz-details-employer', 'biz-details-role', 'biz-details-dates']) {
            expect(scene).toContain(cls)
            expect(resume).toContain(cls)
        }
    })
})
