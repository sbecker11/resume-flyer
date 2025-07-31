/**
 * BadgePositioner - Utility for positioning skill badges around cDivs
 * Extracted from SkillBadges.vue to reduce complexity and improve reusability
 */
import { AppState } from '../core/stateManager.mjs';

export class BadgePositioner {
    constructor(badgeHeight = 30) { // 2.5em at 12px = 30px
        this.badgeHeight = badgeHeight;
    }

    /**
     * Position badges around a selected cDiv using staggered positioning
     * @param {Array} allBadges - All badge elements to position
     * @param {Array} relatedBadges - Badges related to selected job
     * @param {Array} unrelatedBadges - Badges not related to selected job  
     * @param {Object} cDivBounds - cDiv boundaries {top, bottom, centerY}
     * @param {Function} updateCallback - Callback to update Vue reactive data
     * @returns {Object} Statistics about badge distribution
     */
    positionBadges(allBadges, relatedBadges, unrelatedBadges, cDivBounds, updateCallback = null) {
        const { top: cDivTop, bottom: cDivBottom, centerY: cDivCenterY } = cDivBounds;
        
        // Validate cDiv bounds before positioning
        if (isNaN(cDivCenterY) || cDivCenterY < 0) {
            console.warn(`[BadgePositioner] Invalid cDivCenterY: ${cDivCenterY}, hiding all badges`);
            this.hideAllBadges(allBadges, updateCallback);
            return { aboveCount: 0, betweenCount: 0, belowCount: 0, badgeCenterYs: [], totalRelated: 0 };
        }
        
        console.log(`[BadgePositioner] NEW POLICY: Only showing ${relatedBadges.length} related badges around clone Y=${cDivCenterY.toFixed(1)}px`);
        
        // Hide all unrelated badges
        this.hideUnrelatedBadges(unrelatedBadges, updateCallback);
        
        // Position only related badges using bucket algorithm around clone center
        const bucketData = this._calculateBucketPositions(relatedBadges.length, cDivCenterY);
        
        // Create position data for related badges only
        const positionData = relatedBadges.map((badge, index) => ({
            element: badge,
            position: bucketData[index].position,
            bucketNumber: bucketData[index].bucketNumber
        }));
        
        // If callback provided, use it to update Vue reactive data
        if (updateCallback) {
            updateCallback(positionData);
        } else {
            // Fallback: apply directly to DOM (but this gets overridden by Vue)
            positionData.forEach(({ element, position }, index) => {
                element.style.top = `${position}px`;
                if (index < 3) {
                    console.log(`[BadgePositioner] Badge ${index} (${element.textContent}): positioned at ${position}px (DOM fallback)`);
                }
            });
        }
        
        // Calculate statistics for related badges only
        const stats = this._calculateBadgeStatistics(relatedBadges, cDivTop, cDivBottom);
        
        // Categorize all badges after positioning
        const categorized = positionData.map(({ element, position, bucketNumber }) => {
            const badgeCenterY = position + 20; // badge height / 2
            let category;
            if (badgeCenterY < cDivTop) {
                category = 'ABOVE';
            } else if (badgeCenterY > cDivBottom) {
                category = 'BELOW';
            } else {
                category = 'LEVEL';
            }
            return {
                id: element.id,
                name: element.textContent,
                top: position,
                centerY: badgeCenterY,
                category,
                bucketNumber: bucketNumber
            };
        });
        
        // Dispatch positioning complete event
        window.dispatchEvent(new CustomEvent('badges-positioned', {
            detail: {
                selectedJobNumber: this._getSelectedJobNumber(),
                stats,
                badgeOrder: categorized
            }
        }));
        
        return { ...stats, badgeOrder: categorized };
    }

