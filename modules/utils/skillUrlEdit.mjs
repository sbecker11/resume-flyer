/**
 * Helpers for resume-list skill URL editing (local Express only).
 * Custom urls live in parsed_resumes/<id>/skills.json and must be committed for GitHub Pages.
 */
import { isAbsoluteHttpUrl } from './skillInfoModal.mjs'

/**
 * Pencil / persist only when a backend is available and a non-default resume is selected.
 * @param {boolean} hasBackend
 * @param {string|null|undefined} resumeId
 * @returns {boolean}
 */
export function canEditSkillUrl(hasBackend, resumeId) {
    return Boolean(hasBackend) && Boolean(resumeId) && resumeId !== 'default'
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
 * Reminder after a successful local skills.json URL write — Pages only sees committed files.
 * @param {{ resumeId: string, skillSlug: string, url: string }} opts
 * @returns {string}
 */
export function skillUrlPersistReminder({ resumeId, skillSlug, url }) {
    const id = String(resumeId || '').trim() || '(resume)'
    const slug = String(skillSlug || '').trim() || '(skill)'
    const cleared = !String(url || '').trim()
    const action = cleared ? 'cleared' : 'updated'
    return (
        `Skill URL ${action} for "${slug}" in resume "${id}". ` +
        `Saved to parsed_resumes/${id}/skills.json — commit and push that file so GitHub Pages serves the change.`
    )
}
