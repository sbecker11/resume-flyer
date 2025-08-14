// COMPLETE TEST RECORDER - Automated recording from rDiv click to ESC key
// This script creates a comprehensive recording system that captures EVERYTHING

(function() {
    console.clear();
    console.log('🎬 COMPLETE TEST RECORDER - Automated Full Session Recording');
    console.log('📊 Records everything from first rDiv click until ESC key is pressed\n');
    
    class CompleteTestRecorder {
        constructor() {
            this.isRecording = false;
            this.recordingStartTime = null;
            this.testSession = null;
            this.eventCapture = [];
            this.intervalId = null;
            this.setupGlobalCapture();
        }
        
        setupGlobalCapture() {
            console.log('🎯 READY TO RECORD - Click any rDiv to start complete test recording');
            console.log('⏹️ Press ESC key when test is complete to stop and analyze\n');
            
            // Monitor for rDiv clicks to start recording
            document.addEventListener('click', (event) => {
                const resumeDiv = event.target.closest('.biz-resume-div');
                if (resumeDiv && !this.isRecording) {
                    const jobNumber = parseInt(resumeDiv.getAttribute('data-job-number'));
                    this.startCompleteRecording(jobNumber, event);
                }
            }, true);
            
            // Monitor for ESC key to stop recording
            document.addEventListener('keydown', (event) => {
                if (event.key === 'Escape' && this.isRecording) {
                    event.preventDefault();
                    this.stopCompleteRecording();
                }
            }, true);
        }
        
        startCompleteRecording(jobNumber, clickEvent) {
            this.isRecording = true;
            this.recordingStartTime = Date.now();
            
            // Initialize complete test session
            this.testSession = {
                sessionId: `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                startTime: new Date().toISOString(),
                triggeredByJob: jobNumber,
                initialClick: this.captureClickDetails(clickEvent),
                systemState: this.captureSystemState(),
                events: [],
                domSnapshots: [],
                apiCalls: [],
                scrollEvents: [],
                visibilityChanges: [],
                endTime: null,
                duration: null,
                analysis: null
            };
            
            console.log(`\n🎬 RECORDING STARTED - Test Session: ${this.testSession.sessionId}`);
            console.log(`🎯 Triggered by rDiv click on Job ${jobNumber}`);
            console.log(`📍 Click location: ${this.testSession.initialClick.semanticArea}`);
            console.log('📊 Recording ALL actions until ESC key pressed...\n');
            
            // Start comprehensive monitoring
            this.startEventCapture();
            this.startDOMMonitoring();
            this.wrapAPIFunctions();
            this.startPeriodicSnapshots();
        }
        
        captureClickDetails(event) {
            const target = event.target;
            const resumeDiv = target.closest('.biz-resume-div');
            const rect = resumeDiv.getBoundingClientRect();
            
            return {
                timestamp: Date.now(),
                coordinates: { x: event.clientX, y: event.clientY },
                relativeToDiv: {
                    x: event.clientX - rect.left,
                    y: event.clientY - rect.top,
                    percentX: Math.round(((event.clientX - rect.left) / rect.width) * 100),
                    percentY: Math.round(((event.clientY - rect.top) / rect.height) * 100)
                },
                clickedElement: {
                    tagName: target.tagName,
                    className: target.className,
                    id: target.id,
                    textContent: target.textContent?.substring(0, 100)
                },
                semanticArea: this.identifySemanticArea(target, resumeDiv),
                divInfo: {
                    id: resumeDiv.id,
                    jobNumber: resumeDiv.getAttribute('data-job-number'),
                    rect: rect
                }
            };
        }
        
        identifySemanticArea(clickedElement, resumeDiv) {
            // Identify what part of the rDiv was clicked
            if (clickedElement.closest('.biz-resume-details-div')) return 'header';
            if (clickedElement.closest('.resume-header')) return 'header';
            if (clickedElement.closest('.job-title')) return 'job-title';
            if (clickedElement.closest('.company-name')) return 'company-name';
            if (clickedElement.closest('.dates')) return 'dates';
            if (clickedElement.closest('.skills')) return 'skills';
            if (clickedElement.closest('.stats')) return 'stats';
            if (clickedElement.tagName === 'IMG') return 'image';
            return 'content-area';
        }
        
        captureSystemState() {
            return {
                timestamp: Date.now(),
                selectionManager: {
                    available: !!window.selectionManager,
                    instanceId: window.selectionManager?.instanceId,
                    selectedJob: window.selectionManager?.getSelectedJobNumber(),
                    listenersReady: !!window._cardsControllerListenersReady
                },
                elements: {
                    resumeDivs: document.querySelectorAll('.biz-resume-div').length,
                    cardDivs: document.querySelectorAll('.biz-card-div').length,
                    sceneContainer: !!document.getElementById('scene-container'),
                    resumeContainer: !!document.getElementById('resume-container')
                },
                scrollPositions: {
                    sceneContainer: this.getScrollInfo('scene-container'),
                    resumeContainer: this.getScrollInfo('resume-container'),
                    window: { x: window.scrollX, y: window.scrollY }
                },
                viewport: {
                    width: window.innerWidth,
                    height: window.innerHeight
                }
            };
        }
        
        getScrollInfo(elementId) {
            const element = document.getElementById(elementId);
            return element ? {
                scrollTop: element.scrollTop,
                scrollLeft: element.scrollLeft,
                scrollHeight: element.scrollHeight,
                scrollWidth: element.scrollWidth,
                clientHeight: element.clientHeight,
                clientWidth: element.clientWidth
            } : null;
        }
        
        startEventCapture() {
            // Capture ALL events during recording
            const eventTypes = [
                'click', 'mousedown', 'mouseup', 'mousemove',
                'keydown', 'keyup', 'scroll', 'resize',
                'focus', 'blur', 'change', 'input'
            ];
            
            eventTypes.forEach(eventType => {
                document.addEventListener(eventType, (event) => {
                    if (!this.isRecording) return;
                    
                    this.testSession.events.push({
                        type: eventType,
                        timestamp: Date.now(),
                        timeFromStart: Date.now() - this.recordingStartTime,
                        target: {
                            tagName: event.target?.tagName,
                            id: event.target?.id,
                            className: event.target?.className,
                            isResumeDiv: !!event.target?.closest('.biz-resume-div'),
                            isCardDiv: !!event.target?.closest('.biz-card-div')
                        },
                        details: this.captureEventDetails(event, eventType)
                    });
                }, true);
            });
        }
        
        captureEventDetails(event, eventType) {
            const details = { eventType };
            
            switch(eventType) {
                case 'click':
                case 'mousedown':
                case 'mouseup':
                    details.coordinates = { x: event.clientX, y: event.clientY };
                    details.button = event.button;
                    break;
                case 'mousemove':
                    details.coordinates = { x: event.clientX, y: event.clientY };
                    break;
                case 'keydown':
                case 'keyup':
                    details.key = event.key;
                    details.code = event.code;
                    details.ctrlKey = event.ctrlKey;
                    details.altKey = event.altKey;
                    details.shiftKey = event.shiftKey;
                    break;
                case 'scroll':
                    details.scrollTop = event.target?.scrollTop;
                    details.scrollLeft = event.target?.scrollLeft;
                    details.element = event.target?.id || event.target?.tagName;
                    break;
                case 'resize':
                    details.innerWidth = window.innerWidth;
                    details.innerHeight = window.innerHeight;
                    break;
            }
            
            return details;
        }
        
        startDOMMonitoring() {
            // Monitor DOM changes
            const observer = new MutationObserver((mutations) => {
                if (!this.isRecording) return;
                
                mutations.forEach(mutation => {
                    this.testSession.events.push({
                        type: 'dom-mutation',
                        timestamp: Date.now(),
                        timeFromStart: Date.now() - this.recordingStartTime,
                        mutationType: mutation.type,
                        target: {
                            tagName: mutation.target?.tagName,
                            id: mutation.target?.id,
                            className: mutation.target?.className
                        },
                        details: {
                            attributeName: mutation.attributeName,
                            oldValue: mutation.oldValue,
                            addedNodes: mutation.addedNodes?.length || 0,
                            removedNodes: mutation.removedNodes?.length || 0
                        }
                    });
                });
            });
            
            observer.observe(document.body, {
                attributes: true,
                childList: true,
                subtree: true,
                attributeOldValue: true,
                characterData: true
            });
            
            // Store observer to disconnect later
            this.domObserver = observer;
        }
        
        wrapAPIFunctions() {
            // Wrap selectionManager functions to capture API calls
            if (window.selectionManager) {
                const originalSelect = window.selectionManager.selectJobNumber?.bind(window.selectionManager);
                const originalClear = window.selectionManager.clearSelection?.bind(window.selectionManager);
                
                if (originalSelect) {
                    window.selectionManager.selectJobNumber = (jobNumber, source) => {
                        if (this.isRecording) {
                            this.testSession.apiCalls.push({
                                function: 'selectJobNumber',
                                timestamp: Date.now(),
                                timeFromStart: Date.now() - this.recordingStartTime,
                                parameters: { jobNumber, source },
                                stackTrace: new Error().stack
                            });
                        }
                        return originalSelect(jobNumber, source);
                    };
                }
                
                if (originalClear) {
                    window.selectionManager.clearSelection = (source) => {
                        if (this.isRecording) {
                            this.testSession.apiCalls.push({
                                function: 'clearSelection',
                                timestamp: Date.now(),
                                timeFromStart: Date.now() - this.recordingStartTime,
                                parameters: { source },
                                stackTrace: new Error().stack
                            });
                        }
                        return originalClear(source);
                    };
                }
            }
        }
        
        startPeriodicSnapshots() {
            // Take periodic snapshots of system state
            this.intervalId = setInterval(() => {
                if (!this.isRecording) return;
                
                this.testSession.domSnapshots.push({
                    timestamp: Date.now(),
                    timeFromStart: Date.now() - this.recordingStartTime,
                    systemState: this.captureSystemState(),
                    visibleElements: this.captureVisibleElements(),
                    scrollPositions: {
                        sceneContainer: this.getScrollInfo('scene-container'),
                        resumeContainer: this.getScrollInfo('resume-container'),
                        window: { x: window.scrollX, y: window.scrollY }
                    }
                });
            }, 250); // Every 250ms
        }
        
        captureVisibleElements() {
            const visible = {
                resumeDivs: [],
                cardDivs: []
            };
            
            // Check resume divs visibility
            document.querySelectorAll('.biz-resume-div').forEach(div => {
                const rect = div.getBoundingClientRect();
                const isVisible = this.isElementVisible(div, rect);
                if (isVisible.visible) {
                    visible.resumeDivs.push({
                        id: div.id,
                        jobNumber: div.getAttribute('data-job-number'),
                        visibilityPercentage: isVisible.percentage,
                        rect: rect,
                        headers: this.findVisibleHeaders(div, 'resume')
                    });
                }
            });
            
            // Check card divs visibility
            document.querySelectorAll('.biz-card-div').forEach(div => {
                const rect = div.getBoundingClientRect();
                const isVisible = this.isElementVisible(div, rect);
                if (isVisible.visible) {
                    visible.cardDivs.push({
                        id: div.id,
                        jobNumber: div.getAttribute('data-job-number'),
                        visibilityPercentage: isVisible.percentage,
                        rect: rect,
                        headers: this.findVisibleHeaders(div, 'card')
                    });
                }
            });
            
            return visible;
        }
        
        isElementVisible(element, rect) {
            const style = window.getComputedStyle(element);
            if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
                return { visible: false, percentage: 0 };
            }
            
            // Calculate viewport intersection
            const viewportHeight = window.innerHeight;
            const viewportWidth = window.innerWidth;
            
            const visibleTop = Math.max(rect.top, 0);
            const visibleLeft = Math.max(rect.left, 0);
            const visibleBottom = Math.min(rect.bottom, viewportHeight);
            const visibleRight = Math.min(rect.right, viewportWidth);
            
            if (visibleTop >= visibleBottom || visibleLeft >= visibleRight) {
                return { visible: false, percentage: 0 };
            }
            
            const visibleArea = (visibleRight - visibleLeft) * (visibleBottom - visibleTop);
            const totalArea = rect.width * rect.height;
            const percentage = totalArea > 0 ? (visibleArea / totalArea) * 100 : 0;
            
            return { visible: percentage > 10, percentage: Math.round(percentage) };
        }
        
        findVisibleHeaders(element, type) {
            const selectors = type === 'resume' ? [
                '.biz-resume-details-div',
                '.resume-header',
                '.job-title',
                '.company-name'
            ] : [
                '.biz-details-employer',
                '.biz-card-header',
                '.job-title',
                '.company-name',
                '.biz-details-role'
            ];
            
            const headers = [];
            selectors.forEach(selector => {
                const header = element.querySelector(selector);
                if (header) {
                    const rect = header.getBoundingClientRect();
                    const visibility = this.isElementVisible(header, rect);
                    headers.push({
                        selector,
                        text: header.textContent?.substring(0, 50),
                        visible: visibility.visible,
                        visibilityPercentage: visibility.percentage,
                        rect: rect
                    });
                }
            });
            
            return headers;
        }
        
        stopCompleteRecording() {
            if (!this.isRecording) return;
            
            this.isRecording = false;
            this.testSession.endTime = new Date().toISOString();
            this.testSession.duration = Date.now() - this.recordingStartTime;
            
            // Cleanup
            if (this.intervalId) {
                clearInterval(this.intervalId);
            }
            if (this.domObserver) {
                this.domObserver.disconnect();
            }
            
            console.log(`\n⏹️ RECORDING STOPPED - Session Complete: ${this.testSession.sessionId}`);
            console.log(`⏱️ Duration: ${Math.round(this.testSession.duration / 1000 * 100) / 100} seconds`);
            console.log(`📊 Captured ${this.testSession.events.length} events`);
            console.log(`🔍 Captured ${this.testSession.apiCalls.length} API calls`);
            console.log(`📸 Captured ${this.testSession.domSnapshots.length} DOM snapshots`);
            
            // Analyze the complete session
            this.analyzeCompleteSession();
            
            // Save the results
            this.saveCompleteSession();
        }
        
        analyzeCompleteSession() {
            console.log('\n🔬 ANALYZING COMPLETE TEST SESSION...');
            
            const analysis = {
                timestamp: Date.now(),
                triggerAnalysis: this.analyzeTrigger(),
                apiAnalysis: this.analyzeAPICalls(),
                scrollAnalysis: this.analyzeScrollBehavior(),
                visibilityAnalysis: this.analyzeVisibilityChanges(),
                timingAnalysis: this.analyzeTimings(),
                overallResult: null
            };
            
            // Determine overall result
            const passedTests = [
                analysis.triggerAnalysis.passed,
                analysis.apiAnalysis.passed,
                analysis.scrollAnalysis.passed,
                analysis.visibilityAnalysis.passed
            ].filter(Boolean).length;
            
            analysis.overallResult = {
                score: `${passedTests}/4`,
                percentage: Math.round((passedTests / 4) * 100),
                status: passedTests >= 4 ? 'SUCCESS' : passedTests >= 3 ? 'PARTIAL_SUCCESS' : 'FAILURE'
            };
            
            this.testSession.analysis = analysis;
            this.displayCompleteAnalysis(analysis);
        }
        
        analyzeTrigger() {
            const trigger = this.testSession.initialClick;
            const jobNumber = this.testSession.triggeredByJob;
            
            return {
                passed: true, // Trigger always passes since we got here
                jobNumber: jobNumber,
                clickLocation: trigger.semanticArea,
                relativePosition: trigger.relativeToDiv,
                details: `Successfully triggered by Job ${jobNumber} click on ${trigger.semanticArea}`
            };
        }
        
        analyzeAPICalls() {
            const selectCalls = this.testSession.apiCalls.filter(call => 
                call.function === 'selectJobNumber' && 
                call.parameters.jobNumber === this.testSession.triggeredByJob
            );
            
            const hasCorrectCall = selectCalls.length > 0;
            const correctSource = selectCalls.find(call => 
                call.parameters.source?.includes('ResumeListController')
            );
            
            return {
                passed: hasCorrectCall && !!correctSource,
                totalCalls: this.testSession.apiCalls.length,
                selectCalls: selectCalls.length,
                hasCorrectSource: !!correctSource,
                sourceUsed: correctSource?.parameters.source,
                details: hasCorrectCall 
                    ? `✅ selectJobNumber called with correct parameters`
                    : `❌ selectJobNumber not called for Job ${this.testSession.triggeredByJob}`
            };
        }
        
        analyzeScrollBehavior() {
            const initialScroll = this.testSession.systemState.scrollPositions;
            const finalSnapshot = this.testSession.domSnapshots[this.testSession.domSnapshots.length - 1];
            const finalScroll = finalSnapshot?.scrollPositions;
            
            if (!finalScroll) {
                return {
                    passed: false,
                    details: 'No final scroll position captured'
                };
            }
            
            // Check if scene container scrolled (expected for rDiv click)
            const sceneScrollChanged = Math.abs(
                (initialScroll.sceneContainer?.scrollTop || 0) - 
                (finalScroll.sceneContainer?.scrollTop || 0)
            ) > 10;
            
            const resumeScrollChanged = Math.abs(
                (initialScroll.resumeContainer?.scrollTop || 0) - 
                (finalScroll.resumeContainer?.scrollTop || 0)
            ) > 10;
            
            return {
                passed: sceneScrollChanged,
                sceneScrollChanged: sceneScrollChanged,
                resumeScrollChanged: resumeScrollChanged,
                initialSceneScroll: initialScroll.sceneContainer?.scrollTop || 0,
                finalSceneScroll: finalScroll.sceneContainer?.scrollTop || 0,
                scrollDelta: (finalScroll.sceneContainer?.scrollTop || 0) - (initialScroll.sceneContainer?.scrollTop || 0),
                details: sceneScrollChanged 
                    ? `✅ Scene container scrolled ${Math.abs((finalScroll.sceneContainer?.scrollTop || 0) - (initialScroll.sceneContainer?.scrollTop || 0))}px`
                    : `❌ Scene container did not scroll significantly`
            };
        }
        
        analyzeVisibilityChanges() {
            const finalSnapshot = this.testSession.domSnapshots[this.testSession.domSnapshots.length - 1];
            if (!finalSnapshot) {
                return {
                    passed: false,
                    details: 'No final visibility snapshot available'
                };
            }
            
            // Find the corresponding cDiv for the clicked rDiv job
            const targetJob = this.testSession.triggeredByJob;
            const targetCDiv = finalSnapshot.visibleElements.cardDivs.find(card => 
                parseInt(card.jobNumber) === targetJob
            );
            
            if (!targetCDiv) {
                return {
                    passed: false,
                    targetJob: targetJob,
                    details: `❌ Target cDiv for Job ${targetJob} not found or not visible`
                };
            }
            
            // Check if headers are visible
            const visibleHeaders = targetCDiv.headers.filter(header => header.visible && header.visibilityPercentage >= 50);
            const headersPassed = visibleHeaders.length > 0;
            
            return {
                passed: headersPassed && targetCDiv.visibilityPercentage >= 50,
                targetJob: targetJob,
                cDivVisible: true,
                cDivVisibilityPercentage: targetCDiv.visibilityPercentage,
                visibleHeaders: visibleHeaders.length,
                totalHeaders: targetCDiv.headers.length,
                headerDetails: visibleHeaders.map(h => ({ selector: h.selector, visibility: h.visibilityPercentage })),
                details: headersPassed 
                    ? `✅ Target cDiv visible (${targetCDiv.visibilityPercentage}%) with ${visibleHeaders.length} visible headers`
                    : `❌ Target cDiv headers not sufficiently visible`
            };
        }
        
        analyzeTimings() {
            const apiCallTimes = this.testSession.apiCalls.map(call => call.timeFromStart);
            const scrollEvents = this.testSession.events.filter(event => event.type === 'scroll');
            
            return {
                sessionDuration: this.testSession.duration,
                firstAPICall: apiCallTimes.length > 0 ? Math.min(...apiCallTimes) : null,
                scrollEventCount: scrollEvents.length,
                averageResponseTime: apiCallTimes.length > 0 ? Math.round(apiCallTimes.reduce((a, b) => a + b, 0) / apiCallTimes.length) : null,
                details: `Session lasted ${Math.round(this.testSession.duration / 1000 * 100) / 100}s with ${apiCallTimes.length} API calls`
            };
        }
        
        displayCompleteAnalysis(analysis) {
            console.log('\n📊 === COMPLETE TEST ANALYSIS ===');
            console.log(`🎯 Overall Result: ${analysis.overallResult.status} (${analysis.overallResult.score})`);
            console.log(`📈 Success Rate: ${analysis.overallResult.percentage}%\n`);
            
            console.log('🔍 Detailed Analysis:');
            console.log(`   ✓ Trigger: ${analysis.triggerAnalysis.passed ? '✅' : '❌'} ${analysis.triggerAnalysis.details}`);
            console.log(`   ✓ API Calls: ${analysis.apiAnalysis.passed ? '✅' : '❌'} ${analysis.apiAnalysis.details}`);
            console.log(`   ✓ Scroll Behavior: ${analysis.scrollAnalysis.passed ? '✅' : '❌'} ${analysis.scrollAnalysis.details}`);
            console.log(`   ✓ Visibility: ${analysis.visibilityAnalysis.passed ? '✅' : '❌'} ${analysis.visibilityAnalysis.details}`);
            
            console.log(`\n⏱️ Timing Analysis:`);
            console.log(`   • Session Duration: ${Math.round(analysis.timingAnalysis.sessionDuration / 1000 * 100) / 100} seconds`);
            console.log(`   • API Response Time: ${analysis.timingAnalysis.firstAPICall || 'N/A'}ms`);
            console.log(`   • Scroll Events: ${analysis.timingAnalysis.scrollEventCount}`);
            
            if (analysis.visibilityAnalysis.passed) {
                console.log(`\n🎉 BIDIRECTIONAL SYNC SUCCESS!`);
                console.log(`   • rDiv click on Job ${analysis.visibilityAnalysis.targetJob} successfully triggered cDiv scroll`);
                console.log(`   • Target cDiv is ${analysis.visibilityAnalysis.cDivVisibilityPercentage}% visible`);
                console.log(`   • ${analysis.visibilityAnalysis.visibleHeaders} header elements are visible`);
            } else {
                console.log(`\n❌ BIDIRECTIONAL SYNC ISSUES DETECTED`);
                if (!analysis.apiAnalysis.passed) {
                    console.log(`   • API calls not working properly`);
                }
                if (!analysis.scrollAnalysis.passed) {
                    console.log(`   • Scroll behavior not triggered correctly`);
                }
                if (!analysis.visibilityAnalysis.passed) {
                    console.log(`   • Target elements not properly scrolled into view`);
                }
            }
        }
        
        async saveCompleteSession() {
            console.log('\n💾 SAVING COMPLETE SESSION...');
            
            // Save to local file
            const fileName = `complete-test-${this.testSession.sessionId}.json`;
            const jsonData = JSON.stringify(this.testSession, null, 2);
            
            const blob = new Blob([jsonData], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            console.log(`📁 Complete session saved as: ${fileName}`);
            
            // Save to server
            try {
                const response = await fetch('/api/sync-logs', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: jsonData
                });
                
                if (response.ok) {
                    const result = await response.json();
                    console.log(`✅ Session saved to server: ${result.sessionId}`);
                    console.log(`🌐 View dashboard: http://localhost:3009/sync-logs-dashboard`);
                } else {
                    console.log('⚠️ Server save failed, but local file downloaded');
                }
            } catch (error) {
                console.log('⚠️ Server save failed, but local file downloaded');
            }
            
            console.log('\n🎬 Test recording complete! Ready for next test.');
            console.log('🔄 Click another rDiv to start a new recording session.');
        }
        
        getLastSession() {
            return this.testSession;
        }
        
        getRecordingStatus() {
            return {
                isRecording: this.isRecording,
                sessionId: this.testSession?.sessionId,
                duration: this.isRecording ? Date.now() - this.recordingStartTime : null,
                eventsCapture: this.testSession?.events?.length || 0
            };
        }
    }
    
    // Create global recorder instance
    const recorder = new CompleteTestRecorder();
    
    // Make functions globally available
    window.getRecordingStatus = () => recorder.getRecordingStatus();
    window.getLastTestSession = () => recorder.getLastSession();
    window.viewTestDashboard = () => window.open('http://localhost:3009/sync-logs-dashboard', '_blank');
    
    console.log('✅ Complete Test Recorder loaded and active!');
    console.log('🎯 Click any rDiv to start comprehensive recording');
    console.log('⏹️ Press ESC key to stop recording and get complete analysis');
    console.log('\n🎮 Available commands:');
    console.log('   getRecordingStatus() - Check current recording status');
    console.log('   getLastTestSession() - Get complete data from last test');
    console.log('   viewTestDashboard() - Open server dashboard');
    
    // Store recorder globally for access
    window.completeTestRecorder = recorder;
    
})();