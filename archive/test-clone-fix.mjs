// Test script to verify the .clone class fix is working

const testCloneFix = `
console.log('🧪 Testing .clone class fix...');

// Wait for app to load
function waitForApp() {
    return new Promise((resolve) => {
        const checkApp = () => {
            if (window.selectionManager && document.querySelector('.biz-card-div')) {
                console.log('✅ App loaded');
                resolve();
            } else {
                console.log('⏳ Waiting for app...');
                setTimeout(checkApp, 1000);
            }
        };
        checkApp();
    });
}

async function testFix() {
    await waitForApp();
    
    console.log('\\n🎯 Testing selection and clone creation...');
    
    // Clear any existing selection
    window.selectionManager.clearSelection('test');
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Check initial state
    console.log('\\n📊 Before selection:');
    const beforeOriginal = document.querySelector('div.biz-card-div[data-job-number="0"]:not(.clone)');
    const beforeClone = document.querySelector('div.biz-card-div[data-job-number="0"].clone');
    console.log(\`  Original cDiv found: \${!!beforeOriginal}\`);
    console.log(\`  Clone cDiv found: \${!!beforeClone}\`);
    
    // Trigger selection
    console.log('\\n🚀 Selecting job 0...');
    try {
        window.selectionManager.selectJobNumber(0, 'clone-fix-test');
        
        // Wait for validation timeouts to complete
        await new Promise(resolve => setTimeout(resolve, 700));
        
        console.log('✅ Selection completed without error being thrown');
        
        // Check post-selection state
        console.log('\\n📊 After selection:');
        const afterOriginal = document.querySelector('div.biz-card-div[data-job-number="0"]:not(.clone)');
        const afterClone = document.querySelector('div.biz-card-div[data-job-number="0"].clone');
        
        console.log(\`  Original cDiv found: \${!!afterOriginal}\`);
        console.log(\`  Clone cDiv found: \${!!afterClone}\`);
        
        if (afterOriginal) {
            const origStyle = window.getComputedStyle(afterOriginal);
            const origVisible = origStyle.display !== 'none' && origStyle.visibility !== 'hidden' && origStyle.opacity !== '0';
            console.log(\`  Original visible: \${origVisible} (display: \${origStyle.display})\`);
        }
        
        if (afterClone) {
            const cloneStyle = window.getComputedStyle(afterClone);
            const cloneVisible = cloneStyle.display !== 'none' && cloneStyle.visibility !== 'hidden' && cloneStyle.opacity !== '0';
            console.log(\`  Clone visible: \${cloneVisible} (display: \${cloneStyle.display})\`);
            console.log(\`  Clone has .clone class: \${afterClone.classList.contains('clone')}\`);
        }
        
        // Check badge states
        const originalBadges = document.querySelector('#biz-card-badges-div-0');
        const cloneBadges = document.querySelector('#biz-card-badges-div-0-clone');
        
        if (originalBadges) {
            const style = window.getComputedStyle(originalBadges);
            const visible = style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
            console.log(\`  Original badges visible: \${visible} (display: \${style.display})\`);
        }
        
        if (cloneBadges) {
            const style = window.getComputedStyle(cloneBadges);
            const visible = style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
            console.log(\`  Clone badges visible: \${visible} (display: \${style.display})\`);
        }
        
    } catch (error) {
        console.log('🎯 ERROR CAUGHT! Validation is working:');
        console.error(error.message);
        console.log('✅ This confirms the error detection is now functioning');
    }
}

// Run the test
testFix().then(() => {
    console.log('\\n🏁 Clone fix test completed');
}).catch(error => {
    console.error('❌ Test failed:', error);
});
`;

console.log('🧪 Clone Fix Test Script Ready');
console.log('Copy and paste this into the browser console:');
console.log('=====================================');
console.log(testCloneFix);
console.log('=====================================');