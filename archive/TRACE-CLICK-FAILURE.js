// TRACE CLICK FAILURE - Paste into browser console
// This will trace exactly what happens when you click an rDiv

(function() {
    console.clear();
    console.log('🔍 TRACING CLICK FAILURE...\n');
    
    // Step 1: Check all required components
    console.log('📋 COMPONENT STATUS:');
    console.log(`   window.selectionManager: ${!!window.selectionManager}`);
    console.log(`   window.resumeListController: ${!!window.resumeListController}`);
    console.log(`   window.resumeItemsController: ${!!window.resumeItemsController}`);
    
    if (window.selectionManager) {
        console.log(`   selectionManager.selectJobNumber: ${typeof window.selectionManager.selectJobNumber}`);
        console.log(`   selectionManager.addEventListener: ${typeof window.selectionManager.addEventListener}`);
    }
    
    if (window.resumeItemsController) {
        console.log(`   resumeItemsController.handleSelectionChanged: ${typeof window.resumeItemsController.handleSelectionChanged}`);
        console.log(`   resumeItemsController.isInitialized: ${window.resumeItemsController.isInitialized()}`);
    }
    
    // Step 2: Check DOM elements
    const resumeDivs = document.querySelectorAll('.biz-resume-div');
    const cardDivs = document.querySelectorAll('.biz-card-div');
    const sceneContainer = document.getElementById('scene-container');
    
    console.log(`\n🎭 DOM ELEMENTS:`);
    console.log(`   Resume divs: ${resumeDivs.length}`);
    console.log(`   Card divs: ${cardDivs.length}`);
    console.log(`   Scene container: ${!!sceneContainer}`);
    
    if (resumeDivs.length === 0) {
        console.log('❌ NO RESUME DIVS FOUND - Cannot test');
        return;
    }
    
    // Step 3: Pick a test target
    const testDiv = resumeDivs[0];
    const jobNumber = parseInt(testDiv.getAttribute('data-job-number'));
    console.log(`\n🎯 TEST TARGET: Job ${jobNumber}`);
    console.log(`   Element ID: ${testDiv.id}`);
    console.log(`   Data job number: ${testDiv.getAttribute('data-job-number')}`);
    
    // Step 4: Check if click listeners are attached
    console.log(`\n🖱️ CLICK LISTENER CHECK:`);
    
    // Try to find existing click listeners
    const clickListeners = testDiv.onclick || 'none';
    console.log(`   Direct onclick: ${clickListeners}`);
    
    // Step 5: Intercept all relevant methods to trace execution
    console.log(`\n🕵️ SETTING UP TRACING...\n`);
    
    let traceLog = [];
    
    // Wrap selectionManager.selectJobNumber
    if (window.selectionManager && window.selectionManager.selectJobNumber) {
        const originalSelect = window.selectionManager.selectJobNumber;
        window.selectionManager.selectJobNumber = function(jobNum, source) {
            traceLog.push(`✅ selectionManager.selectJobNumber(${jobNum}, "${source}") called`);
            console.log(`🔄 TRACE: selectionManager.selectJobNumber(${jobNum}, "${source}") called`);
            return originalSelect.call(this, jobNum, source);
        };
    }
    
    // Wrap resumeItemsController.handleSelectionChanged
    if (window.resumeItemsController && window.resumeItemsController.handleSelectionChanged) {
        const originalHandle = window.resumeItemsController.handleSelectionChanged;
        window.resumeItemsController.handleSelectionChanged = function(event) {
            traceLog.push(`✅ resumeItemsController.handleSelectionChanged called with job ${event.detail.selectedJobNumber}`);
            console.log(`🔄 TRACE: resumeItemsController.handleSelectionChanged called with job ${event.detail.selectedJobNumber}`);
            return originalHandle.call(this, event);
        };
    }
    
    // Monitor scene container scroll
    if (sceneContainer) {
        const initialScrollTop = sceneContainer.scrollTop;
        console.log(`📊 Initial scene scroll: ${initialScrollTop}px`);
        
        sceneContainer.addEventListener('scroll', function() {
            const newScrollTop = sceneContainer.scrollTop;
            traceLog.push(`✅ Scene container scrolled to ${newScrollTop}px`);
            console.log(`🔄 TRACE: Scene container scrolled to ${newScrollTop}px`);
        });
    }
    
    // Step 6: Create a direct click handler to see if click is detected at all
    const clickDetector = function(event) {
        traceLog.push(`✅ Click detected on element with job number ${event.target.closest('.biz-resume-div')?.getAttribute('data-job-number')}`);
        console.log(`🔄 TRACE: Click detected on resume div`);
    };
    
    testDiv.addEventListener('click', clickDetector);
    
    // Step 7: Now create the actual click
    console.log(`🎬 SIMULATING CLICK ON JOB ${jobNumber}...\n`);
    
    const clickEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window
    });
    
    testDiv.dispatchEvent(clickEvent);
    console.log(`✅ Click event dispatched\n`);
    
    // Step 8: Wait and analyze what happened
    setTimeout(() => {
        console.log('📊 EXECUTION TRACE RESULTS:');
        console.log('='.repeat(40));
        
        if (traceLog.length === 0) {
            console.log('❌ NO TRACE EVENTS CAPTURED');
            console.log('🔧 This means the click is not triggering any of the expected methods');
            console.log('\n🔍 DEBUGGING STEPS:');
            console.log('   1. Check if resume divs have click handlers attached');
            console.log('   2. Verify ResumeListController is initialized');
            console.log('   3. Check if event listeners are properly bound');
        } else {
            traceLog.forEach((log, index) => {
                console.log(`   ${index + 1}. ${log}`);
            });
        }
        
        // Check final state
        const currentSelection = window.selectionManager?.getSelectedJobNumber?.();
        const finalScroll = sceneContainer?.scrollTop;
        
        console.log(`\n📈 FINAL STATE:`);
        console.log(`   Selected job: ${currentSelection}`);
        console.log(`   Scene scroll: ${finalScroll}px`);
        console.log(`   Expected job: ${jobNumber}`);
        
        // Identify the failure point
        console.log(`\n🎯 FAILURE ANALYSIS:`);
        if (!traceLog.some(log => log.includes('Click detected'))) {
            console.log('❌ ISSUE: Click not detected at all');
            console.log('🔧 FIX: Check if resume divs have proper click event listeners');
        } else if (!traceLog.some(log => log.includes('selectJobNumber'))) {
            console.log('❌ ISSUE: Click detected but selectJobNumber not called');
            console.log('🔧 FIX: Check ResumeListController click handler implementation');
        } else if (!traceLog.some(log => log.includes('handleSelectionChanged'))) {
            console.log('❌ ISSUE: selectJobNumber called but event not received');
            console.log('🔧 FIX: Check event listener binding in ResumeItemsController');
        } else if (!traceLog.some(log => log.includes('scrolled'))) {
            console.log('❌ ISSUE: Event received but no scrolling occurred');
            console.log('🔧 FIX: Check scroll logic in handleSelectionChanged method');
        } else {
            console.log('✅ ALL STEPS EXECUTED - Check if cDiv is actually visible');
        }
        
        // Cleanup
        testDiv.removeEventListener('click', clickDetector);
        console.log('\n✅ TRACE COMPLETE');
        
    }, 2000);
    
    console.log('⏰ Analyzing for 2 seconds...');
    
})();