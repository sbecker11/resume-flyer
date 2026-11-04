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
 * Make categories.json authoritative for skill.categoryIDs: every skill's categoryIDs becomes
 * the list of categories whose skillIDs name it (by key or display name). Used by
 * PATCH /categories, where the client sends the whole categories object; the additive sync in
 * normalizeResumeData alone could never remove a membership. A skill that had no categoryIDs
 * field and belongs to no category is left without one. Mutates skills in place.
 * @param {Record<string, { name?: unknown, categoryIDs?: unknown }>} skills
 * @param {Record<string, { skillIDs?: unknown[] } | unknown[]>|null|undefined} categories
 * @returns {number} skills whose categoryIDs changed
 */
export function mirrorCategoriesIntoSkills(skills, categories) {
    const cats = categories && typeof categories === 'object' && !Array.isArray(categories) ? categories : {};
    let count = 0;
    for (const [key, skill] of Object.entries(skills)) {
        if (!skill || typeof skill !== 'object') continue;
        const aliases = skillAliasSet(key, skill.name);
        const next = Object.entries(cats)
            .filter(([, cat]) => {
                const ids = Array.isArray(cat) ? cat : (cat && typeof cat === 'object' && Array.isArray(cat.skillIDs) ? cat.skillIDs : []);
                return ids.some((sid) => aliases.has(normalizeSkillId(sid)));
            })
            .map(([cid]) => cid);
        const prev = Array.isArray(skill.categoryIDs) ? skill.categoryIDs : undefined;
        if (prev === undefined && next.length === 0) continue;
        if (prev !== undefined && JSON.stringify(prev) === JSON.stringify(next)) continue;
        skill.categoryIDs = next;
        count++;
    }
    return count;
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
