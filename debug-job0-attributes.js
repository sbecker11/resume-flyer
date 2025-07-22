// Debug script to check Job #0 attributes after BIZCARDDIV_MIN_HEIGHT fix
console.log('=== Checking Job #0 Attributes ===');

setTimeout(() => {
    const job0 = document.querySelector('[data-job-number="0"]');
    if (!job0) {
        console.log('❌ Job #0 element not found');
        return;
    }
    
    console.log('\n=== Current Job #0 Attributes ===');
    console.log('- data-sceneTop:', job0.getAttribute('data-sceneTop'));
    console.log('- data-sceneBottom:', job0.getAttribute('data-sceneBottom'));
    console.log('- data-sceneHeight:', job0.getAttribute('data-sceneHeight'));
    console.log('- data-sceneCenterY:', job0.getAttribute('data-sceneCenterY'));
    console.log('- data-sceneLeft:', job0.getAttribute('data-sceneLeft'));
    console.log('- data-sceneRight:', job0.getAttribute('data-sceneRight'));
    console.log('- data-sceneWidth:', job0.getAttribute('data-sceneWidth'));
    
    console.log('\n=== Expected vs Actual ===');
    const sceneTop = parseFloat(job0.getAttribute('data-sceneTop') || '0');
    const sceneHeight = parseFloat(job0.getAttribute('data-sceneHeight') || '0');
    const sceneBottom = parseFloat(job0.getAttribute('data-sceneBottom') || '0');
    const sceneCenterY = parseFloat(job0.getAttribute('data-sceneCenterY') || '0');
    
    console.log('Expected behavior:');
    console.log('1. Natural symmetric padding gives ~166px height (Y=150-317)');
    console.log('2. BIZCARDDIV_MIN_HEIGHT enforcement expands to 180px');
    console.log('3. Centered around Y=233.5 → Y=143.5-323.5');
    
    console.log('\nActual values:');
    console.log('- sceneTop:', sceneTop);
    console.log('- sceneBottom:', sceneBottom); 
    console.log('- sceneHeight:', sceneHeight);
    console.log('- sceneCenterY:', sceneCenterY);
    
    console.log('\nCalculated check:');
    console.log('- sceneBottom - sceneTop =', (sceneBottom - sceneTop).toFixed(1), '(should match sceneHeight)');
    console.log('- (sceneTop + sceneBottom) / 2 =', ((sceneTop + sceneBottom) / 2).toFixed(1), '(should match sceneCenterY)');
    
    if (sceneHeight >= 180) {
        console.log('✅ BIZCARDDIV_MIN_HEIGHT constraint applied');
    } else {
        console.log('❌ BIZCARDDIV_MIN_HEIGHT constraint NOT applied');
    }
    
    if (sceneTop < 50 && sceneHeight < 50) {
        console.log('🚨 ISSUE: Still clamped to top with tiny height');
        console.log('   This suggests the BIZCARDDIV_MIN_HEIGHT logic isn\'t working');
    } else if (sceneTop >= 140 && sceneTop <= 150 && sceneHeight >= 180) {
        console.log('✅ SUCCESS: Proper positioning with MIN_HEIGHT enforcement');
    }
    
    // Also check the visual position
    console.log('\n=== Visual Position Check ===');
    const rect = job0.getBoundingClientRect();
    const sceneContainer = document.getElementById('scene-container');
    if (sceneContainer) {
        const sceneRect = sceneContainer.getBoundingClientRect();
        const relativeTop = rect.top - sceneRect.top;
        console.log('- Visual position relative to scene-container: Y=' + relativeTop.toFixed(1));
        console.log('- Should match data-sceneTop:', sceneTop);
    }
    
}, 2000);

console.log('⏳ Waiting for initialization...');