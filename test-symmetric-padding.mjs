#!/usr/bin/env node
// test-symmetric-padding.mjs - Test the symmetric padding approach for Job #0

import { jobs } from './static_content/jobs/jobs.mjs';
import * as dateUtils from './modules/utils/dateUtils.mjs';
import { linearInterp } from './modules/utils/mathUtils.mjs';

console.log('=== Testing Symmetric Padding for Job #0 ===');

const job0 = jobs[0];
console.log('Job #0:', job0.employer, job0.start, 'to', job0.end);

// Process dates exactly like the updated CardsController
const startDate = dateUtils.parseFlexibleDateString(job0.start);
const endDate = (job0.end && job0.end === "CURRENT_DATE")
    ? new Date()
    : dateUtils.parseFlexibleDateString(job0.end || job0.start);

console.log('\nOriginal dates:');
console.log('- Start:', startDate.toISOString().split('T')[0]);
console.log('- End:', endDate.toISOString().split('T')[0]);

// Calculate duration and apply symmetric padding
const jobDurationMs = endDate.getTime() - startDate.getTime();
const oneYearMs = 365.25 * 24 * 60 * 60 * 1000;
const jobDurationDays = Math.round(jobDurationMs / (24 * 60 * 60 * 1000));

console.log('\nDuration analysis:');
console.log('- Job duration:', jobDurationDays, 'days');
console.log('- Job duration:', (jobDurationDays / 30.44).toFixed(1), 'months');
console.log('- One year:', Math.round(oneYearMs / (24 * 60 * 60 * 1000)), 'days');
console.log('- Needs padding?', jobDurationMs < oneYearMs ? 'YES' : 'NO');

let renderStartDate = startDate;
let renderEndDate = endDate;

if (jobDurationMs < oneYearMs) {
    const paddingMs = 2.5 * 30.44 * 24 * 60 * 60 * 1000; // 2.5 months
    renderStartDate = new Date(startDate.getTime() - paddingMs);
    renderEndDate = new Date(endDate.getTime() + paddingMs);
    
    console.log('\nSymmetric padding applied:');
    console.log('- Padding:', (paddingMs / (24 * 60 * 60 * 1000 * 30.44)).toFixed(1), 'months');
    console.log('- Render start:', renderStartDate.toISOString().split('T')[0]);
    console.log('- Render end:', renderEndDate.toISOString().split('T')[0]);
    
    const renderDurationDays = Math.round((renderEndDate.getTime() - renderStartDate.getTime()) / (24 * 60 * 60 * 1000));
    console.log('- Render duration:', renderDurationDays, 'days');
    console.log('- Render duration:', (renderDurationDays / 30.44).toFixed(1), 'months');
}

// Timeline setup
const earliestJobStart = new Date('1987-09-01T00:00:00.000Z');
const timelineStartDate = new Date(earliestJobStart);
timelineStartDate.setFullYear(timelineStartDate.getFullYear() - 1);

const today = new Date();
const timelineEndDate = new Date(today);
timelineEndDate.setFullYear(timelineEndDate.getFullYear() + 1);

console.log('\nTimeline bounds:');
console.log('- Timeline start (bottom):', timelineStartDate.toISOString().split('T')[0]);
console.log('- Timeline end (top):', timelineEndDate.toISOString().split('T')[0]);

// Convert to fractional years and calculate positions
const dateToFractionalYear = (date) => {
    return date.getFullYear() + date.getMonth()/12 + date.getDate()/365.25/12;
};

const startYear = dateToFractionalYear(timelineStartDate);
const endYear = dateToFractionalYear(timelineEndDate);
const timelineHeight = (endYear - startYear) * 200;

const sceneTop = linearInterp(
    dateToFractionalYear(renderEndDate), startYear, timelineHeight, endYear, 0
);
const sceneBottom = linearInterp(
    dateToFractionalYear(renderStartDate), startYear, timelineHeight, endYear, 0
);

console.log('\n=== Final Position ===');
console.log('- Scene top (Y position):', sceneTop.toFixed(2));
console.log('- Scene bottom (Y position):', sceneBottom.toFixed(2));
console.log('- Scene height:', (sceneBottom - sceneTop).toFixed(2));

// Verify the 9.5 months expectation
const todayY = linearInterp(dateToFractionalYear(today), startYear, timelineHeight, endYear, 0);
const expectedDistanceFromToday = 2.5 * 30.44 / 365.25 * 200; // 2.5 months in pixels

console.log('\n=== Verification ===');
console.log('- Today would be at Y:', todayY.toFixed(2));
console.log('- Job #0 top is at Y:', sceneTop.toFixed(2));
console.log('- Distance from today:', (sceneTop - todayY).toFixed(2), 'pixels');
console.log('- Expected distance (2.5 months):', expectedDistanceFromToday.toFixed(2), 'pixels');

// Calculate months from timeline top
const timelineTopY = 0;
const monthsFromTop = (sceneTop / 200) * 12;
console.log('- Job #0 is', monthsFromTop.toFixed(1), 'months from timeline top');
console.log('- Expected: ~9.5 months from timeline top');

if (Math.abs(monthsFromTop - 9.5) < 0.5) {
    console.log('✅ SUCCESS: Job #0 positioned correctly at ~9.5 months from top');
} else {
    console.log('❌ Issue: Expected ~9.5 months, got', monthsFromTop.toFixed(1), 'months');
}