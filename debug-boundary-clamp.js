// Run this in browser console to debug the boundary clamping issue
function debugBoundaryClamp() {
    console.log('=== Boundary Clamp Debug ===');
    
    // Find Job #0
    const job0 = document.querySelector('[data-job-number="0"]');
    if (!job0) {
        console.log('❌ Job #0 not found');
        return;
    }
    
    console.log('Job #0 current attributes:');
    console.log('- data-sceneTop:', job0.getAttribute('data-sceneTop'));
    console.log('- data-sceneBottom:', job0.getAttribute('data-sceneBottom'));
    console.log('- data-sceneHeight:', job0.getAttribute('data-sceneHeight'));
    console.log('- style.top:', job0.style.top);
    console.log('- style.height:', job0.style.height);
    
    const sceneTop = parseFloat(job0.getAttribute('data-sceneTop'));
    const sceneBottom = parseFloat(job0.getAttribute('data-sceneBottom'));
    
    console.log('\n=== Expected vs Actual ===');
    console.log('Expected sceneTop (2025-12-10):', 'Y = 122px');
    console.log('Actual sceneTop:', sceneTop);
    console.log('Expected sceneBottom (2024-12-10):', 'Y = 322px');
    console.log('Actual sceneBottom:', sceneBottom);
    
    if (sceneTop === 0 || sceneTop < 50) {
        console.log('🚨 ISSUE: sceneTop is clamped to top edge');
        console.log('   This means boundary clamping is overriding symmetric padding');
    } else if (Math.abs(sceneTop - 122) < 10) {
        console.log('✅ sceneTop calculated correctly');
        console.log('   Issue might be in CSS positioning or scene-plane transform');
    }
    
    // Check if console shows the CardsController log
    console.log('\n🔍 Look in console for "Job 0 data-scene- attributes:" log');
    console.log('   This will show if symmetric padding was applied correctly');
    
    // Test timeline function
    console.log('\nTimeline verification:');
    console.log('getY("2025-12-10"):', typeof getY !== 'undefined' ? getY('2025-12-10') : 'getY function not available');
    console.log('getY("2024-12-10"):', typeof getY !== 'undefined' ? getY('2024-12-10') : 'getY function not available');
    
    return {
        dataSceneTop: sceneTop,
        dataSceneBottom: sceneBottom,
        styleTop: job0.style.top,
        expectedTop: 122,
        expectedBottom: 322
    };
}

// Also check for any cloned versions
function checkJob0Clone() {
    const clone = document.getElementById('biz-card-div-0-clone');
    if (clone) {
        console.log('\n=== Job #0 Clone ===');
        console.log('- data-sceneTop:', clone.getAttribute('data-sceneTop'));
        console.log('- data-sceneBottom:', clone.getAttribute('data-sceneBottom'));
        console.log('- style.top:', clone.style.top);
    }
}

console.log('Run debugBoundaryClamp() and checkJob0Clone() to diagnose the issue');