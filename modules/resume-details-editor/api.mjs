/**
 * resume-details-editor API client
 * Self-contained: all fetch calls for meta, other-sections, categories.
 * Base URL empty = relative to current origin; for standalone, set via getApiBase().
 */
import { reportError } from '@/modules/utils/errorReporting.mjs';

/** @returns {string} Base URL for API (empty = same origin) */
function getApiBase() {
    return typeof window !== 'undefined' && window.__RESUME_DETAILS_EDITOR_API_BASE__ !== undefined
        ? window.__RESUME_DETAILS_EDITOR_API_BASE__
        : '';
}

function basePathJoin(relPath) {
    const base = (import.meta?.env?.BASE_URL || '/');
    const b = base.endsWith('/') ? base : `${base}/`;
    const p = relPath.startsWith('/') ? relPath.slice(1) : relPath;
    return `${b}${p}`;
}

function downloadJson(filename, data) {
    try {
        const blob = new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (e) {
        reportError(e, '[resume-details-editor/api] Failed to download JSON remedy');
    }
}

async function apiJson(path, options = {}) {
    const base = getApiBase();
    const url = base ? (base + path) : basePathJoin(path);
    try {
        const res = await fetch(url, {
            headers: { 'Content-Type': 'application/json', ...options.headers },
            ...options
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `HTTP ${res.status}`);
        }
        return res.json();
    } catch (e) {
        reportError(e, `[resume-details-editor/api] Request failed: ${path}`);
        throw e;
    }
}

/**
 * @param {string} resumeId
 * @returns {Promise<{ id: string, displayName: string, createdAt?: string, fileName?: string, jobCount?: number, skillCount?: number }>}
 */
export async function getResumeMeta(resumeId) {
    return apiJson(`/api/resumes/${encodeURIComponent(resumeId)}/meta`);
}

/**
 * @param {string} resumeId
 * @param {{ displayName?: string, fileName?: string }} updates
 * @returns {Promise<Object>}
 */
export async function updateResumeMeta(resumeId, updates) {
    try {
        return await apiJson(`/api/resumes/${encodeURIComponent(resumeId)}/meta`, {
            method: 'PATCH',
            body: JSON.stringify(updates)
        });
    } catch (e) {
        reportError(e, '[resume-details-editor/api] Failed to update resume meta', 'Downloading a JSON patch for manual application');
        downloadJson(`${resumeId}-meta.patch.json`, { resumeId, operation: 'updateResumeMeta', updates });
        throw e;
    }
}

/**
 * @param {string} resumeId
 * @returns {Promise<Object>} otherSections (summary, title, contact, certifications, websites, custom_sections)
 */
export async function getResumeOtherSections(resumeId) {
    try {
        return await apiJson(`/api/resumes/${encodeURIComponent(resumeId)}/other-sections`);
    } catch (e) {
        if (e.message.includes('404') || e.message.includes('not found')) return {};
        throw e;
    }
}

/**
 * @param {string} resumeId
 * @param {Object} payload - full otherSections object
 * @returns {Promise<Object>}
 */
export async function updateResumeOtherSections(resumeId, payload) {
    try {
        return await apiJson(`/api/resumes/${encodeURIComponent(resumeId)}/other-sections`, {
            method: 'PATCH',
            body: JSON.stringify(payload)
        });
    } catch (e) {
        reportError(e, '[resume-details-editor/api] Failed to update other-sections', 'Downloading a JSON patch for manual application');
        downloadJson(`${resumeId}-other-sections.patch.json`, { resumeId, operation: 'updateResumeOtherSections', payload });
        throw e;
    }
}

/**
 * @param {string} resumeId - use 'default' for static content
 * @returns {Promise<{ jobs: Array, skills: Object, categories: Object }>}
 */
export async function getResumeData(resumeId) {
    const path = resumeId === 'default' ? '/api/resumes/default/data' : `/api/resumes/${encodeURIComponent(resumeId)}/data`;
    return apiJson(path);
}

/**
 * @param {string} resumeId
 * @param {number} jobIndex - 0-based
 * @param {{ label?: string, role?: string, employer?: string, start?: string, end?: string, Description?: string }} updates
 * @returns {Promise<{ ok: boolean, job: object }>}
 */
export async function updateJob(resumeId, jobIndex, updates) {
    try {
        return await apiJson(`/api/resumes/${encodeURIComponent(resumeId)}/jobs/${jobIndex}`, {
            method: 'PATCH',
            body: JSON.stringify(updates)
        });
    } catch (e) {
        reportError(e, '[resume-details-editor/api] Failed to update job', 'Downloading a JSON patch for manual application');
        downloadJson(`${resumeId}-job-${jobIndex}.patch.json`, { resumeId, jobIndex, operation: 'updateJob', updates });
        throw e;
    }
}

/**
 * @param {string} resumeId
 * @param {Record<string, { name: string, skillIDs?: string[] }>} categories
 * @returns {Promise<{ categories: Object }>}
 */
export async function updateResumeCategories(resumeId, categories) {
    try {
        return await apiJson(`/api/resumes/${encodeURIComponent(resumeId)}/categories`, {
            method: 'PATCH',
            body: JSON.stringify({ categories })
        });
    } catch (e) {
        reportError(e, '[resume-details-editor/api] Failed to update categories', 'Downloading a JSON patch for manual application');
        downloadJson(`${resumeId}-categories.patch.json`, { resumeId, operation: 'updateResumeCategories', categories });
        throw e;
    }
}
