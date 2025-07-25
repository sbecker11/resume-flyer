#!/usr/bin/env node

/**
 * Test script for DOM separation migration functionality
 * Demonstrates the new auto-migration features in ComponentScanner
 */

import { componentScanner } from './modules/core/componentScanner.mjs';

async function testDomSeparationMigration() {
    console.log('🧪 Testing DOM Separation Migration System\n');
    
    try {
        // 1. Find components needing DOM separation
        console.log('=== Step 1: Finding Components Needing DOM Separation ===');
        const componentsNeedingMigration = await componentScanner.findComponentsNeedingDomSeparation();
        
        if (componentsNeedingMigration.length === 0) {
            console.log('✅ No components need DOM separation migration');
            return;
        }
        
        // 2. Generate migration plan for first component (as example)
        console.log('\n=== Step 2: Generating Migration Plan (Example) ===');
        const exampleComponent = componentsNeedingMigration[0];
        const migrationPlan = await componentScanner.generateDomSeparationMigration(exampleComponent);
        
        if (migrationPlan) {
            console.log(`📋 Migration plan for ${migrationPlan.componentName}:`);
            console.log(`   - File: ${migrationPlan.file}`);
            console.log(`   - Violations: ${migrationPlan.violations.length}`);
            console.log(`   - New methods to add: ${migrationPlan.newMethods.length}`);
            console.log(`   - DOM operations to move: ${migrationPlan.domOperations.length}`);
            console.log(`   - Changes to apply: ${migrationPlan.changes.length}\n`);
            
            // Show details
            migrationPlan.violations.forEach((violation, i) => {
                console.log(`   Violation ${i + 1}: ${violation.message}`);
            });
            
            migrationPlan.newMethods.forEach((method, i) => {
                console.log(`   New method ${i + 1}: ${method.name}()`);
            });
        }
        
        // 3. Show what a batch migration would look like (dry run)
        console.log('\n=== Step 3: Batch Migration Summary (Dry Run) ===');
        console.log(`Found ${componentsNeedingMigration.length} components that would be migrated:`);
        
        let totalViolations = 0;
        let totalNewMethods = 0;
        let totalDomOperations = 0;
        
        for (const filePath of componentsNeedingMigration.slice(0, 5)) { // Show first 5
            const plan = await componentScanner.generateDomSeparationMigration(filePath);
            if (plan) {
                console.log(`   📁 ${plan.componentName}:`);
                console.log(`      - Violations: ${plan.violations.length}`);
                console.log(`      - New methods: ${plan.newMethods.length}`);
                console.log(`      - DOM operations: ${plan.domOperations.length}`);
                
                totalViolations += plan.violations.length;
                totalNewMethods += plan.newMethods.length;
                totalDomOperations += plan.domOperations.length;
            }
        }
        
        if (componentsNeedingMigration.length > 5) {
            console.log(`   ... and ${componentsNeedingMigration.length - 5} more components`);
        }
        
        console.log(`\n📊 Migration Summary:`);
        console.log(`   - Total components needing migration: ${componentsNeedingMigration.length}`);
        console.log(`   - Total violations to fix: ${totalViolations}`);
        console.log(`   - Total new methods to add: ${totalNewMethods}`);  
        console.log(`   - Total DOM operations to move: ${totalDomOperations}`);
        
        // 4. Instructions for actual migration
        console.log('\n=== Step 4: How to Execute Migration ===');
        console.log('To actually perform the migration, run:');
        console.log('');
        console.log('// Single component migration:');
        console.log(`await componentScanner.executeDomSeparationMigration('${exampleComponent}');`);
        console.log('');
        console.log('// Batch migration (all components):');
        console.log('const results = await componentScanner.batchExecuteDomSeparationMigration(componentsNeedingMigration);');
        console.log('');
        console.log('⚠️  IMPORTANT: This will modify your source files!');
        console.log('   Make sure to commit your current changes first.');
        
    } catch (error) {
        console.error('❌ Test failed:', error);
        console.error(error.stack);
    }
}

// Example usage functions that can be uncommented to actually run migrations
async function runSingleMigrationExample() {
    console.log('🔧 Running single component migration example...');
    
    const componentsNeedingMigration = await componentScanner.findComponentsNeedingDomSeparation();
    if (componentsNeedingMigration.length > 0) {
        const result = await componentScanner.executeDomSeparationMigration(componentsNeedingMigration[0]);
        console.log(`Migration result: ${result}`);
    }
}

async function runBatchMigrationExample() {
    console.log('🚀 Running batch migration example...');
    
    const componentsNeedingMigration = await componentScanner.findComponentsNeedingDomSeparation();
    const results = await componentScanner.batchExecuteDomSeparationMigration(componentsNeedingMigration);
    
    console.log('Batch migration results:', results);
}

// Run the test
if (process.argv.includes('--execute-single')) {
    runSingleMigrationExample().catch(console.error);
} else if (process.argv.includes('--execute-batch')) {
    runBatchMigrationExample().catch(console.error);
} else {
    testDomSeparationMigration().catch(console.error);
}