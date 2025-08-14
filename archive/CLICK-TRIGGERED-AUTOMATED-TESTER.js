// CLICK-TRIGGERED AUTOMATED TESTER
// Automatically starts comprehensive testing when first rDiv is clicked
// Records everything from click to ESC key with full automated analysis

(function() {
    console.clear();
    console.log('🎯 CLICK-TRIGGERED AUTOMATED TESTER');
    console.log('📊 Waiting for rDiv click to automatically start comprehensive testing...\n');
    
    class ClickTriggeredAutomatedTester {
        constructor() {
            this.isRecording = false;
            this.testData = null;
            this.startTime = null;
            this.setupClickDetection();
        }
        
        setupClickDetection() {
            console.log('🔍 SYSTEM READY - Click detection active');
            console.log('🎯 Click any rDiv to automatically start comprehensive testing');
            console.log('⏹️ Press ESC key to stop recording and get automated analysis\n');
            
            // Monitor for rDiv clicks to trigger automated testing
            document.addEventListener('click', (event) => {
                const resumeDiv = event.target.closest('.biz-resume-div');
                if (resumeDiv && !this.isRecording) {
                    const jobNumber = parseInt(resumeDiv.getAttribute('data-job-number'));
                    this.startAutomatedRecording(jobNumber, event);
                }
            }, true);
            
            // Monitor for ESC key to stop recording
            document.addEventListener('keydown', (event) => {
                if (event.key === 'Escape' && this.isRecording) {
                    event.preventDefault();
                    this.stopAutomatedRecording();
                }
            }, true);
        }
        
        startAutomatedRecording(jobNumber, clickEvent) {
            this.isRecording = true;
            this.startTime = Date.now();
            
            console.log('🚀 AUTOMATED TESTING TRIGGERED BY rDiv CLICK');
            console.log('='.repeat(50));
            console.log(`🎯 Target: rDiv Job ${jobNumber}`);
            console.log(`📍 Click Location: (${clickEvent.clientX}, ${clickEvent.clientY})`);
            console.log('🤖 Starting comprehensive automated analysis...\n');
            
            // Initialize comprehensive test data
            this.testData = {
                sessionId: `click-triggered-${Date.now()}-${jobNumber}`,
                startTime: new Date().toISOString(),
                triggeredBy: {
                    type: 'rDiv',
                    jobNumber: jobNumber,
                    coordinates: { x: clickEvent.clientX, y: clickEvent.clientY },
                    element: this.captureElementDetails(clickEvent.target, resumeDiv),
                    semanticArea: this.identifyClickArea(clickEvent.target)
                },
                systemDiagnostics: this.captureSystemState(),
                apiCalls: [],
                scrollEvents: [],
                domChanges: [],
                stateSnapshots: [],
                visibilityTracking: [],
                endTime: null,
                duration: null,
                automaticAnalysis: null
            };
            
            // Start comprehensive automated monitoring
            this.setupAutomaticMonitoring();
            
            // Auto-stop after 10 seconds if ESC not pressed
            this.autoStopTimer = setTimeout(() => {
                if (this.isRecording) {
                    console.log('⏰ Auto-stopping after 10 seconds...');
                    this.stopAutomatedRecording();
                }
            }, 10000);
        }
        
        captureElementDetails(clickTarget, resumeDiv) {
            const rect = resumeDiv.getBoundingClientRect();
            return {
                clickTarget: {
                    tagName: clickTarget.tagName,
                    className: clickTarget.className,
                    id: clickTarget.id,
                    textContent: clickTarget.textContent?.substring(0, 50)
                },
                resumeDiv: {
                    id: resumeDiv.id,
                    className: resumeDiv.className,
                    rect: rect
                },
                relativePosition: {
                    x: event.clientX - rect.left,
                    y: event.clientY - rect.top,
                    percentX: Math.round(((event.clientX - rect.left) / rect.width) * 100),
                    percentY: Math.round(((event.clientY - rect.top) / rect.height) * 100)
                }
            };
        }
        
        identifyClickArea(clickedElement) {
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
                resumeDivs: document.querySelectorAll('.biz-resume-div').length,
                cardDivs: document.querySelectorAll('.biz-card-div').length,
                selectionManager: !!window.selectionManager,
                selectionManagerMethods: window.selectionManager ? Object.getOwnPropertyNames(window.selectionManager).filter(name => typeof window.selectionManager[name] === 'function') : [],
                containers: {
                    sceneContainer: !!document.getElementById('scene-container'),
                    resumeContainer: !!document.getElementById('resume-container')
                },
                currentSelection: window.selectionManager?.getSelectedJobNumber?.() || null,
                viewport: {
                    width: window.innerWidth,
                    height: window.innerHeight
                },
                scrollPositions: this.captureInitialScrollPositions()
            };
        }
        
        captureInitialScrollPositions() {
            const positions = {};
            
            ['scene-container', 'resume-container'].forEach(containerId => {
                const container = document.getElementById(containerId);
                if (container) {
                    positions[containerId] = {
                        scrollTop: container.scrollTop,
                        scrollLeft: container.scrollLeft,
                        scrollHeight: container.scrollHeight,
                        clientHeight: container.clientHeight
                    };
                }
            });
            
            positions.window = { scrollX: window.scrollX, scrollY: window.scrollY };
            return positions;
        }
        
        setupAutomaticMonitoring() {
            console.log('📊 Setting up comprehensive automated monitoring...');
            
            // 1. API Call Monitoring
            this.setupAPIMonitoring();
            
            // 2. Scroll Event Monitoring
            this.setupScrollMonitoring();
            
            // 3. DOM Change Monitoring
            this.setupDOMMonitoring();
            
            // 4. Element Visibility Monitoring
            this.setupVisibilityMonitoring();
            
            // 5. Periodic State Snapshots
            this.setupStateSnapshots();
            
            console.log('✅ All monitoring systems active\n');
        }
        
        setupAPIMonitoring() {
            if (!window.selectionManager || typeof window.selectionManager.selectJobNumber !== 'function') {
                console.log('⚠️ selectionManager.selectJobNumber not available');
                return;
            }
            
            // Store original function
            this.originalSelectJobNumber = window.selectionManager.selectJobNumber.bind(window.selectionManager);
            
            // Wrap with monitoring
            window.selectionManager.selectJobNumber = (jobNumber, source) => {
                if (this.isRecording) {
                    const apiCall = {
                        function: 'selectJobNumber',
                        jobNumber: jobNumber,
                        source: source,
                        timestamp: Date.now(),
                        timeFromStart: Date.now() - this.startTime,
                        stackTrace: new Error().stack
                    };
                    
                    this.testData.apiCalls.push(apiCall);
                    console.log(`📞 API CALL: selectJobNumber(${jobNumber}, "${source}")`);
                }
                return this.originalSelectJobNumber(jobNumber, source);
            };
            
            // Also monitor clearSelection if available
            if (typeof window.selectionManager.clearSelection === 'function') {
                this.originalClearSelection = window.selectionManager.clearSelection.bind(window.selectionManager);
                
                window.selectionManager.clearSelection = (source) => {
                    if (this.isRecording) {
                        const apiCall = {
                            function: 'clearSelection',
                            source: source,
                            timestamp: Date.now(),
                            timeFromStart: Date.now() - this.startTime
                        };
                        
                        this.testData.apiCalls.push(apiCall);
                        console.log(`📞 API CALL: clearSelection("${source}")`);
                    }
                    return this.originalClearSelection(source);
                };
            }
            
            console.log('✅ API monitoring active');
        }
        
        setupScrollMonitoring() {
            const initialPositions = this.testData.systemDiagnostics.scrollPositions;
            
            // Monitor scene container scrolling
            const sceneContainer = document.getElementById('scene-container');
            if (sceneContainer) {
                this.sceneScrollMonitor = setInterval(() => {
                    if (!this.isRecording) return;
                    
                    const currentScrollTop = sceneContainer.scrollTop;
                    const initialScrollTop = initialPositions['scene-container']?.scrollTop || 0;
                    const delta = Math.abs(currentScrollTop - initialScrollTop);
                    
                    if (delta > 10) {
                        const scrollEvent = {
                            container: 'scene-container',
                            initialScroll: initialScrollTop,
                            currentScroll: currentScrollTop,
                            delta: delta,
                            timestamp: Date.now(),
                            timeFromStart: Date.now() - this.startTime
                        };
                        
                        this.testData.scrollEvents.push(scrollEvent);
                        console.log(`📜 SCROLL: Scene container scrolled ${delta}px (${initialScrollTop} → ${currentScrollTop})`);
                        
                        // Update initial position to track further changes
                        initialPositions['scene-container'].scrollTop = currentScrollTop;
                    }
                }, 100);
            }
            
            // Monitor resume container scrolling
            const resumeContainer = document.getElementById('resume-container');
            if (resumeContainer) {
                this.resumeScrollMonitor = setInterval(() => {
                    if (!this.isRecording) return;
                    
                    const currentScrollTop = resumeContainer.scrollTop;
                    const initialScrollTop = initialPositions['resume-container']?.scrollTop || 0;
                    const delta = Math.abs(currentScrollTop - initialScrollTop);
                    
                    if (delta > 10) {
                        const scrollEvent = {
                            container: 'resume-container',
                            initialScroll: initialScrollTop,
                            currentScroll: currentScrollTop,
                            delta: delta,
                            timestamp: Date.now(),
                            timeFromStart: Date.now() - this.startTime
                        };
                        
                        this.testData.scrollEvents.push(scrollEvent);
                        console.log(`📜 SCROLL: Resume container scrolled ${delta}px`);
                        
                        // Update initial position
                        initialPositions['resume-container'].scrollTop = currentScrollTop;
                    }
                }, 100);
            }
            
            console.log('✅ Scroll monitoring active');
        }
        
        setupDOMMonitoring() {
            this.domObserver = new MutationObserver((mutations) => {
                if (!this.isRecording) return;
                
                mutations.forEach(mutation => {
                    if (mutation.type === 'attributes' && 
                        (mutation.attributeName === 'style' || mutation.attributeName === 'class')) {
                        
                        const change = {
                            type: mutation.type,
                            attributeName: mutation.attributeName,
                            target: {
                                tagName: mutation.target.tagName,
                                id: mutation.target.id,
                                className: mutation.target.className
                            },
                            oldValue: mutation.oldValue,
                            newValue: mutation.target.getAttribute(mutation.attributeName),
                            timestamp: Date.now(),
                            timeFromStart: Date.now() - this.startTime
                        };
                        
                        this.testData.domChanges.push(change);
                        console.log(`🔄 DOM: ${change.target.tagName}#${change.target.id} ${change.attributeName} changed`);
                    }
                });
            });
            
            this.domObserver.observe(document.body, {
                attributes: true,
                attributeOldValue: true,
                subtree: true,
                attributeFilter: ['style', 'class']
            });
            
            console.log('✅ DOM change monitoring active');
        }
        
        setupVisibilityMonitoring() {
            const targetJob = this.testData.triggeredBy.jobNumber;
            
            this.visibilityMonitor = setInterval(() => {
                if (!this.isRecording) return;
                
                // Find target cDiv
                const targetCDiv = document.querySelector(`.biz-card-div[data-job-number="${targetJob}"]`) ||
                                  document.querySelector(`#biz-card-div-${targetJob}`) ||
                                  document.querySelector(`#biz-card-div-${targetJob}-clone`);
                
                if (targetCDiv) {
                    const visibilityInfo = this.analyzeElementVisibility(targetCDiv, targetJob);
                    
                    // Only log significant visibility changes
                    const lastVisibility = this.testData.visibilityTracking[this.testData.visibilityTracking.length - 1];
                    if (!lastVisibility || Math.abs(lastVisibility.visibilityPercentage - visibilityInfo.visibilityPercentage) > 10) {
                        this.testData.visibilityTracking.push(visibilityInfo);
                        
                        if (visibilityInfo.visibilityPercentage > 50) {
                            console.log(`👁️ VISIBILITY: Target cDiv ${visibilityInfo.visibilityPercentage}% visible, ${visibilityInfo.visibleHeaders} headers visible`);
                        }
                    }
                }
            }, 200);
            
            console.log('✅ Visibility monitoring active');
        }
        
        analyzeElementVisibility(element, jobNumber) {
            const rect = element.getBoundingClientRect();
            const sceneContainer = document.getElementById('scene-container');
            const containerRect = sceneContainer ? sceneContainer.getBoundingClientRect() : null;
            
            let visibilityPercentage = 0;
            let isInContainer = false;
            
            if (containerRect) {
                isInContainer = this.isElementVisibleInContainer(rect, containerRect);
                visibilityPercentage = this.calculateVisibilityPercentage(rect, containerRect);
            }
            
            // Find and analyze headers
            const headerSelectors = ['.biz-details-employer', '.biz-card-header', '.job-title', '.company-name', '.biz-details-role'];
            const headers = [];
            let visibleHeaders = 0;
            
            headerSelectors.forEach(selector => {
                const header = element.querySelector(selector);
                if (header && containerRect) {
                    const headerRect = header.getBoundingClientRect();
                    const headerVisible = this.isElementVisibleInContainer(headerRect, containerRect);
                    const headerVisibility = this.calculateVisibilityPercentage(headerRect, containerRect);
                    
                    headers.push({
                        selector: selector,
                        text: header.textContent?.substring(0, 30),
                        visible: headerVisible,
                        visibilityPercentage: headerVisibility
                    });
                    
                    if (headerVisibility > 50) visibleHeaders++;
                }
            });
            
            return {
                jobNumber: jobNumber,
                elementId: element.id,
                timestamp: Date.now(),
                timeFromStart: Date.now() - this.startTime,
                visibilityPercentage: visibilityPercentage,
                isInContainer: isInContainer,
                headers: headers,
                visibleHeaders: visibleHeaders,
                rect: rect
            };
        }
        
        isElementVisibleInContainer(elementRect, containerRect) {
            return elementRect.top < containerRect.bottom && 
                   elementRect.bottom > containerRect.top &&
                   elementRect.left < containerRect.right && 
                   elementRect.right > containerRect.left;
        }
        
        calculateVisibilityPercentage(elementRect, containerRect) {
            const visibleTop = Math.max(elementRect.top, containerRect.top);
            const visibleLeft = Math.max(elementRect.left, containerRect.left);
            const visibleBottom = Math.min(elementRect.bottom, containerRect.bottom);
            const visibleRight = Math.min(elementRect.right, containerRect.right);
            
            if (visibleTop >= visibleBottom || visibleLeft >= visibleRight) {
                return 0;
            }
            
            const visibleArea = (visibleRight - visibleLeft) * (visibleBottom - visibleTop);
            const totalArea = elementRect.width * elementRect.height;
            
            return totalArea > 0 ? Math.round((visibleArea / totalArea) * 100) : 0;
        }
        
        setupStateSnapshots() {
            this.stateSnapshotInterval = setInterval(() => {
                if (!this.isRecording) return;
                
                const snapshot = {
                    timestamp: Date.now(),
                    timeFromStart: Date.now() - this.startTime,
                    selectedJob: window.selectionManager?.getSelectedJobNumber?.() || null,
                    scrollPositions: this.captureCurrentScrollPositions(),
                    visibleElements: this.captureVisibleElements()
                };
                
                this.testData.stateSnapshots.push(snapshot);
            }, 500);
            
            console.log('✅ State snapshot monitoring active');
        }
        
        captureCurrentScrollPositions() {
            const positions = {};
            
            ['scene-container', 'resume-container'].forEach(containerId => {
                const container = document.getElementById(containerId);
                if (container) {
                    positions[containerId] = {
                        scrollTop: container.scrollTop,
                        scrollLeft: container.scrollLeft
                    };
                }
            });
            
            return positions;
        }
        
        captureVisibleElements() {
            const visible = { cardDivs: [], resumeDivs: [] };
            
            // Capture visible card divs
            document.querySelectorAll('.biz-card-div').forEach(div => {
                const rect = div.getBoundingClientRect();
                const sceneContainer = document.getElementById('scene-container');
                
                if (sceneContainer) {
                    const containerRect = sceneContainer.getBoundingClientRect();
                    const visibilityPercentage = this.calculateVisibilityPercentage(rect, containerRect);
                    
                    if (visibilityPercentage > 25) {
                        visible.cardDivs.push({
                            jobNumber: parseInt(div.getAttribute('data-job-number')),
                            visibilityPercentage: visibilityPercentage,
                            id: div.id
                        });
                    }
                }
            });
            
            return visible;
        }
        
        async stopAutomatedRecording() {
            if (!this.isRecording) return;
            
            this.isRecording = false;
            
            // Clear all monitoring intervals and observers
            if (this.autoStopTimer) clearTimeout(this.autoStopTimer);
            if (this.sceneScrollMonitor) clearInterval(this.sceneScrollMonitor);
            if (this.resumeScrollMonitor) clearInterval(this.resumeScrollMonitor);
            if (this.stateSnapshotInterval) clearInterval(this.stateSnapshotInterval);
            if (this.visibilityMonitor) clearInterval(this.visibilityMonitor);
            if (this.domObserver) this.domObserver.disconnect();
            
            // Restore original API functions
            if (this.originalSelectJobNumber) {
                window.selectionManager.selectJobNumber = this.originalSelectJobNumber;
            }
            if (this.originalClearSelection) {
                window.selectionManager.clearSelection = this.originalClearSelection;
            }
            
            // Finalize test data
            this.testData.endTime = new Date().toISOString();
            this.testData.duration = Date.now() - this.startTime;
            
            console.log('\n⏹️ AUTOMATED RECORDING STOPPED');
            console.log('='.repeat(50));
            console.log(`⏱️ Duration: ${Math.round(this.testData.duration / 1000 * 100) / 100} seconds`);
            console.log(`📊 Data captured: ${this.testData.apiCalls.length} API calls, ${this.testData.scrollEvents.length} scroll events, ${this.testData.visibilityTracking.length} visibility changes`);
            console.log('🤖 Running automated analysis...\n');
            
            // Run comprehensive automated analysis
            await this.runAutomaticAnalysis();
        }
        
        async runAutomaticAnalysis() {
            console.log('🔬 AUTOMATED ANALYSIS ENGINE STARTING...');
            
            const analysis = {
                sessionId: this.testData.sessionId,
                timestamp: new Date().toISOString(),
                testResults: {},
                overallScore: 0,
                determination: 'UNKNOWN',
                issues: [],
                recommendations: [],
                rawData: {
                    apiCalls: this.testData.apiCalls.length,
                    scrollEvents: this.testData.scrollEvents.length,
                    visibilityChanges: this.testData.visibilityTracking.length,
                    domChanges: this.testData.domChanges.length,
                    stateSnapshots: this.testData.stateSnapshots.length
                }
            };
            
            // Test 1: Trigger Analysis
            analysis.testResults.trigger = this.analyzeTrigger();
            
            // Test 2: API Call Analysis
            analysis.testResults.apiCall = this.analyzeAPICall();
            
            // Test 3: Source Parameter Analysis
            analysis.testResults.sourceParam = this.analyzeSourceParameter();
            
            // Test 4: Scroll Behavior Analysis
            analysis.testResults.scrollBehavior = this.analyzeScrollBehavior();
            
            // Test 5: Target Visibility Analysis
            analysis.testResults.targetVisibility = this.analyzeTargetVisibility();
            
            // Calculate overall score and determination
            this.calculateOverallResult(analysis);
            
            // Generate issues and recommendations
            this.generateRecommendations(analysis);
            
            // Store analysis in test data
            this.testData.automaticAnalysis = analysis;
            
            // Display results
            this.displayAnalysisResults(analysis);
            
            // Send to server for storage
            await this.sendToServer();
        }
        
        analyzeTrigger() {
            const trigger = this.testData.triggeredBy;
            return {
                passed: trigger.type === 'rDiv' && !isNaN(trigger.jobNumber),
                score: (trigger.type === 'rDiv' && !isNaN(trigger.jobNumber)) ? 100 : 0,
                details: `${trigger.type} click on Job ${trigger.jobNumber} at ${trigger.semanticArea}`,
                data: trigger
            };
        }
        
        analyzeAPICall() {
            const targetJob = this.testData.triggeredBy.jobNumber;
            const apiCalls = this.testData.apiCalls;
            
            const hasCorrectCall = apiCalls.some(call => 
                call.function === 'selectJobNumber' && call.jobNumber === targetJob
            );
            
            return {
                passed: hasCorrectCall,
                score: hasCorrectCall ? 100 : 0,
                details: hasCorrectCall 
                    ? `selectJobNumber(${targetJob}) called successfully`
                    : `selectJobNumber(${targetJob}) not called`,
                data: {
                    totalCalls: apiCalls.length,
                    targetJob: targetJob,
                    relevantCalls: apiCalls.filter(call => call.jobNumber === targetJob)
                }
            };
        }
        
        analyzeSourceParameter() {
            const targetJob = this.testData.triggeredBy.jobNumber;
            const relevantCalls = this.testData.apiCalls.filter(call => 
                call.function === 'selectJobNumber' && call.jobNumber === targetJob
            );
            
            if (relevantCalls.length === 0) {
                return {
                    passed: false,
                    score: 0,
                    details: 'No relevant API calls found',
                    data: { relevantCalls: 0 }
                };
            }
            
            const hasCorrectSource = relevantCalls.some(call => {
                const source = call.source || '';
                return source.includes('ResumeListController') || source.includes('handleBizResumeDivClickEvent');
            });
            
            const sourceUsed = relevantCalls[0]?.source || 'unknown';
            
            return {
                passed: hasCorrectSource,
                score: hasCorrectSource ? 100 : 0,
                details: hasCorrectSource 
                    ? `Correct source parameter: ${sourceUsed}`
                    : `Incorrect source parameter: ${sourceUsed}`,
                data: {
                    expectedSource: 'ResumeListController',
                    actualSource: sourceUsed
                }
            };
        }
        
        analyzeScrollBehavior() {
            const scrollEvents = this.testData.scrollEvents;
            
            // For rDiv click, expect scene container to scroll
            const sceneScrollEvents = scrollEvents.filter(event => event.container === 'scene-container');
            const hasSignificantScroll = sceneScrollEvents.some(event => event.delta > 10);
            
            let maxDelta = 0;
            if (sceneScrollEvents.length > 0) {
                maxDelta = Math.max(...sceneScrollEvents.map(event => event.delta));
            }
            
            return {
                passed: hasSignificantScroll,
                score: hasSignificantScroll ? 100 : 0,
                details: hasSignificantScroll 
                    ? `Scene container scrolled ${Math.round(maxDelta)}px`
                    : `Scene container did not scroll significantly (max: ${Math.round(maxDelta)}px)`,
                data: {
                    totalScrollEvents: scrollEvents.length,
                    sceneScrollEvents: sceneScrollEvents.length,
                    maxScrollDelta: maxDelta
                }
            };
        }
        
        analyzeTargetVisibility() {
            const targetJob = this.testData.triggeredBy.jobNumber;
            const visibilityTracking = this.testData.visibilityTracking;
            
            if (visibilityTracking.length === 0) {
                return {
                    passed: false,
                    score: 0,
                    details: 'No visibility data captured',
                    data: { trackingEntries: 0 }
                };
            }
            
            // Get final visibility state
            const finalVisibility = visibilityTracking[visibilityTracking.length - 1];
            const isTargetVisible = finalVisibility.visibilityPercentage >= 50;
            const hasVisibleHeaders = finalVisibility.visibleHeaders > 0;
            
            const passed = isTargetVisible && hasVisibleHeaders;
            
            return {
                passed: passed,
                score: passed ? 100 : (isTargetVisible ? 75 : 0),
                details: passed 
                    ? `Target cDiv ${finalVisibility.visibilityPercentage}% visible with ${finalVisibility.visibleHeaders} headers`
                    : `Target cDiv not sufficiently visible (${finalVisibility.visibilityPercentage}%, ${finalVisibility.visibleHeaders} headers)`,
                data: {
                    finalVisibility: finalVisibility.visibilityPercentage,
                    visibleHeaders: finalVisibility.visibleHeaders,
                    trackingEntries: visibilityTracking.length
                }
            };
        }
        
        calculateOverallResult(analysis) {
            const weights = {
                trigger: 0.15,
                apiCall: 0.25,
                sourceParam: 0.20,
                scrollBehavior: 0.25,
                targetVisibility: 0.15
            };
            
            let weightedScore = 0;
            Object.keys(weights).forEach(testKey => {
                const test = analysis.testResults[testKey];
                if (test) {
                    weightedScore += (test.score / 100) * weights[testKey];
                }
            });
            
            analysis.overallScore = Math.round(weightedScore * 100);
            
            if (analysis.overallScore >= 85) {
                analysis.determination = 'SUCCESS - Bidirectional sync working correctly';
            } else if (analysis.overallScore >= 70) {
                analysis.determination = 'PARTIAL SUCCESS - Minor issues detected';
            } else if (analysis.overallScore >= 50) {
                analysis.determination = 'FAILURE - Significant synchronization problems';
            } else {
                analysis.determination = 'CRITICAL FAILURE - Bidirectional sync not functioning';
            }
        }
        
        generateRecommendations(analysis) {
            const issues = [];
            const recommendations = [];
            
            Object.keys(analysis.testResults).forEach(testKey => {
                const test = analysis.testResults[testKey];
                if (!test.passed) {
                    switch(testKey) {
                        case 'apiCall':
                            issues.push('selectJobNumber API not called correctly');
                            recommendations.push('Check if selectionManager.selectJobNumber is being called from rDiv click handler');
                            break;
                        case 'sourceParam':
                            issues.push('Incorrect source parameter in API call');
                            recommendations.push('Verify ResumeListController is passing correct source parameter');
                            break;
                        case 'scrollBehavior':
                            issues.push('Scene container did not scroll');
                            recommendations.push('Check if scene container scroll functionality is implemented');
                            break;
                        case 'targetVisibility':
                            issues.push('Target cDiv not scrolled into view properly');
                            recommendations.push('Verify target cDiv is being scrolled into view with visible headers');
                            break;
                    }
                }
            });
            
            analysis.issues = issues;
            analysis.recommendations = recommendations;
        }
        
        displayAnalysisResults(analysis) {
            console.log('🎯 AUTOMATED ANALYSIS COMPLETE!');
            console.log('='.repeat(60));
            console.log(`📊 Session: ${analysis.sessionId}`);
            console.log(`🏆 Overall Score: ${analysis.overallScore}%`);
            console.log(`📋 Determination: ${analysis.determination}`);
            console.log('='.repeat(60));
            
            console.log('\n🔍 DETAILED TEST RESULTS:');
            Object.keys(analysis.testResults).forEach(testKey => {
                const test = analysis.testResults[testKey];
                const status = test.passed ? '✅' : '❌';
                console.log(`   ${status} ${testKey.toUpperCase()}: ${test.details} (${test.score}%)`);
            });
            
            if (analysis.issues.length > 0) {
                console.log('\n⚠️ ISSUES IDENTIFIED:');
                analysis.issues.forEach((issue, index) => {
                    console.log(`   ${index + 1}. ${issue}`);
                });
            }
            
            if (analysis.recommendations.length > 0) {
                console.log('\n💡 RECOMMENDATIONS:');
                analysis.recommendations.forEach((rec, index) => {
                    console.log(`   ${index + 1}. ${rec}`);
                });
            }
            
            console.log(`\n📈 PERFORMANCE METRICS:`);
            console.log(`   ⏱️ Test Duration: ${Math.round(this.testData.duration / 1000 * 100) / 100}s`);
            console.log(`   📞 API Calls Captured: ${analysis.rawData.apiCalls}`);
            console.log(`   📜 Scroll Events: ${analysis.rawData.scrollEvents}`);
            console.log(`   👁️ Visibility Changes: ${analysis.rawData.visibilityChanges}`);
            console.log(`   🔄 DOM Changes: ${analysis.rawData.domChanges}`);
            console.log(`   📸 State Snapshots: ${analysis.rawData.stateSnapshots}`);
            
            if (analysis.overallScore >= 85) {
                console.log('\n🎉 SUCCESS: rDiv-cDiv bidirectional synchronization is working correctly!');
                console.log('✅ The system properly handles rDiv clicks and scrolls target cDivs into view');
            } else {
                console.log('\n❌ FAILURE: rDiv-cDiv bidirectional synchronization has issues');
                console.log('🔧 Review the recommendations above to fix the identified problems');
            }
            
            console.log('\n' + '='.repeat(60));
            console.log('🤖 Automated analysis complete. Click another rDiv to test again.');
            console.log('='.repeat(60));
        }
        
        async sendToServer() {
            try {
                console.log('\n📤 Sending comprehensive test data to server...');
                
                const response = await fetch('/api/event-data', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sessionId: this.testData.sessionId,
                        trigger: this.testData.triggeredBy,
                        apiCalls: this.testData.apiCalls,
                        scrollEvents: this.testData.scrollEvents,
                        stateSnapshots: this.testData.stateSnapshots,
                        visibilityTracking: this.testData.visibilityTracking,
                        domChanges: this.testData.domChanges,
                        systemDiagnostics: this.testData.systemDiagnostics,
                        automaticAnalysis: this.testData.automaticAnalysis,
                        clickTriggered: true
                    })
                });
                
                if (response.ok) {
                    const result = await response.json();
                    console.log('✅ Test data sent successfully to server');
                    console.log(`🌐 View detailed analysis at: http://localhost:3009/analysis-dashboard`);
                } else {
                    console.log('⚠️ Server response error, but local analysis complete');
                }
            } catch (error) {
                console.log('⚠️ Could not send to server, but local analysis complete');
            }
            
            // Also save locally
            this.saveLocalBackup();
        }
        
        saveLocalBackup() {
            const jsonData = JSON.stringify(this.testData, null, 2);
            const blob = new Blob([jsonData], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `click-triggered-test-${this.testData.sessionId}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            console.log(`💾 Complete test data saved locally as: click-triggered-test-${this.testData.sessionId}.json`);
        }
        
        getStatus() {
            return {
                isRecording: this.isRecording,
                sessionId: this.testData?.sessionId,
                startTime: this.startTime,
                duration: this.startTime ? Date.now() - this.startTime : 0,
                hasResults: !!this.testData?.automaticAnalysis
            };
        }
    }
    
    // Initialize the click-triggered automated tester
    const clickTriggeredTester = new ClickTriggeredAutomatedTester();
    
    // Make status function available
    window.getClickTriggeredTestStatus = () => clickTriggeredTester.getStatus();
    window.clickTriggeredTester = clickTriggeredTester;
    
    console.log('🎯 CLICK-TRIGGERED AUTOMATED TESTER ACTIVE');
    console.log('📊 Waiting for your rDiv click to automatically start comprehensive testing...');
    console.log('⏹️ Press ESC to stop recording and get automated analysis results');
    console.log('\n💡 Available function: getClickTriggeredTestStatus()');
    
})();