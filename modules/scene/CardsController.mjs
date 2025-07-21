// scene/CardsController.mjs

import { BaseComponent } from '../core/abstracts/BaseComponent.mjs'
import { selectionManager } from '../core/selectionManager.mjs';
import * as scenePlane from './scenePlaneModule.mjs';
import * as utils from '../utils/utils.mjs';
import * as viewPort from '../core/viewPortModule.mjs';
import * as BizDetailsDivModule from './bizDetailsDivModule.mjs';
import { useTimeline } from '../composables/useTimeline.mjs';
import * as dateUtils from '../utils/dateUtils.mjs';
import * as mathUtils from '../utils/mathUtils.mjs';
import * as zUtils from '../utils/zUtils.mjs';
import * as filters from '../core/filters.mjs';
import { applyParallaxToBizCardDiv } from '../core/parallaxModule.mjs';
import { jobs } from '../../static_content/jobs/jobs.mjs';
import { applyPaletteToElement } from '../composables/useColorPalette.mjs';
import { AppState } from '../core/stateManager.mjs';
import { initializationManager } from '../core/initializationManager.mjs';
// import { resumeListController } from '../resume/ResumeListController.mjs'; // No longer needed

const BIZCARD_MAX_X_OFFSET = 100;
const BIZCARD_MEAN_WIDTH = 180; // Reduced from 200 for more square aspect
const BIZCARD_MAX_WIDTH_OFFSET = 30; // Reduced from 40
const BIZCARD_MIN_Z_DIFF = 2;
const MIN_HEIGHT = 180; // Reduced from 200 for more square aspect

// Timeline functions will be accessed when needed after initialization

/**
 * CardsController - Manages the business card divs in the scene
 * 
 * KEY CONCEPT: This controller now applies the same sorting as ResumeListController
 * to ensure cDivs and rDivs show the same jobs in the same order.
 * 
 * The sorting is applied by:
 * 1. Listening to sort rule changes from ResumeListController
 * 2. Applying the same sort logic to the bizCardDivs array
 * 3. Updating the visual order of cards in the scene
 */
class CardsController extends BaseComponent {

    constructor() {
        super('CardsController');

        // Singleton pattern: return existing instance if one exists
        if (CardsController.instance) {
    
            return CardsController.instance;
        }

        // Create new instance

        this.bizCardDivs = [];
        this.isInitialized = false;
        this.originalJobsData = null;
        this.currentSortRule = null;
        this.sortedIndices = []; // Maps sorted position to original jobNumber
        this.currentlyHoveredElement = null; // Track currently hovered element
        this._setupSelectionListeners();
        this._setupColorPaletteListener();
        // The pointer events observer is set up in initialize now
        
        // Listen for sort rule changes from ResumeListController
        this._setupSortListener();
        
        // Update existing cDivs to have scene-left and scene-top attributes
        this._updateExistingCDivs();
        
        // Store the singleton instance
        CardsController.instance = this;
    }

    getDependencies() {
        return ['Timeline'];
    }

    destroy() {
        this.bizCardDivs = null;
        this.isInitialized = false;
        this.originalJobsData = null;
        this.currentSortRule = null;
        this.sortedIndices = [];
        this.currentlyHoveredElement = null;
        CardsController.instance = null;
    }

    _updateExistingCDivs() {
        // Update existing cDivs to have scene-left and scene-top attributes
        const scenePlaneEl = document.getElementById('scene-plane');
        if (scenePlaneEl) {
            const existingCards = scenePlaneEl.querySelectorAll('.biz-card-div');
            existingCards.forEach(card => {
                const dataSceneLeft = card.getAttribute('data-sceneLeft');
                const dataSceneTop = card.getAttribute('data-sceneTop');
                if (dataSceneLeft && dataSceneTop && !card.getAttribute('scene-left')) {
                    card.setAttribute('scene-left', dataSceneLeft);
                    card.setAttribute('scene-top', dataSceneTop);
                }
            });
        }
    }

    async initialize() {
        if (this.isInitialized) {
            return;
        }
        
        // Get jobs data from import
        const jobsData = jobs;
        this.originalJobsData = jobsData;
        this.bizCardDivs = await this._createAllBizCardDivs(jobsData);
        window.CONSOLE_LOG_IGNORE('[CardsController] Created', this.bizCardDivs.length, 'bizCardDivs');
        
        // Apply the same sort rule as ResumeListController
        const initialSortRule = AppState.resume.sortRule || { field: 'startDate', direction: 'desc' };

        this.applySortRule(initialSortRule, true);
        
        this.isInitialized = true;

    }

    /**
     * Register this controller with the initialization manager
     * This allows other components to wait for CardsController to be ready
     */
    registerForInitialization() {
        initializationManager.register(
            'CardsController',
            async () => {
                // Wait for timeline to be ready
                await initializationManager.waitForComponent('Timeline');
                await this.initialize();
            },
            ['Timeline'], // Depends on timeline being initialized first
            { priority: 'high' }
        );
    }

    async _createAllBizCardDivs(jobsData) {
        const divs = [];
        const scenePlaneEl = document.getElementById('scene-plane');
        if (!scenePlaneEl) {

            return divs;
        }

        // Clear existing business card divs to prevent duplication
        const existingCards = scenePlaneEl.querySelectorAll('.biz-card-div');
        existingCards.forEach(card => {
            if (!card.classList.contains('hasClone')) { // Don't remove clones
                card.remove();
            }
        });
        
        // Update existing clones to have scene-left and scene-top attributes
        const existingClones = scenePlaneEl.querySelectorAll('.biz-card-div.hasClone');
        existingClones.forEach(clone => {
            const dataSceneLeft = clone.getAttribute('data-sceneLeft');
            const dataSceneTop = clone.getAttribute('data-sceneTop');
            if (dataSceneLeft && dataSceneTop && !clone.getAttribute('scene-left')) {
                clone.setAttribute('scene-left', dataSceneLeft);
                clone.setAttribute('scene-top', dataSceneTop);
            }
        });

        for (let jobNumber = 0; jobNumber < jobsData.length; jobNumber++) {
            const job = jobsData[jobNumber];
            const bizCardDiv = await this.createBizCardDiv(job, jobNumber, jobsData.length);
            divs.push(bizCardDiv);
        }
        
        divs.forEach(card => {
            if (card instanceof Node) {
                scenePlaneEl.appendChild(card);
            } else {
    
            }
        });
        
        return divs;
    }

