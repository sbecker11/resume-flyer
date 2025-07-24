/**
 * Dependency Checker - Validates runtime dependencies for components
 * Prevents silent failures when components use uninitialized managers
 */

import { selectionManager } from './selectionManager.mjs';
import { badgeManager } from './badgeManager.mjs';
import { initializationManager } from './initializationManager.mjs';

class DependencyChecker {
    constructor() {
        this.validators = new Map();
        this.setupValidators();
    }

    setupValidators() {
        // Define dependency validators
        this.validators.set('selectionManager', () => {
            if (!selectionManager) return { valid: false, error: 'selectionManager not imported' };
            if (typeof selectionManager.selectJobNumber !== 'function') {
                return { valid: false, error: 'selectionManager.selectJobNumber not available' };
            }
            return { valid: true };
        });

        this.validators.set('badgeManager', () => {
            if (!badgeManager) return { valid: false, error: 'badgeManager not imported' };
            if (typeof badgeManager.isBadgesVisible !== 'function') {
                return { valid: false, error: 'badgeManager.isBadgesVisible not available' };
            }
            return { valid: true };
        });

        this.validators.set('initializationManager', () => {
            if (!initializationManager) return { valid: false, error: 'initializationManager not imported' };
            if (!initializationManager.isComponentReady) {
                return { valid: false, error: 'initializationManager not fully initialized' };
            }
            return { valid: true };
        });

        this.validators.set('DOM', () => {
            if (typeof document === 'undefined') {
                return { valid: false, error: 'DOM not available (server-side?)' };
            }
            const sceneContainer = document.getElementById('scene-container');
            if (!sceneContainer) {
                return { valid: false, error: 'scene-container not found in DOM' };
            }
            return { valid: true };
        });
    }

    /**
     * Check if specific dependencies are ready
     * @param {string[]} dependencies - Array of dependency names to check
     * @param {string} componentName - Name of component requesting check
     * @returns {Object} Validation result with details
     */
    checkDependencies(dependencies, componentName = 'Unknown') {
        const results = {
            valid: true,
            errors: [],
            warnings: [],
            componentName
        };

        for (const dep of dependencies) {
            const validator = this.validators.get(dep);
            if (!validator) {
                results.warnings.push(`No validator defined for dependency: ${dep}`);
                continue;
            }

            const result = validator();
            if (!result.valid) {
                results.valid = false;
                results.errors.push(`${dep}: ${result.error}`);
            }
        }

        return results;
    }

    /**
     * Require dependencies - throws error if not ready
     * Use this in component initialization to fail fast
     * @param {string[]} dependencies 
     * @param {string} componentName 
     */
    requireDependencies(dependencies, componentName = 'Unknown') {
        const result = this.checkDependencies(dependencies, componentName);
        
        if (!result.valid) {
            const errorMsg = `[${componentName}] Missing required dependencies:\\n${result.errors.join('\\n')}`;
            console.error(errorMsg);
            throw new Error(errorMsg);
        }

        if (result.warnings.length > 0) {
            console.warn(`[${componentName}] Dependency warnings:\\n${result.warnings.join('\\n')}`);
        }

        window.CONSOLE_LOG_IGNORE(`[${componentName}] ✅ All dependencies validated successfully`);
        return true;
    }

    /**
     * Wait for dependencies to become ready (with timeout)
     * Use this for graceful retry logic
     * @param {string[]} dependencies 
     * @param {string} componentName 
     * @param {number} timeoutMs 
     * @returns {Promise<boolean>}
     */
    async waitForDependencies(dependencies, componentName = 'Unknown', timeoutMs = 5000) {
        const startTime = Date.now();
        
        while (Date.now() - startTime < timeoutMs) {
            const result = this.checkDependencies(dependencies, componentName);
            
            if (result.valid) {
                window.CONSOLE_LOG_IGNORE(`[${componentName}] ✅ Dependencies ready after ${Date.now() - startTime}ms`);
                return true;
            }

            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        const finalResult = this.checkDependencies(dependencies, componentName);
        console.error(`[${componentName}] ❌ Dependencies not ready after ${timeoutMs}ms timeout:`);
        finalResult.errors.forEach(error => console.error(`  - ${error}`));
        
        return false;
    }

    /**
     * Register a component's dependencies with validation
     * This enforces proper dependency declaration
     * @param {string} componentName 
     * @param {string[]} dependencies 
     * @param {Function} initFunction 
     * @param {Object} options 
     */
    registerComponent(componentName, dependencies, initFunction, options = {}) {
        // Validate dependencies before registration
        const preCheck = this.checkDependencies(dependencies, componentName);
        if (preCheck.warnings.length > 0) {
            console.warn(`[${componentName}] Pre-registration warnings:`, preCheck.warnings);
        }

        // Wrap init function with dependency validation
        const wrappedInit = async () => {
            // Validating dependencies
            
            // Wait for dependencies to be ready
            const ready = await this.waitForDependencies(dependencies, componentName, 10000);
            if (!ready) {
                throw new Error(`[${componentName}] Dependencies not ready for initialization`);
            }

            // Run the actual initialization
            // Dependencies validated, starting initialization
            return await initFunction();
        };

        // Register with InitializationManager
        initializationManager.register(componentName, wrappedInit, dependencies, options);
        window.CONSOLE_LOG_IGNORE(`[${componentName}] Registered with dependency validation:`, dependencies);
    }
}

// Export singleton instance
export const dependencyChecker = new DependencyChecker();

// Export convenience functions
export const checkDependencies = dependencyChecker.checkDependencies.bind(dependencyChecker);
export const requireDependencies = dependencyChecker.requireDependencies.bind(dependencyChecker);
export const waitForDependencies = dependencyChecker.waitForDependencies.bind(dependencyChecker);
export const registerComponent = dependencyChecker.registerComponent.bind(dependencyChecker);