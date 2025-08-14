#!/usr/bin/env node

// DIRECT BIDIRECTIONAL SYNC VALIDATOR
// Server-side test to validate rDiv-cDiv synchronization

import puppeteer from 'puppeteer';
import fs from 'fs';

class DirectSyncValidator {
    constructor() {
        this.testResults = [];
    }

    async runComprehensiveTest() {
        console.log('🚀 DIRECT BIDIRECTIONAL SYNC VALIDATION STARTING...\n');
        
        const browser = await puppeteer.launch({
            headless: false,
            defaultViewport: null,
            args: ['--start-maximized']
        });
        
        const page = await browser.newPage();
        
        try {
            // Navigate to the app
            console.log('📍 Loading resume application...');
            await page.goto('http://localhost:5173', { waitUntil: 'networkidle2' });
            
            // Wait for app to fully load
            await page.waitForTimeout(3000);
            
            // Check for required elements
            console.log('🔍 Checking for resume and card elements...');
            const resumeCount = await page.$$eval('.biz-resume-div', divs => divs.length);
            const cardCount = await page.$$eval('.biz-card-div', divs => divs.length);
            
            console.log(`   📝 Resume Divs: ${resumeCount}`);
            console.log(`   🗃️ Card Divs: ${cardCount}\n`);
            
            if (resumeCount === 0) {
                throw new Error('No resume divs found - app not loaded properly');
            }
            
            // Test multiple rDiv clicks
            const testJobNumbers = [0, 1, 2];
            
            for (const jobNumber of testJobNumbers) {
                console.log(`🧪 TESTING Job ${jobNumber}...`);
                const result = await this.testSingleJob(page, jobNumber);
                this.testResults.push(result);
                
                console.log(`   Result: ${result.success ? '✅ SUCCESS' : '❌ FAILURE'} (Score: ${result.score}%)`);
                if (result.issues.length > 0) {
                    console.log(`   Issues: ${result.issues.join(', ')}`);
                }
                console.log('');
                
                // Wait between tests
                await page.waitForTimeout(2000);
            }
            
            // Generate summary
            this.generateFinalSummary();
            
        } catch (error) {
            console.error('❌ Test execution failed:', error.message);
            this.testResults.push({
                jobNumber: 'unknown',
                success: false,
                score: 0,
                error: error.message,
                issues: ['Test execution failed']
            });
        } finally {
            await browser.close();
        }
    }

    async testSingleJob(page, jobNumber) {
        const testResult = {
            jobNumber: jobNumber,
            timestamp: new Date().toISOString(),
            success: false,
            score: 0,
            issues: [],
            data: {
                apiCalled: false,
                correctSource: false,
                sceneScrolled: false,
                targetVisible: false
            }
        };
        
        try {
            // Set up API call monitoring
            await page.evaluateOnNewDocument(() => {
                window.testCapture = {
                    apiCalls: [],
                    scrollEvents: []
                };
                
                // Monitor selection manager calls
                if (window.selectionManager && typeof window.selectionManager.selectJobNumber === 'function') {
                    const original = window.selectionManager.selectJobNumber;
                    window.selectionManager.selectJobNumber = function(jobNumber, source) {
                        window.testCapture.apiCalls.push({
                            function: 'selectJobNumber',
                            jobNumber: jobNumber,
                            source: source,
                            timestamp: Date.now()
                        });
                        return original.call(this, jobNumber, source);
                    };
                }
                
                // Monitor scene container scrolling
                const sceneContainer = document.getElementById('scene-container');
                if (sceneContainer) {
                    let lastScrollTop = sceneContainer.scrollTop;
                    const checkScroll = () => {
                        const currentScrollTop = sceneContainer.scrollTop;
                        const delta = Math.abs(currentScrollTop - lastScrollTop);
                        if (delta > 10) {
                            window.testCapture.scrollEvents.push({
                                container: 'scene-container',
                                delta: delta,
                                timestamp: Date.now()
                            });
                            lastScrollTop = currentScrollTop;
                        }
                        setTimeout(checkScroll, 100);
                    };
                    setTimeout(checkScroll, 100);
                }
            });
            
            // Find and click the target rDiv
            const resumeSelector = `.biz-resume-div[data-job-number="${jobNumber}"]`;
            const resumeDiv = await page.$(resumeSelector);
            
            if (!resumeDiv) {
                testResult.issues.push(`Resume div for job ${jobNumber} not found`);
                return testResult;
            }
            
            // Get initial scene scroll position
            const initialScrollTop = await page.evaluate(() => {
                const container = document.getElementById('scene-container');
                return container ? container.scrollTop : 0;
            });
            
            // Click the resume div
            await resumeDiv.click();
            console.log(`   🖱️ Clicked rDiv for job ${jobNumber}`);
            
            // Wait for any animations/scrolling to complete
            await page.waitForTimeout(2000);
            
            // Capture test data
            const capturedData = await page.evaluate(() => window.testCapture || { apiCalls: [], scrollEvents: [] });
            
            // Test 1: API Call Analysis
            const relevantAPICalls = capturedData.apiCalls.filter(call => 
                call.function === 'selectJobNumber' && call.jobNumber === jobNumber
            );
            testResult.data.apiCalled = relevantAPICalls.length > 0;
            
            // Test 2: Source Parameter Analysis
            const hasCorrectSource = relevantAPICalls.some(call => 
                call.source && (call.source.includes('Resume') || call.source.includes('handleBizResumeDivClickEvent'))
            );
            testResult.data.correctSource = hasCorrectSource;
            
            // Test 3: Scene Container Scroll Analysis
            const hasSignificantScroll = capturedData.scrollEvents.some(event => event.delta > 10);
            testResult.data.sceneScrolled = hasSignificantScroll;
            
            // Test 4: Target Visibility Analysis
            const targetVisible = await page.evaluate((jobNumber) => {
                const targetCDiv = document.querySelector(`.biz-card-div[data-job-number="${jobNumber}"]`) ||
                                  document.querySelector(`#biz-card-div-${jobNumber}`) ||
                                  document.querySelector(`#biz-card-div-${jobNumber}-clone`);
                
                if (!targetCDiv) return false;
                
                const rect = targetCDiv.getBoundingClientRect();
                const sceneContainer = document.getElementById('scene-container');
                if (!sceneContainer) return false;
                
                const containerRect = sceneContainer.getBoundingClientRect();
                
                // Check if element is visible in container
                const isVisible = rect.top < containerRect.bottom && 
                                rect.bottom > containerRect.top &&
                                rect.left < containerRect.right && 
                                rect.right > containerRect.left;
                
                if (!isVisible) return false;
                
                // Calculate visibility percentage
                const visibleTop = Math.max(rect.top, containerRect.top);
                const visibleBottom = Math.min(rect.bottom, containerRect.bottom);
                const visibleLeft = Math.max(rect.left, containerRect.left);
                const visibleRight = Math.min(rect.right, containerRect.right);
                
                const visibleArea = (visibleRight - visibleLeft) * (visibleBottom - visibleTop);
                const totalArea = rect.width * rect.height;
                
                const visibilityPercentage = totalArea > 0 ? (visibleArea / totalArea) * 100 : 0;
                return visibilityPercentage > 50;
            }, jobNumber);
            
            testResult.data.targetVisible = targetVisible;
            
            // Calculate overall score
            const tests = [
                testResult.data.apiCalled,
                testResult.data.correctSource,
                testResult.data.sceneScrolled,
                testResult.data.targetVisible
            ];
            
            const passedTests = tests.filter(Boolean).length;
            testResult.score = Math.round((passedTests / tests.length) * 100);
            testResult.success = testResult.score >= 75;
            
            // Record issues
            if (!testResult.data.apiCalled) testResult.issues.push('selectJobNumber API not called');
            if (!testResult.data.correctSource) testResult.issues.push('Incorrect source parameter');
            if (!testResult.data.sceneScrolled) testResult.issues.push('Scene container did not scroll');
            if (!testResult.data.targetVisible) testResult.issues.push('Target cDiv not visible');
            
        } catch (error) {
            testResult.issues.push(`Test execution error: ${error.message}`);
        }
        
        return testResult;
    }

