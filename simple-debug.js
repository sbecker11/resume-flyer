// Simple focused debug
setTimeout(() => {
    const job22 = document.querySelector('[data-job-number="22"]');
    const job0 = document.querySelector('[data-job-number="0"]');
    
    console.log('Job #0 (Adobe 2025):', job0?.getAttribute('data-sceneTop'));
    console.log('Job #22 (BYU-CS 1987):', job22?.getAttribute('data-sceneTop'));
    
    // Should be: Job #0 near top (~150), Job #22 near bottom (~7500)
    // If reversed, coordinate system is upside down
}, 1000);