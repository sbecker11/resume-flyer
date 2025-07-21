#!/usr/bin/env node
// debug-job0-date.mjs - Debug script to understand job #0 date processing

import { jobs } from './static_content/jobs/jobs.mjs';
import * as dateUtils from './modules/utils/dateUtils.mjs';

console.log('=== Job #0 Date Analysis ===');

const job0 = jobs[0];
console.log('Job #0 raw data:');
console.log('- employer:', job0.employer);
console.log('- start:', job0.start);  
console.log('- end:', job0.end);

console.log('\n=== Date Processing ===');

// Test parseFlexibleDateString for CURRENT_DATE
console.log('Testing parseFlexibleDateString("CURRENT_DATE"):');
try {
    const currentDateParsed = dateUtils.parseFlexibleDateString("CURRENT_DATE");
    console.log('- Parsed CURRENT_DATE:', currentDateParsed);
    console.log('- Year:', currentDateParsed.getFullYear());
    console.log('- Month:', currentDateParsed.getMonth() + 1);
    console.log('- Date:', currentDateParsed.getDate());
} catch (error) {
    console.error('- Error parsing CURRENT_DATE:', error.message);
}

// Test how the job end date is processed (mimicking CardsController logic)
console.log('\nTesting job end date processing (CardsController logic):');
try {
    const endDate = (job0.end && job0.end === "CURRENT_DATE")
        ? new Date()
        : dateUtils.parseFlexibleDateString(job0.end || job0.start);
    console.log('- Processed end date:', endDate);
    console.log('- End year:', endDate.getFullYear());
} catch (error) {
    console.error('- Error processing job end date:', error.message);
}

console.log('\n=== Timeline Bounds Analysis ===');

// Test getMinMaxYears with all jobs
console.log('Testing getMinMaxYears with all jobs:');
try {
    const { minYear, maxYear } = dateUtils.getMinMaxYears(jobs);
    console.log('- minYear:', minYear);
    console.log('- maxYear:', maxYear);
    console.log('- Timeline extends from', minYear, 'to', maxYear);
    
    // Check what the natural maxYear would be without the 2027 extension
    let naturalMaxYear = -Infinity;
    jobs.forEach(job => {
        const endDate = (job.end && job.end === "CURRENT_DATE")
            ? new Date()
            : dateUtils.parseFlexibleDateString(job.end || job.start);
        if (endDate) {
            const endYear = endDate.getFullYear();
            if (endYear > naturalMaxYear) {
                naturalMaxYear = endYear;
            }
        }
    });
    
    console.log('- Natural maxYear (without 2027 extension):', naturalMaxYear);
    console.log('- Current year:', new Date().getFullYear());
    
} catch (error) {
    console.error('- Error in getMinMaxYears:', error.message);
}

console.log('\n=== Individual Job Date Analysis ===');
jobs.forEach((job, index) => {
    if (index > 2) return; // Only check first 3 jobs for brevity
    
    console.log(`\nJob ${index} (${job.employer}):`);
    console.log('- start:', job.start);
    console.log('- end:', job.end);
    
    try {
        const startDate = dateUtils.parseFlexibleDateString(job.start);
        const endDate = (job.end && job.end === "CURRENT_DATE")
            ? new Date()
            : dateUtils.parseFlexibleDateString(job.end || job.start);
        
        console.log(`- Start year: ${startDate.getFullYear()}`);
        console.log(`- End year: ${endDate.getFullYear()}`);
    } catch (error) {
        console.error(`- Error processing job ${index}:`, error.message);
    }
});

console.log('\n=== Current System Date ===');
const now = new Date();
console.log('- Current date:', now);
console.log('- Current year:', now.getFullYear());
console.log('- ISO string:', now.toISOString());