/**
 * Pure helpers for folding one skill into another (skills/merge, and
 * skills/rename when the new name already exists).
 */

function trimmedUrl(value) {
    return value == null ? '' : String(value).trim();
}

/**
 * URL to keep when two skills become one.
 * A manually defined URL survives the merge. When both skills carry one,
 * the shortest wins; on a tie the target's URL is kept.
 *
 * @param {unknown} fromUrl - URL on the skill being folded in
 * @param {unknown} toUrl   - URL on the surviving skill
 * @returns {string} '' when neither skill has a URL
 */
export function pickMergedSkillUrl(fromUrl, toUrl) {
    const from = trimmedUrl(fromUrl);
    const to = trimmedUrl(toUrl);
    if (!from) return to;
    if (!to) return from;
    return from.length < to.length ? from : to;
}

/**
 * Fold `from` into `to` in place: union jobIDs (target order first) and
 * apply the URL rule above. Returns the surviving entry.
 *
 * @param {{ jobIDs?: unknown[], url?: unknown }} from
 * @param {{ jobIDs?: unknown[], url?: unknown }} to
 */
export function mergeSkillEntryInto(from, to) {
    if (!to || typeof to !== 'object') throw new Error('[skillMerge] target skill entry is required');
    const jobIDs = new Set(Array.isArray(to.jobIDs) ? to.jobIDs : []);
    for (const id of (Array.isArray(from?.jobIDs) ? from.jobIDs : [])) jobIDs.add(id);
    to.jobIDs = [...jobIDs];
    const url = pickMergedSkillUrl(from?.url, to.url);
    if (url) to.url = url;
    return to;
}