    generateFinalSummary() {
        console.log('\n' + '='.repeat(60));
        console.log('🎯 BIDIRECTIONAL SYNC VALIDATION SUMMARY');
        console.log('='.repeat(60));
        
        const totalTests = this.testResults.length;
        const successfulTests = this.testResults.filter(result => result.success).length;
        const failedTests = totalTests - successfulTests;
        const overallSuccessRate = totalTests > 0 ? Math.round((successfulTests / totalTests) * 100) : 0;
        
        console.log(`📊 OVERALL RESULTS:`);
        console.log(`   🧪 Total Tests: ${totalTests}`);
        console.log(`   ✅ Successful: ${successfulTests}`);
        console.log(`   ❌ Failed: ${failedTests}`);
        console.log(`   📈 Success Rate: ${overallSuccessRate}%`);
        
        console.log(`\n📋 INDIVIDUAL TEST RESULTS:`);
        this.testResults.forEach((result, index) => {
            console.log(`   ${index + 1}. Job ${result.jobNumber}: ${result.success ? '✅' : '❌'} (${result.score}%)`);
            if (result.issues.length > 0) {
                console.log(`      Issues: ${result.issues.join(', ')}`);
            }
        });
        
        console.log(`\n🎯 FINAL DETERMINATION:`);
        if (overallSuccessRate >= 80) {
            console.log(`   🎉 BIDIRECTIONAL SYNC IS WORKING CORRECTLY!`);
            console.log(`   ✅ ${successfulTests}/${totalTests} tests passed (${overallSuccessRate}% success rate)`);
            console.log(`   🔧 rDiv clicks properly trigger cDiv scrolling and visibility`);
        } else if (overallSuccessRate >= 60) {
            console.log(`   ⚠️ BIDIRECTIONAL SYNC HAS MINOR ISSUES`);
            console.log(`   🔶 ${successfulTests}/${totalTests} tests passed (${overallSuccessRate}% success rate)`);
            console.log(`   🔧 Some functionality working but needs improvement`);
        } else {
            console.log(`   ❌ BIDIRECTIONAL SYNC IS NOT WORKING PROPERLY`);
            console.log(`   🔴 Only ${successfulTests}/${totalTests} tests passed (${overallSuccessRate}% success rate)`);
            console.log(`   🔧 Significant issues need to be addressed`);
        }
        
        // Save results
        const summary = {
            timestamp: new Date().toISOString(),
            totalTests: totalTests,
            successfulTests: successfulTests,
            failedTests: failedTests,
            overallSuccessRate: overallSuccessRate,
            determination: overallSuccessRate >= 80 ? 'SUCCESS' : overallSuccessRate >= 60 ? 'PARTIAL' : 'FAILURE',
            individualResults: this.testResults
        };
        
        fs.writeFileSync('bidirectional-sync-validation-results.json', JSON.stringify(summary, null, 2));
        console.log('\n💾 Complete validation results saved to: bidirectional-sync-validation-results.json');
        console.log('='.repeat(60));
    }
}

// Run the validation
const validator = new DirectSyncValidator();
validator.runComprehensiveTest().catch(console.error);