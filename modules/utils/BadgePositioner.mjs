/**
 * BadgePositioner - Utility for positioning skill badges around cDivs
 * NO SAFEGUARDS VERSION - to test enforcement system
 * VIOLATION: Uses selectionManager without proper registration
 */

import { selectionManager } from '../core/selectionManager.mjs';
import { BaseComponent } from '../core/abstracts/BaseComponent.mjs';
import { useTimeline } from '../composables/useTimeline.mjs';

// Badge positioning modes relative to bizCardDiv
const BadgePositionMode = Object.freeze({
    ABOVE: 'ABOVE',  // Badge is positioned above the bizCardDiv
    LEVEL: 'LEVEL',  // Badge is positioned at the same level as bizCardDiv
    BELOW: 'BELOW'   // Badge is positioned below the bizCardDiv
});

export class BadgePositioner extends BaseComponent {
    constructor() {
        super('BadgePositioner');
        this.badgeHeight = this._parseEmToPx('1.5em');
        this.badgeMargin = 10;
    }
    
    getDependencies() {
        return ['selectionManager'];
    }
    
    async initialize() {
        // BadgePositioner initialized
    }
    
    destroy() {
        // BadgePositioner destroyed
    }

    /**
     * Generate alternating sequence: 0, 1, -1, 2, -2, 3, -3, 4, -4, ... up to length L
     * This is the core clustering algorithm from your original implementation
     * @param {number} L - Length of sequence
     * @returns {Array<number>} Sequence [0, 1, -1, 2, -2, 3, -3, 4, -4, ...]
     */
    generateAlternatingSequence(L) {
        const sequence = [];
        for (let i = 0; i < L; i++) {
            if (i === 0) {
                sequence.push(0);
            } else if (i % 2 === 1) {
                // Odd indices: positive numbers (1, 2, 3, 4, ...)
                sequence.push((i + 1) / 2);
            } else {
                // Even indices: negative numbers (-1, -2, -3, -4, ...)
                sequence.push(-i / 2);
            }
        }
        return sequence;
    }

