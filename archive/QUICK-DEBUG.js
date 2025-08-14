// EMERGENCY DEBUG - Find exactly what's broken
// Copy this entire script into browser console

(function() {
    console.clear();
    console.log('🚨 EMERGENCY DEBUG - FINDING THE FAILURE\n');
    
    // Step 1: Verify selectionManager exists and works
    if (!window.selectionManager) {
        console.log('❌ CRITICAL: window.selectionManager does not exist');
        return;
    }
    
    console.log('✅ selectionManager exists');
    console.log('✅ instanceId:', window.selectionManager.instanceId);
    
    // Step 2: Test if selectionManager can dispatch events at all
    let testEventReceived = false;
    window.selectionManager.addEventListener('test-debug-event', () => {
        testEventReceived = true;
    });
    
    window.selectionManager.eventTarget.dispatchEvent(new CustomEvent('test-debug-event'));
    console.log('✅ selectionManager event system working:', testEventReceived);
    
    if (!testEventReceived) {
        console.log('❌ CRITICAL: selectionManager event system is broken');
        return;
    }
    
    // Step 3: Check if handleJobSelected is being called AT ALL
    let handleJobSelectedCalled = false;
    
    // Override console.log temporarily to capture handleJobSelected calls
    const originalLog = console.log;
    console.log = (...args) => {
        const message = args.join(' ');
        if (message.includes('handleJobSelected CALLED')) {
            handleJobSelectedCalled = true;
        }
        originalLog(...args);
    };
    
    // Trigger a selection
    console.log('🧪 Testing if handleJobSelected gets called...');
    window.selectionManager.selectJobNumber(1, 'DEBUG-TEST');
    
    // Wait a moment and check
    setTimeout(() => {
        console.log = originalLog; // Restore console
        
        console.log('✅ handleJobSelected was called:', handleJobSelectedCalled);
        
        if (!handleJobSelectedCalled) {
            console.log('❌ CRITICAL: handleJobSelected is never called');
            console.log('❌ This means useCardsController event listeners are not set up');
            
            // Check if the setup flags exist
            console.log('🔍 Checking setup flags...');
            console.log('   _cardsControllerListenersReady:', window._cardsControllerListenersReady);
            console.log('   _cardsControllerSelectionManagerId:', window._cardsControllerSelectionManagerId);
            
            if (!window._cardsControllerListenersReady) {
                console.log('❌ PROBLEM FOUND: useCardsController event listeners were never set up properly');
                console.log('❌ The setupEventListeners function failed or was never called');
            }
        } else {
            console.log('✅ Event listener setup is working');
            // If handleJobSelected is called, the issue is in the scroll functions
            testScrollFunctions();
        }
        
    }, 500);
    
    function testScrollFunctions() {
        console.log('\n🧪 Testing scroll function calls...');
        
        let scrollLogsCaptured = [];
        const originalLog = console.log;
        console.log = (...args) => {
            const message = args.join(' ');
            if (message.includes('SCROLL:') || message.includes('scrolling') || message.includes('📜')) {
                scrollLogsCaptured.push(message);
            }
            originalLog(...args);
        };
        
        // Test rDiv → cDiv scroll
        window.selectionManager.selectJobNumber(2, 'ResumeListController.handleBizResumeDivClickEvent');
        
        setTimeout(() => {
            console.log = originalLog;
            
            console.log('✅ Scroll logs captured:', scrollLogsCaptured.length);
            scrollLogsCaptured.forEach(log => console.log('   ', log));
            
            if (scrollLogsCaptured.length === 0) {
                console.log('❌ CRITICAL: Scroll functions are not being called');
                console.log('❌ The source detection or scroll function dispatch is broken');
            } else {
                console.log('✅ Scroll functions are being called');
                
                // Check if any scroll errors occurred
                const hasScrollError = scrollLogsCaptured.some(log => log.includes('SCROLL FAILED'));
                if (hasScrollError) {
                    console.log('❌ PROBLEM: Scroll functions are failing to find elements');
                } else {
                    console.log('✅ Scroll functions appear to be working');
                    console.log('🤔 The issue might be visual - elements might be scrolling but not visibly');
                }
            }
            
        }, 700);
    }
    
})();

console.log('\n💡 This debug script will identify the exact failure point');
console.log('💡 Watch the output above to see where the system is breaking');