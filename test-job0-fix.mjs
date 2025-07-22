#!/usr/bin/env node
// test-job0-fix.mjs - Test the Job #0 position fix

import { jobs } from './static_content/jobs/jobs.mjs';
import { initialize, useTimeline } from './modules/composables/useTimeline.mjs';

console.log('=== Testing Job #0 Position Fix ===');

// Initialize the timeline with the new logic
initialize(jobs);

const { getPositionForDate, startYear, endYear, timelineHeight } = useTimeline();

console.log('Timeline bounds after fix:');
console.log('- Start year:', startYear.value);
console.log('- End year:', endYear.value);
console.log('- Timeline height:', timelineHeight.value);

const job0 = jobs[0];
console.log('\nJob #0:', job0.employer);
console.log('- Start:', job0.start);
console.log('- End:', job0.end);

// Simulate the same date processing as CardsController
import * as dateUtils from './modules/utils/dateUtils.mjs';

const job0StartDate = dateUtils.parseFlexibleDateString(job0.start);
const job0EndDate = (job0.end && job0.end === "CURRENT_DATE")
    ? new Date()
    : dateUtils.parseFlexibleDateString(job0.end || job0.start);

console.log('\nProcessed dates:');
console.log('- Start date:', job0StartDate.toISOString());
console.log('- End date:', job0EndDate.toISOString());

const job0TopPosition = getPositionForDate(job0EndDate);
const job0BottomPosition = getPositionForDate(job0StartDate);

console.log('\nJob #0 positions after fix:');
console.log('- Top Y position:', job0TopPosition);
console.log('- Bottom Y position:', job0BottomPosition);
console.log('- Height:', job0BottomPosition - job0TopPosition);

// Check if Job #0 is now closer to the top
const topPadding = 50;
const distanceFromTop = job0TopPosition - topPadding;
console.log('\nProximity to top:');
console.log('- Distance from top padding:', distanceFromTop);
console.log('- Is closer to top?', distanceFromTop < 100 ? 'YES' : 'NO');

// Compare with other recent jobs
console.log('\n=== Comparison with other jobs ===');
jobs.slice(0, 3).forEach((job, index) => {
    try {
        const startDate = dateUtils.parseFlexibleDateString(job.start);
        const endDate = (job.end && job.end === "CURRENT_DATE")
            ? new Date()
            : dateUtils.parseFlexibleDateString(job.end || job.start);
        
        const topPos = getPositionForDate(endDate);
        const bottomPos = getPositionForDate(startDate);
        
        console.log(`Job ${index} (${job.employer}):`);
        console.log(`  - Y position: top=${topPos.toFixed(1)}, bottom=${bottomPos.toFixed(1)}, height=${(bottomPos - topPos).toFixed(1)}`);
        console.log(`  - Distance from top: ${(topPos - topPadding).toFixed(1)} pixels`);
    } catch (error) {
        console.log(`Job ${index} (${job.employer}): Error -`, error.message);
    }
});

console.log('\n=== Fix Verification ===');
const today = new Date();
const threeMonthsFromNow = new Date(today);
threeMonthsFromNow.setMonth(threeMonthsFromNow.getMonth() + 3);

console.log('Timeline should end around:', threeMonthsFromNow.toISOString().split('T')[0]);
console.log('Actual timeline end year:', endYear.value);

// Convert timeline end to actual date for verification
const endYearInt = Math.floor(endYear.value);
const endYearFraction = endYear.value - endYearInt;
const endMonth = Math.floor(endYearFraction * 12);
const timelineEndAsDate = new Date(endYearInt, endMonth, 1);

console.log('Timeline end as date:', timelineEndAsDate.toISOString().split('T')[0]);
console.log('Expected end date:', threeMonthsFromNow.toISOString().split('T')[0]);

const monthsDifference = Math.abs(timelineEndAsDate.getTime() - threeMonthsFromNow.getTime()) / (1000 * 60 * 60 * 24 * 30);
console.log('Months difference from expected:', monthsDifference.toFixed(1));

if (monthsDifference < 1) {
    console.log('✅ SUCCESS: Timeline end is approximately 3 months from today');
} else {
    console.log('❌ ISSUE: Timeline end is not close to expected date');
}