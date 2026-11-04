/**
 * The `saved` event vocabulary for the resume-details editor.
 *
 * Every tab emits `saved` with one of the payload shapes built here, and
 * `ResumeContainer.handleDetailsSaved` asks {@link resumeRefreshAction} what
 * the scene/resume list must do in response. Keeping both halves in one pure
 * module means a new mutation kind is added here (factory + action table) and
 * cannot be forgotten by the consumer.
 *
 * Payload shapes are the historical flag objects (`{ skillMerged: true }`,
 * `{ jobIndex, skillIDs, jobSkills }`, ...) so existing emitters and tests keep
 * working; this module names them rather than changing them.
 */

/** Boolean flag keys a `saved` payload may carry. */
export const SAVED_KIND = Object.freeze({
  SKILL_MERGED: 'skillMerged',
  SKILL_RENAMED: 'skillRenamed',
  REMOVED_SKILL: 'removedSkill',
  CLEAR_ALL_JOB_SKILL_LINKS: 'clearAllJobSkillLinks',
  JOBS_MUTATED: 'jobsMutated',
  JOB_FIELDS_SAVED: 'jobFieldsSaved',
  REPARSED: 'reparsed',
  RESTORED: 'restored',
  META_SAVED: 'metaSaved',
  OTHER_SECTIONS_SAVED: 'otherSectionsSaved',
  EDUCATION_SAVED: 'educationSaved',
  SESSION_ONLY: 'sessionOnly',
});

/** What the resume container must do after a `saved` payload. */
export const REFRESH_ACTION = Object.freeze({
  RELOAD: 'reload',
  REFETCH_LIST: 'refetch-list',
  PATCH_JOB: 'patch-job',
  NONE: 'none',
});

/**
 * Kinds that change skill identity (which keys exist) or job membership (which
 * jobs exist). The scene builds skill cards and biz-card skill titles once, so
 * these need a full in-place reload of the selected resume.
 */
export const RELOAD_KINDS = Object.freeze([
  SAVED_KIND.SKILL_MERGED,
  SAVED_KIND.SKILL_RENAMED,
  SAVED_KIND.REMOVED_SKILL,
  SAVED_KIND.CLEAR_ALL_JOB_SKILL_LINKS,
  SAVED_KIND.JOBS_MUTATED,
  SAVED_KIND.REPARSED,
  SAVED_KIND.RESTORED,
]);

function flag(kind) {
  return Object.freeze({ [kind]: true });
}

export const skillMerged = () => flag(SAVED_KIND.SKILL_MERGED);
export const skillRenamed = () => flag(SAVED_KIND.SKILL_RENAMED);
export const removedSkill = () => flag(SAVED_KIND.REMOVED_SKILL);
export const clearAllJobSkillLinks = () => flag(SAVED_KIND.CLEAR_ALL_JOB_SKILL_LINKS);
export const jobsMutated = () => flag(SAVED_KIND.JOBS_MUTATED);
export const jobFieldsSaved = () => flag(SAVED_KIND.JOB_FIELDS_SAVED);
export const reparsed = () => flag(SAVED_KIND.REPARSED);
export const restored = () => flag(SAVED_KIND.RESTORED);
export const metaSaved = () => flag(SAVED_KIND.META_SAVED);
export const otherSectionsSaved = () => flag(SAVED_KIND.OTHER_SECTIONS_SAVED);
export const educationSaved = () => flag(SAVED_KIND.EDUCATION_SAVED);
export const sessionOnly = () => flag(SAVED_KIND.SESSION_ONLY);

/**
 * Per-job skill selection payload. The container patches the in-memory job and
 * dispatches `job-skills-updated` instead of reloading.
 *
 * @param {{ jobIndex: number, skillIDs: string[], jobSkills?: Record<string, string>|null, sessionOnly?: boolean }} args
 * @returns {{ jobIndex: number, skillIDs: string[], jobSkills: Record<string, string>|null, sessionOnly?: true }}
 */
export function jobSkills({ jobIndex, skillIDs, jobSkills: jobSkillsRecord = null, sessionOnly: isSessionOnly = false } = {}) {
  if (!Number.isInteger(jobIndex) || jobIndex < 0) {
    throw new TypeError(`[savedPayload] jobSkills: jobIndex must be a non-negative integer, got ${String(jobIndex)}`);
  }
  if (!Array.isArray(skillIDs)) {
    throw new TypeError(`[savedPayload] jobSkills: skillIDs must be an array, got ${typeof skillIDs}`);
  }
  if (jobSkillsRecord != null && typeof jobSkillsRecord !== 'object') {
    throw new TypeError(`[savedPayload] jobSkills: jobSkills must be an object or null, got ${typeof jobSkillsRecord}`);
  }
  const payload = { jobIndex, skillIDs: [...skillIDs], jobSkills: jobSkillsRecord };
  if (isSessionOnly) payload[SAVED_KIND.SESSION_ONLY] = true;
  return payload;
}

function isObject(payload) {
  return payload != null && typeof payload === 'object';
}

/** @param {unknown} payload @param {string} kind */
export function hasSavedKind(payload, kind) {
  return isObject(payload) && payload[kind] === true;
}

/** @param {unknown} payload */
export function isSessionOnlySave(payload) {
  return hasSavedKind(payload, SAVED_KIND.SESSION_ONLY);
}

/**
 * True when the payload carries a per-job skill selection (`jobIndex` set).
 * @param {unknown} payload
 */
export function isJobSkillsPayload(payload) {
  return isObject(payload) && payload.jobIndex != null;
}

/**
 * Whether the resume list (display names etc.) must be refetched. Independent
 * of {@link resumeRefreshAction} because a payload can need both a list refetch
 * and a reload; the container runs the refetch first, then the action.
 * @param {unknown} payload
 */
export function needsResumeListRefetch(payload) {
  return hasSavedKind(payload, SAVED_KIND.META_SAVED);
}

/**
 * Decide the scene/resume refresh for a `saved` payload.
 *
 * | payload                                          | action          |
 * |--------------------------------------------------|-----------------|
 * | any of {@link RELOAD_KINDS} (even with metaSaved) | `reload`        |
 * | metaSaved                                        | `refetch-list`  |
 * | `{ jobIndex, skillIDs, jobSkills }`              | `patch-job`     |
 * | jobFieldsSaved, otherSectionsSaved, educationSaved, sessionOnly, bare, null | `none` |
 *
 * @param {unknown} payload
 * @returns {'reload'|'refetch-list'|'patch-job'|'none'}
 */
export function resumeRefreshAction(payload) {
  if (!isObject(payload)) return REFRESH_ACTION.NONE;
  if (RELOAD_KINDS.some((kind) => payload[kind] === true)) return REFRESH_ACTION.RELOAD;
  if (needsResumeListRefetch(payload)) return REFRESH_ACTION.REFETCH_LIST;
  if (isJobSkillsPayload(payload)) return REFRESH_ACTION.PATCH_JOB;
  return REFRESH_ACTION.NONE;
}
