/**
 * Browser side of the shared skill URL catalog.
 * Static mode edits land here even when Express is absent.
 * When /api/skill-urls (or VITE_SKILL_URL_SYNC_URL) answers, every resume-flyer
 * app sharing that file or endpoint picks up the change.
 */
import { reportError } from './errorReporting.mjs'
import {
    catalogsEqual,
    catalogUrlFor,
    mergeCatalogs,
    normalizeCatalog,
    upsertEntry,
} from './skillUrlCatalog.mjs'

const LOCAL_KEY = 'resume-flyer/skill-urls'
const API_POLL_MS = 3000
const STATIC_POLL_MS = 15000

let catalog = { entries: {} }
let active = false
let pollTimer = null
let apiUnavailable = false
let apiRetryAfter = 0
let reportedApiFailure = false
let reportedStaticFailure = false
let lastStaticPollAt = 0

export function isSkillUrlSyncActive() {
    return active
}

export function getSkillUrlCatalog() {
    return catalog
}

function runtimeBase() {
    const envBase = (import.meta?.env?.BASE_URL || '/')
    let base = envBase
    if (typeof window !== 'undefined') {
        const path = window.location?.pathname || '/'
        const parts = path.split('/').filter(Boolean)
        const useSubpath = parts.length > 0 && (envBase === '/' || !path.startsWith(envBase))
        if (useSubpath) base = `/${parts[0]}/`
    }
    return base.endsWith('/') ? base : `${base}/`
}

function joinBase(relPath) {
    const b = runtimeBase()
    const p = relPath.startsWith('/') ? relPath.slice(1) : relPath
    return `${b}${p}`
}

function syncEndpoint() {
    const configured = String(import.meta?.env?.VITE_SKILL_URL_SYNC_URL || '').trim()
    if (configured) return configured
    return joinBase('api/skill-urls')
}

function staticCatalogUrl() {
    return joinBase('parsed_resumes/skill-urls.json')
}

function browserStorage() {
    try {
        if (typeof localStorage === 'undefined' || typeof localStorage.getItem !== 'function' || typeof localStorage.setItem !== 'function') {
            return null
        }
        return localStorage
    } catch {
        return null
    }
}

export function readLocalSkillUrlCatalog() {
    const storage = browserStorage()
    if (!storage) return { entries: {} }
    try {
        const raw = storage.getItem(LOCAL_KEY)
        if (!raw) return { entries: {} }
        return normalizeCatalog(JSON.parse(raw))
    } catch (error) {
        reportError(error, '[skillUrlSync] Failed to read local skill URL catalog', 'Starting from an empty browser catalog')
        return { entries: {} }
    }
}

function persistLocal(next) {
    const storage = browserStorage()
    if (!storage) return
    const serialized = JSON.stringify(next)
    if (storage.getItem(LOCAL_KEY) === serialized) return
    storage.setItem(LOCAL_KEY, serialized)
}

/**
 * @param {unknown} next
 * @param {{ persist?: boolean }} [opts]
 */
export function replaceSkillUrlCatalog(next, { persist = true } = {}) {
    const normalized = normalizeCatalog(next)
    const changed = !catalogsEqual(catalog, normalized)
    catalog = normalized
    if (persist) persistLocal(catalog)
    if (changed && typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new CustomEvent('skill-urls-changed', { detail: { catalog } }))
    }
    return { catalog, changed }
}

/**
 * Stored override when the catalog has this slug, otherwise the resume skills.json url.
 * @param {string} slug
 * @param {Record<string, { url?: string }> | null | undefined} skillsData
 * @returns {string}
 */
export function effectiveStoredSkillUrl(slug, skillsData) {
    const override = catalogUrlFor(catalog, slug)
    if (override !== undefined) return override
    return String(skillsData?.[slug]?.url ?? '').trim()
}

function markApiDown() {
    apiUnavailable = true
    apiRetryAfter = Date.now() + STATIC_POLL_MS
}

async function fetchRemoteCatalog(forceStatic) {
    const tryApi = !forceStatic && (!apiUnavailable || Date.now() >= apiRetryAfter)
    if (tryApi) {
        try {
            const res = await fetch(syncEndpoint(), { cache: 'no-store' })
            if (res.ok) {
                apiUnavailable = false
                apiRetryAfter = 0
                return normalizeCatalog(await res.json())
            }
            if (res.status === 404 || res.status === 405) {
                markApiDown()
            } else {
                throw new Error(`HTTP ${res.status}`)
            }
        } catch (error) {
            markApiDown()
            if (!reportedApiFailure) {
                reportedApiFailure = true
                reportError(
                    error,
                    '[skillUrlSync] Shared skill URL API unreachable',
                    'Using parsed_resumes/skill-urls.json and this browser'
                )
            }
        }
    }

    const now = Date.now()
    if (!forceStatic && now - lastStaticPollAt < STATIC_POLL_MS) {
        return null
    }
    lastStaticPollAt = now
    try {
        const res = await fetch(staticCatalogUrl(), { cache: 'no-store' })
        if (res.ok) return normalizeCatalog(await res.json())
    } catch (error) {
        if (!reportedStaticFailure) {
            reportedStaticFailure = true
            reportError(
                error,
                '[skillUrlSync] Static skill-urls.json unreachable',
                'Keeping the browser catalog'
            )
        }
    }
    return { entries: {} }
}

