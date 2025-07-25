import { AppState, saveState } from './stateManager.mjs';
import { BaseComponent } from './abstracts/BaseComponent.mjs';

class SelectionManager extends BaseComponent {
    constructor() {
        super('SelectionManager');
        
        // Add EventTarget functionality since BaseComponent doesn't provide it
        this.eventTarget = new EventTarget();
        this.selectedJobNumber = null;
        this.hoveredJobNumber = null;
        
        // Smooth scrolling configuration
        this.smoothScrollConfig = {
            behavior: 'smooth',
            topMargin: 50, // Default margin from top of viewport
            tolerance: 20  // Pixel tolerance for "already positioned" checks
        };
    }

    getPriority() {
        return 'high'; // Initialize early
    }

    getDependencies() {
        return []; // SelectionManager is a fundamental component with no IM dependencies
    }

    initialize(dependencies = {}) {
        console.log('[SelectionManager] Initialized');
        // SelectionManager is ready - no special initialization needed
    }

    /**
     * DOM setup phase - called after DOM is ready
     * SelectionManager doesn't need DOM operations in initialize
     */
    async setupDom() {
        // SelectionManager operates on events, not direct DOM access
        console.log('[SelectionManager] DOM setup complete');
    }

    destroy() {
        this.selectedJobNumber = null;
        this.hoveredJobNumber = null;
    }

    // EventTarget method delegation
    addEventListener(type, listener, options) {
        return this.eventTarget.addEventListener(type, listener, options);
    }

    removeEventListener(type, listener, options) {
        return this.eventTarget.removeEventListener(type, listener, options);
    }

    dispatchEvent(event) {
        return this.eventTarget.dispatchEvent(event);
    }

    selectJobNumber(jobNumber, caller = '') {
        // console.log(`SelectionManager.selectJobNumber called with jobNumber=${jobNumber}, caller=${caller}`);
        if (this.selectedJobNumber === jobNumber) {
            console.log(`SelectionManager: Early return - same job already selected: ${jobNumber} from ${caller}`);
            return;
        }

        // Clear hover state before setting selection to prevent state conflicts
        if (this.hoveredJobNumber !== null) {
            this.clearHover(`${caller}-auto-clear-before-select`);
        }

        // CRITICAL: Clear any existing selection first before setting new selection
        if (this.selectedJobNumber !== null) {
            const previousJobNumber = this.selectedJobNumber;
            console.log(`SelectionManager: [${caller}] Clearing previous selection ${previousJobNumber} before selecting ${jobNumber}`);
            this.selectedJobNumber = null; // Clear the selection
            this._clearAllVisualSelection(); // Clear all visual states
            this.dispatchEvent(new CustomEvent('selectionCleared', {
                detail: {
                    caller: `${caller}-auto-clear-before-select`,
                    previousJobNumber: previousJobNumber,
                    isPaired: true
                }
            }));
        }

        // console.log(`[DEBUG] SelectionManager: [${caller}] Selecting job number: ${jobNumber} (was: ${this.selectedJobNumber})`);
        this.selectedJobNumber = jobNumber;
        
        // Apply visual selection to all elements
        this._applyVisualSelection(jobNumber);
        
        // Update AppState to remember the selected job for hard refresh
        if (AppState) {
            AppState.selectedJobNumber = jobNumber;
            // Also update lastVisitedJobNumber to remember this selection
            AppState.lastVisitedJobNumber = jobNumber;
            // Clean up any stale selectedJob field from resume section
            if (AppState.resume && AppState.resume.selectedJob !== undefined) {
                delete AppState.resume.selectedJob;
                console.log(`SelectionManager: [${caller}] Cleaned up stale selectedJob field from resume section`);
            }
            saveState(AppState);
            console.log(`SelectionManager: [${caller}] Updated AppState selectedJobNumber to ${jobNumber} and lastVisitedJobNumber to ${jobNumber}`);
        }
        
        const event = new CustomEvent('selectionChanged', {
            detail: {
                selectedJobNumber: this.selectedJobNumber,
                caller: caller,
                isPaired: true // Flag to indicate both cDiv and rDiv should be selected
            }
        });
        // console.log(`SelectionManager: Dispatching selectionChanged event:`, event.detail);
        this.dispatchEvent(event);
    }

    clearSelection(caller = '') {
        if (this.selectedJobNumber === null) return;
        
        console.log(`SelectionManager: [${caller}] Clearing selection.`);
        this.selectedJobNumber = null;
        
        // Clear all visual selection states
        this._clearAllVisualSelection();
        
        // Update AppState to clear the selected job so it doesn't auto-select on hard refresh
        if (AppState) {
            AppState.selectedJobNumber = null;
            // Clean up any stale selectedJob field from resume section
            if (AppState.resume && AppState.resume.selectedJob !== undefined) {
                delete AppState.resume.selectedJob;
                console.log(`SelectionManager: [${caller}] Cleaned up stale selectedJob field from resume section during clear`);
            }
            saveState(AppState);
            console.log(`SelectionManager: [${caller}] Updated AppState selectedJobNumber to null`);
        }
        
        this.dispatchEvent(new CustomEvent('selectionCleared', {
            detail: {
                caller: caller,
                isPaired: true // Flag to indicate both cDiv and rDiv should be cleared
            }
        }));
    }

    hoverJobNumber(jobNumber, caller = '') {
        if (this.hoveredJobNumber === jobNumber) return;

        console.log(`SelectionManager: [${caller}] Hovering job number: ${jobNumber}`);
        this.hoveredJobNumber = jobNumber;
        this.dispatchEvent(new CustomEvent('hoverChanged', {
            detail: {
                hoveredJobNumber: this.hoveredJobNumber,
                caller: caller,
                isPaired: true // Flag to indicate both cDiv and rDiv should be hovered
            }
        }));
    }