    /**
     * Position badges in viewport when no cDiv is selected
     * @param {Array} allBadges - All badge elements to position
     * @param {Function} updateCallback - Callback to update Vue reactive data
     */
    positionBadgesInViewport(allBadges, updateCallback = null) {
        const sceneContent = document.getElementById('scene-content');
        if (!sceneContent) {
            console.warn('[BadgePositioner] scene-content not found, using viewport positioning');
            const startY = 100;
            const spacing = this.badgeHeight + 10;
            
            const positionData = allBadges.map((badge, index) => ({
                element: badge,
                position: startY + (index * spacing)
            }));
            
            if (updateCallback) {
                updateCallback(positionData);
            } else {
                positionData.forEach(({ element, position }) => {
                    element.style.top = `${position}px`;
                });
            }
            return;
        }
        
        // Get scene-content scroll position and visible area
        const scrollTop = sceneContent.scrollTop;
        const viewportHeight = sceneContent.clientHeight;
        
        // Position badges in the middle of the visible area
        const visibleCenterY = scrollTop + (viewportHeight / 2);
        const startY = Math.max(200, visibleCenterY - ((allBadges.length * this.badgeHeight) / 2));
        const spacing = this.badgeHeight + 10; // Spacing between badges
        
        const positionData = allBadges.map((badge, index) => ({
            element: badge,
            position: startY + (index * spacing)
        }));
        
        if (updateCallback) {
            updateCallback(positionData);
        } else {
            positionData.forEach(({ element, position }) => {
                element.style.top = `${position}px`;
            });
        }
        
        console.log(`[BadgePositioner] Positioned ${allBadges.length} badges in viewport mode (scrollTop=${scrollTop}, startY=${startY})`);
    }

    /**
     * Calculate staggered positions around a center point
     * @private
     */
    _calculateStaggeredPositions(totalBadges, centerBucket) {
        const positions = [];
        // Use AppState configuration if available, otherwise default
        const verticalSpacing = (typeof AppState !== 'undefined' && AppState?.badges?.spacing?.vertical) || 10;
        const badgeSpacing = this.badgeHeight + verticalSpacing; // Badge height + vertical margin
        
        console.log(`[BadgePositioner] Calculating balanced staggered positions for ${totalBadges} badges around centerBucket=${centerBucket}px`);
        console.log(`[BadgePositioner] Using badgeHeight=${this.badgeHeight}px, verticalSpacing=${verticalSpacing}px, total badgeSpacing=${badgeSpacing}px`);
        
        // Create balanced distribution around center point
        // Pattern: center, above, below, above, below, etc.
        let aboveOffset = 0;
        let belowOffset = 0;
        
        for (let i = 0; i < totalBadges; i++) {
            let targetY;
            
            if (i === 0) {
                // First badge goes at center
                targetY = centerBucket;
            } else if (i % 2 === 1) {
                // Odd badges go above center (1st, 3rd, 5th...)
                aboveOffset++;
                targetY = centerBucket - (aboveOffset * badgeSpacing);
            } else {
                // Even badges go below center (2nd, 4th, 6th...)
                belowOffset++;
                targetY = centerBucket + (belowOffset * badgeSpacing);
            }
            
            positions.push(targetY);
            
            // Debug first few positions
            if (i < 8) {
                console.log(`[BadgePositioner] Badge ${i}: targetY=${targetY}px (center=${centerBucket}, aboveOffset=${aboveOffset}, belowOffset=${belowOffset})`);
            }
        }
        
        console.log(`[BadgePositioner] Generated ${positions.length} balanced staggered positions around center ${centerBucket}px`);
        return positions;
    }


    /**
     * Calculate badge distribution statistics
     * @private
     */
    _calculateBadgeStatistics(relatedBadges, cDivTop, cDivBottom) {
        let aboveCount = 0;    // Above cDiv
        let betweenCount = 0;  // Between/within cDiv
        let belowCount = 0;    // Below cDiv
        
        const badgeCenterYs = [];
        
        relatedBadges.forEach(badge => {
            const badgeY = parseFloat(badge.style.top);
            const badgeCenterY = badgeY + 20; // badge height / 2
            
            badgeCenterYs.push(badgeCenterY);
            
            if (badgeCenterY < cDivTop) {
                aboveCount++;
            } else if (badgeCenterY > cDivBottom) {
                belowCount++;
            } else {
                betweenCount++;
            }
        });
        
        return {
            aboveCount,
            betweenCount, 
            belowCount,
            badgeCenterYs,
            totalRelated: relatedBadges.length
        };
    }

