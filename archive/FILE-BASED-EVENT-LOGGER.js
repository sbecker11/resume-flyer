// FILE-BASED EVENT LOGGER - Logs to file and evaluates DOM/API behavior directly
// Copy this entire script into browser console after app loads

(function() {
    console.log('📁 FILE-BASED EVENT LOGGER - Direct DOM/API Monitoring\n');
    
    class FileBidirectionalLogger {
        constructor() {
            this.logData = {
                sessionStart: new Date().toISOString(),
                interactions: [],
                systemState: {},
                evaluations: []
            };
            
            this.isMonitoring = false;
            this.setupDirectMonitoring();
            this.captureInitialState();
        }
        
        captureInitialState() {
            this.logData.systemState = {
                timestamp: Date.now(),
                hasSelectionManager: !!window.selectionManager,
                selectionManagerId: window.selectionManager?.instanceId,
                listenersReady: !!window._cardsControllerListenersReady,
                resumeDivCount: document.querySelectorAll('.biz-resume-div').length,
                cardDivCount: document.querySelectorAll('.biz-card-div').length,
                currentSelection: window.selectionManager?.getSelectedJobNumber()
            };
        }
        
        setupDirectMonitoring() {
            // Direct DOM event monitoring - starts recording on first relevant click
            document.addEventListener('click', (event) => {
                const target = event.target;
                const resumeDiv = target.closest('.biz-resume-div');
                const cardDiv = target.closest('.biz-card-div');
                
                // Check if this is a relevant click (resume or card div)
                if (resumeDiv || cardDiv) {
                    // Start recording session on first relevant click
                    if (!this.isMonitoring) {
                        this.startRecordingSession();
                    }
                    
                    if (resumeDiv) {
                        const jobNumber = parseInt(resumeDiv.getAttribute('data-job-number'));
                        this.logInteraction('RESUME_CLICK', jobNumber, event);
                    } else if (cardDiv) {
                        const jobNumber = parseInt(cardDiv.getAttribute('data-job-number'));
                        this.logInteraction('CARD_CLICK', jobNumber, event);
                    }
                }
            }, true);
            
            // ESC key to stop recording sessions
            document.addEventListener('keydown', (event) => {
                if (event.key === 'Escape' && this.isMonitoring) {
                    event.preventDefault();
                    console.log('\n⌨️ ESC key pressed - stopping recording...');
                    this.stopMonitoring();
                }
            }, true);
            
            // Monitor selectionManager API calls directly
            if (window.selectionManager) {
                this.wrapSelectionManagerMethods();
            }
        }
        
        startRecordingSession() {
            this.isMonitoring = true;
            
            // Reset session data for new recording
            this.logData = {
                sessionStart: new Date().toISOString(),
                interactions: [],
                systemState: {},
                evaluations: []
            };
            
            // Capture fresh system state at start of recording
            this.captureInitialState();
            
            console.log('\n🎯 RECORDING STARTED - First click detected!');
            console.log('📊 Session will automatically save when stopped');
            console.log('⏹️ Use stopFileBasedMonitoring() or press ESC key to end session\n');
        }
        
        wrapSelectionManagerMethods() {
            const originalSelectJobNumber = window.selectionManager.selectJobNumber.bind(window.selectionManager);
            const originalClearSelection = window.selectionManager.clearSelection.bind(window.selectionManager);
            
            window.selectionManager.selectJobNumber = (jobNumber, source) => {
                this.logApiCall('selectJobNumber', { jobNumber, source });
                return originalSelectJobNumber(jobNumber, source);
            };
            
            window.selectionManager.clearSelection = (source) => {
                this.logApiCall('clearSelection', { source });
                return originalClearSelection(source);
            };
        }
        
        logApiCall(method, params) {
            const currentInteraction = this.getCurrentInteraction();
            if (currentInteraction) {
                if (!currentInteraction.apiCalls) currentInteraction.apiCalls = [];
                currentInteraction.apiCalls.push({
                    timestamp: Date.now(),
                    method,
                    params
                });
            }
        }
        
        logInteraction(type, jobNumber, event) {
            const targetDiv = type === 'RESUME_CLICK' ? 
                event.target.closest('.biz-resume-div') : 
                event.target.closest('.biz-card-div');
                
            // Calculate click location relative to the target div
            const clickLocationInfo = this.calculateClickLocation(event, targetDiv, type);
            
            const interaction = {
                id: this.logData.interactions.length + 1,
                type,
                jobNumber,
                timestamp: Date.now(),
                clickCoords: { x: event.clientX, y: event.clientY },
                clickLocation: clickLocationInfo,
                elementInfo: this.getElementInfo(event.target, type),
                initialState: this.captureStateSnapshot(),
                apiCalls: [],
                domChanges: [],
                scrollEvents: []
            };
            
            this.logData.interactions.push(interaction);
            console.log(`\n🎯 LOGGED: ${type} on Job ${jobNumber}`);
            console.log(`   📍 Click Location: ${clickLocationInfo.clickedElement || 'container'} at (${clickLocationInfo.relativePosition.x}, ${clickLocationInfo.relativePosition.y})`);
            
            // Monitor DOM changes and scroll events for 2 seconds
            this.monitorPostClickBehavior(interaction);
        }
        
        calculateClickLocation(event, targetDiv, type) {
            const targetRect = targetDiv.getBoundingClientRect();
            const relativeX = event.clientX - targetRect.left;
            const relativeY = event.clientY - targetRect.top;
            
            // Find which specific element within the div was clicked
            const clickedElement = event.target;
            const clickedElementRect = clickedElement.getBoundingClientRect();
            
            // Determine the semantic meaning of the clicked area
            const semanticArea = this.identifySemanticArea(clickedElement, targetDiv, type);
            
            // Calculate relative position within the clicked element itself
            const elementRelativeX = event.clientX - clickedElementRect.left;
            const elementRelativeY = event.clientY - clickedElementRect.top;
            
            return {
                // Position relative to the target div (cDiv or rDiv)
                relativePosition: {
                    x: Math.round(relativeX),
                    y: Math.round(relativeY),
                    percentageX: Math.round((relativeX / targetRect.width) * 100),
                    percentageY: Math.round((relativeY / targetRect.height) * 100)
                },
                // Information about the clicked element
                clickedElement: clickedElement.tagName.toLowerCase(),
                clickedElementId: clickedElement.id,
                clickedElementClass: clickedElement.className,
                clickedElementText: clickedElement.textContent?.substring(0, 50) || '',
                // Position relative to the clicked element
                elementRelativePosition: {
                    x: Math.round(elementRelativeX),
                    y: Math.round(elementRelativeY),
                    percentageX: Math.round((elementRelativeX / clickedElementRect.width) * 100),
                    percentageY: Math.round((elementRelativeY / clickedElementRect.height) * 100)
                },
                // Semantic area identification
                semanticArea: semanticArea,
                // Complete geometry information
                targetDivRect: targetRect,
                clickedElementRect: clickedElementRect,
                // Identify if this is a header area click
                isHeaderClick: semanticArea.isHeader,
                headerType: semanticArea.headerType
            };
        }
        
        identifySemanticArea(clickedElement, targetDiv, type) {
            const semanticInfo = {
                area: 'unknown',
                isHeader: false,
                headerType: null,
                description: ''
            };
            
            // Define header selectors for each type
            const headerSelectors = type === 'RESUME_CLICK' ? {
                primary: '.biz-resume-details-div',
                secondary: '.resume-header',
                tertiary: ['.job-title', '.company-name']
            } : {
                primary: '.biz-details-employer',
                secondary: '.biz-card-header', 
                tertiary: ['.job-title', '.company-name', '.biz-details-role']
            };
            
            // Check if clicked element is a header or within a header
            let matchedHeader = null;
            
            // Check primary header
            if (clickedElement.closest(headerSelectors.primary)) {
                matchedHeader = { type: 'primary', selector: headerSelectors.primary };
            }
            // Check secondary header
            else if (clickedElement.closest(headerSelectors.secondary)) {
                matchedHeader = { type: 'secondary', selector: headerSelectors.secondary };
            }
            // Check tertiary headers
            else {
                for (const selector of headerSelectors.tertiary) {
                    if (clickedElement.closest(selector)) {
                        matchedHeader = { type: 'tertiary', selector };
                        break;
                    }
                }
            }
            
            if (matchedHeader) {
                semanticInfo.isHeader = true;
                semanticInfo.headerType = matchedHeader.type;
                semanticInfo.area = 'header';
                semanticInfo.description = `${matchedHeader.type} header (${matchedHeader.selector})`;
            } else {
                // Determine other semantic areas
                const classNames = clickedElement.className.toLowerCase();
                const tagName = clickedElement.tagName.toLowerCase();
                
                if (classNames.includes('details')) {
                    semanticInfo.area = 'details';
                    semanticInfo.description = 'details section';
                } else if (classNames.includes('dates')) {
                    semanticInfo.area = 'dates';
                    semanticInfo.description = 'dates section';
                } else if (classNames.includes('skills')) {
                    semanticInfo.area = 'skills';
                    semanticInfo.description = 'skills section';
                } else if (classNames.includes('stats')) {
                    semanticInfo.area = 'stats';
                    semanticInfo.description = 'statistics section';
                } else if (tagName === 'img') {
                    semanticInfo.area = 'image';
                    semanticInfo.description = 'image element';
                } else {
                    semanticInfo.area = 'content';
                    semanticInfo.description = `${tagName} element`;
                }
            }
            
            return semanticInfo;
        }
        
        getElementInfo(element, type) {
            const targetDiv = type === 'RESUME_CLICK' ? 
                element.closest('.biz-resume-div') : 
                element.closest('.biz-card-div');
                
            return {
                tagName: element.tagName,
                className: element.className,
                id: element.id,
                parentId: targetDiv?.id,
                dataJobNumber: targetDiv?.getAttribute('data-job-number'),
                boundingRect: targetDiv?.getBoundingClientRect()
            };
        }
        
        captureStateSnapshot() {
            const allCards = Array.from(document.querySelectorAll('.biz-card-div'));
            const allResumes = Array.from(document.querySelectorAll('.biz-resume-div'));
            
            return {
                timestamp: Date.now(),
                selectedJobNumber: window.selectionManager?.getSelectedJobNumber(),
                visibleCards: allCards.filter(card => {
                    const style = window.getComputedStyle(card);
                    return style.display !== 'none' && style.visibility !== 'hidden';
                }).map(card => card.getAttribute('data-job-number')),
                visibleResumes: allResumes.filter(resume => {
                    const style = window.getComputedStyle(resume);
                    return style.display !== 'none' && style.visibility !== 'hidden';
                }).map(resume => resume.getAttribute('data-job-number')),
                scrollPositions: {
                    sceneContainer: this.getScrollPosition('scene-container'),
                    resumeContainer: this.getScrollPosition('resume-container'),
                    window: { x: window.scrollX, y: window.scrollY }
                }
            };
        }
        
        getScrollPosition(elementId) {
            const element = document.getElementById(elementId);
            return element ? {
                scrollTop: element.scrollTop,
                scrollLeft: element.scrollLeft,
                scrollHeight: element.scrollHeight,
                scrollWidth: element.scrollWidth
            } : null;
        }
        
        monitorPostClickBehavior(interaction) {
            const startTime = Date.now();
            const monitoringDuration = 2000; // 2 seconds
            
            // Capture initial scroll positions and element visibility
            const initialScrollState = interaction.initialState.scrollPositions;
            let lastVisibilitySnapshot = this.captureElementVisibility(interaction.jobNumber);
            
            // Monitor scroll changes and element visibility
            const scrollMonitor = setInterval(() => {
                const currentScrollState = {
                    sceneContainer: this.getScrollPosition('scene-container'),
                    resumeContainer: this.getScrollPosition('resume-container'),
                    window: { x: window.scrollX, y: window.scrollY }
                };
                
                // Check for scroll changes
                const scrollChanged = this.detectScrollChanges(initialScrollState, currentScrollState);
                if (scrollChanged.hasChanges) {
                    // Capture which elements are now in view after scroll
                    const elementsInView = this.captureElementVisibility(interaction.jobNumber);
                    const visibilityChanges = this.detectVisibilityChanges(lastVisibilitySnapshot, elementsInView);
                    
                    interaction.scrollEvents.push({
                        timestamp: Date.now(),
                        changes: scrollChanged.changes,
                        newPositions: currentScrollState,
                        elementsInView: elementsInView,
                        visibilityChanges: visibilityChanges
                    });
                    
                    lastVisibilitySnapshot = elementsInView;
                }
                
                if (Date.now() - startTime > monitoringDuration) {
                    clearInterval(scrollMonitor);
                    this.evaluateInteraction(interaction);
                }
            }, 100); // Check every 100ms
            
            // Monitor DOM changes
            const observer = new MutationObserver((mutations) => {
                mutations.forEach(mutation => {
                    if (mutation.type === 'attributes' && 
                        (mutation.attributeName === 'style' || 
                         mutation.attributeName === 'class')) {
                        
                        interaction.domChanges.push({
                            timestamp: Date.now(),
                            type: mutation.type,
                            attributeName: mutation.attributeName,
                            target: {
                                tagName: mutation.target.tagName,
                                id: mutation.target.id,
                                className: mutation.target.className
                            },
                            oldValue: mutation.oldValue,
                            newValue: mutation.target.getAttribute(mutation.attributeName)
                        });
                    }
                });
            });
            
            observer.observe(document.body, {
                attributes: true,
                attributeOldValue: true,
                subtree: true
            });
            
            // Stop observing after monitoring period
            setTimeout(() => {
                observer.disconnect();
            }, monitoringDuration);
        }
        
        detectScrollChanges(initial, current) {
            const changes = [];
            
            // Check scene container
            if (initial.sceneContainer && current.sceneContainer) {
                if (Math.abs(initial.sceneContainer.scrollTop - current.sceneContainer.scrollTop) > 5) {
                    changes.push({
                        container: 'sceneContainer',
                        property: 'scrollTop',
                        from: initial.sceneContainer.scrollTop,
                        to: current.sceneContainer.scrollTop,
                        delta: current.sceneContainer.scrollTop - initial.sceneContainer.scrollTop
                    });
                }
            }
            
            // Check resume container
            if (initial.resumeContainer && current.resumeContainer) {
                if (Math.abs(initial.resumeContainer.scrollTop - current.resumeContainer.scrollTop) > 5) {
                    changes.push({
                        container: 'resumeContainer',
                        property: 'scrollTop',
                        from: initial.resumeContainer.scrollTop,
                        to: current.resumeContainer.scrollTop,
                        delta: current.resumeContainer.scrollTop - initial.resumeContainer.scrollTop
                    });
                }
            }
            
            // Check window scroll
            if (Math.abs(initial.window.x - current.window.x) > 5 || 
                Math.abs(initial.window.y - current.window.y) > 5) {
                changes.push({
                    container: 'window',
                    property: 'scroll',
                    from: initial.window,
                    to: current.window,
                    deltaX: current.window.x - initial.window.x,
                    deltaY: current.window.y - initial.window.y
                });
            }
            
            return {
                hasChanges: changes.length > 0,
                changes
            };
        }
        
        captureElementVisibility(jobNumber) {
            const visibility = {
                timestamp: Date.now(),
                jobNumber: jobNumber,
                cDiv: null,
                rDiv: null
            };
            
            // Analyze cDiv (card) visibility
            const cardDiv = document.getElementById(`biz-card-div-${jobNumber}`);
            const cardClone = document.getElementById(`biz-card-div-${jobNumber}-clone`);
            
            if (cardDiv || cardClone) {
                const activeCard = cardClone && this.isElementVisible(cardClone) ? cardClone : cardDiv;
                if (activeCard) {
                    visibility.cDiv = this.analyzeElementVisibility(activeCard, 'cDiv');
                }
            }
            
            // Analyze rDiv (resume) visibility
            const resumeDiv = document.querySelector(`[data-job-number="${jobNumber}"].biz-resume-div`);
            if (resumeDiv) {
                visibility.rDiv = this.analyzeElementVisibility(resumeDiv, 'rDiv');
            }
            
            return visibility;
        }
        
        analyzeElementVisibility(element, type) {
            const rect = element.getBoundingClientRect();
            const containerRect = this.getContainerRect(element);
            
            // Find header elements within the div
            const headerElements = this.findHeaderElements(element, type);
            
            // Analyze which parts are visible
            const analysis = {
                element: {
                    id: element.id,
                    className: element.className,
                    rect: rect,
                    isVisible: this.isElementVisible(element),
                    isInViewport: this.isInViewport(rect),
                    isInContainer: containerRect ? this.isInContainer(rect, containerRect) : null
                },
                container: containerRect ? {
                    id: containerRect.element.id,
                    rect: containerRect.rect,
                    scrollTop: containerRect.element.scrollTop,
                    scrollLeft: containerRect.element.scrollLeft
                } : null,
                headerElements: headerElements.map(header => ({
                    selector: header.selector,
                    text: header.element.textContent?.substring(0, 50),
                    rect: header.element.getBoundingClientRect(),
                    isVisible: this.isElementVisible(header.element),
                    isInViewport: this.isInViewport(header.element.getBoundingClientRect()),
                    isInContainer: containerRect ? this.isInContainer(header.element.getBoundingClientRect(), containerRect) : null,
                    visibilityPercentage: this.calculateVisibilityPercentage(header.element.getBoundingClientRect(), containerRect?.rect)
                })),
                visibilityScore: this.calculateOverallVisibility(rect, containerRect?.rect),
                scrolledIntoView: this.determineIfScrolledIntoView(rect, containerRect?.rect)
            };
            
            return analysis;
        }
        
        findHeaderElements(element, type) {
            const headerSelectors = type === 'cDiv' ? [
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
            
            const foundHeaders = [];
            for (const selector of headerSelectors) {
                const headerElement = element.querySelector(selector);
                if (headerElement) {
                    foundHeaders.push({
                        selector,
                        element: headerElement
                    });
                }
            }
            
            return foundHeaders;
        }
        
        getContainerRect(element) {
            // Find the scrollable container for this element
            const sceneContainer = document.getElementById('scene-container');
            const resumeContainer = document.getElementById('resume-container');
            
            let container = null;
            if (element.closest('#scene-container')) {
                container = sceneContainer;
            } else if (element.closest('#resume-container')) {
                container = resumeContainer;
            }
            
            return container ? {
                element: container,
                rect: container.getBoundingClientRect()
            } : null;
        }
        
        isElementVisible(element) {
            const style = window.getComputedStyle(element);
            return style.display !== 'none' && 
                   style.visibility !== 'hidden' && 
                   style.opacity !== '0';
        }
        
        isInViewport(rect) {
            return rect.top >= 0 && 
                   rect.left >= 0 && 
                   rect.bottom <= window.innerHeight && 
                   rect.right <= window.innerWidth;
        }
        
        isInContainer(elementRect, containerRect) {
            if (!containerRect) return null;
            
            const container = containerRect.rect || containerRect;
            return elementRect.top >= container.top && 
                   elementRect.left >= container.left && 
                   elementRect.bottom <= container.bottom && 
                   elementRect.right <= container.right;
        }
        
        calculateVisibilityPercentage(elementRect, containerRect) {
            if (!containerRect) return null;
            
            const container = containerRect.rect || containerRect;
            
            // Calculate visible area intersection
            const visibleTop = Math.max(elementRect.top, container.top);
            const visibleLeft = Math.max(elementRect.left, container.left);
            const visibleBottom = Math.min(elementRect.bottom, container.bottom);
            const visibleRight = Math.min(elementRect.right, container.right);
            
            if (visibleTop >= visibleBottom || visibleLeft >= visibleRight) {
                return 0; // No intersection
            }
            
            const visibleArea = (visibleRight - visibleLeft) * (visibleBottom - visibleTop);
            const totalArea = elementRect.width * elementRect.height;
            
            return totalArea > 0 ? Math.round((visibleArea / totalArea) * 100) : 0;
        }
        
        calculateOverallVisibility(elementRect, containerRect) {
            return this.calculateVisibilityPercentage(elementRect, containerRect);
        }
        
        determineIfScrolledIntoView(elementRect, containerRect) {
            if (!containerRect) return null;
            
            const container = containerRect.rect || containerRect;
            const elementCenter = {
                x: elementRect.left + elementRect.width / 2,
                y: elementRect.top + elementRect.height / 2
            };
            
            const containerCenter = {
                x: container.left + container.width / 2,
                y: container.top + container.height / 2
            };
            
            // Consider "scrolled into view" if element center is within container bounds
            // and element is at least 50% visible
            const isInBounds = elementCenter.x >= container.left && 
                              elementCenter.x <= container.right && 
                              elementCenter.y >= container.top && 
                              elementCenter.y <= container.bottom;
            
            const visibilityPercentage = this.calculateVisibilityPercentage(elementRect, containerRect);
            
            return {
                isInBounds,
                visibilityPercentage,
                scrolledIntoView: isInBounds && visibilityPercentage >= 50,
                distanceFromCenter: {
                    x: Math.abs(elementCenter.x - containerCenter.x),
                    y: Math.abs(elementCenter.y - containerCenter.y)
                }
            };
        }
        
        detectVisibilityChanges(previousSnapshot, currentSnapshot) {
            const changes = [];
            
            if (!previousSnapshot || !currentSnapshot) return changes;
            
            // Compare cDiv visibility changes
            if (previousSnapshot.cDiv && currentSnapshot.cDiv) {
                const prevScrolled = previousSnapshot.cDiv.scrolledIntoView?.scrolledIntoView;
                const currScrolled = currentSnapshot.cDiv.scrolledIntoView?.scrolledIntoView;
                
                if (prevScrolled !== currScrolled) {
                    changes.push({
                        type: 'cDiv',
                        change: currScrolled ? 'scrolled_into_view' : 'scrolled_out_of_view',
                        elementId: currentSnapshot.cDiv.element.id,
                        visibilityBefore: previousSnapshot.cDiv.visibilityScore,
                        visibilityAfter: currentSnapshot.cDiv.visibilityScore
                    });
                }
                
                // Check header element visibility changes
                currentSnapshot.cDiv.headerElements.forEach((currHeader, index) => {
                    const prevHeader = previousSnapshot.cDiv.headerElements[index];
                    if (prevHeader && prevHeader.visibilityPercentage !== currHeader.visibilityPercentage) {
                        changes.push({
                            type: 'cDiv_header',
                            selector: currHeader.selector,
                            text: currHeader.text,
                            change: 'visibility_changed',
                            visibilityBefore: prevHeader.visibilityPercentage,
                            visibilityAfter: currHeader.visibilityPercentage
                        });
                    }
                });
            }
            
            // Compare rDiv visibility changes
            if (previousSnapshot.rDiv && currentSnapshot.rDiv) {
                const prevScrolled = previousSnapshot.rDiv.scrolledIntoView?.scrolledIntoView;
                const currScrolled = currentSnapshot.rDiv.scrolledIntoView?.scrolledIntoView;
                
                if (prevScrolled !== currScrolled) {
                    changes.push({
                        type: 'rDiv',
                        change: currScrolled ? 'scrolled_into_view' : 'scrolled_out_of_view',
                        elementId: currentSnapshot.rDiv.element.id,
                        visibilityBefore: previousSnapshot.rDiv.visibilityScore,
                        visibilityAfter: currentSnapshot.rDiv.visibilityScore
                    });
                }
                
                // Check header element visibility changes
                currentSnapshot.rDiv.headerElements.forEach((currHeader, index) => {
                    const prevHeader = previousSnapshot.rDiv.headerElements[index];
                    if (prevHeader && prevHeader.visibilityPercentage !== currHeader.visibilityPercentage) {
                        changes.push({
                            type: 'rDiv_header',
                            selector: currHeader.selector,
                            text: currHeader.text,
                            change: 'visibility_changed',
                            visibilityBefore: prevHeader.visibilityPercentage,
                            visibilityAfter: currHeader.visibilityPercentage
                        });
                    }
                });
            }
            
            return changes;
        }
        
        evaluateInteraction(interaction) {
            const evaluation = {
                interactionId: interaction.id,
                timestamp: Date.now(),
                type: interaction.type,
                jobNumber: interaction.jobNumber,
                tests: {},
                overall: 'UNKNOWN'
            };
            
            // Test 1: API Call Detection
            const hasSelectJobNumber = interaction.apiCalls?.some(call => 
                call.method === 'selectJobNumber' && call.params.jobNumber === interaction.jobNumber
            );
            evaluation.tests.apiCallDetection = {
                passed: hasSelectJobNumber,
                details: `selectJobNumber called: ${hasSelectJobNumber}`,
                expectedCalls: interaction.apiCalls?.length || 0
            };
            
            // Test 2: Source Parameter Validation
            const correctSource = interaction.apiCalls?.find(call => 
                call.method === 'selectJobNumber' && call.params.jobNumber === interaction.jobNumber
            )?.params.source;
            
            let expectedSourcePattern = '';
            let hasCorrectSource = false;
            
            if (interaction.type === 'RESUME_CLICK') {
                expectedSourcePattern = 'ResumeListController';
                hasCorrectSource = correctSource?.includes('ResumeListController');
            } else if (interaction.type === 'CARD_CLICK') {
                expectedSourcePattern = 'CardsController';
                hasCorrectSource = correctSource?.includes('CardsController');
            }
            
            evaluation.tests.sourceValidation = {
                passed: hasCorrectSource,
                details: `Expected: ${expectedSourcePattern}, Got: ${correctSource}`,
                actualSource: correctSource
            };
            
            // Test 3: Scroll Behavior
            const hasScrollEvents = interaction.scrollEvents.length > 0;
            let correctScrollContainer = false;
            let scrollDirection = 'none';
            
            if (interaction.type === 'RESUME_CLICK') {
                // Resume click should scroll scene container (to show cDiv)
                correctScrollContainer = interaction.scrollEvents.some(event =>
                    event.changes.some(change => change.container === 'sceneContainer')
                );
                scrollDirection = 'scene';
            } else if (interaction.type === 'CARD_CLICK') {
                // Card click should scroll resume container (to show rDiv)
                correctScrollContainer = interaction.scrollEvents.some(event =>
                    event.changes.some(change => change.container === 'resumeContainer')
                );
                scrollDirection = 'resume';
            }
            
            evaluation.tests.scrollBehavior = {
                passed: hasScrollEvents && correctScrollContainer,
                details: `Expected ${scrollDirection} scroll, Got ${interaction.scrollEvents.length} scroll events`,
                scrollEvents: interaction.scrollEvents.length,
                correctContainer: correctScrollContainer
            };
            
            // Test 4: DOM State Changes
            const hasDomChanges = interaction.domChanges.length > 0;
            const hasVisibilityChanges = interaction.domChanges.some(change =>
                change.attributeName === 'style' || change.attributeName === 'class'
            );
            
            evaluation.tests.domChanges = {
                passed: hasDomChanges,
                details: `DOM changes detected: ${interaction.domChanges.length}`,
                visibilityChanges: hasVisibilityChanges,
                changeCount: interaction.domChanges.length
            };
            
            // Test 5: Element Visibility and Scroll Targeting
            const finalScrollEvent = interaction.scrollEvents[interaction.scrollEvents.length - 1];
            let targetElementScrolledIntoView = false;
            let headerElementsVisible = false;
            let targetElementVisibilityScore = 0;
            
            if (finalScrollEvent && finalScrollEvent.elementsInView) {
                const targetType = interaction.type === 'RESUME_CLICK' ? 'cDiv' : 'rDiv';
                const targetElementData = finalScrollEvent.elementsInView[targetType];
                
                if (targetElementData) {
                    targetElementScrolledIntoView = targetElementData.scrolledIntoView?.scrolledIntoView || false;
                    targetElementVisibilityScore = targetElementData.visibilityScore || 0;
                    
                    // Check if header elements are visible
                    const visibleHeaders = targetElementData.headerElements?.filter(header => 
                        header.visibilityPercentage >= 50
                    ) || [];
                    headerElementsVisible = visibleHeaders.length > 0;
                }
            }
            
            evaluation.tests.targetVisibility = {
                passed: targetElementScrolledIntoView && headerElementsVisible,
                details: `Target scrolled: ${targetElementScrolledIntoView}, Headers visible: ${headerElementsVisible}`,
                targetScrolledIntoView: targetElementScrolledIntoView,
                headerElementsVisible: headerElementsVisible,
                visibilityScore: targetElementVisibilityScore
            };
            
            // Test 6: Click Location Analysis
            const clickLocation = interaction.clickLocation;
            const clickLocationAnalysis = {
                clickedArea: clickLocation?.semanticArea?.area || 'unknown',
                isHeaderClick: clickLocation?.isHeaderClick || false,
                headerType: clickLocation?.headerType,
                relativePosition: clickLocation?.relativePosition
            };
            
            evaluation.tests.clickLocation = {
                passed: true, // Always passes, just for information
                details: `Clicked: ${clickLocationAnalysis.clickedArea}${clickLocationAnalysis.isHeaderClick ? ' (header)' : ''}`,
                analysis: clickLocationAnalysis
            };
            
            // Overall evaluation
            const allTests = Object.values(evaluation.tests);
            const passedTests = allTests.filter(test => test.passed).length;
            const totalTests = allTests.length;
            
            if (passedTests === totalTests) {
                evaluation.overall = 'SUCCESS';
            } else if (passedTests >= totalTests * 0.75) {
                evaluation.overall = 'PARTIAL_SUCCESS';
            } else {
                evaluation.overall = 'FAILURE';
            }
            
            evaluation.score = `${passedTests}/${totalTests}`;
            
            this.logData.evaluations.push(evaluation);
            this.displayEvaluation(evaluation);
        }
        
        displayEvaluation(evaluation) {
            console.log(`\n📊 EVALUATION #${evaluation.interactionId}: ${evaluation.type} Job ${evaluation.jobNumber}`);
            console.log(`   🎯 OVERALL: ${evaluation.overall} (${evaluation.score})`);
            console.log(`   ✓ API Calls: ${evaluation.tests.apiCallDetection.passed ? '✅' : '❌'} ${evaluation.tests.apiCallDetection.details}`);
            console.log(`   ✓ Source Param: ${evaluation.tests.sourceValidation.passed ? '✅' : '❌'} ${evaluation.tests.sourceValidation.details}`);
            console.log(`   ✓ Scroll Behavior: ${evaluation.tests.scrollBehavior.passed ? '✅' : '❌'} ${evaluation.tests.scrollBehavior.details}`);
            console.log(`   ✓ DOM Changes: ${evaluation.tests.domChanges.passed ? '✅' : '❌'} ${evaluation.tests.domChanges.details}`);
            console.log(`   ✓ Target Visibility: ${evaluation.tests.targetVisibility.passed ? '✅' : '❌'} ${evaluation.tests.targetVisibility.details}`);
            console.log(`   📍 Click Location: ${evaluation.tests.clickLocation.details}`);
            
            // Show detailed visibility information
            if (evaluation.tests.targetVisibility && !evaluation.tests.targetVisibility.passed) {
                console.log(`      • Target element visibility: ${evaluation.tests.targetVisibility.visibilityScore}%`);
                console.log(`      • Target scrolled into view: ${evaluation.tests.targetVisibility.targetScrolledIntoView}`);
                console.log(`      • Header elements visible: ${evaluation.tests.targetVisibility.headerElementsVisible}`);
            }
            
            // Show click location details
            if (evaluation.tests.clickLocation.analysis) {
                const loc = evaluation.tests.clickLocation.analysis;
                console.log(`      • Clicked area: ${loc.clickedArea}`);
                if (loc.isHeaderClick) {
                    console.log(`      • Header type: ${loc.headerType}`);
                }
                if (loc.relativePosition) {
                    console.log(`      • Position: (${loc.relativePosition.x}, ${loc.relativePosition.y}) - ${loc.relativePosition.percentageX}%, ${loc.relativePosition.percentageY}%`);
                }
            }
            
            if (evaluation.overall === 'SUCCESS') {
                console.log(`   🎉 BIDIRECTIONAL SYNC WORKING CORRECTLY!`);
                console.log(`   🎉 Target element and headers are properly scrolled into view`);
            } else {
                console.log(`   ❌ Issues detected - see details above`);
                
                // Specific guidance based on failed tests
                if (!evaluation.tests.targetVisibility.passed) {
                    console.log(`   💡 The target element or its headers are not visible after scrolling`);
                    console.log(`   💡 This suggests the scroll function didn't bring the element into proper view`);
                }
            }
        }
        
        getCurrentInteraction() {
            return this.logData.interactions[this.logData.interactions.length - 1];
        }
        
        saveLogToFile() {
            const logContent = JSON.stringify(this.logData, null, 2);
            const blob = new Blob([logContent], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `bidirectional-sync-log-${Date.now()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            console.log('📁 Log file saved to Downloads');
        }
        
        async saveLogToServer() {
            try {
                console.log('📤 Saving log to server...');
                
                const response = await fetch('/api/sync-logs', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(this.logData)
                });
                
                if (response.ok) {
                    const result = await response.json();
                    console.log('✅ Log saved to server successfully!');
                    console.log(`📝 Session ID: ${result.sessionId}`);
                    console.log(`📊 ${result.interactions} interactions, ${result.evaluations} evaluations`);
                    console.log(`🌐 View dashboard: http://localhost:3009/sync-logs-dashboard`);
                    
                    return result;
                } else {
                    const error = await response.json();
                    console.error('❌ Failed to save log to server:', error.error);
                    return null;
                }
                
            } catch (error) {
                console.error('❌ Error saving log to server:', error);
                return null;
            }
        }
        
        startMonitoring() {
            // This function is now deprecated - recording starts automatically on first click
            console.log('ℹ️ MONITORING IS AUTO-STARTED');
            console.log('📁 Click detection is active - recording will start on first resume/card click');
            console.log('🖱️ Click resume items and business cards to begin recording...');
            
            // Reset monitoring state to allow fresh session
            this.isMonitoring = false;
        }
        
        newSession() {
            // Manually start a new session (useful after stopping one)
            console.log('🔄 READY FOR NEW SESSION');
            console.log('📁 Click detection reset - next click will start fresh recording');
            
            this.isMonitoring = false;
            // Don't reset logData here - let it reset on first click
        }
        
        async stopMonitoring() {
            this.isMonitoring = false;
            console.log('\n⏹️ MONITORING STOPPED');
            this.showSummary();
            
            // Save to both server and local file
            await this.saveLogToServer();
            this.saveLogToFile();
        }
        
        showSummary() {
            console.log('\n📊 === BIDIRECTIONAL SYNC SUMMARY ===');
            console.log(`Recording status: ${this.isMonitoring ? '🟢 ACTIVE' : '🔴 STOPPED'}`);
            console.log(`Total interactions: ${this.logData.interactions.length}`);
            console.log(`Total evaluations: ${this.logData.evaluations.length}`);
            
            const successes = this.logData.evaluations.filter(e => e.overall === 'SUCCESS').length;
            const partials = this.logData.evaluations.filter(e => e.overall === 'PARTIAL_SUCCESS').length;
            const failures = this.logData.evaluations.filter(e => e.overall === 'FAILURE').length;
            
            console.log(`✅ Successes: ${successes}`);
            console.log(`🔶 Partial: ${partials}`);
            console.log(`❌ Failures: ${failures}`);
            
            if (this.logData.interactions.length === 0) {
                console.log('\n📋 No interactions recorded yet. Click resume items or cards to start testing!');
            } else if (successes === this.logData.evaluations.length && this.logData.evaluations.length > 0) {
                console.log('\n🎉 ALL INTERACTIONS SUCCESSFUL! Bidirectional sync is working perfectly.');
            } else if (failures > 0) {
                console.log('\n❌ Some interactions failed. Check individual evaluations above.');
            }
        }
        
        getStatus() {
            return {
                isRecording: this.isMonitoring,
                sessionStart: this.logData.sessionStart,
                interactions: this.logData.interactions.length,
                evaluations: this.logData.evaluations.length,
                clickDetectionActive: true
            };
        }
    }
    
    // Create global logger instance
    const logger = new FileBidirectionalLogger();
    
    // Make functions globally available
    window.startFileBasedMonitoring = () => logger.startMonitoring();
    window.newSyncSession = () => logger.newSession();
    window.stopFileBasedMonitoring = () => logger.stopMonitoring();
    window.saveLogFile = () => logger.saveLogToFile();
    window.saveLogToServer = () => logger.saveLogToServer();
    window.showFileSummary = () => logger.showSummary();
    window.getLogData = () => logger.logData;
    window.viewSyncLogsDashboard = () => window.open('http://localhost:3009/sync-logs-dashboard', '_blank');
    
    // Auto-initialize click detection
    console.log('✅ File-based Event Logger loaded!');
    console.log('📁 This logger captures actual DOM/API behavior, not console output');
    console.log('🎯 CLICK DETECTION ACTIVE - Recording will start on first resume/card click');
    
    setTimeout(() => {
        const resumeDivs = document.querySelectorAll('.biz-resume-div').length;
        const cardDivs = document.querySelectorAll('.biz-card-div').length;
        const hasSelectionManager = !!window.selectionManager;
        
        if (hasSelectionManager && (resumeDivs > 0 || cardDivs > 0)) {
            console.log(`✅ App ready: ${resumeDivs} resume divs, ${cardDivs} card divs found`);
            console.log('🖱️ Click any resume item or business card to start recording!');
        } else {
            console.log('⏳ App still loading, but click detection is active...');
        }
    }, 2000);
    
    console.log('\n🎮 CONTROLS:');
    console.log('   newSyncSession() - Reset for new test session');
    console.log('   stopFileBasedMonitoring() - Stop and save to server + download');
    console.log('   ESC key - Stop current recording (if active)');  
    console.log('   saveLogToServer() - Save current log to server');
    console.log('   saveLogFile() - Download current log file');
    console.log('   showFileSummary() - Show summary');
    console.log('   viewSyncLogsDashboard() - Open server dashboard');
    console.log('   getLogData() - Access raw log data');
    
    console.log('\n💡 WORKFLOW:');
    console.log('   1. Click resume items/cards (recording starts automatically)');
    console.log('   2. Test bidirectional sync behavior');
    console.log('   3. Press ESC key or run stopFileBasedMonitoring() to save results');
    console.log('   4. Run newSyncSession() to start fresh test');
    
})();