    async createBizCardDiv(job, jobNumber, totalJobs) {
        try {
            const bizCardDiv = document.createElement('div');
            bizCardDiv.className = 'biz-card-div';
            bizCardDiv.id = this.createBizCardDivId(jobNumber);
            bizCardDiv.setAttribute('data-job-number', jobNumber.toString());
            
            this._setBizCardDivSceneGeometry(bizCardDiv, job);
            
            // --- Apply initial layout styles from the geometry attributes ---
            const sceneTop = parseFloat(bizCardDiv.getAttribute('data-sceneTop'));
            const sceneLeft = parseFloat(bizCardDiv.getAttribute('data-sceneLeft'));
            const sceneWidth = parseFloat(bizCardDiv.getAttribute('data-sceneWidth'));
            const sceneHeight = parseFloat(bizCardDiv.getAttribute('data-sceneHeight'));

            bizCardDiv.style.position = 'absolute';
            bizCardDiv.style.top = `${sceneTop}px`;
            bizCardDiv.style.left = `${sceneLeft}px`;
            bizCardDiv.style.width = `${sceneWidth}px`;
            bizCardDiv.style.height = `${sceneHeight}px`;

            // Assign a color jobNumber for styling. Use job number for consistency with rDivs
            const colorIndex = jobNumber;
            bizCardDiv.setAttribute('data-color-index', colorIndex);

            const bizCardDetailsDiv = BizDetailsDivModule.createBizCardDetailsDiv(bizCardDiv);
            bizCardDiv.appendChild(bizCardDetailsDiv);

                    // Apply the current color palette
        await applyPaletteToElement(bizCardDiv);
        
        // Check if attributes were removed by palette
        const afterPaletteSceneLeft = bizCardDiv.getAttribute('data-sceneLeft');
        const afterPaletteSceneTop = bizCardDiv.getAttribute('data-sceneTop');
        // Palette applied to cDiv

        // Apply normal state styling after palette application
        bizCardDiv.classList.remove('hovered', 'selected');
        
        // Check if attributes were removed by styling
        const afterStylingSceneLeft = bizCardDiv.getAttribute('data=-sceneLeft');
        const afterStylingSceneTop = bizCardDiv.getAttribute('data-sceneTop');
        // Styling applied to cDiv

            this._setupMouseListeners(bizCardDiv);

            return bizCardDiv;
        } catch (err) {

            return null;
        }
    }
    
    createBizCardDivId(jobNumber) {
        return `biz-card-div-${jobNumber}`;
    }

    createBizResumeDivId(jobNumber) {
        return `biz-resume-div-${jobNumber}`;
    }

    createBizResumeDetailsDivId(jobNumber) {
        return `biz-resume-details-div-${jobNumber}`;
    }

    createBizResumeDetailsDivClass() {
        return `biz-resume-details-div`;
    }

    createBizCardDetailsDivId(jobNumber) {
        return `biz-card-details-div-${jobNumber}`;
    }
    createBizCardDetailsDivClass() {
        return `biz-card-details-div`;
    }

    getBizCardDivByJobNumber(jobNumber) {
        // First check original cards
        for (const bizCardDiv of this.bizCardDivs) {
            if (bizCardDiv.getAttribute('data-job-number') === jobNumber.toString()) {
                return bizCardDiv;
            }
        }
        
        // If not found in original cards, check for clone
        const cloneId = `biz-card-${jobNumber}-clone`;
        const clone = document.getElementById(cloneId);
        if (clone) {
            return clone;
        }
        
        return null;
    }

    _setBizCardDivSceneGeometry(bizCardDiv, job) {
        if (!job.start) {

            return;
        }

        const startDate = dateUtils.parseFlexibleDateString(job.start);
        const endDate = (job.end && job.end === "CURRENT_DATE")
            ? new Date()
            : dateUtils.parseFlexibleDateString(job.end || job.start);

        if (!startDate || !endDate) {

            return;
        }

        // Get the top and bottom positions from timeline
        const { getPositionForDate } = useTimeline();
        let sceneTop = getPositionForDate(endDate);
        let sceneBottom = getPositionForDate(startDate);

        let sceneHeight = sceneBottom - sceneTop;
        const sceneCenterY = sceneTop + sceneHeight / 2;
        

        if (sceneHeight < MIN_HEIGHT) {
            sceneHeight = MIN_HEIGHT;
            let newSceneTop = sceneCenterY - MIN_HEIGHT / 2;
            
            // Prevent truncation at timeline top by checking boundary
            if (newSceneTop < 0) {
                sceneTop = 0;
                sceneBottom = MIN_HEIGHT;
            } else {
                sceneTop = newSceneTop;
                sceneBottom = sceneCenterY + MIN_HEIGHT / 2;
            }
        }
        
        bizCardDiv.setAttribute("data-sceneTop", sceneTop);
        bizCardDiv.setAttribute("data-sceneBottom", sceneBottom);
        bizCardDiv.setAttribute("data-sceneHeight", sceneHeight);
        bizCardDiv.setAttribute("data-sceneCenterY", sceneCenterY);
        
        const sceneCenterX = mathUtils.getRandomSignedOffset(BIZCARD_MAX_X_OFFSET);
        const sceneWidth = BIZCARD_MEAN_WIDTH + mathUtils.getRandomSignedOffset(BIZCARD_MAX_WIDTH_OFFSET);
        const sceneLeft = sceneCenterX - sceneWidth / 2;
        const sceneRight = sceneCenterX + sceneWidth / 2;
        
        bizCardDiv.setAttribute("data-sceneLeft", sceneLeft);
        bizCardDiv.setAttribute("data-sceneRight", sceneRight);
        bizCardDiv.setAttribute("data-sceneWidth", sceneWidth);
        bizCardDiv.setAttribute("data-sceneCenterX", sceneCenterX);
        
        // Add scene-left and scene-top attributes for components that expect them
        bizCardDiv.setAttribute("scene-left", sceneLeft.toString());
        bizCardDiv.setAttribute("scene-top", sceneTop.toString());
        
        // Simple test: verify the attributes were set
        const verifySceneLeft = bizCardDiv.getAttribute('scene-left');
        const verifySceneTop = bizCardDiv.getAttribute('scene-top');
        // Scene coordinates set on cDiv
        
        let sceneZ = 0;
        let lastSceneZ = -1;
        while (true) {
            sceneZ = mathUtils.getRandomInt(zUtils.ALL_CARDS_Z_MIN, zUtils.ALL_CARDS_Z_MAX);
            if (utils.abs_diff(sceneZ, lastSceneZ) >= BIZCARD_MIN_Z_DIFF) {
                lastSceneZ = sceneZ;
                break;
            }
        }
        utils.validateNumberInRange(sceneZ, zUtils.ALL_CARDS_Z_MIN, zUtils.ALL_CARDS_Z_MAX);
        bizCardDiv.setAttribute("data-sceneZ", sceneZ);
        
        // Log data-scene- values for job 0 only
        const jobNumber = bizCardDiv.getAttribute('data-job-number');
        if (jobNumber === '0') {
            // console.log('Job 0 data-scene- attributes:', {
            //     'data-sceneTop': bizCardDiv.getAttribute('data-sceneTop'),
            //     'data-sceneBottom': bizCardDiv.getAttribute('data-sceneBottom'),
            //     'data-sceneHeight': bizCardDiv.getAttribute('data-sceneHeight'),
            //     'data-sceneLeft': bizCardDiv.getAttribute('data-sceneLeft'),
            //     'data-sceneRight': bizCardDiv.getAttribute('data-sceneRight'),
            //     'data-sceneWidth': bizCardDiv.getAttribute('data-sceneWidth'),
            //     'data-sceneZ': bizCardDiv.getAttribute('data-sceneZ')
            // });
        }
        
        // set the z-relative style properties
        bizCardDiv.style.setProperty("z-jobNumber", zUtils.get_zIndexStr_from_z(sceneZ));
        
        // Only apply depth filters to card divs, not resume divs
        if (!bizCardDiv.classList.contains('biz-resume-div')) {
            bizCardDiv.style.filter = filters.get_filterStr_from_z(sceneZ);
        }


    }

