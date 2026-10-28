import { describe, it, expect } from 'vitest'
import {
    canEditSkillUrl,
    normalizeSkillUrlEditInput,
    skillUrlPersistReminder,
} from './skillUrlEdit.mjs'

describe('skillUrlEdit', () => {
    describe('canEditSkillUrl', () => {
        it('allows static mode and still requires a saved resume when a backend is present', () => {
            expect(canEditSkillUrl(false, 'shawn-becker-full-resume-indexed')).toBe(true)
            expect(canEditSkillUrl(false, 'default')).toBe(true)
            expect(canEditSkillUrl(false, null)).toBe(true)
            expect(canEditSkillUrl(true, 'shawn-becker-full-resume-indexed')).toBe(true)
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
        it('mentions the shared catalog and commit for Pages when synced', () => {
            const msg = skillUrlPersistReminder({
                skillSlug: 'cnn',
                url: 'https://en.wikipedia.org/wiki/Convolutional_neural_network',
                synced: true,
            })
            expect(msg).toContain('cnn')
            expect(msg).toContain('skill-urls.json')
            expect(msg).toMatch(/commit/i)
            expect(msg).toMatch(/GitHub Pages/i)
            expect(msg).toMatch(/other resume-flyer apps/i)
        })

        it('says the browser copy is local when the sync API was unreachable', () => {
            const msg = skillUrlPersistReminder({
                skillSlug: 'cnn',
                url: 'https://example.com/cnn',
                synced: false,
            })
            expect(msg).toMatch(/this browser/i)
            expect(msg).toMatch(/unreachable/i)
        })

        it('says cleared when url is blank', () => {
            const msg = skillUrlPersistReminder({
                skillSlug: 'cnn',
                url: '',
                synced: true,
            })
            expect(msg).toMatch(/cleared/i)
        })

        it('falls back when the slug is missing', () => {
            const msg = skillUrlPersistReminder({ skillSlug: '', url: 'https://x.com', synced: true })
            expect(msg).toContain('(skill)')
            expect(msg).toMatch(/updated/i)
        })
    })
})
