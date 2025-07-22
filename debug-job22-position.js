// Debug Job #22 position - why is it at the top?
console.log('=== Debugging Job #22 Position ===');

setTimeout(() => {
    const job22 = document.querySelector('[data-job-number="22"]');
    if (!job22) {
        console.log('❌ Job #22 not found');
        return;
    }
    
    console.log('\n=== Job #22 Attributes ===');
    console.log('- data-sceneTop:', job22.getAttribute('data-sceneTop'));
    console.log('- data-sceneBottom:', job22.getAttribute('data-sceneBottom')); 
    console.log('- data-sceneHeight:', job22.getAttribute('data-sceneHeight'));
    console.log('- style.top:', job22.style.top);
    
    console.log('\n=== Job #22 Context ===');
    // Find job data
    if (typeof window.cardsController !== 'undefined' && window.cardsController.originalJobsData) {
        const job22Data = window.cardsController.originalJobsData[22];
        if (job22Data) {
            console.log('Job #22 Data:', {
                employer: job22Data.employer,
                start: job22Data.start,
                end: job22Data.end,
                jobNumber: job22Data.jobNumber
            });
        }
    }
    
    console.log('\n=== Timeline Analysis ===');
    // Check what date corresponds to Y=48
    if (typeof getY !== 'undefined' && typeof getDateForY !== 'undefined') {
        try {
            const dateAt48 = getDateForY(48);
            console.log('Date at Y=48px:', dateAt48);
        } catch (e) {
            console.log('getDateForY not available');
        }
    }
    
    console.log('\n=== Timeline Bounds Check ===');
    if (typeof useTimeline !== 'undefined') {
        const { timelineHeight } = useTimeline();
        console.log('Timeline height:', timelineHeight.value + 'px');
        console.log('Expected range: Y=0 (top) to Y=' + timelineHeight.value + 'px (bottom)');
        
        const sceneTop = parseFloat(job22.getAttribute('data-sceneTop') || '0');
        if (sceneTop < 100) {
            console.log('🚨 ISSUE: Job #22 is very close to timeline top!');
            console.log('   This suggests it has a very recent end date');
        }
    }
    
    console.log('\n=== Job Order Check ===');
    // Check if this is the most recent job
    const allJobs = document.querySelectorAll('[data-job-number]');
    const jobTops = Array.from(allJobs).map(job => ({
        jobNumber: job.getAttribute('data-job-number'),
        sceneTop: parseFloat(job.getAttribute('data-sceneTop') || '0'),
        employer: job.textContent?.split('\n')[0] || 'Unknown'
    })).sort((a, b) => a.sceneTop - b.sceneTop);
    
    console.log('Jobs by Y position (top to bottom):');
    jobTops.slice(0, 5).forEach((job, index) => {
        const marker = job.jobNumber === '22' ? '👈 JOB #22' : '';
        console.log(`${index + 1}. Job #${job.jobNumber} at Y=${job.sceneTop.toFixed(1)} (${job.employer}) ${marker}`);
    });
    
}, 2000);

console.log('⏳ Analyzing Job #22 position...');