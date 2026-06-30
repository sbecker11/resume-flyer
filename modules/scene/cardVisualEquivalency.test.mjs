import { describe, it, beforeAll, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import {
    renderSkillCardSceneInnerHtml,
    renderSkillCardResumeInnerHtml,
    renderBizCardSceneBodyHtml,
    renderBizResumeHeaderHtml,
} from './cardMarkup.mjs'
import {
    installCardStyles,
    CARD_TEST_THEME_VARS,
    assertSelectorStylesMatch,
    snapshotStyles,
    assertStylesMatch,
} from './cardVisualEquivalency.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const sceneCss = readFileSync(path.resolve(__dirname, '../../styles/scene.css'), 'utf8')

/** Minimal resume-header rules from ResumeContainer (employer/role/dates only). */
const RESUME_HEADER_TEST_CSS = `
.biz-resume-div .biz-resume-details-div { padding: 0; display: flex; flex-direction: column; }
.resume-header { display: flex; flex-direction: column; }
.resume-header .biz-details-employer-wrap { margin-bottom: 12px; }
.resume-header .biz-details-role { font-size: 14px; margin-bottom: 12px; }
.resume-header .biz-details-dates { font-size: 12px; }
.resume-section-title-wrap h4 { font-size: 13px; margin: 0; }
`

describe('cardVisualEquivalency', () => {
    /** @type {HTMLDivElement} */
    let mount

    beforeAll(() => {
        installCardStyles(sceneCss, CARD_TEST_THEME_VARS + RESUME_HEADER_TEST_CSS)
    })

    beforeEach(() => {
        mount = document.createElement('div')
        document.body.appendChild(mount)
    })

    afterEach(() => {
        mount.remove()
    })

    it('skill card scene shell matches resume shell typography and padding', () => {
        const skillObj = { name: 'SciPy' }
        const backIconUrl = '/icons/back.png'
        const scene = document.createElement('div')
        scene.className = 'skill-card-div clone selected'
        scene.innerHTML = renderSkillCardSceneInnerHtml({
            skillSlug: 'scipy',
            skillObj,
            totalYears: 2,
            referencingBizCardIds: ['biz-card-div-0'],
            backIconUrl,
        })

        const resume = document.createElement('div')
        resume.className = 'skill-resume-div appended-skill-resume-div selected'
        resume.innerHTML = renderSkillCardResumeInnerHtml({
            skillSlug: 'scipy',
            skillObj,
            totalYears: 2,
            referencingJobNumbers: [0],
            backIconUrl,
            bizCardIdForJob: (n) => `biz-card-div-${n}`,
        })

        mount.appendChild(scene)
        mount.appendChild(resume)

        const props = ['fontSize', 'paddingTop', 'paddingLeft', 'paddingRight', 'paddingBottom']
        assertStylesMatch(
            snapshotStyles(scene, props),
            snapshotStyles(resume, props),
            'skill card shell'
        )

        assertSelectorStylesMatch(scene, resume, '.skill-card-label', ['fontSize', 'fontWeight'], '.skill-card-label')
        assertSelectorStylesMatch(scene, resume, '.skill-card-content', ['paddingTop', 'paddingLeft'], '.skill-card-content')
        assertSelectorStylesMatch(scene, resume, '.skill-card-years', ['fontSize'], '.skill-card-years')
        assertSelectorStylesMatch(scene, resume, '.back-icon', ['width', 'height'], '.back-icon')
    })

    it('biz job header fields match between scene body and resume header', () => {
        const scene = document.createElement('div')
        scene.className = 'biz-card-div clone selected'
        scene.innerHTML = renderBizCardSceneBodyHtml({
            employer: 'Spexture / Technical Consulting',
            role: 'Senior Engineer',
            datesDisplay: 'Jan 2020 - Dec 2021',
            jobNumber: 0,
            sceneZ: 5,
            hasSkills: false,
        })

        const resume = document.createElement('div')
        resume.className = 'biz-resume-div selected'
        resume.innerHTML = renderBizResumeHeaderHtml({
            employer: 'Spexture / Technical Consulting',
            role: 'Senior Engineer',
            datesDisplay: 'Jan 2020 - Dec 2021',
        })

        mount.appendChild(scene)
        mount.appendChild(resume)

        assertSelectorStylesMatch(scene, resume, '.biz-details-employer', ['fontSize', 'fontWeight'], 'employer')
        assertSelectorStylesMatch(scene, resume, '.biz-details-role', ['fontSize'], 'role')
        assertSelectorStylesMatch(scene, resume, '.biz-details-dates', ['fontSize'], 'dates')

        const scenePad = snapshotStyles(scene, ['paddingTop', 'paddingLeft'])
        const resumePad = snapshotStyles(resume, ['paddingTop', 'paddingLeft'])
        assertStylesMatch(scenePad, resumePad, 'biz card shell padding')
    })
})
