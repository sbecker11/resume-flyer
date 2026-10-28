import { describe, it, expect, afterEach, vi } from 'vitest'
import { jobTenureMonthsInclusive, tryParseFlexibleDateString } from './dateUtils.mjs'
import {
    buildJobSearchOptions,
    buildSkillSearchOptions,
    canonicalSkillCardId,
    filterSearchOptionsByQuery,
    findExistingResumeSkillCopy,
    resumeSkillYearsMatchingScene,
    resolveSceneSkillCardElement,
    skillCardIdBySlugFromElements,
    totalYearsFromDurationMonths,
} from './skillCardIdentity.mjs'

/**
 * Former ResumeContainer.getMonthsExperience: exclusive month difference.
 * One month short of jobTenureMonthsInclusive for every valid job.
 */
function legacyExclusiveMonths(job) {
    if (!job?.start) return 0
    const start = tryParseFlexibleDateString(job.start)
    const end = (job.end === 'CURRENT_DATE' || !job.end)
        ? new Date()
        : tryParseFlexibleDateString(job.end)
    if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0
    return (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth())
}

function skillCard(id, slug, { clone = false } = {}) {
    const el = document.createElement('div')
    el.id = id
    el.className = clone ? 'skill-card-div clone' : 'skill-card-div'
    el.setAttribute('data-skill-name', slug)
    return el
}

describe('skill finder options', () => {
    it('returns one row per skill and drops .clone cards', () => {
        const cards = [
            skillCard('skill-card-div-4', 'agile'),
            skillCard('skill-card-div-4-clone', 'agile', { clone: true }),
            skillCard('skill-card-div-9', 'java'),
            skillCard('skill-card-div-9-clone', 'java', { clone: true }),
        ]
        const options = buildSkillSearchOptions(cards, {
            agile: { name: 'Agile' },
            java: { name: 'Java' },
        })
        expect(options).toEqual([
            { kind: 'skill', id: 'skill-card-div-4', label: 'Agile', sublabel: '', slug: 'agile' },
            { kind: 'skill', id: 'skill-card-div-9', label: 'Java', sublabel: '', slug: 'java' },
        ])
        const agile = filterSearchOptionsByQuery(options, 'Agile')
        expect(agile).toHaveLength(1)
        expect(agile[0].id).toBe('skill-card-div-4')
    })

    it('appends the skill url after the slug and does not replace it with a catalog url', () => {
        const cards = [
            skillCard('skill-card-div-1', 'aurora-postgresql-serverless-v2'),
            skillCard('skill-card-div-2', 'airflow'),
            skillCard('skill-card-div-3', 'agile'),
        ]
        const options = buildSkillSearchOptions(cards, {
            'aurora-postgresql-serverless-v2': {
                name: 'Aurora PostgreSQL Serverless v2',
                url: 'https://aws.amazon.com/rds/aurora/serverless/',
            },
            airflow: { name: 'Airflow', url: 'https://airflow.apache.org/' },
            agile: { name: 'Agile', url: '' },
        }, {
            entries: {
                'Aurora PostgreSQL Serverless v2': {
                    url: 'https://www.google.com/search?q=amazon+Aurora',
                    updatedAt: '2026-01-01T00:00:00.000Z',
                },
            },
        })
        expect(options.find((row) => row.id === 'skill-card-div-1').sublabel)
            .toBe('https://aws.amazon.com/rds/aurora/serverless/')
        expect(options.find((row) => row.id === 'skill-card-div-2').sublabel)
            .toBe('https://airflow.apache.org/')
        expect(options.find((row) => row.id === 'skill-card-div-3').sublabel).toBe('')
        const bySlug = filterSearchOptionsByQuery(options, 'aurora-postgresql-serverless-v2')
        expect(bySlug.map((row) => row.id)).toEqual(['skill-card-div-1'])
    })

    it('keeps the canonical id when the clone appears first in the DOM', () => {
        const map = skillCardIdBySlugFromElements([
            skillCard('skill-card-div-4-clone', 'agile', { clone: true }),
            skillCard('skill-card-div-4', 'agile'),
        ])
        expect(map.agile).toBe('skill-card-div-4')
    })
})

describe('job finder options', () => {
    it('excludes .clone biz cards', () => {
        const original = document.createElement('div')
        original.id = 'biz-card-div-3'
        original.className = 'biz-card-div'
        original.setAttribute('data-job-number', '3')
        original.setAttribute('data-employer', 'Adobe')
        original.setAttribute('data-role', 'Consultant')

        const clone = document.createElement('div')
        clone.id = 'biz-card-div-3-clone'
        clone.className = 'biz-card-div clone'
        clone.setAttribute('data-job-number', '3')
        clone.setAttribute('data-employer', 'Adobe')
        clone.setAttribute('data-role', 'Consultant')

        const options = buildJobSearchOptions([original, clone])
        expect(options).toEqual([
            { kind: 'job', id: 3, label: 'Adobe', sublabel: 'Consultant' },
        ])
    })
})

