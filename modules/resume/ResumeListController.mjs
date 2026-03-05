// modules/resume/ResumeListController.mjs

import { BaseComponent } from '../core/abstracts/BaseComponent.mjs';
import { InfiniteScrollingContainer } from './infiniteScrollingContainer.mjs';
import * as domUtils from '../utils/domUtils.mjs';
import { dragStateManager } from '../core/dragStateManager.mjs';
// No longer directly interacting with these for selection
// import { bizCardDivManager } from '../scene/bizCardDivManager.mjs';
// import * as scenePlane from '../scene/scenePlane.mjs';
import { selectionManager } from '../core/selectionManager.mjs';
// import { cardsController } from '../scene/CardsController.mjs'; // Now using Vue composable approach
import { AppState, saveState } from '../core/stateManager.mjs';
// import { initializationManager } from '../core/initializationManager.mjs'; // IM framework no longer used
// Import enriched jobs (jobs + skills) for bizCards and skillCards
import { jobs } from '../data/enrichedJobs.mjs';
// Import new Vue composable for color palette functionality
import { applyPaletteToElement } from '../composables/useColorPalette.mjs';
// Import fundamental components to ensure they're registered with IM
// import '../core/jobsDataManager.mjs'; // No longer exists - using Vue composables
// import '../core/colorPaletteManager.mjs'; // No longer exists - using Vue composables
// import * as BizDetailsDivModule from '../scene/bizDetailsDivModule.mjs'; // Module doesn't exist - needs to be recreated
import * as utils from '../utils/utils.mjs';

/**
 * ResumeListController - Manages the infinite scrolling resume list
 * 
 * KEY CONCEPT: There are two different indexing systems:
 * 1. jobNumber: The original, unique identifier for a job (0, 1, 2, ...)
 * 2. sortedIndex: The position of a job in the current sorted order
 * 
 * sortedIndices[sortedIndex] = jobNumber
 * Example: sortedIndices[10] = 10 means jobNumber 10 is at position 10 in sorted order
 * 
 * The infinite scroller receives items in sorted order, so:
 * - infiniteScroller.originalItems[sortedIndex] = resume div for jobNumber
 * - When calling infiniteScroller.scrollToIndex(sortedIndex), it scrolls to the job at that sorted position
 */
class ResumeListController extends BaseComponent {
  constructor() {
    super('ResumeListController');
    // Singleton pattern: return existing instance if one exists
    if (ResumeListController.instance) {
      console.debug('[ResumeListController] existing instance');
      return ResumeListController.instance;
    }

    // Create new instance
    console.debug('[ResumeListController] new instance');
    
    this.resumeContentDiv = null; // Defer initialization
    this.infiniteScroller = null;
    this.bizResumeDivs = null;
    this.originalJobsData = null;
    this.currentSortRule = { field: 'startDate', direction: 'desc' }; // Default sort rule
    this.sortedIndices = []; // Maps sorted position to original index
    this.removedJobNumbers = new Set(); // Jobs removed from listing via rDiv close
    // isInitialized is managed by BaseComponent automatically

    this._setupColorPaletteListener();
    this._setupSelectionListeners();
    
    // Store the singleton instance
    ResumeListController.instance = this;
    
    // Add to window for global access and debugging
    window.resumeListController = this;
    
    console.debug('[ResumeListController] singleton stored');
  }

  getComponentName() {
    return 'ResumeListController';
  }

  destroy() {
    this.resumeContentDiv = null;
    this.infiniteScroller = null;
    this.bizResumeDivs = null;
    this.originalJobsData = null;
    this.currentSortRule = { field: 'startDate', direction: 'desc' }; // Default sort rule
    this.sortedIndices = [];
    // isInitialized is managed by BaseComponent automatically
  }

  // registerForInitialization() method removed - BaseComponent handles registration automatically

  initialize({ CardsController, JobsDataManager, ColorPaletteManager }) {
    console.debug('[ResumeListController] initializing', {
      CardsController: !!CardsController,
      JobsDataManager: !!JobsDataManager,
      ColorPaletteManager: !!ColorPaletteManager
    });

    // Business logic only - no DOM operations here
    // DOM operations moved to setupDom()

    // Store injected dependencies
    // this.cardsController = CardsController; // No longer using legacy CardsController
    // this.jobsDataManager = JobsDataManager; // No longer using JobsDataManager - using direct import
    // this.colorPaletteManager = ColorPaletteManager; // No longer using ColorPaletteManager

    // Get jobs data directly (no longer using JobsDataManager)
    this.originalJobsData = jobs;
    
    console.debug('[ResumeListController] init complete');
  }

    /**
     * Template ref injection for resume-content-div element
     * Replaces resumecontentdivElement calls
     * @param {HTMLElement} element - The DOM element from template ref
     */
    setResumeContentDivElement(element) {
        this.resumecontentdivElement = element;
        console.debug('[ResumeListController] resume-content-div ref set');
        
        // Apply any setup that was waiting for this element
        if (this.resumecontentdivElement) {
            this._setupResumeContentDiv();
        }
    }

    /**
     * Template ref injection for resume-content-div-wrapper element
     * Replaces resumecontentdivwrapperElement calls
     * @param {HTMLElement} element - The DOM element from template ref
     */
    setResumeContentDivWrapperElement(element) {
        this.resumecontentdivwrapperElement = element;
        console.debug('[ResumeListController] resume-content-div-wrapper ref set');
        
        // Apply any setup that was waiting for this element
        if (this.resumecontentdivwrapperElement) {
            this._setupResumeContentDivWrapper();
        }
    }

    /**
     * Setup logic for resume-content-div-wrapper element
     * Called when element becomes available via template ref
     */
    _setupResumeContentDivWrapper() {
        // DOM setup is handled by the main setupDom() method for IM compliance
        // This method exists for template ref injection pattern
        console.debug('[ResumeListController] wrapper ref available');
    }

    /**
     * Setup logic for resume-content-div element
     * Called when element becomes available via template ref
     */
    _setupResumeContentDiv() {
        // DOM setup is handled by the main setupDom() method for IM compliance
        // This method exists for template ref injection pattern
        console.debug('[ResumeListController] content div ref available');
    }

    /**
     * DOM setup phase - called after Vue DOM is ready
     * DOM operations moved from initialize() for proper separation
     */
    async setupDom() {
        console.debug('[ResumeListController] DOM setup');
        
        // Use template refs instead of document.resumecontentdivElement
        this.resumeContentDiv = this.resumecontentdivElement;
        if (!this.resumeContentDiv) throw new Error('ResumeListController: setupDom: resume-content-div not available via template ref - ensure setResumeContentDivElement() was called');
        
        this.resumeContentWrapper = this.resumecontentdivwrapperElement;
        if (!this.resumeContentWrapper) throw new Error('ResumeListController: setupDom: resume-content-div-wrapper not available via template ref - ensure setResumeContentDivWrapperElement() was called');
        
        // Create resume divs using CardsController's bizCardDivs (DOM operations moved from initialize)
        if (this.cardsController && this.cardsController.bizCardDivs) {
            this.bizResumeDivs = await this.createAllBizResumeDivs(this.cardsController.bizCardDivs);
            
            // Add resume divs to the DOM
            this.bizResumeDivs.forEach((div, index) => {
                if (div instanceof Node) {
                    this.resumeContentDiv.appendChild(div);
                } else {
                    console.error(`[ResumeListController] Resume div ${index} is not a Node:`, div);
                }
            });
            
            console.debug('[ResumeListController] resume divs added', this.bizResumeDivs.length);
        } else {
            console.warn('[ResumeListController] setupDom: CardsController or bizCardDivs not available');
        }
        
        console.debug('[ResumeListController] DOM setup complete');
    }

  reinitialize(bizResumeDivs) {
    console.debug('[ResumeListController] reinitializing');
    
    this.bizResumeDivs = bizResumeDivs;
    
    // Reset the singleton instance to ensure clean state
    InfiniteScrollingContainer.reset();
    
    this.setupInfiniteScrolling();
    
    // After re-setup, we should scroll to the currently selected item.
    const selectedJobNumber = selectionManager.getSelectedJobNumber();
    if (selectedJobNumber !== null) {
      this.scrollToJobNumber(selectedJobNumber, 'reinitialize');
    }
  }

  // isInitialized() method removed - use this.isInitialized property from BaseComponent

