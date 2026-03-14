// modules/resume/resumeSystemInitializer.mjs
/**
 * State of the app itself is stored only in app_state.json (bullsEye, focalPoint,
 * resumeListing, colorPalette, timeline, resizeHandle and their parent elements).
 *
 * Content (the divs) is loaded/reloaded separately: window.resumeFlock.allDivs holds
 * { bizCardDivs, skillCardDivs, bizResumeDivs, skillResumeDivs } and is repopulated on
 * each resume load (initial and manager load). Replacing allDivs replaces all resume-loaded
 * content; it is not persisted to app_state.json.
 */
import { resumeListController } from './ResumeListController.mjs';
import { resumeItemsController } from '../resume/ResumeItemsController.mjs';
import { selectionManager } from '../core/selectionManager.mjs';
import { getGlobalJobsDependency } from '../composables/useJobsDependency.mjs';
import { setJobColorIndex } from '../utils/paletteHelpers.mjs';

/**
 * Single process to build and attach the resume list from card divs.
 * Used for both hard-refresh (with mock cards) and resume-manager load / reinit (with real cards).
 * @param {HTMLElement[]} bizCardDivs - Card divs (real or mock with data-job-number, optional data-color-index)
 * @returns {Promise<boolean>} true if successful
 */
export async function buildResumeListFromCards(bizCardDivs) {
    if (!bizCardDivs?.length) {
        console.warn('[ResumeSystemInitializer] buildResumeListFromCards: no cards provided');
        return false;
    }
    const app = window.resumeFlock;
    if (!app) throw new Error('[ResumeSystemInitializer] buildResumeListFromCards: window.resumeFlock not set');
    const rlc = app.resumeListController;
    const ric = app.resumeItemsController;
    if (!rlc || !ric) {
        throw new Error('[ResumeSystemInitializer] buildResumeListFromCards: resumeListController or resumeItemsController not on window.resumeFlock');
    }
    const listEl = rlc.resumeContentDiv || document.getElementById('resume-content-div-list');
    if (!listEl) {
        throw new Error('[ResumeSystemInitializer] buildResumeListFromCards: resume list element not available');
    }
    console.debug('[ResumeSystemInitializer] building resume list from', bizCardDivs.length, 'cards');
    while (listEl.firstChild) listEl.firstChild.remove();
    const resumeDivs = await ric.createAllBizResumeDivs(bizCardDivs);
    resumeDivs.forEach((div, index) => {
        if (div instanceof Node) {
            listEl.appendChild(div);
        } else {
            console.error(`[ResumeSystemInitializer] Resume div ${index} is not a Node:`, div);
        }
    });
    rlc.bizResumeDivs = resumeDivs;
    ric.bizResumeDivs = resumeDivs;
    // Keep single per-resume div container in sync (only divs loaded on resume load)
    if (app.allDivs) {
        app.allDivs.bizResumeDivs = resumeDivs;
        app.allDivs.skillResumeDivs = []; // Rebuilt list has no skill copies until user adds
    }
    // Always refresh originalJobsData so updateSortedIndices uses the current resume's jobs.
    // jobsDependency skips rlc on reinit loads (isReady=true), leaving stale data → wrong sort.
    const currentJobs = getGlobalJobsDependency().getJobsData();
    if (Array.isArray(currentJobs) && currentJobs.length > 0) {
        rlc.initialize(currentJobs);
    }
    rlc.sortedIndices = Array.from({ length: resumeDivs.length }, (_, i) => i);
    rlc.reinitialize(resumeDivs);
    console.debug('[ResumeSystemInitializer] resume list built:', resumeDivs.length, 'items');
    return true;
}

/**
 * Create mock card divs from jobs data (for initial load before scene cards exist).
 */
function createMockBizCardDivs(jobsData) {
    return jobsData.map((job, index) => {
        const mockDiv = document.createElement('div');
        mockDiv.setAttribute('data-job-number', index.toString());
        setJobColorIndex(mockDiv, index);
        return mockDiv;
    });
}