describe('resume skill copy identity', () => {
    afterEach(() => {
        document.body.innerHTML = ''
    })

    it('maps a clone id to the original scene card id', () => {
        expect(canonicalSkillCardId('skill-card-div-4-clone')).toBe('skill-card-div-4')
        expect(canonicalSkillCardId('skill-card-div-4')).toBe('skill-card-div-4')
        expect(canonicalSkillCardId('')).toBe('')
    })

    it('resolves the non-clone scene card when both exist', () => {
        const original = skillCard('skill-card-div-4', 'agile')
        const clone = skillCard('skill-card-div-4-clone', 'agile', { clone: true })
        document.body.append(original, clone)
        expect(resolveSceneSkillCardElement('skill-card-div-4-clone')).toBe(original)
        expect(resolveSceneSkillCardElement('skill-card-div-4')).toBe(original)
    })

    it('does not append a second resume card when the clicked id is the clone', () => {
        const list = document.createElement('div')
        const existing = document.createElement('div')
        existing.className = 'skill-resume-div appended-skill-resume-div'
        existing.setAttribute('data-skill-card-id', 'skill-card-div-4')
        existing.setAttribute('data-skill-name', 'agile')
        list.appendChild(existing)

        expect(findExistingResumeSkillCopy(list, 'skill-card-div-4-clone', 'agile')).toBe(existing)
        expect(findExistingResumeSkillCopy(list, 'skill-card-div-4', 'agile')).toBe(existing)
    })

    it('treats an existing copy stored under the clone id as the same skill', () => {
        const list = document.createElement('div')
        const existing = document.createElement('div')
        existing.className = 'appended-skill-resume-div'
        existing.setAttribute('data-skill-card-id', 'skill-card-div-4-clone')
        list.appendChild(existing)

        expect(findExistingResumeSkillCopy(list, 'skill-card-div-4', 'agile')).toBe(existing)
    })

    it('matches an existing copy by skill slug when the card ids differ', () => {
        const list = document.createElement('div')
        const existing = document.createElement('div')
        existing.className = 'appended-skill-resume-div'
        existing.setAttribute('data-skill-card-id', 'skill-card-div-4')
        existing.setAttribute('data-skill-name', 'agile')
        list.appendChild(existing)

        expect(findExistingResumeSkillCopy(list, 'skill-card-div-99', 'agile')).toBe(existing)
        expect(findExistingResumeSkillCopy(list, 'skill-card-div-99', 'java')).toBeNull()
    })
})

describe('skill card years', () => {
    /**
     * Six Agile client jobs on the indexed resume scene card
     * (Adobe, Fannie Mae, Cigna, Angel Studios, NuSkin, SeniorLink).
     * Inclusive durationMonths ceilings to 7 years; the old exclusive span ceilings to 6.
     */
    const agileClientJobs = [
        { employer: 'Adobe', start: '03/2025', end: '07/2025' },
        { employer: 'Fannie Mae', start: '02/2024', end: '07/2024' },
        { employer: 'Cigna', start: '05/2023', end: '12/2023' },
        { employer: 'Angel Studios', start: '11/2021', end: '09/2022' },
        { employer: 'NuSkin', start: '11/2019', end: '11/2020' },
        { employer: 'SeniorLink', start: '02/2017', end: '11/2019' },
    ]

    it('uses inclusive durationMonths (7) instead of the exclusive month span (6)', () => {
        const jobs = agileClientJobs.map((job) => ({
            durationMonths: jobTenureMonthsInclusive(job.start, job.end),
        }))
        const exclusiveMonths = agileClientJobs.reduce((sum, job) => sum + legacyExclusiveMonths(job), 0)

        expect(totalYearsFromDurationMonths(jobs)).toBe(7)
        expect(Math.ceil(exclusiveMonths / 12)).toBe(6)

        const scene = document.createElement('div')
        scene.setAttribute('data-total-years-experience', String(totalYearsFromDurationMonths(jobs)))
        expect(resumeSkillYearsMatchingScene(scene, jobs)).toBe(7)
        expect(resumeSkillYearsMatchingScene(scene, [])).toBe(7)
    })

    it('falls back to durationMonths when the scene card has no years attribute', () => {
        const scene = document.createElement('div')
        expect(resumeSkillYearsMatchingScene(scene, [{ durationMonths: 13 }, { durationMonths: 11 }])).toBe(2)
        expect(resumeSkillYearsMatchingScene(null, [{ durationMonths: null }, { durationMonths: 0 }])).toBe(0)
        expect(totalYearsFromDurationMonths(null)).toBe(0)
        expect(filterSearchOptionsByQuery(null, 'agile')).toEqual([])
        expect(filterSearchOptionsByQuery([{ label: 'Agile', sublabel: 'agile' }], '')).toHaveLength(1)
        expect(buildJobSearchOptions(null)).toEqual([])
        const badJob = document.createElement('div')
        badJob.className = 'biz-card-div'
        badJob.setAttribute('data-job-number', 'nope')
        expect(buildJobSearchOptions([badJob])).toEqual([])
        expect(skillCardIdBySlugFromElements(null)).toEqual({})
        expect(findExistingResumeSkillCopy(null, 'skill-card-div-1', 'agile')).toBeNull()
        expect(canonicalSkillCardId(null)).toBe('')
        expect(resolveSceneSkillCardElement('skill-card-div-1', null)).toBeNull()
    })

    it('reports an invalid years attribute and uses durationMonths', () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        const scene = document.createElement('div')
        scene.setAttribute('data-total-years-experience', 'nope')
        expect(resumeSkillYearsMatchingScene(scene, [{ durationMonths: 77 }])).toBe(7)
        expect(errorSpy).toHaveBeenCalled()
        expect(logSpy.mock.calls.some((call) => String(call[0]).includes('Remedy:'))).toBe(true)
        errorSpy.mockRestore()
        logSpy.mockRestore()
    })
})
