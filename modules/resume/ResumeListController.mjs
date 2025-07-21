// modules/resume/ResumeListController.mjs

import { BaseComponent } from '../core/abstracts/BaseComponent.mjs';
import { InfiniteScrollingContainer } from './infiniteScrollingContainer.mjs';
import * as domUtils from '../utils/domUtils.mjs';
// No longer directly interacting with these for selection
// import { bizCardDivManager } from '../scene/bizCardDivManager.mjs';
// import * as scenePlane from '../scene/scenePlane.mjs';
import { selectionManager } from '../core/selectionManager.mjs';
import { cardsController } from '../scene/CardsController.mjs';
import { AppState, saveState } from '../core/stateManager.mjs';
import { initializationManager } from '../core/initializationManager.mjs';
import { jobs } from '../../static_content/jobs/jobs.mjs';
import { applyPaletteToElement } from '../composables/useColorPalette.mjs';
import { badgeManager } from '../core/badgeManager.mjs';
import * as BizDetailsDivModule from '../scene/bizDetailsDivModule.mjs';
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
      window.CONSOLE_LOG_IGNORE('[DEBUG] ResumeListController: Returning existing singleton instance');
      return ResumeListController.instance;
    }

    // Create new instance
    window.CONSOLE_LOG_IGNORE('[DEBUG] ResumeListController: Creating new singleton instance');
    
    this.resumeContentDiv = null; // Defer initialization
    this.infiniteScroller = null;
    this.bizResumeDivs = null;
    this.originalJobsData = null;
    this.currentSortRule = null;
    this.sortedIndices = []; // Maps sorted position to original index
    this._isInitialized = false;
    
    // Set up event listeners for badge mode and color palette changes
    this._setupBadgeModeListener();
    this._setupColorPaletteListener();
    
    // Store the singleton instance
    ResumeListController.instance = this;
    
    // Add to window for global access and debugging
    window.resumeListController = this;
    
    window.CONSOLE_LOG_IGNORE('[DEBUG] ResumeListController: Singleton instance created and stored');
  }

  getComponentName() {
    return 'ResumeListController';
  }

  getDependencies() {
    return ['CardsController'];
  }

  destroy() {
    this.resumeContentDiv = null;
    this.infiniteScroller = null;
    this.bizResumeDivs = null;
    this.originalJobsData = null;
    this.currentSortRule = null;
    this.sortedIndices = [];
    this._isInitialized = false;
  }

  /**
   * Register this controller with the initialization manager
   * This allows other components to wait for ResumeListController to be ready
   */
  registerForInitialization() {
    initializationManager.register(
      'ResumeListController',
      async () => {
        // Wait for CardsController to be ready
        await initializationManager.waitForComponents(['CardsController']);
        
        // Create resume divs directly (no longer using ResumeItemsController)
        const bizResumeDivs = await this.createAllBizResumeDivs(cardsController.bizCardDivs);
        
        // Add resume divs to the DOM
        const resumeContentDivElement = document.getElementById('resume-content-div');
        if (resumeContentDivElement) {
          bizResumeDivs.forEach(div => resumeContentDivElement.appendChild(div));
        } else {
          window.CONSOLE_LOG_IGNORE("ResumeListController: #resume-content-div not found!");
        }
        
        // Initialize with the resume divs
        this.initialize(jobs, bizResumeDivs);
      },
      ['CardsController'], // Only depends on CardsController now
      { priority: 'medium' }
    );
  }

  initialize(originalJobsData, bizResumeDivs) {
    // --- Dependency Checks ---
    if (!cardsController.isInitialized) {
        throw new Error("ResumeListController requires cardsController to be initialized.");
    }
    // --- End Dependency Checks ---

    this.resumeContentDiv = document.getElementById('resume-content-div');
    if ( !this.resumeContentDiv ) throw new Error('ResumeListController: initialize: resume-content-div not found in DOM');
    this.resumeContentWrapper = document.getElementById('resume-content-div-wrapper');
    if ( !this.resumeContentWrapper ) throw new Error('ResumeListController: initialize: resume-content-div-wrapper not found in DOM');

    this.originalJobsData = originalJobsData;
    this.bizResumeDivs = bizResumeDivs;
    
    // Listen for selection changes to save state and manage visual state
    selectionManager.addEventListener('selectionChanged', this.handleSelectionChanged.bind(this));
    selectionManager.addEventListener('selectionCleared', this.handleSelectionCleared.bind(this));

    // Initialize with saved state FIRST, before setting up infinite scrolling
    this.applySortRule(AppState.resume.sortRule, true); // isInitializing = true
    
    this.setupInfiniteScrolling();
    
    // Select the saved job index after a delay to ensure infinite scroller is ready
    setTimeout(() => {
      if (this.sortedIndices.length > 0) {
        let savedJobNumber = AppState.selectedJobNumber;
        window.CONSOLE_LOG_IGNORE('ResumeListController initialization:', { 
          topLevelSelectedJobNumber: AppState.selectedJobNumber,
          resumeSectionSelectedJobNumber: AppState.resume?.selectedJobNumber,
          savedJobNumber, 
          sortedIndices: this.sortedIndices, 
          infiniteScrollerReady: !!this.infiniteScroller 
        });
        
        // If no saved job index, don't auto-select - let user choose
        if (savedJobNumber === undefined || savedJobNumber === null) {
          console.log('ResumeListController: No saved job selected - waiting for user selection');
          return; // Don't auto-select anything
        }
        // Ensure the saved index is valid before selecting
        if (this.sortedIndices.includes(savedJobNumber)) {
          window.CONSOLE_LOG_IGNORE('ResumeListController: Selecting saved job index:', savedJobNumber);
          // Add additional delay to ensure infinite scroller is fully positioned
          setTimeout(() => {
            console.log('ResumeListController: About to select job number:', savedJobNumber);
            selectionManager.selectJobNumber(savedJobNumber, 'ResumeListController.initialize');
            console.log('ResumeListController: Called selectionManager.selectJobNumber');
          }, 200);
        } else {
          // If saved index is invalid (e.g., data changed), select the first item
          window.CONSOLE_LOG_IGNORE('ResumeListController: Saved job index invalid, selecting first item:', this.sortedIndices[0]);
          setTimeout(() => {
            selectionManager.selectJobNumber(this.sortedIndices[0], 'ResumeListController.initialize');
          }, 200);
        }
      }
    }, 1000); // Increased delay to ensure infinite scroller is fully ready

    this._isInitialized = true;
    window.CONSOLE_LOG_IGNORE("ResumeListController initialized successfully");
    
    // Notify CardsController that ResumeListController is ready
    if (window.cardsController) {
        window.CONSOLE_LOG_IGNORE('[DEBUG] ResumeListController: Notifying CardsController that ResumeListController is ready');
        // Trigger a sort rule change event to ensure CardsController gets the current sort rule
        const event = new CustomEvent('sort-rule-changed', {
            detail: { sortRule: this.currentSortRule }
        });
        window.dispatchEvent(event);
    }
  }
  
  reinitialize(bizResumeDivs) {
    window.CONSOLE_LOG_IGNORE('[DEBUG] ResumeListController: Reinitializing with singleton pattern');
    
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

  isInitialized() {
    return this._isInitialized;
  }

  // region Event Handlers from SelectionManager
      handleSelectionChanged(event) {
        const { selectedJobNumber, caller } = event.detail;

        // The SelectionManager already handles saving to AppState.selectedJobNumber
        // No need to save resume-specific selection state here

        // console.log(`[DEBUG] ResumeListController.handleSelectionChanged: selectedJobNumber=${selectedJobNumber}, caller=${caller}`);

        // Visual selection is now handled by SelectionManager - no need to call deprecated method
        
        // Handle scrolling - this is the single scroll operation
        if (caller.includes('initialize')) {
            // During initialization, allow delayed scroll for proper setup
            setTimeout(() => {
                this.scrollToJobNumber(selectedJobNumber, `ResumeListController.handleSelectionChanged from ${caller}`);
            }, 500);
        } else {
            // For direct selections (like clicking a cDiv), scroll immediately
            this.scrollToJobNumber(selectedJobNumber, `ResumeListController.handleSelectionChanged from ${caller}`);
        }
    }

    handleSelectionCleared(event) {
        const { caller } = event.detail;
        // console.log(`[DEBUG] ResumeListController.handleSelectionCleared: caller=${caller}`);
        
        // Visual selection clearing is now handled by SelectionManager
        // Note: SelectionManager.clearSelection() is typically called by the component that initiated the clear
        // ResumeListController just needs to respond to the clear event, not initiate it
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
  // endregion

  setupInfiniteScrolling() {
    window.CONSOLE_LOG_IGNORE(`[DEBUG] ResumeListController.setupInfiniteScrolling: Setting up infinite scroller (singleton)`);
    
    if (!this.bizResumeDivs || this.bizResumeDivs.length === 0) {
      window.CONSOLE_LOG_IGNORE(`[DEBUG] setupInfiniteScrolling: No bizResumeDivs available`);
      return;
    }

    // Create the infinite scroller - the constructor handles the singleton pattern
    window.CONSOLE_LOG_IGNORE(`[DEBUG] ResumeListController.setupInfiniteScrolling: Creating infinite scroller instance`);
    this.infiniteScroller = new InfiniteScrollingContainer(
      this.resumeContentWrapper, // scrollport element
      this.resumeContentDiv,     // content element
      {
        onItemChange: this.handleResumeItemChange.bind(this)
      }
    );
    
    if (!this.infiniteScroller) {
      window.CONSOLE_LOG_IGNORE(`[DEBUG] setupInfiniteScrolling: Failed to create infinite scroller instance`);
      return;
    }

    window.CONSOLE_LOG_IGNORE(`[DEBUG] ResumeListController.setupInfiniteScrolling: Infinite scroller ready, setting items`);
    
    // Apply sort rule first to ensure sortedIndices is correct
    this.applySortRule(this.currentSortRule, true);
    
    // Debug the mapping before creating sortedDivs
    window.CONSOLE_LOG_IGNORE(`[DEBUG] setupInfiniteScrolling: sortedIndices=`, this.sortedIndices);
    window.CONSOLE_LOG_IGNORE(`[DEBUG] setupInfiniteScrolling: sortedDivs job numbers:`);
    // this.sortedIndices.forEach((jobNumber, sortedIndex) => {
    //   window.CONSOLE_LOG_IGNORE(`  Index ${sortedIndex} -> Job ${jobNumber}`);
    // });
    
    // Create sortedDivs array in the correct order
    const sortedDivs = this.sortedIndices.map(originalIndex => this.bizResumeDivs[originalIndex]);
    
    // Verify the mapping is correct
    window.CONSOLE_LOG_IGNORE(`[DEBUG] setupInfiniteScrolling: Verifying sortedDivs mapping:`);
    // sortedDivs.forEach((div, sortedIndex) => {
    //   if (div) {
    //     const jobNumber = div.getAttribute('data-job-number');
    //     const expectedJobNumber = this.sortedIndices[sortedIndex];
    //     if (parseInt(jobNumber) !== expectedJobNumber) {
    //       window.CONSOLE_LOG_IGNORE(`[DEBUG] setupInfiniteScrolling: MAPPING ERROR! sortedDivs[${sortedIndex}] has job ${jobNumber}, expected ${expectedJobNumber}`);
    //     } else {
    //       window.CONSOLE_LOG_IGNORE(`  sortedDivs[${sortedIndex}] -> Job ${jobNumber} ✓`);
    //     }
    //   }
    // });
    
    // Get the currently selected job number
    const selectedJobNumber = selectionManager.getSelectedJobNumber();
    let startingIndex = 0;
    
    if (selectedJobNumber !== null) {
      const selectedSortedIndex = this.sortedIndices.indexOf(selectedJobNumber);
      if (selectedSortedIndex !== -1) {
        startingIndex = selectedSortedIndex;
        window.CONSOLE_LOG_IGNORE(`[DEBUG] setupInfiniteScrolling: selectedJobNumber= ${selectedJobNumber} startingIndex= ${startingIndex}`);
      } else {
        window.CONSOLE_LOG_IGNORE(`[DEBUG] setupInfiniteScrolling: selectedJobNumber ${selectedJobNumber} not found in sortedIndices`);
      }
    } else {
      window.CONSOLE_LOG_IGNORE(`[DEBUG] setupInfiniteScrolling: selectedJobNumber= null startingIndex= ${startingIndex}`);
    }
    
    // Debug: Show expected job numbers at each position
    window.CONSOLE_LOG_IGNORE(`[DEBUG] setupInfiniteScrolling: Expected job numbers at each position:`);
    // this.sortedIndices.forEach((jobNumber, sortedIndex) => {
    //   window.CONSOLE_LOG_IGNORE(`  sortedIndices[${sortedIndex}] = ${jobNumber}`);
    // });
    
    // Debug: Check actual content vs job numbers
    window.CONSOLE_LOG_IGNORE(`[DEBUG] setupInfiniteScrolling: Checking actual content vs job numbers:`);
    for (let i = 0; i < Math.min(5, sortedDivs.length); i++) {
      const div = sortedDivs[i];
      if (div) {
        const jobNumber = div.getAttribute('data-job-number');
        const roleElement = div.querySelector('.biz-details-role');
        const employerElement = div.querySelector('.biz-details-employer');
        const role = roleElement ? roleElement.textContent.trim() : 'N/A';
        const employer = employerElement ? employerElement.textContent.trim() : 'N/A';
        window.CONSOLE_LOG_IGNORE(`  Index ${i}: Job ${jobNumber} -> "${role}" at "${employer}"`);
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
        window.CONSOLE_LOG_IGNORE(`[DEBUG] setupInfiniteScrolling: Checking job 10 content:`);
        window.CONSOLE_LOG_IGNORE(`  Job 10 (at sorted index ${job10SortedIndex}): Job 10 -> "${role}" at "${employer}"`);
      }
    }
    
    // Set the items in the infinite scroller
    this.infiniteScroller.setItems(sortedDivs, startingIndex);
    
    // Explicitly scroll to the starting index to ensure proper positioning
    this.infiniteScroller.scrollToIndex(startingIndex, false); // false = no animation
    
    // Force a recalculation of heights after initialization to ensure all content is properly contained
    setTimeout(() => {
      window.CONSOLE_LOG_IGNORE('[DEBUG] setupInfiniteScrolling: Forcing initial height recalculation');
      this.infiniteScroller.recalculateHeights();
    }, 100);
    
    // After setting items, verify the infinite scroller has the correct mapping
    if (this.infiniteScroller.originalItems) {
      window.CONSOLE_LOG_IGNORE(`[DEBUG] setupInfiniteScrolling: Verifying infinite scroller mapping:`);
      for (let i = 0; i < Math.min(10, this.infiniteScroller.originalItems.length); i++) {
        const item = this.infiniteScroller.originalItems[i];
        if (item) {
          const jobNumber = item.getAttribute('data-job-number');
          const expectedJobNumber = this.sortedIndices[i];
          if (parseInt(jobNumber) !== expectedJobNumber) {
            window.CONSOLE_LOG_IGNORE(`[DEBUG] setupInfiniteScrolling: INFINITE SCROLLER MISMATCH! originalItems[${i}] has job ${jobNumber}, expected ${expectedJobNumber}`);
          } else {
            window.CONSOLE_LOG_IGNORE(`  Infinite scroller originalItems[${i}] -> Job ${jobNumber} ✓`);
          }
        }
      }
    }
    
    // Recalculate heights after palette application to ensure proper positioning
    this.infiniteScroller.recalculateHeightsAfterPalette();
    
    // Add global debug function for testing
    window.debugInfiniteScroller = (jobNumber) => {
      if (window.resumeListController) {
        window.resumeListController.debugScrollToJob(jobNumber);
      } else {
        window.CONSOLE_LOG_IGNORE('ResumeListController not available on window object');
      }
    };
    
    // Add global test function for easy testing
    window.testScrollToJob = (jobNumber) => {
      if (window.resumeListController) {
        window.CONSOLE_LOG_IGNORE(`[TEST] Testing scroll to job ${jobNumber}`);
        window.resumeListController.scrollToJobNumber(jobNumber, 'testScrollToJob');
      } else {
        window.CONSOLE_LOG_IGNORE('ResumeListController not available on window object');
      }
    };
    
    // Add global debug function for sort rule consistency
    window.debugSortConsistency = () => {
      if (window.resumeListController) {
        window.resumeListController.debugSortRuleConsistency();
      } else {
        window.CONSOLE_LOG_IGNORE('ResumeListController not available on window object');
      }
    };
    
    // Add global function to force synchronization between controllers
    window.forceSyncControllers = () => {
      window.CONSOLE_LOG_IGNORE('[DEBUG] forceSyncControllers: Forcing synchronization between controllers');
      
      if (window.resumeListController && window.cardsController) {
        const resumeSortRule = window.resumeListController.getCurrentSortRule();
        window.CONSOLE_LOG_IGNORE('[DEBUG] forceSyncControllers: ResumeListController sort rule:', resumeSortRule);
        
        // Force CardsController to apply the same sort rule
        window.cardsController.applySortRule(resumeSortRule);
        
        // Check if they're now in sync
        setTimeout(() => {
          window.resumeListController.debugSortRuleConsistency();
        }, 100);
      } else {
        window.CONSOLE_LOG_IGNORE('One or both controllers not available');
      }
    };

    // Add global function to test scrolling to specific job numbers
    window.testScrollToJob = (jobNumber) => {
      window.CONSOLE_LOG_IGNORE(`[TEST] Testing scroll to job ${jobNumber}`);
      if (window.resumeListController) {
        window.resumeListController.scrollToJobNumber(jobNumber, 'testScrollToJob');
      } else {
        window.CONSOLE_LOG_IGNORE('ResumeListController not available on window object');
      }
    };

    // Add global function to force scroll to job 10 specifically
    window.forceScrollToJob10 = () => {
      window.CONSOLE_LOG_IGNORE('[TEST] Force scrolling to job 10');
      if (window.resumeListController && window.resumeListController.infiniteScroller) {
        const scroller = window.resumeListController.infiniteScroller;
        
        // Find job 10 in the original items
        const job10Index = scroller.originalItems.findIndex(item => {
          const jobNumber = item.getAttribute('data-job-number');
          return parseInt(jobNumber) === 10;
        });
        
        window.CONSOLE_LOG_IGNORE(`[TEST] Job 10 found at original index: ${job10Index}`);
        
        if (job10Index !== -1) {
          // Force scroll to this index
          scroller.scrollToIndex(job10Index, false);
          
          // Also try the job number method
          setTimeout(() => {
            window.resumeListController.scrollToJobNumber(10, 'forceScrollToJob10');
          }, 100);
        } else {
          window.CONSOLE_LOG_IGNORE('[TEST] Job 10 not found in original items!');
        }
      } else {
        window.CONSOLE_LOG_IGNORE('ResumeListController or infinite scroller not available');
      }
    };

    // Add global function to log viewport and resume div coordinates
    window.logCoordinates = (jobNumber = 10) => {
      window.CONSOLE_LOG_IGNORE(`[TEST] Logging coordinates for job ${jobNumber}`);
      if (window.resumeListController) {
        window.resumeListController.logViewportAndResumeDivCoordinates(jobNumber, 'logCoordinates');
      } else {
        window.CONSOLE_LOG_IGNORE('ResumeListController not available on window object');
      }
    };

    // Add global function to check what jobs are currently visible in the viewport
    window.checkVisibleJobs = () => {
      window.CONSOLE_LOG_IGNORE(`[TEST] Checking what jobs are currently visible in the viewport`);
      if (window.resumeListController && window.resumeListController.infiniteScroller) {
        const scroller = window.resumeListController.infiniteScroller;
        const viewportTop = scroller.scrollport.scrollTop;
        const viewportHeight = scroller.scrollport.offsetHeight;
        const viewportBottom = viewportTop + viewportHeight;
        
        window.CONSOLE_LOG_IGNORE(`[TEST] Viewport: top=${viewportTop}px, bottom=${viewportBottom}px, height=${viewportHeight}px`);
        
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
              window.CONSOLE_LOG_IGNORE(`[TEST] VISIBLE: Item ${index} (${type}) - Job ${jobNumber} - top: ${itemTop}px, bottom: ${itemBottom}px`);
              
              // Get job details
              const roleElement = item.element.querySelector('.biz-details-role');
              const employerElement = item.element.querySelector('.biz-details-employer');
              const role = roleElement ? roleElement.textContent.trim() : 'N/A';
              const employer = employerElement ? employerElement.textContent.trim() : 'N/A';
              window.CONSOLE_LOG_IGNORE(`[TEST]   Details: "${role}" at "${employer}"`);
            }
          }
        });
      } else {
        window.CONSOLE_LOG_IGNORE('ResumeListController or infinite scroller not available');
      }
    };

    // Add global function to compare Job 5 vs Job 10 positioning
    window.compareJob5vs10 = () => {
      window.CONSOLE_LOG_IGNORE(`[TEST] Comparing Job 5 vs Job 10 positioning`);
      if (window.resumeListController && window.resumeListController.infiniteScroller) {
        const scroller = window.resumeListController.infiniteScroller;
        const viewportTop = scroller.scrollport.scrollTop;
        const viewportHeight = scroller.scrollport.offsetHeight;
        const viewportBottom = viewportTop + viewportHeight;
        
        window.CONSOLE_LOG_IGNORE(`[TEST] Viewport: top=${viewportTop}px, bottom=${viewportBottom}px`);
        
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
          window.CONSOLE_LOG_IGNORE(`[TEST] Job 5: top=${itemTop}px, bottom=${itemBottom}px, visible=${isVisible}`);
          
          const roleElement = item.element.querySelector('.biz-details-role');
          const employerElement = item.element.querySelector('.biz-details-employer');
          const role = roleElement ? roleElement.textContent.trim() : 'N/A';
          const employer = employerElement ? employerElement.textContent.trim() : 'N/A';
          window.CONSOLE_LOG_IGNORE(`[TEST] Job 5 details: "${role}" at "${employer}"`);
        }
        
        if (job10Item) {
          const item = job10Item.item;
          const itemTop = item.top;
          const itemBottom = itemTop + item.height;
          const isVisible = itemTop < viewportBottom && itemBottom > viewportTop;
          window.CONSOLE_LOG_IGNORE(`[TEST] Job 10: top=${itemTop}px, bottom=${itemBottom}px, visible=${isVisible}`);
          
          const roleElement = item.element.querySelector('.biz-details-role');
          const employerElement = item.element.querySelector('.biz-details-employer');
          const role = roleElement ? roleElement.textContent.trim() : 'N/A';
          const employer = employerElement ? employerElement.textContent.trim() : 'N/A';
          window.CONSOLE_LOG_IGNORE(`[TEST] Job 10 details: "${role}" at "${employer}"`);
        }
        
        if (job5Item && job10Item) {
          const job5Top = job5Item.item.top;
          const job10Top = job10Item.item.top;
          window.CONSOLE_LOG_IGNORE(`[TEST] Job 5 is ${job5Top < job10Top ? 'ABOVE' : 'BELOW'} Job 10 by ${Math.abs(job5Top - job10Top)}px`);
        }
      } else {
        window.CONSOLE_LOG_IGNORE('ResumeListController or infinite scroller not available');
      }
    };

    // Add global function to debug infinite scroller state
    window.debugInfiniteScroller = () => {
      if (window.resumeListController && window.resumeListController.infiniteScroller) {
        const scroller = window.resumeListController.infiniteScroller;
        window.CONSOLE_LOG_IGNORE('[DEBUG] Infinite Scroller State:');
        window.CONSOLE_LOG_IGNORE('  - Current index:', scroller.currentIndex);
        window.CONSOLE_LOG_IGNORE('  - Original items count:', scroller.originalItems.length);
        window.CONSOLE_LOG_IGNORE('  - All items count:', scroller.allItems.length);
        window.CONSOLE_LOG_IGNORE('  - Scroll position:', scroller.scrollport.scrollTop);
        window.CONSOLE_LOG_IGNORE('  - Container height:', scroller.scrollport.offsetHeight);
        window.CONSOLE_LOG_IGNORE('  - Content height:', scroller.scrollport.scrollHeight);
        
        // Show first 5 original items
        window.CONSOLE_LOG_IGNORE('  - First 5 original items:');
        for (let i = 0; i < Math.min(5, scroller.originalItems.length); i++) {
          const item = scroller.originalItems[i];
          if (item) {
            const jobNumber = item.getAttribute('data-job-number');
            window.CONSOLE_LOG_IGNORE(`    [${i}] Job ${jobNumber}`);
          }
        }
        
        // Check what's currently visible in the viewport
        window.CONSOLE_LOG_IGNORE('  - Currently visible items:');
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
              window.CONSOLE_LOG_IGNORE(`    [${index}] ${type} Job ${jobNumber} - top: ${itemTop}, bottom: ${itemBottom}`);
            }
          }
        });
      } else {
        window.CONSOLE_LOG_IGNORE('Infinite scroller not available');
      }
    };
    
    // Add global function to test the job 10 -> job 22 mismatch
    window.testJob10Mismatch = () => {
      window.CONSOLE_LOG_IGNORE('[DEBUG] testJob10Mismatch: Testing job 10 -> job 22 mismatch');
      
      if (window.resumeListController && window.cardsController) {
        // Check what job is at sorted index 10 in each controller
        const resumeJob10 = window.resumeListController.sortedIndices[10];
        const cardsJob10 = window.cardsController.sortedIndices[10];
        
        window.CONSOLE_LOG_IGNORE(`[DEBUG] testJob10Mismatch: ResumeListController sortedIndices[10] = ${resumeJob10}`);
        window.CONSOLE_LOG_IGNORE(`[DEBUG] testJob10Mismatch: CardsController sortedIndices[10] = ${cardsJob10}`);
        
        if (resumeJob10 !== cardsJob10) {
          window.CONSOLE_LOG_IGNORE(`[DEBUG] testJob10Mismatch: MISMATCH! Resume shows job ${resumeJob10}, Cards shows job ${cardsJob10}`);
          
          // Show the job details for both
          if (resumeJob10 !== undefined) {
            const resumeDiv = window.resumeListController.getBizResumeDivByJobNumber(resumeJob10);
            if (resumeDiv) {
              const roleElement = resumeDiv.querySelector('.biz-details-role');
              const employerElement = resumeDiv.querySelector('.biz-details-employer');
              const role = roleElement ? roleElement.textContent.trim() : 'N/A';
              const employer = employerElement ? employerElement.textContent.trim() : 'N/A';
              window.CONSOLE_LOG_IGNORE(`[DEBUG] testJob10Mismatch: Resume job ${resumeJob10} -> "${role}" at "${employer}"`);
            }
          }
          
          if (cardsJob10 !== undefined) {
            const cardDiv = window.cardsController.getBizCardDivByJobNumber(cardsJob10);
            if (cardDiv) {
              const roleElement = cardDiv.querySelector('.biz-details-role');
              const employerElement = cardDiv.querySelector('.biz-details-employer');
              const role = roleElement ? roleElement.textContent.trim() : 'N/A';
              const employer = employerElement ? employerElement.textContent.trim() : 'N/A';
              window.CONSOLE_LOG_IGNORE(`[DEBUG] testJob10Mismatch: Cards job ${cardsJob10} -> "${role}" at "${employer}"`);
            }
          }
        } else {
          window.CONSOLE_LOG_IGNORE(`[DEBUG] testJob10Mismatch: Controllers are in sync for sorted index 10 (job ${resumeJob10})`);
        }
      } else {
        window.CONSOLE_LOG_IGNORE('One or both controllers not available');
      }
    };
    
    // Add global function to force recalculation of heights
    window.forceRecalculateHeights = () => {
      window.CONSOLE_LOG_IGNORE('[TEST] Force recalculating infinite scroller heights');
      if (window.resumeListController && window.resumeListController.infiniteScroller) {
        window.resumeListController.infiniteScroller.recalculateHeights();
      } else {
        window.CONSOLE_LOG_IGNORE('ResumeListController or infinite scroller not available');
      }
    };

    window.CONSOLE_LOG_IGNORE('[DEBUG] ResumeListController: Added window.debugInfiniteScroller(), window.testScrollToJob(jobNumber), window.forceScrollToJob10(), window.logCoordinates(jobNumber), window.checkVisibleJobs(), window.compareJob5vs10(), window.debugSortConsistency(), window.forceSyncControllers(), window.testJob10Mismatch(), and window.forceRecalculateHeights() for testing');
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
    window.CONSOLE_LOG_IGNORE(`[DEBUG] goToPreviousResumeItem START: selectedJobNumber=${selectedJobNumber}`);

    if (!this.sortedIndices || this.sortedIndices.length === 0) return;

    let currentSortedPosition = -1;
    if (selectedJobNumber !== null) {
      currentSortedPosition = this.sortedIndices.indexOf(selectedJobNumber);
    }

    window.CONSOLE_LOG_IGNORE(`[DEBUG] goToPreviousResumeItem: currentSortedPosition=${currentSortedPosition}, sortedIndices.length=${this.sortedIndices.length}`);

    let prevSortedPosition;
    if (currentSortedPosition <= 0) {
      prevSortedPosition = this.sortedIndices.length - 1;
    } else {
      prevSortedPosition = currentSortedPosition - 1;
    }

    const prevJobNumber = this.sortedIndices[prevSortedPosition];
    window.CONSOLE_LOG_IGNORE(`[DEBUG] goToPreviousResumeItem: prevSortedPosition=${prevSortedPosition}, prevJobNumber=${prevJobNumber}`);
    
    // Check if we're trying to select the same job
    if (prevJobNumber === selectedJobNumber) {
      window.CONSOLE_LOG_IGNORE(`[DEBUG] WARNING: About to select same job index ${prevJobNumber}!`);
    }
    
    selectionManager.selectJobNumber(prevJobNumber, 'ResumeListController.goToPreviousResumeItem');
  }

  goToFirstResumeItem() {
    if (!this.sortedIndices || this.sortedIndices.length === 0) return;
    const firstJobNumber = this.sortedIndices[0];
    window.CONSOLE_LOG_IGNORE(`[DEBUG] goToFirstResumeItem: firstJobNumber=${firstJobNumber}, currentSelection=${selectionManager.getSelectedJobNumber()}`);
    selectionManager.selectJobNumber(firstJobNumber, 'ResumeListController.goToFirstResumeItem');
  }

  goToLastResumeItem() {
    if (!this.sortedIndices || this.sortedIndices.length === 0) return;
    const lastJobNumber = this.sortedIndices[this.sortedIndices.length - 1];
    // window.CONSOLE_LOG_IGNORE(`[DEBUG] goToLastResumeItem: Going to lastJobNumber=${lastJobNumber}, sortedIndices.length=${this.sortedIndices.length}`);
    selectionManager.selectJobNumber(lastJobNumber, 'ResumeListController.goToLastResumeItem');
  }

  applySortRule(sortRule, isInitializing = false) {
    window.CONSOLE_LOG_IGNORE(`[DEBUG] SORT: applySortRule called with ${sortRule.field} ${sortRule.direction}, isInitializing=${isInitializing}`);
    
    // Capture currently visible job before sorting
    const visibleJobBeforeSort = this.infiniteScroller ? this.infiniteScroller.getCurrentlyVisibleJob() : null;
    window.CONSOLE_LOG_IGNORE(`[DEBUG] SORT: Job visible before sort: ${visibleJobBeforeSort}`);
    
    this.currentSortRule = { ...sortRule };

    // Save the new sort rule to global state, unless during initial page load
    if (!isInitializing) {
        AppState.resume.sortRule = this.currentSortRule;
        saveState(AppState);
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
    window.CONSOLE_LOG_IGNORE(`[DEBUG] SORT: sortedIndices changed from:`, oldSortedIndices);
    window.CONSOLE_LOG_IGNORE(`[DEBUG] SORT: sortedIndices changed to:`, this.sortedIndices);
    
    // Check if job 0 position changed
    const oldJob0Position = oldSortedIndices.indexOf(0);
    const newJob0Position = this.sortedIndices.indexOf(0);
    if (oldJob0Position !== newJob0Position) {
      window.CONSOLE_LOG_IGNORE(`[DEBUG] SORT: Job 0 moved from position ${oldJob0Position} to position ${newJob0Position}`);
    }
    
    this.applyNewSort();
    
    // Verify job visibility after sort
    if (this.infiniteScroller) {
      setTimeout(() => {
        const visibleJobAfterSort = this.infiniteScroller.getCurrentlyVisibleJob();
        window.CONSOLE_LOG_IGNORE(`[DEBUG] SORT: Job visible after sort: ${visibleJobAfterSort}`);
        
        if (visibleJobBeforeSort && visibleJobAfterSort !== visibleJobBeforeSort) {
          window.CONSOLE_LOG_IGNORE(`[DEBUG] SORT: Visible job changed from ${visibleJobBeforeSort} to ${visibleJobAfterSort} during sort!`);
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
      window.CONSOLE_LOG_IGNORE(`[DEBUG] getBizResumeDivByJobNumber: No resume div found for job ${jobNumber}`);
      return null;
    }
    return this.bizResumeDivs[jobNumber];
  }

  /**
   * Debug method to show the complete mapping between jobNumbers and sortedIndices
   */
  debugMapping() {
    window.CONSOLE_LOG_IGNORE(`[DEBUG] ResumeListController.debugMapping:`);
    window.CONSOLE_LOG_IGNORE(`  sortedIndices:`, this.sortedIndices);
    window.CONSOLE_LOG_IGNORE(`  Job number to sorted index mapping:`);
    this.sortedIndices.forEach((jobNumber, sortedIndex) => {
      window.CONSOLE_LOG_IGNORE(`    Job ${jobNumber} -> sortedIndex ${sortedIndex}`);
    });
    
    if (this.infiniteScroller && this.infiniteScroller.originalItems) {
      window.CONSOLE_LOG_IGNORE(`  Infinite scroller originalItems mapping (first 10):`);
      for (let i = 0; i < Math.min(10, this.infiniteScroller.originalItems.length); i++) {
        const item = this.infiniteScroller.originalItems[i];
        if (item) {
          const jobNumber = item.getAttribute('data-job-number');
          window.CONSOLE_LOG_IGNORE(`    originalItems[${i}] -> Job ${jobNumber}`);
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
    window.CONSOLE_LOG_IGNORE(`[DEBUG] logViewportAndResumeDivCoordinates: jobNumber=${jobNumber}, caller=${caller}`);
    
    if (!this.infiniteScroller) {
      window.CONSOLE_LOG_IGNORE(`[DEBUG] logViewportAndResumeDivCoordinates: infiniteScroller is null!`);
      return;
    }
    
    // Get viewport coordinates
    const scrollport = this.infiniteScroller.scrollport;
    const viewportTop = scrollport.scrollTop;
    const viewportHeight = scrollport.offsetHeight;
    const viewportBottom = viewportTop + viewportHeight;
    
    window.CONSOLE_LOG_IGNORE(`[DEBUG] Viewport coordinates:`);
    window.CONSOLE_LOG_IGNORE(`  - Viewport top: ${viewportTop}px`);
    window.CONSOLE_LOG_IGNORE(`  - Viewport height: ${viewportHeight}px`);
    window.CONSOLE_LOG_IGNORE(`  - Viewport bottom: ${viewportBottom}px`);
    
    // Find the selected resume div
    const selectedResumeDiv = this.getBizResumeDivByJobNumber(jobNumber);
    if (!selectedResumeDiv) {
      window.CONSOLE_LOG_IGNORE(`[DEBUG] logViewportAndResumeDivCoordinates: No resume div found for job ${jobNumber}`);
      return;
    }
    
    // Get the resume div's position in the infinite scroller
    const sortedIndex = this.sortedIndices.indexOf(jobNumber);
    if (sortedIndex === -1) {
      window.CONSOLE_LOG_IGNORE(`[DEBUG] logViewportAndResumeDivCoordinates: Job ${jobNumber} not found in sortedIndices`);
      return;
    }
    
    // Find the item in the infinite scroller
    const targetItemIndex = sortedIndex + this.infiniteScroller.options.cloneCount;
    const targetItem = this.infiniteScroller.allItems[targetItemIndex];
    
    if (targetItem) {
      const itemTop = targetItem.top;
      const itemHeight = targetItem.height;
      const itemBottom = itemTop + itemHeight;
      
      window.CONSOLE_LOG_IGNORE(`[DEBUG] Selected resume div (Job ${jobNumber}) coordinates:`);
      window.CONSOLE_LOG_IGNORE(`  - Item top: ${itemTop}px`);
      window.CONSOLE_LOG_IGNORE(`  - Item height: ${itemHeight}px`);
      window.CONSOLE_LOG_IGNORE(`  - Item bottom: ${itemBottom}px`);
      window.CONSOLE_LOG_IGNORE(`  - Sorted index: ${sortedIndex}`);
      window.CONSOLE_LOG_IGNORE(`  - Target item index: ${targetItemIndex}`);
      
      // Calculate viewport-relative positions
      const relativeTop = itemTop - viewportTop;
      const relativeBottom = itemBottom - viewportTop;
      
      window.CONSOLE_LOG_IGNORE(`[DEBUG] Viewport-relative positions:`);
      window.CONSOLE_LOG_IGNORE(`  - Relative top: ${relativeTop}px (${relativeTop >= 0 ? 'below viewport top' : 'above viewport top'})`);
      window.CONSOLE_LOG_IGNORE(`  - Relative bottom: ${relativeBottom}px (${relativeBottom <= viewportHeight ? 'above viewport bottom' : 'below viewport bottom'})`);
      
      // Check visibility
      const isFullyVisible = itemTop >= viewportTop && itemBottom <= viewportBottom;
      const isPartiallyVisible = itemTop < viewportBottom && itemBottom > viewportTop;
      
      window.CONSOLE_LOG_IGNORE(`[DEBUG] Visibility status:`);
      window.CONSOLE_LOG_IGNORE(`  - Fully visible: ${isFullyVisible}`);
      window.CONSOLE_LOG_IGNORE(`  - Partially visible: ${isPartiallyVisible}`);
      
      if (!isPartiallyVisible) {
        window.CONSOLE_LOG_IGNORE(`[DEBUG] Selected resume div is NOT visible in viewport!`);
        window.CONSOLE_LOG_IGNORE(`[DEBUG] Need to scroll by ${itemTop - viewportTop}px to bring item top to viewport top`);
      }
    } else {
      window.CONSOLE_LOG_IGNORE(`[DEBUG] logViewportAndResumeDivCoordinates: Target item not found at index ${targetItemIndex}`);
    }
  }

  scrollToJobNumber(jobNumber, caller = '') {
    // console.log(`[DEBUG] ResumeListController: scrollToJobNumber=${jobNumber}, caller=${caller}`);
    
    if (!this.infiniteScroller) {
      console.log(`[DEBUG] ResumeListController: infiniteScroller is null!`);
      return;
    }

    // Find the sortedIndex for this jobNumber
    const sortedIndex = this.sortedIndices.indexOf(jobNumber);
    
    if (sortedIndex === -1) {
      console.log(`[DEBUG] scrollToJobNumber: jobNumber ${jobNumber} not found in sortedIndices!`);
      return;
    }
    
    // console.log(`[DEBUG] scrollToJobNumber: Scrolling to job ${jobNumber} at sorted index ${sortedIndex}`);
    
    // Direct scroll to the index - this is the single scroll operation
    this.infiniteScroller.scrollToIndex(sortedIndex, true);
    this.infiniteScroller.currentIndex = sortedIndex;
  }

  updateSortedIndices() {
    // Create array of indices with their corresponding job data
    const indexedJobs = this.originalJobsData.map((job, index) => ({
      index,
      job
    }));

    window.CONSOLE_LOG_IGNORE(`[DEBUG] updateSortedIndices: Sorting by ${this.currentSortRule.field} ${this.currentSortRule.direction}`);

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
    window.CONSOLE_LOG_IGNORE(`[DEBUG] updateSortedIndices: Final sortedIndices=`, this.sortedIndices);
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
    if (!this.infiniteScroller) return;

    window.CONSOLE_LOG_IGNORE(`[DEBUG] applyNewSort: sortedIndices=`, this.sortedIndices);

    // Create new array of divs in sorted order
    const sortedDivs = this.sortedIndices.map(originalIndex => this.bizResumeDivs[originalIndex]);
    window.CONSOLE_LOG_IGNORE(`[DEBUG] applyNewSort: sortedDivs length=`, sortedDivs.length);

    // Update the infinite scroller with the new order, starting at index 0
    const startingIndex = 0;
    this.infiniteScroller.setItems(sortedDivs, startingIndex);

    // After setting items, explicitly scroll to the new starting index without animation
    this.infiniteScroller.scrollToIndex(startingIndex, false); // false = no animation
    
    // Recalculate heights after palette application to ensure proper positioning
    this.infiniteScroller.recalculateHeightsAfterPalette();
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
      window.CONSOLE_LOG_IGNORE(`getOriginalIndexFromSorted: Invalid sorted index: ${sortedIndex}`);
      return -1;
    }
    
    // Convert to number if it's a string
    const numericIndex = parseInt(sortedIndex, 10);
    if (isNaN(numericIndex)) {
      window.CONSOLE_LOG_IGNORE(`getOriginalIndexFromSorted: Sorted index is not a number: ${sortedIndex}`);
      return -1;
    }
    
    // Check if sortedIndices is initialized
    if (!this.sortedIndices || !Array.isArray(this.sortedIndices)) {
      window.CONSOLE_LOG_IGNORE("getOriginalIndexFromSorted: sortedIndices is not properly initialized");
      return -1;
    }
    
    // Check if the index is in range
    if (numericIndex < 0 || numericIndex >= this.sortedIndices.length) {
      window.CONSOLE_LOG_IGNORE(`getOriginalIndexFromSorted: Sorted index ${numericIndex} is out of range (0-${this.sortedIndices.length - 1})`);
      return -1;
    }
    
    // Get the original index
    const originalIndex = this.sortedIndices[numericIndex];
    
    // Log the result
    window.CONSOLE_LOG_IGNORE(`getOriginalIndexFromSorted: Sorted index ${numericIndex} maps to original index ${originalIndex}`);
    
    return originalIndex;
  }

  // Get sorted position from original index
  getSortedIndexFromOriginal(originalIndex) {
    try {
        // Convert to number if it's a string
        const numericIndex = parseInt(originalIndex, 10);
        
        // Check if sortedIndices exists
        if (!this.sortedIndices || !Array.isArray(this.sortedIndices)) {
            window.CONSOLE_LOG_IGNORE(`getSortedIndexFromOriginal: sortedIndices is not an array`);
            return -1;
        }
        
        // Find the index
        const sortedIndex = this.sortedIndices.indexOf(numericIndex);
        
        // Log the result
        if (sortedIndex === -1) {
            window.CONSOLE_LOG_IGNORE(`getSortedIndexFromOriginal: Original index ${numericIndex} not found in sortedIndices`);
        } else {
            window.CONSOLE_LOG_IGNORE(`getSortedIndexFromOriginal: Original index ${numericIndex} maps to sorted index ${sortedIndex}`);
        }
        
        return sortedIndex;
    } catch (error) {
        window.CONSOLE_LOG_IGNORE(`ResumeListController: Error in getSortedIndexFromOriginal:`, error);
        return -1;
    }
  }

  destroy() {
    window.CONSOLE_LOG_IGNORE('[DEBUG] ResumeListController: Destroying and resetting singleton infinite scroller');
    if (this.infiniteScroller) {
      this.infiniteScroller.destroy();
      this.infiniteScroller = null;
    }
    // Reset the singleton instance
    InfiniteScrollingContainer.reset();
  }

  // Static method to reset the singleton instance
  static reset() {
    window.CONSOLE_LOG_IGNORE('[DEBUG] ResumeListController: Resetting singleton instance');
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
            window.CONSOLE_LOG_IGNORE(`ResumeListController: Original index ${jobNumber} not found in sortedIndices`);
            return;
        }
        
        if (!this.infiniteScroller) {
            window.CONSOLE_LOG_IGNORE(`ResumeListController: infiniteScroller is not initialized`);
            return;
        }
        
        const resumeDiv = this.infiniteScroller.getItemAtIndex(sortedIndex);
        if (resumeDiv) {
            resumeDiv.classList.add(className);
            window.CONSOLE_LOG_IGNORE(`ResumeListController: Added class ${className} to item at index ${sortedIndex}`);
        } else {
            window.CONSOLE_LOG_IGNORE(`ResumeListController: Could not find item at sorted index ${sortedIndex}`);
        }
    } catch (error) {
        window.CONSOLE_LOG_IGNORE(`ResumeListController: Error in addClassItem:`, error);
    }
  }

  removeClassItem(jobNumber, className) {
    try {
        const sortedIndex = this.getSortedIndexFromOriginal(jobNumber);
        if (sortedIndex === -1) {
            window.CONSOLE_LOG_IGNORE(`ResumeListController: Original index ${jobNumber} not found in sortedIndices`);
            return;
        }
        
        if (!this.infiniteScroller) {
            window.CONSOLE_LOG_IGNORE(`ResumeListController: infiniteScroller is not initialized`);
            return;
        }
        
        const resumeDiv = this.infiniteScroller.getItemAtIndex(sortedIndex);
        if (resumeDiv) {
            resumeDiv.classList.remove(className);
            window.CONSOLE_LOG_IGNORE(`ResumeListController: Removed class ${className} from item at index ${sortedIndex}`);
        } else {
            window.CONSOLE_LOG_IGNORE(`ResumeListController: Could not find item at sorted index ${sortedIndex}`);
        }
    } catch (error) {
        window.CONSOLE_LOG_IGNORE(`ResumeListController: Error in removeClassItem:`, error);
    }
  }

  /**
   * Scroll a bizResumeDiv into view using the infiniteScroller
   * @param {HTMLElement} bizResumeDiv - The bizResumeDiv to scroll into view
   * @returns {boolean} - Whether the scroll was successful
   */
  scrollBizResumeDivIntoView(bizResumeDiv) {
    if (!bizResumeDiv) {
      window.CONSOLE_LOG_IGNORE("ResumeListController: scrollBizResumeDivIntoView called with null bizResumeDiv");
      return false;
    }
    
    window.CONSOLE_LOG_IGNORE(`ResumeListController: Scrolling bizResumeDiv ${bizResumeDiv.id} into view`);
    
    // If we have an infinite scroller, use it (most efficient)
    if (this.infiniteScroller) {
      window.CONSOLE_LOG_IGNORE(`ResumeListController: Using infiniteScroller to scroll bizResumeDiv ${bizResumeDiv.id}`);
      return this.infiniteScroller.scrollToBizResumeDiv(bizResumeDiv, true);
    }
    
    // If we don't have an infinite scroller, use centralized smooth scrolling
    window.CONSOLE_LOG_IGNORE(`ResumeListController: No infiniteScroller available, using centralized smooth scrolling for ${bizResumeDiv.id}`);
    try {
      const container = document.getElementById('resume-content-div-wrapper');
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
      window.CONSOLE_LOG_IGNORE(`ResumeListController: Error scrolling bizResumeDiv ${bizResumeDiv.id} into view:`, error);
      return false;
    }
  }

  /**
   * Debug method to test scrolling to a specific job number
   * @param {number} jobNumber - The job number to scroll to
   */
  debugScrollToJob(jobNumber) {
    window.CONSOLE_LOG_IGNORE(`[DEBUG] debugScrollToJob: Testing scroll to job ${jobNumber}`);
    
    // Check if infinite scroller exists
    if (!this.infiniteScroller) {
      window.CONSOLE_LOG_IGNORE(`[DEBUG] debugScrollToJob: Infinite scroller is null!`);
      return;
    }
    
    // Check if job number exists in sorted indices
    const sortedIndex = this.sortedIndices.indexOf(jobNumber);
    if (sortedIndex === -1) {
      window.CONSOLE_LOG_IGNORE(`[DEBUG] debugScrollToJob: Job ${jobNumber} not found in sortedIndices!`);
      this.debugMapping();
      return;
    }
    
    window.CONSOLE_LOG_IGNORE(`[DEBUG] debugScrollToJob: Job ${jobNumber} found at sorted index ${sortedIndex}`);
    
    // Check if the infinite scroller has the correct item at this index
    if (this.infiniteScroller.originalItems && this.infiniteScroller.originalItems[sortedIndex]) {
      const actualJobNumber = this.infiniteScroller.originalItems[sortedIndex].getAttribute('data-job-number');
      window.CONSOLE_LOG_IGNORE(`[DEBUG] debugScrollToJob: Infinite scroller originalItems[${sortedIndex}] has job ${actualJobNumber}`);
      
      if (parseInt(actualJobNumber) !== jobNumber) {
        window.CONSOLE_LOG_IGNORE(`[DEBUG] debugScrollToJob: MISMATCH! Expected job ${jobNumber}, got ${actualJobNumber}`);
        return;
      }
    } else {
      window.CONSOLE_LOG_IGNORE(`[DEBUG] debugScrollToJob: No item found at infinite scroller originalItems[${sortedIndex}]`);
      return;
    }
    
    // Test the scroll
    window.CONSOLE_LOG_IGNORE(`[DEBUG] debugScrollToJob: All checks passed, testing scroll to sorted index ${sortedIndex}`);
    this.infiniteScroller.scrollToIndex(sortedIndex, false); // No animation for testing
    
    // Check the result after a short delay
    setTimeout(() => {
      const currentScrollTop = this.infiniteScroller.scrollport.scrollTop;
      window.CONSOLE_LOG_IGNORE(`[DEBUG] debugScrollToJob: Scroll result - scrollTop: ${currentScrollTop}`);
      
      // Check if the target item is visible
      const targetItem = this.infiniteScroller.allItems[sortedIndex + this.infiniteScroller.options.cloneCount];
      if (targetItem) {
        const itemTop = targetItem.top;
        const itemBottom = itemTop + targetItem.height;
        const containerHeight = this.infiniteScroller.scrollport.offsetHeight;
        const visibleTop = currentScrollTop;
        const visibleBottom = currentScrollTop + containerHeight;
        
        window.CONSOLE_LOG_IGNORE(`[DEBUG] debugScrollToJob: Visibility check:`);
        window.CONSOLE_LOG_IGNORE(`  Item top: ${itemTop}, Item bottom: ${itemBottom}`);
        window.CONSOLE_LOG_IGNORE(`  Visible top: ${visibleTop}, Visible bottom: ${visibleBottom}`);
        window.CONSOLE_LOG_IGNORE(`  Item visible: ${itemTop >= visibleTop && itemBottom <= visibleBottom}`);
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
      window.CONSOLE_LOG_IGNORE(`[DEBUG] ResumeListController: rDiv spacing configured to ${spacing}px`);
    } else {
      window.CONSOLE_LOG_IGNORE(`[DEBUG] ResumeListController: Cannot configure spacing - infinite scroller not available`);
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
      bizResumeDiv.setAttribute('data-color-index', bizCardDiv.getAttribute('data-color-index'));
      bizResumeDiv.style.pointerEvents = 'auto';
      
      const bizResumeDetailsDiv = BizDetailsDivModule.createBizResumeDetailsDiv(bizResumeDiv, bizCardDiv);
      bizResumeDiv.appendChild(bizResumeDetailsDiv);
      
      // Apply the current color palette
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
  
  /**
   * Set up mouse listeners for resume div
   */
  _setupMouseListeners(bizResumeDiv) {
    if (!bizResumeDiv) return;
    
    bizResumeDiv.addEventListener('click', () => this.handleBizResumeDivClickEvent(bizResumeDiv));
    bizResumeDiv.addEventListener('mouseenter', () => this.handleMouseEnterEvent(bizResumeDiv));
    bizResumeDiv.addEventListener('mouseleave', () => this.handleMouseLeaveEvent(bizResumeDiv));
  }
  
  /**
   * Handle resume div click events
   */
  handleBizResumeDivClickEvent(bizResumeDiv) {
    if (!bizResumeDiv) return;
    
    const jobNumber = parseInt(bizResumeDiv.getAttribute('data-job-number'), 10);
    const isSelected = selectionManager.getSelectedJobNumber() === jobNumber;
    
    if (isSelected) {
      selectionManager.clearSelection('ResumeListController.handleBizResumeDivClickEvent');
    } else {
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
   * Set up badge mode listener
   */
  _setupBadgeModeListener() {
    badgeManager.addEventListener('badgeModeChanged', this.handleBadgeModeChanged.bind(this));
  }
  
  /**
   * Set up color palette listener
   */
  _setupColorPaletteListener() {
    window.addEventListener('color-palette-changed', this.handleColorPaletteChanged.bind(this));
  }
  
  /**
   * Handle badge mode changes
   */
  handleBadgeModeChanged(event) {
    const { mode, previousMode, caller } = event.detail;
    
    console.log(`[DEBUG] ResumeListController.handleBadgeModeChanged: Mode changed from ${previousMode} to ${mode} (caller: ${caller})`);
    
    // Force recalculation of heights when badge mode changes
    if (this.infiniteScroller) {
      requestAnimationFrame(() => {
        this.infiniteScroller.recalculateHeights();
      });
    }
  }
  
  /**
   * Handle color palette changes
   */
  handleColorPaletteChanged(event) {
    const { filename, paletteName, previousFilename } = event.detail;
    
    console.log(`[DEBUG] ResumeListController.handleColorPaletteChanged: Palette changed from ${previousFilename} to ${filename} (${paletteName})`);
    
    // Apply new palette to all resume divs
    if (this.bizResumeDivs) {
      this.bizResumeDivs.forEach(div => {
        if (div) {
          // Apply palette to the div itself and all elements with data-color-index within it
          applyPaletteToElement(div);
          const colorElements = div.querySelectorAll('[data-color-index]');
          colorElements.forEach(applyPaletteToElement);
        }
      });
    }
    
    console.log(`[DEBUG] ResumeListController.handleColorPaletteChanged: Applied new palette to ${this.bizResumeDivs?.length || 0} resume divs`);
  }
  
  // endregion
  
  /**
   * Debug method to check sort rule consistency between controllers
   */
  debugSortRuleConsistency() {
    window.CONSOLE_LOG_IGNORE(`[DEBUG] ResumeListController.debugSortRuleConsistency:`);
    window.CONSOLE_LOG_IGNORE(`  Current sort rule:`, this.currentSortRule);
    window.CONSOLE_LOG_IGNORE(`  Sorted indices:`, this.sortedIndices);
    
    // Check if CardsController has the same sort rule
    if (window.cardsController) {
      window.CONSOLE_LOG_IGNORE(`  CardsController sort rule:`, window.cardsController.currentSortRule);
      window.CONSOLE_LOG_IGNORE(`  CardsController sorted indices:`, window.cardsController.sortedIndices);
      
      // Compare sorted indices
      const resumeSorted = this.sortedIndices;
      const cardsSorted = window.cardsController.sortedIndices;
      
      if (resumeSorted && cardsSorted) {
        const isSame = resumeSorted.length === cardsSorted.length && 
                      resumeSorted.every((val, index) => val === cardsSorted[index]);
        
        window.CONSOLE_LOG_IGNORE(`  Sorted indices match: ${isSame}`);
        
        if (!isSame) {
          window.CONSOLE_LOG_IGNORE(`  MISMATCH DETECTED!`);
          window.CONSOLE_LOG_IGNORE(`  Resume sorted indices:`, resumeSorted);
          window.CONSOLE_LOG_IGNORE(`  Cards sorted indices:`, cardsSorted);
          
          // Show the first few mismatches
          for (let i = 0; i < Math.min(10, Math.max(resumeSorted.length, cardsSorted.length)); i++) {
            const resumeJob = resumeSorted[i];
            const cardsJob = cardsSorted[i];
            if (resumeJob !== cardsJob) {
              window.CONSOLE_LOG_IGNORE(`    Index ${i}: Resume=${resumeJob}, Cards=${cardsJob}`);
            }
          }
        }
      }
    } else {
      window.CONSOLE_LOG_IGNORE(`  CardsController not available`);
    }
  }
}

export const resumeListController = new ResumeListController();