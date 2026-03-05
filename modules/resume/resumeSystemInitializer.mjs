// modules/resume/resumeSystemInitializer.mjs

import { resumeListController } from './ResumeListController.mjs';
import { resumeItemsController } from '../resume/ResumeItemsController.mjs';
import { selectionManager } from '../core/selectionManager.mjs';
import { getGlobalJobsDependency } from '../composables/useJobsDependency.mjs';

/**
 * Create basic resume divs from loaded jobs data
 * Uses Vue 3 dependency pattern instead of direct jobs import
 */
async function createBasicResumeDivs(resumeListController, resumeItemsController, jobsData) {
    console.debug('[ResumeSystemInitializer] creating resume divs');
    
    try {
        // Create mock bizCardDivs from jobs data
        const mockBizCardDivs = jobsData.map((job, index) => {
            const mockDiv = document.createElement('div');
            mockDiv.setAttribute('data-job-number', index.toString());
            mockDiv.setAttribute('data-color-index', (index % 10).toString()); // Simple color cycling
            return mockDiv;
        });
        
        console.debug('[ResumeSystemInitializer] mock cards', mockBizCardDivs.length);
        
        // Use ResumeItemsController to create resume divs
        const resumeDivs = await resumeItemsController.createAllBizResumeDivs(mockBizCardDivs);
        console.debug('[ResumeSystemInitializer] resume divs', resumeDivs.length);
        
        // Add the resume divs to the DOM
        const resumeContentDiv = resumeListController.resumeContentDiv;
        if (resumeContentDiv && resumeDivs.length > 0) {
            resumeDivs.forEach((div, index) => {
                if (div instanceof Node) {
                    resumeContentDiv.appendChild(div);
                } else {
                    console.error(`[ResumeSystemInitializer] Resume div ${index} is not a Node:`, div);
                }
            });
            
            console.debug('[ResumeSystemInitializer] divs added to DOM');
            
            // Store the divs in the controllers
            resumeListController.bizResumeDivs = resumeDivs;
            resumeItemsController.bizResumeDivs = resumeDivs;
            
            // Initialize the sort indices
            resumeListController.sortedIndices = Array.from({length: jobsData.length}, (_, i) => i);
            
            // Setup infinite scrolling - this is crucial for scrollability!
            console.debug('[ResumeSystemInitializer] setting up infinite scrolling');
            resumeListController.setupInfiniteScrolling();
            
            return true;
        } else {
            throw new Error('[ResumeSystemInitializer] resumeContentDiv not available or no resume divs created');
        }
    } catch (error) {
        console.error('[ResumeSystemInitializer] Failed to create resume divs:', error);
        throw error;
    }
}

/**
 * Initialize the resume system controllers using Vue 3 dependency management
 * This replaces the direct jobs import with reactive dependency pattern
 */