  // region Event Handlers from SelectionManager
      handleSelectionChanged(event) {
        const { selectedJobNumber, caller } = event.detail;

        // The SelectionManager already handles saving to AppState.selectedJobNumber
        // No need to save resume-specific selection state here

        // console.log(`[DEBUG] ResumeListController.handleSelectionChanged: selectedJobNumber=${selectedJobNumber}, caller=${caller}`);

        // Visual selection is now handled by SelectionManager - no need to call deprecated method
        
        // Scrolling is now handled by individual components (ResumeItemsController for rDiv clicks)
        // No centralized scrolling needed here as click events handle their own scroll-into-view
    }

    handleSelectionCleared(event) {
        const { caller } = event.detail;
        // console.log(`[DEBUG] ResumeListController.handleSelectionCleared: caller=${caller}`);
        
        // Visual selection clearing is now handled by SelectionManager
        // Note: SelectionManager.clearSelection() is typically called by the component that initiated the clear
        // ResumeListController just needs to respond to the clear event, not initiate it
    }

    /**
     * Handle new job-selected events for bidirectional scrolling
     */
    handleJobSelected(event) {
        const { jobNumber, source } = event.detail;
        console.debug('[ResumeListController] handleJobSelected', jobNumber);
        
        // rDiv scrolling is now handled by ResumeItemsController when rDivs are clicked
        // No centralized scrolling needed here
    }



    /**
     * Handle new selection-cleared events for bidirectional scrolling  
     */
    handleJobSelectionCleared(event) {
        console.debug('[ResumeListController] handleJobSelectionCleared');
        // Visual clearing handled by SelectionManager and ResumeItemsController
        // No rDiv scrolling needed when selection is cleared
    }

    /**
     * DEPRECATED: Visual selection is now handled by SelectionManager
     * @deprecated Use selectionManager.selectJobNumber() instead
     */
    updateVisualSelection(selectedJobNumber) {
        console.warn('[DEPRECATED] ResumeListController.updateVisualSelection is deprecated. Use selectionManager.selectJobNumber() instead.');
        // Visual selection is now handled by SelectionManager
    }

    /**
     * DEPRECATED: Visual selection is now handled by SelectionManager
     * @deprecated Use selectionManager.clearSelection() instead
     */
    clearVisualSelection() {
        console.warn('[DEPRECATED] ResumeListController.clearVisualSelection is deprecated. Use selectionManager.clearSelection() instead.');
        // Visual selection is now handled by SelectionManager
    }

  /**
   * Remove a job's rDiv from the resume listing (persists until reload).
   */
  removeJobFromListing(jobNumber) {
    if (!this.bizResumeDivs || !this.infiniteScroller) return;
    this.removedJobNumbers.add(jobNumber);
    this._setItemsFromSorted();
  }

  /**
   * Ensure a job's rDiv is in the listing (if it was removed, add it back). Call before scrolling to that job.
   */
  ensureJobInListing(jobNumber) {
    if (!this.bizResumeDivs || !this.infiniteScroller) return;
    if (!this.removedJobNumbers.has(jobNumber)) return;
    this.removedJobNumbers.delete(jobNumber);
    this._setItemsFromSorted();
  }

  _setItemsFromSorted() {
    const sortedDivs = this.sortedIndices
      .filter((j) => !this.removedJobNumbers.has(j))
      .map((j) => this.bizResumeDivs[j]);
    const selectedJobNumber = selectionManager.getSelectedJobNumber();
    const visibleJobNumbers = this.sortedIndices.filter((j) => !this.removedJobNumbers.has(j));
    let start = 0;
    if (selectedJobNumber !== null) {
      const idx = visibleJobNumbers.indexOf(selectedJobNumber);
      if (idx !== -1) start = idx;
    }
    this.infiniteScroller.setItems(sortedDivs, start);
  }
  // endregion

