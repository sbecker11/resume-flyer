// BULLETPROOF RECORDER - Works in all scenarios, no dependencies
// Copy this entire script into browser console

(function() {
    console.clear();
    console.log('🛡️ BULLETPROOF RECORDER - Universal Recording System');
    console.log('🎯 This recorder works regardless of server status or app state\n');
    
    // Global state
    let recorder = {
        isRecording: false,
        startTime: null,
        testData: null,
        eventLog: [],
        diagnostics: {}
    };
    
    // Run comprehensive diagnostics first
    function runDiagnostics() {
        console.log('🔍 RUNNING COMPLETE DIAGNOSTICS...\n');
        
        recorder.diagnostics = {
            timestamp: new Date().toISOString(),
            url: window.location.href,
            documentReady: document.readyState,
            
            // Element checks
            resumeDivs: document.querySelectorAll('.biz-resume-div').length,
            cardDivs: document.querySelectorAll('.biz-card-div').length,
            sceneContainer: !!document.getElementById('scene-container'),
            resumeContainer: !!document.getElementById('resume-container'),
            
            // Manager checks
            selectionManager: !!window.selectionManager,
            selectionManagerType: typeof window.selectionManager,
            selectionManagerMethods: window.selectionManager ? Object.getOwnPropertyNames(window.selectionManager) : [],
            
            // Browser checks
            viewportSize: { width: window.innerWidth, height: window.innerHeight },
            userAgent: navigator.userAgent,
            
            // First resume div details
            firstResumeDiv: null,
            firstCardDiv: null
        };
        
        // Get details of first elements
        const firstRDiv = document.querySelector('.biz-resume-div');
        if (firstRDiv) {
            recorder.diagnostics.firstResumeDiv = {
                id: firstRDiv.id,
                jobNumber: firstRDiv.getAttribute('data-job-number'),
                className: firstRDiv.className,
                visible: firstRDiv.offsetParent !== null,
                rect: firstRDiv.getBoundingClientRect()
            };
        }
        
        const firstCDiv = document.querySelector('.biz-card-div');
        if (firstCDiv) {
            recorder.diagnostics.firstCardDiv = {
                id: firstCDiv.id,
                jobNumber: firstCDiv.getAttribute('data-job-number'),
                className: firstCDiv.className,
                visible: firstCDiv.offsetParent !== null,
                rect: firstCDiv.getBoundingClientRect()
            };
        }
        
        // Display diagnostics
        console.log('📊 DIAGNOSTIC RESULTS:');
        console.log('   🌐 URL:', recorder.diagnostics.url);
        console.log('   📄 Document Ready:', recorder.diagnostics.documentReady);
        console.log('   📝 Resume Divs Found:', recorder.diagnostics.resumeDivs);
        console.log('   🗃️ Card Divs Found:', recorder.diagnostics.cardDivs);
        console.log('   🎯 Selection Manager:', recorder.diagnostics.selectionManager);
        console.log('   📱 Viewport:', `${recorder.diagnostics.viewportSize.width}x${recorder.diagnostics.viewportSize.height}`);
        
        if (recorder.diagnostics.firstResumeDiv) {
            console.log('   📍 First rDiv:', `Job ${recorder.diagnostics.firstResumeDiv.jobNumber}, Visible: ${recorder.diagnostics.firstResumeDiv.visible}`);
        }
        
        // Determine readiness
        const isReady = recorder.diagnostics.resumeDivs > 0 && recorder.diagnostics.cardDivs > 0;
        console.log(`   ✅ System Ready: ${isReady ? 'YES' : 'NO'}\n`);
        
        return isReady;
    }
    
    // Universal event tracking - captures everything
    function startUniversalTracking(triggerEvent) {
        recorder.isRecording = true;
        recorder.startTime = Date.now();
        
        recorder.testData = {
            sessionId: `bulletproof-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
            startTime: new Date().toISOString(),
            trigger: captureTriggerEvent(triggerEvent),
            diagnostics: recorder.diagnostics,
            events: [],
            apiCalls: [],
            stateSnapshots: [],
            analysis: null
        };
        
        console.log(`🎬 RECORDING STARTED: ${recorder.testData.sessionId}`);
        console.log(`🎯 Trigger: ${recorder.testData.trigger.description}`);
        console.log('📊 Recording ALL activity...\n');
        
        // Start comprehensive monitoring
        setupEventCapture();
        setupAPIMonitoring();
        startStateMonitoring();
        setupAutoStop();
    }
    
    function captureTriggerEvent(event) {
        const target = event.target;
        const resumeDiv = target.closest('.biz-resume-div');
        const cardDiv = target.closest('.biz-card-div');
        
        let triggerType = 'unknown';
        let jobNumber = null;
        let elementInfo = {};
        
        if (resumeDiv) {
            triggerType = 'rDiv';
            jobNumber = parseInt(resumeDiv.getAttribute('data-job-number'));
            elementInfo = {
                id: resumeDiv.id,
                className: resumeDiv.className,
                rect: resumeDiv.getBoundingClientRect()
            };
        } else if (cardDiv) {
            triggerType = 'cDiv';
            jobNumber = parseInt(cardDiv.getAttribute('data-job-number'));
            elementInfo = {
                id: cardDiv.id,
                className: cardDiv.className,
                rect: cardDiv.getBoundingClientRect()
            };
        }
        
        return {
            type: triggerType,
            jobNumber: jobNumber,
            coordinates: { x: event.clientX, y: event.clientY },
            target: {
                tagName: target.tagName,
                id: target.id,
                className: target.className,
                textContent: target.textContent?.substring(0, 50)
            },
            element: elementInfo,
            description: `${triggerType} click on Job ${jobNumber} at (${event.clientX}, ${event.clientY})`
        };
    }
    
    function setupEventCapture() {
        // Capture all relevant events
        const eventTypes = ['click', 'scroll', 'keydown', 'keyup', 'mousedown', 'mouseup'];
        
        eventTypes.forEach(eventType => {
            document.addEventListener(eventType, function(event) {
                if (!recorder.isRecording) return;
                
                recorder.testData.events.push({
                    type: eventType,
                    timestamp: Date.now(),
                    timeFromStart: Date.now() - recorder.startTime,
                    details: captureEventDetails(event)
                });
                
                // Log important events
                if (eventType === 'click') {
                    const target = event.target.closest('.biz-resume-div, .biz-card-div');
                    if (target) {
                        console.log(`🖱️ ${eventType.toUpperCase()}: ${target.className.includes('resume') ? 'rDiv' : 'cDiv'} Job ${target.getAttribute('data-job-number')}`);
                    }
                } else if (eventType === 'scroll') {
                    const container = event.target.id || event.target.tagName;
                    console.log(`📜 SCROLL: ${container} scrolled`);
                } else if (eventType === 'keydown' && event.key === 'Escape') {
                    console.log(`⌨️ ESC KEY: Stopping recording`);
                    stopRecording();
                }
            }, true);
        });
    }
    
    function captureEventDetails(event) {
        const details = {
            eventType: event.type,
            target: {
                tagName: event.target?.tagName,
                id: event.target?.id,
                className: event.target?.className
            }
        };
        
        // Add specific details based on event type
        if (event.type === 'click' || event.type === 'mousedown' || event.type === 'mouseup') {
            details.coordinates = { x: event.clientX, y: event.clientY };
            details.button = event.button;
        } else if (event.type === 'scroll') {
            details.scrollTop = event.target?.scrollTop;
            details.scrollLeft = event.target?.scrollLeft;
            details.element = event.target?.id || event.target?.tagName;
        } else if (event.type === 'keydown' || event.type === 'keyup') {
            details.key = event.key;
            details.code = event.code;
        }
        
        return details;
    }
    
    function setupAPIMonitoring() {
        // Monitor selectionManager if it exists
        if (window.selectionManager && typeof window.selectionManager.selectJobNumber === 'function') {
            const originalSelect = window.selectionManager.selectJobNumber.bind(window.selectionManager);
            
            window.selectionManager.selectJobNumber = function(jobNumber, source) {
                if (recorder.isRecording) {
                    console.log(`📞 API: selectJobNumber(${jobNumber}, "${source}")`);
                    recorder.testData.apiCalls.push({
                        function: 'selectJobNumber',
                        timestamp: Date.now(),
                        timeFromStart: Date.now() - recorder.startTime,
                        jobNumber: jobNumber,
                        source: source
                    });
                }
                return originalSelect(jobNumber, source);
            };
        }
        
        // Monitor clearSelection if it exists
        if (window.selectionManager && typeof window.selectionManager.clearSelection === 'function') {
            const originalClear = window.selectionManager.clearSelection.bind(window.selectionManager);
            
            window.selectionManager.clearSelection = function(source) {
                if (recorder.isRecording) {
                    console.log(`📞 API: clearSelection("${source}")`);
                    recorder.testData.apiCalls.push({
                        function: 'clearSelection',
                        timestamp: Date.now(),
                        timeFromStart: Date.now() - recorder.startTime,
                        source: source
                    });
                }
                return originalClear(source);
            };
        }
    }
    
    function startStateMonitoring() {
        // Take periodic snapshots of element states
        const snapshotInterval = setInterval(() => {
            if (!recorder.isRecording) {
                clearInterval(snapshotInterval);
                return;
            }
            
            recorder.testData.stateSnapshots.push(captureStateSnapshot());
        }, 500); // Every 500ms
        
        recorder.snapshotInterval = snapshotInterval;
    }
    
    function captureStateSnapshot() {
        const snapshot = {
            timestamp: Date.now(),
            timeFromStart: Date.now() - recorder.startTime,
            scrollPositions: {},
            visibleElements: {
                resumeDivs: [],
                cardDivs: []
            }
        };
        
        // Capture scroll positions
        const sceneContainer = document.getElementById('scene-container');
        const resumeContainer = document.getElementById('resume-container');
        
        if (sceneContainer) {
            snapshot.scrollPositions.sceneContainer = {
                scrollTop: sceneContainer.scrollTop,
                scrollLeft: sceneContainer.scrollLeft
            };
        }
        
        if (resumeContainer) {
            snapshot.scrollPositions.resumeContainer = {
                scrollTop: resumeContainer.scrollTop,
                scrollLeft: resumeContainer.scrollLeft
            };
        }
        
        snapshot.scrollPositions.window = {
            scrollX: window.scrollX,
            scrollY: window.scrollY
        };
        
        // Capture visible elements
        document.querySelectorAll('.biz-resume-div').forEach(div => {
            const rect = div.getBoundingClientRect();
            if (rect.top < window.innerHeight && rect.bottom > 0) { // Visible in viewport
                snapshot.visibleElements.resumeDivs.push({
                    id: div.id,
                    jobNumber: div.getAttribute('data-job-number'),
                    visibilityPercentage: calculateVisibility(rect)
                });
            }
        });
        
        document.querySelectorAll('.biz-card-div').forEach(div => {
            const rect = div.getBoundingClientRect();
            if (rect.top < window.innerHeight && rect.bottom > 0) { // Visible in viewport
                const headers = findHeaders(div);
                snapshot.visibleElements.cardDivs.push({
                    id: div.id,
                    jobNumber: div.getAttribute('data-job-number'),
                    visibilityPercentage: calculateVisibility(rect),
                    headers: headers
                });
            }
        });
        
        return snapshot;
    }
    
    function calculateVisibility(rect) {
        const visibleTop = Math.max(rect.top, 0);
        const visibleBottom = Math.min(rect.bottom, window.innerHeight);
        const visibleHeight = Math.max(0, visibleBottom - visibleTop);
        return Math.round((visibleHeight / rect.height) * 100);
    }
    
    function findHeaders(element) {
        const headerSelectors = ['.biz-details-employer', '.biz-card-header', '.job-title', '.company-name'];
        const headers = [];
        
        headerSelectors.forEach(selector => {
            const header = element.querySelector(selector);
            if (header) {
                const rect = header.getBoundingClientRect();
                headers.push({
                    selector: selector,
                    text: header.textContent?.substring(0, 30),
                    visible: rect.top >= 0 && rect.bottom <= window.innerHeight,
                    visibilityPercentage: calculateVisibility(rect)
                });
            }
        });
        
        return headers;
    }
    
    function setupAutoStop() {
        // Auto-stop after 10 seconds
        setTimeout(() => {
            if (recorder.isRecording) {
                console.log('⏰ AUTO-STOP: 10 seconds elapsed');
                stopRecording();
            }
        }, 10000);
    }
    
    function stopRecording() {
        if (!recorder.isRecording) return;
        
        recorder.isRecording = false;
        recorder.testData.endTime = new Date().toISOString();
        recorder.testData.duration = Date.now() - recorder.startTime;
        
        // Cleanup intervals
        if (recorder.snapshotInterval) {
            clearInterval(recorder.snapshotInterval);
        }
        
        console.log(`\n⏹️ RECORDING STOPPED: ${recorder.testData.sessionId}`);
        console.log(`⏱️ Duration: ${Math.round(recorder.testData.duration / 1000 * 100) / 100} seconds`);
        console.log(`📊 Captured: ${recorder.testData.events.length} events, ${recorder.testData.apiCalls.length} API calls`);
        
        // Analyze results
        analyzeResults();
        
        // Save results (always works)
        saveResults();
    }
    
    function analyzeResults() {
        console.log('\n🔬 ANALYZING COMPLETE TEST...');
        
        const trigger = recorder.testData.trigger;
        const apiCalls = recorder.testData.apiCalls;
        const snapshots = recorder.testData.stateSnapshots;
        
        const analysis = {
            trigger: {
                type: trigger.type,
                jobNumber: trigger.jobNumber,
                valid: trigger.type === 'rDiv' || trigger.type === 'cDiv'
            },
            apiCalls: {
                total: apiCalls.length,
                selectJobNumber: apiCalls.filter(call => call.function === 'selectJobNumber').length,
                correctJob: apiCalls.filter(call => 
                    call.function === 'selectJobNumber' && call.jobNumber === trigger.jobNumber
                ).length,
                hasCorrectSource: apiCalls.some(call =>
                    call.function === 'selectJobNumber' && 
                    call.source && (
                        call.source.includes('ResumeListController') || 
                        call.source.includes('CardsController')
                    )
                )
            },
            scrollBehavior: {
                sceneScrolled: false,
                resumeScrolled: false,
                scrollEvents: recorder.testData.events.filter(e => e.type === 'scroll').length
            },
            visibility: {
                targetFound: false,
                targetVisible: false,
                headersVisible: 0
            }
        };
        
        // Analyze scroll behavior
        if (snapshots.length >= 2) {
            const firstSnapshot = snapshots[0];
            const lastSnapshot = snapshots[snapshots.length - 1];
            
            if (firstSnapshot.scrollPositions.sceneContainer && lastSnapshot.scrollPositions.sceneContainer) {
                const scrollDelta = Math.abs(
                    lastSnapshot.scrollPositions.sceneContainer.scrollTop - 
                    firstSnapshot.scrollPositions.sceneContainer.scrollTop
                );
                analysis.scrollBehavior.sceneScrolled = scrollDelta > 10;
            }
            
            if (firstSnapshot.scrollPositions.resumeContainer && lastSnapshot.scrollPositions.resumeContainer) {
                const scrollDelta = Math.abs(
                    lastSnapshot.scrollPositions.resumeContainer.scrollTop - 
                    firstSnapshot.scrollPositions.resumeContainer.scrollTop
                );
                analysis.scrollBehavior.resumeScrolled = scrollDelta > 10;
            }
        }
        
        // Analyze visibility (look for target element in final snapshot)
        if (snapshots.length > 0) {
            const finalSnapshot = snapshots[snapshots.length - 1];
            
            if (trigger.type === 'rDiv') {
                // Look for corresponding cDiv
                const targetCDiv = finalSnapshot.visibleElements.cardDivs.find(card =>
                    parseInt(card.jobNumber) === trigger.jobNumber
                );
                if (targetCDiv) {
                    analysis.visibility.targetFound = true;
                    analysis.visibility.targetVisible = targetCDiv.visibilityPercentage > 50;
                    analysis.visibility.headersVisible = targetCDiv.headers.filter(h => h.visible).length;
                }
            } else if (trigger.type === 'cDiv') {
                // Look for corresponding rDiv
                const targetRDiv = finalSnapshot.visibleElements.resumeDivs.find(resume =>
                    parseInt(resume.jobNumber) === trigger.jobNumber
                );
                if (targetRDiv) {
                    analysis.visibility.targetFound = true;
                    analysis.visibility.targetVisible = targetRDiv.visibilityPercentage > 50;
                }
            }
        }
        
        // Calculate overall result
        const tests = [
            analysis.trigger.valid,
            analysis.apiCalls.correctJob > 0,
            analysis.apiCalls.hasCorrectSource,
            trigger.type === 'rDiv' ? analysis.scrollBehavior.sceneScrolled : analysis.scrollBehavior.resumeScrolled,
            analysis.visibility.targetVisible
        ];
        
        const passedTests = tests.filter(Boolean).length;
        const overallResult = passedTests >= 4 ? 'SUCCESS' : passedTests >= 3 ? 'PARTIAL' : 'FAILURE';
        
        analysis.overall = {
            passedTests: passedTests,
            totalTests: tests.length,
            result: overallResult,
            percentage: Math.round((passedTests / tests.length) * 100)
        };
        
        recorder.testData.analysis = analysis;
        
        // Display results
        console.log(`📊 ANALYSIS COMPLETE (${passedTests}/${tests.length}):`);
        console.log(`   ✓ Valid Trigger: ${analysis.trigger.valid ? '✅' : '❌'} ${trigger.type} click on Job ${trigger.jobNumber}`);
        console.log(`   ✓ API Called: ${analysis.apiCalls.correctJob > 0 ? '✅' : '❌'} selectJobNumber(${trigger.jobNumber})`);
        console.log(`   ✓ Correct Source: ${analysis.apiCalls.hasCorrectSource ? '✅' : '❌'} proper source parameter`);
        console.log(`   ✓ Scrolling: ${(trigger.type === 'rDiv' ? analysis.scrollBehavior.sceneScrolled : analysis.scrollBehavior.resumeScrolled) ? '✅' : '❌'} container scrolled`);
        console.log(`   ✓ Target Visible: ${analysis.visibility.targetVisible ? '✅' : '❌'} target element in view`);
        
        console.log(`\n🎯 OVERALL RESULT: ${overallResult} (${analysis.overall.percentage}%)`);
        
        if (overallResult === 'SUCCESS') {
            console.log('🎉 BIDIRECTIONAL SYNC IS WORKING CORRECTLY!');
        } else {
            console.log('❌ BIDIRECTIONAL SYNC HAS ISSUES - see individual test results above');
        }
    }
    
    function saveResults() {
        // Always save locally - no server dependencies
        const jsonData = JSON.stringify(recorder.testData, null, 2);
        const blob = new Blob([jsonData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `bulletproof-test-${recorder.testData.sessionId}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        console.log(`\n💾 Results saved as: bulletproof-test-${recorder.testData.sessionId}.json`);
        
        // Try to save to server (optional)
        fetch('/api/sync-logs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: jsonData
        }).then(response => {
            if (response.ok) {
                console.log('✅ Also saved to server dashboard');
            }
        }).catch(() => {
            console.log('ℹ️ Server not available, but local file saved');
        });
        
        console.log('\n🎬 Test complete! Click another element to run new test.');
    }
    
    // Main initialization
    function initialize() {
        console.log('🚀 INITIALIZING BULLETPROOF RECORDER...\n');
        
        // Run diagnostics first
        const isReady = runDiagnostics();
        
        if (!isReady) {
            console.log('⚠️ SYSTEM NOT READY');
            console.log('💡 Possible issues:');
            console.log('   • App still loading - wait a few seconds and try again');
            console.log('   • Wrong page - navigate to the resume application');
            console.log('   • Elements not rendered - check if page loaded completely');
            console.log('\n🔄 You can still use the recorder - it will work when elements appear');
        }
        
        // Set up universal event listeners
        document.addEventListener('click', function(event) {
            const resumeDiv = event.target.closest('.biz-resume-div');
            const cardDiv = event.target.closest('.biz-card-div');
            
            if ((resumeDiv || cardDiv) && !recorder.isRecording) {
                startUniversalTracking(event);
            }
        }, true);
        
        document.addEventListener('keydown', function(event) {
            if (event.key === 'Escape' && recorder.isRecording) {
                event.preventDefault();
                stopRecording();
            }
        }, true);
        
        // Global functions
        window.getRecorderData = () => recorder.testData;
        window.getRecorderStatus = () => ({
            isRecording: recorder.isRecording,
            sessionId: recorder.testData?.sessionId,
            duration: recorder.startTime ? Date.now() - recorder.startTime : 0
        });
        window.stopRecorder = () => stopRecording();
        window.showDiagnostics = () => {
            console.log('🔍 CURRENT DIAGNOSTICS:');
            console.log(JSON.stringify(recorder.diagnostics, null, 2));
        };
        
        console.log('\n✅ BULLETPROOF RECORDER READY!');
        console.log('🎯 Click any rDiv or cDiv to start recording');
        console.log('⏹️ Press ESC to stop recording');
        console.log('🔧 Available commands:');
        console.log('   getRecorderStatus() - Check recording status');
        console.log('   getRecorderData() - Get test data');
        console.log('   stopRecorder() - Manual stop');
        console.log('   showDiagnostics() - Show system info');
    }
    
    // Start the system
    initialize();
    
})();

console.log('🛡️ BULLETPROOF RECORDER LOADED - Check output above for status');