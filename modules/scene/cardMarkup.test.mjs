import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import {
    renderSkillCardSceneInnerHtml,
    renderSkillCardResumeInnerHtml,
    renderSkillCardContentHtml,
    renderBizCardSceneBodyHtml,
    renderBizResumeHeaderHtml,
    orderedBizCardSkillEntries,
    renderBizCardSkillTitleSpansHtml,
    renderProjectLinksSectionHtml,
} from './cardMarkup.mjs'
import { enrichJobsWithSkills } from '@/modules/data/enrichedJobs.mjs'
import { normalizeParserJobs, normalizeParserSkills } from '@/modules/data/parsedResumeAdapter.mjs'
import { mergeJobsWithEducation } from '@/modules/data/mergeEducationIntoJobs.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const INDEXED_RESUME_DIR = path.resolve(__dirname, '../../parsed_resumes/shawn-becker-full-resume-indexed')

/** Count rendered .biz-card-skill-title spans per display name (what the user sees on the card). */
function countSkillTitlesByName(html) {
    const host = document.createElement('div')
    host.innerHTML = html
    const counts = new Map()
    for (const span of host.querySelectorAll('.biz-card-skill-title')) {
        // Visible text is "<slug> Display Name"; strip the slug tag to get the display name.
        span.querySelector('.skill-id-tag')?.remove()
        const name = span.textContent.trim().toLowerCase()
        counts.set(name, (counts.get(name) || 0) + 1)
    }
    return counts
}

/** Keys that resolve to the same skill must render once per card. */
function expectEachSkillOnce(html, label) {
    const dups = [...countSkillTitlesByName(html).entries()].filter(([, n]) => n > 1)
    expect(dups, `${label}: skills rendered more than once`).toEqual([])
}

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
        // Pencil is resume chrome next to ×, not inside the name/URL row.
        expect(html).toMatch(/skill-url-edit-btn[\s\S]*skill-resume-div-close/)
        expect(html).not.toMatch(/skill-card-name-row[\s\S]*skill-url-edit-btn[\s\S]*skill-card-info-url/)
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

    it('renderProjectLinksSectionHtml renders both anchors with full URLs as link text when both fields are set', () => {
        const html = renderProjectLinksSectionHtml({
            projectGithubRepoUrl: 'https://github.com/acme/widget',
            projectGithubPagesUrl: 'https://acme.github.io/widget',
        })
        expect(html).toContain('class="resume-project-links"')
        expect(html).toContain('Project Links')
        expect(html).toContain('Project GitHub Repo URL')
        expect(html).toContain('Project GitHub Pages URL')
        expect(html).toContain('<a class="resume-project-link-url" href="https://github.com/acme/widget"')
        expect(html).toContain('>https://github.com/acme/widget</a>')
        expect(html).toContain('<a class="resume-project-link-url" href="https://acme.github.io/widget"')
        expect(html).toContain('>https://acme.github.io/widget</a>')
        expect(html).toContain('target="_blank"')
        expect(html).toContain('rel="noopener noreferrer"')
    })

    it('renderProjectLinksSectionHtml renders only the row for whichever field is set', () => {
        const repoOnly = renderProjectLinksSectionHtml({ projectGithubRepoUrl: 'https://github.com/acme/widget' })
        expect(repoOnly).toContain('Project GitHub Repo URL')
        expect(repoOnly).not.toContain('Project GitHub Pages URL')

        const pagesOnly = renderProjectLinksSectionHtml({ projectGithubPagesUrl: 'https://acme.github.io/widget' })
        expect(pagesOnly).toContain('Project GitHub Pages URL')
        expect(pagesOnly).not.toContain('Project GitHub Repo URL')
    })

    it('renderProjectLinksSectionHtml omits the whole section when neither field is set', () => {
        expect(renderProjectLinksSectionHtml({})).toBe('')
        expect(renderProjectLinksSectionHtml(undefined)).toBe('')
        expect(renderProjectLinksSectionHtml({ projectGithubRepoUrl: '  ' })).toBe('')
    })

    it('renderProjectLinksSectionHtml escapes URLs used as both href and link text', () => {
        const html = renderProjectLinksSectionHtml({ projectGithubRepoUrl: 'https://example.com/?a=1&b="x"' })
        expect(html).toContain('href="https://example.com/?a=1&amp;b=&quot;x&quot;"')
        expect(html).toContain('>https://example.com/?a=1&amp;b=&quot;x&quot;</a>')
        const host = document.createElement('div')
        host.innerHTML = html
        const anchor = host.querySelector('.resume-project-link-url')
        expect(anchor.getAttribute('href')).toBe('https://example.com/?a=1&b="x"')
        expect(anchor.textContent).toBe('https://example.com/?a=1&b="x"')
    })
})

