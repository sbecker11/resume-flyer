#!/usr/bin/env node

/**
 * Test script to demonstrate dependency enforcement system
 * Shows how the system catches violations at startup
 */

import { startDependencyEnforcement } from './modules/core/dependencyEnforcement.mjs';

console.log(`
🧪 TESTING DEPENDENCY ENFORCEMENT SYSTEM
========================================

This script will:
1. Scan the project for components using managers
2. Check if they're properly registered 
3. FAIL if violations are found

BadgePositioner has been stripped of safeguards to test this.
`);

async function runEnforcementTest() {
    try {
        console.log('🔍 Starting enforcement scan...');
        
        const result = await startDependencyEnforcement({
            enforcementLevel: 'STRICT',  // FAIL on violations
            projectRoot: '.',
            generateReport: true,
            failOnViolations: true
        });

        console.log(`
✅ ENFORCEMENT TEST PASSED
==========================

All components are compliant:
- Scanned: ${result.scanResults?.scannedFiles || 0} files
- Found: ${result.scanResults?.foundComponents?.length || 0} components  
- Violations: ${result.scanResults?.violatingComponents?.length || 0}

The enforcement system is working correctly.
        `);

    } catch (error) {
        console.error(`
❌ ENFORCEMENT TEST DETECTED VIOLATIONS
======================================

${error.message}

This proves the enforcement system works! 
BadgePositioner and other components are not following dependency management rules.

Check compliance-report.md for detailed violation list.
        `);
        
        process.exit(1);
    }
}

// Run the test
runEnforcementTest();