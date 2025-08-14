#!/usr/bin/env node

// Manual test to simulate the error detection logic
// This tests the validation logic independently of the browser

// Mock DOM functions for testing
const mockDOM = {
    elements: new Map(),
    
    createElement(tag, id, classes = [], styles = {}) {
        const element = {
            id: id,
            tagName: tag.toUpperCase(),
            classList: {
                contains: (cls) => classes.includes(cls),
                add: (cls) => classes.push(cls),
                remove: (cls) => classes.splice(classes.indexOf(cls), 1)
            },
            style: { ...styles },
            _computedStyle: { 
                display: styles.display || 'block',
                visibility: styles.visibility || 'visible',
                opacity: styles.opacity || '1'
            },
            querySelector: (selector) => {
                // Simple mock implementation
                return null;
            },
            querySelectorAll: (selector) => {
                return [];
            }
        };
        this.elements.set(id, element);
        return element;
    },
    
    querySelector(selector) {
        // Parse basic selectors
        if (selector.includes('#')) {
            const id = selector.split('#')[1].split('[')[0];
            return this.elements.get(id) || null;
        }
        
        // Handle more complex selectors for testing
        if (selector.includes('data-job-number')) {
            const jobMatch = selector.match(/data-job-number="(\d+)"/);
            const notClone = selector.includes(':not(.clone)');
            const isClone = selector.includes('.clone') && !notClone;
            
            if (jobMatch) {
                const jobNumber = jobMatch[1];
                const originalId = `biz-card-div-${jobNumber}`;
                const cloneId = `${originalId}-clone`;
                
                console.log(`   Mock selector: "${selector}" -> looking for job ${jobNumber}, isClone: ${isClone}, notClone: ${notClone}`);
                console.log(`   Available elements:`, Array.from(this.elements.keys()));
                
                if (isClone) {
                    const result = this.elements.get(cloneId) || null;
                    console.log(`   Returning clone: ${result ? cloneId : 'null'}`);
                    return result;
                } else if (notClone) {
                    const result = this.elements.get(originalId) || null;
                    console.log(`   Returning original: ${result ? originalId : 'null'}`);
                    return result;
                } else {
                    const result = this.elements.get(originalId) || this.elements.get(cloneId) || null;
                    console.log(`   Returning any: ${result ? result.id : 'null'}`);
                    return result;
                }
            }
        }
        
        return null;
    }
};

// Mock window object
const mockWindow = {
    getComputedStyle: (element) => {
        return element._computedStyle || {
            display: 'block',
            visibility: 'visible',
            opacity: '1'
        };
    }
};

// Test scenarios
function runTestScenarios() {
    console.log('🧪 Running manual error detection tests...\n');
    
    // Scenario 1: Normal state - original visible, no clone
    console.log('📝 Scenario 1: Normal state (original visible, no clone)');
    mockDOM.elements.clear();
    const original1 = mockDOM.createElement('div', 'biz-card-div-0', [], { display: 'block' });
    const result1 = testValidation(0, mockDOM, mockWindow);
    console.log(`   Result: ${result1 ? '❌ Error thrown' : '✅ No error'}\n`);
    
    // Scenario 2: Selection state - clone visible, original hidden
    console.log('📝 Scenario 2: Selection state (clone visible, original hidden)');
    mockDOM.elements.clear();
    const original2 = mockDOM.createElement('div', 'biz-card-div-0', [], { display: 'none' });
    original2._computedStyle = { display: 'none', visibility: 'visible', opacity: '1' };
    const clone2 = mockDOM.createElement('div', 'biz-card-div-0-clone', ['clone'], { display: 'block' });
    clone2._computedStyle = { display: 'block', visibility: 'visible', opacity: '1' };
    const result2 = testValidation(0, mockDOM, mockWindow);
    console.log(`   Result: ${result2 ? '❌ Error thrown' : '✅ No error'}\n`);
    
    // Scenario 3: ERROR CASE - both visible (the bug we want to catch!)
    console.log('📝 Scenario 3: ERROR CASE (both original and clone visible)');
    mockDOM.elements.clear();
    const original3 = mockDOM.createElement('div', 'biz-card-div-0', [], { display: 'block' });
    original3._computedStyle = { display: 'block', visibility: 'visible', opacity: '1' };
    const clone3 = mockDOM.createElement('div', 'biz-card-div-0-clone', ['clone'], { display: 'block' });
    clone3._computedStyle = { display: 'block', visibility: 'visible', opacity: '1' };
    const result3 = testValidation(0, mockDOM, mockWindow);
    console.log(`   Result: ${result3 ? '✅ Error correctly thrown' : '❌ ERROR: Should have thrown!'}\n`);
    
    // Scenario 4: Badge duplication test - original badges visible
    console.log('📝 Scenario 4: Badge duplication (original badge container visible)');
    mockDOM.elements.clear();
    const originalBadges = mockDOM.createElement('div', 'biz-card-badges-div-0', [], { display: 'block' });
    const result4 = testBadgeValidation(0, mockDOM, mockWindow);
    console.log(`   Result: ${result4 ? '✅ Error correctly thrown' : '❌ ERROR: Should have thrown!'}\n`);
    
    // Scenario 5: Correct badge state - only clone badges visible
    console.log('📝 Scenario 5: Correct badge state (only clone badges visible)');
    mockDOM.elements.clear();
    const originalBadges5 = mockDOM.createElement('div', 'biz-card-badges-div-0', [], { display: 'none' });
    const cloneBadges5 = mockDOM.createElement('div', 'biz-card-badges-div-0-clone', [], { display: 'block' });
    const result5 = testBadgeValidation(0, mockDOM, mockWindow);
    console.log(`   Result: ${result5 ? '❌ Error thrown' : '✅ No error'}\n`);
}