    clearHover(caller = '') {
        if (this.hoveredJobNumber === null) return;

        console.log(`SelectionManager: [${caller}] Clearing hover.`);
        this.hoveredJobNumber = null;
        this.dispatchEvent(new CustomEvent('hoverCleared', {
            detail: {
                caller: caller,
                isPaired: true // Flag to indicate both cDiv and rDiv should clear hover
            }
        }));
    }

    getSelectedJobNumber() {
        return this.selectedJobNumber;
    }

    getHoveredJobNumber() {
        return this.hoveredJobNumber;
    }

    /**
     * Centralized smooth scrolling for elements with header positioning
     * @param {HTMLElement} element - The element to scroll into view
     * @param {HTMLElement} container - The scroll container
     * @param {string} headerSelector - CSS selector for header elements within the element
     * @param {string} caller - Caller identification for debugging
     * @returns {boolean} - Whether the scroll was performed
     */
    smoothScrollElementIntoView(element, container, headerSelector = '.biz-details-employer, .biz-details-role, .biz-details-dates, .biz-details-z-value', caller = '') {
        if (!element || !container) {
            console.log(`[DEBUG] SelectionManager.smoothScrollElementIntoView: Missing element or container from ${caller}`);
            return false;
        }

        // Get element position
        let elementTop;
        if (element.getAttribute && element.getAttribute('data-sceneTop')) {
            // For cDivs with scene positioning
            elementTop = parseFloat(element.getAttribute('data-sceneTop'));
        } else {
            // For rDivs or other elements, use getBoundingClientRect
            const containerRect = container.getBoundingClientRect();
            const elementRect = element.getBoundingClientRect();
            elementTop = elementRect.top - containerRect.top + container.scrollTop;
        }

        // Find header offset within the element
        let headerOffset = 0;
        const headerElement = element.querySelector(headerSelector);
        if (headerElement) {
            const elementRect = element.getBoundingClientRect();
            const headerRect = headerElement.getBoundingClientRect();
            headerOffset = headerRect.top - elementRect.top;
        }

        // Calculate optimal scroll position
        const scrollTarget = Math.max(0, elementTop + headerOffset - this.smoothScrollConfig.topMargin);
        
        console.log(`[DEBUG] SelectionManager.smoothScrollElementIntoView: ${caller} - Element top: ${elementTop}, Header offset: ${headerOffset}, Target: ${scrollTarget}`);

        // Check if already at correct position
        const currentScrollTop = container.scrollTop;
        const scrollDifference = Math.abs(currentScrollTop - scrollTarget);
        if (scrollDifference < this.smoothScrollConfig.tolerance) {
            console.log(`[DEBUG] SelectionManager.smoothScrollElementIntoView: ${caller} - Already positioned (difference: ${scrollDifference}px)`);
            return false;
        }

        // Perform smooth scroll
        container.scrollTo({
            top: scrollTarget,
            behavior: this.smoothScrollConfig.behavior
        });

        console.log(`[DEBUG] SelectionManager.smoothScrollElementIntoView: ${caller} - Smooth scroll initiated`);
        return true;
    }

    /**
     * Configure smooth scrolling behavior
     * @param {Object} config - Configuration object
     */
    configureSmoothScrolling(config = {}) {
        this.smoothScrollConfig = {
            ...this.smoothScrollConfig,
            ...config
        };
        console.log(`[DEBUG] SelectionManager: Smooth scroll config updated:`, this.smoothScrollConfig);
    }

    /**
     * INTERNAL METHOD: Apply visual selection state to all elements for a job
     * This method should ONLY be called by SelectionManager
     * @private
     */
    _applyVisualSelection(jobNumber) {
        // Apply selection to cDiv (scene card)
        const cDiv = document.querySelector(`.biz-card-div[data-job-number="${jobNumber}"]`);
        if (cDiv) {
            cDiv.classList.add('selected');
            console.log(`SelectionManager: Applied 'selected' to cDiv for job ${jobNumber}`);
        }

        // Apply selection to cDiv clone
        const cDivClone = document.getElementById(`biz-card-div-${jobNumber}-clone`);
        if (cDivClone) {
            cDivClone.classList.add('selected');
            console.log(`SelectionManager: Applied 'selected' to cDiv clone for job ${jobNumber}`);
        }

        // Apply selection to rDiv (resume card)
        const rDiv = document.querySelector(`.biz-resume-div[data-job-number="${jobNumber}"]`);
        if (rDiv) {
            rDiv.classList.add('selected');
            console.log(`SelectionManager: Applied 'selected' to rDiv for job ${jobNumber}`);
        }

        console.log(`SelectionManager: Applied visual selection to job ${jobNumber}`);
    }

    /**
     * INTERNAL METHOD: Clear visual selection state from all elements
     * This method should ONLY be called by SelectionManager
     * @private
     */
    _clearAllVisualSelection() {
        // Clear selection from all cDivs
        document.querySelectorAll('.biz-card-div').forEach(div => {
            div.classList.remove('selected', 'hovered');
        });

        // Clear selection from all rDivs
        document.querySelectorAll('.biz-resume-div').forEach(div => {
            div.classList.remove('selected', 'hovered');
        });

        // Clear selection from all clones
        document.querySelectorAll('[id$="-clone"]').forEach(clone => {
            clone.classList.remove('selected', 'hovered');
        });

        console.log(`SelectionManager: Cleared all visual selection states`);
    }
}

export const selectionManager = new SelectionManager(); 