    /**
     * Position badges around a selected cDiv using sophisticated clustering algorithm
     * Enhanced version of your original createBizCardBadgesInfo logic
     * @param {Array} relatedBadges - Badges related to selected job
     * @param {Array} unrelatedBadges - Badges not related to selected job  
     * @param {Object} cDivBounds - cDiv boundaries {top, bottom, centerY}
     * @param {Function} updateCallback - Callback to update Vue reactive data
     * @returns {Object} Statistics about badge distribution
     */
    positionBadges(relatedBadges, unrelatedBadges, cDivBounds, updateCallback = null) {
        // Positioning badges
        
        // REMOVED: All validation and error checking
        // REMOVED: Input parameter validation  
        // REMOVED: Bounds checking
        // REMOVED: Debug logging

        // Direct destructuring with NO validation
        const cDiv_topY = parseFloat(cDivBounds['top']);
        const cDiv_bottomY = parseFloat(cDivBounds['bottom']);
        const cDiv_centerY = parseFloat(cDivBounds['centerY']);
        const cDiv_height = cDiv_bottomY - cDiv_topY;

        // Enhanced clustering positioning logic
        
        // Hide all unrelated badges
        this.hideUnrelatedBadges(unrelatedBadges, updateCallback);
        
        if (relatedBadges.length === 0) {
            return { aboveCount: 0, levelCount: 0, belowCount: 0, totalCount: 0 };
        }
        
        // === SOPHISTICATED TIMELINE-BASED BUCKET CALCULATION ===
        // Get dynamic timeline dimensions from actual job data
        const { startYear, endYear, timelineHeight, isInitialized } = useTimeline();
        
        // Validate timeline is initialized
        if (!isInitialized.value) {
            console.error('Timeline not initialized - cannot calculate buckets');
            return { aboveCount: 0, levelCount: 0, belowCount: 0, totalCount: 0 };
        }
        
        const timelineYears = endYear.value - startYear.value + 1;
        const PIXELS_PER_YEAR = 200;
        const TIMELINE_MARGIN_TOP = 50; // scene plane padding  
        const bucketSpacing = this.badgeHeight + this.badgeMargin; // 30 + 10 = 40
        
        // N = ceiling((timelineYears * pixelsPerYear - timelineMarginTop) / (badgeHeight + badgeMargin))
        const numBuckets = Math.ceil((timelineYears * PIXELS_PER_YEAR - TIMELINE_MARGIN_TOP) / bucketSpacing);
        // console.log(`[DEBUG] Bucket calculation: timelineYears=${timelineYears}, numBuckets=${numBuckets}, cDiv_centerY=${cDiv_centerY}`);
        
        // Dynamic timeline-based bucket calculation complete
        
        // Creating timeline-relative buckets
        
        const allBuckets = [];
        for (let i = 0; i < numBuckets; i++) {
            const bucketTop = i * bucketSpacing;
            const bucketBottom = bucketTop + this.badgeHeight;
            const bucketCenter = bucketTop + this.badgeHeight / 2;

            // Classify all buckets in relation to this bizCardDiv (your original logic)
            let badgeMode = BadgePositionMode.LEVEL;
            if (bucketBottom < cDiv_topY) badgeMode = BadgePositionMode.ABOVE;
            if (bucketTop > cDiv_bottomY) badgeMode = BadgePositionMode.BELOW;
            
            
            const bucket = {
                top: bucketTop,
                bottom: bucketBottom,
                center: bucketCenter,
                index: i,
                badgeMode: badgeMode,
                used: false
            };
            
            // Bucket bounds logging removed for cleaner console output
            
            allBuckets.push(bucket);
        }

        // O(1) bucket calculation - direct calculation instead of search
        const centerBucketIndex = Math.floor(cDiv_centerY / bucketSpacing);
        
        // Validate the calculated index is within bounds
        if (centerBucketIndex < 0 || centerBucketIndex >= numBuckets) {
            const errorMsg = `Center bucket not found: calculated centerBucketIndex=${centerBucketIndex} is out of bounds [0, ${numBuckets-1}] for cDiv_centerY=${cDiv_centerY}. bucketSpacing=${bucketSpacing}`;
            console.error(errorMsg);
            throw new Error(errorMsg);
        }
        // console.log(`[DEBUG] Found centerBucketIndex=${centerBucketIndex} for cDiv_centerY=${cDiv_centerY}`);
        
        // Algorithm comparison complete
        
        const centerBucket = allBuckets[centerBucketIndex];
        if (!centerBucket) {
            console.error(`Center bucket not found at index ${centerBucketIndex}`);
            return { aboveCount: 0, levelCount: 0, belowCount: 0, totalCount: 0 };
        }
        const centerBucket_top = centerBucket['top'];
        const centerBucket_bottom = centerBucket['bottom'];
        const centerBucket_badgeMode = centerBucket['badgeMode'];
        
        // Use sophisticated alternating sequence for clustering
        const alternatingSequence = this.generateAlternatingSequence(Math.max(relatedBadges.length * 4, numBuckets));

        let aboveCount = 0;
        let levelCount = 0;
        let belowCount = 0;
        let numRebucketed = 0;
        let numBucketed = 0;
        const badges = [];
        const positionData = [];

        // Core algorithm: for each skill, use the alternating sequence to find buckets
        // This matches your original algorithm exactly: centerBucketIndex + sequence[i]
        const numJobSkills = relatedBadges.length;
        
        // Processing job skills using alternating sequence
        
        for (let i = 0; i < alternatingSequence.length && badges.length < numJobSkills; i++) {
            const bucketIndex = centerBucketIndex + alternatingSequence[i];
            // console.log(`[DEBUG] Badge ${i}: centerBucketIndex=${centerBucketIndex} + alternatingSequence[${i}]=${alternatingSequence[i]} = bucketIndex=${bucketIndex}`);
            
            // Skip out of bounds buckets
            if (bucketIndex < 0 || bucketIndex >= numBuckets) {
                // console.log(`[DEBUG] Skipping out of bounds bucket ${bucketIndex} (valid range: 0-${numBuckets-1})`);
                numRebucketed++;
                continue;
            }
            
            const bucket = allBuckets[bucketIndex];
            if (bucket.used) {
                numRebucketed++;
                continue;
            }

            // Assign the next skill to this available bucket
            const skillIndex = badges.length; // Current skill index
            const badgeElement = relatedBadges[skillIndex];
            
            const badge = {
                element: badgeElement,
                jobSkill: badgeElement.textContent || `skill-${skillIndex}`,
                top: bucket.top,
                bottom: bucket.bottom,
                center: bucket.center,
                badgeMode: bucket.badgeMode,
                bucketIndex: bucketIndex,
                position: bucket.top
            };

            // Badge assigned to bucket

            bucket.used = true;
            
            // Count by badge modes
            if (badge.badgeMode === BadgePositionMode.ABOVE) aboveCount++;
            if (badge.badgeMode === BadgePositionMode.LEVEL) levelCount++;
            if (badge.badgeMode === BadgePositionMode.BELOW) belowCount++;
            
            badges.push(badge);
            positionData.push({
                element: badgeElement,
                position: bucket.top,
                bucketNumber: bucketIndex,
                badgeMode: bucket.badgeMode
            });
            
            numBucketed++;

            // Skill positioned in bucket
        }

        // Fallback: use any remaining unused buckets if we still need more
        if (badges.length < relatedBadges.length) {
            
            for (let bucketIndex = 0; bucketIndex < allBuckets.length && badges.length < relatedBadges.length; bucketIndex++) {
                const bucket = allBuckets[bucketIndex];
                if (!bucket.used) {
                    const badgeElement = relatedBadges[badges.length];
                    const badge = {
                        element: badgeElement,
                        jobSkill: badgeElement.textContent || `skill-${badges.length}`,
                        top: bucket.top,
                        bottom: bucket.bottom,
                        center: bucket.center,
                        badgeMode: bucket.badgeMode,
                        bucketIndex: bucketIndex,
                        position: bucket.top
                    };

                    // Fallback badge assigned to bucket

                    bucket.used = true;
                    
                    if (badge.badgeMode === BadgePositionMode.ABOVE) aboveCount++;
                    if (badge.badgeMode === BadgePositionMode.LEVEL) levelCount++;
                    if (badge.badgeMode === BadgePositionMode.BELOW) belowCount++;
                    
                    badges.push(badge);
                    positionData.push({
                        element: badgeElement,
                        position: bucket.top,
                        bucketNumber: bucketIndex,
                        badgeMode: bucket.badgeMode
                    });
                    
                    numBucketed++;
                    // Fallback badge positioned
                }
            }
        }

        const totalCount = aboveCount + levelCount + belowCount;

        // Accept fewer badges if needed
        if (badges.length < relatedBadges.length) {
            console.warn(`Only positioned ${badges.length} badges out of ${relatedBadges.length} requested`);
        }

        // Clustering complete

        // Apply positions via callback or DOM
        if (updateCallback) {
            updateCallback(positionData);
        } else {
            positionData.forEach(({ element, position }) => {
                element.style.top = `${position}px`;
            });
        }

        // Add bucket visualization for selected badges
        // this._visualizeBuckets(badges);

        // Create categorized badge info for reporting
        const categorized = badges.map(badge => ({
            id: badge.element.id,
            name: badge.jobSkill,
            top: badge.top,
            centerY: badge.center,
            category: badge.badgeMode,
            bucketNumber: badge.bucketIndex
        }));

        const badgesInfo = {
            aboveCount,
            levelCount,
            belowCount,
            totalCount,
            aboveRatio: totalCount > 0 ? (aboveCount / totalCount).toFixed(2) : '0.00',
            levelRatio: totalCount > 0 ? (levelCount / totalCount).toFixed(2) : '0.00',
            belowRatio: totalCount > 0 ? (belowCount / totalCount).toFixed(2) : '0.00',
            rebucketed: numRebucketed,
            badges: badges,
            badgeOrder: categorized
        };

        // Dispatch positioning complete event
        window.dispatchEvent(new CustomEvent('badges-positioned', {
            detail: {
                selectedJobNumber: this._getSelectedJobNumber(),
                stats: badgesInfo,
                badgeOrder: categorized
            }
        }));

        return badgesInfo;
    }

