// Test runner for bidirectional header scroll functionality
// Copy this entire script and paste into browser console after app loads

console.log('🔄 Loading bidirectional header scroll test runner...\n');

// Wait for app to be fully loaded
function waitForAppReady() {
    return new Promise((resolve) => {
        const checkReady = () => {
            const resumeDivs = document.querySelectorAll('.biz-resume-div').length;
            const cardDivs = document.querySelectorAll('.biz-card-div').length;
            const selectionManager = !!window.selectionManager;
            const resumeController = !!window.resumeListController;
            
            if (resumeDivs > 0 && cardDivs > 0 && selectionManager && resumeController) {
                console.log('✅ App ready for testing');
                resolve(true);
            } else {
                console.log(`⏳ Waiting for app... (rDivs: ${resumeDivs}, cDivs: ${cardDivs}, selMgr: ${selectionManager}, resCtrl: ${resumeController})`);
                setTimeout(checkReady, 1000);
            }
        };
        checkReady();
    });
}

// Test the core bidirectional functionality step by step
async function runCoreTests() {
    console.log('🧪 === CORE BIDIRECTIONAL HEADER SCROLL TESTS ===\n');
    
    // Test 1: rDiv click → cDiv header scroll
    console.log('1️⃣ Testing rDiv selection → cDiv header scroll');
    
    if (window.selectionManager) {
        // Monitor console logs for scroll attempts
        const originalLog = console.log;
        let scrollLogs = [];
        console.log = (...args) => {
            const msg = args.join(' ');
            if (msg.includes('SCROLL:') || msg.includes('scrolling cDiv header') || msg.includes('rDiv selected →')) {
                scrollLogs.push(msg);
            }
            originalLog(...args);
        };
        
        // Test rDiv → cDiv sync
        window.selectionManager.selectJobNumber(5, 'ResumeListController.handleBizResumeDivClickEvent');
        await new Promise(resolve => setTimeout(resolve, 500));
        
        console.log = originalLog; // Restore console
        
        const rDivToCDivWorked = scrollLogs.some(log => 
            log.includes('rDiv selected → scrolling cDiv header') || 
            log.includes('SCROLL: Attempting to scroll cDiv HEADER')
        );
        
        console.log(`   rDiv → cDiv header scroll: ${rDivToCDivWorked ? '✅ WORKING' : '❌ FAILED'}`);
        if (rDivToCDivWorked) {
            console.log(`   📜 Captured logs: ${scrollLogs.length} scroll-related entries`);
        }
    }
    
    // Test 2: cDiv click → rDiv header scroll  
    console.log('\n2️⃣ Testing cDiv selection → rDiv header scroll');
    
    if (window.selectionManager) {
        const originalLog = console.log;
        let scrollLogs = [];
        console.log = (...args) => {
            const msg = args.join(' ');
            if (msg.includes('SCROLL:') || msg.includes('scrolling rDiv header') || msg.includes('cDiv selected →')) {
                scrollLogs.push(msg);
            }
            originalLog(...args);
        };
        
        // Test cDiv → rDiv sync
        window.selectionManager.selectJobNumber(8, 'CardsController.cardClick');
        await new Promise(resolve => setTimeout(resolve, 500));
        
        console.log = originalLog; // Restore console
        
        const cDivToRDivWorked = scrollLogs.some(log => 
            log.includes('cDiv selected → scrolling rDiv header') || 
            log.includes('SCROLL: Attempting to scroll rDiv HEADER')
        );
        
        console.log(`   cDiv → rDiv header scroll: ${cDivToRDivWorked ? '✅ WORKING' : '❌ FAILED'}`);
        if (cDivToRDivWorked) {
            console.log(`   📜 Captured logs: ${scrollLogs.length} scroll-related entries`);
        }
    }
    
    // Test 3: Manual click simulation
    console.log('\n3️⃣ Testing manual click simulation');
    
    // Find first available elements
    const firstResumeDiv = document.querySelector('.biz-resume-div[data-job-number]');
    const firstCardDiv = document.querySelector('.biz-card-div[data-job-number]');
    
    if (firstResumeDiv && firstCardDiv) {
        const resumeJobNumber = firstResumeDiv.getAttribute('data-job-number');
        const cardJobNumber = firstCardDiv.getAttribute('data-job-number');
        
        console.log(`   Found test elements: rDiv job-${resumeJobNumber}, cDiv job-${cardJobNumber}`);
        
        // Test actual click events
        const originalLog = console.log;
        let clickLogs = [];
        console.log = (...args) => {
            const msg = args.join(' ');
            if (msg.includes('🖱️') || msg.includes('clicked') || msg.includes('🎯')) {
                clickLogs.push(msg);
            }
            originalLog(...args);
        };
        
        // Simulate resume div click
        firstResumeDiv.click();
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Simulate card div click  
        firstCardDiv.click();
        await new Promise(resolve => setTimeout(resolve, 200));
        
        console.log = originalLog; // Restore console
        
        const clicksWorked = clickLogs.length > 0;
        console.log(`   Manual clicks detection: ${clicksWorked ? '✅ WORKING' : '❌ FAILED'}`);
        if (clicksWorked) {
            console.log(`   🖱️ Captured ${clickLogs.length} click events`);
        }
    } else {
        console.log('   ❌ No test elements found for manual click simulation');
    }
    
    // Test 4: Header element detection
    console.log('\n4️⃣ Testing header element detection');
    
    let headerCounts = { rDiv: 0, cDiv: 0 };
    
    // Check first few jobs for header elements
    for (let jobNumber = 0; jobNumber < 5; jobNumber++) {
        const resumeDiv = document.querySelector(`[data-job-number="${jobNumber}"].biz-resume-div`);
        const cardDiv = document.getElementById(`biz-card-div-${jobNumber}`);
        
        if (resumeDiv) {
            const rHeaders = ['.biz-resume-details-div', '.resume-header', '.job-title', '.company-name'];
            const hasRHeader = rHeaders.some(selector => resumeDiv.querySelector(selector));
            if (hasRHeader) headerCounts.rDiv++;
        }
        
        if (cardDiv) {
            const cHeaders = ['.biz-details-employer', '.biz-card-header', '.job-title', '.company-name', '.biz-details-role'];
            const hasCHeader = cHeaders.some(selector => cardDiv.querySelector(selector));
            if (hasCHeader) headerCounts.cDiv++;
        }
    }
    
    console.log(`   Header elements found: rDiv ${headerCounts.rDiv}/5, cDiv ${headerCounts.cDiv}/5`);
    console.log(`   Header detection: ${headerCounts.rDiv > 0 && headerCounts.cDiv > 0 ? '✅ WORKING' : '❌ FAILED'}`);
    
    console.log('\n🏁 Core tests completed! Check results above.');
}