/**
 * Pull the shared catalog and merge it with this browser's copy.
 * @param {{ forceStatic?: boolean }} [opts]
 */
export async function refreshSkillUrlCatalog({ forceStatic = false } = {}) {
    const local = readLocalSkillUrlCatalog()
    const remote = await fetchRemoteCatalog(forceStatic)
    const merged = remote ? mergeCatalogs(local, remote) : mergeCatalogs(local, catalog)
    return replaceSkillUrlCatalog(merged)
}

/**
 * Save one skill URL locally, then best-effort publish to the shared catalog.
 * Local save is the recovery when the sync API is down, including static hosts.
 * @param {string} key
 * @param {string} url
 * @returns {Promise<{ ok: true, key: string, url: string, synced: boolean, updatedAt: string }>}
 */
export async function publishSkillUrl(key, url) {
    const updatedAt = new Date().toISOString()
    const slug = String(key || '').trim()
    const next = upsertEntry(readLocalSkillUrlCatalog(), slug, url, updatedAt)
    replaceSkillUrlCatalog(next)
    const savedUrl = next.entries[slug]?.url ?? ''
    try {
        const res = await fetch(syncEndpoint(), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-store',
            body: JSON.stringify({ key: slug, url: savedUrl, updatedAt }),
        })
        if (!res.ok) {
            const err = await res.json().catch(() => ({}))
            throw new Error(err.error || `HTTP ${res.status}`)
        }
        const body = normalizeCatalog(await res.json())
        replaceSkillUrlCatalog(mergeCatalogs(next, body))
        apiUnavailable = false
        return { ok: true, key: slug, url: savedUrl, synced: true, updatedAt }
    } catch (error) {
        reportError(
            error,
            '[skillUrlSync] Failed to publish skill URL to the shared catalog',
            'Saved in this browser; other apps will sync when the skill URL API is reachable'
        )
        return { ok: true, key: slug, url: savedUrl, synced: false, updatedAt }
    }
}

function onStorage(event) {
    if (event.key !== LOCAL_KEY || !event.newValue) return
    try {
        const incoming = normalizeCatalog(JSON.parse(event.newValue))
        replaceSkillUrlCatalog(mergeCatalogs(catalog, incoming), { persist: false })
    } catch (error) {
        reportError(error, '[skillUrlSync] Failed to apply a skill URL update from another tab', 'Keeping this tab\'s catalog')
    }
}

function onFocus() {
    refreshSkillUrlCatalog().catch((error) => {
        reportError(error, '[skillUrlSync] Failed to refresh skill URLs on focus', 'Keeping the catalog already in memory')
    })
}

/**
 * Begin polling and same-origin storage sync. Safe to call once.
 * @returns {() => void} stop
 */
export function startSkillUrlSync() {
    if (active) return stopSkillUrlSync
    active = true
    catalog = readLocalSkillUrlCatalog()
    if (typeof window !== 'undefined') {
        window.addEventListener('storage', onStorage)
        window.addEventListener('focus', onFocus)
    }
    refreshSkillUrlCatalog().catch((error) => {
        reportError(error, '[skillUrlSync] Failed to load the shared skill URL catalog', 'Editing will keep URLs in this browser until refresh succeeds')
    })
    pollTimer = setInterval(() => {
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
        refreshSkillUrlCatalog().catch((error) => {
            reportError(error, '[skillUrlSync] Failed to poll the shared skill URL catalog', 'Will retry on the next poll')
        })
    }, API_POLL_MS)
    return stopSkillUrlSync
}

/** Test-only: drop in-memory sync state so cases do not leak. */
export function resetSkillUrlSyncForTests() {
    stopSkillUrlSync()
    catalog = { entries: {} }
    apiUnavailable = false
    apiRetryAfter = 0
    reportedApiFailure = false
    reportedStaticFailure = false
    lastStaticPollAt = 0
}

export function stopSkillUrlSync() {
    active = false
    if (pollTimer) {
        clearInterval(pollTimer)
        pollTimer = null
    }
    if (typeof window !== 'undefined') {
        window.removeEventListener('storage', onStorage)
        window.removeEventListener('focus', onFocus)
    }
}
