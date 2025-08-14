// FIXED RECORDER - Copy this entire script into browser console
// Guaranteed to work without any reference errors

console.clear();
console.log('🔧 FIXED RECORDER - Loading with error prevention...\n');

// Immediately check if we can access basic elements
try {
    const resumeDivCount = document.querySelectorAll('.biz-resume-div').length;
    const cardDivCount = document.querySelectorAll('.biz-card-div').length;
    
    console.log('🔍 SYSTEM CHECK:');
    console.log(`   📝 Resume Divs: ${resumeDivCount}`);
    console.log(`   🗃️ Card Divs: ${cardDivCount}`);
    console.log(`   🎯 Selection Manager: ${!!window.selectionManager}`);
    console.log(`   📦 Scene Container: ${!!document.getElementById('scene-container')}`);
    
    if (resumeDivCount === 0) {
        console.log('⚠️ No resume divs found - app may still be loading');
    }
} catch (error) {
    console.log('⚠️ Basic element check failed:', error.message);
}

// Global state object to avoid reference errors
window.fixedRecorderState = {
    isRecording: false,
    startTime: null,
    sessionData: null,
    eventCount: 0
};

// Safe function to get status
window.getFixedRecorderStatus = function() {
    const state = window.fixedRecorderState;
    return {
        isRecording: state.isRecording,
        sessionId: state.sessionData?.sessionId || 'none',
        startTime: state.startTime,
        duration: state.startTime ? Date.now() - state.startTime : 0,
        eventsRecorded: state.eventCount,
        status: state.isRecording ? 'RECORDING' : 'READY'
    };
};

// Test the status function immediately
try {
    const status = window.getFixedRecorderStatus();
    console.log('✅ Status function working:', status.status);
} catch (error) {
    console.log('❌ Status function error:', error.message);
}

// Start recording function
function startFixedRecording(jobNumber, clickEvent) {
    const state = window.fixedRecorderState;
    state.isRecording = true;
    state.startTime = Date.now();
    state.eventCount = 0;
    
    state.sessionData = {
        sessionId: `fixed-${Date.now()}`,
        startTime: new Date().toISOString(),
        jobNumber: jobNumber,
        clickCoords: { x: clickEvent.clientX, y: clickEvent.clientY },
        events: [],
        apiCalls: [],
        scrollEvents: []
    };
    
    console.log(`\n🎬 RECORDING STARTED - Job ${jobNumber}`);
    console.log(`📍 Click at: (${clickEvent.clientX}, ${clickEvent.clientY})`);
    console.log('⏹️ Press ESC to stop recording\n');
    
    // Simple API monitoring
    monitorAPICalls();
    
    // Simple scroll monitoring
    monitorScrolling();
    
    // Auto-stop after 10 seconds
    setTimeout(() => {
        if (state.isRecording) {
            console.log('⏰ Auto-stopping recording after 10 seconds...');
            stopFixedRecording();
        }
    }, 10000);
}

function monitorAPICalls() {
    if (!window.selectionManager || typeof window.selectionManager.selectJobNumber !== 'function') {
        console.log('⚠️ selectionManager.selectJobNumber not available for monitoring');
        return;
    }
    
    try {
        const originalSelect = window.selectionManager.selectJobNumber.bind(window.selectionManager);
        
        window.selectionManager.selectJobNumber = function(jobNumber, source) {
            const state = window.fixedRecorderState;
            if (state.isRecording) {
                console.log(`📞 API CAPTURED: selectJobNumber(${jobNumber}, "${source}")`);
                state.sessionData.apiCalls.push({
                    function: 'selectJobNumber',
                    jobNumber: jobNumber,
                    source: source,
                    timestamp: Date.now()
                });
                state.eventCount++;
            }
            return originalSelect(jobNumber, source);
        };
        
        console.log('✅ API monitoring active');
    } catch (error) {
        console.log('⚠️ Failed to wrap API functions:', error.message);
    }
}

function monitorScrolling() {
    const sceneContainer = document.getElementById('scene-container');
    if (!sceneContainer) {
        console.log('⚠️ Scene container not found for scroll monitoring');
        return;
    }
    
    const initialScrollTop = sceneContainer.scrollTop;
    
    const checkScroll = () => {
        const state = window.fixedRecorderState;
        if (!state.isRecording) return;
        
        try {
            const currentScrollTop = sceneContainer.scrollTop;
            const delta = Math.abs(currentScrollTop - initialScrollTop);
            
            if (delta > 10) {
                console.log(`📜 SCROLL DETECTED: Scene container scrolled ${delta}px`);
                state.sessionData.scrollEvents.push({
                    container: 'scene-container',
                    scrollDelta: delta,
                    timestamp: Date.now()
                });
                state.eventCount++;
            }
            
            setTimeout(checkScroll, 300);
        } catch (error) {
            console.log('⚠️ Scroll monitoring error:', error.message);
        }
    };
    
    setTimeout(checkScroll, 100);
    console.log('✅ Scroll monitoring active');
}

