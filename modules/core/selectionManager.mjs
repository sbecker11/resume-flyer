import { AppState, saveState } from './stateManager.mjs';
import { getGlobalJobsDependency } from '../composables/useJobsDependency.mjs';

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
        console.debug('[SelectionManager] Instance created');
        
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
        // Selection is content-scoped — job numbers belong to loaded resume, not app_state.
        // No selection is restored on startup; content loads fresh each time.
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

        console.debug('[SelectionManager] selectCard', caller, card?.type, card?.type === 'biz' ? card?.jobNumber : card?.skillCardId);

        if (card.type === 'biz') {
            const previousJobNumber = previousCard?.type === 'biz' ? previousCard.jobNumber : null;
            this.commandControllers(card.jobNumber, previousJobNumber, caller);
            this.dispatchCardSelected(this.selectedCard, previousCard, caller);
            this.dispatchSelectionEvents(card.jobNumber, previousJobNumber, caller);
            const dataJobObject = this.getJobDataByNumber(card.jobNumber);
            console.debug('[SelectionManager] Biz card selected', dataJobObject?.employer);
        } else {
            this.dispatchCardSelected(this.selectedCard, previousCard, caller);
            this.commandCardsController('select-skill', card.skillCardId);
            const skillCardId = card.skillCardId;
            const detail = { skillCardId };
            const ev = new CustomEvent('resume-skill-card-scrollIntoView', { detail });
            this.eventTarget.dispatchEvent(ev);
            if (typeof window !== 'undefined') window.dispatchEvent(ev);
            if (typeof document !== 'undefined') document.dispatchEvent(ev);
            console.log('[SkillCard] Selected → resume listing updated', skillCardId);
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
        console.debug('[SelectionManager] commandControllers', jobNumber);
        // Previous selection already cleared by _unselectAllSelectedCards before selectJobNumber/selectSkillCard

        // Command new selection
        this.commandResumeController('select', jobNumber);
        this.commandCardsController('select', jobNumber);
        
        // Command scroll into view
        this.commandResumeController('scrollIntoView', jobNumber);
        this.commandCardsController('scrollIntoView', jobNumber);
        
        // CRITICAL: Dispatch the legacy job-selected event that CardsController expects
        console.debug('[SelectionManager] job-selected', jobNumber);
        this.dispatchSelectionEvents(jobNumber, previousSelection, caller);
    }

    /**
     * Command Resume Controller
     */
    commandResumeController(action, jobNumber) {
        console.debug('[SelectionManager] → ResumeController', action, jobNumber ?? 'all');
        
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
        console.debug('[SelectionManager] → CardsController', action, payload ?? 'all');
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

        console.debug('[SelectionManager] clearSelection', caller);

        this._unselectAllSelectedCards(previousCard);

        this.eventTarget.dispatchEvent(new CustomEvent('selection-cleared', {
            detail: { previousCard, previousSelection: previousCard?.type === 'biz' ? previousCard.jobNumber : null }
        }));
        this.eventTarget.dispatchEvent(new CustomEvent('selectionCleared', {
            detail: { caller }
        }));
        console.debug('[SelectionManager] selection cleared');
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

    /** Current selection as card: { type: 'biz', jobNumber } | { type: 'skill', skillCardId } | null. */
    getSelectedCard() {
        return this.selectedCard ?? null;
    }

    getJobDataByNumber(jobNumber) {
        if (jobNumber === null || jobNumber === undefined) {
            return null;
        }
        const jobs = getGlobalJobsDependency().getJobsData();
        if (!Array.isArray(jobs)) return null;
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
            console.debug('[SelectionManager] clearHover timeout canceled');
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
        console.debug('[SelectionManager] clearHover', caller);
        
        // Track which element triggered the clear
        if (!this._hoverClearCallers) {
            this._hoverClearCallers = new Set();
        }
        this._hoverClearCallers.add(caller);
        
        // Check if we have both rDiv and cDiv clear requests
        const hasResumeClear = this._hoverClearCallers.has('ResumeItemsController.handleMouseLeaveEvent') || 
                              this._hoverClearCallers.has('ResumeListController.handleMouseLeaveEvent');
        const hasCardsClear = this._hoverClearCallers.has('CardsController.mouseleave');
        
        console.debug('[SelectionManager] clearHover callers', { hasResumeClear, hasCardsClear });
        
        // Only clear if we have both resume and cards clear requests, or if it's been long enough
        if (hasResumeClear && hasCardsClear) {
            console.debug('[SelectionManager] hover cleared (both resume and cards)');
            this._executeHoverClear(caller);
        } else {
            // Debounce hover clearing to prevent rapid enter/leave conflicts
            if (this._hoverClearTimeout) {
                console.debug('[SelectionManager] previous clearHover timeout canceled');
                clearTimeout(this._hoverClearTimeout);
            }
            
            this._hoverClearTimeout = setTimeout(() => {
                console.debug('[SelectionManager] delayed clearHover executed');
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
        console.debug(`[SelectionManager] validatePageLoadState ${timing}`);
        
        // Check all jobs for violations during page load
        for (let jobNumber = 0; jobNumber < 25; jobNumber++) {
            try {
                this.validateCloneVisibility(jobNumber);
            } catch (error) {
                console.error(`🚨 [${timing}] HARD-REFRESH VIOLATION DETECTED:`);
                throw error; // Re-throw to stop execution
            }
        }
        
        console.debug(`[SelectionManager] page load validation passed ${timing}`);
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
        
        console.debug('[SelectionManager] cleanup validation ok', jobNumber);
    }

    // =============================================================================
    // HIGH-LEVEL ORCHESTRATION METHODS
    // =============================================================================

    /**
     * STEP 0: Clear all existing selections across the entire application
     */
    clearAllSelections() {
        console.debug('[SelectionManager] clearAllSelections');
        
        // Clear all rDiv selections
        document.querySelectorAll('.biz-resume-div.selected').forEach(div => {
            div.classList.remove('selected');
        });
        
        // Hide all clones and show all originals (class-based; no inline display)
        document.querySelectorAll('.biz-card-div.clone').forEach(clone => {
            clone.classList.add('clone-hidden');
        });
        document.querySelectorAll('.biz-card-div.hasClone').forEach(original => {
            original.classList.remove('hasClone', 'force-hidden-for-clone');
        });
        
        // Clear any hover states (scene and resume identical: biz and skill)
        document.querySelectorAll('.biz-resume-div.hovered, .biz-card-div.hovered, .skill-resume-div.hovered, .skill-card-div.hovered').forEach(div => {
            div.classList.remove('hovered');
        });
        
        console.debug('[SelectionManager] all selections cleared');
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
            console.debug('[SelectionManager] rDiv styled selected', jobNumber);
        } else {
            console.error(`[SelectionManager] ❌ rDiv not found for job ${jobNumber}`);
        }
    }

    /**
     * STEP 2: Scroll rDiv into view
     */
    scrollRDivIntoView(jobNumber) {
        const SCROLL_TOP_GAP = 8;
        const rDiv = document.querySelector(`[data-job-number="${jobNumber}"].biz-resume-div`);
        if (rDiv) {
            const scrollport = rDiv.closest('#resume-content-listing');
            if (scrollport) {
                const rDivRect = rDiv.getBoundingClientRect();
                const portRect = scrollport.getBoundingClientRect();
                const portPaddingTop = parseFloat(getComputedStyle(scrollport).paddingTop) || 0;
                const innerTop = portRect.top + portPaddingTop;
                // Only scroll if the top border edge is above or too close to the inner top edge
                if (rDivRect.top < innerTop + SCROLL_TOP_GAP) {
                    scrollport.scrollTo({
                        top: scrollport.scrollTop + rDivRect.top - innerTop - SCROLL_TOP_GAP,
                        behavior: 'smooth'
                    });
                }
            } else {
                rDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
            console.debug('[SelectionManager] rDiv scrolled into view', jobNumber);
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
            console.debug('[SelectionManager] rDiv selection cleared', jobNumber);
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
            originalCard.classList.add('hasClone', 'force-hidden-for-clone');
            console.debug('[SelectionManager] original cDiv hidden', jobNumber);
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
            originalCard.classList.remove('hasClone', 'force-hidden-for-clone');
            console.debug('[SelectionManager] original cDiv restored', jobNumber);
        }
    }

    /**
     * STEP 4c: Hide cDiv clone
     */
    hideJobClone(jobNumber) {
        const clone = document.getElementById(`biz-card-div-${jobNumber}-clone`);
        if (clone) {
            clone.classList.add('clone-hidden');
            console.debug('[SelectionManager] clone hidden', jobNumber);
        }
    }

    /**
     * STEP 4d: Show or create cDiv clone
     */
    showOrCreateJobClone(jobNumber) {
        let clone = document.getElementById(`biz-card-div-${jobNumber}-clone`);
        
        if (!clone) {
            // Create the clone
            console.debug('[SelectionManager] creating clone', jobNumber);
            this.createJobClone(jobNumber);
            clone = document.getElementById(`biz-card-div-${jobNumber}-clone`);
        }
        
        if (clone) {
            clone.classList.remove('clone-hidden');
            console.debug('[SelectionManager] clone shown', jobNumber);
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
        console.debug('[SelectionManager] clone created', jobNumber);
    }

    /**
     * STEP 5: Style cDiv clone as selected
     */
    styleCDivAsSelected(jobNumber) {
        const clone = document.getElementById(`biz-card-div-${jobNumber}-clone`);
        if (clone) {
            console.debug('[SelectionManager] clone styled selected', jobNumber);
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

        // Try to get bulls-eye position from single app-state object
        const bullsEyeApi = window.resumeFlock?.bullsEye;
        if (bullsEyeApi && typeof bullsEyeApi.getPosition === 'function') {
            const bullsEyePos = bullsEyeApi.getPosition();
            if (bullsEyePos && typeof bullsEyePos.x === 'number') {
                bullsEyeCenterX = bullsEyePos.x;
                console.debug('[SelectionManager] bulls-eye X from window.resumeFlock.bullsEye', bullsEyeCenterX);
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
                    console.debug('[SelectionManager] bulls-eye X from element', bullsEyeCenterX);
                }
            }
        }

        // Final fallback: use scene container center
        if (bullsEyeCenterX === 0) {
            const sceneContainer = window.globalElementRegistry?.getSceneContainer();
            if (sceneContainer) {
                const sceneRect = sceneContainer.getBoundingClientRect();
                bullsEyeCenterX = sceneRect.width / 2;
                console.debug('[SelectionManager] bulls-eye X from scene center', bullsEyeCenterX);
            }
        }

        // Position clone at bulls-eye center
        clone.style.position = 'absolute';
        clone.style.left = `${bullsEyeCenterX}px`;
        clone.style.top = bullsEyeCenterY;
        clone.style.transform = 'translate(-50%, -50%)'; // Center the clone on the bulls-eye
        clone.style.zIndex = '1000';

        console.debug('[SelectionManager] clone positioned at bulls-eye', jobNumber);

        // Store the bulls-eye position on the clone for reference
        clone._bullsEyeCenterX = bullsEyeCenterX;
        clone._bullsEyeCenterY = bullsEyeCenterY;
    }

    /**
     * STEP 7: Scroll cDiv clone header into view with healthy gap from top
     */
    scrollCDivHeaderIntoView(jobNumber) {
        const SCROLL_TOP_GAP = 8;
        const clone = document.getElementById(`biz-card-div-${jobNumber}-clone`);
        if (!clone) {
            console.error(`[SelectionManager] ❌ Clone not found for header scrolling job ${jobNumber}`);
            return;
        }

        // Use scene-content (the scrollable element), not scene-container (the outer wrapper)
        const sceneContent = window.globalElementRegistry?.getSceneContent?.()
            || document.getElementById('scene-content');
        if (!sceneContent) {
            console.error(`[SelectionManager] ❌ scene-content not found for cDiv scrolling`);
            return;
        }

        // Scroll so the clone's top border edge is exactly SCROLL_TOP_GAP from the inner top edge
        const cloneRect = clone.getBoundingClientRect();
        const contentRect = sceneContent.getBoundingClientRect();
        const paddingTop = parseFloat(getComputedStyle(sceneContent).paddingTop) || 0;
        const innerTop = contentRect.top + paddingTop;
        const targetScrollTop = sceneContent.scrollTop + cloneRect.top - innerTop - SCROLL_TOP_GAP;

        sceneContent.scrollTo({
            top: Math.max(0, targetScrollTop),
            behavior: 'smooth'
        });

        console.debug('[SelectionManager] clone header scrolled into view', jobNumber);
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
        
        console.debug('[SelectionManager] selection events dispatched', jobNumber);
    }

}

// Create and export singleton
export const selectionManager = new SelectionManager();
export default selectionManager;
