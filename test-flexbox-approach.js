// Test script to verify flexbox approach for scene-container height
console.log('=== Testing Flexbox Approach for Scene-Container ===');

setTimeout(() => {
    console.log('\n=== Timeline SVG Element ===');
    const timelineSvg = document.querySelector('.timeline-svg');
    if (timelineSvg) {
        console.log('- SVG height:', timelineSvg.style.height);
        console.log('- SVG offsetHeight:', timelineSvg.offsetHeight + 'px');
        console.log('- SVG clientHeight:', timelineSvg.clientHeight + 'px');
    } else {
        console.log('❌ Timeline SVG not found');
    }
    
    console.log('\n=== Scene-Plane Container ===');
    const scenePlane = document.getElementById('scene-plane');
    if (scenePlane) {
        console.log('- offsetHeight:', scenePlane.offsetHeight + 'px');
        console.log('- clientHeight:', scenePlane.clientHeight + 'px');
        console.log('- scrollHeight:', scenePlane.scrollHeight + 'px');
    }
    
    console.log('\n=== Scene-Content Container ===');
    const sceneContent = document.getElementById('scene-content');
    if (sceneContent) {
        console.log('- offsetHeight:', sceneContent.offsetHeight + 'px');
        console.log('- clientHeight:', sceneContent.clientHeight + 'px');
        console.log('- scrollHeight:', sceneContent.scrollHeight + 'px');
    }
    
    console.log('\n=== Scene-Container ===');
    const sceneContainer = document.getElementById('scene-container');
    if (sceneContainer) {
        console.log('- offsetHeight:', sceneContainer.offsetHeight + 'px');
        console.log('- clientHeight:', sceneContainer.clientHeight + 'px');
        console.log('- style.height:', sceneContainer.style.height || 'not manually set');
        console.log('- computed height:', getComputedStyle(sceneContainer).height);
    }
    
    console.log('\n=== Job #0 Position Check ===');
    const job0 = document.querySelector('[data-job-number="0"]');
    if (job0) {
        const sceneTop = parseFloat(job0.getAttribute('data-sceneTop') || '0');
        const sceneBottom = parseFloat(job0.getAttribute('data-sceneBottom') || '0');
        
        console.log('- sceneTop:', sceneTop + 'px');
        console.log('- sceneBottom:', sceneBottom + 'px');
        
        if (sceneTop >= 140 && sceneTop <= 160) {
            console.log('✅ SUCCESS: Job #0 positioned correctly with flexbox approach!');
        } else if (sceneTop < 50) {
            console.log('❌ ISSUE: Job #0 still clamped - flexbox may need adjustment');
        } else {
            console.log('⚠️  WARNING: Unexpected position:', sceneTop + '-' + sceneBottom);
        }
    } else {
        console.log('❌ Job #0 element not found');
    }
    
    console.log('\n=== Flexbox Analysis ===');
    if (timelineSvg && sceneContent) {
        const timelineHeight = timelineSvg.offsetHeight;
        const containerHeight = sceneContent.scrollHeight;
        
        if (containerHeight >= timelineHeight) {
            console.log('✅ Container naturally grew to contain timeline');
            console.log('   Timeline:', timelineHeight + 'px, Container scroll:', containerHeight + 'px');
        } else {
            console.log('❌ Container did not grow properly');
            console.log('   Timeline:', timelineHeight + 'px, Container scroll:', containerHeight + 'px');
        }
    }
    
}, 2000);

console.log('⏳ Waiting for flexbox layout to complete...');