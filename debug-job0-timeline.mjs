#!/usr/bin/env node
// debug-job0-timeline.mjs - Debug script to understand job #0 timeline positioning

import { jobs } from './static_content/jobs/jobs.mjs';
import * as dateUtils from './modules/utils/dateUtils.mjs';
import { linearInterp } from './modules/utils/mathUtils.mjs';

console.log('=== Job #0 Timeline Position Analysis ===');

const job0 = jobs[0];
console.log('Job #0 raw data:');
console.log('- employer:', job0.employer);
console.log('- start:', job0.start);  
console.log('- end:', job0.end);

// Simulate timeline initialization logic
console.log('\n=== Timeline Initialization ===');

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

// Timeline bounds calculation
const timelineStartDate = new Date(earliestStartDate);
timelineStartDate.setFullYear(timelineStartDate.getFullYear() - 1);

const today = new Date();
const timelineEndDate = new Date(today);
timelineEndDate.setFullYear(timelineEndDate.getFullYear() + 1);

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

console.log('Start year (fractional):', startYear);
console.log('End year (fractional):', endYear);
console.log('Total year span:', totalYearSpan);
console.log('Timeline height (pixels):', timelineHeight);

console.log('\n=== Job #0 Position Calculation ===');

// Process Job #0 dates like CardsController does
const job0StartDate = dateUtils.parseFlexibleDateString(job0.start);
const job0EndDate = (job0.end && job0.end === "CURRENT_DATE")
    ? new Date()
    : dateUtils.parseFlexibleDateString(job0.end || job0.start);

console.log('Job #0 start date:', job0StartDate.toISOString());
console.log('Job #0 end date:', job0EndDate.toISOString());

// Convert to fractional years
const job0StartYear = dateToFractionalYear(job0StartDate);
const job0EndYear = dateToFractionalYear(job0EndDate);

console.log('Job #0 start year (fractional):', job0StartYear);
console.log('Job #0 end year (fractional):', job0EndYear);

// Calculate positions using the same logic as getPositionForDate
const topPadding = TIMELINE_PADDING_TOP + 50;
const bottomPosition = timelineHeight;

const job0TopPosition = linearInterp(
    job0EndYear,        // x: job end date
    startYear,          // x0: timeline start
    bottomPosition,     // y0: bottom pixel position
    endYear,            // x1: timeline end
    topPadding         // y1: top pixel position
);

const job0BottomPosition = linearInterp(
    job0StartYear,      // x: job start date
    startYear,          // x0: timeline start
    bottomPosition,     // y0: bottom pixel position
    endYear,            // x1: timeline end
    topPadding         // y1: top pixel position
);

console.log('Job #0 calculated top position (Y):', job0TopPosition);
console.log('Job #0 calculated bottom position (Y):', job0BottomPosition);
console.log('Job #0 calculated height:', job0BottomPosition - job0TopPosition);

console.log('\n=== Comparison with Other Jobs ===');

// Show positions for first few jobs for comparison
jobs.slice(0, 5).forEach((job, index) => {
    try {
        const startDate = dateUtils.parseFlexibleDateString(job.start);
        const endDate = (job.end && job.end === "CURRENT_DATE")
            ? new Date()
            : dateUtils.parseFlexibleDateString(job.end || job.start);
        
        const jobStartYear = dateToFractionalYear(startDate);
        const jobEndYear = dateToFractionalYear(endDate);
        
        const topPos = linearInterp(jobEndYear, startYear, bottomPosition, endYear, topPadding);
        const bottomPos = linearInterp(jobStartYear, startYear, bottomPosition, endYear, topPadding);
        
        console.log(`Job ${index} (${job.employer}):`);
        console.log(`  - Dates: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);
        console.log(`  - Y position: top=${topPos.toFixed(1)}, bottom=${bottomPos.toFixed(1)}, height=${(bottomPos - topPos).toFixed(1)}`);
    } catch (error) {
        console.log(`Job ${index} (${job.employer}): Error -`, error.message);
    }
});

console.log('\n=== Timeline Verification ===');
console.log('Expected behavior:');
console.log('- More recent jobs should have LOWER Y values (closer to top)');
console.log('- Older jobs should have HIGHER Y values (closer to bottom)');
console.log('- Job #0 is the most recent job, so it should be at/near the top');

const isJob0AtTop = job0TopPosition < (topPadding + 100); // Within 100px of top
console.log(`Job #0 position check: ${isJob0AtTop ? 'CORRECT - near top' : 'INCORRECT - not at top'}`);

console.log('\n=== Potential Issues Analysis ===');
console.log('topPadding value:', topPadding);
console.log('Job #0 top position:', job0TopPosition);
console.log('Distance from topPadding:', job0TopPosition - topPadding);

// Check if Job #0 should be closer to the very top
console.log('\nExpected positioning:');
console.log('- Timeline starts at year:', startYear);
console.log('- Job #0 ends at year:', job0EndYear);
console.log('- Job #0 should be very close to timeline end (top)');
console.log('- Current distance from timeline end:', Math.abs(job0EndYear - endYear), 'years');

// Check if the issue is with CURRENT_DATE handling
const nowExact = new Date();
const todayFractional = dateToFractionalYear(nowExact);
console.log('\nCURRENT_DATE analysis:');
console.log('- Today exact date:', nowExact.toISOString());
console.log('- Today fractional year:', todayFractional);
console.log('- Timeline end fractional year:', endYear);
console.log('- Should Job #0 end exactly at timeline end? Timeline ends 1 year from today, Job #0 ends today');

// Calculate where Job #0 SHOULD end if it ends exactly today
const correctJob0TopPosition = linearInterp(
    todayFractional,    // x: today's date
    startYear,          // x0: timeline start
    bottomPosition,     // y0: bottom pixel position
    endYear,            // x1: timeline end
    topPadding         // y1: top pixel position
);

console.log('\nCorrected calculation:');
console.log('- If Job #0 ends exactly TODAY:', correctJob0TopPosition);
console.log('- Current calculation gives:', job0TopPosition);
console.log('- Difference:', Math.abs(correctJob0TopPosition - job0TopPosition), 'pixels');

console.log('\n=== ROOT CAUSE ANALYSIS ===');
if (Math.abs(todayFractional - job0EndYear) > 0.001) {
    console.log('🚨 FOUND ISSUE: Job #0 end date is not exactly today!');
    console.log('   - Job #0 end date fractional year:', job0EndYear);
    console.log('   - Today fractional year:', todayFractional);
    console.log('   - This suggests CURRENT_DATE is not being processed correctly');
} else {
    console.log('✅ Job #0 end date matches today correctly');
}