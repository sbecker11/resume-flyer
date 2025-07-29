import { ref, computed } from 'vue';
import * as dateUtils from '@/modules/utils/dateUtils.mjs';
import { linearInterp } from '@/modules/utils/mathUtils.mjs';

// --- Constants ---
const YEAR_HEIGHT = 200; // The height in pixels for one year on the timeline
const TIMELINE_PADDING_TOP = 0; // No top padding - scene plane will handle alignment

// --- Reactive State (Singleton) ---
const isInitialized = ref(false);
const startYear = ref(0);
const endYear = ref(0);
const timelineHeight = ref(0);

// --- Initialization Function ---
function initialize(jobsData) {
    if (isInitialized.value) return; // Already initialized
    if (!jobsData) {
        window.CONSOLE_LOG_IGNORE("Timeline initialization failed: jobsData not provided.");
        return;
    }

    // Self-initializing timeline: analyze jobs data to determine bounds
    // Min: Earliest job start date - 1 year  
    // Max: Today + 1 year
    
    let earliestStartDate = null;
    jobsData.forEach(job => {
        try {
            const startDate = dateUtils.parseFlexibleDateString(job.start);
            if (!earliestStartDate || startDate < earliestStartDate) {
                earliestStartDate = startDate;
            }
        } catch (error) {
            console.warn('Error parsing job start date:', job.start, error);
        }
    });
    
    if (!earliestStartDate) {
        console.error('No valid job start dates found');
        return;
    }
    
    // Timeline start: Earliest job - 1 year (preserve month/day)
    const timelineStartDate = new Date(earliestStartDate);
    timelineStartDate.setFullYear(timelineStartDate.getFullYear() - 1);
    
    // Timeline end: Today + 1 year (preserve month/day) 
    const today = new Date();
    const timelineEndDate = new Date(today);
    timelineEndDate.setFullYear(timelineEndDate.getFullYear() + 1);
    
    // Convert to fractional years for linear interpolation
    const dateToFractionalYear = (date) => {
        return date.getFullYear() + 
               date.getMonth()/12 + 
               date.getDate()/365.25/12;
    };
    
    startYear.value = dateToFractionalYear(timelineStartDate);
    endYear.value = dateToFractionalYear(timelineEndDate);

    // Calculate timeline height - back to normal while we find the real issue
    const totalYearSpan = endYear.value - startYear.value;
    timelineHeight.value = (totalYearSpan * YEAR_HEIGHT) + TIMELINE_PADDING_TOP;
    isInitialized.value = true;
    window.CONSOLE_LOG_IGNORE(`Timeline initialized: ${timelineStartDate.toDateString()} to ${timelineEndDate.toDateString()}`);
}

// --- Composable ---
function useTimeline() {
    const years = computed(() => {
        if (!isInitialized.value) return [];
        const yearArray = [];
        // Display years to fill the entire calculated timeline height
        // Use floor/ceil to ensure we cover the full fractional range
        const displayStartYear = Math.floor(startYear.value);
        const displayEndYear = Math.ceil(endYear.value);
        
        for (let year = displayEndYear; year >= displayStartYear; year--) {
            // January 1st fractional year is just the integer year (year + 0)
            const yearPos = linearInterp(year, startYear.value, timelineHeight.value, endYear.value, TIMELINE_PADDING_TOP + 50);
            
            yearArray.push({
                year: year, // Clean integer year for display
                y: yearPos
            });
        }
        return yearArray;
    });

    function getPositionForDate(date) {
        if (!isInitialized.value) {
            window.CONSOLE_LOG_IGNORE("getPositionForDate called before timeline was initialized.");
            return 0;
        }
        if (!date) return 0;

        // Convert date to fractional year for precise interpolation
        const year = date.getFullYear();
        const month = date.getMonth(); // 0-11
        const day = date.getDate();
        const yearFraction = month / 12 + day / 365.25 / 12;
        const dateAsYear = year + yearFraction;

        // Based on measurements: 2026-01-01 -> 137px, position 0 -> 2026 + (137/200) years
        const referenceDateYear = 2026 + (137/200); // 2026.685 years
        const referencePosition = 0; // position 0
        
        // Use simple linear scaling: 200px per year
        const yPosition = referencePosition + (referenceDateYear - dateAsYear) * 200;

        return yPosition;
    }

    function getDateForPosition(yPosition) {
        if (!isInitialized.value) {
            window.CONSOLE_LOG_IGNORE("getDateForPosition called before timeline was initialized.");
            return null;
        }

        const topPadding = TIMELINE_PADDING_TOP;
        const bottomPosition = timelineHeight.value;
        
        // Based on measurements: position 0 -> 2026 + (137/200) years
        const referenceDateYear = 2026 + (137/200); // 2026.685 years
        const referencePosition = 0; // position 0
        
        // Use simple linear scaling: 200px per year (reverse)
        const dateAsYear = referenceDateYear - (yPosition - referencePosition) / 200;

        // Convert fractional year back to date
        const year = Math.floor(dateAsYear);
        const yearRemainder = dateAsYear - year;
        const month = Math.floor(yearRemainder * 12);
        const monthRemainder = (yearRemainder * 12) - month;
        const day = Math.floor(monthRemainder * 365.25 / 12) + 1;

        return new Date(Date.UTC(year, month, day));
    }


    return {
        isInitialized: computed(() => isInitialized.value),
        startYear: computed(() => startYear.value),
        endYear: computed(() => endYear.value),
        timelineHeight: computed(() => timelineHeight.value),
        years,
        getPositionForDate,
        getDateForPosition,
    };
}

export { initialize, useTimeline }; 