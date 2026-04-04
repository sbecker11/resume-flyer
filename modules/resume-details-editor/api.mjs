/**
 * resume-details-editor API client
 * Self-contained: all fetch calls for meta, other-sections, categories.
 * Base URL empty = relative to current origin; for standalone, set via getApiBase().
 */
import { reportError } from '@/modules/utils/errorReporting.mjs';
import { hasServer } from '@/modules/core/hasServer.mjs';
import { mergeJobsWithEducation, toJobsArray } from '@/modules/data/mergeEducationIntoJobs.mjs';
import { enrichJobsWithSkills } from '@/modules/data/enrichedJobs.mjs';

/** @returns {string} Base URL for API (empty = same origin) */
function getApiBase() {
    return typeof window !== 'undefined' && window.__RESUME_DETAILS_EDITOR_API_BASE__ !== undefined
        ? window.__RESUME_DETAILS_EDITOR_API_BASE__
        : '';
}

function getRuntimeBase() {
    const envBase = (import.meta?.env?.BASE_URL || '/');
    let base = envBase;
    if (typeof window !== 'undefined') {
        const path = window.location.pathname || '/';
        const parts = path.split('/').filter(Boolean);
        const useSubpath = parts.length > 0 && (envBase === '/' || !path.startsWith(envBase));
        if (useSubpath) base = `/${parts[0]}/`;
    }
    return base.endsWith('/') ? base : `${base}/`;
}

function basePathJoin(relPath) {
    const b = getRuntimeBase();
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
        const is404 = e?.message?.includes('404') || e?.message?.includes('not found');
        if (!is404) reportError(e, `[resume-details-editor/api] Request failed: ${path}`);
        throw e;
    }
}

/**
 * @param {string} resumeId
 * @returns {Promise<{ id: string, displayName: string, createdAt?: string, fileName?: string, jobCount?: number, skillCount?: number }>}
 */
export async function getResumeMeta(resumeId) {
    if (hasServer()) {
        try {
            return await apiJson(`/api/resumes/${encodeURIComponent(resumeId)}/meta`);
        } catch (e) {
            if (e?.message?.includes('404') || e?.message?.includes('not found')) {
                try {
                    const url = basePathJoin(`parsed_resumes/${encodeURIComponent(resumeId)}/meta.json`);
                    const res = await fetch(url);
                    if (res.ok) return res.json();
                } catch (_) {}
                return { id: resumeId, displayName: resumeId };
            }
            throw e;
        }
    } else {
        if (resumeId !== 'default') {
            try {
                const url = basePathJoin(`parsed_resumes/${encodeURIComponent(resumeId)}/meta.json`);
                const res = await fetch(url);
                if (res.ok) return res.json();
            } catch (_) {}
        }
        return { id: resumeId, displayName: resumeId };
    }
}

/**
 * @param {string} resumeId
 * @param {{ displayName?: string, fileName?: string }} updates
 * @returns {Promise<Object>}
 */
export async function updateResumeMeta(resumeId, updates) {
    if (hasServer()) {
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
    } else {
        downloadJson(`${resumeId}-meta.patch.json`, { resumeId, operation: 'updateResumeMeta', updates });
        throw new Error('Save is not available on static hosting. A patch file was downloaded for manual application.');
    }
}

/**
 * @param {string} resumeId
 * @returns {Promise<Object>} otherSections (summary, title, contact, certifications, websites, custom_sections)
 */
export async function getResumeOtherSections(resumeId) {
    if (hasServer()) {
        try {
            return await apiJson(`/api/resumes/${encodeURIComponent(resumeId)}/other-sections`);
        } catch (e) {
            if (e?.message?.includes('404') || e?.message?.includes('not found')) {
                try {
                    const url = basePathJoin(`parsed_resumes/${encodeURIComponent(resumeId)}/other-sections.json`);
                    const res = await fetch(url);
                    if (res.ok) return res.json();
                } catch (_) {}
                return {};
            }
            throw e;
        }
    } else {
        if (resumeId !== 'default') {
            try {
                const url = basePathJoin(`parsed_resumes/${encodeURIComponent(resumeId)}/other-sections.json`);
                const res = await fetch(url);
                if (res.ok) return res.json();
            } catch (_) {}
        }
        return {};
    }
}

/**
 * @param {string} resumeId
 * @param {Object} payload - full otherSections object
 * @returns {Promise<Object>}
 */
