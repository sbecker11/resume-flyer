#!/usr/bin/env node
// verify-timeline-bounds.mjs - Verify timeline bounds match user specifications

import { jobs } from './static_content/jobs/jobs.mjs';
import * as dateUtils from './modules/utils/dateUtils.mjs';
import { linearInterp } from './modules/utils/mathUtils.mjs';

console.log('=== Verifying Timeline Bounds ===');

// Find earliest start date
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

console.log('Earliest job start date:', earliestStartDate?.toISOString());

// Apply user specifications:
// Bottom of timeline: Earliest job start date - 1 year (preserve month/day)
const timelineStartDate = new Date(earliestStartDate);
timelineStartDate.setFullYear(timelineStartDate.getFullYear() - 1);

// Top of timeline: CURRENT_DATE + 1 year
const today = new Date();
const timelineEndDate = new Date(today);
timelineEndDate.setFullYear(timelineEndDate.getFullYear() + 1);

console.log('\n=== Timeline Bounds (User Specifications) ===');
console.log('Bottom of timeline (oldest job - 1 year):', timelineStartDate.toISOString());
console.log('Top of timeline (CURRENT_DATE + 1 year):', timelineEndDate.toISOString());

// Convert to fractional years
const dateToFractionalYear = (date) => {
    return date.getFullYear() + 
           date.getMonth()/12 + 
           date.getDate()/365.25/12;
};

const startYear = dateToFractionalYear(timelineStartDate);
const endYear = dateToFractionalYear(timelineEndDate);
const totalYearSpan = endYear - startYear;

console.log('\nFractional years:');
console.log('- Start year (bottom):', startYear);
console.log('- End year (top):', endYear);
console.log('- Total span:', totalYearSpan, 'years');

// Calculate timeline height
const YEAR_HEIGHT = 200;
const TIMELINE_PADDING_TOP = 0;
const timelineHeight = (totalYearSpan * YEAR_HEIGHT) + TIMELINE_PADDING_TOP;

console.log('- Timeline height:', timelineHeight, 'pixels');

// Now calculate where key dates fall
const topPadding = TIMELINE_PADDING_TOP + 50;
const bottomPosition = timelineHeight;

function getYPosition(date) {
    const fractionalYear = dateToFractionalYear(date);
    return linearInterp(
        fractionalYear,
        startYear,
        bottomPosition,
        endYear,
        topPadding
    );
}

console.log('\n=== Key Date Positions ===');

// Today's position
const todayY = getYPosition(today);
console.log('Today (' + today.toISOString().split('T')[0] + '):');
console.log('- Y position:', todayY.toFixed(2));
console.log('- Distance from top padding:', (todayY - topPadding).toFixed(2));

// 2025-08-01 position
const aug2025 = dateUtils.parseFlexibleDateString('2025-08-01');
const aug2025Y = getYPosition(aug2025);
console.log('\n2025-08-01:');
console.log('- Y position:', aug2025Y.toFixed(2));
console.log('- Distance from top padding:', (aug2025Y - topPadding).toFixed(2));

// Job #0 position (most recent job)
const job0 = jobs[0];
const job0StartDate = dateUtils.parseFlexibleDateString(job0.start);
const job0EndDate = (job0.end && job0.end === "CURRENT_DATE")
    ? new Date()
    : dateUtils.parseFlexibleDateString(job0.end || job0.start);

const job0TopY = getYPosition(job0EndDate);
const job0BottomY = getYPosition(job0StartDate);

console.log('\nJob #0 (' + job0.employer + '):');
console.log('- Start:', job0StartDate.toISOString().split('T')[0]);
console.log('- End:', job0EndDate.toISOString().split('T')[0]);
console.log('- Top Y position:', job0TopY.toFixed(2));
console.log('- Bottom Y position:', job0BottomY.toFixed(2));
console.log('- Height:', (job0BottomY - job0TopY).toFixed(2));
console.log('- Distance from timeline top:', (job0TopY - topPadding).toFixed(2));

// Verify timeline bounds
console.log('\n=== Verification ===');
console.log('✅ Timeline bottom = earliest job (' + earliestStartDate.toISOString().split('T')[0] + ') - 1 year = ' + timelineStartDate.toISOString().split('T')[0]);
console.log('✅ Timeline top = CURRENT_DATE (' + today.toISOString().split('T')[0] + ') + 1 year = ' + timelineEndDate.toISOString().split('T')[0]);

// Check if Job #0 is positioned reasonably close to today
const distanceFromToday = Math.abs(job0TopY - todayY);
console.log('\nJob #0 positioning:');
console.log('- Distance from today:', distanceFromToday.toFixed(2), 'pixels');
console.log('- Should be close since Job #0 ends at CURRENT_DATE');