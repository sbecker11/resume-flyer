// Debug script to test color palette updates for clones and badges
// This can be run in the browser console to verify palette application

function testCloneAndBadgePaletteUpdate(jobNumber = 0) {
    console.log(`🎨 Testing color palette update for job ${jobNumber} clone and badges`);
    
    // Find original card
    const originalCardId = `biz-card-div-${jobNumber}`;
    const originalCard = document.getElementById(originalCardId);
    
    if (!originalCard) {
        console.error(`❌ Original card not found: ${originalCardId}`);
        return false;
    }
    
    // Find clone
    const cloneId = `${originalCardId}-clone`;
    const clone = document.getElementById(cloneId);
    
    if (!clone) {
        console.warn(`⚠️ Clone not found: ${cloneId}`);
    } else {
        console.log(`✅ Found clone: ${clone.id}`);
        console.log(`   Has data-color-index: ${clone.hasAttribute('data-color-index')}`);
        console.log(`   Color index value: ${clone.getAttribute('data-color-index')}`);
        console.log(`   Background color: ${window.getComputedStyle(clone).backgroundColor}`);
        console.log(`   Clone classes: ${clone.className}`);
    }
    
    // Find badge container
    const badgeContainerId = `biz-card-badges-div-${jobNumber}`;
    const badgeContainer = document.getElementById(badgeContainerId);
    
    if (!badgeContainer) {
        console.warn(`⚠️ Badge container not found: ${badgeContainerId}`);
    } else {
        const badges = badgeContainer.querySelectorAll('.skill-badge');
        console.log(`✅ Found badge container with ${badges.length} badges`);
        
        badges.forEach((badge, index) => {
            console.log(`   Badge ${index}:`);
            console.log(`     Has data-color-index: ${badge.hasAttribute('data-color-index')}`);
            console.log(`     Color index value: ${badge.getAttribute('data-color-index')}`);
            console.log(`     Background color: ${window.getComputedStyle(badge).backgroundColor}`);
            console.log(`     Text: "${badge.textContent}"`);
        });
    }
    
    return {
        originalCard: !!originalCard,
        clone: !!clone,
        badges: badgeContainer ? badgeContainer.querySelectorAll('.skill-badge').length : 0
    };
}

function testElementRegistryFindsClones() {
    console.log(`🔍 Testing if element registry finds clones and badges`);
    
    // Test if global element registry can find clones
    if (window.globalElementRegistry) {
        const allCDivs = window.globalElementRegistry.getAllBizCardDivs();
        const clones = allCDivs.filter(cDiv => cDiv.id.includes('-clone'));
        
        console.log(`📊 Element registry results:`);
        console.log(`   Total cDivs found: ${allCDivs.length}`);
        console.log(`   Clones found: ${clones.length}`);
        if (clones.length > 0) {
            console.log(`   Clone IDs:`, clones.map(c => c.id));
        }
        
        const allBadges = window.globalElementRegistry.getAllSkillBadges();
        console.log(`   Total badges found: ${allBadges.length}`);
        
        return { totalCDivs: allCDivs.length, clones: clones.length, badges: allBadges.length };
    } else {
        console.error(`❌ Global element registry not found`);
        return null;
    }
}

function triggerPaletteUpdateAndTest(jobNumber = 0) {
    console.log(`🎯 Testing full palette update cycle for job ${jobNumber}`);
    
    // Get initial state
    const beforeState = testCloneAndBadgePaletteUpdate(jobNumber);
    
    // Trigger a palette change (if color palette selector is available)
    const paletteSelector = document.querySelector('select[id*="palette"], select[name*="palette"]');
    if (paletteSelector) {
        const currentIndex = paletteSelector.selectedIndex;
        const newIndex = (currentIndex + 1) % paletteSelector.options.length;
        
        console.log(`🔄 Changing palette from index ${currentIndex} to ${newIndex}`);
        paletteSelector.selectedIndex = newIndex;
        paletteSelector.dispatchEvent(new Event('change'));
        
        // Check state after a delay
        setTimeout(() => {
            console.log(`🔄 State after palette change:`);
            const afterState = testCloneAndBadgePaletteUpdate(jobNumber);
            
            if (afterState.clone) {
                console.log(`✅ Clone still exists after palette change`);
            }
            if (afterState.badges > 0) {
                console.log(`✅ ${afterState.badges} badges still exist after palette change`);
            }
        }, 500);
        
    } else {
        console.warn(`⚠️ No palette selector found - cannot trigger palette change`);
        console.log(`💡 Try using: window.setCurrentPalette(filename) if available`);
    }
}

function clearElementCacheAndRetest() {
    console.log(`🧹 Clearing element registry cache and retesting`);
    
    if (window.globalElementRegistry) {
        window.globalElementRegistry.clearAllCache();
        console.log(`✅ Cache cleared`);
        
        // Retest element discovery
        setTimeout(() => {
            testElementRegistryFindsClones();
        }, 100);
    } else {
        console.error(`❌ Global element registry not found`);
    }
}

// Make functions globally available for testing
if (typeof window !== 'undefined') {
    window.testCloneAndBadgePaletteUpdate = testCloneAndBadgePaletteUpdate;
    window.testElementRegistryFindsClones = testElementRegistryFindsClones;
    window.triggerPaletteUpdateAndTest = triggerPaletteUpdateAndTest;
    window.clearElementCacheAndRetest = clearElementCacheAndRetest;
    
    console.log(`🛠️ Clone/Badge palette debug functions available:`);
    console.log(`   testCloneAndBadgePaletteUpdate(jobNumber) - Test current state`);
    console.log(`   testElementRegistryFindsClones() - Check element registry`);
    console.log(`   triggerPaletteUpdateAndTest(jobNumber) - Full test cycle`);
    console.log(`   clearElementCacheAndRetest() - Clear cache and retest`);
}

export { testCloneAndBadgePaletteUpdate, testElementRegistryFindsClones, triggerPaletteUpdateAndTest, clearElementCacheAndRetest };