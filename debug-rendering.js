console.log('=== RENDERING DEBUG START ===');

// Check BullsEye element
const bullsEye = document.getElementById('bulls-eye');
console.log('BullsEye element:', bullsEye);
if (bullsEye) {
    console.log('BullsEye computed styles:', {
        position: getComputedStyle(bullsEye).position,
        left: getComputedStyle(bullsEye).left,
        top: getComputedStyle(bullsEye).top,
        transform: getComputedStyle(bullsEye).transform,
        display: getComputedStyle(bullsEye).display,
        visibility: getComputedStyle(bullsEye).visibility,
        opacity: getComputedStyle(bullsEye).opacity,
        zIndex: getComputedStyle(bullsEye).zIndex,
        width: getComputedStyle(bullsEye).width,
        height: getComputedStyle(bullsEye).height
    });
    console.log('BullsEye rect:', bullsEye.getBoundingClientRect());
} else {
    console.log('BullsEye element NOT FOUND');
}

// Check scene-plane
const scenePlane = document.getElementById('scene-plane');
console.log('Scene-plane element:', scenePlane);
if (scenePlane) {
    console.log('Scene-plane computed styles:', {
        position: getComputedStyle(scenePlane).position,
        width: getComputedStyle(scenePlane).width,
        height: getComputedStyle(scenePlane).height,
        display: getComputedStyle(scenePlane).display,
        visibility: getComputedStyle(scenePlane).visibility,
        opacity: getComputedStyle(scenePlane).opacity,
        transform: getComputedStyle(scenePlane).transform
    });
    console.log('Scene-plane rect:', scenePlane.getBoundingClientRect());
    
    // Check cDivs inside scene-plane
    const cDivs = scenePlane.querySelectorAll('.biz-card-div');
    console.log('Found', cDivs.length, 'cDivs in scene-plane');
    
    if (cDivs.length > 0) {
        const firstCDiv = cDivs[0];
        console.log('First cDiv:', firstCDiv);
        console.log('First cDiv computed styles:', {
            position: getComputedStyle(firstCDiv).position,
            left: getComputedStyle(firstCDiv).left,
            top: getComputedStyle(firstCDiv).top,
            width: getComputedStyle(firstCDiv).width,
            height: getComputedStyle(firstCDiv).height,
            display: getComputedStyle(firstCDiv).display,
            visibility: getComputedStyle(firstCDiv).visibility,
            opacity: getComputedStyle(firstCDiv).opacity,
            zIndex: getComputedStyle(firstCDiv).zIndex,
            transform: getComputedStyle(firstCDiv).transform
        });
        console.log('First cDiv rect:', firstCDiv.getBoundingClientRect());
    }
} else {
    console.log('Scene-plane element NOT FOUND');
}

// Check scene-container
const sceneContainer = document.getElementById('scene-container');
console.log('Scene-container element:', sceneContainer);
if (sceneContainer) {
    console.log('Scene-container computed styles:', {
        position: getComputedStyle(sceneContainer).position,
        width: getComputedStyle(sceneContainer).width,
        height: getComputedStyle(sceneContainer).height,
        display: getComputedStyle(sceneContainer).display,
        visibility: getComputedStyle(sceneContainer).visibility,
        opacity: getComputedStyle(sceneContainer).opacity,
        overflow: getComputedStyle(sceneContainer).overflow
    });
    console.log('Scene-container rect:', sceneContainer.getBoundingClientRect());
}

console.log('=== RENDERING DEBUG END ===');