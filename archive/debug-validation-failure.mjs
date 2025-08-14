// Comprehensive debugging script to understand why validation isn't triggering

const debugValidation = `
console.log('🚨 COMPREHENSIVE VALIDATION DEBUG...');

// 1. First, check if selectionManager even exists and has the validation methods
console.log('\\n1. SelectionManager Validation:');
if (!window.selectionManager) {
    console.error('❌ CRITICAL: window.selectionManager does not exist!');
    console.log('This means the validation cannot run at all.');
} else {
    console.log('✅ selectionManager exists');
    
    // Check if validation methods exist
    const methods = ['validateCloneVisibility', 'validateBadgeDuplication', 'selectJobNumber'];
    methods.forEach(method => {
        if (typeof window.selectionManager[method] === 'function') {
            console.log(\`✅ \${method} method exists\`);
        } else {
            console.error(\`❌ CRITICAL: \${method} method missing!\`);
        }
    });
    
    // Check current selection
    console.log(\`Current selected job: \${window.selectionManager.getSelectedJobNumber()}\`);
}

// 2. Check current DOM state in detail
console.log('\\n2. Detailed DOM Analysis:');
const allElements = document.querySelectorAll('[data-job-number]');
console.log(\`Found \${allElements.length} elements with data-job-number\`);

// Group by job number and analyze
const jobAnalysis = {};
allElements.forEach(el => {
    const jobNum = el.getAttribute('data-job-number');
    if (!jobAnalysis[jobNum]) jobAnalysis[jobNum] = { elements: [], cdivs: [], badges: [] };
    
    jobAnalysis[jobNum].elements.push(el);
    
    if (el.classList.contains('biz-card-div')) {
        jobAnalysis[jobNum].cdivs.push(el);
    }
    
    if (el.id && el.id.includes('biz-card-badges-div')) {
        jobAnalysis[jobNum].badges.push(el);
    }
});

// Analyze each job
Object.keys(jobAnalysis).forEach(jobNum => {
    const analysis = jobAnalysis[jobNum];
    console.log(\`\\nJob \${jobNum}:\`);
    console.log(\`  Total elements: \${analysis.elements.length}\`);
    console.log(\`  cDivs: \${analysis.cdivs.length}\`);
    console.log(\`  Badge containers: \${analysis.badges.length}\`);
    
    // Detailed cDiv analysis
    analysis.cdivs.forEach((cdiv, i) => {
        const style = window.getComputedStyle(cdiv);
        const visible = style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
        const hasCloneClass = cdiv.classList.contains('clone');
        const hasSelectedClass = cdiv.classList.contains('selected');
        
        console.log(\`    cDiv[\${i}]: \${cdiv.id}\`);
        console.log(\`      Classes: \${cdiv.className}\`);
        console.log(\`      Has .clone: \${hasCloneClass}\`);
        console.log(\`      Has .selected: \${hasSelectedClass}\`);
        console.log(\`      Visible: \${visible} (display:\${style.display}, vis:\${style.visibility}, opacity:\${style.opacity})\`);
    });
    
    // Detailed badge analysis
    analysis.badges.forEach((badge, i) => {
        const style = window.getComputedStyle(badge);
        const visible = style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
        const isCloneBadge = badge.id.includes('-clone');
        
        console.log(\`    Badge[\${i}]: \${badge.id}\`);
        console.log(\`      Is clone badge: \${isCloneBadge}\`);
        console.log(\`      Visible: \${visible} (display:\${style.display})\`);
    });
});

// 3. Test the validation selectors manually
console.log('\\n3. Testing Validation Selectors:');
const testJob = 0;

console.log(\`\\nTesting selectors for job \${testJob}:\`);

// Test original cDiv selector
const origSelector = \`div.biz-card-div[data-job-number="\${testJob}"]:not(.clone)\`;
const origResult = document.querySelector(origSelector);
console.log(\`Original selector: "\${origSelector}"\`);
console.log(\`  Result: \${origResult ? 'FOUND' : 'NOT FOUND'}\`);
if (origResult) {
    const style = window.getComputedStyle(origResult);
    const visible = style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    console.log(\`  Element: \${origResult.id}, Classes: \${origResult.className}\`);
    console.log(\`  Visible: \${visible} (display:\${style.display}, vis:\${style.visibility}, opacity:\${style.opacity})\`);
}

// Test clone cDiv selector
const cloneSelector = \`div.biz-card-div[data-job-number="\${testJob}"].clone\`;
const cloneResult = document.querySelector(cloneSelector);
console.log(\`Clone selector: "\${cloneSelector}"\`);
console.log(\`  Result: \${cloneResult ? 'FOUND' : 'NOT FOUND'}\`);
if (cloneResult) {
    const style = window.getComputedStyle(cloneResult);
    const visible = style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    console.log(\`  Element: \${cloneResult.id}, Classes: \${cloneResult.className}\`);
    console.log(\`  Visible: \${visible} (display:\${style.display}, vis:\${style.visibility}, opacity:\${style.opacity})\`);
}

// Test badge selectors
const origBadgeSelector = \`#biz-card-badges-div-\${testJob}\`;
const origBadgeResult = document.querySelector(origBadgeSelector);
console.log(\`Original badges: "\${origBadgeSelector}"\`);
console.log(\`  Result: \${origBadgeResult ? 'FOUND' : 'NOT FOUND'}\`);
if (origBadgeResult) {
    const style = window.getComputedStyle(origBadgeResult);
    const visible = style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    console.log(\`  Visible: \${visible} (display:\${style.display})\`);
}

const cloneBadgeSelector = \`#biz-card-badges-div-\${testJob}-clone\`;
const cloneBadgeResult = document.querySelector(cloneBadgeSelector);
console.log(\`Clone badges: "\${cloneBadgeSelector}"\`);
console.log(\`  Result: \${cloneBadgeResult ? 'FOUND' : 'NOT FOUND'}\`);
if (cloneBadgeResult) {
    const style = window.getComputedStyle(cloneBadgeResult);
    const visible = style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    console.log(\`  Visible: \${visible} (display:\${style.display})\`);
}

// 4. Manual validation test
console.log('\\n4. Manual Validation Test:');
if (window.selectionManager && typeof window.selectionManager.validateCloneVisibility === 'function') {
    try {
        console.log('Testing validateCloneVisibility manually...');
        window.selectionManager.validateCloneVisibility(testJob);
        console.log('✅ validateCloneVisibility completed without error');
    } catch (error) {
        console.log('🎯 validateCloneVisibility ERROR CAUGHT:');
        console.error(error.message);
    }
    
    try {
        console.log('Testing validateBadgeDuplication manually...');
        window.selectionManager.validateBadgeDuplication(testJob);
        console.log('✅ validateBadgeDuplication completed without error');
    } catch (error) {
        console.log('🎯 validateBadgeDuplication ERROR CAUGHT:');
        console.error(error.message);
    }
} else {
    console.error('❌ Cannot test validation - methods not available');
}

// 5. Check if selection triggers validation calls
console.log('\\n5. Testing Selection Process:');
if (window.selectionManager) {
    // Override validation methods temporarily to add logging
    const originalValidateClone = window.selectionManager.validateCloneVisibility;
    const originalValidateBadge = window.selectionManager.validateBadgeDuplication;
    
    window.selectionManager.validateCloneVisibility = function(jobNumber) {
        console.log(\`🔍 validateCloneVisibility called with job \${jobNumber}\`);
        return originalValidateClone.call(this, jobNumber);
    };
    
    window.selectionManager.validateBadgeDuplication = function(jobNumber) {
        console.log(\`🔍 validateBadgeDuplication called with job \${jobNumber}\`);
        return originalValidateBadge.call(this, jobNumber);
    };
    
    console.log('✅ Validation methods instrumented with logging');
    console.log('Now select a cDiv and watch for validation calls...');
    
    // Also override selectJobNumber to see if it runs
    const originalSelect = window.selectionManager.selectJobNumber;
    window.selectionManager.selectJobNumber = function(jobNumber, caller) {
        console.log(\`🎯 selectJobNumber called: job=\${jobNumber}, caller=\${caller}\`);
        return originalSelect.call(this, jobNumber, caller);
    };
    
    console.log('✅ selectJobNumber instrumented with logging');
} else {
    console.error('❌ Cannot instrument - selectionManager not available');
}

console.log('\\n🏁 Debug setup complete. Try selecting a cDiv now and watch the console...');
`;

console.log('🚨 Comprehensive Validation Debug Script');
console.log('Copy and paste this into the browser console:');
console.log('=====================================');
console.log(debugValidation);
console.log('=====================================');