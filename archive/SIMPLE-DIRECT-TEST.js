// SIMPLE DIRECT TEST - Paste into browser console
// Tests the exact chain that should work

(function() {
    console.clear();
    console.log('🧪 SIMPLE DIRECT TEST...\n');
    
    // Check basics
    if (!window.selectionManager) {
        console.log('❌ No selectionManager');
        return;
    }
    
    if (!window.resumeItemsController) {
        console.log('❌ No resumeItemsController');
        return;
    }
    
    console.log('✅ Both managers available');
    
    // Test 1: Direct API call
    console.log('\n🧪 TEST 1: Direct API call');
    console.log('Calling selectionManager.selectJobNumber(0, "test")...');
    
    window.selectionManager.selectJobNumber(0, 'direct-test');
    
    setTimeout(() => {
        const selected = window.selectionManager.getSelectedJobNumber();
        console.log(`   Result: Selected job is now ${selected}`);
        
        // Test 2: Check if event listener is working
        console.log('\n🧪 TEST 2: Event listener test');
        
        // Add our own listener to see if events are firing
        let eventReceived = false;
        const testListener = (event) => {
            eventReceived = true;
            console.log(`   ✅ Event received: job ${event.detail.selectedJobNumber}`);
        };
        
        window.selectionManager.addEventListener('selectionChanged', testListener);
        
        // Trigger another selection
        console.log('Calling selectionManager.selectJobNumber(1, "test2")...');
        window.selectionManager.selectJobNumber(1, 'direct-test2');
        
        setTimeout(() => {
            console.log(`   Event received: ${eventReceived ? '✅' : '❌'}`);
            
            // Test 3: Check scroll
            console.log('\n🧪 TEST 3: Scene container scroll');
            const sceneContainer = document.getElementById('scene-container');
            if (sceneContainer) {
                console.log(`   Scene scroll position: ${sceneContainer.scrollTop}px`);
                
                // Check if target cDiv exists
                const cDiv = document.querySelector('#biz-card-div-1') || 
                            document.querySelector('[data-job-number="1"].biz-card-div');
                console.log(`   Target cDiv found: ${cDiv ? '✅ ' + cDiv.id : '❌'}`);
                
                if (cDiv) {
                    const rect = cDiv.getBoundingClientRect();
                    const sceneRect = sceneContainer.getBoundingClientRect();
                    const visible = rect.top >= sceneRect.top && rect.bottom <= sceneRect.bottom;
                    console.log(`   cDiv visible: ${visible ? '✅' : '❌'}`);
                    console.log(`   cDiv position: ${Math.round(rect.top - sceneRect.top)}px from scene top`);
                }
            } else {
                console.log('   ❌ No scene container');
            }
            
            // Cleanup
            window.selectionManager.removeEventListener('selectionChanged', testListener);
            
            console.log('\n📊 SIMPLE TEST COMPLETE');
            console.log('If events are received but no scrolling, the issue is in handleSelectionChanged');
            console.log('If no events received, the issue is in event listener binding');
            
        }, 1000);
        
    }, 500);
    
})();