export async function updateResumeOtherSections(resumeId, payload) {
    if (hasServer()) {
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
    } else {
        downloadJson(`${resumeId}-other-sections.patch.json`, { resumeId, operation: 'updateResumeOtherSections', payload });
        throw new Error('Save is not available on static hosting. A patch file was downloaded for manual application.');
    }
}

/**
 * @param {string} resumeId
 * @returns {Promise<Record<string, { index?: number, degree?: string, institution?: string, start?: string, end?: string, description?: string }>>}
 */
export async function getResumeEducation(resumeId) {
    if (hasServer()) {
        try {
            return await apiJson(`/api/resumes/${encodeURIComponent(resumeId)}/education`);
        } catch (e) {
            if (e?.message?.includes('404') || e?.message?.includes('not found')) {
                try {
                    const url = basePathJoin(`parsed_resumes/${encodeURIComponent(resumeId)}/education.json`);
                    const res = await fetch(url);
                    if (res.ok) return res.json();
                } catch (_) {}
                return {};
            }
            throw e;
        }
    } else {
        if (resumeId !== 'default') {
            try {
                const url = basePathJoin(`parsed_resumes/${encodeURIComponent(resumeId)}/education.json`);
                const res = await fetch(url);
                if (res.ok) return res.json();
            } catch (_) {}
        }
        return {};
    }
}

/**
 * @param {string} resumeId
 * @param {Record<string, { index?: number, degree?: string, institution?: string, start?: string, end?: string, description?: string }>} payload
 * @returns {Promise<Object>}
 */
export async function updateResumeEducation(resumeId, payload) {
    if (hasServer()) {
        try {
            return await apiJson(`/api/resumes/${encodeURIComponent(resumeId)}/education`, {
                method: 'PATCH',
                body: JSON.stringify(payload)
            });
        } catch (e) {
            reportError(e, '[resume-details-editor/api] Failed to update education', 'Downloading a JSON patch for manual application');
            downloadJson(`${resumeId}-education.patch.json`, { resumeId, operation: 'updateResumeEducation', payload });
            throw e;
        }
    } else {
        downloadJson(`${resumeId}-education.patch.json`, { resumeId, operation: 'updateResumeEducation', payload });
        throw new Error('Save is not available on static hosting. A patch file was downloaded for manual application.');
    }
}

/**
 * @param {string} resumeId - use 'default' for static content
 * @returns {Promise<{ jobs: Array, skills: Object, categories: Object }>}
 * Jobs array includes education rows appended after work jobs (see mapEducationToJob).
 */
export async function getResumeData(resumeId) {
    if (hasServer()) {
        const path = resumeId === 'default' ? '/api/resumes/default/data' : `/api/resumes/${encodeURIComponent(resumeId)}/data`;
        try {
            const [data, education] = await Promise.all([
                apiJson(path),
                getResumeEducation(resumeId).catch(() => ({}))
            ]);
            const merged = mergeJobsWithEducation(toJobsArray(data.jobs), education);
            const jobs = enrichJobsWithSkills(merged, data.skills ?? {});
            return {
                ...data,
                jobs,
                skills: data.skills ?? {},
                categories: data.categories ?? {}
            };
        } catch (e) {
            if (resumeId !== 'default' && (e?.message?.includes('404') || e?.message?.includes('not found'))) {
                try {
                    const base = basePathJoin(`parsed_resumes/${encodeURIComponent(resumeId)}`);
                    const [jobsRes, skillsRes, categoriesRes, educationRes] = await Promise.all([
                        fetch(`${base}/jobs.json`),
                        fetch(`${base}/skills.json`).catch(() => null),
                        fetch(`${base}/categories.json`).catch(() => null),
                        fetch(`${base}/education.json`).catch(() => null)
                    ]);
                    if (!jobsRes.ok) throw new Error(`Static jobs not found`);
                    const jobsRaw = await jobsRes.json();
                    const skills = (skillsRes && skillsRes.ok) ? await skillsRes.json() : {};
                    const categories = (categoriesRes && categoriesRes.ok) ? await categoriesRes.json() : {};
                    const education = (educationRes && educationRes.ok) ? await educationRes.json() : {};
                    const merged = mergeJobsWithEducation(toJobsArray(jobsRaw), education);
                    const jobs = enrichJobsWithSkills(merged, skills);
                    return { jobs, skills, categories };
                } catch (staticErr) {
                    reportError(staticErr, '[resume-details-editor/api] Static fallback for getResumeData failed');
                }
            }
            throw e;
        }
    } else {
        if (resumeId !== 'default') {
            try {
                const base = basePathJoin(`parsed_resumes/${encodeURIComponent(resumeId)}`);
                const [jobsRes, skillsRes, categoriesRes, educationRes] = await Promise.all([
                    fetch(`${base}/jobs.json`),
                    fetch(`${base}/skills.json`).catch(() => null),
                    fetch(`${base}/categories.json`).catch(() => null),
                    fetch(`${base}/education.json`).catch(() => null)
                ]);
                if (!jobsRes.ok) throw new Error(`Static jobs not found: ${base}/jobs.json`);
                const jobsRaw = await jobsRes.json();
                const skills = (skillsRes && skillsRes.ok) ? await skillsRes.json() : {};
                const categories = (categoriesRes && categoriesRes.ok) ? await categoriesRes.json() : {};
                const education = (educationRes && educationRes.ok) ? await educationRes.json() : {};
                const merged = mergeJobsWithEducation(toJobsArray(jobsRaw), education);
                const jobs = enrichJobsWithSkills(merged, skills);
                return { jobs, skills, categories };
            } catch (e) {
                if (!e?.message?.includes('404') && !e?.message?.includes('not found')) {
                    reportError(e, '[resume-details-editor/api] Static getResumeData failed');
                }
                throw e;
            }
        }
        throw new Error('Default resume data is not available on static hosting.');
    }
}

