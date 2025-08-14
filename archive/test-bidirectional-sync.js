// Comprehensive test script for bidirectional rDiv ↔ cDiv header scroll synchronization
// Run this in browser console after app loads completely

console.log('🧪 === BIDIRECTIONAL HEADER SCROLL TEST SUITE ===\n');

const bidirectionalTests = {
    results: [],
    testJobNumbers: [0, 3, 5, 8, 12, 15, 20], // Test various jobs
    
    log(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : type === 'warning' ? '⚠️' : '🔍';
        console.log(`${prefix} [${timestamp}] ${message}`);
        this.results.push({ timestamp, type, message });
    },
    
    async wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },
    
    // Test 1: System readiness for bidirectional sync
    async testSystemReadiness() {
        this.log('TEST 1: System Readiness Check', 'info');
        
        const checks = [
            { name: 'selectionManager', value: !!window.selectionManager },
            { name: 'resumeListController', value: !!window.resumeListController },
            { name: 'useCardsController functions', value: typeof window.debugSelectionSync === 'function' },
            { name: 'Resume divs in DOM', value: document.querySelectorAll('.biz-resume-div').length > 0 },
            { name: 'Card divs in DOM', value: document.querySelectorAll('.biz-card-div').length > 0 },
            { name: 'Test helper functions', value: typeof window.testRDivToCDivSync === 'function' }
        ];
        
        let allPassed = true;
        checks.forEach(check => {
            if (check.value) {
                this.log(`  ✓ ${check.name}: Ready`, 'success');
            } else {
                this.log(`  ✗ ${check.name}: Not ready`, 'error');
                allPassed = false;
            }
        });
        
        return allPassed;
    },
    
    // Test 2: Header element detection for both rDiv and cDiv
    async testHeaderElementDetection() {
        this.log('TEST 2: Header Element Detection', 'info');
        let detectionResults = { rDiv: 0, cDiv: 0 };
        
        for (const jobNumber of this.testJobNumbers) {
            // Test rDiv header detection
            const resumeDiv = document.querySelector(`[data-job-number="${jobNumber}"].biz-resume-div`);
            if (resumeDiv) {
                const rHeaderSelectors = ['.biz-resume-details-div', '.resume-header', '.job-title', '.company-name'];
                let rHeaderFound = false;
                for (const selector of rHeaderSelectors) {
                    if (resumeDiv.querySelector(selector)) {
                        rHeaderFound = true;
                        break;
                    }
                }
                if (rHeaderFound) detectionResults.rDiv++;
                this.log(`  Job ${jobNumber} rDiv header: ${rHeaderFound ? 'Found' : 'Missing'}`, rHeaderFound ? 'success' : 'warning');
            }
            
            // Test cDiv header detection
            const cardDiv = document.getElementById(`biz-card-div-${jobNumber}`);
            if (cardDiv) {
                const cHeaderSelectors = ['.biz-details-employer', '.biz-card-header', '.job-title', '.company-name', '.biz-details-role'];
                let cHeaderFound = false;
                for (const selector of cHeaderSelectors) {
                    if (cardDiv.querySelector(selector)) {
                        cHeaderFound = true;
                        break;
                    }
                }
                if (cHeaderFound) detectionResults.cDiv++;
                this.log(`  Job ${jobNumber} cDiv header: ${cHeaderFound ? 'Found' : 'Missing'}`, cHeaderFound ? 'success' : 'warning');
            }
        }
        
        this.log(`Header detection summary: rDiv ${detectionResults.rDiv}/${this.testJobNumbers.length}, cDiv ${detectionResults.cDiv}/${this.testJobNumbers.length}`, 'info');
        return detectionResults.rDiv > 0 && detectionResults.cDiv > 0;
    },
    
    // Test 3: rDiv selection → cDiv header scroll
    async testRDivToCDivHeaderScroll() {
        this.log('TEST 3: rDiv Selection → cDiv Header Scroll', 'info');
        
        // Capture console logs to verify header scroll calls
        const originalConsoleLog = console.log;
        let capturedLogs = [];
        console.log = (...args) => {
            const message = args.join(' ');
            capturedLogs.push(message);
            originalConsoleLog(...args);
        };
        
        let successCount = 0;
        
        for (const jobNumber of this.testJobNumbers.slice(0, 3)) { // Test first 3 jobs
            this.log(`  Testing rDiv → cDiv sync for job ${jobNumber}`, 'info');
            capturedLogs = []; // Reset for each test
            
            // Simulate rDiv selection
            if (window.selectionManager) {
                window.selectionManager.selectJobNumber(jobNumber, 'ResumeListController.handleBizResumeDivClickEvent');
                await this.wait(200); // Wait for async scroll
                
                // Check for expected log patterns
                const hasRDivToCDivLog = capturedLogs.some(log => 
                    log.includes('rDiv selected → scrolling cDiv header') ||
                    log.includes('SCROLL: Attempting to scroll cDiv HEADER into view')
                );
                
                if (hasRDivToCDivLog) {
                    successCount++;
                    this.log(`    ✓ Job ${jobNumber}: rDiv → cDiv header scroll triggered`, 'success');
                } else {
                    this.log(`    ✗ Job ${jobNumber}: No cDiv header scroll detected`, 'error');
                }
            }
        }
        
        console.log = originalConsoleLog; // Restore console
        
        const passed = successCount > 0;
        this.log(`rDiv → cDiv tests: ${successCount}/${this.testJobNumbers.slice(0, 3).length} passed`, passed ? 'success' : 'error');
        return passed;
    },
    
    // Test 4: cDiv selection → rDiv header scroll  
    async testCDivToRDivHeaderScroll() {
        this.log('TEST 4: cDiv Selection → rDiv Header Scroll', 'info');
        
        // Capture console logs to verify header scroll calls
        const originalConsoleLog = console.log;
        let capturedLogs = [];
        console.log = (...args) => {
            const message = args.join(' ');
            capturedLogs.push(message);
            originalConsoleLog(...args);
        };
        
        let successCount = 0;
        
        for (const jobNumber of this.testJobNumbers.slice(3, 6)) { // Test different jobs
            this.log(`  Testing cDiv → rDiv sync for job ${jobNumber}`, 'info');
            capturedLogs = []; // Reset for each test
            
            // Simulate cDiv selection
            if (window.selectionManager) {
                window.selectionManager.selectJobNumber(jobNumber, 'CardsController.cardClick');
                await this.wait(200); // Wait for async scroll
                
                // Check for expected log patterns
                const hasCDivToRDivLog = capturedLogs.some(log => 
                    log.includes('cDiv selected → scrolling rDiv header') ||
                    log.includes('SCROLL: Attempting to scroll rDiv HEADER into view')
                );
                
                if (hasCDivToRDivLog) {
                    successCount++;
                    this.log(`    ✓ Job ${jobNumber}: cDiv → rDiv header scroll triggered`, 'success');
                } else {
                    this.log(`    ✗ Job ${jobNumber}: No rDiv header scroll detected`, 'error');
                }
            }
        }
        
        console.log = originalConsoleLog; // Restore console
        
        const passed = successCount > 0;
        this.log(`cDiv → rDiv tests: ${successCount}/${this.testJobNumbers.slice(3, 6).length} passed`, passed ? 'success' : 'error');
        return passed;
    },
    
    // Test 5: Source parameter detection
    async testSourceParameterDetection() {
        this.log('TEST 5: Source Parameter Detection', 'info');
        
        const originalConsoleLog = console.log;
        let capturedLogs = [];
        console.log = (...args) => {
            const message = args.join(' ');
            capturedLogs.push(message);
            originalConsoleLog(...args);
        };
        
        let sourceTests = [];
        
        // Test ResumeListController source
        capturedLogs = [];
        if (window.selectionManager) {
            window.selectionManager.selectJobNumber(10, 'ResumeListController.handleBizResumeDivClickEvent');
            await this.wait(100);
            
            const hasResumeSource = capturedLogs.some(log => 
                log.includes('source: ResumeListController') ||
                log.includes('from source: ResumeListController')
            );
            sourceTests.push({ source: 'ResumeListController', detected: hasResumeSource });
        }
        
        // Test CardsController source  
        capturedLogs = [];
        if (window.selectionManager) {
            window.selectionManager.selectJobNumber(11, 'CardsController.cardClick');
            await this.wait(100);
            
            const hasCardsSource = capturedLogs.some(log => 
                log.includes('source: CardsController') ||
                log.includes('from source: CardsController')
            );
            sourceTests.push({ source: 'CardsController', detected: hasCardsSource });
        }
        
        console.log = originalConsoleLog; // Restore console
        
        sourceTests.forEach(test => {
            this.log(`  ${test.source} source detection: ${test.detected ? 'Working' : 'Failed'}`, 
                     test.detected ? 'success' : 'error');
        });
        
        return sourceTests.every(test => test.detected);
    },
    
    // Test 6: Manual click simulation
    async testManualClickSimulation() {
        this.log('TEST 6: Manual Click Simulation', 'info');
        
        // Find first available resume div and card div
        const resumeDiv = document.querySelector('.biz-resume-div[data-job-number]');
        const cardDiv = document.querySelector('.biz-card-div[data-job-number]');
        
        if (!resumeDiv || !cardDiv) {
            this.log('  No resume div or card div found for manual click test', 'error');
            return false;
        }
        
        const jobNumber = resumeDiv.getAttribute('data-job-number');
        
        const originalConsoleLog = console.log;
        let capturedLogs = [];
        console.log = (...args) => {
            const message = args.join(' ');
            capturedLogs.push(message);
            originalConsoleLog(...args);
        };
        
        // Test resume div click
        this.log(`  Simulating click on resume div for job ${jobNumber}`, 'info');
        resumeDiv.click();
        await this.wait(300);
        
        const resumeClickWorked = capturedLogs.some(log => 
            log.includes('🖱️ Resume div clicked!') ||
            log.includes('handleBizResumeDivClickEvent')
        );
        
        // Test card div click
        capturedLogs = [];
        this.log(`  Simulating click on card div for job ${jobNumber}`, 'info');
        cardDiv.click();
        await this.wait(300);
        
        const cardClickWorked = capturedLogs.some(log => 
            log.includes('🎯 cDiv clicked') ||
            log.includes('CardsController.cardClick')
        );
        
        console.log = originalConsoleLog; // Restore console
        
        this.log(`  Resume click detection: ${resumeClickWorked ? 'Working' : 'Failed'}`, 
                 resumeClickWorked ? 'success' : 'error');
        this.log(`  Card click detection: ${cardClickWorked ? 'Working' : 'Failed'}`, 
                 cardClickWorked ? 'success' : 'error');
        
        return resumeClickWorked && cardClickWorked;
    },
    
    // Run all tests
    async runAllTests() {
        console.log('🚀 Starting bidirectional header scroll test suite...\n');
        
        const testResults = {
            systemReadiness: await this.testSystemReadiness(),
            headerDetection: await this.testHeaderElementDetection(),
            rDivToCDiv: await this.testRDivToCDivHeaderScroll(),
            cDivToRDiv: await this.testCDivToRDivHeaderScroll(),
            sourceDetection: await this.testSourceParameterDetection(),
            manualClicks: await this.testManualClickSimulation()
        };
        
        console.log('\n📊 === BIDIRECTIONAL SYNC TEST RESULTS ===');
        Object.entries(testResults).forEach(([testName, passed]) => {
            this.log(`${testName}: ${passed ? 'PASSED ✅' : 'FAILED ❌'}`, passed ? 'success' : 'error');
        });
        
        const totalTests = Object.keys(testResults).length;
        const passedTests = Object.values(testResults).filter(Boolean).length;
        
        console.log(`\n🏁 Overall: ${passedTests}/${totalTests} tests passed`);
        
        if (passedTests === totalTests) {
            this.log('🎉 All bidirectional sync tests passed! The system is working correctly.', 'success');
        } else if (passedTests >= totalTests * 0.8) {
            this.log('🔶 Most bidirectional sync tests passed. Minor issues detected.', 'warning');
        } else {
            this.log('🚨 Multiple bidirectional sync tests failed. System needs investigation.', 'error');
        }
        
        // Summary of functionality
        console.log('\n📋 === FUNCTIONALITY SUMMARY ===');
        this.log('✅ rDiv selection should scroll cDiv header elements into view', 'info');
        this.log('✅ cDiv selection should scroll rDiv header elements into view', 'info'); 
        this.log('✅ Header elements targeted: .biz-details-employer, .biz-resume-details-div, etc.', 'info');
        this.log('✅ Source detection determines scroll direction automatically', 'info');
        this.log('✅ Smooth scrolling with block: "center" for optimal positioning', 'info');
        
        return testResults;
    }
};

// Auto-load the test functions
if (typeof window !== 'undefined') {
    window.runBidirectionalSyncTests = () => bidirectionalTests.runAllTests();
    window.testBidirectionalSync = bidirectionalTests; // Access individual tests
    console.log('🎯 Bidirectional sync test suite loaded!');
    console.log('📝 Usage: runBidirectionalSyncTests() or testBidirectionalSync.runAllTests()');
    console.log('🔍 Individual tests: testBidirectionalSync.testRDivToCDivHeaderScroll()');
}

export default bidirectionalTests;