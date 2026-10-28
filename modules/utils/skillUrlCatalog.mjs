/**
 * Shared skill-info URL catalog.
 * Keyed by skill slug, independent of which resume or which resume-flyer app edited it.
 * Shape: { entries: { [slug]: { url: string, updatedAt: string } } }
 * A present entry wins over skills.json, including url: '' (clear back to the Wikipedia fallback).
 */

/**
 * @param {unknown} url
 * @returns {string} trimmed url, or '' when cleared
 */
export function assertSkillInfoUrl(url) {
    const trimmed = url == null ? '' : String(url).trim()
    if (!trimmed) return ''
    let parsed
    try {
        parsed = new URL(trimmed)
    } catch {
        throw new Error('url must be an absolute http(s) URL.')
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('url must be an absolute http(s) URL.')
    }
    return trimmed
}

/**
 * @param {unknown} raw
 * @returns {{ entries: Record<string, { url: string, updatedAt: string }> }}
 */
export function normalizeCatalog(raw) {
    const entries = {}
    const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw.entries : null
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
        return { entries }
    }
    for (const [key, value] of Object.entries(source)) {
        const slug = String(key || '').trim()
        if (!slug || !value || typeof value !== 'object' || Array.isArray(value)) continue
        entries[slug] = {
            url: String(value.url ?? '').trim(),
            updatedAt: String(value.updatedAt ?? ''),
        }
    }
    return { entries }
}

/**
 * @param {{ updatedAt?: string } | null | undefined} entry
 * @returns {number}
 */
export function entryTime(entry) {
    const t = Date.parse(entry?.updatedAt || '')
    return Number.isFinite(t) ? t : 0
}

/**
 * Per-slug last-write-wins. A missing updatedAt loses to any real timestamp.
 * @param {unknown} a
 * @param {unknown} b
 */
export function mergeCatalogs(a, b) {
    const left = normalizeCatalog(a).entries
    const right = normalizeCatalog(b).entries
    const keys = new Set([...Object.keys(left), ...Object.keys(right)])
    const entries = {}
    for (const key of keys) {
        const le = left[key]
        const re = right[key]
        if (!le) entries[key] = re
        else if (!re) entries[key] = le
        else entries[key] = entryTime(re) >= entryTime(le) ? re : le
    }
    return { entries }
}

/**
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
export function catalogsEqual(a, b) {
    const left = normalizeCatalog(a).entries
    const right = normalizeCatalog(b).entries
    const keys = new Set([...Object.keys(left), ...Object.keys(right)])
    for (const key of keys) {
        if (!left[key] || !right[key]) return false
        if (left[key].url !== right[key].url) return false
        if (left[key].updatedAt !== right[key].updatedAt) return false
    }
    return true
}

/**
 * Insert or replace one slug. An older updatedAt does not clobber a newer entry.
 * @param {unknown} catalog
 * @param {string} key
 * @param {string} url
 * @param {string} [updatedAt]
 */
export function upsertEntry(catalog, key, url, updatedAt) {
    const slug = String(key || '').trim()
    if (!slug) throw new Error('Missing skill key')
    const next = {
        url: assertSkillInfoUrl(url),
        updatedAt: updatedAt || new Date().toISOString(),
    }
    const base = normalizeCatalog(catalog)
    const prev = base.entries[slug]
    if (prev && entryTime(prev) > entryTime(next)) {
        return base
    }
    return { entries: { ...base.entries, [slug]: next } }
}

/**
 * @param {unknown} catalog
 * @param {string} slug
 * @returns {string | undefined} undefined when this catalog has no override
 */
export function catalogUrlFor(catalog, slug) {
    const entry = normalizeCatalog(catalog).entries[String(slug || '').trim()]
    if (!entry) return undefined
    return entry.url
}

function absoluteHttpUrl(value) {
    const trimmed = String(value ?? '').trim()
    if (!trimmed) return ''
    try {
        const parsed = new URL(trimmed)
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return ''
        return trimmed
    } catch {
        return ''
    }
}

/**
 * URL to show for a skill the user has given a link.
 * The skill's own stored url wins. A shared-catalog entry is only the fallback when
 * the skill has no url, because older catalog rows (often keyed by display name)
 * still hold stale pasted links that must not replace the skill URL.
 * @param {unknown} catalog
 * @param {string} slug
 * @param {string} [displayName]
 * @param {string} [storedUrl]
 * @returns {string}
 */
export function userDefinedSkillUrl(catalog, slug, displayName, storedUrl = '') {
    const stored = absoluteHttpUrl(storedUrl)
    if (stored) return stored
    const entries = normalizeCatalog(catalog).entries
    const keys = []
    const slugKey = String(slug || '').trim()
    const nameKey = String(displayName || '').trim()
    if (slugKey) keys.push(slugKey)
    if (nameKey && nameKey.toLowerCase() !== slugKey.toLowerCase()) keys.push(nameKey)
    const wanted = new Set(keys.map((key) => key.toLowerCase()))
    let newestUrl = ''
    let newestAt = -1
    for (const [key, entry] of Object.entries(entries)) {
        if (!wanted.has(key.toLowerCase())) continue
        const url = absoluteHttpUrl(entry?.url)
        if (!url) continue
        const at = entryTime(entry)
        if (at >= newestAt) {
            newestAt = at
            newestUrl = url
        }
    }
    return newestUrl
}

/**
 * Overlay catalog urls onto skills that already exist. Does not invent skills.
 * @param {Record<string, { url?: string }> | null | undefined} skills
 * @param {unknown} catalog
 * @returns {{ skills: Record<string, { url?: string }>, changed: boolean }}
 */
export function applyCatalogToSkills(skills, catalog) {
    const base = skills && typeof skills === 'object' ? skills : {}
    const entries = normalizeCatalog(catalog).entries
    let changed = false
    const next = { ...base }
    for (const [slug, entry] of Object.entries(entries)) {
        const existing = next[slug]
        if (!existing || typeof existing !== 'object') continue
        if (String(existing.url ?? '') === entry.url) continue
        next[slug] = { ...existing, url: entry.url }
        changed = true
    }
    return { skills: changed ? next : base, changed }
}
