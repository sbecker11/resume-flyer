/**
 * TimelineManager - IM component that manages timeline state and initialization
 * Replaces the useTimeline composable for timeline data management
 */

import { BaseComponent } from './abstracts/BaseComponent.mjs';
import { ref, computed } from 'vue';
import * as dateUtils from '../utils/dateUtils.mjs';
import { linearInterp } from '../utils/mathUtils.mjs';

// --- Constants ---
const YEAR_HEIGHT = 200; // The height in pixels for one year on the timeline
const TIMELINE_PADDING_TOP = 0; // No top padding - scene plane will handle alignment

class TimelineManager extends BaseComponent {
    constructor() {
        super('TimelineManager');
        
        // --- Reactive State ---
        // Note: Using plain properties instead of Vue refs since this is a class, not a composable
        this._isTimelineInitialized = false;
        this._startYear = 0;
        this._endYear = 0;
        this._timelineHeight = 0;
        
        // Create Vue refs for external access
        this.isTimelineInitialized = ref(false);
        this.startYear = ref(0);
        this.endYear = ref(0);
        this.timelineHeight = ref(0);
        
        // Store the singleton instance
        TimelineManager.instance = this;
    }

    getPriority() {
        return 'high'; // Must initialize after JobsDataManager but before CardsController
    }

    getDependencies() {
        return ['JobsDataManager']; // TimelineManager depends on JobsDataManager for job data
    }

    async initialize({ JobsDataManager }) {
        console.log('[TimelineManager] Initializing with JobsDataManager...');
        
        this.jobsDataManager = JobsDataManager;
        
        // Validate dependencies
        if (!this.jobsDataManager) {
            throw new Error('[TimelineManager] JobsDataManager dependency not provided');
        }
        
        // Get jobs data and initialize timeline
        const jobsData = this.jobsDataManager.getAllJobs();
        console.log('[TimelineManager] Got jobs data:', jobsData?.length, 'jobs');
        this._initializeTimelineWithData(jobsData);
        
        // isInitialized is managed by BaseComponent
        console.log('[TimelineManager] Successfully initialized - initialize() method COMPLETE');
    }
    
    destroy() {
        this._isTimelineInitialized = false;
        this._startYear = 0;
        this._endYear = 0;
        this._timelineHeight = 0;
        
        this.isTimelineInitialized.value = false;
        this.startYear.value = 0;
        this.endYear.value = 0;
        this.timelineHeight.value = 0;
        
        this.jobsDataManager = null;
        // isInitialized is managed by BaseComponent
        TimelineManager.instance = null;
    }

