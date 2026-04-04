/**
 * resume-details-editor module
 * Standalone-ready: single entry point for the main app.
 * Remove: delete this folder and any usage in ResumeContainer.
 */
export { default as ResumeDetailsEditor } from './ResumeDetailsEditor.vue';
export { getResumeMeta, updateResumeMeta, getResumeOtherSections, updateResumeOtherSections, getResumeEducation, updateResumeEducation, getResumeData, updateResumeCategories, addJobAfter, deleteJob } from './api.mjs';
export { DEFAULT_OTHER_SECTIONS, TAB_IDS } from './constants.mjs';
