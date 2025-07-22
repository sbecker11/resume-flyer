// Test script to verify Job #0 position after scene-container height fix
console.log('=== Testing Job #0 Position After Scene-Container Height Fix ===');

// Wait for initialization to complete
setTimeout(() => {
    const job0 = document.querySelector('[data-job-number="0"]');
    if (!job0) {
        console.log('❌ Job #0 not found');
        return;
    }
    
    console.log('\n=== Scene-Container Height ===');
    const sceneContainer = document.getElementById('scene-container');
    if (sceneContainer) {
        console.log('- clientHeight:', sceneContainer.clientHeight + 'px');
        console.log('- offsetHeight:', sceneContainer.offsetHeight + 'px');
        console.log('- style.height:', sceneContainer.style.height || 'not set');
    }
    
    console.log('\n=== Timeline Height ===');
    if (typeof useTimeline !== 'undefined') {
        const { timelineHeight } = useTimeline();
        console.log('- calculated height:', timelineHeight.value + 'px');
    } else {
        console.log('- useTimeline not available');
    }
    
    console.log('\n=== Job #0 Position ===');
    console.log('- data-sceneTop:', job0.getAttribute('data-sceneTop'));
    console.log('- data-sceneBottom:', job0.getAttribute('data-sceneBottom'));
    console.log('- style.top:', job0.style.top);
    console.log('- style.height:', job0.style.height);
    
    const sceneTop = parseFloat(job0.getAttribute('data-sceneTop') || '0');
    const sceneBottom = parseFloat(job0.getAttribute('data-sceneBottom') || '0');
    
    console.log('\n=== Expected vs Actual ===');
    console.log('Expected range: Y=150-317px (based on symmetric padding test)');
    console.log('Actual range: Y=' + sceneTop + '-' + sceneBottom + 'px');
    
    if (sceneTop >= 140 && sceneTop <= 160 && sceneBottom >= 310 && sceneBottom <= 320) {
        console.log('✅ SUCCESS: Job #0 positioned correctly!');
    } else if (sceneTop < 50 || sceneBottom < 100) {
        console.log('❌ ISSUE: Job #0 still clamped to container bounds');
        console.log('   This suggests scene-container height is still too small');
    } else {
        console.log('⚠️  WARNING: Position unexpected, but not clamped');
    }
    
    // Test console functions
    if (typeof getY !== 'undefined') {
        console.log('\n=== Timeline Function Test ===');
        console.log('getY("2024-12-10"):', getY('2024-12-10'));
        console.log('getY("2025-12-10"):', getY('2025-12-10'));
    }
    
}, 2000); // Wait 2 seconds for full initialization

console.log('⏳ Waiting for initialization to complete...');