function stopFixedRecording() {
    const state = window.fixedRecorderState;
    if (!state.isRecording) {
        console.log('⚠️ No recording in progress');
        return;
    }
    
    state.isRecording = false;
    const duration = Date.now() - state.startTime;
    
    console.log(`\n⏹️ RECORDING STOPPED`);
    console.log(`⏱️ Duration: ${Math.round(duration / 1000 * 100) / 100} seconds`);
    console.log(`📊 Events captured: ${state.eventCount}`);
    
    // Simple analysis
    analyzeRecording();
    
    // Try to send to server
    sendToServer();
}

function analyzeRecording() {
    const state = window.fixedRecorderState;
    const data = state.sessionData;
    
    console.log('\n🔬 ANALYZING RECORDING...');
    
    // Check API calls
    const hasSelectCall = data.apiCalls.some(call => 
        call.function === 'selectJobNumber' && call.jobNumber === data.jobNumber
    );
    
    // Check source parameter
    const hasCorrectSource = data.apiCalls.some(call =>
        call.source && call.source.includes('ResumeListController')
    );
    
    // Check scrolling
    const hasScroll = data.scrollEvents.length > 0;
    
    console.log('📊 ANALYSIS RESULTS:');
    console.log(`   ✓ API Call: ${hasSelectCall ? '✅' : '❌'} selectJobNumber(${data.jobNumber})`);
    console.log(`   ✓ Source: ${hasCorrectSource ? '✅' : '❌'} ResumeListController source`);
    console.log(`   ✓ Scrolling: ${hasScroll ? '✅' : '❌'} Scene container scrolled`);
    
    const passedTests = [hasSelectCall, hasCorrectSource, hasScroll].filter(Boolean).length;
    const totalTests = 3;
    const percentage = Math.round((passedTests / totalTests) * 100);
    
    console.log(`\n🎯 OVERALL: ${passedTests}/${totalTests} tests passed (${percentage}%)`);
    
    if (percentage >= 67) {
        console.log('🎉 BIDIRECTIONAL SYNC APPEARS TO BE WORKING!');
    } else {
        console.log('❌ BIDIRECTIONAL SYNC HAS ISSUES');
    }
}

async function sendToServer() {
    const state = window.fixedRecorderState;
    
    try {
        console.log('\n📤 Attempting to send data to server...');
        
        const response = await fetch('/api/event-data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(state.sessionData)
        });
        
        if (response.ok) {
            const result = await response.json();
            console.log('✅ Data sent successfully to server!');
            console.log(`📊 Server analysis available at: http://localhost:3009/analysis-dashboard`);
        } else {
            console.log('⚠️ Server response error:', response.status);
        }
    } catch (error) {
        console.log('⚠️ Could not connect to server:', error.message);
        console.log('💾 Local analysis completed above');
    }
}

// Set up event listeners with error handling
try {
    // Click listener for rDiv
    document.addEventListener('click', function(event) {
        try {
            const resumeDiv = event.target.closest('.biz-resume-div');
            if (resumeDiv && !window.fixedRecorderState.isRecording) {
                const jobNumber = parseInt(resumeDiv.getAttribute('data-job-number'));
                if (!isNaN(jobNumber)) {
                    startFixedRecording(jobNumber, event);
                } else {
                    console.log('⚠️ Could not determine job number from resume div');
                }
            }
        } catch (error) {
            console.log('⚠️ Click handler error:', error.message);
        }
    }, true);
    
    // ESC key listener
    document.addEventListener('keydown', function(event) {
        try {
            if (event.key === 'Escape' && window.fixedRecorderState.isRecording) {
                event.preventDefault();
                stopFixedRecording();
            }
        } catch (error) {
            console.log('⚠️ Keydown handler error:', error.message);
        }
    }, true);
    
    console.log('\n✅ FIXED RECORDER READY!');
    console.log('🎯 Click any rDiv to start recording');
    console.log('⏹️ Press ESC to stop recording and see analysis');
    console.log('\n🎮 Available functions:');
    console.log('   getFixedRecorderStatus() - Check recording status');
    
    // Test the function one more time
    const testStatus = window.getFixedRecorderStatus();
    console.log(`📊 Current status: ${testStatus.status}`);
    
} catch (error) {
    console.log('❌ Failed to set up event listeners:', error.message);
    console.log('🔧 Try refreshing the page and loading the recorder again');
}

console.log('\n🔧 FIXED RECORDER LOADED - No more reference errors!');