export async function initializeResumeSystem() {
    console.debug('[ResumeSystemInitializer] initializing');
    
    try {
        // Get the global jobs dependency manager
        const jobsDependency = getGlobalJobsDependency();
        
        // Make controllers and managers globally available (as expected by Vue components and other modules)
        window.resumeListController = resumeListController;
        window.resumeItemsController = resumeItemsController;
        window.selectionManager = selectionManager;
        
        // Add debug functions for manual testing
        window.testResumeClick = (jobNumber) => resumeListController.testResumeClick(jobNumber);
        
        
        // Initialize the controllers and managers
        resumeItemsController.registerForInitialization();
        
        // Register resumeListController as dependent on jobs data
        jobsDependency.registerController('ResumeListController', async (jobsData) => {
            console.debug('[ResumeSystemInitializer] init ResumeListController');
            
            // Initialize the controller with jobs data (THIS WAS MISSING!)
            await resumeListController.initialize(jobsData);
            
            console.debug('[ResumeSystemInitializer] ResumeListController ready');
        });
        
        // Start jobs loading (this will trigger controller initialization when complete)
        console.debug('[ResumeSystemInitializer] loading jobs');
        const jobsData = await jobsDependency.loadJobs();
        
        // Wait for DOM elements to be available (retry with delays)
        let attempts = 0;
        const maxAttempts = 5;
        
        const waitForDOMElements = async () => {
            while (attempts < maxAttempts) {
                const resumeContentWrapper = document.getElementById('resume-content-div-wrapper');
                const resumeContentDivList = document.getElementById('resume-content-div-list');
                
                if (resumeContentDivList && resumeContentWrapper) {
                    console.debug('[ResumeSystemInitializer] DOM elements found');
                    
                    // Skill cards and rDivs are children of the same container; rDivs go into resume-content-div-list
                    resumeListController.resumeContentDiv = resumeContentDivList;
                    resumeListController.resumeContentWrapper = resumeContentWrapper;
                    resumeListController.resumecontentdivElement = resumeContentDivList;
                    resumeListController.resumecontentdivwrapperElement = resumeContentWrapper;
                    
                    // Create basic resume divs from loaded jobs data
                    await createBasicResumeDivs(resumeListController, resumeItemsController, jobsData);
                    
                    return true;
                }
                
                attempts++;
                if (attempts < maxAttempts) {
                    console.debug('[ResumeSystemInitializer] waiting for DOM', attempts, maxAttempts);
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }
            
            throw new Error('[ResumeSystemInitializer] DOM elements not available after retries');
        };
        
        await waitForDOMElements();
        
        console.log('[ResumeContainer] Resume system ready');
        
        // Create a visual indicator that shows the resume system status
        const indicator = document.createElement('div');
        indicator.id = 'resume-system-indicator';
        indicator.style.cssText = 'position: fixed; top: 10px; right: 10px; background: green; color: white; padding: 5px; z-index: 9999; font-size: 12px; line-height: 1.2;';
        
        const totalJobs = jobsData.length;
        const createdDivs = resumeListController.bizResumeDivs?.length || 0;
        const infiniteItems = resumeListController.infiniteScroller?.originalItems?.length || 0;
        
        indicator.innerHTML = `✅ Resume System (Vue3)<br/>Jobs: ${totalJobs}<br/>Divs: ${createdDivs}<br/>Infinite: ${infiniteItems}`;
        document.body.appendChild(indicator);
        
        // Remove the indicator after 5 seconds  
        setTimeout(() => indicator.remove(), 5000);
        
        return true;
    } catch (error) {
        console.error('[ResumeSystemInitializer] ❌ Failed to initialize resume system:', error);
        throw error;
    }
}

/**
 * Check if the resume system is properly initialized
 */
export function isResumeSystemInitialized() {
    return !!(window.resumeListController && window.resumeItemsController);
}

/**
 * Global test function to verify resume system functionality
 * Available in browser console as window.testResumeSystem()
 */
export function testResumeSystem() {
    console.log('=== RESUME SYSTEM TEST (Vue 3 Dependencies) ===');
    console.log('window.resumeListController exists:', !!window.resumeListController);
    console.log('window.resumeItemsController exists:', !!window.resumeItemsController);
    
    // Test Vue 3 dependency manager
    const jobsDependency = getGlobalJobsDependency();
    console.log('Vue 3 Jobs Dependency:');
    console.log('- isReady:', jobsDependency.isReady.value);
    console.log('- isLoading:', jobsDependency.isLoading.value);
    console.log('- hasError:', jobsDependency.hasError.value);
    console.log('- jobsCount:', jobsDependency.jobsCount.value);
    
    if (window.resumeListController) {
        console.log('ResumeListController methods:');
        console.log('- goToFirstResumeItem:', typeof window.resumeListController.goToFirstResumeItem);
        console.log('- applySortRule:', typeof window.resumeListController.applySortRule);
        console.log('- originalJobsData length:', window.resumeListController.originalJobsData?.length);
        console.log('- bizResumeDivs length:', window.resumeListController.bizResumeDivs?.length);
        console.log('- infiniteScroller exists:', !!window.resumeListController.infiniteScroller);
        console.log('- infiniteScroller type:', typeof window.resumeListController.infiniteScroller);
    }
    
    if (window.resumeItemsController) {
        console.log('ResumeItemsController methods:');
        console.log('- createAllBizResumeDivs:', typeof window.resumeItemsController.createAllBizResumeDivs);
        console.log('- isInitialized:', window.resumeItemsController.isInitialized());
        console.log('- bizResumeDivs length:', window.resumeItemsController.bizResumeDivs?.length);
    }
    
    // Test selectionManager API compatibility
    console.log('SelectionManager API test:');
    try {
        console.log('- hoverJobNumber method exists:', typeof window.selectionManager?.hoverJobNumber === 'function');
        console.log('- clearHover method exists:', typeof window.selectionManager?.clearHover === 'function');
        console.log('- getSelectedJobNumber method exists:', typeof window.selectionManager?.getSelectedJobNumber === 'function');
    } catch (error) {
        console.error('SelectionManager API test failed:', error);
        throw error;
    }
    
    console.log('=== END RESUME SYSTEM TEST ===');
}

/**
 * Check if resume divs are in the DOM
 */
export function checkResumeDivs() {
    console.log('=== RESUME DIVS CHECK ===');
    const resumeContentDiv = document.getElementById('resume-content-div');
    console.log('resume-content-div exists:', !!resumeContentDiv);
    
    if (resumeContentDiv) {
        const resumeDivs = resumeContentDiv.querySelectorAll('.biz-resume-div');
        console.log('Found resume divs:', resumeDivs.length);
        
        if (resumeDivs.length > 0) {
            console.log('First resume div content:', resumeDivs[0].textContent.substring(0, 100) + '...');
            console.log('Resume div classes:', resumeDivs[0].className);
        }
    }
    console.log('=== END RESUME DIVS CHECK ===');
}

/**
 * Test scrolling functionality
 */
export function testScrolling() {
    console.log('=== SCROLLING TEST ===');
    
    const wrapper = document.getElementById('resume-content-div-wrapper');
    console.log('resume-content-div-wrapper exists:', !!wrapper);
    
    if (wrapper) {
        console.log('Wrapper scroll properties:');
        console.log('- scrollHeight:', wrapper.scrollHeight);
        console.log('- clientHeight:', wrapper.clientHeight);
        console.log('- scrollTop:', wrapper.scrollTop);
        console.log('- overflow-y style:', getComputedStyle(wrapper).overflowY);
        console.log('- Can scroll:', wrapper.scrollHeight > wrapper.clientHeight);
    }
    
    if (window.resumeListController?.infiniteScroller) {
        console.log('InfiniteScrollingContainer status:');
        console.log('- Instance exists:', !!window.resumeListController.infiniteScroller);
        console.log('- Constructor name:', window.resumeListController.infiniteScroller.constructor.name);
        console.log('- Original items length:', window.resumeListController.infiniteScroller.originalItems?.length);
        console.log('- Current index:', window.resumeListController.infiniteScroller.currentIndex);
    }
    
    if (window.resumeListController) {
        console.log('ResumeListController scroll info:');
        console.log('- bizResumeDivs length:', window.resumeListController.bizResumeDivs?.length);
        console.log('- sortedIndices length:', window.resumeListController.sortedIndices?.length);
    }
    
    console.log('=== END SCROLLING TEST ===');
}

// Make test functions globally available
if (typeof window !== 'undefined') {
    window.testResumeSystem = testResumeSystem;
    window.checkResumeDivs = checkResumeDivs;
    window.testScrolling = testScrolling;
}
