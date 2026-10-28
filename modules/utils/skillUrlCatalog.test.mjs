import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'
import {
    applyCatalogToSkills,
    assertSkillInfoUrl,
    mergeCatalogs,
    upsertEntry,
    userDefinedSkillUrl,
} from './skillUrlCatalog.mjs'
import { defaultSkillUrlsPath, skillUrlsMirrorPath } from './skillUrlCatalogStore.mjs'

describe('skillUrlCatalog', () => {
    it('rejects non-http urls and allows blank to clear', () => {
        expect(assertSkillInfoUrl('')).toBe('')
        expect(assertSkillInfoUrl('  https://example.com/a  ')).toBe('https://example.com/a')
        expect(() => assertSkillInfoUrl('javascript:alert(1)')).toThrow(/absolute http/i)
        expect(() => assertSkillInfoUrl('/relative')).toThrow(/absolute http/i)
    })

    it('keeps the newer slug when two catalogs merge', () => {
        const merged = mergeCatalogs(
            { entries: { cnn: { url: 'https://old.example', updatedAt: '2020-01-01T00:00:00.000Z' } } },
            { entries: { cnn: { url: 'https://new.example', updatedAt: '2024-01-01T00:00:00.000Z' }, vue: { url: 'https://vuejs.org', updatedAt: '2024-06-01T00:00:00.000Z' } } }
        )
        expect(merged.entries.cnn.url).toBe('https://new.example')
        expect(merged.entries.vue.url).toBe('https://vuejs.org')
    })

    it('does not let an older write clear a newer url', () => {
        const current = {
            entries: { cnn: { url: 'https://new.example', updatedAt: '2024-01-01T00:00:00.000Z' } },
        }
        const next = upsertEntry(current, 'cnn', '', '2020-01-01T00:00:00.000Z')
        expect(next.entries.cnn.url).toBe('https://new.example')
    })

    it('uses the skill url and ignores a stale catalog link', () => {
        const catalog = {
            entries: {
                redshift: { url: 'https://aws.amazon.com/redshift/', updatedAt: '2026-01-01T00:00:00.000Z' },
                Spring: { url: 'https://spring.io/projects/spring-framework', updatedAt: '2026-01-01T00:00:00.000Z' },
                Kafka: { url: 'https://www.google.com/search?q=apache+kafka', updatedAt: '2026-01-01T00:00:00.000Z' },
                'Aurora PostgreSQL Serverless v2': {
                    url: 'https://www.google.com/search?q=amazon+Aurora+PostgreSQL+Serverless+v2&rlz=1',
                    updatedAt: '2026-01-01T00:00:00.000Z',
                },
            },
        }
        expect(userDefinedSkillUrl(catalog, 'redshift', 'Redshift')).toBe('https://aws.amazon.com/redshift/')
        expect(userDefinedSkillUrl(catalog, 'spring', 'Spring', 'https://spring.io/')).toBe('https://spring.io/')
        expect(userDefinedSkillUrl(catalog, 'kafka', 'Kafka', 'https://kafka.apache.org/')).toBe('https://kafka.apache.org/')
        expect(userDefinedSkillUrl(
            catalog,
            'aurora-postgresql-serverless-v2',
            'Aurora PostgreSQL Serverless v2',
            'https://aws.amazon.com/rds/aurora/serverless/'
        )).toBe('https://aws.amazon.com/rds/aurora/serverless/')
        expect(userDefinedSkillUrl(catalog, 'airflow', 'Airflow', 'https://airflow.apache.org/')).toBe('https://airflow.apache.org/')
        expect(userDefinedSkillUrl(null, 'vue', 'Vue', '')).toBe('')
    })

    it('overlays catalog urls onto existing skills only', () => {
        const { skills, changed } = applyCatalogToSkills(
            { cnn: { name: 'CNN', url: '' }, spark: { name: 'Spark', url: 'https://spark.apache.org' } },
            { entries: { cnn: { url: 'https://example.com/cnn', updatedAt: '2024-01-01T00:00:00.000Z' }, missing: { url: 'https://nope.example', updatedAt: '2024-01-01T00:00:00.000Z' } } }
        )
        expect(changed).toBe(true)
        expect(skills.cnn.url).toBe('https://example.com/cnn')
        expect(skills.spark.url).toBe('https://spark.apache.org')
        expect(skills.missing).toBeUndefined()
    })

    it('uses the skill url for every saved skill, even when a catalog entry disagrees', () => {
        const parsedDir = path.resolve('parsed_resumes')
        const catalogFiles = [skillUrlsMirrorPath(parsedDir), defaultSkillUrlsPath()]
        const catalogs = []
        for (const filePath of catalogFiles) {
            if (!fs.existsSync(filePath)) continue
            catalogs.push({ filePath, catalog: JSON.parse(fs.readFileSync(filePath, 'utf8')) })
        }
        if (catalogs.length === 0) catalogs.push({ filePath: '(none)', catalog: { entries: {} } })

        const mismatches = []
        let skillsChecked = 0
        const resumeDirs = fs.readdirSync(parsedDir, { withFileTypes: true }).filter((entry) => entry.isDirectory())
        for (const resumeDir of resumeDirs) {
            const skillsPath = path.join(parsedDir, resumeDir.name, 'skills.json')
            if (!fs.existsSync(skillsPath)) continue
            const skills = JSON.parse(fs.readFileSync(skillsPath, 'utf8'))
            for (const { filePath, catalog } of catalogs) {
                for (const [slug, skill] of Object.entries(skills)) {
                    if (!skill || typeof skill !== 'object') continue
                    const stored = String(skill.url || '').trim()
                    if (!stored) continue
                    skillsChecked += 1
                    const shown = userDefinedSkillUrl(catalog, slug, skill.name, stored)
                    if (shown !== stored) {
                        mismatches.push(
                            `${resumeDir.name}/${slug} (${filePath}): skill url ${stored} but finder would show ${shown}`
                        )
                    }
                }
            }
        }
        expect(skillsChecked).toBeGreaterThan(0)
        expect(mismatches).toEqual([])
    })
})
