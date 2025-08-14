// IMMEDIATE test - run this in browser console RIGHT NOW

console.log('🚨 IMMEDIATE VALIDATION TEST');

// Test 1: Does selectionManager exist?
if (!window.selectionManager) {
    console.error('❌ CRITICAL: selectionManager not found!');
} else {
    console.log('✅ selectionManager exists');
}

// Test 2: Find ALL visible badge containers
const allBadges = document.querySelectorAll('[id*="biz-card-badges-div"]');
console.log(`Found ${allBadges.length} badge containers total`);

const visible = [];
allBadges.forEach(badge => {
    const style = window.getComputedStyle(badge);
    const isVisible = style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    if (isVisible) {
        visible.push(badge.id);
        console.log(`👁️  VISIBLE: ${badge.id}`);
    }
});

console.log(`${visible.length} badge containers are currently VISIBLE`);

// Test 3: Check for duplicates
const jobs = {};
visible.forEach(id => {
    const match = id.match(/biz-card-badges-div-(\d+)(-clone)?/);
    if (match) {
        const jobNum = match[1];
        const isClone = !!match[2];
        
        if (!jobs[jobNum]) jobs[jobNum] = { original: false, clone: false };
        
        if (isClone) {
            jobs[jobNum].clone = true;
        } else {
            jobs[jobNum].original = true;
        }
    }
});

console.log('\n📊 DUPLICATE DETECTION:');
Object.keys(jobs).forEach(jobNum => {
    const job = jobs[jobNum];
    if (job.original && job.clone) {
        console.error(`🚨 JOB ${jobNum}: DUPLICATE BADGES (both original and clone visible)`);
        
        // Test validation on this job
        if (window.selectionManager && window.selectionManager.validateBadgeDuplication) {
            try {
                console.log(`Testing validateBadgeDuplication(${jobNum})...`);
                window.selectionManager.validateBadgeDuplication(parseInt(jobNum));
                console.error(`❌ VALIDATION FAILED: No error thrown!`);
            } catch (e) {
                console.log(`✅ Validation worked: ${e.message}`);
            }
        }
    }
});

// Test 4: Check cDivs
console.log('\n🔍 CDIV CHECK:');
for (let i = 0; i < 5; i++) {
    const orig = document.querySelector(`div.biz-card-div[data-job-number="${i}"]:not(.clone)`);
    const clone = document.querySelector(`div.biz-card-div[data-job-number="${i}"].clone`);
    
    if (orig || clone) {
        console.log(`Job ${i}:`);
        
        if (orig) {
            const style = window.getComputedStyle(orig);
            const visible = style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
            console.log(`  Original: ${visible ? 'VISIBLE' : 'hidden'} (${orig.id})`);
        }
        
        if (clone) {
            const style = window.getComputedStyle(clone);
            const visible = style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
            console.log(`  Clone: ${visible ? 'VISIBLE' : 'hidden'} (${clone.id})`);
        }
        
        // Test if both visible
        if (orig && clone) {
            const origVisible = window.getComputedStyle(orig).display !== 'none';
            const cloneVisible = window.getComputedStyle(clone).display !== 'none';
            
            if (origVisible && cloneVisible) {
                console.error(`🚨 JOB ${i}: BOTH CDIVS VISIBLE!`);
                
                // Test validation
                if (window.selectionManager && window.selectionManager.validateCloneVisibility) {
                    try {
                        console.log(`Testing validateCloneVisibility(${i})...`);
                        window.selectionManager.validateCloneVisibility(i);
                        console.error(`❌ VALIDATION FAILED: No error thrown!`);
                    } catch (e) {
                        console.log(`✅ Validation worked: ${e.message}`);
                    }
                }
            }
        }
    }
}

console.log('\n🚨 IMMEDIATE TEST COMPLETE');