/**
 * JobsDataManager - Fundamental component that manages job data across the application
 * This is a foundational component that provides validated job data to all other components
 */

import { BaseComponent } from './abstracts/BaseComponent.mjs';
import { jobs } from '../../static_content/jobs/jobs.mjs';

class JobsDataManager extends BaseComponent {
    constructor() {
        super('JobsDataManager');
        this.jobsData = null;
        this.isDataValidated = false;
    }

    getPriority() {
        return 'critical'; // Must initialize before all other components that need job data
    }

    getDependencies() {
        return []; // JobsDataManager is a fundamental component with no IM dependencies
    }

    async initialize(dependencies = {}) {
        console.log('[JobsDataManager] Initializing with job data...');
        
        try {
            // Validate imported data
            if (!Array.isArray(jobs)) {
                throw new Error('[JobsDataManager] Imported jobs data is not an array');
            }

            if (jobs.length === 0) {
                throw new Error('[JobsDataManager] Imported jobs data is empty');
            }

            // Validate each job object has required fields
            const requiredFields = ['employer', 'role', 'start'];
            jobs.forEach((job, index) => {
                if (!job || typeof job !== 'object') {
                    throw new Error(`[JobsDataManager] Job at index ${index} is not an object`);
                }

                requiredFields.forEach(field => {
                    if (!job[field]) {
                        throw new Error(`[JobsDataManager] Job at index ${index} missing required field: ${field}`);
                    }
                });
            });

            // Add job numbers to each job for consistent indexing
            this.jobsData = jobs.map((job, index) => ({
                ...job,
                jobNumber: index
            }));

            this.isDataValidated = true;
            // isInitialized is managed by BaseComponent automatically
            
            console.log(`[JobsDataManager] Successfully initialized with ${this.jobsData.length} jobs`);
            console.log('[JobsDataManager] Sample job data:', this.jobsData[0]);
            
        } catch (error) {
            console.error('[JobsDataManager] Failed to initialize:', error);
            throw error;
        }
    }

    destroy() {
        this.jobsData = null;
        this.isDataValidated = false;
        // isInitialized is managed by BaseComponent automatically
    }

    // Public API Methods

    /**
     * Get all jobs data
     * @returns {Array} Array of job objects with jobNumber added
     */
    getAllJobs() {
        if (!this.isInitialized || !this.isDataValidated) {
            throw new Error('[JobsDataManager] Cannot get jobs data - component not initialized or data not validated');
        }
        
        // Return a copy to prevent external modification
        return [...this.jobsData];
    }

    /**
     * Get a specific job by job number
     * @param {number} jobNumber - The job number (0-based index)
     * @returns {Object|null} Job object or null if not found
     */
    getJob(jobNumber) {
        if (!this.isInitialized || !this.isDataValidated) {
            throw new Error('[JobsDataManager] Cannot get job - component not initialized or data not validated');
        }

        if (typeof jobNumber !== 'number' || jobNumber < 0 || jobNumber >= this.jobsData.length) {
            console.warn(`[JobsDataManager] Invalid job number: ${jobNumber}`);
            return null;
        }

        return { ...this.jobsData[jobNumber] }; // Return copy
    }

    /**
     * Get the number of jobs
     * @returns {number} Total number of jobs
     */
    getJobCount() {
        if (!this.isInitialized || !this.isDataValidated) {
            return 0;
        }
        
        return this.jobsData.length;
    }

    /**
     * Validate a job number
     * @param {number} jobNumber - The job number to validate
     * @returns {boolean} Whether the job number is valid
     */
    isValidJobNumber(jobNumber) {
        if (!this.isInitialized || !this.isDataValidated) {
            return false;
        }

        return typeof jobNumber === 'number' && 
               jobNumber >= 0 && 
               jobNumber < this.jobsData.length;
    }

    /**
     * Search jobs by criteria
     * @param {Object} criteria - Search criteria
     * @param {string} criteria.employer - Filter by employer (partial match)
     * @param {string} criteria.role - Filter by role (partial match)  
     * @param {string} criteria.skill - Filter by skill (exact match in job-skills)
     * @returns {Array} Array of matching jobs
     */
    searchJobs(criteria = {}) {
        if (!this.isInitialized || !this.isDataValidated) {
            throw new Error('[JobsDataManager] Cannot search jobs - component not initialized or data not validated');
        }

        let results = [...this.jobsData];

        if (criteria.employer) {
            const employerLower = criteria.employer.toLowerCase();
            results = results.filter(job => 
                job.employer.toLowerCase().includes(employerLower)
            );
        }

        if (criteria.role) {
            const roleLower = criteria.role.toLowerCase();
            results = results.filter(job => 
                job.role.toLowerCase().includes(roleLower)
            );
        }

        if (criteria.skill) {
            results = results.filter(job => {
                if (!job['job-skills']) return false;
                const skills = Object.values(job['job-skills']);
                return skills.includes(criteria.skill);
            });
        }

        return results;
    }

    /**
     * Get all unique employers
     * @returns {Array<string>} Array of unique employer names
     */
    getUniqueEmployers() {
        if (!this.isInitialized || !this.isDataValidated) {
            return [];
        }

        const employers = new Set(this.jobsData.map(job => job.employer));
        return Array.from(employers).sort();
    }

    /**
     * Get all unique skills across all jobs
     * @returns {Array<string>} Array of unique skill names
     */
    getUniqueSkills() {
        if (!this.isInitialized || !this.isDataValidated) {
            return [];
        }

        const skills = new Set();
        this.jobsData.forEach(job => {
            if (job['job-skills']) {
                Object.values(job['job-skills']).forEach(skill => skills.add(skill));
            }
        });

        return Array.from(skills).sort();
    }
}

// Create and export singleton instance
export const jobsDataManager = new JobsDataManager();

// Export for testing
export { JobsDataManager };