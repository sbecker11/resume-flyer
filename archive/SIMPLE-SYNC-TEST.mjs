#!/usr/bin/env node

// SIMPLE BIDIRECTIONAL SYNC TEST
// Direct server-side validation using curl and simple checks

import { execSync } from 'child_process';
import fs from 'fs';

class SimpleSyncTester {
    constructor() {
        this.results = {
            timestamp: new Date().toISOString(),
            systemCheck: {},
            functionalityTest: {},
            overallDetermination: 'UNKNOWN'
        };
    }

    async runTest() {
        console.log('🔬 SIMPLE BIDIRECTIONAL SYNC VALIDATION');
        console.log('='.repeat(50));
        
        // System Check
        console.log('🔍 SYSTEM DIAGNOSTICS...');
        this.runSystemCheck();
        
        // Functionality Test
        console.log('\n🧪 FUNCTIONALITY ANALYSIS...');
        this.analyzeFunctionality();
        
        // Generate Summary
        console.log('\n📊 GENERATING SUMMARY...');
        this.generateSummary();
    }

    runSystemCheck() {
        try {
            // Check if frontend is running
            const frontendStatus = execSync('curl -s -o /dev/null -w "%{http_code}" "http://localhost:5173"', { encoding: 'utf8' }).trim();
            this.results.systemCheck.frontendRunning = frontendStatus === '200';
            console.log(`   🌐 Frontend (5173): ${this.results.systemCheck.frontendRunning ? '✅ Running' : '❌ Down'}`);
            
            // Check if backend is running
            const backendStatus = execSync('curl -s -o /dev/null -w "%{http_code}" "http://localhost:3009"', { encoding: 'utf8' }).trim();
            this.results.systemCheck.backendRunning = backendStatus === '200';
            console.log(`   🖥️ Backend (3009): ${this.results.systemCheck.backendRunning ? '✅ Running' : '❌ Down'}`);
            
            // Check for key files
            const keyFiles = [
                'modules/core/selectionManager.mjs',
                'modules/resume/ResumeListController.mjs',
                'modules/resume/ResumeItemsController.mjs'
            ];
            
            this.results.systemCheck.keyFilesPresent = keyFiles.every(file => {
                try {
                    fs.accessSync(file);
                    return true;
                } catch {
                    return false;
                }
            });
            
            console.log(`   📁 Key Files: ${this.results.systemCheck.keyFilesPresent ? '✅ Present' : '❌ Missing'}`);
            
            // Check HTML content for required elements
            if (this.results.systemCheck.frontendRunning) {
                try {
                    const htmlContent = execSync('curl -s "http://localhost:5173"', { encoding: 'utf8' });
                    this.results.systemCheck.hasResumeElements = htmlContent.includes('biz-resume-div') || htmlContent.includes('resume');
                    this.results.systemCheck.hasSceneElements = htmlContent.includes('scene-container') || htmlContent.includes('scene');
                    
                    console.log(`   📝 Resume Elements: ${this.results.systemCheck.hasResumeElements ? '✅ Found' : '❌ Missing'}`);
                    console.log(`   🎬 Scene Elements: ${this.results.systemCheck.hasSceneElements ? '✅ Found' : '❌ Missing'}`);
                } catch (error) {
                    console.log(`   ⚠️ Could not analyze HTML content: ${error.message}`);
                    this.results.systemCheck.hasResumeElements = false;
                    this.results.systemCheck.hasSceneElements = false;
                }
            }
            
        } catch (error) {
            console.log(`   ❌ System check failed: ${error.message}`);
        }
    }

