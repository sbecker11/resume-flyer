/**
 * Runtime Dependency Enforcement - BROWSER COMPATIBLE
 * Checks component dependencies at runtime without file system access
 * FAILS APPLICATION if violations detected
 */

import { initializationManager } from './initializationManager.mjs';

export class RuntimeEnforcement {
    constructor() {
        this.componentTracker = new Map();
        this.managerUsageTracker = new Map();
        this.violations = [];
        this.isMonitoring = false;
    }

    /**
     * Start runtime enforcement - intercept manager usage
     */
    startEnforcement() {
        console.error('🔒 Starting runtime dependency enforcement...');
        
        this.isMonitoring = true;
        
        // Track imports and usage patterns
        this._interceptManagerUsage();
        this._trackComponentCreation();
        
        // Give components time to load, then validate
        setTimeout(() => {
            this._validateAllComponents();
        }, 1000);
    }

    /**
     * Intercept manager usage to detect unregistered components
     */
    _interceptManagerUsage() {
        // Track selectionManager usage
        this._interceptManager('selectionManager', () => {
            // Try to get selectionManager from window or imports
            return window.selectionManager || this._findManagerInModules('selectionManager');
        });

        // Track badgeManager usage  
        this._interceptManager('badgeManager', () => {
            return window.badgeManager || this._findManagerInModules('badgeManager');
        });
    }

    /**
     * Intercept a specific manager's methods
     */
    _interceptManager(managerName, managerGetter) {
        try {
            const manager = managerGetter();
            if (!manager) return;

            // Intercept common methods
            const methodsToIntercept = ['addEventListener', 'selectJobNumber', 'getSelectedJobNumber', 'isBadgesVisible'];
            
            methodsToIntercept.forEach(methodName => {
                if (typeof manager[methodName] === 'function') {
                    const originalMethod = manager[methodName];
                    
                    manager[methodName] = (...args) => {
                        // Track which component is using this manager
                        const stack = new Error().stack;
                        const caller = this._extractCallerInfo(stack);
                        
                        this._recordManagerUsage(managerName, methodName, caller);
                        
                        return originalMethod.apply(manager, args);
                    };
                }
            });
            
            console.log(`🔍 Intercepted ${managerName} methods`);
        } catch (error) {
            console.warn(`Could not intercept ${managerName}:`, error.message);
        }
    }

    /**
     * Try to find manager in loaded modules
     */
    _findManagerInModules(managerName) {
        // Check if manager is available globally
        if (typeof window !== 'undefined') {
            // Check various possible locations
            const possiblePaths = [
                window[managerName],
                window.__VITE_PRELOAD__?.[managerName],
                // Check if modules are exposed
                window.modules?.[managerName]
            ];
            
            for (const path of possiblePaths) {
                if (path && typeof path === 'object') {
                    return path;
                }
            }
        }
        return null;
    }

    /**
     * Extract caller information from stack trace
     */
    _extractCallerInfo(stack) {
        const lines = stack.split('\\n');
        
        // Look for useful caller info (skip our own frames)
        for (let i = 2; i < lines.length; i++) {
            const line = lines[i];
            
            // Skip internal browser/vite frames
            if (line.includes('__vite') || line.includes('chrome-extension') || line.includes('webpack')) {
                continue;
            }
            
            // Extract file info
            const match = line.match(/at\\s+.*?\\s+\\((.*?):(\\d+):(\\d+)\\)|at\\s+(.*?):(\\d+):(\\d+)/);
            if (match) {
                const file = match[1] || match[4];
                const lineNum = match[2] || match[5];
                
                if (file && !file.includes('node_modules')) {
                    return {
                        file: file.split('/').pop(), // Get just filename
                        line: lineNum,
                        fullPath: file
                    };
                }
            }
        }
        
        return { file: 'unknown', line: '?', fullPath: 'unknown' };
    }

    /**
     * Record manager usage by components
     */
    _recordManagerUsage(managerName, methodName, caller) {
        const key = `${caller.file}:${caller.line}`;
        
        if (!this.managerUsageTracker.has(key)) {
            this.managerUsageTracker.set(key, {
                file: caller.file,
                fullPath: caller.fullPath,
                managers: new Set(),
                methods: new Map(),
                isRegistered: false
            });
        }
        
        const usage = this.managerUsageTracker.get(key);
        usage.managers.add(managerName);
        
        if (!usage.methods.has(managerName)) {
            usage.methods.set(managerName, new Set());
        }
        usage.methods.get(managerName).add(methodName);
        
        console.log(`📱 ${caller.file} used ${managerName}.${methodName}`);
    }