// Copy the validation logic from selectionManager.mjs for testing
function testValidation(jobNumber, dom, window) {
    try {
        validateCloneVisibility(jobNumber, dom, window);
        return false; // No error thrown
    } catch (error) {
        console.log(`     Error: ${error.message}`);
        return true; // Error thrown
    }
}

function testBadgeValidation(jobNumber, dom, window) {
    try {
        validateBadgeDuplication(jobNumber, dom, window);
        return false; // No error thrown
    } catch (error) {
        console.log(`     Error: ${error.message}`);
        return true; // Error thrown
    }
}

function validateCloneVisibility(jobNumber, dom, window) {
    if (!jobNumber && jobNumber !== 0) return;

    // Find original cDiv
    const originalCDiv = dom.querySelector(`div.biz-card-div[data-job-number="${jobNumber}"]:not(.clone)`);
    const cloneCDiv = dom.querySelector(`div.biz-card-div[data-job-number="${jobNumber}"].clone`);
    
    if (!originalCDiv || !cloneCDiv) return; // No clone exists - normal state

    // Check computed visibility of both elements
    const originalStyle = window.getComputedStyle(originalCDiv);
    const cloneStyle = window.getComputedStyle(cloneCDiv);
    
    const originalVisible = originalStyle.display !== 'none' && 
                           originalStyle.visibility !== 'hidden' && 
                           originalStyle.opacity !== '0';
                           
    const cloneVisible = cloneStyle.display !== 'none' && 
                        cloneStyle.visibility !== 'hidden' && 
                        cloneStyle.opacity !== '0';

    if (originalVisible && cloneVisible) {
        throw new Error(`CRITICAL VISIBILITY ERROR: Both original and clone cDiv are visible for Job ${jobNumber}!`);
    }
}

function validateBadgeDuplication(jobNumber, dom, window) {
    if (!jobNumber && jobNumber !== 0) return;

    const originalBadgeContainer = dom.querySelector(`#biz-card-badges-div-${jobNumber}`);
    
    if (originalBadgeContainer) {
        // Check if original badge container exists and is visible
        const originalStyle = window.getComputedStyle(originalBadgeContainer);
        const originalVisible = originalStyle.display !== 'none' && 
                               originalStyle.visibility !== 'hidden' && 
                               originalStyle.opacity !== '0';

        if (originalVisible) {
            throw new Error(`DUPLICATE BADGE SETS DETECTED: Original badge container visible for Job ${jobNumber}!`);
        }
    }
}

// Run the tests
runTestScenarios();

console.log('🎯 Summary:');
console.log('   The validation logic should throw errors in scenarios 3 and 4');
console.log('   This confirms the error detection is working correctly');
console.log('   If the real application shows duplicate badges but no errors,');
console.log('   it suggests the validation is not being triggered properly.');