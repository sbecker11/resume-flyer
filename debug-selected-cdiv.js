// Debug selected cDiv positioning
setTimeout(() => {
    console.log('=== Selected cDiv Debug ===');
    
    // Check selection state
    const selectedCDiv = document.querySelector('.biz-card-div.selected');
    const job0Clone = document.querySelector('#biz-card-div-0-clone');
    
    console.log('Selected cDiv:', selectedCDiv?.id || 'none');
    console.log('Job #0 clone exists:', !!job0Clone);
    
    if (job0Clone) {
        console.log('Job #0 clone position:');
        console.log('- data-sceneTop:', job0Clone.getAttribute('data-sceneTop'));
        console.log('- style.top:', job0Clone.style.top);
        console.log('- computed top:', getComputedStyle(job0Clone).top);
        console.log('- getBoundingClientRect.top:', job0Clone.getBoundingClientRect().top);
    }
    
    // Check what getSelectedJobNumber returns
    if (typeof window.getSelectedJobNumber !== 'undefined') {
        console.log('getSelectedJobNumber():', window.getSelectedJobNumber());
    }
    
}, 1000);