import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    effectiveStoredSkillUrl,
    publishSkillUrl,
    refreshSkillUrlCatalog,
    resetSkillUrlSyncForTests,
} from './skillUrlSync.mjs'

function installLocalStorageMock() {
    const store = {}
    const mock = {
        getItem: (key) => (Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null),
        setItem: (key, value) => { store[key] = String(value) },
        removeItem: (key) => { delete store[key] },
        clear: () => { Object.keys(store).forEach((key) => delete store[key]) },
    }
    Object.defineProperty(globalThis, 'localStorage', { value: mock, configurable: true, writable: true })
    if (typeof window !== 'undefined') {
        Object.defineProperty(window, 'localStorage', { value: mock, configurable: true, writable: true })
    }
    return mock
}

describe('skillUrlSync', () => {
    beforeEach(() => {
        installLocalStorageMock()
        resetSkillUrlSyncForTests()
        vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
        resetSkillUrlSyncForTests()
        localStorage.clear()
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
    })

    it('keeps a static-mode edit when the sync API is down', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })))
        const saved = await publishSkillUrl('cnn', 'https://example.com/cnn')
        expect(saved.synced).toBe(false)
        expect(saved.url).toBe('https://example.com/cnn')
        expect(effectiveStoredSkillUrl('cnn', { cnn: { url: '' } })).toBe('https://example.com/cnn')
    })

    it('merges a newer remote catalog over this browser', async () => {
        localStorage.setItem('resume-flyer/skill-urls', JSON.stringify({
            entries: { cnn: { url: 'https://old.example', updatedAt: '2020-01-01T00:00:00.000Z' } },
        }))
        vi.stubGlobal('fetch', vi.fn(async (url) => {
            if (String(url).includes('/api/skill-urls')) {
                return {
                    ok: true,
                    json: async () => ({
                        entries: { cnn: { url: 'https://new.example', updatedAt: '2024-05-01T00:00:00.000Z' } },
                    }),
                }
            }
            return { ok: false, status: 404, json: async () => ({}) }
        }))
        await refreshSkillUrlCatalog()
        expect(effectiveStoredSkillUrl('cnn', {})).toBe('https://new.example')
    })
})
