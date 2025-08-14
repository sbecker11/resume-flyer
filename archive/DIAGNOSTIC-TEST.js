// DIAGNOSTIC TEST - Paste this into browser console to diagnose the failure
// This will tell us exactly what went wrong with the automated test

(function() {
    console.clear();
    console.log('🔧 DIAGNOSTIC TEST - Analyzing test failure...\n');
    
    // Check 1: Basic system components
    console.log('🔍 SYSTEM COMPONENT CHECK:');
    
    const resumeDivs = document.querySelectorAll('.biz-resume-div');
    const cardDivs = document.querySelectorAll('.biz-card-div');
    const sceneContainer = document.getElementById('scene-container');
    const resumeContainer = document.getElementById('resume-container');
    
    console.log(`   📝 Resume Divs: ${resumeDivs.length} found`);
    console.log(`   🗃️ Card Divs: ${cardDivs.length} found`);
    console.log(`   📦 Scene Container: ${sceneContainer ? '✅ Found' : '❌ Missing'}`);
    console.log(`   📦 Resume Container: ${resumeContainer ? '✅ Found' : '❌ Missing'}`);
    
    // Check 2: Selection Manager
    console.log('\n🎯 SELECTION MANAGER CHECK:');
    console.log(`   Manager Available: ${window.selectionManager ? '✅ Yes' : '❌ No'}`);
    
    if (window.selectionManager) {
        console.log(`   selectJobNumber method: ${typeof window.selectionManager.selectJobNumber === 'function' ? '✅ Available' : '❌ Missing'}`);
        console.log(`   getSelectedJobNumber method: ${typeof window.selectionManager.getSelectedJobNumber === 'function' ? '✅ Available' : '❌ Missing'}`);
        
        if (typeof window.selectionManager.selectJobNumber === 'function') {
            // Test the API call directly
            console.log('\n🧪 DIRECT API TEST:');
            console.log('   Testing selectJobNumber(0, "diagnostic-test")...');
            
            try {
                window.selectionManager.selectJobNumber(0, 'diagnostic-test');
                console.log('   ✅ API call successful');
            } catch (error) {
                console.log(`   ❌ API call failed: ${error.message}`);
            }
        }
    }
    
    // Check 3: Resume Controllers
    console.log('\n🎮 RESUME CONTROLLER CHECK:');
    console.log(`   ResumeListController: ${window.resumeListController ? '✅ Available' : '❌ Missing'}`);
    console.log(`   ResumeItemsController: ${window.resumeItemsController ? '✅ Available' : '❌ Missing'}`);
    
    // Check 4: Click Handler Test
    console.log('\n🖱️ CLICK HANDLER TEST:');
    
    if (resumeDivs.length > 0) {
        const firstResumeDiv = resumeDivs[0];
        const jobNumber = firstResumeDiv.getAttribute('data-job-number');
        
        console.log(`   Target rDiv: Job ${jobNumber}`);
        console.log(`   Element ID: ${firstResumeDiv.id}`);
        console.log(`   Element Classes: ${firstResumeDiv.className}`);
        
        // Set up temporary monitoring
        let apiCallCaptured = false;
        let scrollEventCaptured = false;
        
        if (window.selectionManager && typeof window.selectionManager.selectJobNumber === 'function') {
            const originalSelect = window.selectionManager.selectJobNumber;
            
            window.selectionManager.selectJobNumber = function(jobNum, source) {
                console.log(`   📞 API CAPTURED: selectJobNumber(${jobNum}, "${source}")`);
                apiCallCaptured = true;
                return originalSelect.call(this, jobNum, source);
            };
            
            // Restore after 5 seconds
            setTimeout(() => {
                window.selectionManager.selectJobNumber = originalSelect;
            }, 5000);
        }
        
        // Monitor scroll events
        if (sceneContainer) {
            const initialScrollTop = sceneContainer.scrollTop;
            
            const checkScroll = () => {
                const currentScrollTop = sceneContainer.scrollTop;
                const delta = Math.abs(currentScrollTop - initialScrollTop);
                
                if (delta > 5) {
                    console.log(`   📜 SCROLL DETECTED: Scene container scrolled ${delta}px`);
                    scrollEventCaptured = true;
                }
            };
            
            setTimeout(checkScroll, 1000);
            setTimeout(checkScroll, 2000);
            setTimeout(checkScroll, 3000);
        }
        
        // Manual click simulation
        console.log('\n   🎯 SIMULATING CLICK...');
        
        const clickEvent = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: 100,
            clientY: 100
        });
        
        firstResumeDiv.dispatchEvent(clickEvent);
        console.log(`   ✅ Click event dispatched on rDiv Job ${jobNumber}`);
        
        // Check results after 4 seconds
        setTimeout(() => {
            console.log('\n📊 DIAGNOSTIC RESULTS:');
            console.log(`   API Call Triggered: ${apiCallCaptured ? '✅ YES' : '❌ NO'}`);
            console.log(`   Scene Scroll Detected: ${scrollEventCaptured ? '✅ YES' : '❌ NO'}`);
            
            // Check target visibility
            const targetCDiv = document.querySelector(`.biz-card-div[data-job-number="${jobNumber}"]`) ||
                              document.querySelector(`#biz-card-div-${jobNumber}`) ||
                              document.querySelector(`#biz-card-div-${jobNumber}-clone`);
            
            if (targetCDiv && sceneContainer) {
                const cDivRect = targetCDiv.getBoundingClientRect();
                const containerRect = sceneContainer.getBoundingClientRect();
                
                const isVisible = cDivRect.top < containerRect.bottom && 
                                cDivRect.bottom > containerRect.top;
                
                console.log(`   Target cDiv Visible: ${isVisible ? '✅ YES' : '❌ NO'}`);
                
                if (isVisible) {
                    console.log(`   Target cDiv ID: ${targetCDiv.id}`);
                    console.log(`   Visibility: Target is in viewport`);
                }
            } else {
                console.log(`   Target cDiv: ❌ NOT FOUND`);
            }
            
            console.log('\n🎯 FAILURE ANALYSIS:');
            if (!apiCallCaptured) {
                console.log('   ❌ ISSUE: selectJobNumber not being called from rDiv click');
                console.log('   🔧 CHECK: Resume click handlers may not be connected');
            }
            if (!scrollEventCaptured) {
                console.log('   ❌ ISSUE: Scene container not scrolling after API call');
                console.log('   🔧 CHECK: Scroll functionality in ResumeItemsController');
            }
            
            console.log('\n✅ DIAGNOSTIC TEST COMPLETE');
            console.log('Copy these results to help debug the bidirectional sync issue.');
            
        }, 4000);
        
        console.log('   ⏰ Monitoring for 4 seconds...');
        
    } else {
        console.log('   ❌ No resume divs available for testing');
    }
    
    console.log('\n💡 DIAGNOSTIC TEST ACTIVE');
    console.log('🎯 Results will appear in 4 seconds...');
    
})();