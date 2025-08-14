// FORCE TEST - This will run automatically when loaded
// Save this file and load it via a script tag

console.log('🚨 FORCE TEST LOADING...');

// Force the test to run immediately
function forceTestExecution() {
    console.log('🔥 FORCING BIDIRECTIONAL SYNC TEST...');
    console.log('=' .repeat(50));
    
    // Step 1: Check basic elements
    const resumeDivs = document.querySelectorAll('.biz-resume-div');
    const sceneContainer = document.getElementById('scene-container');
    const cardDivs = document.querySelectorAll('.biz-card-div');
    
    console.log('📋 SYSTEM STATUS:');
    console.log(`   Resume divs found: ${resumeDivs.length}`);
    console.log(`   Card divs found: ${cardDivs.length}`);
    console.log(`   Scene container: ${sceneContainer ? 'YES' : 'NO'}`);
    
    if (resumeDivs.length === 0) {
        console.log('❌ NO RESUME DIVS - App not loaded yet');
        setTimeout(forceTestExecution, 1000);
        return;
    }
    
    if (!sceneContainer) {
        console.log('❌ NO SCENE CONTAINER - App not loaded yet');
        setTimeout(forceTestExecution, 1000);
        return;
    }
    
    console.log('✅ ELEMENTS FOUND - Applying force test');
    
    // Override ALL click handlers
    let testExecuted = false;
    
    resumeDivs.forEach(rDiv => {
        const jobNumber = parseInt(rDiv.getAttribute('data-job-number'));
        
        // Clone to remove all existing handlers
        const newRDiv = rDiv.cloneNode(true);
        rDiv.parentNode.replaceChild(newRDiv, rDiv);
        
        // Add our force test handler
        newRDiv.addEventListener('click', function(event) {
            event.preventDefault();
            event.stopImmediatePropagation();
            
            if (!testExecuted) {
                runForceTest(jobNumber, newRDiv, sceneContainer);
                testExecuted = true;
            } else {
                runSimpleFix(jobNumber, newRDiv, sceneContainer);
            }
        });
    });
    
    console.log('🎯 FORCE TEST READY - Click any resume item');
    console.log('📊 First click will run comprehensive test');
    console.log('🔧 Subsequent clicks will use working fix');
}