    /**
     * Position badges in viewport when no cDiv is selected
     * @param {Array} allBadges - All badge elements to position
     * @param {Function} updateCallback - Callback to update Vue reactive data
     */
    positionBadgesInViewport(allBadges, updateCallback = null) {
        const sceneContent = document.getElementById('scene-content');
        if (!sceneContent) {
            console.warn('scene-content not found, using viewport positioning');
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
        
        // Badges positioned in viewport mode
    }

    // Old methods removed - replaced with enhanced clustering algorithm

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
        // Unrelated badges hidden
    }

    // REMOVED: hideAllBadges method - no safeguards

    /**
     * Visualize bucket rectangles for selected badges
     * @private
     */
    _visualizeBuckets(badges) {
        // Remove existing bucket visualizations
        document.querySelectorAll('.bucket-visualization').forEach(el => el.remove());

        badges.forEach(badge => {
            const bucketRect = document.createElement('div');
            bucketRect.className = 'bucket-visualization';
            bucketRect.style.cssText = `
                position: absolute;
                top: ${badge.top}px;
                left: 0;
                width: 100%;
                height: ${this.badgeHeight}px;
                border: 2px dashed rgba(255, 255, 0, 0.6);
                background: rgba(255, 255, 0, 0.1);
                pointer-events: none;
                z-index: 998;
                box-sizing: border-box;
            `;
            
            // Add bucket info
            const bucketLabel = document.createElement('div');
            bucketLabel.textContent = `Bucket ${badge.bucketIndex} (${badge.badgeMode})`;
            bucketLabel.style.cssText = `
                position: absolute;
                top: 2px;
                left: 4px;
                font-size: 10px;
                color: rgba(0, 0, 0, 0.7);
                background: rgba(255, 255, 255, 0.8);
                padding: 1px 3px;
                border-radius: 2px;
            `;
            bucketRect.appendChild(bucketLabel);

            // Add to scene container
            const sceneContainer = document.getElementById('scene-container');
            if (sceneContainer) {
                sceneContainer.appendChild(bucketRect);
            }
        });

        // Bucket visualization added
    }

    /**
     * Convert em values to pixels
     * @private
     */
    _parseEmToPx(emValue) {
        if (typeof emValue === 'string' && emValue.endsWith('em')) {
            const emNum = parseFloat(emValue);
            const fontSize = parseFloat(getComputedStyle(document.body).fontSize);
            return emNum * fontSize;
        }
        return parseFloat(emValue) || 30; // fallback to 30px
    }

    /**
     * Get currently selected job number
     * VIOLATION: Uses selectionManager without dependency registration
     * @private
     */
    _getSelectedJobNumber() {
        // VIOLATION: Direct use of selectionManager without registration
        return selectionManager.getSelectedJobNumber();
    }
}

// Export singleton instance
export const badgePositioner = new BadgePositioner();