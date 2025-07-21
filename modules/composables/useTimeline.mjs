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

    // Calculate total timeline height using linear interpolation
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
        // Display clean integer years from ceiling of start to floor of end
        const displayStartYear = Math.ceil(startYear.value);
        const displayEndYear = Math.floor(endYear.value);
        
        for (let year = displayEndYear; year >= displayStartYear; year--) {
            // Calculate position using the fractional start/end years for accuracy
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

        // Use mathUtils linearInterp to map date years to pixel positions
        // x: dateAsYear, x0: startYear, x1: endYear
        // y0: timelineHeight (bottom), y1: topPadding (top)
        const topPadding = TIMELINE_PADDING_TOP + 50; // 50px scene plane padding
        const bottomPosition = timelineHeight.value;
        
        const yPosition = linearInterp(
            dateAsYear,           // x: current date as fractional year
            startYear.value,      // x0: timeline start (bottom)
            bottomPosition,       // y0: bottom pixel position
            endYear.value,        // x1: timeline end (top)
            topPadding           // y1: top pixel position
        );

        return yPosition;
    }


    return {
        isInitialized: computed(() => isInitialized.value),
        startYear: computed(() => startYear.value),
        endYear: computed(() => endYear.value),
        timelineHeight: computed(() => timelineHeight.value),
        years,
        getPositionForDate,
    };
}

export { initialize, useTimeline }; 