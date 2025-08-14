// AUTOMATED RECORDER - Fully automated recording and analysis system
// Records events from rDiv click to ESC key and automatically sends to server for analysis

(function() {
    console.clear();
    console.log('🤖 AUTOMATED RECORDER - Fully Automated Event Recording & Analysis');
    console.log('📊 Records rDiv clicks → ESC key, automatically analyzes via server\n');
    
    class AutomatedEventRecorder {
        constructor() {
            this.isRecording = false;
            this.startTime = null;
            this.eventData = null;
            this.setupEventCapture();
            this.runInitialDiagnostics();
        }
        
        runInitialDiagnostics() {
            const diagnostics = {
                timestamp: new Date().toISOString(),
                resumeDivs: document.querySelectorAll('.biz-resume-div').length,
                cardDivs: document.querySelectorAll('.biz-card-div').length,
                selectionManager: !!window.selectionManager,
                sceneContainer: !!document.getElementById('scene-container'),
                resumeContainer: !!document.getElementById('resume-container'),
                serverConnectable: false
            };
            
            // Test server connectivity
            fetch('/api/event-data', { method: 'OPTIONS' })
                .then(() => {
                    diagnostics.serverConnectable = true;
                    console.log('✅ Server connectivity confirmed');
                })
                .catch(() => {
                    console.log('⚠️ Server not reachable - analysis will be limited');
                });
            
            console.log('🔍 SYSTEM DIAGNOSTICS:');
            console.log(`   📝 Resume Divs: ${diagnostics.resumeDivs}`);
            console.log(`   🗃️ Card Divs: ${diagnostics.cardDivs}`);
            console.log(`   🎯 Selection Manager: ${diagnostics.selectionManager}`);
            console.log(`   📦 Containers: ${diagnostics.sceneContainer && diagnostics.resumeContainer ? 'Ready' : 'Missing'}`);
            
            this.systemDiagnostics = diagnostics;
            
            if (diagnostics.resumeDivs > 0 && diagnostics.cardDivs > 0) {
                console.log('✅ SYSTEM READY - Click any rDiv to start automated recording');
            } else {
                console.log('⚠️ System not ready - waiting for elements to load...');
            }
        }
        
        setupEventCapture() {
            // Monitor for rDiv clicks to start recording
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
            
            console.log(`\n🎬 AUTOMATED RECORDING STARTED`);
            console.log(`🎯 Target: rDiv Job ${jobNumber}`);
            console.log(`📍 Click: (${clickEvent.clientX}, ${clickEvent.clientY})`);
            console.log('⏳ Recording until ESC key pressed...\n');
            
            // Initialize event data structure
            this.eventData = {
                sessionId: `auto-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
                startTime: new Date().toISOString(),
                systemDiagnostics: this.systemDiagnostics,
                trigger: this.captureTriggerDetails(jobNumber, clickEvent),
                apiCalls: [],
                scrollEvents: [],
                stateSnapshots: [],
                events: [],
                endTime: null,
                duration: null
            };
            
            // Start comprehensive monitoring
            this.wrapAPIFunctions();
            this.startScrollMonitoring();
            this.startStateSnapshots();
            this.startEventLogging();
            
            // Auto-stop after 15 seconds if ESC not pressed
            this.autoStopTimeout = setTimeout(() => {
                if (this.isRecording) {
                    console.log('⏰ Auto-stopping after 15 seconds...');
                    this.stopAutomatedRecording();
                }
            }, 15000);
        }
        
        captureTriggerDetails(jobNumber, clickEvent) {
            const resumeDiv = clickEvent.target.closest('.biz-resume-div');
            const rect = resumeDiv.getBoundingClientRect();
            
            return {
                type: 'rDiv',
                jobNumber: jobNumber,
                coordinates: { x: clickEvent.clientX, y: clickEvent.clientY },
                target: {
                    tagName: clickEvent.target.tagName,
                    className: clickEvent.target.className,
                    id: clickEvent.target.id,
                    textContent: clickEvent.target.textContent?.substring(0, 50)
                },
                element: {
                    id: resumeDiv.id,
                    className: resumeDiv.className,
                    rect: rect
                },
                semanticArea: this.identifyClickArea(clickEvent.target, resumeDiv),
                relativePosition: {
                    x: clickEvent.clientX - rect.left,
                    y: clickEvent.clientY - rect.top,
                    percentX: Math.round(((clickEvent.clientX - rect.left) / rect.width) * 100),
                    percentY: Math.round(((clickEvent.clientY - rect.top) / rect.height) * 100)
                }
            };
        }
        
        identifyClickArea(clickedElement, resumeDiv) {
            // Determine semantic area of click
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
        
        wrapAPIFunctions() {
            if (!window.selectionManager) return;
            
            // Wrap selectJobNumber
            if (typeof window.selectionManager.selectJobNumber === 'function') {
                const originalSelect = window.selectionManager.selectJobNumber.bind(window.selectionManager);
                
                window.selectionManager.selectJobNumber = (jobNumber, source) => {
                    if (this.isRecording) {
                        console.log(`📞 API: selectJobNumber(${jobNumber}, "${source}")`);
                        this.eventData.apiCalls.push({
                            function: 'selectJobNumber',
                            jobNumber: jobNumber,
                            source: source,
                            timestamp: Date.now(),
                            timeFromStart: Date.now() - this.startTime
                        });
                    }
                    return originalSelect(jobNumber, source);
                };
            }
            
            // Wrap clearSelection
            if (typeof window.selectionManager.clearSelection === 'function') {
                const originalClear = window.selectionManager.clearSelection.bind(window.selectionManager);
                
                window.selectionManager.clearSelection = (source) => {
                    if (this.isRecording) {
                        console.log(`📞 API: clearSelection("${source}")`);
                        this.eventData.apiCalls.push({
                            function: 'clearSelection',
                            source: source,
                            timestamp: Date.now(),
                            timeFromStart: Date.now() - this.startTime
                        });
                    }
                    return originalClear(source);
                };
            }
        }
        
        startScrollMonitoring() {
            const containers = ['scene-container', 'resume-container'];
            const initialScrollPositions = {};
            
            // Capture initial scroll positions
            containers.forEach(containerId => {
                const container = document.getElementById(containerId);
                if (container) {
                    initialScrollPositions[containerId] = {
                        scrollTop: container.scrollTop,
                        scrollLeft: container.scrollLeft
                    };
                }
            });
            
            // Monitor for scroll changes
            this.scrollMonitorInterval = setInterval(() => {
                if (!this.isRecording) return;
                
                containers.forEach(containerId => {
                    const container = document.getElementById(containerId);
                    if (container && initialScrollPositions[containerId]) {
                        const currentScroll = {
                            scrollTop: container.scrollTop,
                            scrollLeft: container.scrollLeft
                        };
                        
                        const deltaTop = Math.abs(currentScroll.scrollTop - initialScrollPositions[containerId].scrollTop);
                        const deltaLeft = Math.abs(currentScroll.scrollLeft - initialScrollPositions[containerId].scrollLeft);
                        
                        if (deltaTop > 5 || deltaLeft > 5) {
                            console.log(`📜 SCROLL: ${containerId} scrolled (${deltaTop}px, ${deltaLeft}px)`);
                            
                            this.eventData.scrollEvents.push({
                                container: containerId,
                                initialScroll: initialScrollPositions[containerId],
                                currentScroll: currentScroll,
                                delta: Math.max(deltaTop, deltaLeft),
                                timestamp: Date.now(),
                                timeFromStart: Date.now() - this.startTime
                            });
                            
                            // Update initial position to avoid duplicate events
                            initialScrollPositions[containerId] = currentScroll;
                        }
                    }
                });
            }, 200); // Check every 200ms
        }
        
        startStateSnapshots() {
            this.stateSnapshotInterval = setInterval(() => {
                if (!this.isRecording) return;
                
                this.eventData.stateSnapshots.push(this.captureStateSnapshot());
            }, 500); // Every 500ms
        }
        
        captureStateSnapshot() {
            const snapshot = {
                timestamp: Date.now(),
                timeFromStart: Date.now() - this.startTime,
                scrollPositions: this.captureScrollPositions(),
                visibleElements: this.captureVisibleElements(),
                selectedJob: window.selectionManager?.getSelectedJobNumber?.() || null
            };
            
            return snapshot;
        }
        
        captureScrollPositions() {
            const positions = {};
            
            ['scene-container', 'resume-container'].forEach(containerId => {
                const container = document.getElementById(containerId);
                if (container) {
                    positions[containerId] = {
                        scrollTop: container.scrollTop,
                        scrollLeft: container.scrollLeft,
                        scrollHeight: container.scrollHeight,
                        scrollWidth: container.scrollWidth,
                        clientHeight: container.clientHeight,
                        clientWidth: container.clientWidth
                    };
                }
            });
            
            positions.window = {
                scrollX: window.scrollX,
                scrollY: window.scrollY
            };
            
            return positions;
        }
        
        captureVisibleElements() {
            const visible = {
                cardDivs: [],
                resumeDivs: []
            };
            
            // Capture visible card divs (cDivs)
            document.querySelectorAll('.biz-card-div').forEach(div => {
                const rect = div.getBoundingClientRect();
                const sceneContainer = document.getElementById('scene-container');
                
                if (sceneContainer && this.isElementVisibleInContainer(rect, sceneContainer.getBoundingClientRect())) {
                    const jobNumber = parseInt(div.getAttribute('data-job-number'));
                    const visibilityPercentage = this.calculateVisibilityPercentage(rect, sceneContainer.getBoundingClientRect());
                    
                    visible.cardDivs.push({
                        id: div.id,
                        jobNumber: jobNumber,
                        visibilityPercentage: visibilityPercentage,
                        rect: rect,
                        headers: this.findVisibleHeaders(div, 'card')
                    });
                }
            });
            
            // Capture visible resume divs (rDivs)
            document.querySelectorAll('.biz-resume-div').forEach(div => {
                const rect = div.getBoundingClientRect();
                const resumeContainer = document.getElementById('resume-container');
                
                if (resumeContainer && this.isElementVisibleInContainer(rect, resumeContainer.getBoundingClientRect())) {
                    const jobNumber = parseInt(div.getAttribute('data-job-number'));
                    const visibilityPercentage = this.calculateVisibilityPercentage(rect, resumeContainer.getBoundingClientRect());
                    
                    visible.resumeDivs.push({
                        id: div.id,
                        jobNumber: jobNumber,
                        visibilityPercentage: visibilityPercentage,
                        rect: rect,
                        headers: this.findVisibleHeaders(div, 'resume')
                    });
                }
            });
            
            return visible;
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
        
        findVisibleHeaders(element, type) {
            const headerSelectors = type === 'card' ? [
                '.biz-details-employer',
                '.biz-card-header', 
                '.job-title',
                '.company-name',
                '.biz-details-role'
            ] : [
                '.biz-resume-details-div',
                '.resume-header',
                '.job-title',
                '.company-name'
            ];
            
            const headers = [];
            headerSelectors.forEach(selector => {
                const header = element.querySelector(selector);
                if (header) {
                    const headerRect = header.getBoundingClientRect();
                    const container = type === 'card' ? 
                        document.getElementById('scene-container') : 
                        document.getElementById('resume-container');
                    
                    let visible = false;
                    let visibilityPercentage = 0;
                    
                    if (container) {
                        const containerRect = container.getBoundingClientRect();
                        visible = this.isElementVisibleInContainer(headerRect, containerRect);
                        visibilityPercentage = this.calculateVisibilityPercentage(headerRect, containerRect);
                    }
                    
                    headers.push({
                        selector: selector,
                        text: header.textContent?.substring(0, 50),
                        visible: visible,
                        visibilityPercentage: visibilityPercentage,
                        rect: headerRect
                    });
                }
            });
            
            return headers;
        }
        
        startEventLogging() {
            // Log important events during recording
            const eventTypes = ['click', 'scroll', 'keydown', 'keyup'];
            
            eventTypes.forEach(eventType => {
                document.addEventListener(eventType, (event) => {
                    if (!this.isRecording) return;
                    
                    this.eventData.events.push({
                        type: eventType,
                        timestamp: Date.now(),
                        timeFromStart: Date.now() - this.startTime,
                        target: {
                            tagName: event.target?.tagName,
                            id: event.target?.id,
                            className: event.target?.className
                        },
                        details: this.captureEventSpecificDetails(event, eventType)
                    });
                }, true);
            });
        }
        
        captureEventSpecificDetails(event, eventType) {
            const details = {};
            
            switch(eventType) {
                case 'click':
                    details.coordinates = { x: event.clientX, y: event.clientY };
                    details.button = event.button;
                    break;
                case 'scroll':
                    details.scrollTop = event.target?.scrollTop;
                    details.scrollLeft = event.target?.scrollLeft;
                    break;
                case 'keydown':
                case 'keyup':
                    details.key = event.key;
                    details.code = event.code;
                    details.ctrlKey = event.ctrlKey;
                    details.altKey = event.altKey;
                    details.shiftKey = event.shiftKey;
                    break;
            }
            
            return details;
        }
        
        async stopAutomatedRecording() {
            if (!this.isRecording) return;
            
            this.isRecording = false;
            
            // Clear intervals and timeouts
            if (this.scrollMonitorInterval) clearInterval(this.scrollMonitorInterval);
            if (this.stateSnapshotInterval) clearInterval(this.stateSnapshotInterval);
            if (this.autoStopTimeout) clearTimeout(this.autoStopTimeout);
            
            // Finalize event data
            this.eventData.endTime = new Date().toISOString();
            this.eventData.duration = Date.now() - this.startTime;
            
            console.log(`\n⏹️ AUTOMATED RECORDING STOPPED`);
            console.log(`⏱️ Duration: ${Math.round(this.eventData.duration / 1000 * 100) / 100} seconds`);
            console.log(`📊 Captured: ${this.eventData.apiCalls.length} API calls, ${this.eventData.scrollEvents.length} scroll events`);
            console.log('🔄 Sending to server for automated analysis...\n');
            
            // Send to server for automated analysis
            await this.sendForAutomatedAnalysis();
        }
        
        async sendForAutomatedAnalysis() {
            try {
                console.log('📤 Transmitting event data to analysis engine...');
                
                const response = await fetch('/api/event-data', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(this.eventData)
                });
                
                if (response.ok) {
                    const result = await response.json();
                    const analysis = result.analysis;
                    
                    console.log('🎯 AUTOMATED ANALYSIS COMPLETE!');
                    console.log('='.repeat(50));
                    console.log(`📊 Session: ${analysis.sessionId}`);
                    console.log(`🏆 Overall Score: ${analysis.overallScore}%`);
                    console.log(`📋 Determination: ${analysis.determination}`);
                    console.log('='.repeat(50));
                    
                    console.log('🔍 DETAILED RESULTS:');
                    Object.keys(analysis.testResults).forEach(testKey => {
                        const test = analysis.testResults[testKey];
                        const status = test.passed ? '✅' : '❌';
                        console.log(`   ${status} ${testKey.toUpperCase()}: ${test.details}`);
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
                    
                    if (analysis.overallScore >= 85) {
                        console.log('\n🎉 SUCCESS: rDiv-cDiv bidirectional synchronization is working correctly!');
                    } else {
                        console.log('\n❌ FAILURE: rDiv-cDiv bidirectional synchronization has issues that need to be addressed.');
                    }
                    
                    console.log(`\n📄 View detailed reports at: http://localhost:3009/analysis-dashboard`);
                    console.log('🔄 Ready for next test - click another rDiv to start new recording\n');
                    
                } else {
                    const error = await response.json();
                    console.error('❌ Server analysis failed:', error);
                    this.fallbackLocalAnalysis();
                }
                
            } catch (error) {
                console.error('❌ Failed to send data to server:', error);
                this.fallbackLocalAnalysis();
            }
        }
        
        fallbackLocalAnalysis() {
            console.log('🔧 Server unavailable - performing basic local analysis...');
            
            const targetJob = this.eventData.trigger.jobNumber;
            const hasAPICall = this.eventData.apiCalls.some(call => 
                call.function === 'selectJobNumber' && call.jobNumber === targetJob
            );
            const hasScroll = this.eventData.scrollEvents.some(event => 
                event.container === 'scene-container' && event.delta > 10
            );
            
            console.log('📊 BASIC LOCAL ANALYSIS:');
            console.log(`   ✓ API Call: ${hasAPICall ? '✅' : '❌'} selectJobNumber(${targetJob})`);
            console.log(`   ✓ Scrolling: ${hasScroll ? '✅' : '❌'} Scene container scrolled`);
            console.log(`   📁 Local data available for manual inspection`);
            
            // Save locally as fallback
            this.saveLocalBackup();
        }
        
        saveLocalBackup() {
            const jsonData = JSON.stringify(this.eventData, null, 2);
            const blob = new Blob([jsonData], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `automated-recording-${this.eventData.sessionId}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            console.log(`💾 Backup saved as: automated-recording-${this.eventData.sessionId}.json`);
        }
        
        getStatus() {
            return {
                isRecording: this.isRecording,
                sessionId: this.eventData?.sessionId,
                startTime: this.startTime,
                duration: this.startTime ? Date.now() - this.startTime : 0,
                eventsCaptured: this.eventData?.events?.length || 0,
                apiCallsCaptured: this.eventData?.apiCalls?.length || 0
            };
        }
    }
    
    // Initialize the automated recorder
    const automatedRecorder = new AutomatedEventRecorder();
    
    // Make status function globally available
    window.getAutomatedRecorderStatus = () => automatedRecorder.getStatus();
    window.automatedRecorder = automatedRecorder;
    
    console.log('🤖 AUTOMATED RECORDER ACTIVE!');
    console.log('🎯 Click any rDiv to start fully automated recording and analysis');
    console.log('⏹️ Press ESC to stop recording and get automated analysis results');
    console.log('🌐 Results will be automatically analyzed and saved to server');
    console.log('\n📊 Available function: getAutomatedRecorderStatus()');
    
})();

console.log('🤖 AUTOMATED RECORDER LOADED - Ready for fully automated testing!');