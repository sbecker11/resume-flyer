// Debug script to check current DOM state and understand why validation isn't triggering

const debugScript = `
console.log('🔍 DEBUGGING CURRENT DOM STATE...');

// 1. Check if selectionManager exists and is accessible
console.log('\\n1. SelectionManager Status:');
if (window.selectionManager) {
    console.log('✅ selectionManager is available');
    console.log('Current selected job:', window.selectionManager.getSelectedJobNumber());
    
    // Check if validation methods exist
    if (typeof window.selectionManager.validateCloneVisibility === 'function') {
        console.log('✅ validateCloneVisibility method exists');
    } else {
        console.error('❌ validateCloneVisibility method missing!');
    }
    
    if (typeof window.selectionManager.validateBadgeDuplication === 'function') {
        console.log('✅ validateBadgeDuplication method exists');
    } else {
        console.error('❌ validateBadgeDuplication method missing!');
    }
} else {
    console.error('❌ selectionManager not available');
}

// 2. Check current DOM state for all jobs
console.log('\\n2. Current DOM State Analysis:');
const allCDivs = document.querySelectorAll('[data-job-number]');
console.log(\`Found \${allCDivs.length} elements with data-job-number\`);

const jobStates = {};

allCDivs.forEach((element) => {
    const jobNumber = element.getAttribute('data-job-number');
    const isClone = element.classList.contains('clone');
    const style = window.getComputedStyle(element);
    const visible = style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    
    if (!jobStates[jobNumber]) {
        jobStates[jobNumber] = { original: null, clone: null, badges: { original: null, clone: null } };
    }
    
    if (element.classList.contains('biz-card-div')) {
        if (isClone) {
            jobStates[jobNumber].clone = { element, visible, display: style.display, visibility: style.visibility, opacity: style.opacity };
        } else {
            jobStates[jobNumber].original = { element, visible, display: style.display, visibility: style.visibility, opacity: style.opacity };
        }
    }
});

// Check for badge containers
document.querySelectorAll('[id*="biz-card-badges-div"]').forEach((element) => {
    const match = element.id.match(/biz-card-badges-div-(\\d+)(-clone)?/);
    if (match) {
        const jobNumber = match[1];
        const isClone = !!match[2];
        const style = window.getComputedStyle(element);
        const visible = style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
        
        if (!jobStates[jobNumber]) {
            jobStates[jobNumber] = { original: null, clone: null, badges: { original: null, clone: null } };
        }
        
        if (isClone) {
            jobStates[jobNumber].badges.clone = { element, visible, display: style.display };
        } else {
            jobStates[jobNumber].badges.original = { element, visible, display: style.display };
        }
    }
});

// 3. Analyze each job for violations
console.log('\\n3. Violation Analysis:');
let violationsFound = 0;

Object.keys(jobStates).forEach((jobNumber) => {
    const state = jobStates[jobNumber];
    const originalVisible = state.original?.visible;
    const cloneVisible = state.clone?.visible;
    const originalBadgesVisible = state.badges.original?.visible;
    const cloneBadgesVisible = state.badges.clone?.visible;
    
    console.log(\`\\nJob \${jobNumber}:\`);
    console.log(\`  Original cDiv: \${originalVisible ? '👁️  VISIBLE' : '🚫 hidden'} (\${state.original?.display || 'not found'})\`);
    console.log(\`  Clone cDiv: \${cloneVisible ? '👁️  VISIBLE' : '🚫 hidden'} (\${state.clone?.display || 'not found'})\`);
    console.log(\`  Original badges: \${originalBadgesVisible ? '👁️  VISIBLE' : '🚫 hidden'} (\${state.badges.original?.display || 'not found'})\`);
    console.log(\`  Clone badges: \${cloneBadgesVisible ? '👁️  VISIBLE' : '🚫 hidden'} (\${state.badges.clone?.display || 'not found'})\`);
    
    // Check for violations
    if (originalVisible && cloneVisible) {
        console.error(\`  🚨 VIOLATION: Both original and clone cDiv are visible!\`);
        violationsFound++;
    }
    
    if (originalBadgesVisible) {
        console.error(\`  🚨 VIOLATION: Original badge container is visible!\`);
        violationsFound++;
    }
    
    if (originalBadgesVisible && cloneBadgesVisible) {
        console.error(\`  🚨 VIOLATION: Duplicate badge containers visible!\`);
        violationsFound++;
    }
});

console.log(\`\\n📊 Summary: Found \${violationsFound} violations\`);

// 4. If violations found, test why validation didn't trigger
if (violationsFound > 0) {
    console.log('\\n4. Testing why validation did not trigger...');
    
    // Find a job with violations
    const violatingJob = Object.keys(jobStates).find(jobNumber => {
        const state = jobStates[jobNumber];
        return (state.original?.visible && state.clone?.visible) || state.badges.original?.visible;
    });
    
    if (violatingJob && window.selectionManager) {
        console.log(\`Testing validation functions directly on job \${violatingJob}...\`);
        
        try {
            console.log('Testing validateCloneVisibility...');
            window.selectionManager.validateCloneVisibility(violatingJob);
            console.log('❌ validateCloneVisibility did NOT throw error');
        } catch (e) {
            console.log('✅ validateCloneVisibility correctly threw:', e.message);
        }
        
        try {
            console.log('Testing validateBadgeDuplication...');
            window.selectionManager.validateBadgeDuplication(violatingJob);
            console.log('❌ validateBadgeDuplication did NOT throw error');
        } catch (e) {
            console.log('✅ validateBadgeDuplication correctly threw:', e.message);
        }
    }
} else {
    console.log('\\n✅ No violations found in current DOM state');
}

// 5. Test the selectors used in validation
console.log('\\n5. Testing validation selectors...');
const testJob = 0;
const originalSelector = \`div.biz-card-div[data-job-number="\${testJob}"]:not(.clone)\`;
const cloneSelector = \`div.biz-card-div[data-job-number="\${testJob}"].clone\`;
const originalBadgeSelector = \`#biz-card-badges-div-\${testJob}\`;

console.log(\`Original cDiv selector: "\${originalSelector}"\`);
const originalFound = document.querySelector(originalSelector);
console.log(\`  Result: \${originalFound ? 'FOUND' : 'NOT FOUND'}\`);
if (originalFound) {
    console.log(\`  Element:`, originalFound);
}

console.log(\`Clone cDiv selector: "\${cloneSelector}"\`);
const cloneFound = document.querySelector(cloneSelector);
console.log(\`  Result: \${cloneFound ? 'FOUND' : 'NOT FOUND'}\`);
if (cloneFound) {
    console.log(\`  Element:`, cloneFound);
}

console.log(\`Original badge selector: "\${originalBadgeSelector}"\`);
const badgeFound = document.querySelector(originalBadgeSelector);
console.log(\`  Result: \${badgeFound ? 'FOUND' : 'NOT FOUND'}\`);
if (badgeFound) {
    console.log(\`  Element:`, badgeFound);
}

console.log('\\n🏁 Debug analysis complete');
`;

console.log('🔍 Current DOM State Debug Script Ready');
console.log('Copy and paste this into the browser console while both cDivs are visible:');
console.log('=====================================');
console.log(debugScript);
console.log('=====================================');