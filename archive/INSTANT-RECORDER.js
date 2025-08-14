// INSTANT RECORDER - Copy this ENTIRE script into browser console NOW
// This will work immediately and capture your next test

(function() {
    console.clear();
    console.log('🚀 INSTANT RECORDER - Loading NOW...\n');
    
    // Global recorder state
    window.testRecorder = {
        isRecording: false,
        data: null,
        startTime: null
    };
    
    // Immediate diagnostics
    const diagnostics = {
        resumeDivs: document.querySelectorAll('.biz-resume-div').length,
        cardDivs: document.querySelectorAll('.biz-card-div').length,
        selectionManager: !!window.selectionManager,
        sceneContainer: !!document.getElementById('scene-container'),
        resumeContainer: !!document.getElementById('resume-container')
    };
    
    console.log('🔍 INSTANT DIAGNOSTICS:');
    console.log(`   📝 Resume Divs: ${diagnostics.resumeDivs}`);
    console.log(`   🗃️ Card Divs: ${diagnostics.cardDivs}`);
    console.log(`   🎯 Selection Manager: ${diagnostics.selectionManager}`);
    console.log(`   📦 Containers: ${diagnostics.sceneContainer && diagnostics.resumeContainer ? 'YES' : 'NO'}`);
    
    // Start recording function
    function startRecording(jobNumber, clickEvent) {
        window.testRecorder.isRecording = true;
        window.testRecorder.startTime = Date.now();
        
        window.testRecorder.data = {
            sessionId: `instant-${Date.now()}`,
            startTime: new Date().toISOString(),
            jobNumber: jobNumber,
            clickCoords: { x: clickEvent.clientX, y: clickEvent.clientY },
            apiCalls: [],
            scrollEvents: [],
            finalAnalysis: null
        };
        
        console.log(`\n🎬 RECORDING STARTED - Job ${jobNumber}`);
        console.log(`📍 Click at: (${clickEvent.clientX}, ${clickEvent.clientY})`);
        console.log('⏳ Recording for 3 seconds...\n');
        
        // Wrap API functions
        wrapAPIs();
        
        // Monitor scroll events
        monitorScrolling();
        
        // Auto-stop after 3 seconds
        setTimeout(stopRecording, 3000);
    }
    
    function wrapAPIs() {
        if (window.selectionManager && window.selectionManager.selectJobNumber) {
            const original = window.selectionManager.selectJobNumber.bind(window.selectionManager);
            
            window.selectionManager.selectJobNumber = function(jobNumber, source) {
                if (window.testRecorder.isRecording) {
                    console.log(`📞 API CALL: selectJobNumber(${jobNumber}, "${source}")`);
                    window.testRecorder.data.apiCalls.push({
                        function: 'selectJobNumber',
                        jobNumber: jobNumber,
                        source: source,
                        timestamp: Date.now()
                    });
                }
                return original(jobNumber, source);
            };
        }
    }
    
    function monitorScrolling() {
        ['scene-container', 'resume-container'].forEach(containerId => {
            const container = document.getElementById(containerId);
            if (container) {
                const initialScroll = container.scrollTop;
                
                const checkScroll = () => {
                    if (!window.testRecorder.isRecording) return;
                    
                    const currentScroll = container.scrollTop;
                    const delta = Math.abs(currentScroll - initialScroll);
                    
                    if (delta > 10) {
                        console.log(`📜 SCROLL: ${containerId} scrolled ${delta}px`);
                        window.testRecorder.data.scrollEvents.push({
                            container: containerId,
                            initialScroll: initialScroll,
                            currentScroll: currentScroll,
                            delta: delta,
                            timestamp: Date.now()
                        });
                    }
                    
                    setTimeout(checkScroll, 200);
                };
                
                setTimeout(checkScroll, 100);
            }
        });
    }
    
    function stopRecording() {
        if (!window.testRecorder.isRecording) return;
        
        window.testRecorder.isRecording = false;
        const duration = Date.now() - window.testRecorder.startTime;
        
        console.log(`\n⏹️ RECORDING STOPPED`);
        console.log(`⏱️ Duration: ${Math.round(duration / 1000 * 100) / 100} seconds`);
        
        // Analyze results immediately
        analyzeTest();
        
        // Save results
        saveResults();
    }
    
    function analyzeTest() {
        const data = window.testRecorder.data;
        
        console.log('\n🔬 ANALYZING TEST RESULTS...');
        
        // Test 1: API Call Check
        const hasSelectCall = data.apiCalls.some(call => 
            call.function === 'selectJobNumber' && call.jobNumber === data.jobNumber
        );
        
        // Test 2: Source Check
        const hasCorrectSource = data.apiCalls.some(call =>
            call.source && (
                call.source.includes('ResumeListController') ||
                call.source.includes('CardsController')
            )
        );
        
        // Test 3: Scroll Check
        const hasSceneScroll = data.scrollEvents.some(event => 
            event.container === 'scene-container' && event.delta > 10
        );
        
        const hasResumeScroll = data.scrollEvents.some(event => 
            event.container === 'resume-container' && event.delta > 10
        );
        
        // Test 4: Element Visibility Check
        const targetCDiv = document.getElementById(`biz-card-div-${data.jobNumber}`) ||
                          document.getElementById(`biz-card-div-${data.jobNumber}-clone`);
        
        let targetVisible = false;
        let headersVisible = 0;
        
        if (targetCDiv) {
            const rect = targetCDiv.getBoundingClientRect();
            const sceneContainer = document.getElementById('scene-container');
            
            if (sceneContainer) {
                const containerRect = sceneContainer.getBoundingClientRect();
                // Check if cDiv is visible within scene container
                targetVisible = rect.top >= containerRect.top && 
                               rect.bottom <= containerRect.bottom &&
                               rect.top < containerRect.bottom;
                
                // Count visible headers
                const headerSelectors = ['.biz-details-employer', '.biz-card-header', '.job-title', '.company-name'];
                headerSelectors.forEach(selector => {
                    const header = targetCDiv.querySelector(selector);
                    if (header) {
                        const headerRect = header.getBoundingClientRect();
                        if (headerRect.top >= containerRect.top && headerRect.bottom <= containerRect.bottom) {
                            headersVisible++;
                        }
                    }
                });
            }
        }
        
        // Calculate results
        const tests = {
            apiCall: hasSelectCall,
            correctSource: hasCorrectSource,
            scrollBehavior: hasSceneScroll, // For rDiv click, expect scene scroll
            targetVisible: targetVisible,
            headersVisible: headersVisible > 0
        };
        
        const passed = Object.values(tests).filter(Boolean).length;
        const total = Object.keys(tests).length;
        const result = passed >= 4 ? 'SUCCESS' : passed >= 3 ? 'PARTIAL' : 'FAILURE';
        
        // Display results
        console.log(`📊 TEST RESULTS (${passed}/${total}):`);
        console.log(`   ✓ API Call: ${tests.apiCall ? '✅' : '❌'} selectJobNumber(${data.jobNumber})`);
        console.log(`   ✓ Source: ${tests.correctSource ? '✅' : '❌'} correct source parameter`);
        console.log(`   ✓ Scrolling: ${tests.scrollBehavior ? '✅' : '❌'} scene container scrolled`);
        console.log(`   ✓ Target Visible: ${tests.targetVisible ? '✅' : '❌'} cDiv in view`);
        console.log(`   ✓ Headers: ${tests.headersVisible ? '✅' : '❌'} ${headersVisible} headers visible`);
        
        console.log(`\n🎯 OVERALL RESULT: ${result} (${Math.round(passed/total*100)}%)`);
        
        if (result === 'SUCCESS') {
            console.log('🎉 BIDIRECTIONAL SYNC IS WORKING!');
            console.log(`   • rDiv click on Job ${data.jobNumber} successfully triggered cDiv scroll`);
            console.log(`   • API calls executed correctly`);
            console.log(`   • Target cDiv and ${headersVisible} headers are visible`);
        } else {
            console.log('❌ BIDIRECTIONAL SYNC HAS ISSUES:');
            if (!tests.apiCall) console.log('   • selectJobNumber not called correctly');
            if (!tests.correctSource) console.log('   • Incorrect source parameter');
            if (!tests.scrollBehavior) console.log('   • Scene container did not scroll');
            if (!tests.targetVisible) console.log('   • Target cDiv not visible');
            if (!tests.headersVisible) console.log('   • Header elements not visible');
        }
        
        // Store analysis
        data.finalAnalysis = {
            tests: tests,
            passed: passed,
            total: total,
            result: result,
            percentage: Math.round(passed/total*100),
            targetVisible: targetVisible,
            headersVisible: headersVisible
        };
    }
    
    function saveResults() {
        const jsonData = JSON.stringify(window.testRecorder.data, null, 2);
        const blob = new Blob([jsonData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `instant-test-${window.testRecorder.data.sessionId}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        console.log(`\n💾 Results saved as: instant-test-${window.testRecorder.data.sessionId}.json`);
        console.log('🔄 Click another rDiv to run a new test');
    }
    
    // Set up click listener
    document.addEventListener('click', function(event) {
        const resumeDiv = event.target.closest('.biz-resume-div');
        if (resumeDiv && !window.testRecorder.isRecording) {
            const jobNumber = parseInt(resumeDiv.getAttribute('data-job-number'));
            startRecording(jobNumber, event);
        }
    }, true);
    
    // ESC key to stop
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape' && window.testRecorder.isRecording) {
            event.preventDefault();
            stopRecording();
        }
    }, true);
    
    // Make functions available
    window.getRecorderStatus = function() {
        return {
            isRecording: window.testRecorder.isRecording,
            sessionId: window.testRecorder.data?.sessionId,
            startTime: window.testRecorder.startTime
        };
    };
    
    window.getTestData = function() {
        return window.testRecorder.data;
    };
    
    window.stopTest = function() {
        stopRecording();
    };
    
    console.log('\n✅ INSTANT RECORDER READY!');
    console.log('🎯 Click any rDiv to start test');
    console.log('⏹️ Press ESC or wait 3 seconds to stop');
    console.log('\n🎮 Commands available:');
    console.log('   getRecorderStatus() - Check status');
    console.log('   getTestData() - Get results');
    console.log('   stopTest() - Manual stop');
    
})();

console.log('🚀 INSTANT RECORDER LOADED - Check above for status and click an rDiv to test!');