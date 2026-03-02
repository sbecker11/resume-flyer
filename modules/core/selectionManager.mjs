import { AppState, saveState } from './stateManager.mjs';
import { jobs } from '../data/enrichedJobs.mjs';

// Selection Manager now handles high-level orchestration
// It should directly manage the rDiv → cDiv synchronization flow

// Simple selection manager without IM framework
/** @typedef {{ type: 'biz', jobNumber: number } | { type: 'skill', skillCardId: string }} SelectedCard */

class SelectionManager {
    constructor() {
        this.eventTarget = new EventTarget();
        /** Unified selection: one card (biz or skill) at a time. null when none selected. */
        this.selectedCard = null;
        /** @deprecated Use selectedCard; kept for backward compat. Equals jobNumber when selectedCard?.type === 'biz', else null. */
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

    /**
     * Select a card (only one at a time). card is { type: 'biz', jobNumber } or { type: 'skill', skillCardId }.
     */
    selectCard(card, caller = 'unknown') {
        if (!card || !card.type) return;
        const previousCard = this.selectedCard;
        this._unselectAllSelectedCards(previousCard);

        this.selectedCard = card;
        this.selectedJobNumber = card.type === 'biz' ? card.jobNumber : null;

        console.log(`[SelectionManager] 🎯 COMMANDING SELECTION for card from ${caller}:`, card);

        if (AppState) {
            AppState.selectedJobNumber = this.selectedJobNumber;
            if (caller !== 'SelectionManager.loadInitialSelection') {
                if (card.type === 'biz') AppState.lastVisitedJobNumber = card.jobNumber;
                saveState(AppState);
            }
        }

        if (card.type === 'biz') {
            const previousJobNumber = previousCard?.type === 'biz' ? previousCard.jobNumber : null;
            this.commandControllers(card.jobNumber, previousJobNumber, caller);
            this.dispatchCardSelected(this.selectedCard, previousCard, caller);
            this.dispatchSelectionEvents(card.jobNumber, previousJobNumber, caller);
            const dataJobObject = this.getJobDataByNumber(card.jobNumber);
            console.log(`[SelectionManager] ✅ Card selection issued (${caller}):`, dataJobObject?.employer || 'Unknown');
        } else {
            this.dispatchCardSelected(this.selectedCard, previousCard, caller);
            this.commandCardsController('select-skill', card.skillCardId);
            console.log(`[SelectionManager] ✅ Card selection issued (${caller})`);
        }
    }

    /** @deprecated Use selectCard({ type: 'biz', jobNumber }, caller) */
    selectJobNumber(jobNumber, caller = 'unknown') {
        this.selectCard({ type: 'biz', jobNumber }, caller);
    }

    /** @deprecated Use selectCard({ type: 'skill', skillCardId }, caller) */
    selectSkillCard(skillCardId, caller = 'unknown') {
        this.selectCard({ type: 'skill', skillCardId }, caller);
    }

    /**
     * HIGH-LEVEL ORCHESTRATION: Manages the complete selection flow
     * 0. Clear all existing selections (ScenePlane.clearAllSelections)
     * 1. Style rDiv as selected
     * 2. Scroll rDiv into view  
     * 3. Hide previous cDiv clone (if any)
     * 4. Show/create current cDiv clone
     * 5. Style cDiv clone as selected
     * 6. Position cDiv clone at scene center
     * 7. Scroll cDiv clone into view
     */
    commandControllers(jobNumber, previousSelection, caller) {
        console.log(`[SelectionManager] 📋 Issuing selection commands for job ${jobNumber}`);
        // Previous selection already cleared by _unselectAllSelectedCards before selectJobNumber/selectSkillCard

        // Command new selection
        this.commandResumeController('select', jobNumber);
        this.commandCardsController('select', jobNumber);
        
        // Command scroll into view
        this.commandResumeController('scrollIntoView', jobNumber);
        this.commandCardsController('scrollIntoView', jobNumber);
        
        // CRITICAL: Dispatch the legacy job-selected event that CardsController expects
        console.log(`[SelectionManager] 🚀 DISPATCHING job-selected event for job ${jobNumber}`);
        this.dispatchSelectionEvents(jobNumber, previousSelection, caller);
    }

    /**
     * Command Resume Controller
     */
    commandResumeController(action, jobNumber) {
        console.log(`[SelectionManager] 📋 → ResumeController: ${action}(${jobNumber || 'all'})`);
        
        // Dispatch command events that ResumeController can listen to
        const eventName = `resume-${action}`;
        this.eventTarget.dispatchEvent(new CustomEvent(eventName, {
            detail: { jobNumber, action }
        }));
    }

    /**
     * Command Cards Controller. Payload: number = jobNumber, string = skillCardId (select-skill/unselect-skill). One selected card at a time.
     */
    commandCardsController(action, payload) {
        const jobNumber = typeof payload === 'number' ? payload : undefined;
        const skillCardId = typeof payload === 'string' ? payload : undefined;
        console.log(`[SelectionManager] 📋 → CardsController: ${action}(${payload ?? 'all'})`);
        const eventName = action === 'select-skill' ? 'cards-select-skill' : action === 'unselect-skill' ? 'cards-unselect-skill' : `cards-${action}`;
        this.eventTarget.dispatchEvent(new CustomEvent(eventName, {
            detail: { jobNumber, skillCardId, action }
        }));
    }

    /**
     * Unselect all currently selected cards (remove clone, show original). Call before setting a new selection.
     * @param {SelectedCard|null} previousCard - The card to unselect (biz or skill)
     */
    _unselectAllSelectedCards(previousCard) {
        if (!previousCard) return;
        if (previousCard.type === 'biz') {
            this.commandResumeController('unselect', previousCard.jobNumber);
            this.commandCardsController('unselect', previousCard.jobNumber);
            setTimeout(() => this.validateCloneCleanup(previousCard.jobNumber), 100);
        } else {
            this.commandCardsController('unselect-skill', previousCard.skillCardId);
        }
    }

    clearSelection(caller = 'unknown') {
        const previousCard = this.selectedCard;
        this.selectedCard = null;
        this.selectedJobNumber = null;

        console.log(`[SelectionManager] 🚀 COMMANDING CLEAR SELECTION (${caller})`);

        if (AppState) {
            AppState.selectedJobNumber = null;
            saveState(AppState);
        }

        this._unselectAllSelectedCards(previousCard);

        this.eventTarget.dispatchEvent(new CustomEvent('selection-cleared', {
            detail: { previousCard, previousSelection: previousCard?.type === 'biz' ? previousCard.jobNumber : null }
        }));
        this.eventTarget.dispatchEvent(new CustomEvent('selectionCleared', {
            detail: { caller }
        }));
        console.log(`[SelectionManager] ✅ Selection clear commands issued by ${caller}`);
    }

    /** Dispatch card-selected so CardsController can show the selected card's clone (only one card selected at a time) */
    dispatchCardSelected(card, previousCard, caller) {
        this.eventTarget.dispatchEvent(new CustomEvent('card-selected', {
            detail: { card, previousCard, source: caller }
        }));
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
        
        // Command controllers to handle hover
        this.commandResumeController('hover', jobNumber);
        this.commandCardsController('hover', jobNumber);
        
        // Dispatch hover event for legacy listeners
        this.eventTarget.dispatchEvent(new CustomEvent('job-hovered', {
            detail: { jobNumber }
        }));
    }

    // Legacy API compatibility for recovered controllers
    hoverJobNumber(jobNumber, caller = 'unknown') {
        // Cancel any pending hover clear
        if (this._hoverClearTimeout) {
            console.log(`🖱️ [SelectionManager] Canceling clearHover timeout due to new hover from ${caller}`);
            clearTimeout(this._hoverClearTimeout);
            this._hoverClearTimeout = null;
        }
        
        // Reset the callers set since we're starting a new hover
        if (this._hoverClearCallers) {
            this._hoverClearCallers.clear();
        }
        
        const previousHover = this.hoveredJobNumber;
        this.hoveredJobNumber = jobNumber;
        
        // Clear previous hover if it's different from the new one
        if (previousHover !== null && previousHover !== jobNumber) {
            this.commandResumeController('unhover', previousHover);
            this.commandCardsController('unhover', previousHover);
        }
        
        // Dispatch both new and legacy events for compatibility
        this.eventTarget.dispatchEvent(new CustomEvent('job-hovered', {
            detail: { jobNumber }
        }));
        
        this.eventTarget.dispatchEvent(new CustomEvent('hoverChanged', {
            detail: { hoveredJobNumber: jobNumber, caller }
        }));
    }

    clearHover(caller = 'unknown') {
        console.log(`🖱️ [SelectionManager] clearHover called by: ${caller}, current hover: ${this.hoveredJobNumber}`);
        
        // Track which element triggered the clear
        if (!this._hoverClearCallers) {
            this._hoverClearCallers = new Set();
        }
        this._hoverClearCallers.add(caller);
        
        // Check if we have both rDiv and cDiv clear requests
        const hasResumeClear = this._hoverClearCallers.has('ResumeItemsController.handleMouseLeaveEvent') || 
                              this._hoverClearCallers.has('ResumeListController.handleMouseLeaveEvent');
        const hasCardsClear = this._hoverClearCallers.has('CardsController.mouseleave');
        
        console.log(`🖱️ [SelectionManager] Clear callers:`, Array.from(this._hoverClearCallers));
        console.log(`🖱️ [SelectionManager] Has resume clear: ${hasResumeClear}, Has cards clear: ${hasCardsClear}`);
        
        // Only clear if we have both resume and cards clear requests, or if it's been long enough
        if (hasResumeClear && hasCardsClear) {
            console.log(`🖱️ [SelectionManager] Both resume and cards cleared - clearing hover immediately`);
            this._executeHoverClear(caller);
        } else {
            // Debounce hover clearing to prevent rapid enter/leave conflicts
            if (this._hoverClearTimeout) {
                console.log(`🖱️ [SelectionManager] Canceling previous clearHover timeout`);
                clearTimeout(this._hoverClearTimeout);
            }
            
            this._hoverClearTimeout = setTimeout(() => {
                console.log(`🖱️ [SelectionManager] Executing delayed clearHover for job ${this.hoveredJobNumber}`);
                this._executeHoverClear(caller);
            }, 150); // 150ms debounce to prevent rapid enter/leave conflicts
        }
    }
    
    _executeHoverClear(caller) {
        const previousHover = this.hoveredJobNumber;
        this.hoveredJobNumber = null;
        
        // Command controllers to clear hover
        if (previousHover !== null) {
            this.commandResumeController('unhover', previousHover);
            this.commandCardsController('unhover', previousHover);
        }
        
        // Dispatch legacy clear hover event
        this.eventTarget.dispatchEvent(new CustomEvent('hoverCleared', {
            detail: { caller }
        }));
        
        // Reset the callers set
        this._hoverClearCallers.clear();
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

    // =============================================================================
    // HIGH-LEVEL ORCHESTRATION METHODS
    // =============================================================================

    /**
     * STEP 0: Clear all existing selections across the entire application
     */
    clearAllSelections() {
        console.log(`[SelectionManager] 🧹 Clearing all existing selections`);
        
        // Clear all rDiv selections
        document.querySelectorAll('.biz-resume-div.selected').forEach(div => {
            div.classList.remove('selected');
        });
        
        // Hide all clones and show all originals (one selected card at a time; clones are .clone)
        document.querySelectorAll('.biz-card-div.clone').forEach(clone => {
            clone.style.setProperty('display', 'none', 'important');
        });
        
        document.querySelectorAll('.biz-card-div.hasClone').forEach(original => {
            original.style.removeProperty('display');
            original.classList.remove('hasClone');
        });
        
        // Clear any hover states
        document.querySelectorAll('.biz-resume-div.hovered, .biz-card-div.hovered').forEach(div => {
            div.classList.remove('hovered');
        });
        
        console.log(`[SelectionManager] ✅ Cleared all selections across rDivs and cDivs`);
    }

    /**
     * STEP 1: Style rDiv as selected
     */
    styleRDivAsSelected(jobNumber) {
        const rDiv = document.querySelector(`[data-job-number="${jobNumber}"].biz-resume-div`);
        if (rDiv) {
            // Clear previous selections
            document.querySelectorAll('.biz-resume-div.selected').forEach(div => {
                div.classList.remove('selected');
            });
            
            rDiv.classList.add('selected');
            console.log(`[SelectionManager] ✅ Styled rDiv as selected for job ${jobNumber}`);
        } else {
            console.error(`[SelectionManager] ❌ rDiv not found for job ${jobNumber}`);
        }
    }

    /**
     * STEP 2: Scroll rDiv into view
     */
    scrollRDivIntoView(jobNumber) {
        const rDiv = document.querySelector(`[data-job-number="${jobNumber}"].biz-resume-div`);
        if (rDiv) {
            rDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            console.log(`[SelectionManager] ✅ Scrolled rDiv into view for job ${jobNumber}`);
        } else {
            console.error(`[SelectionManager] ❌ rDiv not found for scrolling job ${jobNumber}`);
        }
    }

    /**
     * STEP 3: Clear rDiv selection for previous job
     */
    clearRDivSelection(jobNumber) {
        const rDiv = document.querySelector(`[data-job-number="${jobNumber}"].biz-resume-div`);
        if (rDiv) {
            rDiv.classList.remove('selected');
            console.log(`[SelectionManager] ✅ Cleared rDiv selection for job ${jobNumber}`);
        }
    }

    /**
     * STEP 4a: Hide original cDiv
     */
    hideJobOriginal(jobNumber) {
        const elementRegistry = window.globalElementRegistry;
        if (!elementRegistry) {
            console.error(`[SelectionManager] ❌ globalElementRegistry not available`);
            return;
        }

        const originalCard = document.getElementById(`biz-card-div-${jobNumber}`);
        if (originalCard) {
            originalCard.style.setProperty('display', 'none', 'important');
            originalCard.classList.add('hasClone');
            console.log(`[SelectionManager] ✅ Hidden original cDiv for job ${jobNumber}`);
        } else {
            console.error(`[SelectionManager] ❌ Original cDiv not found for job ${jobNumber}`);
        }
    }

    /**
     * STEP 4b: Show original cDiv (for cleanup)
     */
    showJobOriginal(jobNumber) {
        const originalCard = document.getElementById(`biz-card-div-${jobNumber}`);
        if (originalCard) {
            originalCard.style.removeProperty('display');
            originalCard.classList.remove('hasClone');
            console.log(`[SelectionManager] ✅ Restored original cDiv for job ${jobNumber}`);
        }
    }

    /**
     * STEP 4c: Hide cDiv clone
     */
    hideJobClone(jobNumber) {
        const clone = document.getElementById(`biz-card-div-${jobNumber}-clone`);
        if (clone) {
            clone.style.setProperty('display', 'none', 'important');
            console.log(`[SelectionManager] ✅ Hidden clone for job ${jobNumber}`);
        }
    }

    /**
     * STEP 4d: Show or create cDiv clone
     */
    showOrCreateJobClone(jobNumber) {
        let clone = document.getElementById(`biz-card-div-${jobNumber}-clone`);
        
        if (!clone) {
            // Create the clone
            console.log(`[SelectionManager] 🔨 Creating clone for job ${jobNumber}`);
            this.createJobClone(jobNumber);
            clone = document.getElementById(`biz-card-div-${jobNumber}-clone`);
        }
        
        if (clone) {
            clone.style.removeProperty('display');
            clone.style.setProperty('display', 'block', 'important');
            console.log(`[SelectionManager] ✅ Showed clone for job ${jobNumber}`);
        } else {
            console.error(`[SelectionManager] ❌ Failed to create/show clone for job ${jobNumber}`);
        }
    }

    /**
     * Create a deep clone of the original cDiv positioned at bulls-eye center
     */
    createJobClone(jobNumber) {
        const scenePlane = window.globalElementRegistry?.getScenePlane();
        const originalCard = document.getElementById(`biz-card-div-${jobNumber}`);
        
        if (!scenePlane || !originalCard) {
            console.error(`[SelectionManager] ❌ Cannot create clone - missing scenePlane or originalCard`);
            return;
        }

        // Create deep clone
        const clone = originalCard.cloneNode(true);
        clone.id = `${originalCard.id}-clone`;
        clone.classList.add('clone');
        clone.classList.add('selected');
        
        // Position at bulls-eye center initially (will be refined in Step 6)
        clone.style.position = 'absolute';
        clone.style.left = '0px';
        clone.style.top = '50%';
        clone.style.transform = 'translate(-50%, -50%)';
        clone.style.zIndex = '1000';
        
        scenePlane.appendChild(clone);
        console.log(`[SelectionManager] ✅ Created clone for job ${jobNumber} (will be positioned at bulls-eye in Step 6)`);
    }

    /**
     * STEP 5: Style cDiv clone as selected
     */
    styleCDivAsSelected(jobNumber) {
        const clone = document.getElementById(`biz-card-div-${jobNumber}-clone`);
        if (clone) {
            console.log(`[SelectionManager] ✅ Clone for job ${jobNumber} (selected card = clone)`);
        } else {
            console.error(`[SelectionManager] ❌ Clone not found for job ${jobNumber}`);
        }
    }

    /**
     * STEP 6: Position clone at bulls-eye center
     */
    positionCloneAtSceneCenter(jobNumber) {
        const clone = document.getElementById(`biz-card-div-${jobNumber}-clone`);
        if (!clone) {
            console.error(`[SelectionManager] ❌ Clone not found for positioning job ${jobNumber}`);
            return;
        }

        // Get bulls-eye center position
        let bullsEyeCenterX = 0;
        let bullsEyeCenterY = '50%';

        // Try to get bulls-eye position from global bulls-eye service
        if (window.bullsEye && typeof window.bullsEye.getBullsEyePosition === 'function') {
            const bullsEyePos = window.bullsEye.getBullsEyePosition();
            if (bullsEyePos && typeof bullsEyePos.x === 'number') {
                bullsEyeCenterX = bullsEyePos.x;
                console.log(`[SelectionManager] 🎯 Got bulls-eye X from window.bullsEye: ${bullsEyeCenterX}`);
            }
        }

        // Fallback: try to get from bulls-eye element
        if (bullsEyeCenterX === 0) {
            const bullsEyeElement = window.globalElementRegistry?.getElement('bulls-eye');
            if (bullsEyeElement) {
                const bullsEyeRect = bullsEyeElement.getBoundingClientRect();
                const sceneContainer = window.globalElementRegistry?.getSceneContainer();
                if (sceneContainer) {
                    const sceneRect = sceneContainer.getBoundingClientRect();
                    bullsEyeCenterX = bullsEyeRect.left + (bullsEyeRect.width / 2) - sceneRect.left;
                    console.log(`[SelectionManager] 🎯 Calculated bulls-eye X from element: ${bullsEyeCenterX}`);
                }
            }
        }

        // Final fallback: use scene container center
        if (bullsEyeCenterX === 0) {
            const sceneContainer = window.globalElementRegistry?.getSceneContainer();
            if (sceneContainer) {
                const sceneRect = sceneContainer.getBoundingClientRect();
                bullsEyeCenterX = sceneRect.width / 2;
                console.log(`[SelectionManager] 🎯 Using scene container center X: ${bullsEyeCenterX}`);
            }
        }

        // Position clone at bulls-eye center
        clone.style.position = 'absolute';
        clone.style.left = `${bullsEyeCenterX}px`;
        clone.style.top = bullsEyeCenterY;
        clone.style.transform = 'translate(-50%, -50%)'; // Center the clone on the bulls-eye
        clone.style.zIndex = '1000';

        console.log(`[SelectionManager] ✅ Positioned clone at bulls-eye center (${bullsEyeCenterX}, ${bullsEyeCenterY}) for job ${jobNumber}`);

        // Store the bulls-eye position on the clone for reference
        clone._bullsEyeCenterX = bullsEyeCenterX;
        clone._bullsEyeCenterY = bullsEyeCenterY;
    }

    /**
     * STEP 7: Scroll cDiv clone header into view with healthy gap from top
     */
    scrollCDivHeaderIntoView(jobNumber) {
        const clone = document.getElementById(`biz-card-div-${jobNumber}-clone`);
        if (!clone) {
            console.error(`[SelectionManager] ❌ Clone not found for header scrolling job ${jobNumber}`);
            return;
        }

        // Get the scene container to determine scroll context
        const sceneContainer = window.globalElementRegistry?.getSceneContainer();
        if (!sceneContainer) {
            console.error(`[SelectionManager] ❌ Scene container not found for header scrolling`);
            return;
        }

        // Find all header fields within the clone
        const headerSelectors = [
            '.biz-details-role',
            '.biz-details-employer', 
            '.biz-details-duration',
            '.biz-card-header',
            '.job-header',
            '.job-title',
            '.company-name'
        ];
        
        let headerElements = [];
        headerSelectors.forEach(selector => {
            const elements = clone.querySelectorAll(selector);
            headerElements.push(...elements);
        });

        if (headerElements.length === 0) {
            // Fallback: use the clone itself
            headerElements = [clone];
            console.log(`[SelectionManager] 📍 No specific header elements found, using clone itself`);
        }

        // Find the topmost header element
        let topMostHeader = headerElements[0];
        let topMostY = Infinity;
        
        headerElements.forEach(element => {
            const rect = element.getBoundingClientRect();
            if (rect.top < topMostY) {
                topMostY = rect.top;
                topMostHeader = element;
            }
        });

        // Calculate healthy gap (20% of container height or minimum 60px) - no additional offset
        const containerRect = sceneContainer.getBoundingClientRect();
        const baseHealthyGap = Math.max(60, containerRect.height * 0.2);
        const additionalDownOffset = 100; // Test with 100px additional gap
        const healthyGap = baseHealthyGap + additionalDownOffset;
        
        console.log(`[SelectionManager] 📏 Container height: ${containerRect.height}px, base gap: ${baseHealthyGap}px, additional down offset: ${additionalDownOffset}px, total gap: ${healthyGap}px`);

        // Scroll the topmost header into view with the healthy gap
        const headerRect = topMostHeader.getBoundingClientRect();
        const targetScrollTop = sceneContainer.scrollTop + headerRect.top - containerRect.top - healthyGap;
        
        console.log(`[SelectionManager] 📍 Scrolling to position: ${targetScrollTop} (header at ${headerRect.top}, gap: ${healthyGap})`);
        
        // Smooth scroll to the calculated position
        sceneContainer.scrollTo({
            top: targetScrollTop,
            behavior: 'smooth'
        });

        // TEMPORARY: Add fallback scroll for debugging
        setTimeout(() => {
            console.log(`[SelectionManager] 🔧 DEBUGGING: Applying fallback scroll after 200ms`);
            topMostHeader.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'start',
                inline: 'nearest'
            });
        }, 200);

        // DISABLED: Alternative scrollIntoView method (was overriding our custom gap calculation)
        // setTimeout(() => {
        //     topMostHeader.scrollIntoView({ 
        //         behavior: 'smooth', 
        //         block: 'start',
        //         inline: 'nearest'
        //     });
        //     
        //     // Apply additional offset after scrollIntoView completes (increase gap to move cDiv down)
        //     setTimeout(() => {
        //         const currentScrollTop = sceneContainer.scrollTop;
        //         const adjustedScrollTop = Math.max(0, currentScrollTop - baseHealthyGap + 20 - additionalDownOffset);
        //         sceneContainer.scrollTo({
        //             top: adjustedScrollTop,
        //             behavior: 'smooth'
        //         });
        //         console.log(`[SelectionManager] ✅ Applied scroll adjustment to increase gap by 50px (move cDiv lower): ${adjustedScrollTop}`);
        //     }, 100);
        // }, 50);

        console.log(`[SelectionManager] ✅ Scrolled clone header fields into view with healthy gap for job ${jobNumber}`);
    }

    /**
     * Dispatch events for any remaining listeners that need to react
     */
    dispatchSelectionEvents(jobNumber, previousSelection, caller) {
        const dataJobObject = this.getJobDataByNumber(jobNumber);
        
        // Dispatch both new and legacy events for compatibility
        this.eventTarget.dispatchEvent(new CustomEvent('job-selected', {
            detail: { 
                jobNumber, 
                dataJobObject,
                previousSelection,
                source: caller 
            }
        }));

        // Legacy event for recovered controllers
        this.eventTarget.dispatchEvent(new CustomEvent('selectionChanged', {
            detail: { 
                selectedJobNumber: jobNumber, 
                caller 
            }
        }));
        
        console.log(`[SelectionManager] ✅ Dispatched selection events for job ${jobNumber}`);
    }

}

// Create and export singleton
export const selectionManager = new SelectionManager();
export default selectionManager;
