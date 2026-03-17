// modules/api/resumeManagerApi.mjs
// API client for resume manager operations
import { reportError } from '@/modules/utils/errorReporting.mjs';

function basePathJoin(relPath) {
    const base = (import.meta?.env?.BASE_URL || '/');
    const b = base.endsWith('/') ? base : `${base}/`;
    const p = relPath.startsWith('/') ? relPath.slice(1) : relPath;
    return `${b}${p}`;
}

async function fetchJsonOrThrow(url, options = {}) {
    const response = await fetch(url, options);
    if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status}: ${response.statusText}${body ? ` — ${body}` : ''}`);
    }
    return response.json();
}

async function fetchStaticResumesIndex() {
    return fetchJsonOrThrow(basePathJoin('parsed_resumes/index.json'));
}

async function fetchStaticResumeData(resumeId) {
    const base = basePathJoin(`parsed_resumes/${encodeURIComponent(resumeId)}`);
    const [jobs, skills, categories] = await Promise.all([
        fetchJsonOrThrow(`${base}/jobs.json`),
        fetchJsonOrThrow(`${base}/skills.json`).catch(() => ({})),
        fetchJsonOrThrow(`${base}/categories.json`).catch(() => ({})),
    ]);
    return { jobs, skills, categories };
}

/**
 * Get list of all parsed resumes with metadata
 * @returns {Promise<Array>} Array of resume objects with metadata
 */
export async function listResumes() {
    try {
        return await fetchJsonOrThrow(basePathJoin('api/resumes'));
    } catch (error) {
        reportError(error, '[ResumeManagerAPI] Failed to list resumes', 'Falling back to static parsed_resumes index (if available)');
        try {
            const idx = await fetchStaticResumesIndex();
            // Support both { resumes: [...] } and [...] formats
            return Array.isArray(idx) ? idx : (idx?.resumes || []);
        } catch (staticError) {
            reportError(staticError, '[ResumeManagerAPI] Static resume index fallback failed');
            throw error;
        }
    }
}

/**
 * Delete a parsed resume by ID (removes the folder from parsed_resumes/)
 * @param {string} resumeId
 */
export async function deleteResume(resumeId) {
    const response = await fetch(basePathJoin(`api/resumes/${encodeURIComponent(resumeId)}`), { method: 'DELETE' });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${response.status}`);
    }
    return response.json();
}

/**
 * Upload a resume file or fetch from URL for parsing
 * @param {File|string} fileOrUrl - The resume file to upload OR a URL string
 * @param {string} displayName - Optional display name for the resume
 * @param {Function} onProgress - Optional callback for upload progress (0-100)
 * @returns {Promise<Object>} Resume metadata and parsing results
 */
export async function uploadResume(fileOrUrl, displayName = null, onProgress = null) {
    try {
        if (!fileOrUrl) {
            throw new Error('No file or URL provided');
        }

        const formData = new FormData();

        // Check if it's a URL string or a File object
        if (typeof fileOrUrl === 'string') {
            // URL provided
            if (!fileOrUrl.startsWith('http://') && !fileOrUrl.startsWith('https://')) {
                throw new Error('Invalid URL: must start with http:// or https://');
            }
            formData.append('resumeUrl', fileOrUrl);
        } else {
            // File provided
            const isDocx = fileOrUrl.name.endsWith('.docx');
            const isPdf = fileOrUrl.name.endsWith('.pdf');
            if (!isDocx && !isPdf) {
                throw new Error('Only .docx and .pdf files are supported');
            }
            formData.append('resume', fileOrUrl);
        }

        if (displayName) {
            formData.append('displayName', displayName);
        }

        // Create XMLHttpRequest for progress tracking
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();

            // Track upload progress
            if (onProgress) {
                xhr.upload.addEventListener('progress', (event) => {
                    if (event.lengthComputable) {
                        const percentComplete = Math.round((event.loaded / event.total) * 100);
                        onProgress(percentComplete);
                    }
                });
            }

            // Handle completion
            xhr.addEventListener('load', () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        const result = JSON.parse(xhr.responseText);
                        resolve(result);
                    } catch (error) {
                        reject(new Error('Failed to parse server response'));
                    }
                } else {
                    try {
                        const error = JSON.parse(xhr.responseText);
                        // Combine error and details for better debugging
                        let errorMessage = error.error || `Upload failed with status ${xhr.status}`;
                        if (error.details) {
                            errorMessage += `\n\nDetails: ${error.details}`;
                        }
                        reject(new Error(errorMessage));
                    } catch (e) {
                        reject(new Error(`Upload failed with status ${xhr.status}`));
                    }
                }
            });

            // Handle errors
            xhr.addEventListener('error', () => {
                reject(new Error('Network error during upload'));
            });

            xhr.addEventListener('abort', () => {
                reject(new Error('Upload aborted'));
            });

            // Send request
            xhr.open('POST', basePathJoin('api/resumes/upload'));
            xhr.send(formData);
        });

    } catch (error) {
        console.error('[ResumeManagerAPI] Failed to upload resume:', error);
        throw error;
    }
}

