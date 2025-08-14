// Quick test script - paste this into browser console after app loads

console.log('🧪 Quick Selection Sync Test Starting...\n');

// Test 1: Check basic availability
console.log('1️⃣ Checking system availability...');
console.log('  - debugSelectionSync:', typeof window.debugSelectionSync);
console.log('  - testRDivToCDivSync:', typeof window.testRDivToCDivSync);
console.log('  - testResumeClick:', typeof window.testResumeClick);
console.log('  - resumeListController:', !!window.resumeListController);
console.log('  - selectionManager:', !!window.selectionManager);

// Test 2: DOM elements
console.log('\n2️⃣ Checking DOM elements...');
const resumeDivs = document.querySelectorAll('.biz-resume-div');
const cardDivs = document.querySelectorAll('.biz-card-div');
console.log('  - Resume divs:', resumeDivs.length);
console.log('  - Card divs:', cardDivs.length);

// Test 3: Run system debug if available
console.log('\n3️⃣ Running system debug...');
if (typeof window.debugSelectionSync === 'function') {
    const status = window.debugSelectionSync();
    console.log('  - System status:', status);
} else {
    console.log('  - debugSelectionSync not available');
}

// Test 4: Try a simple resume click
console.log('\n4️⃣ Testing resume click simulation...');
if (typeof window.testResumeClick === 'function') {
    console.log('  - Attempting to click job 5...');
    window.testResumeClick(5);
} else {
    console.log('  - testResumeClick not available');
}

// Test 5: Try direct selection
console.log('\n5️⃣ Testing direct selection...');
if (window.selectionManager && typeof window.selectionManager.selectJobNumber === 'function') {
    console.log('  - Attempting direct selection of job 8...');
    window.selectionManager.selectJobNumber(8, 'quick-test');
} else {
    console.log('  - selectionManager.selectJobNumber not available');
}

// Test 6: Try RDiv to CDiv sync test
console.log('\n6️⃣ Testing RDiv to CDiv sync...');
if (typeof window.testRDivToCDivSync === 'function') {
    console.log('  - Testing sync for job 10...');
    window.testRDivToCDivSync(10);
} else {
    console.log('  - testRDivToCDivSync not available');
}

console.log('\n✅ Quick test completed! Check console output above for results.');
console.log('💡 If functions are not available, the system may not be fully loaded yet.');
console.log('🔄 Try running this test again in a few seconds, or check for errors in the console.');