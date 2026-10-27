import { describe, it, expect } from 'vitest'
import {
    canEditSkillUrl,
    normalizeSkillUrlEditInput,
    skillUrlPersistReminder,
} from './skillUrlEdit.mjs'

describe('skillUrlEdit', () => {
    describe('canEditSkillUrl', () => {
        it('requires backend and a non-default resume id', () => {
            expect(canEditSkillUrl(true, 'shawn-becker-full-resume-indexed')).toBe(true)
            expect(canEditSkillUrl(false, 'shawn-becker-full-resume-indexed')).toBe(false)
            expect(canEditSkillUrl(true, 'default')).toBe(false)
            expect(canEditSkillUrl(true, '')).toBe(false)
            expect(canEditSkillUrl(true, null)).toBe(false)
        })
    })

    describe('normalizeSkillUrlEditInput', () => {
        it('treats null as cancelled', () => {
            expect(normalizeSkillUrlEditInput(null, 'https://a.com')).toEqual({
                status: 'cancelled',
                url: 'https://a.com',
            })
            expect(normalizeSkillUrlEditInput(null, undefined)).toEqual({
                status: 'cancelled',
                url: '',
            })
            expect(normalizeSkillUrlEditInput(null)).toEqual({
                status: 'cancelled',
                url: '',
            })
        })

        it('rejects non-absolute urls', () => {
            const r = normalizeSkillUrlEditInput('/wiki/x', 'https://a.com')
            expect(r.status).toBe('invalid')
            expect(r.message).toMatch(/absolute http/i)
            expect(r.url).toBe('https://a.com')
        })

        it('allows blank to clear and detects unchanged', () => {
            expect(normalizeSkillUrlEditInput('', 'https://a.com')).toEqual({
                status: 'ok',
                url: '',
            })
            expect(normalizeSkillUrlEditInput('https://a.com', 'https://a.com')).toEqual({
                status: 'unchanged',
                url: 'https://a.com',
            })
            expect(normalizeSkillUrlEditInput('  https://b.com  ', '')).toEqual({
                status: 'ok',
                url: 'https://b.com',
            })
        })
    })

    describe('skillUrlPersistReminder', () => {
        it('mentions skills.json path and commit for Pages', () => {
            const msg = skillUrlPersistReminder({
                resumeId: 'shawn-becker-full-resume-indexed',
                skillSlug: 'cnn',
                url: 'https://en.wikipedia.org/wiki/Convolutional_neural_network',
            })
            expect(msg).toContain('cnn')
            expect(msg).toContain('shawn-becker-full-resume-indexed')
            expect(msg).toContain('skills.json')
            expect(msg).toMatch(/commit/i)
            expect(msg).toMatch(/GitHub Pages/i)
        })

        it('says cleared when url is blank', () => {
            const msg = skillUrlPersistReminder({
                resumeId: 'r1',
                skillSlug: 'cnn',
                url: '',
            })
            expect(msg).toMatch(/cleared/i)
        })

        it('falls back when ids are missing', () => {
            const msg = skillUrlPersistReminder({ resumeId: '', skillSlug: '', url: 'https://x.com' })
            expect(msg).toContain('(resume)')
            expect(msg).toContain('(skill)')
            expect(msg).toMatch(/updated/i)
        })
    })
})