    _setupSelectionListeners() {
        selectionManager.addEventListener('selectionChanged', this.handleSelectionChanged.bind(this));
        selectionManager.addEventListener('selectionCleared', this.handleSelectionCleared.bind(this));
        selectionManager.addEventListener('hoverChanged', this.handleHoverChanged.bind(this));
        selectionManager.addEventListener('hoverCleared', this.handleHoverCleared.bind(this));
    }

    _setupColorPaletteListener() {
        window.addEventListener('color-palette-changed', this.handleColorPaletteChanged.bind(this));
    }

    _setupMouseListeners(bizCardDiv) {
        if (!bizCardDiv) return;
        bizCardDiv.addEventListener('click', (e) => {
            // Stop propagation to prevent scenePlane from immediately clearing the selection
            e.stopPropagation(); 
            this.handleBizCardDivClickEvent(bizCardDiv);
        });
        bizCardDiv.addEventListener('mouseenter', (e) => {
            e.stopPropagation();
            this.handleMouseEnterEvent(bizCardDiv);
        }, true); // Use capture phase
        bizCardDiv.addEventListener('mouseleave', (e) => {
            e.stopPropagation();
            this.handleMouseLeaveEvent(bizCardDiv);
        }, true); // Use capture phase
    }

    // called by handleBizCardDivClickEvent
    // handles creation of clone
    _selectBizCardDiv(bizCardDiv, caller='') {
        if (!bizCardDiv) return;

        // Check if this card already has a clone
        const existingCloneId = bizCardDiv.id + '-clone';
        const existingClone = document.getElementById(existingCloneId);
        if (existingClone) {
            // Clone already exists, skipping creation
            return;
        }

        // --- Pre-calculate the centered geometry from the original card ---
        const originalSceneLeft = parseFloat(bizCardDiv.getAttribute("data-sceneLeft"));
        const sceneWidth = parseFloat(bizCardDiv.getAttribute("data-sceneWidth"));
        const sceneCenterX = 0;
        const newSceneLeft = sceneCenterX - (sceneWidth / 2);
        const sceneRight = sceneCenterX + (sceneWidth / 2);
        
        // Check if original cDiv has scene-left and scene-top attributes
        const originalSceneLeftAttr = bizCardDiv.getAttribute("scene-left");
        const originalSceneTopAttr = bizCardDiv.getAttribute("scene-top");
        // Original cDiv scene coordinates noted



        // Create a deep clone of the card
        const clone = bizCardDiv.cloneNode(true);
        clone.id = bizCardDiv.id + '-clone';
        bizCardDiv.classList.add('hasClone'); // marker for scenePlane.clearAllSelected to know to destroy the clone
        clone.classList.add('hasClone'); // marker for projectBizCardDivClone to identify as clone
        if ( !clone.classList.contains('biz-card-div') ) throw new Error('Clone is not a biz-card-div');
        clone.classList.remove('hovered')
        clone.classList.add('selected' );
        clone.setAttribute("data-sceneZ", zUtils.SELECTED_CARD_Z_VALUE); // marker for parallax to use SELECTED_CARD_Z_INDEX
        clone.style.zIndex = zUtils.SELECTED_CARD_Z_INDEX;
        
        // Debug: Check what attributes the original has
        window.CONSOLE_LOG_IGNORE(`[DEBUG] CardsController._selectBizCardDiv: Original ${bizCardDiv.id} attributes:`, {
            'scene-left': bizCardDiv.getAttribute('scene-left'),
            'scene-top': bizCardDiv.getAttribute('scene-top'),
            'data-sceneLeft': bizCardDiv.getAttribute('data-sceneLeft'),
            'data-sceneTop': bizCardDiv.getAttribute('data-sceneTop'),
            'data-sceneCenterX': bizCardDiv.getAttribute('data-sceneCenterX'),
            'data-sceneZ': bizCardDiv.getAttribute('data-sceneZ')
        });
        
        // Debug: Check what attributes the clone inherited
        window.CONSOLE_LOG_IGNORE(`[DEBUG] CardsController._selectBizCardDiv: Clone ${clone.id} inherited attributes:`, {
            'scene-left': clone.getAttribute('scene-left'),
            'scene-top': clone.getAttribute('scene-top'),
            'data-sceneLeft': clone.getAttribute('data-sceneLeft'),
            'data-sceneTop': clone.getAttribute('data-sceneTop'),
            'data-sceneCenterX': clone.getAttribute('data-sceneCenterX'),
            'data-sceneZ': clone.getAttribute('data-sceneZ')
        });

        // Debug: Check if data-color-index is properly copied
        const originalColorIndex = bizCardDiv.getAttribute('data-color-index');
        const cloneColorIndex = clone.getAttribute('data-color-index');
        window.CONSOLE_LOG_IGNORE(`[DEBUG] CardsController._selectBizCardDiv: Original ${bizCardDiv.id} data-color-index: ${originalColorIndex}`);
        window.CONSOLE_LOG_IGNORE(`[DEBUG] CardsController._selectBizCardDiv: Clone ${clone.id} data-color-index: ${cloneColorIndex}`);
        
        // Ensure the clone has the data-color-index attribute
        if (originalColorIndex && !cloneColorIndex) {
            // Fixing missing color index on clone
            clone.setAttribute('data-color-index', originalColorIndex);
        }

        // --- Apply the pre-calculated centered geometry to the clone ---
        clone.setAttribute("data-sceneCenterX", sceneCenterX.toString());
        clone.setAttribute("data-sceneLeft", newSceneLeft.toString());
        clone.setAttribute("data-sceneRight", sceneRight.toString());
        
        // Copy the vertical position from the original card
        const originalSceneTop = bizCardDiv.getAttribute("data-sceneTop");
        if (originalSceneTop) {
            clone.setAttribute("data-sceneTop", originalSceneTop);
            clone.style.top = `${originalSceneTop}px`; // Set the CSS top style for proper positioning
        } else {
            // Original card missing scene coordinates
        }
        
        // Add scene-left and scene-top attributes for components that expect them
        // Setting scene coordinates on clone
        clone.setAttribute("scene-left", newSceneLeft.toString());
        clone.setAttribute("scene-top", originalSceneTop || "0");
        
        // Simple test: immediately check if they were set
        // Clone scene coordinates verified
        
        // Debug: Verify clone scene coordinates immediately after setting
        window.CONSOLE_LOG_IGNORE(`[DEBUG] CardsController._selectBizCardDiv: Clone ${clone.id} scene coordinates immediately after setting:`, {
            'scene-left': clone.getAttribute('scene-left'),
            'scene-top': clone.getAttribute('scene-top'),
            'data-sceneLeft': clone.getAttribute('data-sceneLeft'),
            'data-sceneTop': clone.getAttribute('data-sceneTop'),
            'data-sceneCenterX': clone.getAttribute('data-sceneCenterX'),
            'sceneWidth': sceneWidth,
            'newSceneLeft': newSceneLeft,
            'originalSceneTop': originalSceneTop
        });
        
        // Verify the attributes were set correctly
        const verifySceneLeft = clone.getAttribute('scene-left');
        const verifySceneTop = clone.getAttribute('scene-top');
        if (verifySceneLeft !== newSceneLeft.toString() || verifySceneTop !== (originalSceneTop || "0")) {
            throw new Error(`Failed to set scene coordinates on clone: expected scene-left="${newSceneLeft}", scene-top="${originalSceneTop || "0"}", got scene-left="${verifySceneLeft}", scene-top="${verifySceneTop}"`);
        }
        
        clone.style.left = `${newSceneLeft}px`;
        
        // Ensure clone has all positioning properties defined for proper bounds calculation
        // Note: Clone is translated so centerX = bullseyeCenterX (sceneCenterX = 0)
        const cloneWidth = parseFloat(clone.style.width || getComputedStyle(clone).width);
        const cloneHeight = parseFloat(clone.style.height || getComputedStyle(clone).height);
        
        // Calculate actual translated bounds (centerX = 0, so left = -width/2, right = +width/2)
        const translatedLeft = sceneCenterX - (cloneWidth / 2);  // Should equal newSceneLeft
        const translatedRight = sceneCenterX + (cloneWidth / 2);
        const translatedTop = parseFloat(originalSceneTop || "0");
        const translatedBottom = translatedTop + cloneHeight;
        
        // Set explicit positioning properties based on translated position
        clone.style.top = `${translatedTop}px`;
        clone.style.left = `${translatedLeft}px`;
        clone.style.bottom = `${translatedBottom}px`;
        clone.style.right = `${translatedRight}px`;
        
        // Also set data attributes for reference (using translated values)
        clone.setAttribute("data-sceneBottom", translatedBottom.toString());
        clone.setAttribute("data-sceneRight", translatedRight.toString());
        clone.setAttribute("data-sceneLeft", translatedLeft.toString());  // Update to translated value
        clone.setAttribute("data-sceneTop", translatedTop.toString());    // Update to translated value
        
        // Copy missing attributes needed by projectBizCardDivClone
        const originalSceneWidth = bizCardDiv.getAttribute("data-sceneWidth");
        const originalSceneHeight = bizCardDiv.getAttribute("data-sceneHeight");
        const originalSceneCenterY = bizCardDiv.getAttribute("data-sceneCenterY");
        
        
        if (originalSceneWidth !== null && originalSceneWidth !== undefined) clone.setAttribute("data-sceneWidth", originalSceneWidth);
        if (originalSceneHeight !== null && originalSceneHeight !== undefined) clone.setAttribute("data-sceneHeight", originalSceneHeight);
        if (originalSceneCenterY !== null && originalSceneCenterY !== undefined) clone.setAttribute("data-sceneCenterY", originalSceneCenterY);
        
        
        window.CONSOLE_LOG_IGNORE(`[DEBUG] Clone ${clone.id} positioning properties set (translated):`, {
            top: clone.style.top,
            left: clone.style.left,
            bottom: clone.style.bottom,
            right: clone.style.right,
            'data-sceneTop': clone.getAttribute('data-sceneTop'),
            'data-sceneLeft': clone.getAttribute('data-sceneLeft'),
            'data-sceneBottom': clone.getAttribute('data-sceneBottom'),
            'data-sceneRight': clone.getAttribute('data-sceneRight'),
            'data-sceneWidth': clone.getAttribute('data-sceneWidth'),
            'data-sceneHeight': clone.getAttribute('data-sceneHeight'),
            'data-sceneCenterY': clone.getAttribute('data-sceneCenterY'),
            'data-sceneCenterX': clone.getAttribute('data-sceneCenterX'),
            centerX: sceneCenterX,
            originalLeft: newSceneLeft,
            translatedLeft: translatedLeft,
            cloneWidth: cloneWidth
        });

        // The clone needs its own click listener to handle deselection
        clone.addEventListener('click', (e) => {
            // e.stopPropagation(); // DO NOT stop propagation here
            this.handleBizCardDivClickEvent(clone);
        });
        
        // Add mouse enter/leave listeners to the clone for hover functionality
        // Note: Clones are always selected, but we still want hover to work for paired rDiv coordination
        clone.addEventListener('mouseenter', () => {
            this.handleMouseEnterEvent(clone);
        });
        clone.addEventListener('mouseleave', () => {
            this.handleMouseLeaveEvent(clone);
        });

        // Add click listener for the custom scroll caret on the CLONE
        const caret = clone.querySelector('.scroll-caret');
        const detailsDiv = clone.querySelector('.biz-card-details-div');
        if (caret && detailsDiv) {
            caret.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent card from being deselected
                detailsDiv.scrollTo({ top: detailsDiv.scrollHeight, behavior: 'smooth' });
            });
        }

        // Handle scroll caret visibility on the CLONE
        if (detailsDiv && caret) {
            // Use a timeout to allow browser to render and calculate scrollHeight
            setTimeout(() => {
                const hasOverflow = detailsDiv.scrollHeight > detailsDiv.clientHeight;
                if (hasOverflow) {
                    caret.classList.add('show');
                }

                // Add a scroll listener to hide the caret when at the bottom
                detailsDiv.addEventListener('scroll', () => {
                    const isAtBottom = detailsDiv.scrollHeight - detailsDiv.scrollTop <= detailsDiv.clientHeight + 1; // +1 for pixel rounding
                    if (isAtBottom) {
                        caret.classList.remove('show');
                    } else {
                        caret.classList.add('show');
                    }
                }, { passive: true });
            }, 100);
        }

        // --- Add clone to the scene ---
        const scenePlaneEl = document.getElementById('scene-plane');
        if (!scenePlaneEl) {
            window.CONSOLE_LOG_IGNORE(`CardsController._selectBizCardDiv: scene-plane element not found!`);
            return;
        }
        

        
        scenePlaneEl.appendChild(clone);
        
        // Debug: Check attributes after adding to DOM
        window.CONSOLE_LOG_IGNORE(`[DEBUG] CardsController._selectBizCardDiv: Clone ${clone.id} attributes after adding to DOM:`, {
            'scene-left': clone.getAttribute('scene-left'),
            'scene-top': clone.getAttribute('scene-top'),
            'data-sceneLeft': clone.getAttribute('data-sceneLeft'),
            'data-sceneTop': clone.getAttribute('data-sceneTop')
        });

        // Apply palette colors to the clone after it's in the DOM
        applyPaletteToElement(clone);
        
        // Debug: Check attributes after applying palette
        window.CONSOLE_LOG_IGNORE(`[DEBUG] CardsController._selectBizCardDiv: Clone ${clone.id} attributes after applying palette:`, {
            'scene-left': clone.getAttribute('scene-left'),
            'scene-top': clone.getAttribute('scene-top'),
            'data-sceneLeft': clone.getAttribute('data-sceneLeft'),
            'data-sceneTop': clone.getAttribute('data-sceneTop')
        });

        // Apply selected state styling to the clone
        clone.classList.add('selected');
        
        // Debug: Check attributes after applying styling
        window.CONSOLE_LOG_IGNORE(`[DEBUG] CardsController._selectBizCardDiv: Clone ${clone.id} attributes after applying styling:`, {
            'scene-left': clone.getAttribute('scene-left'),
            'scene-top': clone.getAttribute('scene-top'),
            'data-sceneLeft': clone.getAttribute('data-sceneLeft'),
            'data-sceneTop': clone.getAttribute('data-sceneTop')
        });

        // Gather badges for each job skill using the new badge system
        try {
            const jobNumber = parseInt(bizCardDiv.getAttribute('data-job-number'), 10);
            const badgesInfo = BizDetailsDivModule.getBizCardDivBadges(clone);
            // Created badges for selected job
            
            // Store the badges info on the clone for later use
            clone.setAttribute('data-badges-info', JSON.stringify(badgesInfo));
        } catch (error) {
            console.error('Failed to create badges for selected job:', error);
        }

        // Hide the original card now that the clone is in the DOM
        bizCardDiv.style.display = 'none';

        // --- Explicitly update the clone's parallax to its centered state ---
        applyParallaxToBizCardDiv(clone, 0, 0);
        
        // Dispatch event to notify components that clone is ready
        window.dispatchEvent(new CustomEvent('clone-created', {
          detail: { 
            cloneId: clone.id,
            jobNumber: bizCardDiv.getAttribute('data-job-number')
          }
        }));

        // --- Final check after adding to DOM ---
        const originalLeft = window.getComputedStyle(bizCardDiv).left;
        const cloneLeft = window.getComputedStyle(clone).left;
        const originalCenterX = parseFloat(bizCardDiv.getAttribute("data-sceneCenterX"));

        if (originalCenterX !== 0 && originalLeft === cloneLeft) {
            throw new Error(`Error: cDiv for job number ${bizCardDiv.dataset.jobNumber} has centerX of ${originalCenterX} but its left (${originalLeft}) is the same as its clone's left (${cloneLeft}).`);
        }
        
        // Verify clone scene coordinates are correctly set
        const finalSceneLeft = clone.getAttribute('scene-left');
        const finalSceneTop = clone.getAttribute('scene-top');
        const finalDataSceneLeft = clone.getAttribute('data-sceneLeft');
        const finalDataSceneTop = clone.getAttribute('data-sceneTop');
        
        window.CONSOLE_LOG_IGNORE(`[DEBUG] CardsController._selectBizCardDiv: Final clone ${clone.id} scene coordinates:`, {
            'scene-left': finalSceneLeft,
            'scene-top': finalSceneTop,
            'data-sceneLeft': finalDataSceneLeft,
            'data-sceneTop': finalDataSceneTop,
            'expected-scene-left': newSceneLeft.toString(),
            'expected-scene-top': originalSceneTop || "0"
        });
        
        // Verify the clone is centered (scene-centerX = 0)
        const cloneSceneCenterX = parseFloat(clone.getAttribute('data-sceneCenterX'));
        if (cloneSceneCenterX !== 0) {
            throw new Error(`Clone ${clone.id} is not centered: scene-centerX = ${cloneSceneCenterX}, expected 0`);
        }
        

    }

    // This is now the primary method for removing a clone and showing the original card.
    // It's called by the selectionCleared event handler.
    _deselectBizCardDiv(bizCardDiv) {
        if (!bizCardDiv || !bizCardDiv.classList.contains('hasClone')) return;
        
        const cloneId = bizCardDiv.id + '-clone';
        const clone = document.getElementById(cloneId);
        if (clone) {
            // Remove any stats div from the clone
            const statsDiv = clone.querySelector('.biz-card-stats-div');
            if (statsDiv) {
                statsDiv.remove();
            }
            clone.parentElement.removeChild(clone);
        }

        // Remove any stats div from the original card
        const originalStatsDiv = bizCardDiv.querySelector('.biz-card-stats-div');
        if (originalStatsDiv) {
            originalStatsDiv.remove();
        }

        bizCardDiv.classList.remove('hasClone');
        bizCardDiv.style.display = 'block'; // Unhide the original card

        // We don't need to force a parallax update here, as the regular mouse-move based
        // parallax will take over naturally.
    }

    handleBizCardDivClickEvent(bizCardDiv) {
        if (!bizCardDiv) return;
        const jobNumber = parseInt(bizCardDiv.getAttribute('data-job-number'), 10);
        const isClone = bizCardDiv.id && bizCardDiv.id.includes('-clone');
        const isAlreadySelected = selectionManager.getSelectedJobNumber() === jobNumber;
        
        if (isClone) {
            // Allow deselection when clicking the clone
            if (isAlreadySelected) {
                selectionManager.clearSelection('CardsController.handleBizCardDivClickEvent');
            }
            return;
        }

        if (isAlreadySelected) {
            selectionManager.clearSelection('CardsController.handleBizCardDivClickEvent');
        } else {
            selectionManager.selectJobNumber(jobNumber, 'CardsController.handleBizCardDivClickEvent');
        }
    }

    handleMouseEnterEvent(element) {
        if (!element) return;
        const jobNumber = parseInt(element.getAttribute('data-job-number'), 10);
        
        
        // Allow hover on clones (selected items) for paired rDiv coordination, 
        // but ignore hover on original selected cards
        const isClone = element.id && element.id.includes('-clone');
        if (selectionManager.getSelectedJobNumber() === jobNumber && !isClone) {
            return; // Ignore hover on selected original card
        }
        
        // FLICKER FIX: Only process if this is a different element than currently hovered
        if (this.currentlyHoveredElement === element) return;
        
        // Apply single-hover constraint and move to definitive rendering position
        // Clear all existing hovers first and restore their original positions
        this.bizCardDivs.forEach(div => {
            if (div.classList.contains('hovered')) {
                div.classList.remove('hovered');
                const isSelected = div.classList.contains('selected');
                if (!isSelected) {
                    div.classList.remove('hovered', 'selected');
                }
                // Restore original position if it was moved
                const originalNextSiblingJobNumber = div.getAttribute('data-original-next-sibling');
                if (originalNextSiblingJobNumber) {
                    const parent = div.parentElement;
                    if (originalNextSiblingJobNumber === 'null') {
                        // Was last child, append to end
                        parent.appendChild(div);
                    } else {
                        // Find the original next sibling and insert before it
                        const originalNextSibling = parent.querySelector(`[data-job-number="${originalNextSiblingJobNumber}"]`);
                        if (originalNextSibling) {
                            parent.insertBefore(div, originalNextSibling);
                        }
                    }
                }
            }
        });
        
        // Save original position before moving (store reference to next sibling)
        const parent = element.parentElement;
        const originalNextSibling = element.nextElementSibling;
        element.setAttribute('data-original-next-sibling', originalNextSibling ? originalNextSibling.getAttribute('data-job-number') : 'null');
        
        // Move hovered element to correct position based on whether there's a selected clone
        const lastChild = parent.lastElementChild;
        const hasSelectedClone = lastChild && lastChild.classList.contains('selected');
        
        if (hasSelectedClone) {
            // If there's a selected clone at the end, move hovered element to position N-1 (just before clone)
            parent.insertBefore(element, lastChild);
        } else {
            // If no selected clone, move hovered element to the very end (position N)
            parent.appendChild(element);
        }
        
        element.classList.add('hovered');
        element.classList.add('hovered');
        
        // Track the currently hovered element
        this.currentlyHoveredElement = element;
        
        // Still notify SelectionManager for coordination with other components
        selectionManager.hoverJobNumber(jobNumber, 'CardsController.handleMouseEnterEvent');
    }

    handleMouseLeaveEvent(element) {
        if (!element) return;
        // Clear hover state and restore original position
        if (element.classList.contains('hovered')) {
            element.classList.remove('hovered');
            const isSelected = element.classList.contains('selected');
            if (!isSelected) {
                element.classList.remove('hovered', 'selected');
            }
            
            // Restore original position
            const originalNextSiblingJobNumber = element.getAttribute('data-original-next-sibling');
            if (originalNextSiblingJobNumber) {
                const parent = element.parentElement;
                if (originalNextSiblingJobNumber === 'null') {
                    // Was last child, append to end
                    parent.appendChild(element);
                } else {
                    // Find the original next sibling and insert before it
                    const originalNextSibling = parent.querySelector(`[data-job-number="${originalNextSiblingJobNumber}"]`);
                    if (originalNextSibling) {
                        parent.insertBefore(element, originalNextSibling);
                    }
                }
                element.removeAttribute('data-original-next-sibling');
            }
        }
        
        // Clear tracked hovered element
        this.currentlyHoveredElement = null;
        
        selectionManager.clearHover('CardsController.handleMouseLeaveEvent');
    }

    handleSelectionChanged(event) {
        const { selectedJobNumber, caller } = event.detail;

        // Clear previous selections first
        this.handleSelectionCleared({ detail: { caller: 'handleSelectionChanged' } });

        const bizCardDiv = this.getBizCardDivByJobNumber(selectedJobNumber);
        
        if (bizCardDiv) {
            // Check if we already have a clone for this card
            const cloneId = bizCardDiv.id + '-clone';
            let clone = document.getElementById(cloneId);
            
            if (!clone) {
                // Create new clone if it doesn't exist
                this._selectBizCardDiv(bizCardDiv, `CardsController.handleSelectionChanged from ${caller}`);
                clone = document.getElementById(cloneId);
            }
            
            // Scroll to the clone (existing or newly created)
            if (clone) {
                this.scrollBizCardDivIntoView(clone, `CardsController.handleSelectionChanged from ${caller}`);
            }
            
            // Dispatch custom event for skill badges
            window.dispatchEvent(new CustomEvent('card-select', {
                detail: { jobNumber: selectedJobNumber }
            }));
        }
    }

    handleSelectionCleared(event) {
        const { caller } = event.detail;
        // Find all original cards that have a clone and deselect them
        const cardsWithClones = document.querySelectorAll('.biz-card-div.hasClone');
        cardsWithClones.forEach(card => this._deselectBizCardDiv(card));
        
        // Dispatch custom event for skill badges
        window.dispatchEvent(new CustomEvent('card-deselect', {
            detail: {}
        }));
    }

    handleHoverChanged(event) {
        const { hoveredJobNumber, caller } = event.detail;

        // Don't apply hover styling to the cDiv itself if it's selected (non-clone),
        // but still allow the event to proceed for paired rDiv coordination
        const shouldApplyHoverStyling = selectionManager.getSelectedJobNumber() !== hoveredJobNumber;

        if (shouldApplyHoverStyling) {
            // FLICKER FIX: Ensure only one cDiv can be hovered at a time
            // Clear all hovers first, then apply new hover atomically
            this.bizCardDivs.forEach(div => {
                if (div.classList.contains('hovered')) {
                    div.classList.remove('hovered');
                    const isSelected = div.classList.contains('selected');
                    if (!isSelected) {
                        div.classList.remove('hovered', 'selected');
                    }
                }
            });
            
            // Also clear hover from any clones
            const allClones = document.querySelectorAll('.biz-card-div[id*="-clone"]');
            allClones.forEach(clone => {
                if (clone.classList.contains('hovered')) {
                    clone.classList.remove('hovered');
                    const isSelected = clone.classList.contains('selected');
                    if (!isSelected) {
                        clone.classList.remove('hovered', 'selected');
                    }
                }
            });

            const bizCardDiv = this.getBizCardDivByJobNumber(hoveredJobNumber);
            if (bizCardDiv) {
                bizCardDiv.classList.add('hovered');
                bizCardDiv.classList.add('hovered');
            }
        }
    }

    handleHoverCleared(event) {
        const { caller } = event.detail;
        this.bizCardDivs.forEach(div => {
            const wasHovered = div.classList.contains('hovered');
            const isSelected = div.classList.contains('selected');
            
            // Only process cards that were actually hovered
            if (wasHovered) {
                div.classList.remove('hovered');
                
                // Reset to normal state (only if not selected)
                if (!isSelected) {
                    div.classList.remove('hovered', 'selected');
                }
            }
        });
        
        // Also clear hover from any clones
        const allClones = document.querySelectorAll('.biz-card-div[id*="-clone"]');
        allClones.forEach(clone => {
            const wasHovered = clone.classList.contains('hovered');
            const isSelected = clone.classList.contains('selected');
            
            // Only process clones that were actually hovered
            if (wasHovered) {
                clone.classList.remove('hovered');
                
                // Reset to normal state (only if not selected)
                if (!isSelected) {
                    clone.classList.remove('hovered', 'selected');
                }
            }
        });
    }

    handleColorPaletteChanged(event) {
        const { filename, paletteName, previousFilename } = event.detail;
        
        window.CONSOLE_LOG_IGNORE(`[CardsController] handleColorPaletteChanged: Palette changed from ${previousFilename} to ${filename} (${paletteName})`);
        
        // Apply new palette to all cards (both originals and clones) and their children
        this.bizCardDivs.forEach(div => {
            if (div) {
                // Apply palette to the div itself and all elements with data-color-index within it
                applyPaletteToElement(div);
                const colorElements = div.querySelectorAll('[data-color-index]');
                colorElements.forEach(applyPaletteToElement);
            }
        });
        
        // Also apply to any clones that might exist
        const allClones = document.querySelectorAll('.biz-card-div[id*="-clone"]');
        allClones.forEach(clone => {
            applyPaletteToElement(clone);
            const colorElements = clone.querySelectorAll('[data-color-index]');
            colorElements.forEach(applyPaletteToElement);
        });
        
        window.CONSOLE_LOG_IGNORE(`[CardsController] handleColorPaletteChanged: Applied new palette to ${this.bizCardDivs.length} cards and ${allClones.length} clones`);
    }

    isJobNumberSelected(jobNumber) {
        return selectionManager.getSelectedJobNumber() === jobNumber;
    }
    
    scrollBizCardDivIntoView(bizCardDiv, caller='') {
        const sceneContent = document.getElementById('scene-content');
        if (!sceneContent) throw new Error(`CardsController.scrollBizCardDivIntoView: ${caller} scene-content not found`);
    
        // Use centralized smooth scrolling with header positioning
        const headerSelector = '.biz-details-employer, .biz-details-role, .biz-details-dates, .biz-details-z-value, .biz-details-start-date, .biz-details-end-date';
        selectionManager.smoothScrollElementIntoView(bizCardDiv, sceneContent, headerSelector, `CardsController.${caller}`);
    }

    setupPointerEventsObserver() {
        const observer = new MutationObserver(mutations => {
            mutations.forEach(mutation => {
                if (mutation.attributeName === 'style') {
                    const el = mutation.target;
                    const pointerEvents = window.getComputedStyle(el).pointerEvents;
                    if (pointerEvents === 'none') {
                        el.classList.add('pointer-events-none');
                    } else {
                        el.classList.remove('pointer-events-none');
                    }
                }
            });
        });

        this.bizCardDivs.forEach(bizCardDiv => {
            observer.observe(bizCardDiv, { attributes: true, attributeFilter: ['style'] });
        });
    }

    _updateHoveredCard(jobNumber, shouldHover) {
        const cardDiv = this.getBizCardDivByJobNumber(jobNumber);
        if (cardDiv) {
            cardDiv.classList.toggle('hovered', shouldHover);
        }
    }

    _highlightCard(bizCardDiv, shouldHighlight) {
        if (shouldHighlight) {
            // ... existing code ...
        }
    }

    // Static method to reset the singleton instance
    static reset() {
        window.CONSOLE_LOG_IGNORE('[DEBUG] CardsController: Resetting singleton instance');
        if (CardsController.instance) {
            // Clean up any resources if needed
            CardsController.instance.bizCardDivs = [];
            CardsController.instance.isInitialized = false;
        }
        CardsController.instance = null;
    }

    // Static method to get the current instance
    static getInstance() {
        return CardsController.instance;
    }

    /**
     * Apply the same sort rule as ResumeListController to ensure consistency
     * Note: This does NOT change the visual positioning of cards - they maintain their timeline positions
     * This only updates the internal sorting state for coordination with ResumeListController
     */
    applySortRule(sortRule, isInitializing = false) {
        window.CONSOLE_LOG_IGNORE(`[DEBUG] CardsController.applySortRule: Called with sortRule=`, sortRule, `isInitializing=`, isInitializing);
        
        if (!this.originalJobsData) {
            window.CONSOLE_LOG_IGNORE('[DEBUG] CardsController.applySortRule: originalJobsData is null, cannot sort');
            return;
        }
        
        this.currentSortRule = { ...sortRule };

        window.CONSOLE_LOG_IGNORE(`[DEBUG] CardsController.applySortRule: Applying sort rule:`, this.currentSortRule);

        this.updateSortedIndices();
        
        // Don't automatically scroll to first card - let ResumeListController control selection
        window.CONSOLE_LOG_IGNORE(`[DEBUG] CardsController.applySortRule: Sort state updated (no visual changes)`);
        window.CONSOLE_LOG_IGNORE(`[DEBUG] CardsController.applySortRule: Sort completed`);
    }

    /**
     * Update the sorted indices based on the current sort rule
     */
    updateSortedIndices() {
        // Create array of indices with their corresponding job data
        const indexedJobs = this.originalJobsData.map((job, jobNumber) => ({
            jobNumber,
            job
        }));

        window.CONSOLE_LOG_IGNORE(`[DEBUG] CardsController.updateSortedIndices: Sorting by ${this.currentSortRule.field} ${this.currentSortRule.direction}`);

        // Sort based on the current rule
        indexedJobs.sort((a, b) => {
            let comparison = 0;
            
            switch (this.currentSortRule.field) {
                case 'employer':
                    comparison = this.compareStrings(a.job.employer, b.job.employer);
                    break;
                case 'startDate':
                    comparison = this.compareDates(a.job.start, b.job.start);
                    break;
                case 'role':
                    comparison = this.compareStrings(a.job.role, b.job.role);
                    break;
                case 'original':
                default:
                    comparison = a.jobNumber - b.jobNumber;
                    break;
            }
            
            // Apply direction
            return this.currentSortRule.direction === 'desc' ? -comparison : comparison;
        });

        // Extract the sorted indices
        this.sortedIndices = indexedJobs.map(item => item.jobNumber);
        window.CONSOLE_LOG_IGNORE(`[DEBUG] CardsController.updateSortedIndices: Final sortedIndices=`, this.sortedIndices);
    }

    /**
     * Compare strings for sorting
     */
    compareStrings(a, b) {
        const stringA = (a || '').toString().toLowerCase();
        const stringB = (b || '').toString().toLowerCase();
        return stringA.localeCompare(stringB);
    }

    /**
     * Compare dates for sorting
     */
    compareDates(a, b) {
        // Handle various date formats
        const dateA = this.parseDate(a);
        const dateB = this.parseDate(b);
        
        if (dateA === null && dateB === null) return 0;
        if (dateA === null) return -1;
        if (dateB === null) return 1;
        
        return dateA.getTime() - dateB.getTime();
    }

    /**
     * Parse date from various formats
     */
    parseDate(dateValue) {
        if (!dateValue) return null;
        
        // Handle "Present" or "Current" for end dates
        if (typeof dateValue === 'string' && 
            (dateValue.toLowerCase().includes('present') || 
             dateValue.toLowerCase().includes('current'))) {
            return new Date(); // Current date for "Present"
        }
        
        // Try to parse as date
        const parsed = new Date(dateValue);
        return isNaN(parsed.getTime()) ? null : parsed;
    }

    /**
     * Scroll to the first card in the sorted order
     * This uses the sorted indices to find the first job, then scrolls to that card's timeline position
     */
    scrollToFirstCard() {
        if (this.sortedIndices.length > 0) {
            const firstJobNumber = this.sortedIndices[0];
            const firstCard = this.getBizCardDivByJobNumber(firstJobNumber);
            if (firstCard) {
                window.CONSOLE_LOG_IGNORE(`[DEBUG] CardsController.scrollToFirstCard: Scrolling to first card (job ${firstJobNumber}) at timeline position`);
                this.scrollBizCardDivIntoView(firstCard, 'CardsController.scrollToFirstCard');
            } else {
                window.CONSOLE_LOG_IGNORE(`[DEBUG] CardsController.scrollToFirstCard: Could not find card for job ${firstJobNumber}`);
            }
        } else {
            window.CONSOLE_LOG_IGNORE('[DEBUG] CardsController.scrollToFirstCard: No sorted indices available');
        }
    }

    /**
     * Get the job number at a specific sorted jobNumber
     * This helps coordinate with ResumeListController
     */
    getJobNumberAtSortedIndex(sortedIndex) {
        if (this.sortedIndices && this.sortedIndices[sortedIndex] !== undefined) {
            return this.sortedIndices[sortedIndex];
        }
        return -1;
    }

    /**
     * Get the sorted jobNumber for a specific job number
     * This helps coordinate with ResumeListController
     */
    getSortedIndexForJobNumber(jobNumber) {
        if (this.sortedIndices) {
            return this.sortedIndices.indexOf(jobNumber);
        }
        return -1;
    }

    /**
     * Get the current sort rule for coordination with ResumeListController
     */
    getCurrentSortRule() {
        return { ...this.currentSortRule };
    }

    /**
     * Get the sorted indices array for coordination with ResumeListController
     */
    getSortedIndices() {
        return [...this.sortedIndices];
    }

    /**
     * Scroll to a specific job number (called by ResumeListController for coordination)
     */
    scrollToJobNumber(jobNumber) {
        window.CONSOLE_LOG_IGNORE(`[DEBUG] CardsController.scrollToJobNumber: Scrolling to job ${jobNumber}`);
        const card = this.getBizCardDivByJobNumber(jobNumber);
        if (card) {
            // Check if there's a clone (selected card) - if so, scroll to the clone instead of the original
            const cloneId = card.id + '-clone';
            const clone = document.getElementById(cloneId);
            const targetCard = clone || card; // Use clone if it exists, otherwise original card
            
            window.CONSOLE_LOG_IGNORE(`[DEBUG] CardsController.scrollToJobNumber: Found card for job ${jobNumber}, scrolling to ${clone ? 'clone' : 'original'}`);
            this.scrollBizCardDivIntoView(targetCard, 'CardsController.scrollToJobNumber');
        } else {
            window.CONSOLE_LOG_IGNORE(`[DEBUG] CardsController.scrollToJobNumber: Could not find card for job ${jobNumber}`);
        }
    }

    // Listen for sort rule changes from ResumeListController
    _setupSortListener() {
        window.CONSOLE_LOG_IGNORE('[DEBUG] CardsController._setupSortListener: Setting up sort listener');
        
        // Listen for custom events when sort rules change
        window.addEventListener('sort-rule-changed', (event) => {
            const { sortRule } = event.detail;
            window.CONSOLE_LOG_IGNORE(`[DEBUG] CardsController: Received sort rule change event:`, sortRule);
            this.applySortRule(sortRule);
        });

        // Check for ResumeListController sort rule after initialization
        // We'll retry a few times since ResumeListController might not be ready yet
        let retryCount = 0;
        const maxRetries = 10;
        
        const checkForResumeListController = () => {
            window.CONSOLE_LOG_IGNORE(`[DEBUG] CardsController._setupSortListener: Checking for ResumeListController (attempt ${retryCount + 1})`);
            
            if (window.resumeListController && window.resumeListController.getCurrentSortRule) {
                const resumeSortRule = window.resumeListController.getCurrentSortRule();
                window.CONSOLE_LOG_IGNORE('[DEBUG] CardsController._setupSortListener: Found ResumeListController sort rule:', resumeSortRule);
                if (resumeSortRule && resumeSortRule.field) {
                    window.CONSOLE_LOG_IGNORE(`[DEBUG] CardsController: Applying initial sort rule from ResumeListController:`, resumeSortRule);
                    this.applySortRule(resumeSortRule);
                }
            } else {
                retryCount++;
                if (retryCount < maxRetries) {
                    window.CONSOLE_LOG_IGNORE(`[DEBUG] CardsController._setupSortListener: ResumeListController not ready, retrying in 500ms (${retryCount}/${maxRetries})`);
                    setTimeout(checkForResumeListController, 500);
                } else {
                    window.CONSOLE_LOG_IGNORE('[DEBUG] CardsController._setupSortListener: ResumeListController not found after max retries, using default sort');
                    // Apply default sort rule if ResumeListController never becomes available
                    this.applySortRule({ field: 'startDate', direction: 'desc' }, true);
                }
            }
        };
        
        // Start checking after a short delay
        setTimeout(checkForResumeListController, 100);
    }
}