  setupInfiniteScrolling() {
    console.debug('[ResumeListController] setupInfiniteScrolling');
    
    if (!this.bizResumeDivs || this.bizResumeDivs.length === 0) {
      console.debug('[ResumeListController] no bizResumeDivs');
      return;
    }

    // Create the infinite scroller - the constructor handles the singleton pattern
    console.debug('[ResumeListController] creating infinite scroller');
    this.infiniteScroller = new InfiniteScrollingContainer(
      this.resumeContentWrapper, // scrollport element
      this.resumeContentDiv,     // content element
      {
        onItemChange: this.handleResumeItemChange.bind(this)
      }
    );
    
    if (!this.infiniteScroller) {
      console.log(`[DEBUG] setupInfiniteScrolling: Failed to create infinite scroller instance`);
      return;
    }

    console.debug('[ResumeListController] infinite scroller ready');
    
    // Update sort order and build sorted divs *before* any scroll (so originalItems is set before scrollToIndex)
    this.updateSortedIndices();
    
    // Debug the mapping before creating sortedDivs
    console.debug('[ResumeListController] sortedIndices set');
    // this.sortedIndices.forEach((jobNumber, sortedIndex) => {
    //   console.log(`  Index ${sortedIndex} -> Job ${jobNumber}`);
    // });
    
    // Create sortedDivs array in the correct order (excluding removed)
    const sortedDivs = this.sortedIndices
      .filter((jobNum) => !this.removedJobNumbers.has(jobNum))
      .map((originalIndex) => this.bizResumeDivs[originalIndex]);
    
    // Verify the mapping is correct
    console.debug('[ResumeListController] verifying sortedDivs');
    // sortedDivs.forEach((div, sortedIndex) => {
    //   if (div) {
    //     const jobNumber = div.getAttribute('data-job-number');
    //     const expectedJobNumber = this.sortedIndices[sortedIndex];
    //     if (parseInt(jobNumber) !== expectedJobNumber) {
    //       console.log(`[DEBUG] setupInfiniteScrolling: MAPPING ERROR! sortedDivs[${sortedIndex}] has job ${jobNumber}, expected ${expectedJobNumber}`);
    //     } else {
    //       console.log(`  sortedDivs[${sortedIndex}] -> Job ${jobNumber} ✓`);
    //     }
    //   }
    // });
    
    // Get the currently selected job number (startingIndex in visible/filtered list)
    const selectedJobNumber = selectionManager.getSelectedJobNumber();
    const visibleJobNumbers = this.sortedIndices.filter((j) => !this.removedJobNumbers.has(j));
    let startingIndex = 0;
    if (selectedJobNumber !== null) {
      const idx = visibleJobNumbers.indexOf(selectedJobNumber);
      if (idx !== -1) startingIndex = idx;
    }
    
    // Debug: Show expected job numbers at each position
    console.log(`[DEBUG] setupInfiniteScrolling: Expected job numbers at each position:`);
    // this.sortedIndices.forEach((jobNumber, sortedIndex) => {
    //   console.log(`  sortedIndices[${sortedIndex}] = ${jobNumber}`);
    // });
    
    // Debug: Check actual content vs job numbers
    console.log(`[DEBUG] setupInfiniteScrolling: Checking actual content vs job numbers:`);
    for (let i = 0; i < Math.min(5, sortedDivs.length); i++) {
      const div = sortedDivs[i];
      if (div) {
        const jobNumber = div.getAttribute('data-job-number');
        const roleElement = div.querySelector('.biz-details-role');
        const employerElement = div.querySelector('.biz-details-employer');
        const role = roleElement ? roleElement.textContent.trim() : 'N/A';
        const employer = employerElement ? employerElement.textContent.trim() : 'N/A';
        console.log(`  Index ${i}: Job ${jobNumber} -> "${role}" at "${employer}"`);
      }
    }
    
    // Debug: Check specific job 10 content
    const job10SortedIndex = this.sortedIndices.indexOf(10);
    if (job10SortedIndex !== -1) {
      const job10Div = sortedDivs[job10SortedIndex];
      if (job10Div) {
        const roleElement = job10Div.querySelector('.biz-details-role');
        const employerElement = job10Div.querySelector('.biz-details-employer');
        const role = roleElement ? roleElement.textContent.trim() : 'N/A';
        const employer = employerElement ? employerElement.textContent.trim() : 'N/A';
        console.log(`[DEBUG] setupInfiniteScrolling: Checking job 10 content:`);
        console.log(`  Job 10 (at sorted index ${job10SortedIndex}): Job 10 -> "${role}" at "${employer}"`);
      }
    }
    
    // Set the items in the infinite scroller
    this.infiniteScroller.setItems(sortedDivs, startingIndex);
    
    // Explicitly scroll to the starting index to ensure proper positioning
    this.infiniteScroller.scrollToIndex(startingIndex, false); // false = no animation
    
    // Force a recalculation of heights after initialization to ensure all content is properly contained
    setTimeout(() => {
      console.log('[DEBUG] setupInfiniteScrolling: Forcing initial height recalculation');
      dragStateManager.executeOrDefer(() => {
        this.infiniteScroller.recalculateHeights();
      }, 'setupInfiniteScrolling-recalculateHeights');
    }, 100);
    
    // After setting items, verify the infinite scroller has the correct mapping
    if (this.infiniteScroller.originalItems) {
      console.log(`[DEBUG] setupInfiniteScrolling: Verifying infinite scroller mapping:`);
      for (let i = 0; i < Math.min(10, this.infiniteScroller.originalItems.length); i++) {
        const item = this.infiniteScroller.originalItems[i];
        if (item) {
          const jobNumber = item.getAttribute('data-job-number');
          const expectedJobNumber = this.sortedIndices[i];
          if (parseInt(jobNumber) !== expectedJobNumber) {
            console.log(`[DEBUG] setupInfiniteScrolling: INFINITE SCROLLER MISMATCH! originalItems[${i}] has job ${jobNumber}, expected ${expectedJobNumber}`);
          } else {
            console.log(`  Infinite scroller originalItems[${i}] -> Job ${jobNumber} ✓`);
          }
        }
      }
    }
    
    // Recalculate heights after palette application to ensure proper positioning
    dragStateManager.executeOrDefer(() => {
      this.infiniteScroller.recalculateHeightsAfterPalette();
    }, 'applyPalette-recalculateHeights');
    
    // Add global debug function for testing
    window.debugInfiniteScroller = (jobNumber) => {
      if (window.resumeListController) {
        window.resumeListController.debugScrollToJob(jobNumber);
      } else {
        console.log('ResumeListController not available on window object');
      }
    };
    
    // Add global test function for easy testing
    window.testScrollToJob = (jobNumber) => {
      if (window.resumeListController) {
        console.log(`[TEST] Testing scroll to job ${jobNumber}`);
        window.resumeListController.scrollToJobNumber(jobNumber, 'testScrollToJob');
      } else {
        console.log('ResumeListController not available on window object');
      }
    };
    
    // Add global debug function for sort rule consistency
    window.debugSortConsistency = () => {
      if (window.resumeListController) {
        window.resumeListController.debugSortRuleConsistency();
      } else {
        console.log('ResumeListController not available on window object');
      }
    };
    
    // Add global function to force synchronization between controllers
    window.forceSyncControllers = () => {
      console.log('[DEBUG] forceSyncControllers: Forcing synchronization between controllers');
      
      if (window.resumeListController) {
        const resumeSortRule = window.resumeListController.getCurrentSortRule();
        console.log('[DEBUG] forceSyncControllers: ResumeListController sort rule:', resumeSortRule);
        
        // Note: CardsController is now using Vue composables, no longer syncing here
        // window.cardsController.applySortRule(resumeSortRule);
        
        // Check if they're now in sync
        setTimeout(() => {
          window.resumeListController.debugSortRuleConsistency();
        }, 100);
      } else {
        console.log('One or both controllers not available');
      }
    };

    // Add global function to test scrolling to specific job numbers
    window.testScrollToJob = (jobNumber) => {
      console.log(`[TEST] Testing scroll to job ${jobNumber}`);
      if (window.resumeListController) {
        window.resumeListController.scrollToJobNumber(jobNumber, 'testScrollToJob');
      } else {
        console.log('ResumeListController not available on window object');
      }
    };

    // Add global function to force scroll to job 10 specifically
    window.forceScrollToJob10 = () => {
      console.log('[TEST] Force scrolling to job 10');
      if (window.resumeListController && window.resumeListController.infiniteScroller) {
        const scroller = window.resumeListController.infiniteScroller;
        
        // Find job 10 in the original items
        const job10Index = scroller.originalItems.findIndex(item => {
          const jobNumber = item.getAttribute('data-job-number');
          return parseInt(jobNumber) === 10;
        });
        
        console.log(`[TEST] Job 10 found at original index: ${job10Index}`);
        
        if (job10Index !== -1) {
          // Force scroll to this index
          scroller.scrollToIndex(job10Index, false);
          
          // Also try the job number method
          setTimeout(() => {
            window.resumeListController.scrollToJobNumber(10, 'forceScrollToJob10');
          }, 100);
        } else {
          console.log('[TEST] Job 10 not found in original items!');
        }
      } else {
        console.log('ResumeListController or infinite scroller not available');
      }
    };

    // Add global function to log viewport and resume div coordinates
    window.logCoordinates = (jobNumber = 10) => {
      console.log(`[TEST] Logging coordinates for job ${jobNumber}`);
      if (window.resumeListController) {
        window.resumeListController.logViewportAndResumeDivCoordinates(jobNumber, 'logCoordinates');
      } else {
        console.log('ResumeListController not available on window object');
      }
    };

    // Add global function to check what jobs are currently visible in the viewport
    window.checkVisibleJobs = () => {
      console.log(`[TEST] Checking what jobs are currently visible in the viewport`);
      if (window.resumeListController && window.resumeListController.infiniteScroller) {
        const scroller = window.resumeListController.infiniteScroller;
        const viewportTop = scroller.scrollport.scrollTop;
        const viewportHeight = scroller.scrollport.offsetHeight;
        const viewportBottom = viewportTop + viewportHeight;
        
        console.log(`[TEST] Viewport: top=${viewportTop}px, bottom=${viewportBottom}px, height=${viewportHeight}px`);
        
        // Check all items to see which ones are visible
        scroller.allItems.forEach((item, index) => {
          if (item && item.element) {
            const itemTop = item.top;
            const itemBottom = itemTop + item.height;
            const jobNumber = item.element.getAttribute('data-job-number');
            const type = item.type;
            
            // Check if item is visible
            const isVisible = itemTop < viewportBottom && itemBottom > viewportTop;
            if (isVisible) {
              console.log(`[TEST] VISIBLE: Item ${index} (${type}) - Job ${jobNumber} - top: ${itemTop}px, bottom: ${itemBottom}px`);
              
              // Get job details
              const roleElement = item.element.querySelector('.biz-details-role');
              const employerElement = item.element.querySelector('.biz-details-employer');
              const role = roleElement ? roleElement.textContent.trim() : 'N/A';
              const employer = employerElement ? employerElement.textContent.trim() : 'N/A';
              console.log(`[TEST]   Details: "${role}" at "${employer}"`);
            }
          }
        });
      } else {
        console.log('ResumeListController or infinite scroller not available');
      }
    };

    // Add global function to compare Job 5 vs Job 10 positioning
    window.compareJob5vs10 = () => {
      console.log(`[TEST] Comparing Job 5 vs Job 10 positioning`);
      if (window.resumeListController && window.resumeListController.infiniteScroller) {
        const scroller = window.resumeListController.infiniteScroller;
        const viewportTop = scroller.scrollport.scrollTop;
        const viewportHeight = scroller.scrollport.offsetHeight;
        const viewportBottom = viewportTop + viewportHeight;
        
        console.log(`[TEST] Viewport: top=${viewportTop}px, bottom=${viewportBottom}px`);
        
        // Find Job 5 and Job 10
        let job5Item = null;
        let job10Item = null;
        
        scroller.allItems.forEach((item, index) => {
          if (item && item.element) {
            const jobNumber = item.element.getAttribute('data-job-number');
            if (jobNumber === '5') job5Item = { item, index };
            if (jobNumber === '10') job10Item = { item, index };
          }
        });
        
        if (job5Item) {
          const item = job5Item.item;
          const itemTop = item.top;
          const itemBottom = itemTop + item.height;
          const isVisible = itemTop < viewportBottom && itemBottom > viewportTop;
          console.log(`[TEST] Job 5: top=${itemTop}px, bottom=${itemBottom}px, visible=${isVisible}`);
          
          const roleElement = item.element.querySelector('.biz-details-role');
          const employerElement = item.element.querySelector('.biz-details-employer');
          const role = roleElement ? roleElement.textContent.trim() : 'N/A';
          const employer = employerElement ? employerElement.textContent.trim() : 'N/A';
          console.log(`[TEST] Job 5 details: "${role}" at "${employer}"`);
        }
        
        if (job10Item) {
          const item = job10Item.item;
          const itemTop = item.top;
          const itemBottom = itemTop + item.height;
          const isVisible = itemTop < viewportBottom && itemBottom > viewportTop;
          console.log(`[TEST] Job 10: top=${itemTop}px, bottom=${itemBottom}px, visible=${isVisible}`);
          
          const roleElement = item.element.querySelector('.biz-details-role');
          const employerElement = item.element.querySelector('.biz-details-employer');
          const role = roleElement ? roleElement.textContent.trim() : 'N/A';
          const employer = employerElement ? employerElement.textContent.trim() : 'N/A';
          console.log(`[TEST] Job 10 details: "${role}" at "${employer}"`);
        }
        
        if (job5Item && job10Item) {
          const job5Top = job5Item.item.top;
          const job10Top = job10Item.item.top;
          console.log(`[TEST] Job 5 is ${job5Top < job10Top ? 'ABOVE' : 'BELOW'} Job 10 by ${Math.abs(job5Top - job10Top)}px`);
        }
      } else {
        console.log('ResumeListController or infinite scroller not available');
      }
    };

    // Add global function to debug infinite scroller state
    window.debugInfiniteScroller = () => {
      if (window.resumeListController && window.resumeListController.infiniteScroller) {
        const scroller = window.resumeListController.infiniteScroller;
        console.log('[DEBUG] Infinite Scroller State:');
        console.log('  - Current index:', scroller.currentIndex);
        console.log('  - Original items count:', scroller.originalItems.length);
        console.log('  - All items count:', scroller.allItems.length);
        console.log('  - Scroll position:', scroller.scrollport.scrollTop);
        console.log('  - Container height:', scroller.scrollport.offsetHeight);
        console.log('  - Content height:', scroller.scrollport.scrollHeight);
        
        // Show first 5 original items
        console.log('  - First 5 original items:');
        for (let i = 0; i < Math.min(5, scroller.originalItems.length); i++) {
          const item = scroller.originalItems[i];
          if (item) {
            const jobNumber = item.getAttribute('data-job-number');
            console.log(`    [${i}] Job ${jobNumber}`);
          }
        }
        
        // Check what's currently visible in the viewport
        console.log('  - Currently visible items:');
        const containerHeight = scroller.scrollport.offsetHeight;
        const scrollTop = scroller.scrollport.scrollTop;
        const visibleTop = scrollTop;
        const visibleBottom = scrollTop + containerHeight;
        
        scroller.allItems.forEach((item, index) => {
          if (item && item.element) {
            const itemTop = item.top;
            const itemBottom = itemTop + item.height;
            
            // Check if item is visible
            const isVisible = itemTop < visibleBottom && itemBottom > visibleTop;
            if (isVisible) {
              const jobNumber = item.element.getAttribute('data-job-number');
              const type = item.type;
              console.log(`    [${index}] ${type} Job ${jobNumber} - top: ${itemTop}, bottom: ${itemBottom}`);
            }
          }
        });
      } else {
        console.log('Infinite scroller not available');
      }
    };
    
    // Add global function to test the job 10 -> job 22 mismatch
    window.testJob10Mismatch = () => {
      console.log('[DEBUG] testJob10Mismatch: Testing job 10 -> job 22 mismatch');
      
      if (window.resumeListController) {
        // Check what job is at sorted index 10 in resume controller
        const resumeJob10 = window.resumeListController.sortedIndices[10];
        // const cardsJob10 = window.cardsController.sortedIndices[10]; // CardsController no longer available
        
        console.log(`[DEBUG] testJob10Mismatch: ResumeListController sortedIndices[10] = ${resumeJob10}`);
        // console.log(`[DEBUG] testJob10Mismatch: CardsController sortedIndices[10] = ${cardsJob10}`);
        
        // Note: Skipping detailed comparison since CardsController not available
        console.log(`[DEBUG] testJob10Mismatch: Resume shows job ${resumeJob10} at sorted index 10`);
        
        // Show the job details for resume controller
        if (resumeJob10 !== undefined) {
          const resumeDiv = window.resumeListController.getBizResumeDivByJobNumber(resumeJob10);
          if (resumeDiv) {
            const roleElement = resumeDiv.querySelector('.biz-details-role');
            const employerElement = resumeDiv.querySelector('.biz-details-employer');
            const role = roleElement ? roleElement.textContent.trim() : 'N/A';
            const employer = employerElement ? employerElement.textContent.trim() : 'N/A';
            console.log(`[DEBUG] testJob10Mismatch: Resume job ${resumeJob10} -> "${role}" at "${employer}"`);
          }
        }
        
        // Note: CardsController comparison not available since using Vue composables
      } else {
        console.log('One or both controllers not available');
      }
    };
    
    // Add global function to force recalculation of heights
    window.forceRecalculateHeights = () => {
      console.log('[TEST] Force recalculating infinite scroller heights');
      if (window.resumeListController && window.resumeListController.infiniteScroller) {
        dragStateManager.executeOrDefer(() => {
          window.resumeListController.infiniteScroller.recalculateHeights();
        }, 'forceRecalculateHeights-manual');
      } else {
        console.log('ResumeListController or infinite scroller not available');
      }
    };

    console.log('[DEBUG] ResumeListController: Added window.debugInfiniteScroller(), window.testScrollToJob(jobNumber), window.forceScrollToJob10(), window.logCoordinates(jobNumber), window.checkVisibleJobs(), window.compareJob5vs10(), window.debugSortConsistency(), window.forceSyncControllers(), window.testJob10Mismatch(), and window.forceRecalculateHeights() for testing');
  }

