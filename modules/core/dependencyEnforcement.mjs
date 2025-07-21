/**
 * Dependency Enforcement - MANDATORY compliance checker
 * Runs at application startup to ensure ALL components follow dependency rules
 * FAILS THE APPLICATION if violations are found
 */

import { componentScanner } from './componentScanner.mjs';
import { componentEnforcer } from './abstracts/BaseComponent.mjs';
import { initializationManager } from './initializationManager.mjs';

export class DependencyEnforcement {
    constructor() {
        this.enforcementLevel = 'STRICT'; // STRICT, WARN, or DISABLED
        this.isEnforced = false;
    }

    /**
     * MAIN ENFORCEMENT ENTRY POINT
     * Call this at application startup to enforce compliance
     */
    async enforceCompliance(options = {}) {
        const {
            enforcementLevel = 'STRICT',
            projectRoot = '.',
            failOnViolations = true,
            generateReport = true
        } = options;

        this.enforcementLevel = enforcementLevel;

        console.log(`🔒 Starting dependency enforcement (level: ${enforcementLevel})...`);

        try {
            // Step 1: Scan project for component violations
            console.log('📡 Scanning project files...');
            const scanResults = await componentScanner.scanProject(projectRoot);

            // Step 2: Check runtime registration
            console.log('🔍 Checking runtime component registration...');
            await this._checkRuntimeRegistration();

            // Step 3: Generate report if requested
            if (generateReport) {
                const report = componentScanner.generateReport();
                console.log('📋 Compliance report generated');
                
                // Save report to file
                await this._saveReport(report);
            }

            // Step 4: Enforce based on level
            switch (enforcementLevel) {
                case 'STRICT':
                    await this._enforceStrict();
                    break;
                case 'WARN':
                    await this._enforceWarn();
                    break;
                case 'DISABLED':
                    console.log('⚠️ Dependency enforcement DISABLED');
                    break;
                default:
                    throw new Error(`Invalid enforcement level: ${enforcementLevel}`);
            }

            this.isEnforced = true;
            console.log('✅ Dependency enforcement complete');

            return {
                success: true,
                enforcementLevel,
                scanResults,
                report: generateReport ? componentScanner.generateReport() : null
            };

        } catch (error) {
            console.error('❌ Dependency enforcement failed:', error);
            
            if (failOnViolations) {
                throw error;
            }
            
            return {
                success: false,
                error: error.message,
                enforcementLevel
            };
        }
    }

    /**
     * STRICT enforcement - FAIL application if violations found
     */
    async _enforceStrict() {
        console.log('🚨 STRICT enforcement mode - application will FAIL if violations found');
        
        // This will throw if violations exist
        componentScanner.enforceCompliance();
        componentEnforcer.enforceRegistration();
        
        console.log('✅ STRICT enforcement passed - all components compliant');
    }

    /**
     * WARN enforcement - Log warnings but continue
     */
    async _enforceWarn() {
        console.log('⚠️ WARN enforcement mode - logging violations as warnings');
        
        try {
            componentScanner.enforceCompliance();
            componentEnforcer.enforceRegistration();
            console.log('✅ No violations found');
        } catch (error) {
            console.warn('⚠️ COMPLIANCE VIOLATIONS FOUND:', error.message);
            console.warn('⚠️ Application continuing but should be fixed');
        }
    }

    /**
     * Check runtime component registration status
     */
    async _checkRuntimeRegistration() {
        // Wait a bit for components to load
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const registrationReport = componentEnforcer.getRegistrationReport();
        
        console.log(`📊 Runtime registration status:`);
        console.log(`  - Known components: ${registrationReport.knownComponents.length}`);
        console.log(`  - Registered: ${registrationReport.registeredWithManager.length}`);
        console.log(`  - Unregistered: ${registrationReport.unregisteredComponents.length}`);
        
        if (registrationReport.unregisteredComponents.length > 0) {
            console.warn('⚠️ Unregistered components detected:', registrationReport.unregisteredComponents);
        }
    }

    /**
     * Save compliance report to file
     */
    async _saveReport(report) {
        try {
            const fs = await import('fs/promises');
            const reportPath = './compliance-report.md';
            
            await fs.writeFile(reportPath, report);
            console.log(`📄 Compliance report saved to: ${reportPath}`);
        } catch (error) {
            console.warn('⚠️ Could not save compliance report:', error.message);
        }
    }

    /**
     * Add runtime monitoring for new components
     */
    startRuntimeMonitoring() {
        if (this.enforcementLevel === 'DISABLED') return;
        
        console.log('👀 Starting runtime dependency monitoring...');
        
        // Monitor for new component registrations
        const originalRegister = initializationManager.register.bind(initializationManager);
        initializationManager.register = (...args) => {
            const [componentName] = args;
            console.log(`📝 Component registered: ${componentName}`);
            return originalRegister(...args);
        };

        // Monitor for manager usage without registration
        this._monitorManagerUsage();
    }

    /**
     * Monitor manager usage patterns
     */
    _monitorManagerUsage() {
        // Intercept common manager method calls
        const managersToMonitor = ['selectionManager', 'badgeManager'];
        
        managersToMonitor.forEach(managerName => {
            if (typeof window !== 'undefined' && window[managerName]) {
                const manager = window[managerName];
                const originalAddEventListener = manager.addEventListener;
                
                if (originalAddEventListener) {
                    manager.addEventListener = function(...args) {
                        const stack = new Error().stack;
                        const caller = stack.split('\\n')[2]; // Get caller info
                        
                        console.log(`👂 ${managerName}.addEventListener called from: ${caller}`);
                        return originalAddEventListener.apply(this, args);
                    };
                }
            }
        });
    }

    /**
     * Get current enforcement status
     */
    getStatus() {
        return {
            enforced: this.isEnforced,
            level: this.enforcementLevel,
            scanResults: componentScanner.scanResults,
            registrationReport: componentEnforcer.getRegistrationReport()
        };
    }
}

// Global enforcement instance
export const dependencyEnforcement = new DependencyEnforcement();

/**
 * Convenience function to start enforcement at app startup
 * Add this to your main.js or app initialization
 */
export async function startDependencyEnforcement(options = {}) {
    try {
        const result = await dependencyEnforcement.enforceCompliance(options);
        
        // Start runtime monitoring
        dependencyEnforcement.startRuntimeMonitoring();
        
        return result;
    } catch (error) {
        console.error(`
❌❌❌ DEPENDENCY ENFORCEMENT FAILED ❌❌❌

The application has been TERMINATED due to dependency management violations.

${error.message}

🔧 TO FIX:
1. Review the compliance report (compliance-report.md)
2. Fix all listed violations
3. Ensure all components extend BaseComponent or use BaseVueComponentMixin
4. Define proper dependencies for all components

The application will NOT start until these issues are resolved.
        `);
        
        // Exit the application in strict mode
        if (options.enforcementLevel !== 'WARN') {
            process.exit(1);
        }
        
        throw error;
    }
}

// Auto-start enforcement in development mode
if (process.env.NODE_ENV === 'development') {
    // Delay to allow modules to load
    setTimeout(async () => {
        try {
            await startDependencyEnforcement({
                enforcementLevel: 'WARN', // Use WARN in dev, STRICT in prod
                generateReport: true
            });
        } catch (error) {
            console.warn('Development mode: continuing despite enforcement failures');
        }
    }, 2000);
}