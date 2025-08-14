// Test script to verify error detection is working properly
// Run this in browser console to test the validation logic

function testErrorDetection() {
    console.log('🧪 Testing error detection system...');
    
    // First, check if selectionManager is available
    if (!window.selectionManager) {
        console.error('❌ selectionManager not available');
        return;
    }
    
    console.log('✅ selectionManager found');
    
    // Test the error throwing mechanism first
    console.log('🔧 Testing error throwing mechanism...');
    try {
        // Uncomment the test error line in selectJobNumber temporarily
        const originalCode = window.selectionManager.selectJobNumber.toString();
        if (originalCode.includes('throw new Error(`TEST ERROR')) {
            console.log('⚠️ Test error is still active in code - this will throw an error on next selection');
        } else {
            console.log('✅ Test error is commented out - proceeding with real test');
        }
    } catch (e) {
        console.log('🔍 Error checking test error status:', e.message);
    }
    
    // Test with job 0 (most likely to exist)
    const testJobNumber = 0;
    
    console.log(`🎯 Testing with job ${testJobNumber}...`);
    
    // Check current state before selection
    console.log('📊 Checking current state before selection...');
    
    // Look for existing cDivs
    const originalCDiv = document.querySelector(`div.biz-card-div[data-job-number="${testJobNumber}"]:not(.clone)`);
    const cloneCDiv = document.querySelector(`div.biz-card-div[data-job-number="${testJobNumber}"].clone`);
    
    console.log('Original cDiv found:', !!originalCDiv);
    console.log('Clone cDiv found:', !!cloneCDiv);
    
    // Look for badge containers
    const originalBadgeContainer = document.querySelector(`#biz-card-badges-div-${testJobNumber}`);
    const cloneBadgeContainer = document.querySelector(`#biz-card-badges-div-${testJobNumber}-clone`);
    
    console.log('Original badge container found:', !!originalBadgeContainer);
    console.log('Clone badge container found:', !!cloneBadgeContainer);
    
    if (originalBadgeContainer) {
        const style = window.getComputedStyle(originalBadgeContainer);
        console.log(`Original badges visible: ${style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0'}`);
        console.log(`Original badges display: ${style.display}, visibility: ${style.visibility}, opacity: ${style.opacity}`);
    }
    
    if (cloneBadgeContainer) {
        const style = window.getComputedStyle(cloneBadgeContainer);
        console.log(`Clone badges visible: ${style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0'}`);
        console.log(`Clone badges display: ${style.display}, visibility: ${style.visibility}, opacity: ${style.opacity}`);
    }
    
    // Now trigger selection and see if error detection works
    console.log('🚀 Triggering selection to test error detection...');
    
    try {
        window.selectionManager.selectJobNumber(testJobNumber, 'error-detection-test');
        console.log('✅ Selection completed without throwing error');
        
        // Wait a moment and check if validation ran
        setTimeout(() => {
            console.log('🔄 Checking state after selection validation...');
            
            // Re-check badge visibility after selection
            if (originalBadgeContainer) {
                const style = window.getComputedStyle(originalBadgeContainer);
                const visible = style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
                console.log(`Original badges now visible: ${visible}`);
                if (visible) {
                    console.error('🚨 POTENTIAL ISSUE: Original badge container is visible after selection!');
                    console.error('   This should have triggered an error in validateBadgeDuplication()');
                }
            }
            
            if (cloneBadgeContainer) {
                const style = window.getComputedStyle(cloneBadgeContainer);
                const visible = style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
                console.log(`Clone badges now visible: ${visible}`);
            }
            
            // Check cDiv visibility
            if (originalCDiv && cloneCDiv) {
                const originalStyle = window.getComputedStyle(originalCDiv);
                const cloneStyle = window.getComputedStyle(cloneCDiv);
                
                const originalVisible = originalStyle.display !== 'none' && originalStyle.visibility !== 'hidden' && originalStyle.opacity !== '0';
                const cloneVisible = cloneStyle.display !== 'none' && cloneStyle.visibility !== 'hidden' && cloneStyle.opacity !== '0';
                
                console.log(`Original cDiv visible: ${originalVisible}`);
                console.log(`Clone cDiv visible: ${cloneVisible}`);
                
                if (originalVisible && cloneVisible) {
                    console.error('🚨 POTENTIAL ISSUE: Both original and clone cDiv are visible!');
                    console.error('   This should have triggered an error in validateCloneVisibility()');
                }
            }
            
        }, 600); // Wait longer than the validation timeouts (50ms, 200ms, 500ms)
        
    } catch (error) {
        console.log('🎯 ERROR CAUGHT! This indicates the validation is working:');
        console.error(error.message);
        console.log('✅ Error detection appears to be functioning correctly');
        return true;
    }
    
    console.log('⏳ Waiting for validation results...');
    return false;
}

// Also create a manual function to trigger the validation directly
function testValidationDirect(jobNumber = 0) {
    console.log(`🧪 Testing validation functions directly for job ${jobNumber}...`);
    
    if (!window.selectionManager) {
        console.error('❌ selectionManager not available');
        return;
    }
    
    try {
        console.log('🔍 Running validateCloneVisibility...');
        window.selectionManager.validateCloneVisibility(jobNumber);
        console.log('✅ validateCloneVisibility completed without error');
    } catch (error) {
        console.log('🎯 validateCloneVisibility ERROR CAUGHT:');
        console.error(error.message);
    }
    
    try {
        console.log('🔍 Running validateBadgeDuplication...');
        window.selectionManager.validateBadgeDuplication(jobNumber);
        console.log('✅ validateBadgeDuplication completed without error');
    } catch (error) {
        console.log('🎯 validateBadgeDuplication ERROR CAUGHT:');
        console.error(error.message);
    }
}

// Make functions available globally
if (typeof window !== 'undefined') {
    window.testErrorDetection = testErrorDetection;
    window.testValidationDirect = testValidationDirect;
    console.log('🛠️ Error detection test functions available:');
    console.log('   testErrorDetection() - Full error detection test');
    console.log('   testValidationDirect(jobNumber) - Test validation functions directly');
}

export { testErrorDetection, testValidationDirect };