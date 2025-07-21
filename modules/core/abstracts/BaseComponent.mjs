/**
 * Abstract Base Component - ENFORCES dependency management
 * All components MUST extend this and override dependency methods
 * DEFAULT BEHAVIOR: FAIL with clear error messages
 */

import { initializationManager } from '../initializationManager.mjs';
import { dependencyChecker } from '../dependencyChecker.mjs';

export class BaseComponent {
    constructor(name) {
        if (this.constructor === BaseComponent) {
            throw new Error('BaseComponent is abstract and cannot be instantiated directly');
        }
        
        this.componentName = name || this.constructor.name;
        this.isInitialized = false;
        this.dependencies = [];
        
        // Force subclass to define dependencies
        this._validateAbstractMethods();
        
        // Auto-register with InitializationManager
        this._autoRegister();
    }

    /**
     * ABSTRACT METHOD - MUST BE OVERRIDDEN
     * Define component dependencies - FAILS if not overridden
     */
    getDependencies() {
        throw new Error(`❌ FATAL: ${this.componentName} MUST override getDependencies() method.
        
        Example:
        getDependencies() {
            return ['selectionManager', 'badgeManager', 'DOM'];
        }
        
        Component will NOT work until this is fixed.`);
    }

    /**
     * ABSTRACT METHOD - MUST BE OVERRIDDEN  
     * Component initialization logic - FAILS if not overridden
     */
    async initialize() {
        throw new Error(`❌ FATAL: ${this.componentName} MUST override initialize() method.
        
        Example:
        async initialize() {
            this.setupEventListeners();
            this.createElements();
            // console.log('${this.componentName} initialized');
        }
        
        Component will NOT work until this is fixed.`);
    }

    /**
     * ABSTRACT METHOD - MUST BE OVERRIDDEN
     * Cleanup logic - FAILS if not overridden
     */
    destroy() {
        throw new Error(`❌ FATAL: ${this.componentName} MUST override destroy() method.
        
        Example:
        destroy() {
            this.removeEventListeners();
            this.cleanup();
            this.isInitialized = false;
        }
        
        Component will NOT work until this is fixed.`);
    }

    /**
     * Optional: Component-specific validation
     * Override to add custom validation logic
     */
    validateComponent() {
        // Default: no additional validation
        return { valid: true, errors: [] };
    }

    // =============================================================
    // CONCRETE METHODS - DO NOT OVERRIDE (use composition instead)
    // =============================================================

    /**
     * Validates that subclass has overridden required abstract methods
     * PRIVATE - called in constructor
     */
    _validateAbstractMethods() {
        const requiredMethods = ['getDependencies', 'initialize', 'destroy'];
        const errors = [];

        for (const method of requiredMethods) {
            // Check if method exists on prototype and is not the base class version
            const methodExists = this[method] && this[method] !== BaseComponent.prototype[method];
            if (!methodExists) {
                errors.push(`Missing required method: ${method}()`);
            }
        }

        if (errors.length > 0) {
            throw new Error(`❌ FATAL: ${this.componentName} is missing required abstract methods:
            
${errors.map(err => `  - ${err}`).join('\\n')}

All components MUST extend BaseComponent and override these methods.
This is MANDATORY for proper dependency management.`);
        }
    }

    /**
     * Auto-registration with InitializationManager
     * PRIVATE - called in constructor
     */
    _autoRegister() {
        try {
            // Get dependencies from subclass
            this.dependencies = this.getDependencies();
            
            // Create wrapped initialization function
            const wrappedInit = async () => {
                // console.log(`🔍 [${this.componentName}] Validating dependencies...`);
                
                // Validate dependencies exist
                const validation = dependencyChecker.checkDependencies(this.dependencies, this.componentName);
                if (!validation.valid) {
                    throw new Error(`❌ [${this.componentName}] Dependency validation failed:\\n${validation.errors.join('\\n')}`);
                }

                // Run component-specific validation
                const componentValidation = this.validateComponent();
                if (!componentValidation.valid) {
                    throw new Error(`❌ [${this.componentName}] Component validation failed:\\n${componentValidation.errors.join('\\n')}`);
                }

                // Call the actual initialize method
                // console.log(`🚀 [${this.componentName}] Starting initialization...`);
                await this.initialize();
                
                this.isInitialized = true;
                // console.log(`✅ [${this.componentName}] Initialization complete`);
                
                return this;
            };

            // Register with InitializationManager
            initializationManager.register(
                this.componentName,
                wrappedInit,
                this.dependencies,
                { priority: this.getPriority?.() || 'medium' }
            );

            // console.log(`📋 [${this.componentName}] Auto-registered with dependencies:`, this.dependencies);

        } catch (error) {
            console.error(`❌ [${this.componentName}] Failed to auto-register:`, error);
            throw error;
        }
    }

    /**
     * Check if component is properly initialized
     */
    checkInitialized() {
        if (!this.isInitialized) {
            throw new Error(`❌ [${this.componentName}] Component not initialized. Call await component.waitForReady() first.`);
        }
        return true;
    }

    /**
     * Wait for component to be ready
     */
    async waitForReady(timeoutMs = 10000) {
        if (this.isInitialized) return true;
        
        return await initializationManager.waitForComponent(this.componentName, timeoutMs);
    }

