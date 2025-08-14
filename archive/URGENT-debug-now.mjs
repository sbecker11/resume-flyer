// URGENT: Immediate debug script to run in console RIGHT NOW

const urgentDebug = `
console.log('🚨🚨🚨 URGENT DEBUG: Analyzing current state with duplicate badges visible...');

// 1. Check if validation system even exists
console.log('\\n1. VALIDATION SYSTEM CHECK:');
if (!window.selectionManager) {
    console.error('❌ CRITICAL FAILURE: window.selectionManager does not exist!');
    console.error('This means the validation system was never loaded!');
} else {
    console.log('✅ selectionManager exists');
    console.log('✅ Current selection:', window.selectionManager.getSelectedJobNumber());
    
    // Check validation methods
    const methods = ['validateCloneVisibility', 'validateBadgeDuplication', 'validatePageLoadState'];
    methods.forEach(method => {
        if (typeof window.selectionManager[method] === 'function') {
            console.log(\`✅ \${method} exists\`);
        } else {
            console.error(\`❌ MISSING: \${method} method not found!\`);
        }
    });
}

// 2. IMMEDIATE ANALYSIS: What duplicate badges are currently visible?
console.log('\\n2. DUPLICATE BADGE ANALYSIS:');
const badgeElements = document.querySelectorAll('[id*="biz-card-badges-div"]');
console.log(\`Found \${badgeElements.length} badge containers\`);

const visibleBadges = [];
badgeElements.forEach(badge => {
    const style = window.getComputedStyle(badge);
    const visible = style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    
    if (visible) {
        visibleBadges.push({
            id: badge.id,
            isClone: badge.id.includes('-clone'),
            jobNumber: badge.id.match(/biz-card-badges-div-(\\d+)/)?.[1]
        });
        console.log(\`👁️  VISIBLE: \${badge.id}\`);
    } else {
        console.log(\`🚫 hidden: \${badge.id} (display: \${style.display})\`);
    }
});

// Find duplicate badge sets
const jobBadges = {};
visibleBadges.forEach(badge => {
    if (!jobBadges[badge.jobNumber]) {
        jobBadges[badge.jobNumber] = { original: false, clone: false };
    }
    
    if (badge.isClone) {
        jobBadges[badge.jobNumber].clone = true;
    } else {
        jobBadges[badge.jobNumber].original = true;
    }
});

console.log('\\n📊 BADGE DUPLICATION ANALYSIS:');
Object.keys(jobBadges).forEach(jobNum => {
    const badges = jobBadges[jobNum];
    if (badges.original && badges.clone) {
        console.error(\`🚨 DUPLICATE BADGES DETECTED: Job \${jobNum} has BOTH original and clone badges visible!\`);
    } else if (badges.original) {
        console.log(\`⚠️  Job \${jobNum}: Only original badges visible\`);
    } else if (badges.clone) {
        console.log(\`✅ Job \${jobNum}: Only clone badges visible (correct)\`);
    }
});

// 3. MANUAL VALIDATION TEST: Run validation on jobs with visible duplicates
console.log('\\n3. MANUAL VALIDATION TEST:');
const duplicateJobs = Object.keys(jobBadges).filter(jobNum => 
    jobBadges[jobNum].original && jobBadges[jobNum].clone
);

if (duplicateJobs.length > 0) {
    console.log(\`Testing validation on \${duplicateJobs.length} jobs with duplicate badges...\`);
    
    duplicateJobs.forEach(jobNum => {
        console.log(\`\\nTesting job \${jobNum}:\`);
        
        if (window.selectionManager) {
            try {
                console.log('  Testing validateBadgeDuplication...');
                window.selectionManager.validateBadgeDuplication(parseInt(jobNum));
                console.error(\`  ❌ VALIDATION FAILED: No error thrown for duplicate badges on job \${jobNum}!\`);
            } catch (error) {
                console.log(\`  ✅ VALIDATION WORKED: Error caught - \${error.message}\`);
            }
            
            try {
                console.log('  Testing validateCloneVisibility...');
                window.selectionManager.validateCloneVisibility(parseInt(jobNum));
                console.log(\`  ✅ Clone validation passed (or no clones exist)\`);
            } catch (error) {
                console.log(\`  🎯 Clone validation error: \${error.message}\`);
            }
        }
    });
} else {
    console.log('No duplicate badge jobs found to test');
}

// 4. CHECK CONSOLE HISTORY: Look for validation logs
console.log('\\n4. VALIDATION LOG CHECK:');
console.log('Look in console history for these patterns:');
console.log('  - "🔍 [timing] Validating page load state for hard-refresh violations..."');
console.log('  - "✅ [timing] Page load state validation passed"');
console.log('  - "🚨 [timing] HARD-REFRESH VIOLATION DETECTED:"');

// 5. SELECTOR TEST: Verify what our validation selectors actually find
console.log('\\n5. SELECTOR VERIFICATION:');
duplicateJobs.forEach(jobNum => {
    console.log(\`\\nJob \${jobNum} selector test:\`);
    
    const origBadgeSelector = \`#biz-card-badges-div-\${jobNum}\`;
    const origBadge = document.querySelector(origBadgeSelector);
    console.log(\`  Original badge selector "\${origBadgeSelector}": \${origBadge ? 'FOUND' : 'NOT FOUND'}\`);
    
    if (origBadge) {
        const style = window.getComputedStyle(origBadge);
        const visible = style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
        console.log(\`    Visible: \${visible}, Display: \${style.display}, Visibility: \${style.visibility}, Opacity: \${style.opacity}\`);
        
        if (visible) {
            console.error(\`    🚨 THIS SHOULD TRIGGER validateBadgeDuplication ERROR!\`);
        }
    }
});

console.log('\\n🚨 URGENT DEBUG COMPLETE');
console.log('If duplicate badges are visible but validation shows no errors,');
console.log('then there is a fundamental issue with the validation system!');
`;

console.log('🚨🚨🚨 URGENT DEBUG SCRIPT - RUN THIS NOW 🚨🚨🚨');
console.log('Copy and paste into browser console while duplicate badges are visible:');
console.log('=====================================');
console.log(urgentDebug);
console.log('=====================================');