// Debug script to test cDiv clone visibility behavior
// This can be run in the browser console to verify the current behavior

function testCloneVisibility(jobNumber = 0) {
    console.log(`🧪 Testing clone visibility for job ${jobNumber}`);
    
    // Find the original card
    const originalCardId = `biz-card-div-${jobNumber}`;
    const originalCard = document.getElementById(originalCardId);
    
    if (!originalCard) {
        console.error(`❌ Original card not found: ${originalCardId}`);
        return false;
    }
    
    console.log(`✅ Found original card: ${originalCardId}`);
    console.log(`   Display: ${originalCard.style.display}`);
    console.log(`   HasClone class: ${originalCard.classList.contains('hasClone')}`);
    console.log(`   Computed display: ${window.getComputedStyle(originalCard).display}`);
    
    // Check for clone
    const cloneId = `${originalCardId}-clone`;
    const clone = document.getElementById(cloneId);
    
    if (clone) {
        console.log(`✅ Found clone: ${cloneId}`);
        console.log(`   Display: ${clone.style.display}`);
        console.log(`   Computed display: ${window.getComputedStyle(clone).display}`);
        console.log(`   Selected class: ${clone.classList.contains('selected')}`);
    } else {
        console.log(`❌ Clone not found: ${cloneId}`);
    }
    
    // Check if both are visible at the same time
    const originalVisible = originalCard && window.getComputedStyle(originalCard).display !== 'none';
    const cloneVisible = clone && window.getComputedStyle(clone).display !== 'none';
    
    console.log(`📊 Visibility status:`);
    console.log(`   Original visible: ${originalVisible}`);
    console.log(`   Clone visible: ${cloneVisible}`);
    console.log(`   Both visible: ${originalVisible && cloneVisible} ${originalVisible && cloneVisible ? '⚠️ ISSUE!' : '✅ OK'}`);
    
    return {
        originalCard,
        clone,
        originalVisible,
        cloneVisible,
        bothVisible: originalVisible && cloneVisible
    };
}

function simulateSelection(jobNumber = 0) {
    console.log(`🎯 Simulating selection of job ${jobNumber}`);
    
    // Get initial state
    const beforeState = testCloneVisibility(jobNumber);
    
    // Trigger selection
    if (window.selectionManager) {
        window.selectionManager.selectJobNumber(jobNumber, 'debug-test');
        
        // Check state after a short delay to allow for async operations
        setTimeout(() => {
            console.log(`🔄 State after selection:`);
            const afterState = testCloneVisibility(jobNumber);
            
            if (afterState.bothVisible) {
                console.error(`🚨 ISSUE CONFIRMED: Both original and clone are visible after selection!`);
                
                // Additional debugging
                console.log(`🔍 Additional debugging info:`);
                if (afterState.originalCard) {
                    console.log(`   Original card styles:`, afterState.originalCard.style.cssText);
                    console.log(`   Original card classes:`, afterState.originalCard.className);
                }
                if (afterState.clone) {
                    console.log(`   Clone styles:`, afterState.clone.style.cssText);
                    console.log(`   Clone classes:`, afterState.clone.className);
                }
            }
        }, 100);
        
    } else {
        console.error(`❌ selectionManager not available`);
    }
}

// Make functions globally available for testing
if (typeof window !== 'undefined') {
    window.testCloneVisibility = testCloneVisibility;
    window.simulateSelection = simulateSelection;
    console.log(`🛠️ Debug functions available:`);
    console.log(`   testCloneVisibility(jobNumber) - Test current visibility state`);
    console.log(`   simulateSelection(jobNumber) - Simulate selection and test before/after`);
}

export { testCloneVisibility, simulateSelection };