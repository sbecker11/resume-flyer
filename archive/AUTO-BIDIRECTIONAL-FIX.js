// AUTO BIDIRECTIONAL FIX - Automatically loads when page loads
// This script will automatically run when you click any rDiv

(function() {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeAutoBidirectionalFix);
    } else {
        initializeAutoBidirectionalFix();
    }
    
    function initializeAutoBidirectionalFix() {
        console.log('🤖 AUTO BIDIRECTIONAL FIX: Initializing...');
        
        // Wait a bit for app components to load
        setTimeout(() => {
            setupAutomaticBidirectionalSync();
        }, 2000);
    }
    
    function setupAutomaticBidirectionalSync() {
        console.log('🤖 AUTO BIDIRECTIONAL FIX: Setting up automatic sync...');
        
        // Function to apply the fix to all resume divs
        function applyFixToResumeDivs() {
            const resumeDivs = document.querySelectorAll('.biz-resume-div');
            const sceneContainer = document.getElementById('scene-container');
            
            if (resumeDivs.length === 0 || !sceneContainer) {
                console.log('🤖 AUTO FIX: Waiting for elements to load...');
                setTimeout(applyFixToResumeDivs, 1000);
                return;
            }
            
            console.log(`🤖 AUTO FIX: Found ${resumeDivs.length} resume divs, applying automatic fix...`);
            
            resumeDivs.forEach(rDiv => {
                const jobNumber = parseInt(rDiv.getAttribute('data-job-number'));
                
                // Remove existing listeners by cloning
                const newRDiv = rDiv.cloneNode(true);
                rDiv.parentNode.replaceChild(newRDiv, rDiv);
                
                // Add the automatic bidirectional sync
                newRDiv.addEventListener('click', function(event) {
                    console.log(`🎯 AUTO SYNC: Clicked rDiv job ${jobNumber}`);
                    
                    // Find target cDiv with multiple strategies
                    const targetCDiv = document.querySelector(`#biz-card-div-${jobNumber}`) ||
                                      document.querySelector(`#biz-card-div-${jobNumber}-clone`) ||
                                      document.querySelector(`[data-job-number="${jobNumber}"].biz-card-div`);
                    
                    if (!targetCDiv) {
                        console.log(`❌ AUTO SYNC: No cDiv found for job ${jobNumber}`);
                        return;
                    }
                    
                    console.log(`✅ AUTO SYNC: Found target cDiv: ${targetCDiv.id}`);
                    
                    // Update selection state
                    if (window.selectionManager) {
                        try {
                            window.selectionManager.selectJobNumber(jobNumber, 'auto-bidirectional-fix');
                        } catch (error) {
                            console.log(`⚠️ AUTO SYNC: Selection update failed: ${error.message}`);
                        }
                    }
                    
                    // Apply selected styling
                    document.querySelectorAll('.biz-resume-div').forEach(div => {
                        div.classList.remove('selected');
                    });
                    newRDiv.classList.add('selected');
                    
                    // AUTOMATIC SCROLL TO CENTER THE cDiv
                    const sceneRect = sceneContainer.getBoundingClientRect();
                    const cDivRect = targetCDiv.getBoundingClientRect();
                    
                    const scrollTop = sceneContainer.scrollTop + (cDivRect.top - sceneRect.top) - (sceneRect.height / 2) + (cDivRect.height / 2);
                    
                    console.log(`🔄 AUTO SYNC: Scrolling to center job ${jobNumber} (position ${Math.round(scrollTop)}px)`);
                    
                    sceneContainer.scrollTo({
                        top: scrollTop,
                        behavior: 'smooth'
                    });
                    
                    // Verify the sync worked
                    setTimeout(() => {
                        const finalCDivRect = targetCDiv.getBoundingClientRect();
                        const finalSceneRect = sceneContainer.getBoundingClientRect();
                        const isVisible = finalCDivRect.top >= finalSceneRect.top && 
                                         finalCDivRect.bottom <= finalSceneRect.bottom;
                        
                        if (isVisible) {
                            console.log(`✅ AUTO SYNC SUCCESS: Job ${jobNumber} cDiv is now visible and centered!`);
                        } else {
                            console.log(`⚠️ AUTO SYNC PARTIAL: Job ${jobNumber} cDiv scrolled but not fully centered`);
                        }
                    }, 1000);
                });
            });
            
            console.log('🎉 AUTO BIDIRECTIONAL FIX: All resume divs now have automatic sync!');
            console.log('🎯 Click any resume item to see automatic bidirectional synchronization');
        }
        
        // Start applying the fix
        applyFixToResumeDivs();
        
        // Also watch for new resume divs being added dynamically
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.classList && node.classList.contains('biz-resume-div')) {
                        console.log('🤖 AUTO FIX: New resume div detected, applying fix...');
                        setTimeout(applyFixToResumeDivs, 100);
                    }
                });
            });
        });
        
        observer.observe(document.body, { childList: true, subtree: true });
    }
    
    console.log('🤖 AUTO BIDIRECTIONAL FIX: Loaded and ready!');
})();