    /**
     * Get component status for debugging
     */
    getStatus() {
        return {
            name: this.componentName,
            initialized: this.isInitialized,
            dependencies: this.dependencies,
            registeredWithManager: initializationManager.isComponentRegistered?.(this.componentName) || 'unknown'
        };
    }
}

/**
 * Abstract Vue Component Mixin - For Vue components
 * Provides similar enforcement for Vue components
 */
export const BaseVueComponentMixin = {
    created() {
        this._componentName = this.$options.name || 'UnnamedVueComponent';
        // console.log(`🔍 [${this._componentName}] Vue component created - checking dependencies...`);
        
        // Check if component has defined dependencies
        if (!this.getComponentDependencies) {
            throw new Error(`❌ FATAL: Vue component ${this._componentName} MUST implement getComponentDependencies() method.
            
            Example:
            methods: {
                getComponentDependencies() {
                    return ['selectionManager', 'badgeManager'];
                }
            }
            
            Component will NOT work until this is fixed.`);
        }

        // Check if component has defined initialization
        if (!this.initializeWithDependencies) {
            throw new Error(`❌ FATAL: Vue component ${this._componentName} MUST implement initializeWithDependencies() method.
            
            Example:
            methods: {
                async initializeWithDependencies() {
                    this.setupEventListeners();
                    this.createElements();
                }
            }
            
            Component will NOT work until this is fixed.`);
        }
    },

    async mounted() {
        try {
            const dependencies = this.getComponentDependencies();
            // console.log(`📋 [${this._componentName}] Vue component dependencies:`, dependencies);
            
            // Validate dependencies
            const validation = dependencyChecker.checkDependencies(dependencies, this._componentName);
            if (!validation.valid) {
                throw new Error(`❌ [${this._componentName}] Vue component dependency validation failed:\\n${validation.errors.join('\\n')}`);
            }

            // Initialize with validated dependencies
            await this.initializeWithDependencies();
            // console.log(`✅ [${this._componentName}] Vue component initialization complete`);

        } catch (error) {
            console.error(`❌ [${this._componentName}] Vue component initialization failed:`, error);
            throw error;
        }
    },

    beforeUnmount() {
        if (this.cleanupDependencies) {
            this.cleanupDependencies();
        }
    }
};

/**
 * Component Registration Enforcer
 * Scans for components that should be using BaseComponent but aren't
 */
export class ComponentRegistrationEnforcer {
    constructor() {
        this.knownComponents = new Set();
        this.unregisteredComponents = new Set();
        this.startMonitoring();
    }

    /**
     * Monitor for component instantiation
     */
    startMonitoring() {
        // Override console.log to catch component creation patterns
        const originalLog = console.log;
        console.log = (...args) => {
            const message = args.join(' ');
            
            // Look for component patterns
            if (message.includes('Component mounted') || message.includes('component created')) {
                this.detectPossibleComponent(message);
            }
            
            return originalLog.apply(console, args);
        };

        // Monitor DOM for Vue component mounting
        if (typeof window !== 'undefined') {
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === 1) { // Element node
                            this.scanElementForComponents(node);
                        }
                    });
                });
            });

            observer.observe(document.body, { childList: true, subtree: true });
        }
    }

    detectPossibleComponent(message) {
        // Extract component name from log messages
        const componentMatch = message.match(/\\[(\\w+)\\]|Component (\\w+)|component (\\w+)/i);
        if (componentMatch) {
            const componentName = componentMatch[1] || componentMatch[2] || componentMatch[3];
            this.knownComponents.add(componentName);
            
            // Check if registered with InitializationManager
            if (!initializationManager.isComponentRegistered?.(componentName)) {
                this.unregisteredComponents.add(componentName);
                console.warn(`⚠️  Component ${componentName} appears to be unregistered with InitializationManager`);
            }
        }
    }

    scanElementForComponents(element) {
        // Look for Vue component indicators
        if (element.__vue__ || element._vnode) {
            const componentName = element.__vue__?.$options?.name || 'UnknownVueComponent';
            this.knownComponents.add(componentName);
        }
    }

    /**
     * Get report of component registration status
     */
    getRegistrationReport() {
        return {
            knownComponents: Array.from(this.knownComponents),
            unregisteredComponents: Array.from(this.unregisteredComponents),
            registeredWithManager: Array.from(this.knownComponents).filter(name => 
                initializationManager.isComponentRegistered?.(name)
            )
        };
    }

    /**
     * Fail application if unregistered components found
     */
    enforceRegistration() {
        if (this.unregisteredComponents.size > 0) {
            const unregistered = Array.from(this.unregisteredComponents);
            throw new Error(`❌ FATAL: Found unregistered components that MUST extend BaseComponent or use BaseVueComponentMixin:

${unregistered.map(name => `  - ${name}`).join('\\n')}

ALL components using managers MUST register with InitializationManager.
This is MANDATORY for proper dependency management.

Fix by:
1. For class components: extend BaseComponent
2. For Vue components: add BaseVueComponentMixin
3. Define getDependencies() method
4. Define initialize() method`);
        }
    }
}

// Global instance
export const componentEnforcer = new ComponentRegistrationEnforcer();