/**
 * @param {string} resumeId
 * @param {number} jobIndex - 0-based
 * @param {{ label?: string, role?: string, employer?: string, start?: string, end?: string, Description?: string }} updates
 * @returns {Promise<{ ok: boolean, job: object }>}
 */
export async function updateJob(resumeId, jobIndex, updates) {
    if (hasServer()) {
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
    } else {
        downloadJson(`${resumeId}-job-${jobIndex}.patch.json`, { resumeId, jobIndex, operation: 'updateJob', updates });
        throw new Error('Save is not available on static hosting. A patch file was downloaded for manual application.');
    }
}

/**
 * @param {string} resumeId
 * @param {number} afterIndex - Work job index to insert after; -1 inserts at position 0
 * @returns {Promise<{ ok: boolean, insertIndex: number }>}
 */
export async function addJobAfter(resumeId, afterIndex) {
    if (hasServer()) {
        try {
            return await apiJson(`/api/resumes/${encodeURIComponent(resumeId)}/jobs`, {
                method: 'POST',
                body: JSON.stringify({ afterIndex })
            });
        } catch (e) {
            reportError(e, '[resume-details-editor/api] Failed to add job', 'Downloading a JSON patch for manual application');
            downloadJson(`${resumeId}-add-job.patch.json`, { resumeId, afterIndex, operation: 'addJobAfter' });
            throw e;
        }
    } else {
        downloadJson(`${resumeId}-add-job.patch.json`, { resumeId, afterIndex, operation: 'addJobAfter' });
        throw new Error('Save is not available on static hosting. A patch file was downloaded for manual application.');
    }
}

/**
 * @param {string} resumeId
 * @param {number} jobIndex - 0-based work job index
 * @returns {Promise<{ ok: boolean }>}
 */
export async function deleteJob(resumeId, jobIndex) {
    if (hasServer()) {
        try {
            return await apiJson(`/api/resumes/${encodeURIComponent(resumeId)}/jobs/${jobIndex}`, {
                method: 'DELETE'
            });
        } catch (e) {
            reportError(e, '[resume-details-editor/api] Failed to delete job', 'Downloading a JSON patch for manual application');
            downloadJson(`${resumeId}-delete-job-${jobIndex}.patch.json`, { resumeId, jobIndex, operation: 'deleteJob' });
            throw e;
        }
    } else {
        downloadJson(`${resumeId}-delete-job-${jobIndex}.patch.json`, { resumeId, jobIndex, operation: 'deleteJob' });
        throw new Error('Save is not available on static hosting. A patch file was downloaded for manual application.');
    }
}

/**
 * @param {string} resumeId
 * @param {Record<string, { name: string, skillIDs?: string[] }>} categories
 * @returns {Promise<{ categories: Object }>}
 */
export async function updateResumeCategories(resumeId, categories) {
    if (hasServer()) {
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
    } else {
        downloadJson(`${resumeId}-categories.patch.json`, { resumeId, operation: 'updateResumeCategories', categories });
        throw new Error('Save is not available on static hosting. A patch file was downloaded for manual application.');
    }
}
