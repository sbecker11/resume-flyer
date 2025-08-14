// SIMPLE TEST - Copy this into browser console and run testBasicSync()
// This will tell us exactly what's failing

function testBasicSync() {
    console.clear();
    console.log('🧪 SIMPLE BIDIRECTIONAL SYNC TEST\n');
    
    // Step 1: Check if basic components exist
    console.log('1️⃣ Basic System Check:');
    const hasSelectionManager = !!window.selectionManager;
    const hasResumeController = !!window.resumeListController;
    const resumeDivCount = document.querySelectorAll('.biz-resume-div').length;
    const cardDivCount = document.querySelectorAll('.biz-card-div').length;
    
    console.log('   ✓ selectionManager:', hasSelectionManager);
    console.log('   ✓ resumeListController:', hasResumeController);  
    console.log('   ✓ Resume divs:', resumeDivCount);
    console.log('   ✓ Card divs:', cardDivCount);
    
    if (!hasSelectionManager) {
        console.log('❌ FAIL: selectionManager not available');
        return;
    }
    
    // Step 2: Test if rDiv selection triggers ANY response
    console.log('\n2️⃣ Testing rDiv Selection:');
    
    let loggedMessages = [];
    const originalLog = console.log;
    console.log = (...args) => {
        const msg = args.join(' ');
        loggedMessages.push(msg);
        originalLog(...args);
    };
    
    // Test rDiv → cDiv sync
    window.selectionManager.selectJobNumber(5, 'ResumeListController.handleBizResumeDivClickEvent');
    
    setTimeout(() => {
        console.log = originalLog;
        
        console.log('   Messages logged during selection:', loggedMessages.length);
        
        // Look for specific patterns
        const hasHandleJobSelected = loggedMessages.some(msg => msg.includes('handleJobSelected CALLED'));
        const hasScrollAttempt = loggedMessages.some(msg => msg.includes('scrolling cDiv header'));
        const hasScrollExecution = loggedMessages.some(msg => msg.includes('SCROLL: Attempting'));
        
        console.log('   ✓ handleJobSelected called:', hasHandleJobSelected);
        console.log('   ✓ Scroll attempt logged:', hasScrollAttempt);
        console.log('   ✓ Scroll execution logged:', hasScrollExecution);
        
        if (!hasHandleJobSelected) {
            console.log('❌ FAIL: handleJobSelected not being called');
            console.log('❌ This means event listeners are not set up properly');
        } else if (!hasScrollAttempt) {
            console.log('❌ FAIL: Source detection not working');
        } else if (!hasScrollExecution) {
            console.log('❌ FAIL: Scroll function not executing');  
        } else {
            console.log('✅ rDiv → cDiv sync is working!');
        }
        
        // Step 3: Test cDiv selection
        testCDivSelection();
        
    }, 300);
}

function testCDivSelection() {
    console.log('\n3️⃣ Testing cDiv Selection:');
    
    let loggedMessages = [];
    const originalLog = console.log;
    console.log = (...args) => {
        const msg = args.join(' ');
        loggedMessages.push(msg);
        originalLog(...args);
    };
    
    // Test cDiv → rDiv sync  
    window.selectionManager.selectJobNumber(8, 'CardsController.cardClick');
    
    setTimeout(() => {
        console.log = originalLog;
        
        const hasHandleJobSelected = loggedMessages.some(msg => msg.includes('handleJobSelected CALLED'));
        const hasScrollAttempt = loggedMessages.some(msg => msg.includes('scrolling rDiv header'));
        const hasScrollExecution = loggedMessages.some(msg => msg.includes('SCROLL: Attempting'));
        
        console.log('   ✓ handleJobSelected called:', hasHandleJobSelected);
        console.log('   ✓ Scroll attempt logged:', hasScrollAttempt);
        console.log('   ✓ Scroll execution logged:', hasScrollExecution);
        
        if (!hasHandleJobSelected) {
            console.log('❌ FAIL: handleJobSelected not being called');
        } else if (!hasScrollAttempt) {
            console.log('❌ FAIL: Source detection not working for cDiv');
        } else if (!hasScrollExecution) {
            console.log('❌ FAIL: rDiv scroll function not executing');
        } else {
            console.log('✅ cDiv → rDiv sync is working!');
        }
        
        // Step 4: Test actual clicks
        testActualClicks();
        
    }, 300);
}

function testActualClicks() {
    console.log('\n4️⃣ Testing Actual Element Clicks:');
    
    const resumeDiv = document.querySelector('.biz-resume-div[data-job-number]');
    const cardDiv = document.querySelector('.biz-card-div[data-job-number]');
    
    if (!resumeDiv || !cardDiv) {
        console.log('❌ FAIL: Cannot find resume div or card div for click test');
        return;
    }
    
    let clickLogs = [];
    const originalLog = console.log;
    console.log = (...args) => {
        const msg = args.join(' ');
        clickLogs.push(msg);
        originalLog(...args);
    };
    
    // Test resume div click
    resumeDiv.click();
    
    setTimeout(() => {
        const hasResumeClickResponse = clickLogs.some(msg => 
            msg.includes('Resume div clicked') || 
            msg.includes('handleBizResumeDivClickEvent')
        );
        
        console.log('   ✓ Resume div click detected:', hasResumeClickResponse);
        
        // Test card div click
        clickLogs = [];
        cardDiv.click();
        
        setTimeout(() => {
            console.log = originalLog;
            
            const hasCardClickResponse = clickLogs.some(msg =>
                msg.includes('cDiv clicked') ||
                msg.includes('CardsController')
            );
            
            console.log('   ✓ Card div click detected:', hasCardClickResponse);
            
            // Final verdict
            console.log('\n🏁 FINAL RESULT:');
            if (!hasResumeClickResponse && !hasCardClickResponse) {
                console.log('❌ CRITICAL FAIL: No click events are being detected');
                console.log('❌ The event listeners are not attached to the DOM elements');
            } else if (!hasResumeClickResponse) {
                console.log('❌ FAIL: Resume click events not working');
            } else if (!hasCardClickResponse) {
                console.log('❌ FAIL: Card click events not working');
            } else {
                console.log('✅ Click events are working - check scroll behavior manually');
            }
            
        }, 200);
    }, 200);
}

// Make it globally available
window.testBasicSync = testBasicSync;

console.log('✅ Simple test loaded! Run: testBasicSync()');