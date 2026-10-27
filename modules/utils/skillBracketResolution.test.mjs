import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { findUnresolvedBracketLabels, findUnresolvedBracketsInJobs } from './skillBracketResolution.mjs'
import { mergeJobsWithEducation, toJobsArray } from '../data/mergeEducationIntoJobs.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../..')
const PARSED = path.join(ROOT, 'parsed_resumes')

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function listCuratedResumeIds() {
    if (!fs.existsSync(PARSED)) return []
    return fs.readdirSync(PARSED, { withFileTypes: true })
        .filter((d) => d.isDirectory() && !d.name.startsWith('_') && d.name !== 'bak')
        .map((d) => d.name)
        .filter((id) => fs.existsSync(path.join(PARSED, id, 'skills.json')))
}

describe('skillBracketResolution', () => {
    it('ignores outline content-index tags and reports unknown skills', () => {
        const skills = { spark: { name: 'Apache Spark' } }
        expect(findUnresolvedBracketLabels('[1.1.3] used [Apache Spark] and [Nope]', skills))
            .toEqual(['Nope'])
        expect(findUnresolvedBracketLabels('plain [Apache Spark] only', skills)).toEqual([])
    })

    it('every curated parsed resume resolves all description brackets', () => {
        const ids = listCuratedResumeIds()
        expect(ids.length).toBeGreaterThan(0)

        const failures = []
        for (const id of ids) {
            const dir = path.join(PARSED, id)
            const skills = readJson(path.join(dir, 'skills.json'))
            const jobsRaw = readJson(path.join(dir, 'jobs.json'))
            let education = {}
            const eduPath = path.join(dir, 'education.json')
            if (fs.existsSync(eduPath)) education = readJson(eduPath)
            const jobs = mergeJobsWithEducation(toJobsArray(jobsRaw), education)
            const unresolved = findUnresolvedBracketsInJobs(jobs, skills)
            if (unresolved.length) {
                failures.push({ id, unresolved })
            }
        }

        expect(failures, JSON.stringify(failures, null, 2)).toEqual([])
    })

    it('every non-empty curated skill url is an absolute http(s) link', async () => {
        const { isAbsoluteHttpUrl } = await import('./skillInfoModal.mjs')
        const ids = listCuratedResumeIds()
        expect(ids.length).toBeGreaterThan(0)

        const bad = []
        for (const id of ids) {
            const skills = readJson(path.join(PARSED, id, 'skills.json'))
            for (const [slug, skill] of Object.entries(skills || {})) {
                if (!skill || typeof skill !== 'object') continue
                const url = String(skill.url ?? '').trim()
                if (!url) continue
                if (!isAbsoluteHttpUrl(url)) {
                    bad.push({ id, slug, url })
                }
            }
        }
        expect(bad, JSON.stringify(bad, null, 2)).toEqual([])
    })
})
