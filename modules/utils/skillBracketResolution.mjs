/**
 * Find unresolved [Skill] brackets in job/education description text.
 * Content-index tags like [1.1.3] are ignored (job outline identity, not skills).
 */
import { labelToSlug } from './skillLabel.mjs'
import { parseOutlineIndex } from './outlineIndex.mjs'

const BRACKET_RE = /\[([^\]]+)\]/g

/**
 * @param {string} text
 * @param {Record<string, { name?: string }>} skillsData
 * @returns {string[]} unresolved labels (unique, insertion order)
 */
export function findUnresolvedBracketLabels(text, skillsData) {
    const unresolved = []
    const seen = new Set()
    if (!text) return unresolved
    BRACKET_RE.lastIndex = 0
    let match
    while ((match = BRACKET_RE.exec(String(text))) !== null) {
        const label = String(match[1] || '').trim()
        if (!label) continue
        if (parseOutlineIndex(label)) continue
        if (labelToSlug(label, skillsData)) continue
        const key = label.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        unresolved.push(label)
    }
    return unresolved
}

/**
 * @param {Iterable<object>} jobs - job-shaped rows (work + education)
 * @param {Record<string, { name?: string }>} skillsData
 * @returns {{ jobIndex: number, employer?: string, labels: string[] }[]}
 */
export function findUnresolvedBracketsInJobs(jobs, skillsData) {
    const out = []
    let i = 0
    for (const job of jobs || []) {
        const description = job?.Description || job?.description || ''
        const labels = findUnresolvedBracketLabels(description, skillsData)
        if (labels.length) {
            out.push({
                jobIndex: i,
                employer: job?.employer || job?.institution || '',
                labels,
            })
        }
        i += 1
    }
    return out
}
