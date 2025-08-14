// Debug script to test percentage calculations
// This can be run in the browser console to verify percentage totals

function testPercentageCalculation(rawPercentage) {
    console.log(`🧮 Testing percentage calculation for raw value: ${rawPercentage}%`);
    
    // Apply the same mapping logic as AppContent.vue
    let scenePercent;
    if (rawPercentage <= 10) {
        scenePercent = 0;
    } else if (rawPercentage >= 90) {
        scenePercent = 100;
    } else {
        const mapped = ((rawPercentage - 5) / 90) * 100;
        scenePercent = Math.round(Math.max(0, Math.min(100, mapped)));
    }
    
    const resumePercent = 100 - scenePercent;
    const total = scenePercent + resumePercent;
    
    console.log(`📊 Results:`);
    console.log(`   Raw percentage: ${rawPercentage}%`);
    console.log(`   Scene percentage: ${scenePercent}%`);
    console.log(`   Resume percentage: ${resumePercent}%`);
    console.log(`   Total: ${total}% ${total === 100 ? '✅' : '❌'}`);
    
    return { rawPercentage, scenePercent, resumePercent, total, isValid: total === 100 };
}

function testMultiplePercentages() {
    console.log(`🔍 Testing multiple percentage values:`);
    
    const testValues = [0, 5, 10, 15, 25, 50, 75, 85, 90, 95, 100];
    const results = [];
    
    testValues.forEach(value => {
        const result = testPercentageCalculation(value);
        results.push(result);
        
        if (!result.isValid) {
            console.error(`🚨 FAILED: Raw ${value}% -> Scene ${result.scenePercent}% + Resume ${result.resumePercent}% = ${result.total}%`);
        }
    });
    
    const failedTests = results.filter(r => !r.isValid);
    console.log(`\n📈 Test Summary:`);
    console.log(`   Total tests: ${results.length}`);
    console.log(`   Passed: ${results.length - failedTests.length}`);
    console.log(`   Failed: ${failedTests.length}`);
    
    if (failedTests.length === 0) {
        console.log(`✅ All percentage calculations add up to 100%!`);
    } else {
        console.error(`❌ ${failedTests.length} percentage calculations failed!`);
        failedTests.forEach(test => {
            console.error(`   Raw ${test.rawPercentage}% -> Total ${test.total}%`);
        });
    }
    
    return results;
}

function getCurrentViewerPercentages() {
    console.log(`📺 Checking current viewer percentages in DOM:`);
    
    // Find the percentage display elements
    const sceneLabel = document.querySelector('#scene-view-label .viewer-label');
    const resumeLabel = document.querySelector('#resume-view-label .viewer-label');
    
    if (sceneLabel && resumeLabel) {
        // Extract percentages from text content
        const sceneMatch = sceneLabel.textContent.match(/(\d+)%/);
        const resumeMatch = resumeLabel.textContent.match(/(\d+)%/);
        
        if (sceneMatch && resumeMatch) {
            const scenePercent = parseInt(sceneMatch[1]);
            const resumePercent = parseInt(resumeMatch[1]);
            const total = scenePercent + resumePercent;
            
            console.log(`📊 Current viewer percentages:`);
            console.log(`   Scene Viewer: ${scenePercent}%`);
            console.log(`   Resume Viewer: ${resumePercent}%`);
            console.log(`   Total: ${total}% ${total === 100 ? '✅' : '❌'}`);
            
            if (total !== 100) {
                console.error(`🚨 VIEWER PERCENTAGE MISMATCH DETECTED!`);
                console.log(`   Scene label element:`, sceneLabel);
                console.log(`   Resume label element:`, resumeLabel);
            }
            
            return { scenePercent, resumePercent, total, isValid: total === 100 };
        } else {
            console.error(`❌ Could not extract percentages from labels`);
            console.log(`   Scene label text: "${sceneLabel.textContent}"`);
            console.log(`   Resume label text: "${resumeLabel.textContent}"`);
        }
    } else {
        console.error(`❌ Could not find viewer label elements`);
        console.log(`   Scene label found: ${!!sceneLabel}`);
        console.log(`   Resume label found: ${!!resumeLabel}`);
    }
    
    return null;
}

// Make functions globally available for testing
if (typeof window !== 'undefined') {
    window.testPercentageCalculation = testPercentageCalculation;
    window.testMultiplePercentages = testMultiplePercentages;
    window.getCurrentViewerPercentages = getCurrentViewerPercentages;
    console.log(`🛠️ Percentage debug functions available:`);
    console.log(`   testPercentageCalculation(rawPercentage) - Test single percentage`);
    console.log(`   testMultiplePercentages() - Test range of percentages`);
    console.log(`   getCurrentViewerPercentages() - Check current DOM display`);
}

export { testPercentageCalculation, testMultiplePercentages, getCurrentViewerPercentages };