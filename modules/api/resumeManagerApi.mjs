// modules/api/resumeManagerApi.mjs
// API client for resume manager operations

/**
 * Get list of all parsed resumes with metadata
 * @returns {Promise<Array>} Array of resume objects with metadata
 */
export async function listResumes() {
    try {
        const response = await fetch('/api/resumes');

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || `HTTP ${response.status}: ${response.statusText}`);
        }

        return await response.json();
    } catch (error) {
        console.error('[ResumeManagerAPI] Failed to list resumes:', error);
        throw error;
    }
}

/**
 * Upload a .docx resume file for parsing
 * @param {File} file - The .docx file to upload
 * @param {string} displayName - Optional display name for the resume
 * @param {Function} onProgress - Optional callback for upload progress (0-100)
 * @returns {Promise<Object>} Resume metadata and parsing results
 */
export async function uploadResume(file, displayName = null, onProgress = null) {
    try {
        if (!file) {
            throw new Error('No file provided');
        }

        if (!file.name.endsWith('.docx')) {
            throw new Error('Only .docx files are supported');
        }

        const formData = new FormData();
        formData.append('resume', file);

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
                        reject(new Error(error.error || error.details || `Upload failed with status ${xhr.status}`));
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
            xhr.open('POST', '/api/resumes/upload');
            xhr.send(formData);
        });

    } catch (error) {
        console.error('[ResumeManagerAPI] Failed to upload resume:', error);
        throw error;
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
            ? '/api/resumes/default/data'
            : `/api/resumes/${resumeId}/data`;

        const response = await fetch(endpoint);

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || `HTTP ${response.status}: ${response.statusText}`);
        }

        return await response.json();
    } catch (error) {
        console.error(`[ResumeManagerAPI] Failed to get resume data for ${resumeId}:`, error);
        throw error;
    }
}