/**
 * Update skillIDs for a single job, syncing skills.json jobIDs on the server.
 * @param {string} resumeId
 * @param {number} jobIndex
 * @param {string[]} skillIDs
 * @param {string[]} [newSkills] - Skill names to create on the resume if they don't exist
 */
export async function updateJobSkills(resumeId, jobIndex, skillIDs, newSkills = []) {
    const body = { skillIDs };
    if (newSkills.length) body.newSkills = newSkills;
    const response = await fetch(
        basePathJoin(`api/resumes/${encodeURIComponent(resumeId)}/jobs/${jobIndex}/skills`),
        { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
}

/**
 * Rename an existing skill for a resume (updates skills and all job skillIDs).
 * @param {string} resumeId
 * @param {string} oldKey - Current skill id/name (key in skills map)
 * @param {string} newName - New name (will become the new key)
 */
export async function renameSkill(resumeId, oldKey, newName) {
    const response = await fetch(
        basePathJoin(`api/resumes/${encodeURIComponent(resumeId)}/skills/rename`),
        { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ oldKey, newName }) }
    );
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${response.status}`);
    }
    return response.json();
}

/**
 * Merge one skill into another (replace fromKey with toKey everywhere, remove fromKey). Normalizes to a single skillID.
 * @param {string} resumeId
 * @param {string} fromKey - Skill to merge away (e.g. "JS")
 * @param {string} toKey - Skill to keep (e.g. "JavaScript")
 */
export async function mergeSkill(resumeId, fromKey, toKey) {
    const response = await fetch(
        basePathJoin(`api/resumes/${encodeURIComponent(resumeId)}/skills/merge`),
        { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fromKey, toKey }) }
    );
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${response.status}`);
    }
    return response.json();
}

/**
 * Get other-sections data (contact, title, summary, certifications, etc.) for a resume
 * @param {string} resumeId
 * @returns {Promise<Object>}
 */
export async function getResumeOtherSections(resumeId) {
    try {
        return await fetchJsonOrThrow(basePathJoin(`api/resumes/${encodeURIComponent(resumeId)}/other-sections`));
    } catch (error) {
        reportError(error, `[ResumeManagerAPI] Failed to get other-sections for ${resumeId}`, 'Falling back to static parsed_resumes other-sections.json (if available)');
        const base = basePathJoin(`parsed_resumes/${encodeURIComponent(resumeId)}`);
        return fetchJsonOrThrow(`${base}/other-sections.json`).catch(() => ({}));
    }
}

/**
 * Get resume data (jobs, skills, categories) for a specific resume
 * @param {string} resumeId - The resume ID (e.g., 'resume-1' or 'default')
 * @returns {Promise<Object>} Resume data with jobs, skills, and categories
 */
export async function getResumeData(resumeId) {
    try {
        const endpoint = resumeId === 'default'
            ? basePathJoin('api/resumes/default/data')
            : basePathJoin(`api/resumes/${resumeId}/data`);
        return await fetchJsonOrThrow(endpoint);
    } catch (error) {
        reportError(error, `[ResumeManagerAPI] Failed to get resume data for ${resumeId}`, 'Falling back to static parsed_resumes data files (if available)');
        if (!resumeId || resumeId === 'default') throw error;
        return fetchStaticResumeData(resumeId);
    }
}
