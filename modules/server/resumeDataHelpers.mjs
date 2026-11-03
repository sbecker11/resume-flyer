/**
 * Pure helpers shared by the resume API routes in server.mjs.
 * No filesystem, no Express: everything here takes data in and returns data out.
 */
import path from 'path';

/**
 * Convert a display name to a slug suitable for use as a folder name.
 * Lowercases, collapses non-alphanumeric runs to hyphens, trims leading/trailing hyphens.
 * @param {string} name
 * @returns {string} never empty; falls back to 'resume'
 */
export function slugifyDisplayName(name) {
    return String(name ?? '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        || 'resume';
}

/**
 * Absolute folder of jobs.json / skills.json for a resume id, attached to meta for API responses.
 * Not persisted in meta.json.
 * @param {string} parsedResumesDir
 * @param {string} id
 * @param {Record<string, unknown>} meta
 */
export function withDerivedMetaPaths(parsedResumesDir, id, meta) {
    return { ...meta, parsedFolderPath: path.join(parsedResumesDir, id) };
}

/**
 * Replace every [OldName] bracket reference in all job Descriptions with [NewName].
 * Called after a skill rename or merge so descriptions stay in sync with skills.json.
 * Mutates jobs in place; returns the number of jobs whose Description changed.
 *
 * @param {Array<object>|Record<string, object>} jobs
 * @param {string} oldName  - the old skill.name (text inside brackets to replace)
 * @param {string} newName  - the new skill.name (replacement text inside brackets)
 * @returns {number}
 */
export function replaceSkillNameInDescriptions(jobs, oldName, newName) {
    if (!oldName || !newName || oldName === newName) return 0;
    const jobsArr = Array.isArray(jobs) ? jobs : Object.values(jobs);
    const escaped = oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\[${escaped}\\]`, 'g');
    let count = 0;
    for (const job of jobsArr) {
        if (!job || !job.Description) continue;
        const before = job.Description;
        job.Description = job.Description.replace(regex, `[${newName}]`);
        if (job.Description !== before) count++;
    }
    return count;
}

/** Shift skill.jobIDs at/after insert so indices stay aligned with jobs.json (0-based). */
export function reindexSkillJobIdsAfterJobInsert(skills, insertAt) {
    const at = Number(insertAt);
    if (!Number.isFinite(at) || at < 0) return;
    for (const s of Object.values(skills)) {
        if (!s || typeof s !== 'object' || !Array.isArray(s.jobIDs)) continue;
        const next = s.jobIDs.map((j) => {
            const n = Number(j);
            return Number.isFinite(n) && n >= at ? n + 1 : n;
        });
        s.jobIDs = [...new Set(next)].sort((a, b) => a - b);
    }
}

/** Remove deleted job index from skill.jobIDs and decrement higher indices. */
export function reindexSkillJobIdsAfterJobDelete(skills, deletedIndex) {
    const d = Number(deletedIndex);
    if (!Number.isFinite(d) || d < 0) return;
    for (const s of Object.values(skills)) {
        if (!s || typeof s !== 'object' || !Array.isArray(s.jobIDs)) continue;
        const next = s.jobIDs
            .map((j) => Number(j))
            .filter((n) => Number.isFinite(n) && n !== d)
            .map((n) => (n > d ? n - 1 : n));
        s.jobIDs = [...new Set(next)].sort((a, b) => a - b);
    }
}

/**
 * Resolve a skill key that may be either the map key or the display name.
 * @param {Record<string, { name?: unknown } | null>} skills
 * @param {string} keyOrName
 * @returns {string|null} the map key, or null when nothing matches
 */
export function resolveSkillKey(skills, keyOrName) {
    if (skills[keyOrName] != null) return keyOrName;
    const want = (keyOrName && String(keyOrName).trim()) || '';
    if (!want) return null;
    for (const [k, s] of Object.entries(skills)) {
        if (s && typeof s === 'object' && s.name != null && String(s.name).trim() === want) return k;
    }
    return null;
}
