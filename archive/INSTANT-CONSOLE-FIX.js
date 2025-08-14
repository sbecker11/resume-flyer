// INSTANT CONSOLE FIX
// Copy this entire code block and paste into browser console
// This will immediately fix bidirectional sync right now

console.clear();
console.log('🚨 INSTANT BIDIRECTIONAL SYNC FIX');
console.log('================================');

// Step 1: Find all resume divs and scene container
const resumeDivs = document.querySelectorAll('.biz-resume-div');
const sceneContainer = document.getElementById('scene-container');

console.log(`Found ${resumeDivs.length} resume divs`);
console.log(`Scene container: ${sceneContainer ? 'YES' : 'NO'}`);

if (resumeDivs.length === 0) {
    console.log('❌ NO RESUME DIVS FOUND');
    console.log('Make sure the app is fully loaded and try again');
} else if (!sceneContainer) {
    console.log('❌ NO SCENE CONTAINER FOUND');
    console.log('Make sure the app is fully loaded and try again');
} else {
    console.log('✅ APPLYING INSTANT FIX...');
    
    // Step 2: Apply fix to each resume div
    let fixedCount = 0;
    
    resumeDivs.forEach((rDiv, index) => {
        const jobNumber = parseInt(rDiv.getAttribute('data-job-number') || '0');
        
        // Create new element to remove all existing event listeners
        const newRDiv = rDiv.cloneNode(true);
        rDiv.parentNode.replaceChild(newRDiv, rDiv);
        
        // Add immediate fix click handler
        newRDiv.addEventListener('click', function(event) {
            event.preventDefault();
            event.stopPropagation();
            
            console.log(`\n🎯 CLICKED: Job ${jobNumber}`);
            
            // Find the corresponding cDiv
            let targetCDiv = document.querySelector(`#biz-card-div-${jobNumber}`);
            if (!targetCDiv) {
                targetCDiv = document.querySelector(`#biz-card-div-${jobNumber}-clone`);
            }
            if (!targetCDiv) {
                targetCDiv = document.querySelector(`[data-job-number="${jobNumber}"].biz-card-div`);
            }
            
            if (!targetCDiv) {
                console.log(`❌ No cDiv found for job ${jobNumber}`);
                return;
            }
            
            console.log(`✅ Found cDiv: ${targetCDiv.id}`);
            
            // Clear all selected states
            document.querySelectorAll('.biz-resume-div').forEach(div => {
                div.classList.remove('selected');
            });
            
            // Add selected state to clicked rDiv
            newRDiv.classList.add('selected');
            console.log(`✅ Applied 'selected' class to rDiv`);
            
            // Calculate scroll position to center the cDiv
            const sceneRect = sceneContainer.getBoundingClientRect();
            const cDivRect = targetCDiv.getBoundingClientRect();
            
            const currentScroll = sceneContainer.scrollTop;
            const targetScroll = currentScroll + (cDivRect.top - sceneRect.top) - (sceneRect.height / 2) + (cDivRect.height / 2);
            
            console.log(`📊 Scroll info:`);
            console.log(`   Current: ${Math.round(currentScroll)}px`);
            console.log(`   Target: ${Math.round(targetScroll)}px`);
            console.log(`   cDiv position: ${Math.round(cDivRect.top - sceneRect.top)}px from scene top`);
            
            // Scroll to center the cDiv
            sceneContainer.scrollTo({
                top: targetScroll,
                behavior: 'smooth'
            });
            
            console.log(`🔄 SCROLLING to center job ${jobNumber}...`);
            
            // Verify after 1 second
            setTimeout(() => {
                const finalCDivRect = targetCDiv.getBoundingClientRect();
                const finalSceneRect = sceneContainer.getBoundingClientRect();
                const finalScroll = sceneContainer.scrollTop;
                
                // Check if cDiv is visible in scene container
                const isVisible = (
                    finalCDivRect.top >= finalSceneRect.top &&
                    finalCDivRect.bottom <= finalSceneRect.bottom
                );
                
                const distanceFromCenter = Math.abs(
                    (finalCDivRect.top + finalCDivRect.height/2) - 
                    (finalSceneRect.top + finalSceneRect.height/2)
                );
                
                console.log(`📊 Final result:`);
                console.log(`   Final scroll: ${Math.round(finalScroll)}px`);
                console.log(`   cDiv visible: ${isVisible ? 'YES ✅' : 'NO ❌'}`);
                console.log(`   Distance from center: ${Math.round(distanceFromCenter)}px`);
                
                if (isVisible && distanceFromCenter < 100) {
                    console.log(`🎉 SUCCESS: Job ${jobNumber} perfectly centered!`);
                } else if (isVisible) {
                    console.log(`✅ PARTIAL: Job ${jobNumber} visible but not centered`);
                } else {
                    console.log(`❌ FAILED: Job ${jobNumber} not visible after scroll`);
                }
            }, 1500);
        });
        
        fixedCount++;
    });
    
    console.log(`\n🎉 INSTANT FIX COMPLETE!`);
    console.log(`✅ Applied fix to ${fixedCount} resume divs`);
    console.log(`🎯 Click any resume item to test bidirectional sync`);
    console.log(`📊 Watch console for detailed scroll information`);
}

console.log('\n================================');
console.log('INSTANT BIDIRECTIONAL SYNC FIX READY');
console.log('Click any resume item now!');