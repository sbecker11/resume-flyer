// TEST BIDIRECTIONAL SYNC FIX
// Paste this into browser console to test the rDiv-cDiv synchronization

(function() {
    console.clear();
    console.log('🔧 TESTING BIDIRECTIONAL SYNC FIX...\n');
    
    // Check if components are available
    console.log('🔍 SYSTEM COMPONENTS:');
    console.log(`   resumeListController: ${window.resumeListController ? '✅' : '❌'}`);
    console.log(`   resumeItemsController: ${window.resumeItemsController ? '✅' : '❌'}`);
    console.log(`   selectionManager: ${window.selectionManager ? '✅' : '❌'}`);
    
    const resumeDivs = document.querySelectorAll('.biz-resume-div');
    const cardDivs = document.querySelectorAll('.biz-card-div');
    const sceneContainer = document.getElementById('scene-container');
    
    console.log(`   Resume Divs: ${resumeDivs.length}`);
    console.log(`   Card Divs: ${cardDivs.length}`);
    console.log(`   Scene Container: ${sceneContainer ? '✅' : '❌'}`);
    
    if (!window.selectionManager || resumeDivs.length === 0 || !sceneContainer) {
        console.log('❌ SYSTEM NOT READY - Missing required components');
        return;
    }
    
    console.log('\n🧪 TESTING rDiv CLICK → cDiv SCROLL...');
    
    // Test with first available resume div
    const testResumeDiv = resumeDivs[0];
    const jobNumber = parseInt(testResumeDiv.getAttribute('data-job-number'));
    
    console.log(`🎯 Testing with Job ${jobNumber}`);
    
    // Record initial scroll position
    const initialScrollTop = sceneContainer.scrollTop;
    console.log(`   Initial scene scroll position: ${initialScrollTop}px`);
    
    // Find corresponding cDiv
    const targetCDiv = document.querySelector(`#biz-card-div-${jobNumber}`) ||
                      document.querySelector(`#biz-card-div-${jobNumber}-clone`) ||
                      document.querySelector(`.biz-card-div[data-job-number="${jobNumber}"]`);
    
    if (!targetCDiv) {
        console.log(`❌ No cDiv found for job ${jobNumber}`);
        return;
    }
    
    console.log(`   Found target cDiv: ${targetCDiv.id}`);
    
    // Get initial cDiv position
    const initialCDivRect = targetCDiv.getBoundingClientRect();
    const initialSceneRect = sceneContainer.getBoundingClientRect();
    const initialCDivVisible = initialCDivRect.top >= initialSceneRect.top && 
                              initialCDivRect.bottom <= initialSceneRect.bottom;
    
    console.log(`   Target cDiv initially visible: ${initialCDivVisible ? '✅' : '❌'}`);
    console.log(`   Target cDiv initial position: ${Math.round(initialCDivRect.top - initialSceneRect.top)}px from scene top`);
    
    // Set up monitoring for scroll events
    let scrollEventDetected = false;
    let finalScrollPosition = null;
    
    const scrollHandler = () => {
        scrollEventDetected = true;
        finalScrollPosition = sceneContainer.scrollTop;
        console.log(`   📜 SCROLL EVENT: Scene scrolled to ${finalScrollPosition}px`);
    };
    
    sceneContainer.addEventListener('scroll', scrollHandler);
    
    // Test the click
    console.log('\n🖱️ SIMULATING rDiv CLICK...');
    
    // Create and dispatch click event
    const clickEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window
    });
    
    testResumeDiv.dispatchEvent(clickEvent);
    console.log(`   ✅ Click event dispatched on job ${jobNumber}`);
    
    // Wait and analyze results
    setTimeout(() => {
        console.log('\n📊 TEST RESULTS:');
        
        // Check if selection changed
        const currentSelection = window.selectionManager.getSelectedJobNumber();
        const selectionChanged = currentSelection === jobNumber;
        console.log(`   Selection updated: ${selectionChanged ? '✅' : '❌'} (selected: ${currentSelection})`);
        
        // Check if scene scrolled
        const scrollDelta = Math.abs(finalScrollPosition - initialScrollTop);
        console.log(`   Scene scrolled: ${scrollEventDetected ? '✅' : '❌'} (${scrollDelta}px change)`);
        
        // Check final cDiv visibility
        const finalCDivRect = targetCDiv.getBoundingClientRect();
        const finalSceneRect = sceneContainer.getBoundingClientRect();
        const finalCDivVisible = finalCDivRect.top >= finalSceneRect.top && 
                                 finalCDivRect.bottom <= finalSceneRect.bottom;
        
        const cDivCentered = Math.abs((finalCDivRect.top + finalCDivRect.height/2) - (finalSceneRect.top + finalSceneRect.height/2)) < 100;
        
        console.log(`   Target cDiv visible: ${finalCDivVisible ? '✅' : '❌'}`);
        console.log(`   Target cDiv centered: ${cDivCentered ? '✅' : '❌'}`);
        console.log(`   Target cDiv final position: ${Math.round(finalCDivRect.top - finalSceneRect.top)}px from scene top`);
        
        // Overall test result
        const testsPass = [selectionChanged, scrollEventDetected, (finalCDivVisible || cDivCentered)];
        const passedCount = testsPass.filter(Boolean).length;
        const totalTests = testsPass.length;
        const successRate = Math.round((passedCount / totalTests) * 100);
        
        console.log(`\n🎯 OVERALL TEST RESULT:`);
        console.log(`   ✅ Passed: ${passedCount}/${totalTests} tests (${successRate}%)`);
        
        if (successRate >= 80) {
            console.log(`   🎉 SUCCESS: Bidirectional sync is working correctly!`);
            console.log(`   ✅ rDiv click → cDiv scroll synchronization confirmed`);
        } else {
            console.log(`   ❌ FAILURE: Bidirectional sync still has issues`);
            console.log(`   🔧 Check console for detailed error messages`);
        }
        
        // Cleanup
        sceneContainer.removeEventListener('scroll', scrollHandler);
        
    }, 3000); // Wait 3 seconds for smooth scroll to complete
    
    console.log('⏰ Waiting 3 seconds for scroll animation to complete...');
    
})();