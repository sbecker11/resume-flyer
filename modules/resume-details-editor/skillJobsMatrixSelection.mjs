/**
 * Skill–jobs matrix highlight.
 * One job column and one skill row may be highlighted at the same time.
 * A job-name click selects that column and leaves the row alone.
 * A skill-name click selects that row and leaves the column alone.
 * A body-cell click leaves both alone.
 * A click that is neither a job name, a skill name, nor a body cell clears both.
 * Escape clears both.
 * Removing the selected skill clears the skill row and leaves the job column alone.
 */

/**
 * @typedef {{ jobIndex: number | null, skillId: string | null }} SkillJobsHighlight
 */

/** @returns {SkillJobsHighlight} */
export function emptySkillJobsHighlight() {
    return { jobIndex: null, skillId: null };
}

/**
 * @param {SkillJobsHighlight} highlight
 */
function assertHighlight(highlight) {
    if (highlight == null || typeof highlight !== 'object') {
        throw new Error('[skillJobsMatrixSelection] highlight must be an object');
    }
    const { jobIndex, skillId } = highlight;
    const jobOk = jobIndex === null || (Number.isInteger(jobIndex) && jobIndex >= 0);
    const skillOk = skillId === null || (typeof skillId === 'string' && skillId.length > 0);
    if (!jobOk || !skillOk) {
        throw new Error('[skillJobsMatrixSelection] highlight jobIndex and skillId are invalid');
    }
}

/**
 * @param {SkillJobsHighlight} current
 * @param {{ kind: 'job', jobIndex: number } | { kind: 'skill', skillId: string } | { kind: 'cell' } | { kind: 'outside' }} target
 * @returns {SkillJobsHighlight}
 */
export function skillJobsHighlightAfterClick(current, target) {
    assertHighlight(current);
    if (target == null || typeof target !== 'object') {
        throw new Error('[skillJobsMatrixSelection] click target must be an object');
    }
    if (target.kind === 'job') {
        if (!Number.isInteger(target.jobIndex) || target.jobIndex < 0) {
            throw new Error('[skillJobsMatrixSelection] job click requires a non-negative integer jobIndex');
        }
        return { jobIndex: target.jobIndex, skillId: current.skillId };
    }
    if (target.kind === 'skill') {
        if (typeof target.skillId !== 'string' || target.skillId.length === 0) {
            throw new Error('[skillJobsMatrixSelection] skill click requires a non-empty skillId');
        }
        return { jobIndex: current.jobIndex, skillId: target.skillId };
    }
    if (target.kind === 'cell') {
        return { jobIndex: current.jobIndex, skillId: current.skillId };
    }
    if (target.kind === 'outside') {
        return emptySkillJobsHighlight();
    }
    throw new Error(`[skillJobsMatrixSelection] unknown click kind: ${String(target.kind)}`);
}

/**
 * Escape clears both highlights. It does not close the resume-details modal.
 * @param {SkillJobsHighlight} current
 * @returns {SkillJobsHighlight}
 */
export function skillJobsHighlightAfterEscape(current) {
    assertHighlight(current);
    return emptySkillJobsHighlight();
}

/**
 * The deleted skill row is no longer selected. A highlighted job column stays.
 * @param {SkillJobsHighlight} current
 * @returns {SkillJobsHighlight}
 */
export function skillJobsHighlightAfterSkillRemoved(current) {
    assertHighlight(current);
    if (current.skillId == null) return current;
    return { jobIndex: current.jobIndex, skillId: null };
}
