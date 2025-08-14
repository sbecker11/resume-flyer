// SIMPLE TEST RECORDER - Robust version with better error handling
// Copy this entire script into browser console after app loads

(function() {
    console.clear();
    console.log('🔧 SIMPLE TEST RECORDER - Debugging Version');
    
    // Global state
    let isRecording = false;
    let recordingData = null;
    let startTime = null;
    
    // Test basic functionality first
    console.log('🔍 DIAGNOSTIC CHECK:');
    console.log('   Resume divs:', document.querySelectorAll('.biz-resume-div').length);
    console.log('   Card divs:', document.querySelectorAll('.biz-card-div').length);
    console.log('   Selection manager:', !!window.selectionManager);
    console.log('   DOM ready:', document.readyState);
    
    function startRecording(jobNumber, clickEvent) {
        isRecording = true;
        startTime = Date.now();
        
        recordingData = {
            sessionId: `simple-test-${Date.now()}`,
            startTime: new Date().toISOString(),
            triggeredByJob: jobNumber,
            clickDetails: captureClick(clickEvent),
            events: [],
            apiCalls: [],
            finalState: null
        };
        
        console.log(`\n🎯 RECORDING STARTED - Job ${jobNumber}`);
        console.log(`📍 Click at: (${clickEvent.clientX}, ${clickEvent.clientY})`);
        console.log('⏳ Recording for 5 seconds or until ESC pressed...\n');
        
        // Wrap API calls
        wrapAPICalls();
        
        // Auto-stop after 5 seconds if ESC not pressed
        setTimeout(() => {
            if (isRecording) {
                console.log('⏰ Auto-stopping after 5 seconds...');
                stopRecording();
            }
        }, 5000);
    }
    
    function captureClick(event) {
        const resumeDiv = event.target.closest('.biz-resume-div');
        const rect = resumeDiv ? resumeDiv.getBoundingClientRect() : null;
        
        return {
            coordinates: { x: event.clientX, y: event.clientY },
            target: {
                tagName: event.target.tagName,
                className: event.target.className,
                id: event.target.id,
                textContent: event.target.textContent?.substring(0, 50)
            },
            resumeDiv: resumeDiv ? {
                id: resumeDiv.id,
                jobNumber: resumeDiv.getAttribute('data-job-number'),
                rect: rect
            } : null
        };
    }
    
    function wrapAPICalls() {
        if (!window.selectionManager) {
            console.log('⚠️ No selectionManager found - API calls will not be captured');
            return;
        }
        
        // Store original functions
        const originalSelect = window.selectionManager.selectJobNumber;
        const originalClear = window.selectionManager.clearSelection;
        
        if (originalSelect) {
            window.selectionManager.selectJobNumber = function(jobNumber, source) {
                if (isRecording) {
                    console.log(`📞 API CALL: selectJobNumber(${jobNumber}, "${source}")`);
                    recordingData.apiCalls.push({
                        function: 'selectJobNumber',
                        timestamp: Date.now(),
                        timeFromStart: Date.now() - startTime,
                        jobNumber: jobNumber,
                        source: source
                    });
                }
                return originalSelect.call(this, jobNumber, source);
            };
        }
        
        if (originalClear) {
            window.selectionManager.clearSelection = function(source) {
                if (isRecording) {
                    console.log(`📞 API CALL: clearSelection("${source}")`);
                    recordingData.apiCalls.push({
                        function: 'clearSelection',
                        timestamp: Date.now(),
                        timeFromStart: Date.now() - startTime,
                        source: source
                    });
                }
                return originalClear.call(this, source);
            };
        }
    }
    
    function stopRecording() {
        if (!isRecording) {
            console.log('⚠️ No recording in progress');
            return;
        }
        
        isRecording = false;
        
        // Capture final state
        recordingData.finalState = {
            timestamp: Date.now(),
            duration: Date.now() - startTime,
            scrollPositions: captureScrollPositions(),
            visibleElements: captureVisibleElements()
        };
        
        console.log(`\n⏹️ RECORDING STOPPED`);
        console.log(`⏱️ Duration: ${Math.round(recordingData.finalState.duration / 1000 * 100) / 100} seconds`);
        console.log(`📞 API calls captured: ${recordingData.apiCalls.length}`);
        
        // Analyze results
        analyzeResults();
        
        // Save results
        saveResults();
    }
    
    function captureScrollPositions() {
        const sceneContainer = document.getElementById('scene-container');
        const resumeContainer = document.getElementById('resume-container');
        
        return {
            sceneContainer: sceneContainer ? {
                scrollTop: sceneContainer.scrollTop,
                scrollLeft: sceneContainer.scrollLeft
            } : null,
            resumeContainer: resumeContainer ? {
                scrollTop: resumeContainer.scrollTop,
                scrollLeft: resumeContainer.scrollLeft
            } : null,
            window: {
                scrollX: window.scrollX,
                scrollY: window.scrollY
            }
        };
    }
    
    function captureVisibleElements() {
        const targetJob = recordingData.triggeredByJob;
        
        // Find target cDiv
        const targetCDiv = document.getElementById(`biz-card-div-${targetJob}`) || 
                          document.getElementById(`biz-card-div-${targetJob}-clone`);
        
        if (!targetCDiv) {
            return { targetCDiv: null, error: 'Target cDiv not found' };
        }
        
        const rect = targetCDiv.getBoundingClientRect();
        const sceneContainer = document.getElementById('scene-container');
        const containerRect = sceneContainer ? sceneContainer.getBoundingClientRect() : null;
        
        // Check if cDiv is visible in scene container
        let isVisible = false;
        let visibilityPercentage = 0;
        
        if (containerRect) {
            const visibleTop = Math.max(rect.top, containerRect.top);
            const visibleBottom = Math.min(rect.bottom, containerRect.bottom);
            const visibleHeight = Math.max(0, visibleBottom - visibleTop);
            visibilityPercentage = Math.round((visibleHeight / rect.height) * 100);
            isVisible = visibilityPercentage > 50;
        }
        
        // Find headers
        const headers = [];
        const headerSelectors = ['.biz-details-employer', '.biz-card-header', '.job-title', '.company-name'];
        
        headerSelectors.forEach(selector => {
            const header = targetCDiv.querySelector(selector);
            if (header) {
                const headerRect = header.getBoundingClientRect();
                let headerVisible = false;
                let headerVisibilityPercentage = 0;
                
                if (containerRect) {
                    const headerVisibleTop = Math.max(headerRect.top, containerRect.top);
                    const headerVisibleBottom = Math.min(headerRect.bottom, containerRect.bottom);
                    const headerVisibleHeight = Math.max(0, headerVisibleBottom - headerVisibleTop);
                    headerVisibilityPercentage = Math.round((headerVisibleHeight / headerRect.height) * 100);
                    headerVisible = headerVisibilityPercentage > 50;
                }
                
                headers.push({
                    selector: selector,
                    text: header.textContent?.substring(0, 30),
                    visible: headerVisible,
                    visibilityPercentage: headerVisibilityPercentage
                });
            }
        });
        
        return {
            targetCDiv: {
                id: targetCDiv.id,
                jobNumber: targetJob,
                visible: isVisible,
                visibilityPercentage: visibilityPercentage,
                rect: rect,
                headers: headers
            }
        };
    }
    
    function analyzeResults() {
        console.log('\n🔬 ANALYZING RESULTS...');
        
        const analysis = {
            triggerTest: true, // Always pass since we got here
            apiTest: recordingData.apiCalls.some(call => 
                call.function === 'selectJobNumber' && 
                call.jobNumber === recordingData.triggeredByJob
            ),
            sourceTest: recordingData.apiCalls.some(call =>
                call.function === 'selectJobNumber' && 
                call.source?.includes('ResumeListController')
            ),
            visibilityTest: false,
            headerTest: false
        };
        
        const targetCDiv = recordingData.finalState.visibleElements.targetCDiv;
        if (targetCDiv) {
            analysis.visibilityTest = targetCDiv.visible;
            analysis.headerTest = targetCDiv.headers.some(h => h.visible);
        }
        
        const passedTests = Object.values(analysis).filter(Boolean).length;
        const totalTests = Object.keys(analysis).length;
        
        console.log(`📊 TEST RESULTS (${passedTests}/${totalTests}):`);
        console.log(`   ✓ Trigger: ${analysis.triggerTest ? '✅' : '❌'} rDiv click detected`);
        console.log(`   ✓ API Call: ${analysis.apiTest ? '✅' : '❌'} selectJobNumber called`);
        console.log(`   ✓ Source: ${analysis.sourceTest ? '✅' : '❌'} correct source parameter`);
        console.log(`   ✓ Visibility: ${analysis.visibilityTest ? '✅' : '❌'} target cDiv visible`);
        console.log(`   ✓ Headers: ${analysis.headerTest ? '✅' : '❌'} header elements visible`);
        
        if (targetCDiv) {
            console.log(`\n📍 Target cDiv Details:`);
            console.log(`   • Job: ${targetCDiv.jobNumber}`);
            console.log(`   • Visibility: ${targetCDiv.visibilityPercentage}%`);
            console.log(`   • Headers visible: ${targetCDiv.headers.filter(h => h.visible).length}/${targetCDiv.headers.length}`);
        }
        
        const overallResult = passedTests >= totalTests * 0.8 ? 'SUCCESS' : 
                             passedTests >= totalTests * 0.6 ? 'PARTIAL' : 'FAILURE';
        
        console.log(`\n🎯 OVERALL RESULT: ${overallResult}`);
        
        recordingData.analysis = {
            tests: analysis,
            passedTests: passedTests,
            totalTests: totalTests,
            overallResult: overallResult
        };
    }
    
    function saveResults() {
        // Save to local file
        const jsonData = JSON.stringify(recordingData, null, 2);
        const blob = new Blob([jsonData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `simple-test-${recordingData.sessionId}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        console.log(`💾 Results saved as: simple-test-${recordingData.sessionId}.json`);
        console.log('🔄 Ready for next test - click another rDiv to start new recording');
    }
    
    // Set up event listeners with better error handling
    try {
        // Click listener for rDiv
        document.addEventListener('click', function(event) {
            try {
                const resumeDiv = event.target.closest('.biz-resume-div');
                if (resumeDiv && !isRecording) {
                    const jobNumber = parseInt(resumeDiv.getAttribute('data-job-number'));
                    console.log(`🖱️ rDiv click detected on Job ${jobNumber}`);
                    startRecording(jobNumber, event);
                }
            } catch (error) {
                console.error('Click handler error:', error);
            }
        }, true);
        
        // ESC key listener
        document.addEventListener('keydown', function(event) {
            try {
                if (event.key === 'Escape' && isRecording) {
                    event.preventDefault();
                    console.log('⌨️ ESC key pressed - stopping recording');
                    stopRecording();
                }
            } catch (error) {
                console.error('Keydown handler error:', error);
            }
        }, true);
        
        console.log('\n✅ Simple Test Recorder loaded successfully!');
        console.log('🎯 Click any rDiv to start recording');
        console.log('⏹️ Press ESC to stop recording');
        
        // Make functions global for manual control
        window.getSimpleRecordingData = () => recordingData;
        window.stopSimpleRecording = () => stopRecording();
        window.getSimpleRecordingStatus = () => ({
            isRecording: isRecording,
            startTime: startTime,
            duration: startTime ? Date.now() - startTime : 0
        });
        
    } catch (error) {
        console.error('❌ Failed to set up event listeners:', error);
        console.log('🔧 Manual functions available:');
        console.log('   getSimpleRecordingData() - Get current data');
        console.log('   stopSimpleRecording() - Manual stop');
        console.log('   getSimpleRecordingStatus() - Check status');
    }
    
})();