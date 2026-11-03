import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    effectiveStoredSkillUrl,
    getSkillUrlCatalog,
    isSkillUrlSyncActive,
    publishSkillUrl,
    readLocalSkillUrlCatalog,
    refreshSkillUrlCatalog,
    replaceSkillUrlCatalog,
    resetSkillUrlSyncForTests,
    startSkillUrlSync,
    stopSkillUrlSync,
} from './skillUrlSync.mjs'

const LOCAL_KEY = 'resume-flyer/skill-urls'

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

function okJson(body) {
    return { ok: true, status: 200, json: async () => body }
}

function notFound() {
    return { ok: false, status: 404, json: async () => ({}) }
}

function catalogWith(slug, url, updatedAt = '2024-01-01T00:00:00.000Z') {
    return { entries: { [slug]: { url, updatedAt } } }
}

describe('skillUrlSync', () => {
    beforeEach(() => {
        installLocalStorageMock()
        resetSkillUrlSyncForTests()
        vi.spyOn(console, 'error').mockImplementation(() => {})
        vi.spyOn(console, 'log').mockImplementation(() => {})
    })

    afterEach(() => {
        resetSkillUrlSyncForTests()
        localStorage.clear()
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
        vi.useRealTimers()
    })

    describe('publishSkillUrl', () => {
        it('keeps a static-mode edit when the sync API is down', async () => {
            vi.stubGlobal('fetch', vi.fn(async () => notFound()))
            const saved = await publishSkillUrl('cnn', 'https://example.com/cnn')
            expect(saved.synced).toBe(false)
            expect(saved.url).toBe('https://example.com/cnn')
            expect(effectiveStoredSkillUrl('cnn', { cnn: { url: '' } })).toBe('https://example.com/cnn')
        })

        it('publishes to the API and merges the returned catalog', async () => {
            const fetchMock = vi.fn(async () => okJson({
                entries: {
                    cnn: { url: 'https://example.com/cnn', updatedAt: '2030-01-01T00:00:00.000Z' },
                    other: { url: 'https://example.com/other', updatedAt: '2024-01-01T00:00:00.000Z' },
                },
            }))
            vi.stubGlobal('fetch', fetchMock)
            const saved = await publishSkillUrl('cnn', 'https://example.com/cnn')
            expect(saved.synced).toBe(true)
            expect(fetchMock).toHaveBeenCalledTimes(1)
            const [url, init] = fetchMock.mock.calls[0]
            expect(String(url)).toMatch(/api\/skill-urls$/)
            expect(init.method).toBe('PUT')
            expect(JSON.parse(init.body)).toMatchObject({ key: 'cnn', url: 'https://example.com/cnn' })
            expect(effectiveStoredSkillUrl('other', {})).toBe('https://example.com/other')
            expect(JSON.parse(localStorage.getItem(LOCAL_KEY)).entries.other).toBeTruthy()
        })

        it('reports the server error body and keeps the local save when the PUT fails', async () => {
            vi.stubGlobal('fetch', vi.fn(async () => ({
                ok: false,
                status: 400,
                json: async () => ({ error: 'url must be an absolute http(s) URL.' }),
            })))
            const saved = await publishSkillUrl('cnn', 'https://example.com/cnn')
            expect(saved.synced).toBe(false)
            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining('[skillUrlSync] Failed to publish skill URL'),
                expect.any(Error),
            )
            expect(console.log).toHaveBeenCalledWith(expect.stringMatching(/^Remedy: Saved in this browser/))
        })
    })

    describe('refreshSkillUrlCatalog', () => {
        it('merges a newer remote catalog over this browser', async () => {
            localStorage.setItem(LOCAL_KEY, JSON.stringify(catalogWith('cnn', 'https://old.example', '2020-01-01T00:00:00.000Z')))
            vi.stubGlobal('fetch', vi.fn(async (url) => {
                if (String(url).includes('/api/skill-urls')) {
                    return okJson(catalogWith('cnn', 'https://new.example', '2024-05-01T00:00:00.000Z'))
                }
                return notFound()
            }))
            await refreshSkillUrlCatalog()
            expect(effectiveStoredSkillUrl('cnn', {})).toBe('https://new.example')
        })

        it('falls back to parsed_resumes/skill-urls.json when the API is absent', async () => {
            const fetchMock = vi.fn(async (url) => {
                if (String(url).includes('/api/skill-urls')) return notFound()
                if (String(url).includes('parsed_resumes/skill-urls.json')) {
                    return okJson(catalogWith('lcel', 'https://static.example/lcel'))
                }
                throw new Error(`unexpected fetch ${url}`)
            })
            vi.stubGlobal('fetch', fetchMock)
            const { changed } = await refreshSkillUrlCatalog()
            expect(changed).toBe(true)
            expect(effectiveStoredSkillUrl('lcel', {})).toBe('https://static.example/lcel')
            // The API 404 is a normal static-host condition, not an error.
            expect(console.error).not.toHaveBeenCalled()
        })

        it('reports an API error once and throttles static re-reads', async () => {
            const fetchMock = vi.fn(async (url) => {
                if (String(url).includes('/api/skill-urls')) return { ok: false, status: 500, json: async () => ({}) }
                return okJson(catalogWith('cnn', 'https://static.example/cnn'))
            })
            vi.stubGlobal('fetch', fetchMock)

            await refreshSkillUrlCatalog()
            expect(effectiveStoredSkillUrl('cnn', {})).toBe('https://static.example/cnn')
            const errorsAfterFirst = console.error.mock.calls.filter(([msg]) => String(msg).includes('API unreachable')).length
            expect(errorsAfterFirst).toBe(1)

            // API is marked down and the static file was just read: this refresh fetches nothing.
            const callsBefore = fetchMock.mock.calls.length
            const second = await refreshSkillUrlCatalog()
            expect(fetchMock.mock.calls.length).toBe(callsBefore)
            expect(second.changed).toBe(false)
            expect(effectiveStoredSkillUrl('cnn', {})).toBe('https://static.example/cnn')
        })

        it('reads the static file on demand with forceStatic', async () => {
            const fetchMock = vi.fn(async () => okJson(catalogWith('cnn', 'https://static.example/cnn')))
            vi.stubGlobal('fetch', fetchMock)
            await refreshSkillUrlCatalog({ forceStatic: true })
            expect(fetchMock).toHaveBeenCalledTimes(1)
            expect(String(fetchMock.mock.calls[0][0])).toMatch(/parsed_resumes\/skill-urls\.json$/)
            expect(effectiveStoredSkillUrl('cnn', {})).toBe('https://static.example/cnn')
        })

        it('keeps the browser catalog and reports once when the static file is unreachable', async () => {
            localStorage.setItem(LOCAL_KEY, JSON.stringify(catalogWith('cnn', 'https://browser.example/cnn')))
            vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network down') }))
            await refreshSkillUrlCatalog({ forceStatic: true })
            expect(effectiveStoredSkillUrl('cnn', {})).toBe('https://browser.example/cnn')
            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining('[skillUrlSync] Static skill-urls.json unreachable'),
                expect.any(Error),
            )
            const before = console.error.mock.calls.length
            await refreshSkillUrlCatalog({ forceStatic: true })
            expect(console.error.mock.calls.length).toBe(before)
        })
    })

    describe('local catalog', () => {
        it('exposes the in-memory catalog and falls back to skills.json urls', () => {
            replaceSkillUrlCatalog(catalogWith('cnn', 'https://override.example'))
            expect(getSkillUrlCatalog().entries.cnn.url).toBe('https://override.example')
            expect(effectiveStoredSkillUrl('cnn', { cnn: { url: 'https://stored.example' } })).toBe('https://override.example')
            expect(effectiveStoredSkillUrl('rnn', { rnn: { url: ' https://stored.example/rnn ' } })).toBe('https://stored.example/rnn')
            expect(effectiveStoredSkillUrl('missing', null)).toBe('')
        })

        it('dispatches skill-urls-changed only when the catalog actually changes', () => {
            const listener = vi.fn()
            window.addEventListener('skill-urls-changed', listener)
            try {
                const first = replaceSkillUrlCatalog(catalogWith('cnn', 'https://a.example'))
                const again = replaceSkillUrlCatalog(catalogWith('cnn', 'https://a.example'))
                expect(first.changed).toBe(true)
                expect(again.changed).toBe(false)
                expect(listener).toHaveBeenCalledTimes(1)
                expect(listener.mock.calls[0][0].detail.catalog.entries.cnn.url).toBe('https://a.example')
            } finally {
                window.removeEventListener('skill-urls-changed', listener)
            }
        })

        it('starts from an empty catalog and reports when the stored copy is corrupt', () => {
            localStorage.setItem(LOCAL_KEY, '{not json')
            expect(readLocalSkillUrlCatalog()).toEqual({ entries: {} })
            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining('[skillUrlSync] Failed to read local skill URL catalog'),
                expect.any(Error),
            )
            expect(console.log).toHaveBeenCalledWith('Remedy: Starting from an empty browser catalog')
        })

        it('works without localStorage', () => {
            Object.defineProperty(globalThis, 'localStorage', { value: undefined, configurable: true, writable: true })
            Object.defineProperty(window, 'localStorage', { value: undefined, configurable: true, writable: true })
            try {
                expect(readLocalSkillUrlCatalog()).toEqual({ entries: {} })
                expect(() => replaceSkillUrlCatalog(catalogWith('cnn', 'https://a.example'))).not.toThrow()
            } finally {
                installLocalStorageMock()
            }
        })

        it('works when touching localStorage throws', () => {
            const denied = { configurable: true, get() { throw new Error('denied') } }
            Object.defineProperty(globalThis, 'localStorage', denied)
            Object.defineProperty(window, 'localStorage', denied)
            try {
                expect(readLocalSkillUrlCatalog()).toEqual({ entries: {} })
            } finally {
                installLocalStorageMock()
            }
        })
    })

    describe('startSkillUrlSync', () => {
        it('loads once, polls while visible, and stops cleanly', async () => {
            vi.useFakeTimers()
            const fetchMock = vi.fn(async (url) => {
                if (String(url).includes('/api/skill-urls')) return okJson(catalogWith('cnn', 'https://api.example/cnn'))
                return notFound()
            })
            vi.stubGlobal('fetch', fetchMock)

            const stop = startSkillUrlSync()
            expect(isSkillUrlSyncActive()).toBe(true)
            expect(startSkillUrlSync()).toBe(stop)
            await vi.advanceTimersByTimeAsync(0)
            expect(effectiveStoredSkillUrl('cnn', {})).toBe('https://api.example/cnn')
            const afterInitial = fetchMock.mock.calls.length

            await vi.advanceTimersByTimeAsync(3000)
            expect(fetchMock.mock.calls.length).toBeGreaterThan(afterInitial)

            const afterPoll = fetchMock.mock.calls.length
            Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
            await vi.advanceTimersByTimeAsync(3000)
            expect(fetchMock.mock.calls.length).toBe(afterPoll)
            Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })

            stop()
            expect(isSkillUrlSyncActive()).toBe(false)
            await vi.advanceTimersByTimeAsync(10_000)
            expect(fetchMock.mock.calls.length).toBe(afterPoll)
            stopSkillUrlSync()
        })

        it('applies catalog updates from another tab without re-persisting them', async () => {
            vi.stubGlobal('fetch', vi.fn(async () => notFound()))
            startSkillUrlSync()
            const setItem = vi.spyOn(localStorage, 'setItem')
            window.dispatchEvent(new StorageEvent('storage', {
                key: LOCAL_KEY,
                newValue: JSON.stringify(catalogWith('rnn', 'https://tab.example/rnn', '2030-01-01T00:00:00.000Z')),
            }))
            expect(effectiveStoredSkillUrl('rnn', {})).toBe('https://tab.example/rnn')
            expect(setItem).not.toHaveBeenCalled()

            window.dispatchEvent(new StorageEvent('storage', { key: 'unrelated', newValue: '{}' }))
            window.dispatchEvent(new StorageEvent('storage', { key: LOCAL_KEY, newValue: '{bad' }))
            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining('[skillUrlSync] Failed to apply a skill URL update from another tab'),
                expect.any(Error),
            )
            expect(effectiveStoredSkillUrl('rnn', {})).toBe('https://tab.example/rnn')
        })

        it('refreshes on window focus', async () => {
            const fetchMock = vi.fn(async (url) => {
                if (String(url).includes('/api/skill-urls')) return okJson(catalogWith('cnn', 'https://api.example/cnn'))
                return notFound()
            })
            vi.stubGlobal('fetch', fetchMock)
            startSkillUrlSync()
            await Promise.resolve()
            const before = fetchMock.mock.calls.length
            window.dispatchEvent(new Event('focus'))
            await vi.waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(before))
        })
    })
})