    /**
     * Track component creation patterns
     */
    _trackComponentCreation() {
        // Override console methods to catch component logs
        const originalConsoleLog = console.log;
        const originalConsoleError = console.error;
        
        const componentLogPattern = /\\[(\\w+)\\]|Component (\\w+)|component (\\w+)/i;
        
        // Intercept console.log
        console.log = (...args) => {
            const message = args.join(' ');
            const match = message.match(componentLogPattern);
            
            if (match) {
                const componentName = match[1] || match[2] || match[3];
                this._recordComponent(componentName);
            }
            
            return originalConsoleLog.apply(console, args);
        };
        
        // Intercept console.error  
        console.error = (...args) => {
            const message = args.join(' ');
            const match = message.match(componentLogPattern);
            
            if (match) {
                const componentName = match[1] || match[2] || match[3];
                this._recordComponent(componentName);
            }
            
            return originalConsoleError.apply(console, args);
        };
    }

    /**
     * Record component existence
     */
    _recordComponent(componentName) {
        if (!this.componentTracker.has(componentName)) {
            const isRegistered = initializationManager.isComponentRegistered?.(componentName) || false;
            
            this.componentTracker.set(componentName, {
                name: componentName,
                registered: isRegistered,
                detected: true
            });
            
            console.log(`📝 Detected component: ${componentName} (registered: ${isRegistered})`);
        }
    }

    /**
     * Validate all detected components and usage
     */
    _validateAllComponents() {
        console.error('🔍 Validating component dependencies...');
        
        this.violations = [];
        
        // Check each manager usage location
        for (const [key, usage] of this.managerUsageTracker) {
            const violations = this._checkUsageViolations(usage);
            this.violations.push(...violations);
        }
        
        // Check unregistered components
        for (const [name, component] of this.componentTracker) {
            if (!component.registered) {
                this.violations.push({
                    type: 'UNREGISTERED_COMPONENT',
                    component: name,
                    violation: `Component ${name} is not registered with InitializationManager`,
                    fix: 'Register component or extend BaseComponent'
                });
            }
        }
        
        // Report results
        this._reportResults();
    }

    /**
     * Check for violations in manager usage
     */
    _checkUsageViolations(usage) {
        const violations = [];
        const componentName = usage.file.replace(/\\.(mjs|js|vue)$/, '');
        
        // Check if component using managers is registered
        const isRegistered = this.componentTracker.get(componentName)?.registered || 
                           initializationManager.isComponentRegistered?.(componentName) || 
                           false;
        
        if (!isRegistered && usage.managers.size > 0) {
            violations.push({
                type: 'UNREGISTERED_MANAGER_USAGE',
                file: usage.file,
                fullPath: usage.fullPath,
                component: componentName,
                managers: Array.from(usage.managers),
                violation: `${usage.file} uses managers [${Array.from(usage.managers).join(', ')}] but is not registered with InitializationManager`,
                fix: 'Register with InitializationManager or extend BaseComponent'
            });
        }
        
        return violations;
    }

    /**
     * Report validation results
     */
    _reportResults() {
        console.error(`📊 Runtime enforcement results:`);
        console.error(`  - Components detected: ${this.componentTracker.size}`);
        console.error(`  - Manager usage locations: ${this.managerUsageTracker.size}`);
        console.error(`  - Violations found: ${this.violations.length}`);
        
        if (this.violations.length > 0) {
            console.error('❌ DEPENDENCY VIOLATIONS DETECTED:');
            
            this.violations.forEach((violation, index) => {
                console.error(`\\n${index + 1}. ${violation.type}`);
                console.error(`   File: ${violation.file || violation.component}`);
                console.error(`   Issue: ${violation.violation}`);
                console.error(`   Fix: ${violation.fix}`);
                
                if (violation.managers) {
                    console.error(`   Managers used: ${violation.managers.join(', ')}`);
                }
            });
            
            // FAIL THE APPLICATION
            const errorMessage = `❌ FATAL: Runtime dependency enforcement detected ${this.violations.length} violations.

${this.violations.map(v => `- ${v.file}: ${v.violation}`).join('\\n')}

ALL components using managers MUST:
1. Register with InitializationManager 
2. Extend BaseComponent (for classes)
3. Use BaseVueComponentMixin (for Vue components)
4. Define proper dependencies

The application has been TERMINATED.`;

            throw new Error(errorMessage);
        }
        
        console.error('✅ No dependency violations found');
    }

    /**
     * Get current status for debugging
     */
    getStatus() {
        return {
            isMonitoring: this.isMonitoring,
            components: Object.fromEntries(this.componentTracker),
            managerUsage: Object.fromEntries(this.managerUsageTracker),
            violations: this.violations
        };
    }
}

// Global enforcement instance
export const runtimeEnforcement = new RuntimeEnforcement();

/**
 * Start runtime enforcement (browser-safe version)
 */
export function startRuntimeEnforcement() {
    console.error('🚀 Starting browser-compatible dependency enforcement...');
    
    try {
        runtimeEnforcement.startEnforcement();
        
        // Expose for debugging
        if (typeof window !== 'undefined') {
            window.__dependencyEnforcement = runtimeEnforcement;
        }
        
    } catch (error) {
        console.error('❌ Runtime enforcement failed:', error);
        throw error;
    }
}