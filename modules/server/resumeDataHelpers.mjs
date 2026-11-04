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
    const jobsArr = recordList(jobs);
    const escaped = oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\[${escaped}\\]`, 'g');
    let count = 0;
    for (const job of jobsArr) {
        if (!job || typeof job !== 'object') continue;
        let changed = false;
        for (const field of ['Description', 'description']) {
            if (typeof job[field] !== 'string' || !job[field]) continue;
            const before = job[field];
            job[field] = before.replace(regex, `[${newName}]`);
            if (job[field] !== before) changed = true;
        }
        if (changed) count++;
    }
    return count;
}

/** Jobs, education entries, or categories may be stored as an array or an id-keyed object. */
function recordList(records) {
    if (Array.isArray(records)) return records;
    if (records && typeof records === 'object') return Object.values(records);
    return [];
}

function normalizeSkillId(value) {
    return value == null ? '' : String(value).trim().toLowerCase();
}

/**
 * Identifiers under which one skill may appear in a skillIDs list: its map key, the key
 * the caller sent, and its display name (jobs.json has historically mixed all three).
 * Compared trimmed and case-insensitively.
 * @param {...unknown} ids
 * @returns {Set<string>}
 */
export function skillAliasSet(...ids) {
    const out = new Set();
    for (const id of ids) {
        const n = normalizeSkillId(id);
        if (n) out.add(n);
    }
    return out;
}

function toAliasSet(aliases) {
    if (aliases instanceof Set) return aliases;
    return skillAliasSet(...(Array.isArray(aliases) ? aliases : [aliases]));
}

/**
 * Rewrite a skillIDs list: every id matching `aliases` becomes `toKey` (dropped when toKey
 * is empty); duplicates are then removed keeping the first occurrence. A list with no match
 * is returned as is.
 * @param {unknown[]} ids
 * @param {Set<string>} aliases - from skillAliasSet
 * @param {string} toKey
 * @returns {{ ids: unknown[], changed: boolean }}
 */
function rewriteSkillIdList(ids, aliases, toKey) {
    if (!ids.some((sid) => aliases.has(normalizeSkillId(sid)))) return { ids, changed: false };
    const out = [];
    const seen = new Set();
    for (const sid of ids) {
        const use = aliases.has(normalizeSkillId(sid)) ? toKey : sid;
        if (use == null || use === '' || seen.has(use)) continue;
        seen.add(use);
        out.push(use);
    }
    return { ids: out, changed: true };
}

/**
 * Point every skillIDs reference matching `aliases` at `toKey` across jobs or education
 * entries (array or id-keyed object). Mutates in place.
 * @param {Array<object>|Record<string, object>|null|undefined} records
 * @param {Set<string>|string[]|string} aliases - ids of the retired skill (see skillAliasSet)
 * @param {string} toKey - surviving skill key
 * @returns {number} records whose skillIDs changed
 */
export function rewriteSkillIdInRecords(records, aliases, toKey) {
    const set = toAliasSet(aliases);
    let count = 0;
    for (const record of recordList(records)) {
        if (!record || typeof record !== 'object' || !Array.isArray(record.skillIDs)) continue;
        const { ids, changed } = rewriteSkillIdList(record.skillIDs, set, toKey);
        if (!changed) continue;
        record.skillIDs = ids;
        count++;
    }
    return count;
}

/**
 * Replace a retired skill key with its survivor in every category list of categories.json.
 * Each category is `{ name, skillIDs: [...] }` (a bare array is accepted too). The survivor
 * takes the retired key's slot, order is preserved, duplicates are dropped. When `toKey` is
 * empty the retired key is removed. Mutates in place.
 * @param {Record<string, { skillIDs?: unknown[] } | unknown[]>|null|undefined} categories
 * @param {Set<string>|string[]|string} fromKey - retired key or its alias set
 * @param {string} toKey
 * @returns {number} categories whose list changed
 */
export function replaceSkillKeyInCategories(categories, fromKey, toKey) {
    const aliases = toAliasSet(fromKey);
    let count = 0;
    for (const [catKey, category] of Object.entries(categories && typeof categories === 'object' ? categories : {})) {
        if (Array.isArray(category)) {
            const { ids, changed } = rewriteSkillIdList(category, aliases, toKey);
            if (!changed) continue;
            categories[catKey] = ids;
            count++;
            continue;
        }
        if (!category || typeof category !== 'object' || !Array.isArray(category.skillIDs)) continue;
        const { ids, changed } = rewriteSkillIdList(category.skillIDs, aliases, toKey);
        if (!changed) continue;
        category.skillIDs = ids;
        count++;
    }
    return count;
}

/**
 * Positions in `records` (merged work jobs followed by education rows, as
 * mergeJobsWithEducation orders them) whose skillIDs reference the skill.
 * @param {Array<object>} records
 * @param {Set<string>|string[]|string} aliases - the skill's key and display name
 * @returns {number[]} ascending
 */
export function recordIndicesReferencingSkill(records, aliases) {
    const set = toAliasSet(aliases);
    const out = [];
    recordList(records).forEach((record, i) => {
        if (!record || typeof record !== 'object' || !Array.isArray(record.skillIDs)) return;
        if (record.skillIDs.some((sid) => set.has(normalizeSkillId(sid)))) out.push(i);
    });
    return out;
}

/**
 * Rebuild skill.jobIDs as the union of its current ids and every record index that lists
 * the skill. Same convention as PATCH jobs/:n/skills and education/:key/skills: integer
 * indices into the merged work + education list. Sorted ascending, deduped, non-numeric
 * ids dropped. Mutates and returns `skill`.
 * @param {{ jobIDs?: unknown[] }} skill
 * @param {Array<object>} records
 * @param {Set<string>|string[]|string} aliases
 */
export function recomputeSkillJobIds(skill, records, aliases) {
    if (!skill || typeof skill !== 'object') throw new Error('[resumeDataHelpers] skill entry is required to recompute jobIDs');
    const ids = new Set();
    for (const id of (Array.isArray(skill.jobIDs) ? skill.jobIDs : [])) {
        const n = Number(id);
        if (Number.isInteger(n) && n >= 0) ids.add(n);
    }
    for (const i of recordIndicesReferencingSkill(records, aliases)) ids.add(i);
    skill.jobIDs = [...ids].sort((a, b) => a - b);
    return skill;
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
