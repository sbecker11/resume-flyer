#!/usr/bin/env node
// debug-job0-current-position.mjs - Debug Job #0 positioning with updated timeline

import { jobs } from './static_content/jobs/jobs.mjs';
import * as dateUtils from './modules/utils/dateUtils.mjs';
import { linearInterp } from './modules/utils/mathUtils.mjs';

console.log('=== Debugging Job #0 Current Position ===');

const job0 = jobs[0];
console.log('Job #0 data:', {
    employer: job0.employer,
    start: job0.start,
    end: job0.end
});

// Process Job #0 dates exactly like CardsController does
const job0StartDate = dateUtils.parseFlexibleDateString(job0.start);
const job0EndDate = (job0.end && job0.end === "CURRENT_DATE")
    ? new Date()
    : dateUtils.parseFlexibleDateString(job0.end || job0.start);

console.log('\nProcessed dates:');
console.log('Start date:', job0StartDate.toISOString());
console.log('End date (CURRENT_DATE):', job0EndDate.toISOString());

// Timeline bounds (corrected version)
const earliestJobStart = new Date('1987-09-01T00:00:00.000Z');
const timelineStartDate = new Date(earliestJobStart);
timelineStartDate.setFullYear(timelineStartDate.getFullYear() - 1); // 1986-09-01

const today = new Date();
const timelineEndDate = new Date(today);
timelineEndDate.setFullYear(timelineEndDate.getFullYear() + 1);

console.log('\nTimeline bounds:');
console.log('Timeline start (bottom):', timelineStartDate.toISOString());
console.log('Timeline end (top):', timelineEndDate.toISOString());

// Convert to fractional years
const dateToFractionalYear = (date) => {
    return date.getFullYear() + 
           date.getMonth()/12 + 
           date.getDate()/365.25/12;
};

const startYear = dateToFractionalYear(timelineStartDate);
const endYear = dateToFractionalYear(timelineEndDate);
const job0StartYear = dateToFractionalYear(job0StartDate);
const job0EndYear = dateToFractionalYear(job0EndDate);

console.log('\nFractional years:');
console.log('Timeline start year:', startYear);
console.log('Timeline end year:', endYear);
console.log('Job #0 start year:', job0StartYear);
console.log('Job #0 end year:', job0EndYear);

// Timeline constants
const YEAR_HEIGHT = 200;
const timelineHeight = (endYear - startYear) * YEAR_HEIGHT;
const topPosition = 0; // No padding
const bottomPosition = timelineHeight;

console.log('\nTimeline dimensions:');
console.log('Timeline height:', timelineHeight);
console.log('Top position:', topPosition);
console.log('Bottom position:', bottomPosition);

// Calculate Job #0 positions using getPositionForDate logic
const job0TopY = linearInterp(
    job0EndYear,      // x: job end date
    startYear,        // x0: timeline start
    bottomPosition,   // y0: bottom pixel position
    endYear,          // x1: timeline end
    topPosition      // y1: top pixel position
);

const job0BottomY = linearInterp(
    job0StartYear,    // x: job start date
    startYear,        // x0: timeline start
    bottomPosition,   // y0: bottom pixel position
    endYear,          // x1: timeline end
    topPosition      // y1: top pixel position
);

console.log('\nJob #0 calculated positions:');
console.log('Top Y (end date):', job0TopY);
console.log('Bottom Y (start date):', job0BottomY);
console.log('Height:', job0BottomY - job0TopY);

// Expected vs actual
const todayYear = dateToFractionalYear(today);
const nextYearToday = dateToFractionalYear(timelineEndDate);

console.log('\n=== Analysis ===');
console.log('Today fractional year:', todayYear);
console.log('Timeline end fractional year:', nextYearToday);
console.log('Difference (should be exactly 1.0):', nextYearToday - todayYear);

console.log('\nExpected Job #0 position:');
console.log('- Job #0 ends at CURRENT_DATE:', todayYear);
console.log('- Timeline ends at CURRENT_DATE + 1 year:', nextYearToday);
console.log('- Expected Y position: 1 year down from top = 200px');

// Manual calculation check
const manualY = (nextYearToday - todayYear) * YEAR_HEIGHT;
console.log('- Manual calculation: (', nextYearToday, '-', todayYear, ') * 200 =', manualY);

if (Math.abs(job0TopY - 200) < 1) {
    console.log('✅ CORRECT: Job #0 is positioned ~200px from top');
} else {
    console.log('❌ INCORRECT: Job #0 should be at 200px, but is at', job0TopY);
    console.log('   This suggests a bug in the positioning calculation');
}