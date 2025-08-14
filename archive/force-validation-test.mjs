// Force validation test to determine if the logic itself works

const forceTest = `
console.log('🔬 FORCED VALIDATION TEST');

// This will manually trigger validation to see if the logic works
function forceValidationTest() {
    console.log('\\n🧪 Testing validation logic directly...');
    
    if (!window.selectionManager) {
        console.error('❌ selectionManager not available');
        return;
    }
    
    // Test all jobs 0-5 to see if any have violations
    for (let jobNum = 0; jobNum < 6; jobNum++) {
        console.log(\`\\n--- Testing Job \${jobNum} ---\`);
        
        // Test clone visibility validation
        try {
            console.log(\`🔍 Testing validateCloneVisibility(\${jobNum})...\`);
            window.selectionManager.validateCloneVisibility(jobNum);
            console.log(\`✅ No clone visibility error for job \${jobNum}\`);
        } catch (error) {
            console.log(\`🎯 CLONE ERROR CAUGHT for job \${jobNum}:\`);
            console.error(error.message);
        }
        
        // Test badge duplication validation  
        try {
            console.log(\`🔍 Testing validateBadgeDuplication(\${jobNum})...\`);
            window.selectionManager.validateBadgeDuplication(jobNum);
            console.log(\`✅ No badge duplication error for job \${jobNum}\`);
        } catch (error) {
            console.log(\`🎯 BADGE ERROR CAUGHT for job \${jobNum}:\`);
            console.error(error.message);
        }
    }
    
    console.log('\\n📊 Force validation test complete');
}

// Also create a function to manually check what selectors find
function checkSelectors() {
    console.log('\\n🔍 Manual selector check for currently visible violations...');
    
    for (let jobNum = 0; jobNum < 6; jobNum++) {
        const origCDiv = document.querySelector(\`div.biz-card-div[data-job-number="\${jobNum}"]:not(.clone)\`);
        const cloneCDiv = document.querySelector(\`div.biz-card-div[data-job-number="\${jobNum}"].clone\`);
        const origBadges = document.querySelector(\`#biz-card-badges-div-\${jobNum}\`);
        const cloneBadges = document.querySelector(\`#biz-card-badges-div-\${jobNum}-clone\`);
        
        if (origCDiv || cloneCDiv || origBadges || cloneBadges) {
            console.log(\`\\nJob \${jobNum}:\`);
            
            if (origCDiv) {
                const style = window.getComputedStyle(origCDiv);
                const visible = style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
                console.log(\`  Original cDiv: \${visible ? '👁️  VISIBLE' : '🚫 hidden'} (\${origCDiv.id})\`);
            }
            
            if (cloneCDiv) {
                const style = window.getComputedStyle(cloneCDiv);
                const visible = style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
                console.log(\`  Clone cDiv: \${visible ? '👁️  VISIBLE' : '🚫 hidden'} (\${cloneCDiv.id})\`);
                console.log(\`    Has .clone class: \${cloneCDiv.classList.contains('clone')}\`);
            }
            
            if (origBadges) {
                const style = window.getComputedStyle(origBadges);
                const visible = style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
                console.log(\`  Original badges: \${visible ? '👁️  VISIBLE' : '🚫 hidden'} (\${origBadges.id})\`);
            }
            
            if (cloneBadges) {
                const style = window.getComputedStyle(cloneBadges);
                const visible = style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
                console.log(\`  Clone badges: \${visible ? '👁️  VISIBLE' : '🚫 hidden'} (\${cloneBadges.id})\`);
            }
            
            // Check for violations
            const origVisible = origCDiv && window.getComputedStyle(origCDiv).display !== 'none' && 
                               window.getComputedStyle(origCDiv).visibility !== 'hidden' && 
                               window.getComputedStyle(origCDiv).opacity !== '0';
            const cloneVisible = cloneCDiv && window.getComputedStyle(cloneCDiv).display !== 'none' && 
                                window.getComputedStyle(cloneCDiv).visibility !== 'hidden' && 
                                window.getComputedStyle(cloneCDiv).opacity !== '0';
            const origBadgesVisible = origBadges && window.getComputedStyle(origBadges).display !== 'none' && 
                                     window.getComputedStyle(origBadges).visibility !== 'hidden' && 
                                     window.getComputedStyle(origBadges).opacity !== '0';
                                     
            if (origVisible && cloneVisible) {
                console.error(\`  🚨 VIOLATION: Both original and clone cDiv visible!\`);
            }
            
            if (origBadgesVisible) {
                console.error(\`  🚨 VIOLATION: Original badges visible!\`);
            }
        }
    }
}

// Make functions available
window.forceValidationTest = forceValidationTest;
window.checkSelectors = checkSelectors;

console.log('\\n🛠️  Functions available:');
console.log('  forceValidationTest() - Test validation on all jobs');
console.log('  checkSelectors() - Manual check for violations');

// Run both automatically
forceValidationTest();
checkSelectors();
`;

console.log('🔬 Force Validation Test Script');
console.log('Copy and paste this into the browser console:');
console.log('=====================================');
console.log(forceTest);
console.log('=====================================');