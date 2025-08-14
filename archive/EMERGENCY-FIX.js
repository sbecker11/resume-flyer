// EMERGENCY FIX - Paste into browser console
// This will bypass all existing code and directly implement the fix

(function() {
    console.clear();
    console.log('🚨 EMERGENCY BIDIRECTIONAL SYNC FIX...\n');
    
    // Step 1: Completely override the click behavior
    const resumeDivs = document.querySelectorAll('.biz-resume-div');
    const sceneContainer = document.getElementById('scene-container');
    
    console.log(`Found ${resumeDivs.length} resume divs`);
    console.log(`Scene container: ${sceneContainer ? '✅' : '❌'}`);
    
    if (resumeDivs.length === 0 || !sceneContainer) {
        console.log('❌ CANNOT PROCEED - Missing required elements');
        return;
    }
    
    // Step 2: Remove ALL existing click listeners and add our own
    resumeDivs.forEach(rDiv => {
        const jobNumber = parseInt(rDiv.getAttribute('data-job-number'));
        
        // Clone the element to remove all event listeners
        const newRDiv = rDiv.cloneNode(true);
        rDiv.parentNode.replaceChild(newRDiv, rDiv);
        
        // Add our direct fix
        newRDiv.addEventListener('click', function(event) {
            console.log(`🎯 EMERGENCY: Clicked rDiv job ${jobNumber}`);
            
            // Find the target cDiv
            const targetCDiv = document.querySelector(`#biz-card-div-${jobNumber}`) ||
                              document.querySelector(`#biz-card-div-${jobNumber}-clone`) ||
                              document.querySelector(`[data-job-number="${jobNumber}"].biz-card-div`);
            
            if (!targetCDiv) {
                console.log(`❌ No cDiv found for job ${jobNumber}`);
                return;
            }
            
            console.log(`✅ Found target cDiv: ${targetCDiv.id}`);
            
            // Update selection state if selectionManager exists
            if (window.selectionManager) {
                try {
                    window.selectionManager.selectJobNumber(jobNumber, 'emergency-fix');
                    console.log(`✅ Updated selection to job ${jobNumber}`);
                } catch (error) {
                    console.log(`⚠️ Selection update failed: ${error.message}`);
                }
            }
            
            // Apply selected styling to rDiv
            document.querySelectorAll('.biz-resume-div').forEach(div => {
                div.classList.remove('selected');
            });
            newRDiv.classList.add('selected');
            console.log(`✅ Applied selected styling to rDiv`);
            
            // DIRECT SCROLL FIX - Scroll the cDiv into view
            const sceneRect = sceneContainer.getBoundingClientRect();
            const cDivRect = targetCDiv.getBoundingClientRect();
            
            // Calculate position to center the cDiv in the scene container
            const scrollTop = sceneContainer.scrollTop + (cDivRect.top - sceneRect.top) - (sceneRect.height / 2) + (cDivRect.height / 2);
            
            console.log(`📊 Scroll calculation:`);
            console.log(`   Current scroll: ${sceneContainer.scrollTop}px`);
            console.log(`   Target scroll: ${Math.round(scrollTop)}px`);
            console.log(`   cDiv current position: ${Math.round(cDivRect.top - sceneRect.top)}px from scene top`);
            
            // Smooth scroll to center the cDiv
            sceneContainer.scrollTo({
                top: scrollTop,
                behavior: 'smooth'
            });
            
            console.log(`✅ EMERGENCY: Scrolled scene container to center job ${jobNumber} cDiv`);
            
            // Verify after scroll animation
            setTimeout(() => {
                const finalScroll = sceneContainer.scrollTop;
                const finalCDivRect = targetCDiv.getBoundingClientRect();
                const finalSceneRect = sceneContainer.getBoundingClientRect();
                const finalPosition = finalCDivRect.top - finalSceneRect.top;
                
                console.log(`📊 Final verification:`);
                console.log(`   Final scroll position: ${Math.round(finalScroll)}px`);
                console.log(`   Final cDiv position: ${Math.round(finalPosition)}px from scene top`);
                console.log(`   cDiv centered: ${Math.abs(finalPosition - finalSceneRect.height/2) < 100 ? '✅' : '❌'}`);
                
                const isVisible = finalCDivRect.top >= finalSceneRect.top && 
                                finalCDivRect.bottom <= finalSceneRect.bottom;
                console.log(`   cDiv fully visible: ${isVisible ? '✅' : '❌'}`);
                
                if (isVisible) {
                    console.log('🎉 EMERGENCY FIX SUCCESS: rDiv-cDiv sync is now working!');
                } else {
                    console.log('❌ EMERGENCY FIX PARTIAL: cDiv scrolled but not fully visible');
                }
            }, 1000);
        });
        
        console.log(`✅ Emergency fix applied to job ${jobNumber}`);
    });
    
    console.log('\n🎉 EMERGENCY BIDIRECTIONAL SYNC FIX APPLIED!');
    console.log('🎯 Click any resume item to test the direct fix');
    console.log('📊 Check console for detailed scroll information');
    
})();