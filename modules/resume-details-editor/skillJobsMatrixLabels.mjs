/**
 * Skill-jobs grid labels.
 * A skill linked to no jobs is "Name (0)".
 * A job with no skills is "(0) Name".
 * Otherwise the existing duration counts stay.
 */

/**
 * @param {string} fullName
 * @param {number} jobCount
 * @param {number} monthsTotal
 * @returns {string}
 */
export function skillRowDisplayLabel(fullName, jobCount, monthsTotal) {
    const name = String(fullName ?? '');
    if (jobCount === 0) return `${name} (0)`;
    if (monthsTotal > 0) return `${name} (${monthsTotal})`;
    return name;
}

/**
 * @param {string} base
 * @param {number} skillCount
 * @param {number | null | undefined} durationMonths
 * @returns {string}
 */
export function jobColumnHeaderText(base, skillCount, durationMonths) {
    const name = String(base ?? '');
    if (skillCount === 0) return `(0) ${name}`;
    if (typeof durationMonths === 'number' && Number.isFinite(durationMonths) && durationMonths > 0) {
        return `(${durationMonths}) ${name}`;
    }
    return name;
}

/** Extra pixels so the top of a rotated label is not flush with the scroll edge. */
const ROTATED_LABEL_EDGE_PX = 2;

/**
 * Header-row height that contains one −45° label anchored on the cell bottom.
 * The rotated box rises (width + height) × sin(45°) above that anchor, staying above the skill rows.
 * @param {number} textWidthPx
 * @param {number} textHeightPx
 * @returns {number}
 */
export function rotatedLabelHeaderMinPx(textWidthPx, textHeightPx) {
    const width = Number(textWidthPx);
    const height = Number(textHeightPx);
    if (!Number.isFinite(width) || width < 0 || !Number.isFinite(height) || height < 0) {
        throw new Error('[rotatedLabelHeaderMinPx] text width and height must be non-negative finite numbers');
    }
    return Math.ceil((width + height) * Math.SQRT1_2) + ROTATED_LABEL_EDGE_PX;
}

/**
 * Tallest header row that fits every measured job label.
 * @param {{ width: number, height: number }[]} sizes
 * @returns {number}
 */
export function rotatedJobHeaderRowMinPx(sizes) {
    if (!Array.isArray(sizes)) {
        throw new Error('[rotatedJobHeaderRowMinPx] sizes must be an array');
    }
    let max = 0;
    for (const size of sizes) {
        const needed = rotatedLabelHeaderMinPx(size?.width, size?.height);
        if (needed > max) max = needed;
    }
    return max;
}
