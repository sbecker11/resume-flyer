// TEST THE FIX - Copy this into browser console after app loads
// This will verify if the singleton manager fix resolved the bidirectional sync issue

(function() {
    console.clear();
    console.log('🔧 TESTING THE SINGLETON MANAGER FIX\n');
    
    // Wait for app to load
    function waitForApp() {
        const hasElements = document.querySelectorAll('.biz-resume-div').length > 0 && 
                           document.querySelectorAll('.biz-card-div').length > 0;
        const hasManagers = !!window.selectionManager && !!window.resumeListController;
        
        if (hasElements && hasManagers) {
            console.log('✅ App components loaded, starting tests...\n');
            runTests();
        } else {
            console.log('⏳ Waiting for app to load...');
            setTimeout(waitForApp, 1000);
        }
    }
    
    function runTests() {
        console.log('1️⃣ CHECKING SINGLETON CONSISTENCY');
        
        // Check if the fixed setup is working
        const listenersReady = !!window._cardsControllerListenersReady;
        const selectionManagerId = window._cardsControllerSelectionManagerId;
        const currentSelectionManagerId = window.selectionManager?.instanceId;
        
        console.log('   ✓ Listeners ready flag:', listenersReady);
        console.log('   ✓ Recorded selectionManager ID:', selectionManagerId);
        console.log('   ✓ Current selectionManager ID:', currentSelectionManagerId);
        console.log('   ✓ IDs match:', selectionManagerId === currentSelectionManagerId);
        
        if (!listenersReady) {
            console.log('❌ Event listeners still not set up properly');
            console.log('❌ The fix may need more time or has other issues');
            return;
        }
        
        console.log('\n2️⃣ TESTING BIDIRECTIONAL SYNC');
        
        // Test rDiv → cDiv sync
        testRDivToCDiv();
    }
    
    function testRDivToCDiv() {
        console.log('   🧪 Testing rDiv → cDiv header scroll...');
        
        let capturedLogs = [];
        const originalLog = console.log;
        console.log = (...args) => {
            const message = args.join(' ');
            capturedLogs.push(message);
            originalLog(...args);
        };
        
        // Trigger rDiv selection
        window.selectionManager.selectJobNumber(3, 'ResumeListController.handleBizResumeDivClickEvent');
        
        setTimeout(() => {
            console.log = originalLog;
            
            // Analyze the logs
            const hasHandleJobSelected = capturedLogs.some(log => log.includes('handleJobSelected CALLED'));
            const hasRDivScroll = capturedLogs.some(log => log.includes('rDiv selected → scrolling cDiv header'));
            const hasScrollExecution = capturedLogs.some(log => log.includes('SCROLL: Attempting to scroll cDiv HEADER'));
            
            console.log('      📋 handleJobSelected called:', hasHandleJobSelected ? '✅ YES' : '❌ NO');
            console.log('      📋 rDiv scroll detected:', hasRDivScroll ? '✅ YES' : '❌ NO');
            console.log('      📋 Scroll executed:', hasScrollExecution ? '✅ YES' : '❌ NO');
            
            if (hasHandleJobSelected && hasRDivScroll && hasScrollExecution) {
                console.log('      🎉 rDiv → cDiv sync is WORKING!');
            } else {
                console.log('      ❌ rDiv → cDiv sync still has issues');
            }
            
            // Test cDiv → rDiv sync
            testCDivToRDiv();
            
        }, 400);
    }
    
    function testCDivToRDiv() {
        console.log('\n   🧪 Testing cDiv → rDiv header scroll...');
        
        let capturedLogs = [];
        const originalLog = console.log;
        console.log = (...args) => {
            const message = args.join(' ');
            capturedLogs.push(message);
            originalLog(...args);
        };
        
        // Trigger cDiv selection
        window.selectionManager.selectJobNumber(7, 'CardsController.cardClick');
        
        setTimeout(() => {
            console.log = originalLog;
            
            // Analyze the logs
            const hasHandleJobSelected = capturedLogs.some(log => log.includes('handleJobSelected CALLED'));
            const hasCDivScroll = capturedLogs.some(log => log.includes('cDiv selected → scrolling rDiv header'));
            const hasScrollExecution = capturedLogs.some(log => log.includes('SCROLL: Attempting to scroll rDiv HEADER'));
            
            console.log('      📋 handleJobSelected called:', hasHandleJobSelected ? '✅ YES' : '❌ NO');
            console.log('      📋 cDiv scroll detected:', hasCDivScroll ? '✅ YES' : '❌ NO');
            console.log('      📋 Scroll executed:', hasScrollExecution ? '✅ YES' : '❌ NO');
            
            if (hasHandleJobSelected && hasCDivScroll && hasScrollExecution) {
                console.log('      🎉 cDiv → rDiv sync is WORKING!');
            } else {
                console.log('      ❌ cDiv → rDiv sync still has issues');
            }
            
            // Final test with actual clicks
            testRealClicks();
            
        }, 400);
    }
    
    function testRealClicks() {
        console.log('\n3️⃣ TESTING REAL ELEMENT CLICKS');
        
        const resumeDiv = document.querySelector('.biz-resume-div[data-job-number]');
        const cardDiv = document.querySelector('.biz-card-div[data-job-number]');
        
        if (!resumeDiv || !cardDiv) {
            console.log('❌ Cannot find elements for real click test');
            showFinalResult();
            return;
        }
        
        console.log('   🖱️ Testing real resume div click...');
        
        let clickLogs = [];
        const originalLog = console.log;
        console.log = (...args) => {
            const message = args.join(' ');
            if (message.includes('🖱️') || message.includes('🎯') || message.includes('📜') || message.includes('SCROLL:')) {
                clickLogs.push(message);
            }
            originalLog(...args);
        };
        
        // Click resume div
        resumeDiv.click();
        
        setTimeout(() => {
            console.log = originalLog;
            
            const hasClickResponse = clickLogs.length > 0;
            const hasScrollResponse = clickLogs.some(log => log.includes('SCROLL:'));
            
            console.log('      📋 Click response:', hasClickResponse ? '✅ YES' : '❌ NO');
            console.log('      📋 Scroll response:', hasScrollResponse ? '✅ YES' : '❌ NO');
            
            if (hasClickResponse && hasScrollResponse) {
                console.log('      🎉 Real clicks are triggering bidirectional sync!');
            } else {
                console.log('      ❌ Real clicks not fully working');
            }
            
            showFinalResult();
            
        }, 500);
    }
    
    function showFinalResult() {
        console.log('\n🏁 FINAL RESULT:');
        console.log('If you see "✅ YES" for the key tests above, the fix is working!');
        console.log('Try clicking resume items and cards manually to see the bidirectional scroll in action.');
        console.log('\n💡 Expected behavior:');
        console.log('   • Click resume item → corresponding card header scrolls into view');
        console.log('   • Click business card → corresponding resume header scrolls into view');
    }
    
    // Start the test
    waitForApp();
    
})();

console.log('🧪 Fix test loaded - running automatically...');
console.log('💡 Watch the console output to see if the singleton manager fix worked!');