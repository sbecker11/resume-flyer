import { AppState, saveState } from './stateManager.mjs';
import { jobs } from '../../static_content/jobs/jobs.mjs';

// Simple selection manager without IM framework
class SelectionManager {
    constructor() {
        this.eventTarget = new EventTarget();
        this.selectedJobNumber = null;
        this.hoveredJobNumber = null;
        this.instanceId = Math.random().toString(36).substr(2, 9); // Unique instance ID
        console.log(`[SelectionManager] 🆔 Instance created with ID: ${this.instanceId}`);
        
        // Load initial selection from AppState
        this.loadInitialSelection();
        
        // CRITICAL: Also add DOM content loaded validation for immediate hard-refresh detection
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                setTimeout(() => this.validatePageLoadState('DOMContentLoaded'), 100);
            });
        } else {
            // DOM already loaded, run validation immediately  
            setTimeout(() => this.validatePageLoadState('DOMAlreadyLoaded'), 100);
        }
    }

    loadInitialSelection() {
        if (AppState && AppState.selectedJobNumber !== null) {
            // Use setTimeout to ensure all components are initialized before triggering selection
            setTimeout(() => {
                console.log(`[SelectionManager] Loading initial selection from AppState: Job ${AppState.selectedJobNumber}`);
                this.selectJobNumber(AppState.selectedJobNumber, 'SelectionManager.loadInitialSelection');
            }, 200);
        }
        
        // CRITICAL: Also validate page load state to catch hard-refresh violations
        // Delay validation to allow initial selection restoration to complete
        setTimeout(() => this.validatePageLoadState('page-load-validation'), 1500);
    }

    selectJobNumber(jobNumber, caller = 'unknown') {
        const previousSelection = this.selectedJobNumber;
        this.selectedJobNumber = jobNumber;
        
        // Fetch dataJobObject using jobNumber
        const dataJobObject = this.getJobDataByNumber(jobNumber);
        
        // Update AppState (but don't save during initialization to prevent redundant saves)
        if (AppState && caller !== 'SelectionManager.loadInitialSelection') {
            AppState.selectedJobNumber = jobNumber;
            AppState.lastVisitedJobNumber = jobNumber;
            saveState(AppState);
        } else if (AppState && caller === 'SelectionManager.loadInitialSelection') {
            // Still update the state, just don't save it since it's already saved
            AppState.selectedJobNumber = jobNumber;
            AppState.lastVisitedJobNumber = jobNumber;
        }

        // Dispatch both new and legacy events for compatibility
        console.log(`[SelectionManager] 🚀 Dispatching job-selected event for job ${jobNumber}, source: ${caller}`)
        this.eventTarget.dispatchEvent(new CustomEvent('job-selected', {
            detail: { 
                jobNumber, 
                dataJobObject,
                previousSelection,
                source: caller // Use the caller parameter to identify the source
            }
        }));

        // Legacy event for recovered controllers
        console.log(`[SelectionManager] 🚀 Dispatching selectionChanged event for job ${jobNumber}`)
        this.eventTarget.dispatchEvent(new CustomEvent('selectionChanged', {
            detail: { 
                selectedJobNumber: jobNumber, 
                caller 
            }
        }));

        console.log(`[SelectionManager] ✅ Job ${jobNumber} selected (${caller}):`, dataJobObject?.employer || 'Unknown');
        
        // Debug: Check how many listeners are registered for job-selected
        const listeners = this.eventTarget._events?.['job-selected'] || []
        console.log(`[SelectionManager] 📡 job-selected event has ${Array.isArray(listeners) ? listeners.length : (listeners ? 1 : 0)} listeners`);
        
        // Validation removed - pre-creation architecture means both original and clone always exist in DOM
        // Only display properties change, so no need to validate DOM structure
    }

    clearSelection(caller = 'unknown') {
        const previousSelection = this.selectedJobNumber;
        this.selectedJobNumber = null;
        
        // Update AppState
        if (AppState) {
            AppState.selectedJobNumber = null;
            saveState(AppState);
        }

        // Dispatch both new and legacy events for compatibility
        this.eventTarget.dispatchEvent(new CustomEvent('selection-cleared', {
            detail: { previousSelection }
        }));

        // Legacy event for recovered controllers
        this.eventTarget.dispatchEvent(new CustomEvent('selectionCleared', {
            detail: { caller }
        }));

        console.log('[SelectionManager] Selection cleared');
        
        // CRITICAL: Validate that clones are properly cleaned up after deselection
        if (previousSelection) {
            setTimeout(() => this.validateCloneCleanup(previousSelection), 100);
        }
    }

    getSelectedJobNumber() {
        return this.selectedJobNumber;
    }

    getJobDataByNumber(jobNumber) {
        if (jobNumber === null || jobNumber === undefined) {
            return null;
        }
        
        // Jobs array is 0-indexed, jobNumber should match the array index
        if (jobNumber >= 0 && jobNumber < jobs.length) {
            return jobs[jobNumber];
        }
        
        console.warn(`[SelectionManager] Job number ${jobNumber} out of range (0-${jobs.length - 1})`);
        return null;
    }

    setHoveredJobNumber(jobNumber) {
        this.hoveredJobNumber = jobNumber;
        
        // Dispatch hover event
        this.eventTarget.dispatchEvent(new CustomEvent('job-hovered', {
            detail: { jobNumber }
        }));
    }

    // Legacy API compatibility for recovered controllers
    hoverJobNumber(jobNumber, caller = 'unknown') {
        this.hoveredJobNumber = jobNumber;
        
        // Dispatch both new and legacy events for compatibility
        this.eventTarget.dispatchEvent(new CustomEvent('job-hovered', {
            detail: { jobNumber }
        }));
        
        this.eventTarget.dispatchEvent(new CustomEvent('hoverChanged', {
            detail: { hoveredJobNumber: jobNumber, caller }
        }));
    }

    clearHover(caller = 'unknown') {
        this.hoveredJobNumber = null;
        
        // Dispatch legacy clear hover event
        this.eventTarget.dispatchEvent(new CustomEvent('hoverCleared', {
            detail: { caller }
        }));
    }

    getHoveredJobNumber() {
        return this.hoveredJobNumber;
    }

    addEventListener(type, listener) {
        this.eventTarget.addEventListener(type, listener);
    }

    removeEventListener(type, listener) {
        this.eventTarget.removeEventListener(type, listener);
    }

    /**
     * CRITICAL ERROR DETECTION: Validates that original and clone are never both visible
     * This was a major bug that was previously fixed and should never resurface
     */
    validateCloneVisibility(jobNumber) {
        if (jobNumber === null || jobNumber === undefined) return;

        // Check for duplicate elements
        const allElements = document.querySelectorAll(`div.biz-card-div[data-job-number="${jobNumber}"]`);
        if (allElements.length > 2) {
            console.error(`⚠️ Found ${allElements.length} elements for job ${jobNumber} - should be max 2`);
        }

        // Find original cDiv
        const originalCDiv = document.querySelector(`div.biz-card-div[data-job-number="${jobNumber}"]:not(.clone)`);
        const cloneCDiv = document.querySelector(`div.biz-card-div[data-job-number="${jobNumber}"].clone`);
        
        if (!originalCDiv || !cloneCDiv) return; // No clone exists - normal state

        // Check computed visibility of both elements
        const originalStyle = window.getComputedStyle(originalCDiv);
        const cloneStyle = window.getComputedStyle(cloneCDiv);
        
        const originalVisible = originalStyle.display !== 'none' && 
                               originalStyle.visibility !== 'hidden' && 
                               originalStyle.opacity !== '0';
                               
        const cloneVisible = cloneStyle.display !== 'none' && 
                            cloneStyle.visibility !== 'hidden' && 
                            cloneStyle.opacity !== '0';

        // ONLY LOG IF THERE'S A PROBLEM
        if (originalVisible && cloneVisible) {
            console.error(`🚨🚨🚨 CRITICAL ERROR: BOTH ORIGINAL AND CLONE VISIBLE FOR JOB ${jobNumber}! 🚨🚨🚨`);
            console.error(`Original: display=${originalStyle.display}, visibility=${originalStyle.visibility}, opacity=${originalStyle.opacity}`);
            console.error(`Clone: display=${cloneStyle.display}, visibility=${cloneStyle.visibility}, opacity=${cloneStyle.opacity}`);
            console.error('Original element:', originalCDiv);
            console.error('Clone element:', cloneCDiv);
            
            // THROW ERROR to stop execution
            throw new Error(`CRITICAL VISIBILITY ERROR: Both original and clone cDiv are visible for Job ${jobNumber}!`);
        }
        
    }

    /**
     * CRITICAL ERROR DETECTION: Validates page load state to catch hard-refresh violations
     * This checks for architectural violations that occur during initial page load
     */
    validatePageLoadState(timing) {
        console.log(`🔍 [${timing}] Validating page load state for hard-refresh violations...`);
        
        // Check all jobs for violations during page load
        for (let jobNumber = 0; jobNumber < 25; jobNumber++) {
            try {
                this.validateCloneVisibility(jobNumber);
            } catch (error) {
                console.error(`🚨 [${timing}] HARD-REFRESH VIOLATION DETECTED:`);
                throw error; // Re-throw to stop execution
            }
        }
        
        console.log(`✅ [${timing}] Page load state validation passed`);
    }

    /**
     * CRITICAL ERROR DETECTION: Validates that clones are properly removed after deselection
     */
    validateCloneCleanup(jobNumber) {
        if (!jobNumber) return;

        // Check that only ONE of original or clone is visible (display:block) at a time
        const original = document.getElementById(`biz-card-div-${jobNumber}`);
        const clone = document.getElementById(`biz-card-div-${jobNumber}-clone`);
        
        if (!original || !clone) return; // Skip if elements don't exist
        
        const originalStyle = window.getComputedStyle(original);
        const cloneStyle = window.getComputedStyle(clone);
        
        const originalVisible = originalStyle.display !== 'none';
        const cloneVisible = cloneStyle.display !== 'none';
        
        // CRITICAL: Only one should be visible at a time
        if (originalVisible && cloneVisible) {
            const errorMessage = `🚨 CRITICAL CLEANUP ERROR: Both original AND clone are visible for Job ${jobNumber}!\n` +
                                `Only one should be display:block at a time. This creates visual confusion.`;
            
            console.error(errorMessage);
            console.error('Original visible:', originalVisible, 'Clone visible:', cloneVisible);
            console.error('Original display:', originalStyle.display, 'Clone display:', cloneStyle.display);
        } else if (!originalVisible && !cloneVisible) {
            const errorMessage = `🚨 CRITICAL CLEANUP ERROR: Neither original NOR clone is visible for Job ${jobNumber}!\n` +
                                `One should always be display:block. This creates missing cards.`;
            
            console.error(errorMessage);
            console.error('Original display:', originalStyle.display, 'Clone display:', cloneStyle.display);
        }
        
        console.log(`✅ [CleanupValidation] Job ${jobNumber} clones properly cleaned up`);
    }

}

// Create and export singleton
export const selectionManager = new SelectionManager();
export default selectionManager;