export const cardsController = new CardsController();

// Global function for testing sorting
window.testCardsSorting = function() {
    window.CONSOLE_LOG_IGNORE('[DEBUG] testCardsSorting: Manual test function called');
    if (window.cardsController) {
        window.CONSOLE_LOG_IGNORE('[DEBUG] testCardsSorting: Triggering sort by employer ascending');
        window.cardsController.applySortRule({ field: 'employer', direction: 'asc' });
    } else {
        window.CONSOLE_LOG_IGNORE('[DEBUG] testCardsSorting: CardsController not found');
    }
};

// Global function for debugging card state
window.debugCardsState = function() {
    window.CONSOLE_LOG_IGNORE('[DEBUG] debugCardsState: Current cards state');
    if (window.cardsController) {
        window.CONSOLE_LOG_IGNORE('[DEBUG] debugCardsState: CardsController found');
        window.CONSOLE_LOG_IGNORE('[DEBUG] debugCardsState: bizCardDivs length:', window.cardsController.bizCardDivs.length);
        window.CONSOLE_LOG_IGNORE('[DEBUG] debugCardsState: sortedIndices:', window.cardsController.sortedIndices);
        window.CONSOLE_LOG_IGNORE('[DEBUG] debugCardsState: currentSortRule:', window.cardsController.currentSortRule);
        
        // Show all cards in DOM order (timeline positioning)
        const scenePlaneEl = document.getElementById('scene-plane');
        if (scenePlaneEl) {
            const cards = scenePlaneEl.querySelectorAll('.biz-card-div:not(.hasClone)');
            window.CONSOLE_LOG_IGNORE('[DEBUG] debugCardsState: Cards in DOM (timeline order):');
            cards.forEach((card, jobNumber) => {
                // const jobNumber = card.getAttribute('data-job-number');
                const sceneTop = card.getAttribute('data-sceneTop');
                const roleElement = card.querySelector('.biz-details-role');
                const employerElement = card.querySelector('.biz-details-employer');
                const role = roleElement ? roleElement.textContent.trim() : 'N/A';
                const employer = employerElement ? employerElement.textContent.trim() : 'N/A';
                window.CONSOLE_LOG_IGNORE(`  DOM Index ${jobNumber}: Job ${jobNumber} (top: ${sceneTop}px) -> "${role}" at "${employer}"`);
            });
        }
        
        // Show sorted order (for coordination with ResumeListController)
        window.CONSOLE_LOG_IGNORE('[DEBUG] debugCardsState: Sorted order (for coordination):');
        if (window.cardsController.sortedIndices) {
            window.cardsController.sortedIndices.forEach((jobNumber, sortedIndex) => {
                const card = window.cardsController.getBizCardDivByJobNumber(jobNumber);
                if (card) {
                    const roleElement = card.querySelector('.biz-details-role');
                    const employerElement = card.querySelector('.biz-details-employer');
                    const role = roleElement ? roleElement.textContent.trim() : 'N/A';
                    const employer = employerElement ? employerElement.textContent.trim() : 'N/A';
                    window.CONSOLE_LOG_IGNORE(`  Sorted Index ${sortedIndex}: Job ${jobNumber} -> "${role}" at "${employer}"`);
                }
            });
        }
        
        window.CONSOLE_LOG_IGNORE('[DEBUG] debugCardsState: Note: Cards maintain timeline positioning, sorting only affects coordination with resume items');
    } else {
        window.CONSOLE_LOG_IGNORE('[DEBUG] debugCardsState: CardsController not found');
    }
};

// Export utility functions for use by other modules
export const createBizCardDivId = (jobNumber) => `biz-card-div-${jobNumber}`;
export const createBizResumeDivId = (jobNumber) => `biz-resume-div-${jobNumber}`;
export const createBizResumeDetailsDivId = (jobNumber) => `biz-resume-details-div-${jobNumber}`;
export const createBizResumeDetailsDivClass = () => 'biz-resume-details-div';
export const createBizCardDetailsDivId = (jobNumber) => `biz-card-details-div-${jobNumber}`;
export const createBizCardDetailsDivClass = () => 'biz-card-details-div';