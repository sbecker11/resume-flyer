// INTERACTIVE EVENT LOGGER - Monitors user interactions and evaluates results
// Copy this entire script into browser console after app loads

(function() {
    console.clear();
    console.log('📊 INTERACTIVE EVENT LOGGER - Monitoring User Actions\n');
    
    let eventLog = [];
    let isMonitoring = false;
    
    // Event logger class
    class BidirectionalSyncLogger {
        constructor() {
            this.interactions = [];
            this.setupConsoleInterception();
            this.setupClickMonitoring();
        }
        
        setupConsoleInterception() {
            // Intercept console.log to capture system responses
            this.originalConsoleLog = console.log;
            console.log = (...args) => {
                const message = args.join(' ');
                
                // Capture important system messages
                if (this.isImportantMessage(message)) {
                    this.logSystemResponse(message);
                }
                
                // Always call original console.log
                this.originalConsoleLog(...args);
            };
        }
        
        isImportantMessage(message) {
            const importantPatterns = [
                'handleJobSelected CALLED',
                'Resume div clicked',
                'cDiv clicked',
                'rDiv selected → scrolling cDiv header',
                'cDiv selected → scrolling rDiv header',
                'SCROLL: Attempting to scroll',
                'header scrolled into view',
                'SCROLL FAILED',
                'handleBizResumeDivClickEvent',
                'CardsController.cardClick'
            ];
            
            return importantPatterns.some(pattern => message.includes(pattern));
        }
        
        logSystemResponse(message) {
            if (this.interactions.length > 0) {
                const currentInteraction = this.interactions[this.interactions.length - 1];
                if (!currentInteraction.responses) {
                    currentInteraction.responses = [];
                }
                currentInteraction.responses.push({
                    timestamp: Date.now(),
                    message: message
                });
            }
        }
        
        setupClickMonitoring() {
            // Monitor resume div clicks
            document.addEventListener('click', (event) => {
                if (!isMonitoring) return;
                
                const target = event.target;
                
                // Check if clicked element is a resume div or within one
                const resumeDiv = target.closest('.biz-resume-div');
                if (resumeDiv) {
                    const jobNumber = resumeDiv.getAttribute('data-job-number');
                    this.logUserInteraction('RESUME_CLICK', jobNumber, resumeDiv);
                    return;
                }
                
                // Check if clicked element is a card div or within one  
                const cardDiv = target.closest('.biz-card-div');
                if (cardDiv) {
                    const jobNumber = cardDiv.getAttribute('data-job-number');
                    this.logUserInteraction('CARD_CLICK', jobNumber, cardDiv);
                    return;
                }
            }, true); // Use capture phase to catch events early
        }
        
        logUserInteraction(type, jobNumber, element) {
            const interaction = {
                id: this.interactions.length + 1,
                type: type,
                jobNumber: jobNumber,
                timestamp: Date.now(),
                element: element.tagName + (element.id ? `#${element.id}` : ''),
                responses: []
            };
            
            this.interactions.push(interaction);
            
            console.log(`\n🎯 USER ACTION #${interaction.id}: ${type} on Job ${jobNumber}`);
            console.log(`   Element: ${interaction.element}`);
            console.log(`   Time: ${new Date(interaction.timestamp).toLocaleTimeString()}`);
            
            // Evaluate the results after a delay
            setTimeout(() => {
                this.evaluateInteraction(interaction);
            }, 1000);
        }
        
        evaluateInteraction(interaction) {
            console.log(`\n📋 EVALUATING ACTION #${interaction.id}:`);
            
            const responses = interaction.responses || [];
            const hasHandleJobSelected = responses.some(r => r.message.includes('handleJobSelected CALLED'));
            const hasClickDetection = responses.some(r => 
                r.message.includes('Resume div clicked') || 
                r.message.includes('cDiv clicked')
            );
            
            let expectedScrollDirection = '';
            let hasCorrectScrollDirection = false;
            let hasScrollExecution = false;
            
            if (interaction.type === 'RESUME_CLICK') {
                // Resume click should trigger cDiv header scroll
                expectedScrollDirection = 'cDiv header scroll';
                hasCorrectScrollDirection = responses.some(r => 
                    r.message.includes('rDiv selected → scrolling cDiv header') ||
                    r.message.includes('scrolling cDiv header')
                );
                hasScrollExecution = responses.some(r => 
                    r.message.includes('SCROLL: Attempting to scroll cDiv HEADER')
                );
            } else if (interaction.type === 'CARD_CLICK') {
                // Card click should trigger rDiv header scroll
                expectedScrollDirection = 'rDiv header scroll';
                hasCorrectScrollDirection = responses.some(r => 
                    r.message.includes('cDiv selected → scrolling rDiv header') ||
                    r.message.includes('scrolling rDiv header')
                );
                hasScrollExecution = responses.some(r => 
                    r.message.includes('SCROLL: Attempting to scroll rDiv HEADER')
                );
            }
            
            // Check for scroll completion
            const hasScrollCompletion = responses.some(r => 
                r.message.includes('header scrolled into view')
            );
            
            // Check for errors
            const hasScrollError = responses.some(r => 
                r.message.includes('SCROLL FAILED') ||
                r.message.includes('not found')
            );
            
            // Evaluate overall success
            console.log(`   ✓ Click Detection: ${hasClickDetection ? '✅ PASS' : '❌ FAIL'}`);
            console.log(`   ✓ Event Handler: ${hasHandleJobSelected ? '✅ PASS' : '❌ FAIL'}`);
            console.log(`   ✓ Scroll Direction: ${hasCorrectScrollDirection ? '✅ PASS' : '❌ FAIL'} (expected: ${expectedScrollDirection})`);
            console.log(`   ✓ Scroll Execution: ${hasScrollExecution ? '✅ PASS' : '❌ FAIL'}`);
            console.log(`   ✓ Scroll Completion: ${hasScrollCompletion ? '✅ PASS' : '❌ FAIL'}`);
            console.log(`   ✓ No Errors: ${!hasScrollError ? '✅ PASS' : '❌ FAIL'}`);
            
            // Overall verdict
            const allTestsPass = hasClickDetection && hasHandleJobSelected && 
                               hasCorrectScrollDirection && hasScrollExecution && 
                               hasScrollCompletion && !hasScrollError;
            
            if (allTestsPass) {
                console.log(`   🎉 OVERALL: ✅ BIDIRECTIONAL SYNC WORKING PERFECTLY!`);
                console.log(`   🎉 ${interaction.type} correctly triggered ${expectedScrollDirection}`);
            } else {
                console.log(`   ❌ OVERALL: BIDIRECTIONAL SYNC HAS ISSUES`);
                
                // Provide specific guidance
                if (!hasClickDetection) {
                    console.log(`   💡 Issue: Click not detected by event handlers`);
                }
                if (!hasHandleJobSelected) {
                    console.log(`   💡 Issue: handleJobSelected not called - event listeners problem`);
                }
                if (!hasCorrectScrollDirection) {
                    console.log(`   💡 Issue: Wrong scroll direction or source detection failed`);
                }
                if (!hasScrollExecution) {
                    console.log(`   💡 Issue: Scroll functions not executing`);
                }
                if (!hasScrollCompletion) {
                    console.log(`   💡 Issue: Scroll may have failed to find target elements`);
                }
                if (hasScrollError) {
                    console.log(`   💡 Issue: Scroll errors occurred - check element availability`);
                }
            }
            
            console.log(`   📝 Captured ${responses.length} system responses`);
            
            // Show response summary
            if (responses.length > 0) {
                console.log(`   📋 Key Responses:`);
                responses.slice(0, 5).forEach((r, i) => {
                    const shortMessage = r.message.length > 80 ? 
                        r.message.substring(0, 80) + '...' : r.message;
                    console.log(`      ${i + 1}. ${shortMessage}`);
                });
            }
        }
        
        startMonitoring() {
            isMonitoring = true;
            console.log('🎯 MONITORING STARTED - Click resume items or business cards!');
            console.log('📊 I will log your actions and evaluate if bidirectional sync works correctly.\n');
            console.log('💡 Expected behavior:');
            console.log('   • Click resume item → business card header should scroll into view');
            console.log('   • Click business card → resume header should scroll into view\n');
            console.log('🖱️ Go ahead and click some elements...');
        }
        
        stopMonitoring() {
            isMonitoring = false;
            console.log('\n⏹️ MONITORING STOPPED');
            this.showSummary();
        }
        
        showSummary() {
            console.log('\n📊 === INTERACTION SUMMARY ===');
            console.log(`Total interactions: ${this.interactions.length}`);
            
            const successfulInteractions = this.interactions.filter(interaction => {
                const responses = interaction.responses || [];
                return responses.some(r => r.message.includes('header scrolled into view'));
            });
            
            console.log(`Successful syncs: ${successfulInteractions.length}/${this.interactions.length}`);
            
            if (this.interactions.length > 0) {
                console.log('\nInteraction details:');
                this.interactions.forEach(interaction => {
                    const success = interaction.responses?.some(r => 
                        r.message.includes('header scrolled into view')
                    );
                    console.log(`  #${interaction.id}: ${interaction.type} Job ${interaction.jobNumber} - ${success ? '✅' : '❌'}`);
                });
            }
        }
        
        getDetailedReport() {
            return this.interactions;
        }
        
        reset() {
            this.interactions = [];
            console.log('🔄 Event log cleared');
        }
    }
    
    // Create global logger instance
    const logger = new BidirectionalSyncLogger();
    
    // Make functions globally available
    window.startSyncMonitoring = () => logger.startMonitoring();
    window.stopSyncMonitoring = () => logger.stopMonitoring();
    window.showSyncSummary = () => logger.showSummary();
    window.resetSyncLog = () => logger.reset();
    window.getSyncReport = () => logger.getDetailedReport();
    
    // Auto-start monitoring
    console.log('✅ Interactive Event Logger loaded!');
    console.log('🎯 Starting monitoring automatically...');
    
    // Wait for app to be ready, then start monitoring
    setTimeout(() => {
        if (window.selectionManager && document.querySelectorAll('.biz-resume-div').length > 0) {
            logger.startMonitoring();
        } else {
            console.log('⏳ Waiting for app to load...');
            setTimeout(() => logger.startMonitoring(), 2000);
        }
    }, 1000);
    
    console.log('\n🎮 CONTROLS:');
    console.log('   startSyncMonitoring() - Start monitoring');  
    console.log('   stopSyncMonitoring() - Stop and show summary');
    console.log('   showSyncSummary() - Show current summary');
    console.log('   resetSyncLog() - Clear the log');
    console.log('   getSyncReport() - Get detailed interaction data');
    
})();