    _initializeTimelineWithData(jobsData) {
        if (this._isTimelineInitialized) return; // Already initialized
        if (!jobsData) {
            console.error('[TimelineManager] Timeline initialization failed: jobsData not provided.');
            return;
        }

        console.log('[TimelineManager] Starting date computation with', jobsData.length, 'jobs');

        // Self-initializing timeline: analyze jobs data to determine bounds
        // Min: Earliest job start date - 1 year  
        // Max: Today + 1 year
        
        let earliestStartDate = null;
        const dateParsingResults = [];
        
        jobsData.forEach((job, index) => {
            try {
                console.log(`[TimelineManager] Parsing job ${index}: start="${job.start}"`);
                const startDate = dateUtils.parseFlexibleDateString(job.start);
                console.log(`[TimelineManager] Job ${index} parsed date:`, startDate);
                
                dateParsingResults.push({ jobIndex: index, employer: job.employer, startString: job.start, parsedDate: startDate });
                
                if (!earliestStartDate || startDate < earliestStartDate) {
                    console.log(`[TimelineManager] New earliest date found: ${startDate} (was: ${earliestStartDate})`);
                    earliestStartDate = startDate;
                }
            } catch (error) {
                console.warn(`[TimelineManager] Error parsing job ${index} start date:`, job.start, error);
                dateParsingResults.push({ jobIndex: index, employer: job.employer, startString: job.start, error: error.message });
            }
        });
        
        console.log('[TimelineManager] All date parsing results:', dateParsingResults);
        console.log('[TimelineManager] Final earliest start date:', earliestStartDate);
        
        if (!earliestStartDate) {
            console.error('[TimelineManager] No valid job start dates found');
            return;
        }
        
        // Timeline start: Earliest job - 1 year (preserve month/day)
        const timelineStartDate = new Date(earliestStartDate);
        timelineStartDate.setFullYear(timelineStartDate.getFullYear() - 1);
        console.log('[TimelineManager] Timeline start date (earliest - 1 year):', timelineStartDate);
        
        // Timeline end: Today + 1 year (preserve month/day) 
        const today = new Date();
        const timelineEndDate = new Date(today);
        timelineEndDate.setFullYear(timelineEndDate.getFullYear() + 1);
        console.log('[TimelineManager] Timeline end date (today + 1 year):', timelineEndDate);
        
        // Calculate year range
        this._startYear = timelineStartDate.getFullYear();
        this._endYear = timelineEndDate.getFullYear();
        this.startYear.value = this._startYear;
        this.endYear.value = this._endYear;
        console.log('[TimelineManager] Calculated year range:', this._startYear, 'to', this._endYear);
        
        // Calculate timeline height (inclusive range: endYear to startYear inclusive)
        const yearRange = this._endYear - this._startYear + 1;
        this._timelineHeight = TIMELINE_PADDING_TOP + (yearRange * YEAR_HEIGHT);
        this.timelineHeight.value = this._timelineHeight;
        console.log('[TimelineManager] Calculated timeline height:', this._timelineHeight, 'px (', yearRange, 'years * ', YEAR_HEIGHT, 'px/year + ', TIMELINE_PADDING_TOP, 'px padding)');
        
        this._isTimelineInitialized = true;
        this.isTimelineInitialized.value = this._isTimelineInitialized;
        
        console.log(`[TimelineManager] Timeline initialized:`);
        console.log(`  Start year: ${this._startYear} (ref: ${this.startYear.value})`);
        console.log(`  End year: ${this._endYear} (ref: ${this.endYear.value})`);
        console.log(`  Height: ${this._timelineHeight}px (ref: ${this.timelineHeight.value}px)`);
        console.log(`  Year range: ${yearRange} years`);
        console.log(`[TimelineManager] _initializeTimelineWithData COMPLETE - reactive refs set successfully`);
    }

    // Public API Methods

    // isInitialized is handled by BaseComponent - no need for custom getter

    /**
     * Get position for a given date
     * @param {Date} date - The date to get position for
     * @returns {number} Y position in pixels
     */
    getPositionForDate(date) {
        if (!this._isTimelineInitialized) {
            console.warn('[TimelineManager] getPositionForDate called before initialization');
            return 0;
        }

        const startDate = new Date(this._startYear, 0, 1);
        const endDate = new Date(this._endYear, 11, 31);
        
        // Get position using linear interpolation
        const startTime = startDate.getTime();
        const endTime = endDate.getTime();
        const targetTime = date.getTime();
        
        // Calculate position (0 at top for newest dates, increasing downward for older dates)
        // Reverse the interpolation: newer dates (higher time values) get smaller Y positions (top)
        const position = linearInterp(targetTime, endTime, startTime, TIMELINE_PADDING_TOP, this._timelineHeight - TIMELINE_PADDING_TOP);
        
        return Math.max(TIMELINE_PADDING_TOP, Math.min(this._timelineHeight, position));
    }

    /**
     * Get reactive timeline state for Vue components
     * This maintains compatibility with the original useTimeline composable
     */
    getTimelineState() {
        console.log('[TimelineManager] getTimelineState called - returning internal values directly');
        console.log('[TimelineManager] Internal values:', {
            isTimelineInitialized: this._isTimelineInitialized,
            startYear: this._startYear,
            endYear: this._endYear,
            timelineHeight: this._timelineHeight
        });
        
        // Return reactive-like objects that use internal values
        // This creates pseudo-refs that work like Vue refs but use reliable internal state
        return {
            isInitialized: {
                value: this._isTimelineInitialized
            },
            startYear: {
                value: this._startYear
            },
            endYear: {
                value: this._endYear
            },
            timelineHeight: {
                value: this._timelineHeight
            },
            getPositionForDate: this.getPositionForDate.bind(this)
        };
    }

    /**
     * Get timeline bounds
     */
    getBounds() {
        return {
            startYear: this._startYear,
            endYear: this._endYear,
            height: this._timelineHeight
        };
    }

}

// Create and export singleton instance
export const timelineManager = new TimelineManager();

// Export class for testing
export { TimelineManager };