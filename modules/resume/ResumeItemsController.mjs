// resume/ResumeItemsController.mjs

import * as utils from '../utils/utils.mjs';
// import * as BizDetailsDivModule from './bizDetailsDivModule.mjs'; // Module doesn't exist - needs to be recreated
import { selectionManager } from '../core/selectionManager.mjs';
// import { cardsController } from './CardsController.mjs'; // Now using Vue composable approach
import { applyPaletteToElement } from '../composables/useColorPalette.mjs';
// import { initializationManager } from '../core/initializationManager.mjs'; // IM framework no longer used
import { jobs } from '../data/enrichedJobs.mjs';
// No longer directly manipulating other managers
// import { bizCardDivManager } from './bizCardDivManager.mjs';
// import * as scenePlane from './scenePlane.mjs';
// import { resumeManager } from '../resume/resumeManager.mjs';

class ResumeItemsController {
    constructor() {
        // Singleton pattern: return existing instance if one exists
        if (ResumeItemsController.instance) {
            window.CONSOLE_LOG_IGNORE('[DEBUG] ResumeItemsController: Returning existing singleton instance');
            return ResumeItemsController.instance;
        }

        // Create new instance
        window.CONSOLE_LOG_IGNORE('[DEBUG] ResumeItemsController: Creating new singleton instance');
        
        this.bizResumeDivs = [];
        /** Job numbers whose rDiv has been removed from the resume listing (red X). */
        this.dismissedJobNumbers = new Set();
        this.isInitialized = false;
        this._setupSelectionListeners();
        this._setupColorPaletteListener();
        
        // Store the singleton instance
        ResumeItemsController.instance = this;
        
        window.CONSOLE_LOG_IGNORE('[DEBUG] ResumeItemsController: Singleton instance created and stored');
    }

    /**
     * Register this controller with the initialization manager
     * This allows other components to wait for ResumeItemsController to be ready
     * NOTE: IM framework is no longer used - this method is kept for compatibility
     */
    registerForInitialization() {
        // initializationManager.register(
        //     'ResumeItemsController',
        //     async () => {
        //         // Wait for CardsController to be ready
        //         await initializationManager.waitForComponent('CardsController');
        //         this.initialize();
        //     },
        //     ['CardsController'], // Depends on CardsController being ready
        //     { priority: 'medium' }
        // );
        
        // Simple initialization without IM framework
        this.initialize();
    }

    // This is now a separate function for the module manager to check.
    isInitialized() {
        return this.isInitialized;
    }

    initialize() {
        // if (!cardsController.isInitialized) {
        //     throw new Error("ResumeItemsController requires cardsController to be initialized.");
        // }
        // Note: Cards are now managed via Vue composables, so this check is no longer needed
        if (this.isInitialized) {
            window.CONSOLE_LOG_IGNORE("ResumeItemsController already initialized.");
            return;
        }
        // This controller's main job is done in the moduleManager now,
        // so we just set the flag.
        this.isInitialized = true;

    }

    async createAllBizResumeDivs(bizCardDivs) {
        window.CONSOLE_LOG_IGNORE('[ResumeItemsController] createAllBizResumeDivs called with:', bizCardDivs?.length || 0, 'cards');
        
        if (!bizCardDivs || bizCardDivs.length === 0) {
            console.warn("ResumeItemsController: Cannot create resume divs, no card divs provided.");
            return [];
        }
        
        this.bizResumeDivs = [];
        for (let i = 0; i < bizCardDivs.length; i++) {
            const cardDiv = bizCardDivs[i];
            // window.CONSOLE_LOG_IGNORE(`[ResumeItemsController] Processing card ${i}:`, cardDiv);
            
            if (!cardDiv) {
                console.warn(`[ResumeItemsController] Card at index ${i} is null/undefined, skipping`);
                continue;
            }
            
            try {
                const resumeDiv = await this.createBizResumeDiv(cardDiv);
                this.bizResumeDivs.push(resumeDiv);
            } catch (error) {
                console.error(`[ResumeItemsController] Failed to create resume div for card ${i}:`, error);
                throw error;
            }
        }
        return this.bizResumeDivs;
    }

