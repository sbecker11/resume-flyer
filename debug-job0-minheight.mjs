#!/usr/bin/env node
// debug-job0-minheight.mjs - Debug Job #0 with MIN_HEIGHT adjustment

import { jobs } from './static_content/jobs/jobs.mjs';
import * as dateUtils from './modules/utils/dateUtils.mjs';
import { linearInterp } from './modules/utils/mathUtils.mjs';

console.log('=== Job #0 MIN_HEIGHT Adjustment Analysis ===');

const MIN_HEIGHT = 180; // From CardsController.mjs

const job0 = jobs[0];
console.log('Job #0:', job0.employer, job0.start, 'to', job0.end);

// Process dates
const job0StartDate = dateUtils.parseFlexibleDateString(job0.start);
const job0EndDate = (job0.end && job0.end === "CURRENT_DATE")
    ? new Date()
    : dateUtils.parseFlexibleDateString(job0.end || job0.start);

console.log('Processed dates:');
console.log('- Start:', job0StartDate.toISOString().split('T')[0]);
console.log('- End:', job0EndDate.toISOString().split('T')[0]);

// Timeline setup
const earliestJobStart = new Date('1987-09-01T00:00:00.000Z');
const timelineStartDate = new Date(earliestJobStart);
timelineStartDate.setFullYear(timelineStartDate.getFullYear() - 1);

const today = new Date();
const timelineEndDate = new Date(today);
timelineEndDate.setFullYear(timelineEndDate.getFullYear() + 1);

const dateToFractionalYear = (date) => {
    return date.getFullYear() + date.getMonth()/12 + date.getDate()/365.25/12;
};

const startYear = dateToFractionalYear(timelineStartDate);
const endYear = dateToFractionalYear(timelineEndDate);
const timelineHeight = (endYear - startYear) * 200;

// Initial position calculation (before MIN_HEIGHT adjustment)
const initialSceneTop = linearInterp(
    dateToFractionalYear(job0EndDate), startYear, timelineHeight, endYear, 0
);
const initialSceneBottom = linearInterp(
    dateToFractionalYear(job0StartDate), startYear, timelineHeight, endYear, 0
);

console.log('\n=== Initial Calculation (Natural Size) ===');
console.log('Initial sceneTop:', initialSceneTop);
console.log('Initial sceneBottom:', initialSceneBottom);
console.log('Initial sceneHeight:', initialSceneBottom - initialSceneTop);
console.log('Initial sceneCenterY:', initialSceneTop + (initialSceneBottom - initialSceneTop) / 2);

// Apply MIN_HEIGHT logic (replicating CardsController logic)
let sceneTop = initialSceneTop;
let sceneBottom = initialSceneBottom;
let sceneHeight = sceneBottom - sceneTop;
const sceneCenterY = sceneTop + sceneHeight / 2;

console.log('\n=== MIN_HEIGHT Adjustment ===');
console.log('Natural height:', sceneHeight);
console.log('MIN_HEIGHT:', MIN_HEIGHT);

if (sceneHeight < MIN_HEIGHT) {
    console.log('⚠️  Height is below minimum, applying adjustment...');
    
    sceneHeight = MIN_HEIGHT;
    let newSceneTop = sceneCenterY - MIN_HEIGHT / 2;
    
    console.log('Calculated newSceneTop:', newSceneTop);
    console.log('sceneCenterY:', sceneCenterY);
    console.log('MIN_HEIGHT / 2:', MIN_HEIGHT / 2);
    
    // Boundary check
    if (newSceneTop < 0) {
        console.log('🚨 BOUNDARY VIOLATION: newSceneTop < 0, clamping to top!');
        sceneTop = 0;
        sceneBottom = MIN_HEIGHT;
        console.log('Clamped: sceneTop =', sceneTop, ', sceneBottom =', sceneBottom);
    } else {
        console.log('✅ No boundary violation');
        sceneTop = newSceneTop;
        sceneBottom = sceneCenterY + MIN_HEIGHT / 2;
        console.log('Adjusted: sceneTop =', sceneTop, ', sceneBottom =', sceneBottom);
    }
} else {
    console.log('✅ Height is sufficient, no adjustment needed');
}

console.log('\n=== Final Position ===');
console.log('Final sceneTop:', sceneTop);
console.log('Final sceneBottom:', sceneBottom);
console.log('Final sceneHeight:', sceneBottom - sceneTop);

if (sceneTop === 0) {
    console.log('🎯 EXPLANATION: Job #0 appears at top edge because:');
    console.log('   1. Natural height (~67px) < MIN_HEIGHT (180px)');
    console.log('   2. Expanding to 180px around center would push top above Y=0');
    console.log('   3. Boundary protection clamps sceneTop to 0 (top edge)');
    console.log('   4. This is working as designed to prevent cards from being cut off');
}