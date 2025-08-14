// Automated test suite for rDiv to cDiv selection synchronization
// Run this in browser console after the app loads

console.log('🧪 === AUTOMATED RDIV TO CDIV SELECTION SYNC TEST SUITE ===\n');

const tests = {
    results: [],
    
    log(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : '🔍';
        console.log(`${prefix} [${timestamp}] ${message}`);
        this.results.push({ timestamp, type, message });
    },
    
    async wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },
    
    // Test 1: System availability
    async testSystemAvailability() {
        this.log('TEST 1: System Availability Check', 'info');
        
        const checks = [
            { name: 'window.debugSelectionSync', value: typeof window.debugSelectionSync === 'function' },
            { name: 'window.testRDivToCDivSync', value: typeof window.testRDivToCDivSync === 'function' },
            { name: 'window.testScrollCDiv', value: typeof window.testScrollCDiv === 'function' },
            { name: 'window.testResumeClick', value: typeof window.testResumeClick === 'function' },
            { name: 'window.resumeListController', value: !!window.resumeListController },
            { name: 'selectionManager available', value: !!window.selectionManager }
        ];
        
        let allPassed = true;
        checks.forEach(check => {
            if (check.value) {
                this.log(`  ✓ ${check.name}: Available`, 'success');
            } else {
                this.log(`  ✗ ${check.name}: Missing`, 'error');
                allPassed = false;
            }
        });
        
        return allPassed;
    },
    
    // Test 2: DOM elements availability
    async testDOMElements() {
        this.log('TEST 2: DOM Elements Check', 'info');
        
        const resumeDivs = document.querySelectorAll('.biz-resume-div');
        const cardDivs = document.querySelectorAll('.biz-card-div');
        const sceneContainer = document.getElementById('scene-container');
        const resumeContainer = document.getElementById('resume-container');
        
        this.log(`  Resume divs found: ${resumeDivs.length}`, resumeDivs.length > 0 ? 'success' : 'error');
        this.log(`  Card divs found: ${cardDivs.length}`, cardDivs.length > 0 ? 'success' : 'error');
        this.log(`  Scene container: ${sceneContainer ? 'Found' : 'Missing'}`, sceneContainer ? 'success' : 'error');
        this.log(`  Resume container: ${resumeContainer ? 'Found' : 'Missing'}`, resumeContainer ? 'success' : 'error');
        
        // Check first few resume divs for click handlers
        for (let i = 0; i < Math.min(3, resumeDivs.length); i++) {
            const div = resumeDivs[i];
            const jobNumber = div.getAttribute('data-job-number');
            this.log(`  Resume div ${i}: job-${jobNumber}, clickable: ${div.style.pointerEvents !== 'none'}`, 'info');
        }
        
        return resumeDivs.length > 0 && cardDivs.length > 0;
    },
    
    // Test 3: System status via debugSelectionSync
    async testSystemStatus() {
        this.log('TEST 3: System Status Check', 'info');
        
        if (typeof window.debugSelectionSync !== 'function') {
            this.log('  debugSelectionSync not available', 'error');
            return false;
        }
        
        const status = window.debugSelectionSync();
        this.log(`  Selection Manager: ${status.selectionManagerOk ? 'OK' : 'FAILED'}`, status.selectionManagerOk ? 'success' : 'error');
        this.log(`  Resume Controller: ${status.resumeControllerOk ? 'OK' : 'FAILED'}`, status.resumeControllerOk ? 'success' : 'error');
        this.log(`  Resume Divs: ${status.resumeDivCount}`, status.resumeDivCount > 0 ? 'success' : 'error');
        this.log(`  Card Divs: ${status.cardDivCount}`, status.cardDivCount > 0 ? 'success' : 'error');
        
        return status.selectionManagerOk && status.resumeControllerOk && status.resumeDivCount > 0;
    },
    
    // Test 4: Direct resume click simulation
    async testResumeClickSimulation() {
        this.log('TEST 4: Resume Click Simulation', 'info');
        
        if (typeof window.testResumeClick !== 'function') {
            this.log('  testResumeClick not available', 'error');
            return false;
        }
        
        this.log('  Testing resume click for job 5...');
        
        // Capture console output by monitoring for specific log patterns
        const originalConsoleLog = console.log;
        let capturedLogs = [];
        console.log = (...args) => {
            const message = args.join(' ');
            capturedLogs.push(message);
            originalConsoleLog(...args);
        };
        
        try {
            window.testResumeClick(5);
            await this.wait(500); // Wait for async operations
            
            // Check for expected log patterns
            const hasResumeClick = capturedLogs.some(log => log.includes('🖱️ Resume div clicked!'));
            const hasSelection = capturedLogs.some(log => log.includes('🚀 Dispatching job-selected event'));
            const hasHandlerCall = capturedLogs.some(log => log.includes('🎯 handleJobSelected CALLED!'));
            const hasScrollAttempt = capturedLogs.some(log => log.includes('🎯 SCROLL: Attempting to scroll'));
            
            this.log(`  Resume click detected: ${hasResumeClick}`, hasResumeClick ? 'success' : 'error');
            this.log(`  Selection event dispatched: ${hasSelection}`, hasSelection ? 'success' : 'error');
            this.log(`  Handler called: ${hasHandlerCall}`, hasHandlerCall ? 'success' : 'error');
            this.log(`  Scroll attempted: ${hasScrollAttempt}`, hasScrollAttempt ? 'success' : 'error');
            
            console.log = originalConsoleLog;
            return hasResumeClick && hasSelection && hasHandlerCall;
            
        } catch (error) {
            console.log = originalConsoleLog;
            this.log(`  Error during resume click test: ${error.message}`, 'error');
            return false;
        }
    },
    
    // Test 5: Direct selection manager test
    async testDirectSelection() {
        this.log('TEST 5: Direct Selection Manager Test', 'info');
        
        if (!window.selectionManager) {
            this.log('  Selection manager not available', 'error');
            return false;
        }
        
        try {
            this.log('  Testing direct selection of job 7...');
            
            const originalConsoleLog = console.log;
            let capturedLogs = [];
            console.log = (...args) => {
                const message = args.join(' ');
                capturedLogs.push(message);
                originalConsoleLog(...args);
            };
            
            window.selectionManager.selectJobNumber(7, 'manual-test');
            await this.wait(500);
            
            const hasDispatch = capturedLogs.some(log => log.includes('🚀 Dispatching job-selected event'));
            const hasHandlerCall = capturedLogs.some(log => log.includes('🎯 handleJobSelected CALLED!'));
            
            this.log(`  Event dispatched: ${hasDispatch}`, hasDispatch ? 'success' : 'error');
            this.log(`  Handler received: ${hasHandlerCall}`, hasHandlerCall ? 'success' : 'error');
            
            console.log = originalConsoleLog;
            return hasDispatch;
            
        } catch (error) {
            this.log(`  Error during direct selection test: ${error.message}`, 'error');
            return false;
        }
    },
    
    // Test 6: Direct scroll test
    async testDirectScroll() {
        this.log('TEST 6: Direct Scroll Test', 'info');
        
        if (typeof window.testScrollCDiv !== 'function') {
            this.log('  testScrollCDiv not available', 'error');
            return false;
        }
        
        try {
            this.log('  Testing direct scroll for job 3...');
            
            const originalConsoleLog = console.log;
            let capturedLogs = [];
            console.log = (...args) => {
                const message = args.join(' ');
                capturedLogs.push(message);
                originalConsoleLog(...args);
            };
            
            window.testScrollCDiv(3);
            await this.wait(300);
            
            const hasScrollAttempt = capturedLogs.some(log => log.includes('🎯 SCROLL: Attempting to scroll'));
            const hasCardFound = capturedLogs.some(log => log.includes('SCROLL: Card found') || log.includes('Card not found'));
            
            this.log(`  Scroll attempt: ${hasScrollAttempt}`, hasScrollAttempt ? 'success' : 'error');
            this.log(`  Card lookup: ${hasCardFound}`, hasCardFound ? 'success' : 'error');
            
            console.log = originalConsoleLog;
            return hasScrollAttempt;
            
        } catch (error) {
            this.log(`  Error during direct scroll test: ${error.message}`, 'error');
            return false;
        }
    },
    
    // Run all tests
    async runAllTests() {
        console.log('🚀 Starting comprehensive test suite...\n');
        
        const testResults = {
            systemAvailability: await this.testSystemAvailability(),
            domElements: await this.testDOMElements(),
            systemStatus: await this.testSystemStatus(),
            resumeClickSimulation: await this.testResumeClickSimulation(),
            directSelection: await this.testDirectSelection(),
            directScroll: await this.testDirectScroll()
        };
        
        console.log('\n📊 === TEST RESULTS SUMMARY ===');
        Object.entries(testResults).forEach(([testName, passed]) => {
            this.log(`${testName}: ${passed ? 'PASSED' : 'FAILED'}`, passed ? 'success' : 'error');
        });
        
        const totalTests = Object.keys(testResults).length;
        const passedTests = Object.values(testResults).filter(Boolean).length;
        
        console.log(`\n🏁 Overall: ${passedTests}/${totalTests} tests passed`);
        
        if (passedTests === totalTests) {
            this.log('All tests passed! The system should work correctly.', 'success');
        } else {
            this.log('Some tests failed. Check the detailed logs above to identify issues.', 'error');
        }
        
        return testResults;
    }
};

// Auto-run tests if this script is executed directly
if (typeof window !== 'undefined') {
    window.runSelectionSyncTests = () => tests.runAllTests();
    console.log('🎯 Test suite loaded! Run: runSelectionSyncTests()');
}

export default tests;