/**
 * Create basic resume divs from loaded jobs data (initial load).
 * Uses the same buildResumeListFromCards process as reinit.
 */
async function createBasicResumeDivs(jobsData) {
    console.debug('[ResumeSystemInitializer] creating resume divs (initial load)');
    const mockBizCardDivs = createMockBizCardDivs(jobsData);
    return buildResumeListFromCards(mockBizCardDivs);
}

/**
 * Initialize the resume system controllers using Vue 3 dependency management
 * This replaces the direct jobs import with reactive dependency pattern
 */
export async function initializeResumeSystem(resumeId = null) {
    console.debug('[ResumeSystemInitializer] initializing', resumeId ? `resumeId=${resumeId}` : '(default)');
    
    try {
        // Get the global jobs dependency manager
        const jobsDependency = getGlobalJobsDependency();
        
        // Single app-state object: replace window.resumeFlock to replace all application state
        window.resumeFlock = window.resumeFlock || {};
        const app = window.resumeFlock;
        app.resumeListController = resumeListController;
        app.resumeItemsController = resumeItemsController;
        app.selectionManager = selectionManager;
        // Per-resume divs only (loaded on each resume load – initial and manager)
        app.allDivs = app.allDivs || {
            bizCardDivs: [],
            skillCardDivs: [],
            bizResumeDivs: [],
            skillResumeDivs: []
        };
        window.testResumeClick = (jobNumber) => app.resumeListController?.testResumeClick(jobNumber);
        app.resumeItemsController.registerForInitialization();
        jobsDependency.registerController('ResumeListController', async (jobsData) => {
            console.debug('[ResumeSystemInitializer] init ResumeListController');
            await app.resumeListController.initialize(jobsData);
            console.debug('[ResumeSystemInitializer] ResumeListController ready');
        });
        
        // Start jobs loading (this will trigger controller initialization when complete)
        console.debug('[ResumeSystemInitializer] loading jobs');
        const jobsData = await jobsDependency.loadJobs(resumeId ? { forceResumeId: resumeId } : {});
        
        // Wait for DOM elements to be available (retry with delays)
        let attempts = 0;
        const maxAttempts = 5;
        
        const waitForDOMElements = async () => {
            while (attempts < maxAttempts) {
                const resumeContentWrapper = document.getElementById('resume-content-listing');
                const resumeContentDivList = document.getElementById('resume-content-div-list');
                
                if (resumeContentDivList && resumeContentWrapper) {
                    console.debug('[ResumeSystemInitializer] DOM elements found');
                    const rlc = window.resumeFlock?.resumeListController;
                    if (!rlc) throw new Error('[ResumeSystemInitializer] resumeListController not on window.resumeFlock');
                    rlc.resumeContentDiv = resumeContentDivList;
                    rlc.resumeContentWrapper = resumeContentWrapper;
                    rlc.resumecontentdivElement = resumeContentDivList;
                    rlc.resumecontentdivwrapperElement = resumeContentWrapper;
                    await createBasicResumeDivs(jobsData);
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
        indicator.style.cssText = 'position: fixed; bottom: 10px; left: 10px; background: green; color: white; padding: 5px; z-index: 9999; font-size: 12px; line-height: 1.2;';
        
        const totalJobs = jobsData.length;
        const rlc = window.resumeFlock?.resumeListController;
        const createdDivs = rlc?.bizResumeDivs?.length || 0;
        const scrollItemCount = rlc?.scrollContainer?.originalItems?.length || 0;
        
        indicator.innerHTML = `✅ Resume System (Vue3)<br/>Jobs: ${totalJobs}<br/>Divs: ${createdDivs}<br/>Scroll: ${scrollItemCount}`;
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
    const app = window.resumeFlock;
    return !!(app?.resumeListController && app?.resumeItemsController);
}

/**
 * Global test function to verify resume system functionality
 * Available in browser console as window.testResumeSystem()
 */
export function testResumeSystem() {
    console.log('=== RESUME SYSTEM TEST (Vue 3 Dependencies) ===');
    const app = window.resumeFlock;
    console.log('window.resumeFlock exists:', !!app);
    console.log('resumeListController exists:', !!app?.resumeListController);
    console.log('resumeItemsController exists:', !!app?.resumeItemsController);
    
    // Test Vue 3 dependency manager
    const jobsDependency = getGlobalJobsDependency();
    console.log('Vue 3 Jobs Dependency:');
    console.log('- isReady:', jobsDependency.isReady.value);
    console.log('- isLoading:', jobsDependency.isLoading.value);
    console.log('- hasError:', jobsDependency.hasError.value);
    console.log('- jobsCount:', jobsDependency.jobsCount.value);
    
    if (app?.resumeListController) {
        const rlc = app.resumeListController;
        console.log('ResumeListController methods:');
        console.log('- goToFirstResumeItem:', typeof rlc.goToFirstResumeItem);
        console.log('- applySortRule:', typeof rlc.applySortRule);
        console.log('- originalJobsData length:', rlc.originalJobsData?.length);
        console.log('- bizResumeDivs length:', rlc.bizResumeDivs?.length);
        console.log('- scrollContainer exists:', !!rlc.scrollContainer);
        console.log('- scrollContainer type:', typeof rlc.scrollContainer);
    }
    if (app?.resumeItemsController) {
        const ric = app.resumeItemsController;
        console.log('ResumeItemsController methods:');
        console.log('- createAllBizResumeDivs:', typeof ric.createAllBizResumeDivs);
        console.log('- isInitialized:', ric.isInitialized());
        console.log('- bizResumeDivs length:', ric.bizResumeDivs?.length);
    }
    
    // Test selectionManager API compatibility
    console.log('SelectionManager API test:');
    try {
        const sm = app?.selectionManager;
        console.log('- hoverJobNumber method exists:', typeof sm?.hoverJobNumber === 'function');
        console.log('- clearHover method exists:', typeof sm?.clearHover === 'function');
        console.log('- getSelectedJobNumber method exists:', typeof sm?.getSelectedJobNumber === 'function');
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
    
    const wrapper = document.getElementById('resume-content-listing');
    console.log('resume-content-listing exists:', !!wrapper);
    
    if (wrapper) {
        console.log('Wrapper scroll properties:');
        console.log('- scrollHeight:', wrapper.scrollHeight);
        console.log('- clientHeight:', wrapper.clientHeight);
        console.log('- scrollTop:', wrapper.scrollTop);
        console.log('- overflow-y style:', getComputedStyle(wrapper).overflowY);
        console.log('- Can scroll:', wrapper.scrollHeight > wrapper.clientHeight);
    }
    
    const app = window.resumeFlock;
    const rlc = app?.resumeListController;
    if (rlc?.scrollContainer) {
        console.log('ResumeListScrollContainer status:');
        console.log('- Instance exists:', !!rlc.scrollContainer);
        console.log('- Constructor name:', rlc.scrollContainer.constructor.name);
        console.log('- Original items length:', rlc.scrollContainer.originalItems?.length);
        console.log('- Current index:', rlc.scrollContainer.currentIndex);
    }
    if (rlc) {
        console.log('ResumeListController scroll info:');
        console.log('- bizResumeDivs length:', rlc.bizResumeDivs?.length);
        console.log('- sortedIndices length:', rlc.sortedIndices?.length);
    }
    
    console.log('=== END SCROLLING TEST ===');
}

// Make test functions globally available
if (typeof window !== 'undefined') {
    window.testResumeSystem = testResumeSystem;
    window.checkResumeDivs = checkResumeDivs;
    window.testScrolling = testScrolling;
}