  handleResumeItemChange(index, resumeDiv) {
    const originalIndex = this.sortedIndices[index];
    // This function can be used for future functionality if needed
  }

  goToNextResumeItem() {
    const selectedJobNumber = selectionManager.getSelectedJobNumber();

    if (!this.sortedIndices || this.sortedIndices.length === 0) return;

    let currentSortedPosition = -1;
    if (selectedJobNumber !== null) {
      currentSortedPosition = this.sortedIndices.indexOf(selectedJobNumber);
    }

    const nextSortedPosition = (currentSortedPosition + 1) % this.sortedIndices.length;
    const nextJobNumber = this.sortedIndices[nextSortedPosition];

    selectionManager.selectJobNumber(nextJobNumber, 'ResumeListController.goToNextResumeItem');
  }

  goToPreviousResumeItem() {
    const selectedJobNumber = selectionManager.getSelectedJobNumber();
    console.log(`[DEBUG] goToPreviousResumeItem START: selectedJobNumber=${selectedJobNumber}`);

    if (!this.sortedIndices || this.sortedIndices.length === 0) return;

    let currentSortedPosition = -1;
    if (selectedJobNumber !== null) {
      currentSortedPosition = this.sortedIndices.indexOf(selectedJobNumber);
    }

    console.log(`[DEBUG] goToPreviousResumeItem: currentSortedPosition=${currentSortedPosition}, sortedIndices.length=${this.sortedIndices.length}`);

    let prevSortedPosition;
    if (currentSortedPosition <= 0) {
      prevSortedPosition = this.sortedIndices.length - 1;
    } else {
      prevSortedPosition = currentSortedPosition - 1;
    }

    const prevJobNumber = this.sortedIndices[prevSortedPosition];
    console.log(`[DEBUG] goToPreviousResumeItem: prevSortedPosition=${prevSortedPosition}, prevJobNumber=${prevJobNumber}`);
    
    // Check if we're trying to select the same job
    if (prevJobNumber === selectedJobNumber) {
      console.log(`[DEBUG] WARNING: About to select same job index ${prevJobNumber}!`);
    }
    
    selectionManager.selectJobNumber(prevJobNumber, 'ResumeListController.goToPreviousResumeItem');
  }

  goToFirstResumeItem() {
    if (!this.sortedIndices || this.sortedIndices.length === 0) return;
    const firstJobNumber = this.sortedIndices[0];
    console.log(`[DEBUG] goToFirstResumeItem: firstJobNumber=${firstJobNumber}, currentSelection=${selectionManager.getSelectedJobNumber()}`);
    selectionManager.selectJobNumber(firstJobNumber, 'ResumeListController.goToFirstResumeItem');
  }

  goToLastResumeItem() {
    if (!this.sortedIndices || this.sortedIndices.length === 0) return;
    const lastJobNumber = this.sortedIndices[this.sortedIndices.length - 1];
    // console.log(`[DEBUG] goToLastResumeItem: Going to lastJobNumber=${lastJobNumber}, sortedIndices.length=${this.sortedIndices.length}`);
    selectionManager.selectJobNumber(lastJobNumber, 'ResumeListController.goToLastResumeItem');
  }