    /**
     * Calculate bucket positions for badges around clone center using staggered pattern
     * @private
     */
    _calculateBucketPositions(numBadges, cloneCenterY) {
        const bucketData = [];
        const badgeSpacing = this.badgeHeight + 10; // Badge height + margin
        
        // Define total number of buckets available (e.g., based on viewport height)
        const sceneContainer = document.getElementById('scene-container');
        const sceneHeight = sceneContainer ? sceneContainer.clientHeight : 1000;
        const totalBuckets = Math.floor(sceneHeight / badgeSpacing);
        
        // Calculate what bucket (1 to N) the clone center Y falls into
        const cloneBucketC = Math.max(1, Math.min(totalBuckets, Math.round(cloneCenterY / badgeSpacing) + 1));
        
        console.log(`[BadgePositioner] Calculating ${numBadges} bucket positions around clone Y=${cloneCenterY.toFixed(1)} (bucket C=${cloneBucketC})`);
        
        // Assign badges to alternating buckets around C: C, C-1, C+1, C-2, C+2, ...
        let aboveOffset = 0;
        let belowOffset = 0;
        
        for (let i = 0; i < numBadges; i++) {
            let bucketNumber;
            let targetY;
            
            if (i === 0) {
                // First badge goes at clone bucket C
                bucketNumber = cloneBucketC;
            } else if (i % 2 === 1) {
                // Odd badges go in buckets above C (C-1, C-2, C-3...)
                aboveOffset++;
                bucketNumber = cloneBucketC - aboveOffset;
            } else {
                // Even badges go in buckets below C (C+1, C+2, C+3...)
                belowOffset++;
                bucketNumber = cloneBucketC + belowOffset;
            }
            
            // Ensure bucket number stays within 1 to totalBuckets range
            bucketNumber = Math.max(1, Math.min(totalBuckets, bucketNumber));
            
            // Convert bucket number to Y coordinate (bucket 1 = Y position 0)
            targetY = (bucketNumber - 1) * badgeSpacing;
            
            bucketData.push({
                position: targetY,
                bucketNumber: bucketNumber,
                cloneBucketC: cloneBucketC  // Include for debug display
            });
            
            if (i < 5) {
                console.log(`[BadgePositioner] Badge ${i}: Bucket=${bucketNumber}, Y=${targetY.toFixed(1)}px (${bucketNumber === cloneBucketC ? 'CENTER' : bucketNumber < cloneBucketC ? 'ABOVE' : 'BELOW'})`);
            }
        }
        
        return bucketData;
    }

    /**
     * Hide unrelated badges
     * @private
     */
    hideUnrelatedBadges(unrelatedBadges, updateCallback) {
        if (updateCallback) {
            // Use callback to hide badges via Vue
            const hiddenData = unrelatedBadges.map(badge => ({
                element: badge,
                position: -2000, // Move off-screen
                hidden: true
            }));
            updateCallback(hiddenData);
        } else {
            // Direct DOM manipulation fallback
            unrelatedBadges.forEach(badge => {
                badge.style.display = 'none';
            });
        }
        console.log(`[BadgePositioner] Hid ${unrelatedBadges.length} unrelated badges`);
    }

    /**
     * Hide all badges
     * @private
     */
    hideAllBadges(allBadges, updateCallback) {
        if (updateCallback) {
            const hiddenData = allBadges.map(badge => ({
                element: badge,
                position: -2000,
                hidden: true
            }));
            updateCallback(hiddenData);
        } else {
            allBadges.forEach(badge => {
                badge.style.display = 'none';
            });
        }
        console.log(`[BadgePositioner] Hid all ${allBadges.length} badges`);
    }

    /**
     * Get currently selected job number
     * @private
     */
    _getSelectedJobNumber() {
        const selectedCDiv = document.querySelector('.biz-card-div.selected');
        return selectedCDiv ? parseInt(selectedCDiv.getAttribute('data-job-number'), 10) : null;
    }
}

// Export singleton instance
export const badgePositioner = new BadgePositioner();