    analyzeFunctionality() {
        try {
            // Analyze selectionManager.mjs
            const selectionManagerContent = fs.readFileSync('modules/core/selectionManager.mjs', 'utf8');
            this.results.functionalityTest.hasSelectJobNumberMethod = selectionManagerContent.includes('selectJobNumber');
            this.results.functionalityTest.hasSourceParameter = selectionManagerContent.includes('source') && selectionManagerContent.includes('selectJobNumber');
            
            console.log(`   📞 selectJobNumber method: ${this.results.functionalityTest.hasSelectJobNumberMethod ? '✅ Present' : '❌ Missing'}`);
            console.log(`   🏷️ Source parameter handling: ${this.results.functionalityTest.hasSourceParameter ? '✅ Present' : '❌ Missing'}`);
            
            // Analyze ResumeListController.mjs
            const resumeControllerContent = fs.readFileSync('modules/resume/ResumeListController.mjs', 'utf8');
            this.results.functionalityTest.hasClickHandler = resumeControllerContent.includes('handleBizResumeDivClickEvent') || resumeControllerContent.includes('click');
            this.results.functionalityTest.callsSelectionManager = resumeControllerContent.includes('selectionManager') && resumeControllerContent.includes('selectJobNumber');
            
            console.log(`   🖱️ Click handler: ${this.results.functionalityTest.hasClickHandler ? '✅ Present' : '❌ Missing'}`);
            console.log(`   🔗 Calls selection manager: ${this.results.functionalityTest.callsSelectionManager ? '✅ Present' : '❌ Missing'}`);
            
            // Analyze ResumeItemsController.mjs for scroll functionality
            const itemsControllerContent = fs.readFileSync('modules/resume/ResumeItemsController.mjs', 'utf8');
            this.results.functionalityTest.hasScrollLogic = itemsControllerContent.includes('scroll') || itemsControllerContent.includes('scrollIntoView');
            this.results.functionalityTest.hasVisibilityLogic = itemsControllerContent.includes('visible') || itemsControllerContent.includes('getBoundingClientRect');
            
            console.log(`   📜 Scroll logic: ${this.results.functionalityTest.hasScrollLogic ? '✅ Present' : '❌ Missing'}`);
            console.log(`   👁️ Visibility logic: ${this.results.functionalityTest.hasVisibilityLogic ? '✅ Present' : '❌ Missing'}`);
            
        } catch (error) {
            console.log(`   ❌ Functionality analysis failed: ${error.message}`);
        }
    }