  applySortRule(sortRule, isInitializing = false) {
    // Safety check for null sortRule
    if (!sortRule || !sortRule.field) {
      console.warn('[DEBUG] SORT: applySortRule called with null or invalid sortRule, using default');
      sortRule = { field: 'startDate', direction: 'desc' };
    }
    
    console.log(`[DEBUG] SORT: applySortRule called with ${sortRule.field} ${sortRule.direction}, isInitializing=${isInitializing}`);
    
    // Store isInitializing flag for applyNewSort to use
    this._isInitializing = isInitializing;
    
    // Capture currently visible job before sorting
    const visibleJobBeforeSort = this.infiniteScroller ? this.infiniteScroller.getCurrentlyVisibleJob() : null;
    console.log(`[DEBUG] SORT: Job visible before sort: ${visibleJobBeforeSort}`);
    
    this.currentSortRule = { ...sortRule };

    // Save the new sort rule to global state, unless during initial page load
    if (!isInitializing) {
        try {
            if (AppState && AppState.resume) {
                AppState.resume.sortRule = this.currentSortRule;
                saveState(AppState);
            } else {
                console.warn('[DEBUG] AppState or AppState.resume is null, cannot save sort rule');
            }
        } catch (error) {
            console.error('[DEBUG] Error saving sort rule to AppState:', error);
            throw error;
        }
    }

    // Dispatch event for other controllers to listen to
    const event = new CustomEvent('sort-rule-changed', {
        detail: { sortRule: this.currentSortRule }
    });
    window.dispatchEvent(event);

    // Store old sortedIndices for comparison
    const oldSortedIndices = [...this.sortedIndices];
    
    this.updateSortedIndices();
    
    // Log sortedIndices changes
    console.log(`[DEBUG] SORT: sortedIndices changed from:`, oldSortedIndices);
    console.log(`[DEBUG] SORT: sortedIndices changed to:`, this.sortedIndices);
    
    // Check if job 0 position changed
    const oldJob0Position = oldSortedIndices.indexOf(0);
    const newJob0Position = this.sortedIndices.indexOf(0);
    if (oldJob0Position !== newJob0Position) {
      console.log(`[DEBUG] SORT: Job 0 moved from position ${oldJob0Position} to position ${newJob0Position}`);
    }
    
    this.applyNewSort();
    
    // Verify job visibility after sort
    if (this.infiniteScroller) {
      setTimeout(() => {
        const visibleJobAfterSort = this.infiniteScroller.getCurrentlyVisibleJob();
        console.log(`[DEBUG] SORT: Job visible after sort: ${visibleJobAfterSort}`);
        
        if (visibleJobBeforeSort && visibleJobAfterSort !== visibleJobBeforeSort) {
          console.log(`[DEBUG] SORT: Visible job changed from ${visibleJobBeforeSort} to ${visibleJobAfterSort} during sort!`);
        }
      }, 100);
    }

    // After sorting, go to the first item, unless we are initializing
    if (!isInitializing) {
        this.goToFirstResumeItem();
    }
  }

  getBizResumeDivByJobNumber(jobNumber) {
    if (!this.bizResumeDivs || !this.bizResumeDivs[jobNumber]) {
      console.log(`[DEBUG] getBizResumeDivByJobNumber: No resume div found for job ${jobNumber}`);
      return null;
    }
    return this.bizResumeDivs[jobNumber];
  }

  /**
   * Debug method to show the complete mapping between jobNumbers and sortedIndices
   */
  debugMapping() {
    console.log(`[DEBUG] ResumeListController.debugMapping:`);
    console.log(`  sortedIndices:`, this.sortedIndices);
    console.log(`  Job number to sorted index mapping:`);
    this.sortedIndices.forEach((jobNumber, sortedIndex) => {
      console.log(`    Job ${jobNumber} -> sortedIndex ${sortedIndex}`);
    });
    
    if (this.infiniteScroller && this.infiniteScroller.originalItems) {
      console.log(`  Infinite scroller originalItems mapping (first 10):`);
      for (let i = 0; i < Math.min(10, this.infiniteScroller.originalItems.length); i++) {
        const item = this.infiniteScroller.originalItems[i];
        if (item) {
          const jobNumber = item.getAttribute('data-job-number');
          console.log(`    originalItems[${i}] -> Job ${jobNumber}`);
        }
      }
    }
  }

  /**
   * Log detailed viewport and resume div coordinates for debugging
   * @param {number} jobNumber - The job number to check
   * @param {string} caller - The caller's name for logging
   */
  logViewportAndResumeDivCoordinates(jobNumber, caller = '') {
    console.log(`[DEBUG] logViewportAndResumeDivCoordinates: jobNumber=${jobNumber}, caller=${caller}`);
    
    if (!this.infiniteScroller) {
      console.log(`[DEBUG] logViewportAndResumeDivCoordinates: infiniteScroller is null!`);
      return;
    }
    
    // Get viewport coordinates
    const scrollport = this.infiniteScroller.scrollport;
    const viewportTop = scrollport.scrollTop;
    const viewportHeight = scrollport.offsetHeight;
    const viewportBottom = viewportTop + viewportHeight;
    
    console.log(`[DEBUG] Viewport coordinates:`);
    console.log(`  - Viewport top: ${viewportTop}px`);
    console.log(`  - Viewport height: ${viewportHeight}px`);
    console.log(`  - Viewport bottom: ${viewportBottom}px`);
    
    // Find the selected resume div
    const selectedResumeDiv = this.getBizResumeDivByJobNumber(jobNumber);
    if (!selectedResumeDiv) {
      console.log(`[DEBUG] logViewportAndResumeDivCoordinates: No resume div found for job ${jobNumber}`);
      return;
    }
    
    // Get the resume div's position in the infinite scroller
    const sortedIndex = this.sortedIndices.indexOf(jobNumber);
    if (sortedIndex === -1) {
      console.log(`[DEBUG] logViewportAndResumeDivCoordinates: Job ${jobNumber} not found in sortedIndices`);
      return;
    }
    
    // Find the item in the infinite scroller
    const targetItemIndex = sortedIndex + this.infiniteScroller.options.cloneCount;
    const targetItem = this.infiniteScroller.allItems[targetItemIndex];
    
    if (targetItem) {
      const itemTop = targetItem.top;
      const itemHeight = targetItem.height;
      const itemBottom = itemTop + itemHeight;
      
      console.log(`[DEBUG] Selected resume div (Job ${jobNumber}) coordinates:`);
      console.log(`  - Item top: ${itemTop}px`);
      console.log(`  - Item height: ${itemHeight}px`);
      console.log(`  - Item bottom: ${itemBottom}px`);
      console.log(`  - Sorted index: ${sortedIndex}`);
      console.log(`  - Target item index: ${targetItemIndex}`);
      
      // Calculate viewport-relative positions
      const relativeTop = itemTop - viewportTop;
      const relativeBottom = itemBottom - viewportTop;
      
      console.log(`[DEBUG] Viewport-relative positions:`);
      console.log(`  - Relative top: ${relativeTop}px (${relativeTop >= 0 ? 'below viewport top' : 'above viewport top'})`);
      console.log(`  - Relative bottom: ${relativeBottom}px (${relativeBottom <= viewportHeight ? 'above viewport bottom' : 'below viewport bottom'})`);
      
      // Check visibility
      const isFullyVisible = itemTop >= viewportTop && itemBottom <= viewportBottom;
      const isPartiallyVisible = itemTop < viewportBottom && itemBottom > viewportTop;
      
      console.log(`[DEBUG] Visibility status:`);
      console.log(`  - Fully visible: ${isFullyVisible}`);
      console.log(`  - Partially visible: ${isPartiallyVisible}`);
      
      if (!isPartiallyVisible) {
        console.log(`[DEBUG] Selected resume div is NOT visible in viewport!`);
        console.log(`[DEBUG] Need to scroll by ${itemTop - viewportTop}px to bring item top to viewport top`);
      }
    } else {
      console.log(`[DEBUG] logViewportAndResumeDivCoordinates: Target item not found at index ${targetItemIndex}`);
    }
  }

  /**
   * Scroll the resume list so the element with this id is in view.
   * For rDiv ids (resume-N), ensures the job is in the list first.
   */
  scrollToElementId(id) {
    if (!id) return;
    const m = String(id).match(/^resume-(\d+)$/);
    if (m) this.ensureJobInListing(parseInt(m[1], 10));
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }

  scrollToJobNumber(jobNumber, caller = '') {
    this.scrollToElementId('resume-' + jobNumber);
  }

  updateSortedIndices() {
    // Safety check - ensure originalJobsData is initialized and is an array
    if (!this.originalJobsData) {
      console.error('[ResumeListController] updateSortedIndices called before originalJobsData is set');
      console.trace('[ResumeListController] Stack trace for updateSortedIndices call:');
      return;
    }
    
    if (!Array.isArray(this.originalJobsData)) {
      console.error('[ResumeListController] originalJobsData is not an array:', typeof this.originalJobsData, this.originalJobsData);
      console.trace('[ResumeListController] Stack trace for non-array originalJobsData:');
      return;
    }
    
    // Create array of indices with their corresponding job data
    const indexedJobs = this.originalJobsData.map((job, index) => ({
      index,
      job
    }));

    console.log(`[DEBUG] updateSortedIndices: Sorting by ${this.currentSortRule.field} ${this.currentSortRule.direction}`);

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
          comparison = a.index - b.index;
          break;
      }
      
      // Apply direction
      return this.currentSortRule.direction === 'desc' ? -comparison : comparison;
    });

    // Extract the sorted indices
    this.sortedIndices = indexedJobs.map(item => item.index);
    console.log(`[DEBUG] updateSortedIndices: Final sortedIndices=`, this.sortedIndices);
  }

  compareStrings(a, b) {
    const stringA = (a || '').toString().toLowerCase();
    const stringB = (b || '').toString().toLowerCase();
    return stringA.localeCompare(stringB);
  }

  compareDates(a, b) {
    // Handle various date formats
    const dateA = this.parseDate(a);
    const dateB = this.parseDate(b);
    
    if (dateA === null && dateB === null) return 0;
    if (dateA === null) return -1;
    if (dateB === null) return 1;
    
    return dateA.getTime() - dateB.getTime();
  }

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

  applyNewSort() {
    console.log(`[DEBUG] applyNewSort: Applying new sort order - sortedIndices=`, this.sortedIndices);
    
    if (!this.infiniteScroller) {
      console.warn('[DEBUG] applyNewSort: infiniteScroller not available');
      return;
    }
    
    // Get the first job number in the newly sorted list
    const firstJobInNewSort = this.sortedIndices.length > 0 ? this.sortedIndices[0] : null;
    
    if (firstJobInNewSort !== null) {
      console.log(`[DEBUG] applyNewSort: Scrolling to first item in new sort: job ${firstJobInNewSort}`);
      
      // Scroll to the first item in the newly sorted list
      this.infiniteScroller.scrollToIndex(0); // Index 0 is the first item in the sorted list
      
      // Only auto-select the first item during normal sorting, not during initialization
      if (typeof selectionManager !== 'undefined' && !this._isInitializing) {
        console.log(`[DEBUG] applyNewSort: Auto-selecting first item in new sort: job ${firstJobInNewSort}`);
        selectionManager.selectJobNumber(firstJobInNewSort, 'ResumeListController.applyNewSort');
      } else if (this._isInitializing) {
        console.log(`[DEBUG] applyNewSort: Skipping auto-selection during initialization`);
      }
    } else {
      console.warn('[DEBUG] applyNewSort: No items in sorted list to scroll to');
    }
    
    // Clear the initialization flag after use
    this._isInitializing = false;
  }

  // Convenience methods for common sorts
  sortByEmployerAsc() {
    this.applySortRule({ field: 'employer', direction: 'asc' });
  }

  sortByEmployerDesc() {
    this.applySortRule({ field: 'employer', direction: 'desc' });
  }

  sortByStartDateAsc() {
    this.applySortRule({ field: 'startDate', direction: 'asc' });
  }

  sortByStartDateDesc() {
    this.applySortRule({ field: 'startDate', direction: 'desc' });
  }

  sortByEndDateAsc() {
    this.applySortRule({ field: 'endDate', direction: 'asc' });
  }

  sortByEndDateDesc() {
    this.applySortRule({ field: 'endDate', direction: 'desc' });
  }

  sortByRoleAsc() {
    this.applySortRule({ field: 'role', direction: 'asc' });
  }

  sortByRoleDesc() {
    this.applySortRule({ field: 'role', direction: 'desc' });
  }

  sortByOriginalOrder() {
    this.applySortRule({ field: 'original', direction: 'asc' });
  }

  // Get current sort information
  getCurrentSortRule() {
    return { ...this.currentSortRule };
  }

  /**
   * Get the sorted indices array for external use
   */
  getSortedIndices() {
    return [...this.sortedIndices];
  }

  // Get original index from current sorted position
  getOriginalIndexFromSorted(sortedIndex) {
    // Validate input
    if (sortedIndex === null || sortedIndex === undefined) {
      console.log(`getOriginalIndexFromSorted: Invalid sorted index: ${sortedIndex}`);
      return -1;
    }
    
    // Convert to number if it's a string
    const numericIndex = parseInt(sortedIndex, 10);
    if (isNaN(numericIndex)) {
      console.log(`getOriginalIndexFromSorted: Sorted index is not a number: ${sortedIndex}`);
      return -1;
    }
    
    // Check if sortedIndices is initialized
    if (!this.sortedIndices || !Array.isArray(this.sortedIndices)) {
      console.log("getOriginalIndexFromSorted: sortedIndices is not properly initialized");
      return -1;
    }
    
    // Check if the index is in range
    if (numericIndex < 0 || numericIndex >= this.sortedIndices.length) {
      console.log(`getOriginalIndexFromSorted: Sorted index ${numericIndex} is out of range (0-${this.sortedIndices.length - 1})`);
      return -1;
    }
    
    // Get the original index
    const originalIndex = this.sortedIndices[numericIndex];
    
    // Log the result
    console.log(`getOriginalIndexFromSorted: Sorted index ${numericIndex} maps to original index ${originalIndex}`);
    
    return originalIndex;
  }

  // Get sorted position from original index
  getSortedIndexFromOriginal(originalIndex) {
    try {
        // Convert to number if it's a string
        const numericIndex = parseInt(originalIndex, 10);
        
        // Check if sortedIndices exists
        if (!this.sortedIndices || !Array.isArray(this.sortedIndices)) {
            console.log(`getSortedIndexFromOriginal: sortedIndices is not an array`);
            return -1;
        }
        
        // Find the index
        const sortedIndex = this.sortedIndices.indexOf(numericIndex);
        
        // Log the result
        if (sortedIndex === -1) {
            console.log(`getSortedIndexFromOriginal: Original index ${numericIndex} not found in sortedIndices`);
        } else {
            console.log(`getSortedIndexFromOriginal: Original index ${numericIndex} maps to sorted index ${sortedIndex}`);
        }
        
        return sortedIndex;
    } catch (error) {
        console.error(`ResumeListController: Error in getSortedIndexFromOriginal:`, error);
        throw error;
    }
  }

  destroy() {
    console.log('[DEBUG] ResumeListController: Destroying and resetting singleton infinite scroller');
    if (this.infiniteScroller) {
      this.infiniteScroller.destroy();
      this.infiniteScroller = null;
    }
    // Reset the singleton instance
    InfiniteScrollingContainer.reset();
  }

  // Static method to reset the singleton instance
  static reset() {
    console.log('[DEBUG] ResumeListController: Resetting singleton instance');
    if (ResumeListController.instance) {
      ResumeListController.instance.destroy();
    }
    ResumeListController.instance = null;
  }

  // Static method to get the current instance
  static getInstance() {
    return ResumeListController.instance;
  }

  addClassItem(jobNumber, className) {
    try {
        const sortedIndex = this.getSortedIndexFromOriginal(jobNumber);
        if (sortedIndex === -1) {
            console.log(`ResumeListController: Original index ${jobNumber} not found in sortedIndices`);
            return;
        }
        
        if (!this.infiniteScroller) {
            console.log(`ResumeListController: infiniteScroller is not initialized`);
            return;
        }
        
        const resumeDiv = this.infiniteScroller.getItemAtIndex(sortedIndex);
        if (resumeDiv) {
            resumeDiv.classList.add(className);
            console.log(`ResumeListController: Added class ${className} to item at index ${sortedIndex}`);
        } else {
            console.log(`ResumeListController: Could not find item at sorted index ${sortedIndex}`);
        }
    } catch (error) {
        console.error(`ResumeListController: Error in addClassItem:`, error);
        throw error;
    }
  }

  removeClassItem(jobNumber, className) {
    try {
        const sortedIndex = this.getSortedIndexFromOriginal(jobNumber);
        if (sortedIndex === -1) {
            console.log(`ResumeListController: Original index ${jobNumber} not found in sortedIndices`);
            return;
        }
        
        if (!this.infiniteScroller) {
            console.log(`ResumeListController: infiniteScroller is not initialized`);
            return;
        }
        
        const resumeDiv = this.infiniteScroller.getItemAtIndex(sortedIndex);
        if (resumeDiv) {
            resumeDiv.classList.remove(className);
            console.log(`ResumeListController: Removed class ${className} from item at index ${sortedIndex}`);
        } else {
            console.log(`ResumeListController: Could not find item at sorted index ${sortedIndex}`);
        }
    } catch (error) {
        console.error(`ResumeListController: Error in removeClassItem:`, error);
        throw error;
    }
  }

  /**
   * Scroll a bizResumeDiv into view using the infiniteScroller
   * @param {HTMLElement} bizResumeDiv - The bizResumeDiv to scroll into view
   * @returns {boolean} - Whether the scroll was successful
   */
  scrollBizResumeDivIntoView(bizResumeDiv) {
    if (!bizResumeDiv) {
      console.log("ResumeListController: scrollBizResumeDivIntoView called with null bizResumeDiv");
      return false;
    }
    
    console.log(`ResumeListController: Scrolling bizResumeDiv ${bizResumeDiv.id} into view`);
    
    // If we have an infinite scroller, use it (most efficient)
    if (this.infiniteScroller) {
      console.log(`ResumeListController: Using infiniteScroller to scroll bizResumeDiv ${bizResumeDiv.id}`);
      return this.infiniteScroller.scrollToBizResumeDiv(bizResumeDiv, true);
    }
    
    // If we don't have an infinite scroller, use centralized smooth scrolling
    console.log(`ResumeListController: No infiniteScroller available, using centralized smooth scrolling for ${bizResumeDiv.id}`);
    try {
      const container = document.resumecontentdivwrapperElement;
      if (container) {
        const headerSelector = '.biz-details-employer, .biz-details-role, .biz-details-dates, .biz-details-z-value';
        selectionManager.smoothScrollElementIntoView(bizResumeDiv, container, headerSelector, `ResumeListController.scrollBizResumeDivIntoView`);
        return true;
      } else {
        // Fallback to basic smooth scroll
        bizResumeDiv.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
        return true;
      }
    } catch (error) {
      console.error(`ResumeListController: Error scrolling bizResumeDiv ${bizResumeDiv.id} into view:`, error);
      throw error;
    }
  }

  /**
   * Debug method to test scrolling to a specific job number
   * @param {number} jobNumber - The job number to scroll to
   */
  debugScrollToJob(jobNumber) {
    console.log(`[DEBUG] debugScrollToJob: Testing scroll to job ${jobNumber}`);
    
    // Check if infinite scroller exists
    if (!this.infiniteScroller) {
      console.log(`[DEBUG] debugScrollToJob: Infinite scroller is null!`);
      return;
    }
    
    // Check if job number exists in sorted indices
    const sortedIndex = this.sortedIndices.indexOf(jobNumber);
    if (sortedIndex === -1) {
      console.log(`[DEBUG] debugScrollToJob: Job ${jobNumber} not found in sortedIndices!`);
      this.debugMapping();
      return;
    }
    
    console.log(`[DEBUG] debugScrollToJob: Job ${jobNumber} found at sorted index ${sortedIndex}`);
    
    // Check if the infinite scroller has the correct item at this index
    if (this.infiniteScroller.originalItems && this.infiniteScroller.originalItems[sortedIndex]) {
      const actualJobNumber = this.infiniteScroller.originalItems[sortedIndex].getAttribute('data-job-number');
      console.log(`[DEBUG] debugScrollToJob: Infinite scroller originalItems[${sortedIndex}] has job ${actualJobNumber}`);
      
      if (parseInt(actualJobNumber) !== jobNumber) {
        console.log(`[DEBUG] debugScrollToJob: MISMATCH! Expected job ${jobNumber}, got ${actualJobNumber}`);
        return;
      }
    } else {
      console.log(`[DEBUG] debugScrollToJob: No item found at infinite scroller originalItems[${sortedIndex}]`);
      return;
    }
    
    // Test the scroll
    console.log(`[DEBUG] debugScrollToJob: All checks passed, testing scroll to sorted index ${sortedIndex}`);
    this.infiniteScroller.scrollToIndex(sortedIndex, false); // No animation for testing
    
    // Check the result after a short delay
    setTimeout(() => {
      const currentScrollTop = this.infiniteScroller.scrollport.scrollTop;
      console.log(`[DEBUG] debugScrollToJob: Scroll result - scrollTop: ${currentScrollTop}`);
      
      // Check if the target item is visible
      const targetItem = this.infiniteScroller.allItems[sortedIndex + this.infiniteScroller.options.cloneCount];
      if (targetItem) {
        const itemTop = targetItem.top;
        const itemBottom = itemTop + targetItem.height;
        const containerHeight = this.infiniteScroller.scrollport.offsetHeight;
        const visibleTop = currentScrollTop;
        const visibleBottom = currentScrollTop + containerHeight;
        
        console.log(`[DEBUG] debugScrollToJob: Visibility check:`);
        console.log(`  Item top: ${itemTop}, Item bottom: ${itemBottom}`);
        console.log(`  Visible top: ${visibleTop}, Visible bottom: ${visibleBottom}`);
        console.log(`  Item visible: ${itemTop >= visibleTop && itemBottom <= visibleBottom}`);
      }
    }, 100);
  }

  /**
   * Configure the vertical spacing between rDivs
   * @param {number} spacing - Vertical gap in pixels between adjacent rDivs
   */
  configureRDivSpacing(spacing) {
    if (this.infiniteScroller) {
      this.infiniteScroller.configureItemSpacing(spacing);
      console.log(`[DEBUG] ResumeListController: rDiv spacing configured to ${spacing}px`);
    } else {
      console.log(`[DEBUG] ResumeListController: Cannot configure spacing - infinite scroller not available`);
    }
  }

  /**
   * Get current rDiv spacing configuration
   * @returns {number} Current spacing in pixels
   */
  getRDivSpacing() {
    if (this.infiniteScroller) {
      return this.infiniteScroller.getItemSpacing();
    }
    return 5; // Default spacing
  }

  // region Resume Div Creation and Management (from ResumeItemsController)
  
  /**
   * Create all resume divs from card divs
   */
  async createAllBizResumeDivs(bizCardDivs) {
    console.log('[ResumeListController] createAllBizResumeDivs called with:', bizCardDivs?.length || 0, 'cards');
    
    if (!bizCardDivs || bizCardDivs.length === 0) {
      console.warn("ResumeListController: Cannot create resume divs, no card divs provided.");
      return [];
    }
    
    const bizResumeDivs = [];
    for (let i = 0; i < bizCardDivs.length; i++) {
      const cardDiv = bizCardDivs[i];
      
      if (!cardDiv) {
        console.warn(`[ResumeListController] Card at index ${i} is null/undefined, skipping`);
        continue;
      }
      
      try {
        const resumeDiv = await this.createBizResumeDiv(cardDiv);
        bizResumeDivs.push(resumeDiv);
      } catch (error) {
        console.error(`[ResumeListController] Failed to create resume div for card ${i}:`, error);
        throw error;
      }
    }
    
    // console.log(`[ResumeListController] Successfully created ${bizResumeDivs.length} resume divs`);
    return bizResumeDivs;
  }
  
  /**
   * Create a single resume div from a card div
   */
  async createBizResumeDiv(bizCardDiv) {
    if (!bizCardDiv) {
      throw new Error('createBizResumeDiv: bizCardDiv not found');
    }
    
    const jobNumberStr = bizCardDiv.getAttribute('data-job-number');
    if (!jobNumberStr || isNaN(parseInt(jobNumberStr, 10))) {
      throw new Error('createBizResumeDiv: jobNumber is not a numeric string');
    }
    const jobNumber = parseInt(jobNumberStr, 10);
    
    try {
      const bizResumeDiv = document.createElement('div');
      bizResumeDiv.id = `resume-${jobNumber}`;
      bizResumeDiv.className = 'biz-resume-div';
      bizResumeDiv.setAttribute('data-job-number', jobNumber);
      const cDivColorIndex = bizCardDiv.getAttribute('data-color-index');
      bizResumeDiv.setAttribute('data-color-index', cDivColorIndex);
      console.log(`[DEBUG] ResumeListController - Color index sync - Job ${jobNumber}: cDiv=${cDivColorIndex}, rDiv=${cDivColorIndex}`);
      bizResumeDiv.style.pointerEvents = 'auto';
      
      // const bizResumeDetailsDiv = BizDetailsDivModule.createBizResumeDetailsDiv(bizResumeDiv, bizCardDiv);
      // if (bizResumeDetailsDiv instanceof Node) {
      //   bizResumeDiv.appendChild(bizResumeDetailsDiv);
      
      // Placeholder: Create basic resume content div
      const bizResumeDetailsDiv = document.createElement('div');
      bizResumeDetailsDiv.className = 'biz-resume-details-div';
      bizResumeDetailsDiv.textContent = `Resume item ${jobNumber} - Details to be implemented`;
      if (bizResumeDetailsDiv instanceof Node) {
        bizResumeDiv.appendChild(bizResumeDetailsDiv);
      } else {
        console.error(`[ResumeListController] bizResumeDetailsDiv for job ${jobNumber} is not a Node:`, bizResumeDetailsDiv);
      }
      
      // Apply the current color palette via Vue composable
      await applyPaletteToElement(bizResumeDiv);
      
      // Set up mouse listeners for the resume div
      this._setupMouseListeners(bizResumeDiv);
      
      // if (jobNumber === 21) console.log(`[ResumeListController] Successfully created resume div for job ${jobNumber}`);
      return bizResumeDiv;
    } catch (error) {
      console.error('[ResumeListController] Error creating resume div:', error);
      throw error;
    }
  }

  // Add debug function for manual testing
  testResumeClick(jobNumber) {
    console.log(`[ResumeListController] 🧪 Testing manual click for job ${jobNumber}`)
    const resumeDiv = document.querySelector(`[data-job-number="${jobNumber}"].biz-resume-div`)
    if (resumeDiv) {
      console.log(`[ResumeListController] Found resume div for job ${jobNumber}, simulating click...`)
      this.handleBizResumeDivClickEvent(resumeDiv)
    } else {
      console.error(`[ResumeListController] ❌ Resume div not found for job ${jobNumber}`)
      const allResumeDivs = document.querySelectorAll('.biz-resume-div')
      console.log(`[ResumeListController] Available resume divs: ${allResumeDivs.length}`)
      allResumeDivs.forEach((div, i) => {
        if (i < 5) console.log(`  - Job ${div.getAttribute('data-job-number')}`)
      })
    }
  }
  
  /**
   * Set up mouse listeners for resume div
   */
  _setupMouseListeners(bizResumeDiv) {
    if (!bizResumeDiv) {
      console.error('[ResumeListController] ❌ Cannot setup mouse listeners - no bizResumeDiv')
      return;
    }
    
    const jobNumber = bizResumeDiv.getAttribute('data-job-number')
    console.log(`[ResumeListController] 🖱️ Setting up mouse listeners for job ${jobNumber}`)
    
    bizResumeDiv.addEventListener('click', () => this.handleBizResumeDivClickEvent(bizResumeDiv));
    bizResumeDiv.addEventListener('mouseenter', () => this.handleMouseEnterEvent(bizResumeDiv));
    bizResumeDiv.addEventListener('mouseleave', () => this.handleMouseLeaveEvent(bizResumeDiv));
    
    console.log(`[ResumeListController] ✅ Mouse listeners set up for job ${jobNumber}`)
  }
  
  /**
   * Handle resume div click events
   */
  handleBizResumeDivClickEvent(bizResumeDiv) {
    console.log(`[ResumeListController] 🖱️ Resume div clicked!`, bizResumeDiv)
    if (!bizResumeDiv) {
      console.error('[ResumeListController] ❌ No bizResumeDiv provided to click handler')
      return;
    }
    
    const jobNumber = parseInt(bizResumeDiv.getAttribute('data-job-number'), 10);
    const isSelected = selectionManager.getSelectedJobNumber() === jobNumber;
    console.log(`[ResumeListController] Job ${jobNumber} clicked, currently selected: ${isSelected}`)
    
    if (isSelected) {
      console.log(`[ResumeListController] Clearing selection for job ${jobNumber}`)
      selectionManager.clearSelection('ResumeListController.handleBizResumeDivClickEvent');
    } else {
      console.log(`[ResumeListController] Selecting job ${jobNumber}`)
      selectionManager.selectJobNumber(jobNumber, 'ResumeListController.handleBizResumeDivClickEvent');
    }
  }
  
  /**
   * Handle mouse enter events
   */
  handleMouseEnterEvent(bizResumeDiv) {
    if (!bizResumeDiv) return;
    
    const jobNumber = parseInt(bizResumeDiv.getAttribute('data-job-number'), 10);
    selectionManager.hoverJobNumber(jobNumber, 'ResumeListController.handleMouseEnterEvent');
  }
  
  /**
   * Handle mouse leave events
   */
  handleMouseLeaveEvent(bizResumeDiv) {
    if (!bizResumeDiv) return;
    
    selectionManager.clearHover('ResumeListController.handleMouseLeaveEvent');
  }
  
  /**
   * Set up color palette listener
   */
  _setupColorPaletteListener() {
    window.addEventListener('color-palette-changed', this.handleColorPaletteChanged.bind(this));
  }

  /**
   * Set up selection event listeners for bidirectional scrolling
   */
  _setupSelectionListeners() {
    // Listen to both legacy and new selection events
    selectionManager.addEventListener('selectionChanged', this.handleSelectionChanged.bind(this));
    selectionManager.addEventListener('job-selected', this.handleJobSelected.bind(this));
    selectionManager.addEventListener('selectionCleared', this.handleSelectionCleared.bind(this));
    selectionManager.addEventListener('selection-cleared', this.handleJobSelectionCleared.bind(this));
  }
  
  /**
   * Handle color palette changes
   */
  async handleColorPaletteChanged(event) {
    const { filename, paletteName, previousFilename } = event.detail;
    
    console.log(`[DEBUG] ResumeListController.handleColorPaletteChanged: Palette changed from ${previousFilename} to ${filename} (${paletteName})`);
    
    // Apply new palette to all resume divs
    if (this.bizResumeDivs) {
      for (const div of this.bizResumeDivs) {
        if (div) {
          // Apply palette to the div itself and all elements with data-color-index within it
          await applyPaletteToElement(div);
          const colorElements = div.querySelectorAll('[data-color-index]');
          for (const element of colorElements) {
            await applyPaletteToElement(element);
          }
        }
      }
    }
    
    console.log(`[DEBUG] ResumeListController.handleColorPaletteChanged: Applied new palette to ${this.bizResumeDivs?.length || 0} resume divs`);
  }
  
  // endregion
  
  /**
   * Debug method to check sort rule consistency between controllers
   */
  debugSortRuleConsistency() {
    console.log(`[DEBUG] ResumeListController.debugSortRuleConsistency:`);
    console.log(`  Current sort rule:`, this.currentSortRule);
    console.log(`  Sorted indices:`, this.sortedIndices);
    
    // Check if CardsController has the same sort rule
    if (window.cardsController) {
      console.log(`  CardsController sort rule:`, window.cardsController.currentSortRule);
      console.log(`  CardsController sorted indices:`, window.cardsController.sortedIndices);
      
      // Compare sorted indices
      const resumeSorted = this.sortedIndices;
      const cardsSorted = window.cardsController.sortedIndices;
      
      if (resumeSorted && cardsSorted) {
        const isSame = resumeSorted.length === cardsSorted.length && 
                      resumeSorted.every((val, index) => val === cardsSorted[index]);
        
        console.log(`  Sorted indices match: ${isSame}`);
        
        if (!isSame) {
          console.log(`  MISMATCH DETECTED!`);
          console.log(`  Resume sorted indices:`, resumeSorted);
          console.log(`  Cards sorted indices:`, cardsSorted);
          
          // Show the first few mismatches
          for (let i = 0; i < Math.min(10, Math.max(resumeSorted.length, cardsSorted.length)); i++) {
            const resumeJob = resumeSorted[i];
            const cardsJob = cardsSorted[i];
            if (resumeJob !== cardsJob) {
              console.log(`    Index ${i}: Resume=${resumeJob}, Cards=${cardsJob}`);
            }
          }
        }
      }
    } else {
      console.log(`  CardsController not available`);
    }
  }
} // end class ResumeListController

export const resumeListController = new ResumeListController();
