// resume/ResumeItemsController.mjs

import * as utils from '../utils/utils.mjs';
// import * as BizDetailsDivModule from './bizDetailsDivModule.mjs'; // Module doesn't exist - needs to be recreated
import { selectionManager } from '../core/selectionManager.mjs';
// import { cardsController } from './CardsController.mjs'; // Now using Vue composable approach
import { applyPaletteToElement } from '../composables/useColorPalette.mjs';
// import { initializationManager } from '../core/initializationManager.mjs'; // IM framework no longer used
import { jobs } from '../../static_content/jobs/jobs.mjs';
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
                // Continue with other cards instead of failing completely
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

        bizResumeDiv.style.pointerEvents = 'auto';

        // Create enhanced resume content with job details
        const bizResumeDetailsDiv = this.createEnhancedResumeDetailsDiv(jobNumber);
        bizResumeDiv.appendChild(bizResumeDetailsDiv);

        // Apply the current color palette
        await applyPaletteToElement(bizResumeDiv);

        // Apply normal state styling after palette application
        bizResumeDiv.classList.remove('hovered', 'selected');

        this._setupMouseListeners(bizResumeDiv);

        return bizResumeDiv;
    }

    createBizResumeDivId(jobNumber) {
        return `resume-${jobNumber}`;
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

        const datesDiv = document.createElement('div');
        datesDiv.className = 'biz-details-dates';
        const startDate = this.formatDate(jobData.start);
        const endDate = this.formatDate(jobData.end);
        
        // Create a flex container for dates and job number
        datesDiv.style.display = 'flex';
        datesDiv.style.justifyContent = 'space-between';
        datesDiv.style.alignItems = 'center';
        
        // Left side: date range
        const dateRange = document.createElement('span');
        dateRange.textContent = `${startDate} - ${endDate}`;
        datesDiv.appendChild(dateRange);
        
        // Right side: job number
        const jobNumberSpan = document.createElement('span');
        jobNumberSpan.className = 'job-number';
        jobNumberSpan.textContent = `#${jobNumber}`;
        jobNumberSpan.style.fontWeight = 'bold';
        jobNumberSpan.style.opacity = '0.8';
        datesDiv.appendChild(jobNumberSpan);
        
        headerDiv.appendChild(datesDiv);

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
            selectionManager.selectJobNumber(jobNumber, 'ResumeItemsController.handleBizResumeDivClickEvent');
        }
    }

    handleMouseEnterEvent(bizResumeDiv) {
        if (!bizResumeDiv) return;
        const jobNumber = parseInt(bizResumeDiv.getAttribute('data-job-number'), 10);
        
        
        selectionManager.hoverJobNumber(jobNumber, 'ResumeItemsController.handleMouseEnterEvent');
    }

    handleMouseLeaveEvent(bizResumeDiv) {
        if (!bizResumeDiv) return;
        selectionManager.clearHover('ResumeItemsController.handleMouseLeaveEvent');
    }

    handleHoverChanged(event) {
        const { hoveredJobNumber, caller } = event.detail;

        // Clear previous hovers first (always, even for selected items to maintain coordination)
        this.handleHoverCleared({ detail: { caller: 'handleHoverChanged' } });

        // Skip applying hover styling to selected items, but allow event coordination to proceed
        if (selectionManager.getSelectedJobNumber() === hoveredJobNumber) {
            window.CONSOLE_LOG_IGNORE(`[DEBUG] ResumeItemsController: Skipping hover styling for selected item ${hoveredJobNumber}, but allowing coordination`);
            return;
        }

        const bizResumeDiv = this.getBizResumeDivByJobNumber(hoveredJobNumber);
        if (bizResumeDiv) {
            bizResumeDiv.classList.add('hovered');
            
            // Apply hover state styling using the new system
            bizResumeDiv.classList.add('hovered');
            

        }
    }

    handleHoverCleared(event) {
        const { caller } = event.detail;
        this.bizResumeDivs.forEach(div => {
            div.classList.remove('hovered');
            // Reset to normal state (only if not selected)
            if (!div.classList.contains('selected')) {
                div.classList.remove('hovered', 'selected');
            }
        });
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
            
            // Debug color matching using optimized registry (if available)
            const rDivColorIndex = bizResumeDiv.getAttribute('data-color-index');
            const rDivBgColor = window.getComputedStyle(bizResumeDiv).backgroundColor;
            
            // Try to get cDiv via card registry first, fallback to DOM query
            let cDiv = null;
            if (window.cardRegistry && window.cardRegistry.getCardElement) {
                cDiv = window.cardRegistry.getCardElement(selectedJobNumber);
            } else {
                cDiv = document.getElementById(`biz-card-div-${selectedJobNumber}`);
            }
            
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
            
            // CRITICAL FIX: Scroll corresponding cDiv into view
            if (cDiv) {
                console.log(`[DEBUG] ResumeItemsController: Scrolling cDiv into view for job ${selectedJobNumber}`);
                
                // Find the scene container
                const sceneContainer = document.getElementById('scene-container');
                if (sceneContainer) {
                    // Scroll the cDiv into the center of the scene container
                    const sceneRect = sceneContainer.getBoundingClientRect();
                    const cDivRect = cDiv.getBoundingClientRect();
                    
                    // Calculate scroll position to center the cDiv
                    const scrollTop = sceneContainer.scrollTop + (cDivRect.top - sceneRect.top) - (sceneRect.height / 2) + (cDivRect.height / 2);
                    
                    // Smooth scroll to position
                    sceneContainer.scrollTo({
                        top: scrollTop,
                        behavior: 'smooth'
                    });
                    
                    console.log(`[DEBUG] ResumeItemsController: Scrolled scene container to position ${Math.round(scrollTop)} for job ${selectedJobNumber}`);
                } else {
                    console.warn(`[DEBUG] ResumeItemsController: Scene container not found, using fallback scrollIntoView`);
                    cDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            } else {
                console.warn(`[DEBUG] ResumeItemsController: No cDiv found for job ${selectedJobNumber}, cannot scroll into view`);
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

    handleColorPaletteChanged(event) {
        const { filename, paletteName, previousFilename } = event.detail;
        
        window.CONSOLE_LOG_IGNORE(`[DEBUG] ResumeItemsController.handleColorPaletteChanged: Palette changed from ${previousFilename} to ${filename} (${paletteName})`);
        
        // Apply new palette to all resume divs and their children
        this.bizResumeDivs.forEach(div => {
            if (div) {
                // Apply palette to the div itself and all elements with data-color-index within it
                applyPaletteToElement(div);
                const colorElements = div.querySelectorAll('[data-color-index]');
                colorElements.forEach(applyPaletteToElement);
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

