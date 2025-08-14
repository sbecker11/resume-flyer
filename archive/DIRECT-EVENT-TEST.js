// DIRECT EVENT TEST - Paste into browser console
// This will test if the event chain is working

(function() {
    console.clear();
    console.log('🔧 DIRECT EVENT CHAIN TEST...\n');
    
    // Check components
    console.log('🔍 COMPONENT CHECK:');
    console.log(`   window.selectionManager: ${!!window.selectionManager}`);
    console.log(`   window.resumeItemsController: ${!!window.resumeItemsController}`);
    
    if (!window.selectionManager) {
        console.log('❌ selectionManager not available');
        return;
    }
    
    if (!window.resumeItemsController) {
        console.log('❌ resumeItemsController not available');
        return;
    }
    
    // Test event listening
    console.log('\n🎧 EVENT LISTENER TEST:');
    
    // Add our own test listener
    let testEventReceived = false;
    const testHandler = (event) => {
        testEventReceived = true;
        console.log(`   ✅ TEST LISTENER: Received selectionChanged event for job ${event.detail.selectedJobNumber}`);
        console.log(`      Event detail:`, event.detail);
    };
    
    window.selectionManager.addEventListener('selectionChanged', testHandler);
    console.log('   📡 Test listener added to selectionManager');
    
    // Check if ResumeItemsController has listeners
    const hasListeners = window.selectionManager.eventTarget._listeners?.selectionChanged?.length > 0;
    console.log(`   📊 selectionChanged listeners count: ${hasListeners ? 'Has listeners' : 'No listeners'}`);
    
    // Test direct API call
    console.log('\n🧪 DIRECT API TEST:');
    console.log('   Testing selectionManager.selectJobNumber(0, "direct-test")...');
    
    try {
        window.selectionManager.selectJobNumber(0, 'direct-test');
        console.log('   ✅ API call successful');
        
        setTimeout(() => {
            console.log('\n📊 TEST RESULTS:');
            console.log(`   Test event received: ${testEventReceived ? '✅' : '❌'}`);
            console.log(`   Current selection: ${window.selectionManager.getSelectedJobNumber()}`);
            
            // Check if resume div got selected class
            const resumeDiv = document.querySelector('.biz-resume-div[data-job-number="0"]');
            const hasSelectedClass = resumeDiv?.classList.contains('selected');
            console.log(`   Resume div has 'selected' class: ${hasSelectedClass ? '✅' : '❌'}`);
            
            // Check scene container scroll
            const sceneContainer = document.getElementById('scene-container');
            const sceneScrollTop = sceneContainer?.scrollTop;
            console.log(`   Scene container scroll position: ${sceneScrollTop}px`);
            
            // Check if cDiv exists
            const cDiv = document.querySelector('#biz-card-div-0') || 
                        document.querySelector('#biz-card-div-0-clone') ||
                        document.querySelector('.biz-card-div[data-job-number="0"]');
            console.log(`   Target cDiv found: ${cDiv ? '✅ ' + cDiv.id : '❌'}`);
            
            if (cDiv && sceneContainer) {
                const cDivRect = cDiv.getBoundingClientRect();
                const sceneRect = sceneContainer.getBoundingClientRect();
                const cDivVisible = cDivRect.top >= sceneRect.top && cDivRect.bottom <= sceneRect.bottom;
                console.log(`   Target cDiv visible: ${cDivVisible ? '✅' : '❌'}`);
            }
            
            // Cleanup
            window.selectionManager.removeEventListener('selectionChanged', testHandler);
            console.log('\n✅ TEST COMPLETE - Check results above');
            
        }, 2000);
        
    } catch (error) {
        console.log(`   ❌ API call failed: ${error.message}`);
    }
    
    console.log('⏰ Waiting 2 seconds for events to process...');
    
})();