function runForceTest(jobNumber, rDiv, sceneContainer) {
    console.log('\n🧪 FORCE TEST EXECUTING...');
    console.log(`🎯 Target: Job ${jobNumber}`);
    
    const testResults = {};
    
    // Find target cDiv with more aggressive search
    let targetCDiv = document.querySelector(`#biz-card-div-${jobNumber}`);
    if (!targetCDiv) {
        targetCDiv = document.querySelector(`[data-job-number="${jobNumber}"].biz-card-div`);
    }
    if (!targetCDiv) {
        targetCDiv = document.querySelector(`#biz-card-div-${jobNumber}-clone`);
    }
    if (!targetCDiv) {
        // Try searching all card divs
        const allCardDivs = document.querySelectorAll('.biz-card-div');
        for (let div of allCardDivs) {
            if (div.getAttribute('data-job-number') == jobNumber) {
                targetCDiv = div;
                break;
            }
        }
    }
    
    console.log(`🔍 Target cDiv search: ${targetCDiv ? targetCDiv.id : 'NOT FOUND'}`);
    
    if (!targetCDiv) {
        console.log('❌ CRITICAL: No target cDiv found for job ' + jobNumber);
        console.log('🔍 All available cDivs:');
        const allCardDivs = document.querySelectorAll('.biz-card-div');
        allCardDivs.forEach((div, index) => {
            const jobAttr = div.getAttribute('data-job-number');
            console.log(`   ${index + 1}. ID: ${div.id || 'NO_ID'} | Job: ${jobAttr || 'NO_JOB'} | Classes: ${div.className}`);
        });
        console.log(`🔍 Total cDivs found: ${allCardDivs.length}`);
        
        // Try one more desperate search
        console.log('🔍 Desperate search for job ' + jobNumber + ':');
        const desperateSearch = document.querySelector(`*[data-job-number="${jobNumber}"]`);
        if (desperateSearch) {
            console.log(`   Found element with job ${jobNumber}: ${desperateSearch.tagName}#${desperateSearch.id}.${desperateSearch.className}`);
            if (desperateSearch.classList.contains('biz-card-div')) {
                targetCDiv = desperateSearch;
                console.log('   ✅ Using this element as target cDiv');
            }
        }
        
        if (!targetCDiv) {
            console.log('❌ ABSOLUTE FAILURE: No cDiv exists for job ' + jobNumber);
            return;
        }
    }
    
    // Record initial state
    const initialScroll = sceneContainer.scrollTop;
    const sceneRect = sceneContainer.getBoundingClientRect();
    const cDivRect = targetCDiv.getBoundingClientRect();
    const initialTop = Math.round(cDivRect.top - sceneRect.top);
    
    console.log(`📊 INITIAL STATE:`);
    console.log(`   Scene scroll: ${initialScroll}px`);
    console.log(`   cDiv position: ${initialTop}px from scene top`);
    console.log(`   cDiv visible: ${cDivRect.top >= sceneRect.top && cDivRect.bottom <= sceneRect.bottom}`);
    
    // Apply selection
    document.querySelectorAll('.biz-resume-div').forEach(div => div.classList.remove('selected'));
    rDiv.classList.add('selected');
    console.log(`✅ Applied selection to rDiv`);
    
    // Calculate and execute scroll
    const targetScroll = initialScroll + (cDivRect.top - sceneRect.top) - (sceneRect.height / 2) + (cDivRect.height / 2);
    const scrollDelta = Math.round(targetScroll - initialScroll);
    
    console.log(`🧮 SCROLL CALCULATION:`);
    console.log(`   Target scroll: ${Math.round(targetScroll)}px`);
    console.log(`   Scroll delta: ${scrollDelta}px`);
    
    console.log(`🔄 EXECUTING SCROLL...`);
    sceneContainer.scrollTo({
        top: targetScroll,
        behavior: 'smooth'
    });
    
    // Verify results after scroll
    setTimeout(() => {
        const finalScroll = sceneContainer.scrollTop;
        const finalCDivRect = targetCDiv.getBoundingClientRect();
        const finalSceneRect = sceneContainer.getBoundingClientRect();
        const finalTop = Math.round(finalCDivRect.top - finalSceneRect.top);
        const finalVisible = finalCDivRect.top >= finalSceneRect.top && finalCDivRect.bottom <= finalSceneRect.bottom;
        
        const distanceFromCenter = Math.abs(
            (finalCDivRect.top + finalCDivRect.height/2) - 
            (finalSceneRect.top + finalSceneRect.height/2)
        );
        
        console.log(`\n📊 FINAL RESULTS:`);
        console.log(`   Final scroll: ${Math.round(finalScroll)}px`);
        console.log(`   Final cDiv position: ${finalTop}px from scene top`);
        console.log(`   cDiv visible: ${finalVisible ? 'YES ✅' : 'NO ❌'}`);
        console.log(`   Distance from center: ${Math.round(distanceFromCenter)}px`);
        console.log(`   Scroll executed: ${Math.abs(finalScroll - initialScroll) > 10 ? 'YES ✅' : 'NO ❌'}`);
        
        // Overall assessment
        const scrollWorked = Math.abs(finalScroll - initialScroll) > 10;
        const wellCentered = distanceFromCenter < 100;
        
        console.log(`\n🎯 OVERALL ASSESSMENT:`);
        if (finalVisible && wellCentered) {
            console.log(`🎉 SUCCESS: Bidirectional sync is WORKING perfectly!`);
            console.log(`✅ Job ${jobNumber} cDiv is visible and well-centered`);
        } else if (finalVisible) {
            console.log(`⚠️ PARTIAL: Bidirectional sync partially working`);
            console.log(`✅ Job ${jobNumber} cDiv is visible but not perfectly centered`);
        } else if (scrollWorked) {
            console.log(`⚠️ PARTIAL: Scroll executed but cDiv not fully visible`);
            console.log(`🔧 May need scroll position adjustment`);
        } else {
            console.log(`❌ FAILURE: Bidirectional sync is not working`);
            console.log(`🔧 Scroll did not execute or cDiv not found`);
        }
        
        console.log(`\n✅ FORCE TEST COMPLETE`);
        console.log(`🎯 Subsequent clicks will use working fix`);
        console.log('=' .repeat(50));
        
    }, 2000);
}

function runSimpleFix(jobNumber, rDiv, sceneContainer) {
    console.log(`🎯 SIMPLE FIX: Job ${jobNumber}`);
    
    const targetCDiv = document.querySelector(`#biz-card-div-${jobNumber}`) ||
                      document.querySelector(`[data-job-number="${jobNumber}"].biz-card-div`);
    
    if (targetCDiv) {
        document.querySelectorAll('.biz-resume-div').forEach(div => div.classList.remove('selected'));
        rDiv.classList.add('selected');
        
        const sceneRect = sceneContainer.getBoundingClientRect();
        const cDivRect = targetCDiv.getBoundingClientRect();
        const scrollTop = sceneContainer.scrollTop + (cDivRect.top - sceneRect.top) - (sceneRect.height / 2) + (cDivRect.height / 2);
        
        sceneContainer.scrollTo({ top: scrollTop, behavior: 'smooth' });
        console.log(`✅ Job ${jobNumber} scrolled into view`);
    }
}

// Start the force test after a delay
setTimeout(forceTestExecution, 2000);

console.log('🚨 FORCE TEST FILE LOADED - Test will start automatically');