describe('biz card skill titles — one entry per canonical skill', () => {
    // Key differs from display name (slug key + pretty name), plus a name-keyed entry.
    const skills = {
        'express-js': { name: 'Express.js', url: 'https://expressjs.com/' },
        postgresql: { name: 'PostgreSQL', url: '' },
        Vue: { name: 'Vue', url: 'https://vuejs.org/' },
        docx: { name: 'DOCX' },
    }

    it('collapses skillIDs keys and bracketed display names onto one entry each', () => {
        const rawJobs = [{
            index: 0,
            employer: 'resume-flyer',
            start: '01/2025',
            end: '06/2025',
            // Description brackets use display names …
            Description: '• [Vue] SPA with an [Express.js] backend on [PostgreSQL].',
            // … while skillIDs mix slug keys and display names for the same skills.
            skillIDs: ['express-js', 'PostgreSQL', 'Vue', 'DOCX'],
        }]
        const [job] = enrichJobsWithSkills(rawJobs, skills)

        // Enrichment itself must not add a skill twice under two ids.
        expect(Object.keys(job['job-skills']).sort()).toEqual(['Vue', 'docx', 'express-js', 'postgresql'])

        const entries = orderedBizCardSkillEntries(job, skills, Object.keys(job['job-skills']))
        expect(entries.map((e) => e.skillKey).sort()).toEqual(['Vue', 'docx', 'express-js', 'postgresql'])
        expect(entries.find((e) => e.skillKey === 'express-js').displayName).toBe('Express.js')

        const html = renderBizCardSkillTitleSpansHtml(entries, skills)
        const counts = countSkillTitlesByName(html)
        expect(counts.get('express.js')).toBe(1)
        expect(counts.get('postgresql')).toBe(1)
        expect(counts.get('vue')).toBe(1)
        expect(counts.get('docx')).toBe(1)
        expectEachSkillOnce(html, 'synthetic job')
        // The canonical key is what links to the skill card.
        expect(html).toContain('data-skill-name="express-js"')
        expect(html).not.toContain('data-skill-name="Express.js"')
    })

    it('is robust to a stale baked job-skills map keyed by display name', () => {
        // Older enriched-jobs.json files were baked against a name-keyed skills map.
        const bakedJob = {
            skillIDs: ['express-js', 'Vue'],
            'job-skills': { 'Express.js': 'Express.js', Vue: 'Vue', PostgreSQL: 'PostgreSQL' },
        }
        const entries = orderedBizCardSkillEntries(bakedJob, skills, new Set(['Express.js']))
        expect(entries.map((e) => e.skillKey).sort()).toEqual(['Vue', 'express-js', 'postgresql'])
        expectEachSkillOnce(renderBizCardSkillTitleSpansHtml(entries, skills), 'stale baked job')
    })

    it('keeps an unknown id visible once instead of dropping it', () => {
        const entries = orderedBizCardSkillEntries({ skillIDs: ['Not A Skill', 'Not A Skill'] }, skills)
        expect(entries).toHaveLength(1)
        expect(entries[0].skillKey).toBe('Not A Skill')
    })

    const haveIndexedResume = existsSync(path.join(INDEXED_RESUME_DIR, 'jobs.json'))
        && existsSync(path.join(INDEXED_RESUME_DIR, 'skills.json'))

    it.skipIf(!haveIndexedResume)('renders every skill once per card for the indexed resume (live enrichment)', () => {
        const read = (f) => JSON.parse(readFileSync(path.join(INDEXED_RESUME_DIR, f), 'utf8'))
        const rawSkills = read('skills.json')
        const skillsMap = normalizeParserSkills(rawSkills)
        // Server enrichment and the static client must agree on the key space.
        expect(Object.keys(skillsMap).sort()).toEqual(Object.keys(rawSkills).sort())
        const eduPath = path.join(INDEXED_RESUME_DIR, 'education.json')
        const education = existsSync(eduPath) ? read('education.json') : {}
        const jobs = enrichJobsWithSkills(mergeJobsWithEducation(normalizeParserJobs(read('jobs.json')), education), skillsMap)
        expect(jobs.length).toBeGreaterThan(0)
        for (const job of jobs) {
            const entries = orderedBizCardSkillEntries(job, rawSkills, Object.keys(job['job-skills'] || {}))
            expectEachSkillOnce(renderBizCardSkillTitleSpansHtml(entries, rawSkills), `live: ${job.employer || job.institution}`)
        }
    })

    it.skipIf(!haveIndexedResume || !existsSync(path.join(INDEXED_RESUME_DIR, 'enriched-jobs.json')))(
        'renders every skill once per card for the indexed resume (baked enriched-jobs.json)', () => {
            const read = (f) => JSON.parse(readFileSync(path.join(INDEXED_RESUME_DIR, f), 'utf8'))
            const rawSkills = read('skills.json')
            for (const job of read('enriched-jobs.json')) {
                const entries = orderedBizCardSkillEntries(job, rawSkills, Object.keys(job['job-skills'] || {}))
                expectEachSkillOnce(renderBizCardSkillTitleSpansHtml(entries, rawSkills), `baked: ${job.employer || job.institution}`)
            }
        })
})