    async createBizResumeDiv(bizCardDiv) {
        if (!bizCardDiv) throw new Error('createBizResumeDiv: bizCardDiv not found');

        const jobNumberStr = bizCardDiv.getAttribute('data-job-number');
        if (!utils.isNumericString(jobNumberStr)) {
            throw new Error('createBizResumeDiv: jobNumber is not a numeric string');
        }
        const jobNumber = parseInt(jobNumberStr, 10);
        
        const bizResumeDiv = document.createElement('div');
        bizResumeDiv.id = this.createBizResumeDivId(jobNumber);
        bizResumeDiv.className = 'biz-resume-div';
        bizResumeDiv.setAttribute('data-job-number', jobNumber);
        // Set color index to jobNumber (same logic as cDiv) - palette mapping happens in applyPaletteToElement
        bizResumeDiv.setAttribute('data-color-index', jobNumber);
        console.log(`[DEBUG] Color index set - Job ${jobNumber}: rDiv data-color-index=${jobNumber}`);

        // Create enhanced resume content with job details
        const bizResumeDetailsDiv = this.createEnhancedResumeDetailsDiv(jobNumber);
        bizResumeDiv.appendChild(bizResumeDetailsDiv);

        // Red X: remove this rDiv from the resume listing (same behavior as skill card red X)
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'r-div-close';
        closeBtn.setAttribute('aria-label', 'Remove from resume listing');
        closeBtn.setAttribute('data-job-number', String(jobNumber));
        closeBtn.textContent = '×';
        closeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.removeRDivFromListing(jobNumber);
        });
        bizResumeDiv.insertBefore(closeBtn, bizResumeDiv.firstChild);

        // Apply the current color palette
        await applyPaletteToElement(bizResumeDiv);

        // Apply normal state styling after palette application
        bizResumeDiv.classList.remove('hovered', 'selected');

        if (this.dismissedJobNumbers.has(jobNumber)) {
            bizResumeDiv.classList.add('r-div-removed-from-listing');
        }

        this._setupMouseListeners(bizResumeDiv);

        return bizResumeDiv;
    }

    /**
     * Remove the rDiv for the given job from the resume listing (persists until reload).
     */
    removeRDivFromListing(jobNumber) {
        this.dismissedJobNumbers.add(jobNumber);
        const listController = window.resumeListController;
        if (listController && typeof listController.removeJobFromListing === 'function') {
            listController.removeJobFromListing(jobNumber);
        } else {
            document.querySelectorAll(`[data-job-number="${jobNumber}"].biz-resume-div`).forEach((rDiv) => {
                rDiv.classList.add('r-div-removed-from-listing');
            });
        }
    }

    createBizResumeDivId(jobNumber) {
        return `resume-${jobNumber}`;
    }

    /**
     * Get job number from a biz-resume-div element. ID convention: id="resume-10" → 10.
     */
    getJobNumberFromBizResumeDiv(rDiv) {
        if (!rDiv) return null;
        const id = rDiv.id || '';
        const m = id.match(/^resume-(\d+)$/);
        if (m) return parseInt(m[1], 10);
        const attr = rDiv.getAttribute('data-job-number');
        if (attr == null || attr === '') return null;
        const n = parseInt(attr, 10);
        return Number.isNaN(n) ? null : n;
    }

    /**
     * Get the matching biz-card-div (original) from a biz-resume-div. ID convention:
     * rDiv id="resume-10" → cDiv id="biz-card-div-10" (clone id="biz-card-div-10-clone").
     */
    getBizCardDivFromBizResumeDiv(rDiv) {
        const jobNumber = this.getJobNumberFromBizResumeDiv(rDiv);
        if (jobNumber == null || Number.isNaN(jobNumber)) return null;
        return document.getElementById(`biz-card-div-${jobNumber}`);
    }

    createEnhancedResumeDetailsDiv(jobNumber) {
        // Get job data for this job number
        const jobData = jobs[jobNumber];
        if (!jobData) {
            console.warn(`Job data not found for job number ${jobNumber}`);
            const fallbackDiv = document.createElement('div');
            fallbackDiv.className = 'biz-resume-details-div';
            fallbackDiv.textContent = `Resume item ${jobNumber} - Job data not found`;
            return fallbackDiv;
        }

        const detailsDiv = document.createElement('div');
        detailsDiv.className = 'biz-resume-details-div';

        // Create header section
        const headerDiv = document.createElement('div');
        headerDiv.className = 'resume-header';
        
        const employerDiv = document.createElement('div');
        employerDiv.className = 'biz-details-employer';
        employerDiv.textContent = jobData.employer || 'Unknown Employer';
        headerDiv.appendChild(employerDiv);

        const roleDiv = document.createElement('div');
        roleDiv.className = 'biz-details-role';  
        roleDiv.textContent = jobData.role || 'Unknown Role';
        headerDiv.appendChild(roleDiv);

        const startDate = this.formatDate(jobData.start);
        const endDate = this.formatDate(jobData.end);

        const datesDiv = document.createElement('div');
        datesDiv.className = 'biz-details-dates';
        datesDiv.textContent = `${startDate} - ${endDate}`;
        headerDiv.appendChild(datesDiv);

        const debugRow = document.createElement('div');
        debugRow.className = 'biz-details-debug-row';
        const idAndHexSpan = document.createElement('span');
        idAndHexSpan.className = 'biz-details-id-and-hex';
        const jobNumPart = document.createElement('span');
        jobNumPart.className = 'job-number';
        jobNumPart.textContent = `#${jobNumber}`;
        idAndHexSpan.appendChild(jobNumPart);
        const sceneZSpan = document.createElement('span');
        sceneZSpan.className = 'r-div-scene-z';
        const cDiv = typeof document !== 'undefined' ? document.getElementById(`biz-card-div-${jobNumber}`) : null;
        sceneZSpan.textContent = cDiv ? ` cZ:${cDiv.getAttribute('data-sceneZ') ?? '?'}` : '';
        idAndHexSpan.appendChild(sceneZSpan);
        idAndHexSpan.appendChild(document.createTextNode(' '));
        const hexNormalSpan = document.createElement('span');
        hexNormalSpan.className = 'hex-normal';
        idAndHexSpan.appendChild(hexNormalSpan);
        idAndHexSpan.appendChild(document.createTextNode(' '));
        const hexHighlightedSpan = document.createElement('span');
        hexHighlightedSpan.className = 'hex-highlighted';
        idAndHexSpan.appendChild(hexHighlightedSpan);
        debugRow.appendChild(idAndHexSpan);
        headerDiv.appendChild(debugRow);

        detailsDiv.appendChild(headerDiv);

        // Create description section
        if (jobData.Description) {
            const descDiv = document.createElement('div');
            descDiv.className = 'resume-description';
            
            const descTitle = document.createElement('h4');
            descTitle.textContent = 'Key Achievements';
            descDiv.appendChild(descTitle);

            // Parse description and create bullet points with clickable references
            const descContent = document.createElement('div');
            descContent.className = 'description-content';
            this.parseDescriptionToBullets(jobData.Description, descContent, jobData.references);
            descDiv.appendChild(descContent);

            detailsDiv.appendChild(descDiv);
        }

        // Create skills section
        if (jobData['job-skills'] && Object.keys(jobData['job-skills']).length > 0) {
            const skillsDiv = document.createElement('div');
            skillsDiv.className = 'resume-skills';
            
            const skillsTitle = document.createElement('h4');
            skillsTitle.textContent = 'Technologies & Skills';
            skillsDiv.appendChild(skillsTitle);

            const skillsList = document.createElement('div');
            skillsList.className = 'skills-list';
            
            // Create single-line bulleted skills
            const skillNames = Object.values(jobData['job-skills']);
            const skillsText = skillNames.join(' • ');
            skillsList.innerHTML = '<span class="bullet">•</span><span class="skills-text">' + skillsText + '</span>';

            skillsDiv.appendChild(skillsList);
            detailsDiv.appendChild(skillsDiv);
        }

        return detailsDiv;
    }

    formatDate(dateStr) {
        if (!dateStr) return 'Unknown';
        if (dateStr === 'CURRENT_DATE' || dateStr.toLowerCase().includes('current') || dateStr.toLowerCase().includes('present')) {
            return 'Present';
        }
        
        try {
            const date = new Date(dateStr);
            if (!isNaN(date.getTime())) {
                return date.toLocaleDateString('en-US', { 
                    year: 'numeric', 
                    month: 'short' 
                });
            }
        } catch (e) {
            // Fall through to return original string
        }
        
        return dateStr;
    }

    parseDescriptionToBullets(description, container, references = []) {
        if (!description) return;
        
        // Create a map of reference terms to URLs
        const refMap = new Map();
        if (references && references.length > 0) {
            references.forEach(refHtml => {
                // Extract the link text and href from the reference HTML
                const match = refHtml.match(/<a href="([^"]*)">\[([^\]]*)\]<\/a>/);
                if (match) {
                    const [, url, text] = match;
                    refMap.set(`[${text}]`, url);
                }
            });
        }
        
        // Split by various delimiters: bullet points, line breaks, or sentences
        const parts = description.split(/[•\n]+|(?<=\.)\s+/).filter(part => part.trim().length > 0);
        
        parts.forEach(part => {
            let trimmed = part.trim();
            if (trimmed.length > 0) {
                // Replace bracketed terms with clickable links
                refMap.forEach((url, term) => {
                    const linkHtml = `<a href="${url}" target="_blank" style="color: inherit; text-decoration: underline; pointer-events: auto; cursor: pointer;">${term}</a>`;
                    trimmed = trimmed.replace(new RegExp(term.replace(/[[\]]/g, '\\$&'), 'g'), linkHtml);
                });
                
                const bulletPoint = document.createElement('div');
                bulletPoint.className = 'job-description-item';
                bulletPoint.innerHTML = '<span class="bullet">•</span><span class="bullet-text">' + trimmed + '</span>';
                container.appendChild(bulletPoint);
            }
        });
    }

    getBizResumeDivByJobNumber(jobNumber) {
        return this.bizResumeDivs.find(div => parseInt(div.getAttribute('data-job-number'), 10) === jobNumber) || null;
    }

    _setupSelectionListeners() {
        // Use global selectionManager instance instead of imported reference
        const globalSelectionManager = window.selectionManager || selectionManager;
        
        console.log(`[ResumeItemsController] Setting up selection listeners with ${window.selectionManager ? 'global' : 'imported'} selectionManager`);
        
        globalSelectionManager.addEventListener('selectionChanged', this.handleSelectionChanged.bind(this));
        globalSelectionManager.addEventListener('selectionCleared', this.handleSelectionCleared.bind(this));
        globalSelectionManager.addEventListener('hoverChanged', this.handleHoverChanged.bind(this));
        globalSelectionManager.addEventListener('hoverCleared', this.handleHoverCleared.bind(this));
        globalSelectionManager.addEventListener('resume-unhover', this.handleResumeUnhover.bind(this));
        globalSelectionManager.addEventListener('resume-scrollIntoView', this.handleResumeScrollIntoView.bind(this));
        
        console.log(`[ResumeItemsController] ✅ Selection event listeners registered`);
    }

    _setupColorPaletteListener() {
        window.addEventListener('color-palette-changed', this.handleColorPaletteChanged.bind(this));
    }

    _setupMouseListeners(bizResumeDiv) {
        if (!bizResumeDiv) return;
        bizResumeDiv.addEventListener('click', () => this.handleBizResumeDivClickEvent(bizResumeDiv));
        bizResumeDiv.addEventListener('mouseenter', () => this.handleMouseEnterEvent(bizResumeDiv));
        bizResumeDiv.addEventListener('mouseleave', () => this.handleMouseLeaveEvent(bizResumeDiv));
    }

    handleBizResumeDivClickEvent(bizResumeDiv) {
        if (!bizResumeDiv) return;
        const jobNumber = parseInt(bizResumeDiv.getAttribute('data-job-number'), 10);
        const isSelected = selectionManager.getSelectedJobNumber() === jobNumber;

        if (isSelected) {
            selectionManager.clearSelection('ResumeItemsController.handleBizResumeDivClickEvent');
        } else {
            // Select the job
            selectionManager.selectJobNumber(jobNumber, 'ResumeItemsController.handleBizResumeDivClickEvent');
            
            // Scroll the rDiv into view in its parent container
            this._scrollRDivIntoView(bizResumeDiv, jobNumber);
        }
    }

    handleMouseEnterEvent(bizResumeDiv) {
        if (!bizResumeDiv) return;
        const jobNumber = parseInt(bizResumeDiv.getAttribute('data-job-number'), 10);
        console.log(`🖱️ [ResumeItemsController] MOUSE ENTER: job ${jobNumber}`);
        
        // Use SelectionManager for synchronized hover
        selectionManager.hoverJobNumber(jobNumber, 'ResumeItemsController.handleMouseEnterEvent');
    }

    handleMouseLeaveEvent(bizResumeDiv) {
        if (!bizResumeDiv) return;
        const jobNumber = parseInt(bizResumeDiv.getAttribute('data-job-number'), 10);
        console.log(`🖱️ [ResumeItemsController] MOUSE LEAVE: job ${jobNumber}`);
        
        // Use SelectionManager for synchronized hover
        selectionManager.clearHover('ResumeItemsController.handleMouseLeaveEvent');
    }

    /**
     * Scroll the rDiv (BizResumeDiv) into view within its parent container
     * Ensures all header fields of the bizResumeDetailsDiv are visible with comfortable spacing from top
     * @param {HTMLElement} bizResumeDiv - The resume div element to scroll into view
     * @param {number} jobNumber - The job number for logging/debugging
     */
    _scrollRDivIntoView(bizResumeDiv, jobNumber) {
        if (!bizResumeDiv) {
            console.warn(`[ResumeItemsController] Cannot scroll rDiv into view - element not found for job ${jobNumber}`);
            return;
        }

        console.log(`[ResumeItemsController] Scrolling rDiv header into view for job ${jobNumber}`);

        // Find the header section within the rDiv
        const headerDiv = bizResumeDiv.querySelector('.resume-header');
        if (!headerDiv) {
            console.warn(`[ResumeItemsController] No header found in rDiv for job ${jobNumber}, using fallback scroll`);
            this._fallbackScrollIntoView(bizResumeDiv, jobNumber);
            return;
        }

        // Find the scrollable container (infinite scroll container or parent)
        const scrollContainer = this._findScrollContainer(bizResumeDiv);
        if (!scrollContainer) {
            console.warn(`[ResumeItemsController] No scroll container found for job ${jobNumber}, using fallback scroll`);
            this._fallbackScrollIntoView(bizResumeDiv, jobNumber);
            return;
        }

        // Calculate optimal scroll position to show header with comfortable spacing
        const COMFORTABLE_TOP_SPACING = 20; // pixels from top edge
        
        const containerRect = scrollContainer.getBoundingClientRect();
        const headerRect = headerDiv.getBoundingClientRect();
        
        // Calculate how much we need to scroll to position header properly
        const currentScrollTop = scrollContainer.scrollTop;
        const headerOffsetFromContainerTop = headerRect.top - containerRect.top;
        const targetScrollTop = currentScrollTop + headerOffsetFromContainerTop - COMFORTABLE_TOP_SPACING;

        // Smooth scroll to the calculated position
        scrollContainer.scrollTo({
            top: Math.max(0, targetScrollTop), // Don't scroll negative
            behavior: 'smooth'
        });

        console.log(`[ResumeItemsController] Scrolled to position ${Math.round(targetScrollTop)} to show header for job ${jobNumber}`);
    }

    /**
     * Find the scrollable container for the rDiv
     * @param {HTMLElement} bizResumeDiv - The resume div element
     * @returns {HTMLElement|null} The scrollable container
     */
    _findScrollContainer(bizResumeDiv) {
        // First try to find the infinite scroller's scrollport
        let current = bizResumeDiv.parentElement;
        while (current) {
            if (current.classList.contains('infinite-scroll-container') || 
                current.style.overflowY === 'auto' || 
                current.style.overflowY === 'scroll' ||
                current.id === 'resume-container') {
                return current;
            }
            current = current.parentElement;
        }
        
        // Fallback to resume container or document element
        return document.getElementById('resume-container') || document.documentElement;
    }

    /**
     * Fallback scrolling method using standard scrollIntoView
     * @param {HTMLElement} bizResumeDiv - The resume div element
     * @param {number} jobNumber - The job number for logging
     */
    _fallbackScrollIntoView(bizResumeDiv, jobNumber) {
        try {
            bizResumeDiv.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'start', // Position at start with some natural spacing
                inline: 'nearest'
            });
            console.log(`[ResumeItemsController] Fallback scroll successful for job ${jobNumber}`);
        } catch (error) {
            console.error(`[ResumeItemsController] Failed to scroll rDiv into view for job ${jobNumber}:`, error);
            throw error;
        }
    }

    handleHoverChanged(event) {
        const { hoveredJobNumber, caller } = event.detail;
        console.log(`🖱️ [ResumeItemsController] handleHoverChanged: job ${hoveredJobNumber}, caller: ${caller}`);

        // Skip applying hover styling to selected items, but allow event coordination to proceed
        if (selectionManager.getSelectedJobNumber() === hoveredJobNumber) {
            console.log(`🖱️ [ResumeItemsController] Skipping hover styling for selected item ${hoveredJobNumber}`);
            return;
        }

        // Clear previous hovers first (but don't trigger events to avoid loops)
        this.bizResumeDivs.forEach(div => {
            this._clearHoverStyles(div);
        });

        const bizResumeDiv = this.getBizResumeDivByJobNumber(hoveredJobNumber);
        console.log(`🖱️ [ResumeItemsController] Found rDiv for job ${hoveredJobNumber}:`, !!bizResumeDiv);
        if (bizResumeDiv) {
            this._applyHoverStyles(bizResumeDiv);
            console.log(`🖱️ [ResumeItemsController] Applied hover styles to rDiv for job ${hoveredJobNumber}`);
            
            // Debug: Check computed styles
            const computedStyle = window.getComputedStyle(bizResumeDiv);
            console.log(`🖱️ [ResumeItemsController] rDiv computed background-color:`, computedStyle.backgroundColor);
        } else {
            console.error(`❌ [ResumeItemsController] Could not find rDiv for job ${hoveredJobNumber}`);
        }
    }
    
    _applyHoverStyles(bizResumeDiv) {
        // Palette already set --data-* vars; CSS uses them when .hovered is present
        bizResumeDiv.classList.add('hovered');
    }

    _clearHoverStyles(bizResumeDiv) {
        bizResumeDiv.classList.remove('hovered');
    }

    handleHoverCleared(event) {
        const { caller } = event.detail;
        this.bizResumeDivs.forEach(div => {
            this._clearHoverStyles(div);
        });
    }

    handleResumeUnhover(event) {
        const { jobNumber } = event.detail;
        console.log(`🖱️ [ResumeItemsController] handleResumeUnhover: job ${jobNumber}`);
        
        const bizResumeDiv = this.getBizResumeDivByJobNumber(jobNumber);
        if (bizResumeDiv) {
            this._clearHoverStyles(bizResumeDiv);
            console.log(`🖱️ [ResumeItemsController] Cleared hover styles from rDiv for job ${jobNumber}`);
        }
    }

    handleSelectionChanged(event) {
        const { selectedJobNumber, caller } = event.detail;
        
        console.log(`🔥 CRITICAL DEBUG: ResumeItemsController.handleSelectionChanged CALLED!`);
        console.log(`🔥 selectedJobNumber=${selectedJobNumber}, caller=${caller}`);
        
        window.CONSOLE_LOG_IGNORE(`[DEBUG] ResumeItemsController.handleSelectionChanged: selectedJobNumber=${selectedJobNumber}, caller=${caller}`);
        
        // Clear previous selections first
        this.handleSelectionCleared({ detail: { caller: 'handleSelectionChanged' } });

        const bizResumeDiv = this.getBizResumeDivByJobNumber(selectedJobNumber);
        
        if (bizResumeDiv) {
            window.CONSOLE_LOG_IGNORE(`[DEBUG] ResumeItemsController.handleSelectionChanged: Found resume div for job ${selectedJobNumber}`);
            bizResumeDiv.classList.add('selected');
            
            // Debug color matching
            const rDivColorIndex = bizResumeDiv.getAttribute('data-color-index');
            const rDivBgColor = window.getComputedStyle(bizResumeDiv).backgroundColor;
            // cDiv from rDiv ID convention: resume-10 → biz-card-div-10
            const cDiv = this.getBizCardDivFromBizResumeDiv(bizResumeDiv);
            const cDivColorIndex = cDiv?.getAttribute('data-color-index');
            const cDivBgColor = cDiv ? window.getComputedStyle(cDiv).backgroundColor : 'N/A';
            
            console.log(`[DEBUG] Color mismatch check - Job ${selectedJobNumber}:`);
            console.log(`  rDiv color-index: ${rDivColorIndex}, bg: ${rDivBgColor}`);
            console.log(`  cDiv color-index: ${cDivColorIndex}, bg: ${cDivBgColor}`);
            console.log(`  Match: ${rDivColorIndex === cDivColorIndex && rDivBgColor === cDivBgColor}`);
            
            // Apply selected state styling using the new system
            bizResumeDiv.classList.add('selected');
            
            // Force browser repaint to ensure stats div visibility updates immediately
            bizResumeDiv.offsetHeight; // Reading offsetHeight forces a reflow
            
            // Trigger height recalculation to accommodate visible stats div
            this._triggerHeightRecalculation('[DEBUG] ResumeItemsController.handleSelectionChanged: Triggered height recalculation');
            
            // CRITICAL FIX: Scroll corresponding cDiv into view (scrollable element is #scene-content, not #scene-container)
            if (cDiv) {
                console.log(`[DEBUG] ResumeItemsController: Scrolling cDiv into view for job ${selectedJobNumber}`);
                const sceneScroll = document.getElementById('scene-content');
                if (sceneScroll) {
                    const sceneRect = sceneScroll.getBoundingClientRect();
                    const cDivRect = cDiv.getBoundingClientRect();
                    const scrollTop = sceneScroll.scrollTop + (cDivRect.top - sceneRect.top) - (sceneRect.height / 2) + (cDivRect.height / 2);
                    sceneScroll.scrollTo({ top: Math.max(0, scrollTop), behavior: 'smooth' });
                    console.log(`[DEBUG] ResumeItemsController: Scrolled scene-content to position ${Math.round(scrollTop)} for job ${selectedJobNumber}`);
                } else {
                    cDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            } else {
                console.debug(`[ResumeItemsController] No cDiv for job ${selectedJobNumber} yet (scene cards may still be initializing)`);
            }
            
            console.log(`[DEBUG] ResumeItemsController.handleSelectionChanged: Applied 'selected' class to resume div`);
        } else {
            console.log(`ResumeItemsController: No resume div found for job number ${selectedJobNumber}`);
        }
    }

    handleSelectionCleared(event) {
        const { caller } = event.detail;
        this.bizResumeDivs.forEach(div => {
            div.classList.remove('selected');
            // Reset to normal state
            div.classList.remove('hovered', 'selected');
            // Force browser repaint to ensure stats div visibility updates immediately
            div.offsetHeight; // Reading offsetHeight forces a reflow
        });
        
        // Trigger height recalculation to accommodate hidden stats divs
        this._triggerHeightRecalculation('[DEBUG] ResumeItemsController.handleSelectionCleared: Triggered height recalculation');
    }

    /**
     * Handle resume-scrollIntoView command events from SelectionManager
     * This is triggered when a cDiv clone is clicked and needs to scroll the corresponding rDiv
     */
    handleResumeScrollIntoView(event) {
        const { jobNumber } = event.detail;
        const listController = window.resumeListController;
        if (listController && typeof listController.ensureJobInListing === 'function') {
            listController.ensureJobInListing(jobNumber);
        }
        this.dismissedJobNumbers.delete(jobNumber);
        const id = this.createBizResumeDivId(jobNumber);
        if (listController && typeof listController.scrollToElementId === 'function') {
            listController.scrollToElementId(id);
        } else {
            const rDiv = this.bizResumeDivs.find(div => parseInt(div.getAttribute('data-job-number')) === jobNumber);
            if (rDiv) this._scrollRDivIntoView(rDiv, jobNumber);
        }
    }

    handleColorPaletteChanged(event) {
        const { filename, paletteName, previousFilename } = event.detail;
        
        window.CONSOLE_LOG_IGNORE(`[DEBUG] ResumeItemsController.handleColorPaletteChanged: Palette changed from ${previousFilename} to ${filename} (${paletteName})`);
        
        // Apply new palette to all resume divs and their children
        this.bizResumeDivs.forEach(async (div) => {
            if (div) {
                // Apply palette to the div itself and all elements with data-color-index within it
                await applyPaletteToElement(div);
                const colorElements = div.querySelectorAll('[data-color-index]');
                for (const element of colorElements) {
                    await applyPaletteToElement(element);
                }
            }
        });
        
        window.CONSOLE_LOG_IGNORE(`[DEBUG] ResumeItemsController.handleColorPaletteChanged: Applied new palette to ${this.bizResumeDivs.length} resume divs`);
    }

    // Static method to reset the singleton instance
    static reset() {
        window.CONSOLE_LOG_IGNORE('[DEBUG] ResumeItemsController: Resetting singleton instance');
        if (ResumeItemsController.instance) {
            // Clean up event listeners
            const instance = ResumeItemsController.instance;
            const globalSelectionManager = window.selectionManager || selectionManager;
            
            globalSelectionManager.removeEventListener('selectionChanged', instance.handleSelectionChanged.bind(instance));
            globalSelectionManager.removeEventListener('selectionCleared', instance.handleSelectionCleared.bind(instance));
            globalSelectionManager.removeEventListener('hoverChanged', instance.handleHoverChanged.bind(instance));
            globalSelectionManager.removeEventListener('hoverCleared', instance.handleHoverCleared.bind(instance));
            globalSelectionManager.removeEventListener('resume-unhover', instance.handleResumeUnhover.bind(instance));
            window.removeEventListener('color-palette-changed', instance.handleColorPaletteChanged.bind(instance));
            
            // Clean up other resources
            instance.bizResumeDivs = [];
            instance.isInitialized = false;
        }
        ResumeItemsController.instance = null;
    }

    // Helper method to trigger height recalculation (replaces direct window access)
    _triggerHeightRecalculation(debugMessage) {
        // Try to access via window first (backwards compatibility)
        if (window.resumeListController && window.resumeListController.infiniteScroller) {
            window.resumeListController.infiniteScroller.recalculateHeights();
            console.log(debugMessage);
        } else {
            // Fallback: dispatch event for components using provide/inject
            window.dispatchEvent(new CustomEvent('resume-height-recalculation-needed', {
                detail: { message: debugMessage }
            }));
        }
    }

    // Static method to get the current instance
    static getInstance() {
        return ResumeItemsController.instance;
    }

} // end class ResumeItemsController

const resumeItemsController = new ResumeItemsController();
export { resumeItemsController };

