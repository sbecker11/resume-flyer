// FORCE validation test - copy paste this now

console.log('🚨 FORCING VALIDATION NOW...');

// Force run validation on jobs 0-10
for (let job = 0; job <= 10; job++) {
    console.log(`\n--- FORCING VALIDATION ON JOB ${job} ---`);
    
    if (window.selectionManager) {
        try {
            window.selectionManager.validateCloneVisibility(job);
            console.log(`✓ Clone validation passed for job ${job}`);
        } catch (e) {
            console.error(`🚨 CLONE ERROR for job ${job}: ${e.message}`);
        }
        
        try {
            window.selectionManager.validateBadgeDuplication(job);
            console.log(`✓ Badge validation passed for job ${job}`);
        } catch (e) {
            console.error(`🚨 BADGE ERROR for job ${job}: ${e.message}`);
        }
    } else {
        console.error('❌ selectionManager not available');
        break;
    }
}

console.log('\n🚨 FORCED VALIDATION COMPLETE');