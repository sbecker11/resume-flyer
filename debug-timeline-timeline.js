console.log('=== TIMELINE COMPONENT DEBUG ===');

// Check Timeline SVG element
const timelineSvg = document.querySelector('.timeline-svg');
console.log('Timeline SVG element:', timelineSvg);
if (timelineSvg) {
    console.log('Timeline SVG computed styles:', {
        display: getComputedStyle(timelineSvg).display,
        visibility: getComputedStyle(timelineSvg).visibility,
        opacity: getComputedStyle(timelineSvg).opacity,
        height: getComputedStyle(timelineSvg).height,
        width: getComputedStyle(timelineSvg).width,
        position: getComputedStyle(timelineSvg).position
    });
    console.log('Timeline SVG rect:', timelineSvg.getBoundingClientRect());
    
    // Check if it has any child elements
    console.log('Timeline SVG children:', timelineSvg.children.length);
    console.log('Timeline SVG innerHTML length:', timelineSvg.innerHTML.length);
} else {
    console.log('Timeline SVG element NOT FOUND');
}

// Check TimelineManager status
console.log('\n=== TIMELINE MANAGER STATUS ===');
const initManager = window.initializationManager;
if (initManager) {
    const timelineManager = initManager.getComponent('TimelineManager');
    console.log('TimelineManager instance:', timelineManager);
    
    if (timelineManager) {
        console.log('TimelineManager initialized:', timelineManager.isInitialized);
        
        if (timelineManager.isInitialized) {
            const state = timelineManager.getTimelineState();
            console.log('Timeline state:', {
                isInitialized: state?.isInitialized?.value,
                timelineHeight: state?.timelineHeight?.value,
                startYear: state?.startYear?.value,
                endYear: state?.endYear?.value
            });
        }
    } else {
        console.log('TimelineManager NOT FOUND in service locator');
    }
} else {
    console.log('InitializationManager not available');
}

// Check scene-plane to see if timeline should be visible
const scenePlane = document.getElementById('scene-plane');
if (scenePlane) {
    console.log('\n=== SCENE-PLANE STATUS ===');
    console.log('Scene-plane rect:', scenePlane.getBoundingClientRect());
    console.log('Scene-plane children:', scenePlane.children.length);
    
    // List all children to see if Timeline is there
    Array.from(scenePlane.children).forEach((child, index) => {
        console.log(`Child ${index}:`, child.tagName, child.className, child.id);
    });
}

console.log('=== END TIMELINE DEBUG ===');