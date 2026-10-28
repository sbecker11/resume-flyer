/**
 * Helpers for resume-list skill URL editing.
 * Static mode can edit. URLs are shared across resume-flyer apps via the skill URL catalog
 * (see skillUrlSync.mjs), not stored only in one resume's skills.json.
 */
import { isAbsoluteHttpUrl } from './skillInfoModal.mjs'

/**
 * Pencil is available in static mode. With a backend, a saved resume must be selected
 * because the per-resume skills.json write still rejects the default resume.
 * @param {boolean} hasBackend
 * @param {string|null|undefined} resumeId
 * @returns {boolean}
 */
export function canEditSkillUrl(hasBackend, resumeId) {
    if (!hasBackend) return true
    return Boolean(resumeId) && resumeId !== 'default'
}

/**
 * Normalize prompt input for a skill info URL.
 * @param {string|null|undefined} next - prompt return value (null = cancelled)
 * @param {string} [current=''] - previously stored url
 * @returns {{ status: 'cancelled'|'unchanged'|'invalid'|'ok', url: string, message?: string }}
 */
export function normalizeSkillUrlEditInput(next, current = '') {
    if (next == null) return { status: 'cancelled', url: String(current ?? '').trim() }
    const trimmed = String(next).trim()
    const prev = String(current ?? '').trim()
    if (trimmed && !isAbsoluteHttpUrl(trimmed)) {
        return {
            status: 'invalid',
            url: prev,
            message: 'URL must be an absolute http(s) link, or blank to clear.',
        }
    }
    if (trimmed === prev) return { status: 'unchanged', url: prev }
    return { status: 'ok', url: trimmed }
}

/**
 * Reminder after a skill URL edit. Synced edits live in the shared catalog;
 * static hosts serve the mirrored parsed_resumes/skill-urls.json after it is committed.
 * @param {{ skillSlug: string, url: string, synced?: boolean }} opts
 * @returns {string}
 */
export function skillUrlPersistReminder({ skillSlug, url, synced = false }) {
    const slug = String(skillSlug || '').trim() || '(skill)'
    const cleared = !String(url || '').trim()
    const action = cleared ? 'cleared' : 'updated'
    if (synced) {
        return (
            `Skill URL ${action} for "${slug}". ` +
            `Shared with other resume-flyer apps. ` +
            `Commit parsed_resumes/skill-urls.json so GitHub Pages serves the change.`
        )
    }
    return (
        `Skill URL ${action} for "${slug}" in this browser. ` +
        `The shared catalog was unreachable, so other resume-flyer apps will not see it until the sync server is running.`
    )
}