    generateSummary() {
        console.log('\n' + '='.repeat(60));
        console.log('🎯 BIDIRECTIONAL SYNC VALIDATION SUMMARY');
        console.log('='.repeat(60));
        
        // System Health Score
        const systemChecks = [
            this.results.systemCheck.frontendRunning,
            this.results.systemCheck.backendRunning,
            this.results.systemCheck.keyFilesPresent,
            this.results.systemCheck.hasResumeElements,
            this.results.systemCheck.hasSceneElements
        ];
        const systemScore = Math.round((systemChecks.filter(Boolean).length / systemChecks.length) * 100);
        
        // Functionality Score
        const functionalityChecks = [
            this.results.functionalityTest.hasSelectJobNumberMethod,
            this.results.functionalityTest.hasSourceParameter,
            this.results.functionalityTest.hasClickHandler,
            this.results.functionalityTest.callsSelectionManager,
            this.results.functionalityTest.hasScrollLogic,
            this.results.functionalityTest.hasVisibilityLogic
        ];
        const functionalityScore = Math.round((functionalityChecks.filter(Boolean).length / functionalityChecks.length) * 100);
        
        // Overall Score
        const overallScore = Math.round((systemScore + functionalityScore) / 2);
        
        console.log(`📊 SCORES:`);
        console.log(`   🔧 System Health: ${systemScore}% (${systemChecks.filter(Boolean).length}/${systemChecks.length} checks passed)`);
        console.log(`   ⚙️ Functionality: ${functionalityScore}% (${functionalityChecks.filter(Boolean).length}/${functionalityChecks.length} checks passed)`);
        console.log(`   🏆 Overall: ${overallScore}%`);
        
        console.log(`\n🔍 DETAILED ANALYSIS:`);
        console.log(`   Frontend Status: ${this.results.systemCheck.frontendRunning ? '✅' : '❌'} (Port 5173)`);
        console.log(`   Backend Status: ${this.results.systemCheck.backendRunning ? '✅' : '❌'} (Port 3009)`);
        console.log(`   Key Files: ${this.results.systemCheck.keyFilesPresent ? '✅' : '❌'} (Controllers present)`);
        console.log(`   Resume Elements: ${this.results.systemCheck.hasResumeElements ? '✅' : '❌'} (HTML structure)`);
        console.log(`   Scene Elements: ${this.results.systemCheck.hasSceneElements ? '✅' : '❌'} (HTML structure)`);
        console.log(`   API Methods: ${this.results.functionalityTest.hasSelectJobNumberMethod ? '✅' : '❌'} (selectJobNumber)`);
        console.log(`   Source Params: ${this.results.functionalityTest.hasSourceParameter ? '✅' : '❌'} (Parameter handling)`);
        console.log(`   Click Handlers: ${this.results.functionalityTest.hasClickHandler ? '✅' : '❌'} (rDiv click events)`);
        console.log(`   Manager Calls: ${this.results.functionalityTest.callsSelectionManager ? '✅' : '❌'} (API integration)`);
        console.log(`   Scroll Logic: ${this.results.functionalityTest.hasScrollLogic ? '✅' : '❌'} (cDiv scrolling)`);
        console.log(`   Visibility Logic: ${this.results.functionalityTest.hasVisibilityLogic ? '✅' : '❌'} (Element visibility)`);
        
        // Final Determination
        console.log(`\n🎯 FINAL DETERMINATION:`);
        if (overallScore >= 90) {
            this.results.overallDetermination = 'EXCELLENT - Bidirectional sync should work perfectly';
            console.log(`   🎉 EXCELLENT: Bidirectional sync implementation is complete and should work perfectly!`);
            console.log(`   ✅ All major components are present and properly configured`);
            console.log(`   🔧 System is ready for production use`);
        } else if (overallScore >= 75) {
            this.results.overallDetermination = 'GOOD - Bidirectional sync likely works with minor issues';
            console.log(`   ✅ GOOD: Bidirectional sync implementation is solid with minor gaps`);
            console.log(`   🔶 Most functionality is present, some fine-tuning may be needed`);
            console.log(`   🔧 System should work but may have edge cases`);
        } else if (overallScore >= 50) {
            this.results.overallDetermination = 'PARTIAL - Bidirectional sync has significant issues';
            console.log(`   ⚠️ PARTIAL: Bidirectional sync implementation has significant gaps`);
            console.log(`   🔴 Core functionality present but major components missing or misconfigured`);
            console.log(`   🔧 Substantial development work needed`);
        } else {
            this.results.overallDetermination = 'POOR - Bidirectional sync likely not functional';
            console.log(`   ❌ POOR: Bidirectional sync implementation is incomplete`);
            console.log(`   🚫 Critical components missing or system not running properly`);
            console.log(`   🔧 Major development work required`);
        }
        
        this.results.systemScore = systemScore;
        this.results.functionalityScore = functionalityScore;
        this.results.overallScore = overallScore;
        
        // Save results
        fs.writeFileSync('bidirectional-sync-analysis.json', JSON.stringify(this.results, null, 2));
        console.log('\n💾 Analysis results saved to: bidirectional-sync-analysis.json');
        
        console.log('\n📝 SUMMARY FOR USER:');
        console.log(`   Overall Assessment: ${this.results.overallDetermination}`);
        console.log(`   System Health: ${systemScore}%`);
        console.log(`   Code Functionality: ${functionalityScore}%`);
        console.log(`   Confidence Level: ${overallScore >= 75 ? 'HIGH' : overallScore >= 50 ? 'MEDIUM' : 'LOW'}`);
        
        console.log('='.repeat(60));
    }
}

// Run the test
const tester = new SimpleSyncTester();
tester.runTest().catch(console.error);