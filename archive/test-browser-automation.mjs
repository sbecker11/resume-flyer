// Browser automation test to trigger the error detection
// This will be injected into the browser to test the validation

const testScript = `
// Test script to run in browser console
console.log('🧪 Starting browser error detection test...');

// Wait for app to fully load
function waitForApp() {
    return new Promise((resolve) => {
        const checkApp = () => {
            if (window.selectionManager && document.querySelector('.biz-card-div')) {
                console.log('✅ App components loaded');
                resolve();
            } else {
                console.log('⏳ Waiting for app to load...');
                setTimeout(checkApp, 1000);
            }
        };
        checkApp();
    });
}

// Test error detection
async function testErrorDetection() {
    console.log('🎯 Testing error detection system...');
    
    // First, list all existing cDivs
    const allCDivs = document.querySelectorAll('.biz-card-div');
    console.log(\`Found \${allCDivs.length} cDivs on page\`);
    
    allCDivs.forEach((div, index) => {
        const jobNumber = div.getAttribute('data-job-number');
        const isClone = div.classList.contains('clone');
        const style = window.getComputedStyle(div);
        const visible = style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
        console.log(\`  \${index}: Job \${jobNumber}, Clone: \${isClone}, Visible: \${visible}, ID: \${div.id}\`);
    });
    
    // Test selection with job 0 (first job)
    const testJobNumber = 0;
    console.log(\`\\n🚀 Testing selection of job \${testJobNumber}...\`);
    
    try {
        // Clear any existing selection first
        window.selectionManager.clearSelection('browser-test');
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Now select job 0
        console.log('Triggering selection...');
        window.selectionManager.selectJobNumber(testJobNumber, 'browser-error-test');
        
        // Wait for validation to run (it has timeouts at 50ms, 200ms, 500ms)
        await new Promise(resolve => setTimeout(resolve, 700));
        
        console.log('✅ Selection completed without throwing error');
        
        // Check final state
        console.log('\\n📊 Final state after selection:');
        const originalCDiv = document.querySelector(\`div.biz-card-div[data-job-number="\${testJobNumber}"]:not(.clone)\`);
        const cloneCDiv = document.querySelector(\`div.biz-card-div[data-job-number="\${testJobNumber}"].clone\`);
        
        if (originalCDiv) {
            const style = window.getComputedStyle(originalCDiv);
            const visible = style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
            console.log(\`  Original cDiv: visible=\${visible}, display=\${style.display}, visibility=\${style.visibility}, opacity=\${style.opacity}\`);
        } else {
            console.log('  Original cDiv: not found');
        }
        
        if (cloneCDiv) {
            const style = window.getComputedStyle(cloneCDiv);
            const visible = style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
            console.log(\`  Clone cDiv: visible=\${visible}, display=\${style.display}, visibility=\${style.visibility}, opacity=\${style.opacity}\`);
        } else {
            console.log('  Clone cDiv: not found');
        }
        
        // Check badge containers
        const originalBadges = document.querySelector(\`#biz-card-badges-div-\${testJobNumber}\`);
        const cloneBadges = document.querySelector(\`#biz-card-badges-div-\${testJobNumber}-clone\`);
        
        if (originalBadges) {
            const style = window.getComputedStyle(originalBadges);
            const visible = style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
            console.log(\`  Original badges: visible=\${visible}, display=\${style.display}\`);
            
            if (visible) {
                console.error('🚨 ISSUE DETECTED: Original badge container is visible! This should trigger an error!');
                console.error('  This indicates the validation may not be working properly in the live environment');
            }
        } else {
            console.log('  Original badges: not found');
        }
        
        if (cloneBadges) {
            const style = window.getComputedStyle(cloneBadges);
            const visible = style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
            console.log(\`  Clone badges: visible=\${visible}, display=\${style.display}\`);
        } else {
            console.log('  Clone badges: not found');
        }
        
        return true;
        
    } catch (error) {
        console.log('🎯 ERROR CAUGHT! The validation is working correctly:');
        console.error(error.message);
        console.log('✅ Error detection is functioning as expected');
        return false;
    }
}

// Run the test
waitForApp().then(() => {
    return testErrorDetection();
}).then((completed) => {
    console.log(\`\\n🏁 Test completed. Error thrown: \${!completed}\`);
    console.log('If no error was thrown but duplicate badges are visible, the validation needs investigation.');
}).catch((error) => {
    console.error('❌ Test failed:', error);
});
`;

console.log('🌐 Browser test script ready');
console.log('Copy and paste the following into the browser console:');
console.log('=====================================');
console.log(testScript);
console.log('=====================================');

export { testScript };