// Quick verification function  
function quickVerify() {
    console.log('⚡ Quick bidirectional sync verification...\n');
    
    const checks = [
        { name: 'selectionManager available', test: () => !!window.selectionManager },
        { name: 'resumeListController available', test: () => !!window.resumeListController },
        { name: 'Resume divs in DOM', test: () => document.querySelectorAll('.biz-resume-div').length > 0 },
        { name: 'Card divs in DOM', test: () => document.querySelectorAll('.biz-card-div').length > 0 },
        { name: 'Debug functions available', test: () => typeof window.debugSelectionSync === 'function' },
        { name: 'Test functions available', test: () => typeof window.testRDivToCDivSync === 'function' }
    ];
    
    let allGood = true;
    checks.forEach(check => {
        const result = check.test();
        console.log(`${result ? '✅' : '❌'} ${check.name}`);
        if (!result) allGood = false;
    });
    
    console.log(`\n${allGood ? '🎉 System ready for bidirectional sync!' : '⚠️ Some components not ready yet'}`);
    return allGood;
}

// Main test runner
async function runHeaderScrollTests() {
    console.log('🏃‍♂️ Starting header scroll test runner...\n');
    
    // Step 1: Quick verification
    const systemReady = quickVerify();
    
    if (!systemReady) {
        console.log('\n⏳ Waiting for system to be ready...');
        await waitForAppReady();
    }
    
    // Step 2: Run core functionality tests
    await runCoreTests();
    
    // Step 3: Final summary
    console.log('\n📋 === TEST SUMMARY ===');
    console.log('✅ rDiv selection should trigger cDiv header scroll');
    console.log('✅ cDiv selection should trigger rDiv header scroll');
    console.log('✅ Header elements: .biz-details-employer, .biz-resume-details-div, etc.');
    console.log('✅ Source parameter determines scroll direction');
    console.log('✅ Smooth scrolling with center alignment');
    
    console.log('\n🎯 Manual testing: Click any resume item or card to test live functionality!');
    console.log('🔍 Debug: Use window.debugSelectionSync() for detailed system status');
}

// Make functions globally available
if (typeof window !== 'undefined') {
    window.runHeaderScrollTests = runHeaderScrollTests;
    window.quickVerify = quickVerify;
    window.runCoreTests = runCoreTests;
    
    console.log('✅ Header scroll test runner loaded!');
    console.log('🚀 Usage: runHeaderScrollTests()');
    console.log('⚡ Quick check: quickVerify()');
    console.log('🧪 Core tests only: runCoreTests()');
}