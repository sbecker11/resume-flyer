#!/usr/bin/env node
// calc-2025-08-01.mjs - Calculate Y position for 2025-08-01

import { jobs } from './static_content/jobs/jobs.mjs';
import * as dateUtils from './modules/utils/dateUtils.mjs';
import { linearInterp } from './modules/utils/mathUtils.mjs';

console.log('=== Calculating Y Position for 2025-08-01 ===');

// Replicate the timeline initialization logic from useTimeline.mjs
let earliestStartDate = null;
jobs.forEach(job => {
    try {
        const startDate = dateUtils.parseFlexibleDateString(job.start);
        if (!earliestStartDate || startDate < earliestStartDate) {
            earliestStartDate = startDate;
        }
    } catch (error) {
        console.warn('Error parsing job start date:', job.start, error);
    }
});

console.log('Earliest start date found:', earliestStartDate?.toISOString());

// Timeline bounds calculation using the UPDATED logic
const timelineStartDate = new Date(earliestStartDate);
timelineStartDate.setFullYear(timelineStartDate.getFullYear() - 1);

const today = new Date();

// Check if we have any jobs ending with CURRENT_DATE (this should be true)
let hasCurrentDateJob = false;
let maxNonCurrentDate = null;

jobs.forEach(job => {
    if (job.end === "CURRENT_DATE") {
        hasCurrentDateJob = true;
    } else {
        try {
            const endDate = dateUtils.parseFlexibleDateString(job.end || job.start);
            if (!maxNonCurrentDate || endDate > maxNonCurrentDate) {
                maxNonCurrentDate = endDate;
            }
        } catch (error) {
            console.warn('Error parsing job end date:', job.end, error);
        }
    }
});

let timelineEndDate;
if (hasCurrentDateJob) {
    // If we have CURRENT_DATE jobs, extend timeline to 3 months beyond today
    timelineEndDate = new Date(today);
    timelineEndDate.setMonth(timelineEndDate.getMonth() + 3);
} else {
    // If no CURRENT_DATE jobs, extend 1 year beyond the latest job end date
    timelineEndDate = new Date(maxNonCurrentDate || today);
    timelineEndDate.setFullYear(timelineEndDate.getFullYear() + 1);
}

console.log('Timeline start date:', timelineStartDate.toISOString());
console.log('Timeline end date:', timelineEndDate.toISOString());

// Convert to fractional years
const dateToFractionalYear = (date) => {
    return date.getFullYear() + 
           date.getMonth()/12 + 
           date.getDate()/365.25/12;
};

const startYear = dateToFractionalYear(timelineStartDate);
const endYear = dateToFractionalYear(timelineEndDate);
const totalYearSpan = endYear - startYear;
const YEAR_HEIGHT = 200;
const TIMELINE_PADDING_TOP = 0;
const timelineHeight = (totalYearSpan * YEAR_HEIGHT) + TIMELINE_PADDING_TOP;

console.log('\nTimeline parameters:');
console.log('Start year (fractional):', startYear);
console.log('End year (fractional):', endYear);
console.log('Total year span:', totalYearSpan);
console.log('Timeline height (pixels):', timelineHeight);

// Parse the target date: 2025-08-01
const targetDate = dateUtils.parseFlexibleDateString('2025-08-01');
console.log('\nTarget date: 2025-08-01');
console.log('Parsed date:', targetDate.toISOString());

// Convert to fractional year
const targetYear = dateToFractionalYear(targetDate);
console.log('Target fractional year:', targetYear);

// Calculate position using the same logic as getPositionForDate
const topPadding = TIMELINE_PADDING_TOP + 50; // 50px scene plane padding
const bottomPosition = timelineHeight;

const targetYPosition = linearInterp(
    targetYear,           // x: target date as fractional year
    startYear,            // x0: timeline start (bottom)
    bottomPosition,       // y0: bottom pixel position
    endYear,              // x1: timeline end (top)
    topPadding           // y1: top pixel position
);

console.log('\nCalculated Y position for 2025-08-01:', targetYPosition);
console.log('Distance from top padding (50px):', targetYPosition - topPadding);

// Compare with today's position
const todayYPosition = linearInterp(
    dateToFractionalYear(today),
    startYear,
    bottomPosition,
    endYear,
    topPadding
);

console.log('\nComparison with today (' + today.toISOString().split('T')[0] + '):');
console.log('Today Y position:', todayYPosition);
console.log('2025-08-01 Y position:', targetYPosition);
console.log('Difference:', Math.abs(targetYPosition - todayYPosition), 'pixels');

if (targetYPosition < todayYPosition) {
    console.log('2025-08-01 is ABOVE today (closer to top)');
} else if (targetYPosition > todayYPosition) {
    console.log('2025-08-01 is BELOW today (further from top)');
} else {
    console.log('2025-08-01 is at the same position as today');
}

// Calculate days between dates
const daysBetween = Math.abs(targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
console.log('Days between today and 2025-08-01:', Math.round(daysBetween));

// Verification: is 2025-08-01 in the future?
if (targetDate > today) {
    console.log('✅ 2025-08-01 is in the future, so it should be positioned above (lower Y value) today');
} else {
    console.log('❌ 2025-08-01 is in the past, so it should be positioned below (higher Y value) today');
}