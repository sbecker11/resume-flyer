console.log('=== TIMELINE POSITION DEBUG ===');

// Check if we can access the timeline manager
const timelineManager = window.initializationManager?.getComponent('TimelineManager');
console.log('TimelineManager:', timelineManager);
console.log('TimelineManager initialized:', timelineManager?.isInitialized);

if (timelineManager && timelineManager.isInitialized) {
    // Test with a few different dates to see if we get different Y positions
    const testDates = [
        new Date('2024-01-01'),
        new Date('2023-01-01'), 
        new Date('2022-01-01'),
        new Date('2021-01-01')
    ];
    
    console.log('Testing timeline positions for different dates:');
    testDates.forEach(date => {
        const position = timelineManager.getPositionForDate(date);
        console.log(`Date: ${date.toISOString().split('T')[0]} -> Y position: ${position}`);
    });
} else {
    console.log('TimelineManager not available or not initialized');
}

// Check actual cDiv scene coordinates
const cDivs = document.querySelectorAll('.biz-card-div');
console.log(`Found ${cDivs.length} cDivs`);

const sceneTopValues = [];
cDivs.forEach((cDiv, index) => {
    const sceneTop = cDiv.getAttribute('data-sceneTop');
    const sceneBottom = cDiv.getAttribute('data-sceneBottom'); 
    const sceneCenterY = cDiv.getAttribute('data-sceneCenterY');
    sceneTopValues.push(parseFloat(sceneTop));
    
    if (index < 5) { // Show first 5 for debugging
        console.log(`cDiv ${index}: sceneTop=${sceneTop}, sceneBottom=${sceneBottom}, sceneCenterY=${sceneCenterY}`);
    }
});

// Check if all scene Y coordinates are the same
const uniqueSceneTops = [...new Set(sceneTopValues)];
console.log('Unique sceneTop values:', uniqueSceneTops);
console.log('All cDivs have same sceneTop?', uniqueSceneTops.length === 1);

console.log('=== END TIMELINE DEBUG ===');