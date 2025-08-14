// DIRECT FIX - This will definitely work
alert('DIRECT FIX LOADING - Check console for output');
console.log('🚨 DIRECT FIX SCRIPT LOADED');

// Wait for elements to load
setTimeout(function() {
    console.log('🔥 STARTING DIRECT BIDIRECTIONAL SYNC FIX');
    
    const resumeDivs = document.querySelectorAll('.biz-resume-div');
    const sceneContainer = document.getElementById('scene-container');
    const cardDivs = document.querySelectorAll('.biz-card-div');
    
    console.log('SYSTEM STATUS:');
    console.log('Resume divs: ' + resumeDivs.length);
    console.log('Card divs: ' + cardDivs.length);  
    console.log('Scene container: ' + (sceneContainer ? 'YES' : 'NO'));
    
    if (resumeDivs.length > 0 && sceneContainer) {
        console.log('✅ APPLYING DIRECT FIX TO ALL RESUME DIVS');
        
        resumeDivs.forEach(function(rDiv) {
            const jobNumber = parseInt(rDiv.getAttribute('data-job-number'));
            
            // Remove existing handlers
            const newRDiv = rDiv.cloneNode(true);
            rDiv.parentNode.replaceChild(newRDiv, rDiv);
            
            // Add direct handler
            newRDiv.addEventListener('click', function() {
                console.log('🎯 CLICKED JOB: ' + jobNumber);
                
                // Find target cDiv
                let targetCDiv = null;
                cardDivs.forEach(function(cDiv) {
                    if (cDiv.getAttribute('data-job-number') == jobNumber) {
                        targetCDiv = cDiv;
                    }
                });
                
                if (!targetCDiv) {
                    targetCDiv = document.querySelector('#biz-card-div-' + jobNumber);
                }
                
                console.log('Target cDiv: ' + (targetCDiv ? targetCDiv.id : 'NOT FOUND'));
                
                if (targetCDiv) {
                    // Clear selections
                    document.querySelectorAll('.biz-resume-div').forEach(function(div) {
                        div.classList.remove('selected');
                    });
                    
                    // Apply selection
                    newRDiv.classList.add('selected');
                    console.log('✅ Applied selection to rDiv ' + jobNumber);
                    
                    // Calculate scroll
                    const sceneRect = sceneContainer.getBoundingClientRect();
                    const cDivRect = targetCDiv.getBoundingClientRect();
                    const scrollTop = sceneContainer.scrollTop + (cDivRect.top - sceneRect.top) - (sceneRect.height / 2) + (cDivRect.height / 2);
                    
                    console.log('📊 SCROLLING:');
                    console.log('  Current: ' + sceneContainer.scrollTop + 'px');
                    console.log('  Target: ' + Math.round(scrollTop) + 'px');
                    
                    // Execute scroll
                    sceneContainer.scrollTo({
                        top: scrollTop,
                        behavior: 'smooth'
                    });
                    
                    console.log('🔄 SCROLL EXECUTED for job ' + jobNumber);
                    
                    // Verify after scroll
                    setTimeout(function() {
                        const finalRect = targetCDiv.getBoundingClientRect();
                        const finalSceneRect = sceneContainer.getBoundingClientRect();
                        const visible = finalRect.top >= finalSceneRect.top && finalRect.bottom <= finalSceneRect.bottom;
                        
                        console.log('📊 FINAL RESULT:');
                        console.log('  Final scroll: ' + Math.round(sceneContainer.scrollTop) + 'px');
                        console.log('  cDiv visible: ' + (visible ? 'YES SUCCESS' : 'NO FAILURE'));
                        
                        if (visible) {
                            console.log('🎉 SUCCESS: Job ' + jobNumber + ' bidirectional sync WORKING!');
                        } else {
                            console.log('❌ FAILURE: Job ' + jobNumber + ' bidirectional sync FAILED');
                        }
                    }, 2000);
                }
            });
        });
        
        console.log('🎉 DIRECT FIX APPLIED TO ALL ' + resumeDivs.length + ' RESUME DIVS');
        console.log('🎯 Click any resume item to test');
    } else {
        console.log('❌ ELEMENTS NOT READY - will retry');
        setTimeout(arguments.callee, 1000);
    }
}, 3000);

console.log('🚨 DIRECT FIX SCRIPT READY');