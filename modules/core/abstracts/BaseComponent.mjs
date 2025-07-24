/**
 * Abstract Base Component - ENFORCES dependency management
 * All components MUST extend this and override dependency methods
 * DEFAULT BEHAVIOR: FAIL with clear error messages
 */

import { initializationManager } from '../initializationManager.mjs';
// import { dependencyChecker } from '../dependencyChecker.mjs'; // Removed - functionality moved inline
import { importParser } from '../importParser.mjs';

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
        
        // Auto-register with InitializationManager (synchronous registration, async init)
        this._registerSync();
    }

    /**
     * OPTIONAL METHOD - Get component dependencies
     * If not overridden, dependencies will be auto-discovered from imports
     */
    getDependencies() {
        // Return null to indicate auto-discovery should be used
        return null;
    }

    /**
     * ABSTRACT METHOD - MUST BE OVERRIDDEN  
     * Component initialization logic with dependency injection - FAILS if not overridden
     * @param {Object} dependencies - Map of dependency names to component instances
     */
    async initialize(dependencies = {}) {
        throw new Error(`❌ FATAL: ${this.componentName} MUST override initialize(dependencies) method.
        
        Example:
        async initialize(dependencies) {
            // Access dependencies directly from parameter
            this.stateManager = dependencies.StateManager;
            this.selectionManager = dependencies.SelectionManager;
            
            this.setupEventListeners();
            this.createElements();
            // window.CONSOLE_LOG_IGNORE('${this.componentName} initialized');
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
     * Get the file path of the component for import analysis
     * @private
     */
    _getComponentFilePath() {
        try {
            // Use stack trace to determine the file path
            const stack = new Error().stack;
            const stackLines = stack.split('\n');
            
            // Look for the first line that's not this BaseComponent file
            for (const line of stackLines) {
                if (line.includes('.mjs') || line.includes('.vue')) {
                    // Extract path from stack trace
                    const match = line.match(/https?:\/\/[^\/]+(\/.+?\.(mjs|vue|js))/);
                    if (match) {
                        return match[1]; // Return the path part
                    }
                }
            }
            
            // Fallback: try to construct path from component name
            const camelCase = this.componentName.charAt(0).toLowerCase() + this.componentName.slice(1);
            return `/modules/core/${camelCase}.mjs`; // Default guess
            
        } catch (error) {
            console.warn(`[BaseComponent] Could not determine file path for ${this.componentName}:`, error);
            return null;
        }
    }

    /**
     * Validates that subclass has overridden required abstract methods
     * PRIVATE - called in constructor
     */
    _validateAbstractMethods() {
        const requiredMethods = ['initialize', 'destroy']; // getDependencies is now optional
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
     * Parse dependencies from the initialize function signature
     * @returns {Array<string>} Array of dependency names
     * @private
     */
    _parseDependenciesFromSignature() {
        if (!this.initialize || typeof this.initialize !== 'function') {
            return [];
        }

        const funcStr = this.initialize.toString();
        
        // Match function parameters - handles various formats:
        // async initialize(dependencies)
        // async initialize({ VueDomManager, SceneContainer })
        // initialize(dependencies = {})
        const paramMatch = funcStr.match(/(?:async\s+)?initialize\s*\(\s*([^)]*)\s*\)/);
        
        if (!paramMatch || !paramMatch[1].trim()) {
            return []; // No parameters
        }
        
        const paramStr = paramMatch[1].trim();
        
        // Handle destructured parameters: { VueDomManager, SceneContainer, BadgeManager }
        const destructureMatch = paramStr.match(/\{\s*([^}]+)\s*\}/);
        if (destructureMatch) {
            const params = destructureMatch[1]
                .split(',')
                .map(p => p.trim())
                .filter(p => p && !p.includes('=')) // Skip default values
                .map(p => p.split(':')[0].trim()); // Handle { VueDomManager: vm } syntax
            
            window.CONSOLE_LOG_IGNORE(`[BaseComponent] ${this.componentName} parsed destructured dependencies:`, params);
            return params;
        }
        
        // Handle single parameter name (assumes it's a dependencies object)
        const singleParam = paramStr.split('=')[0].trim(); // Remove default values
        if (singleParam && singleParam !== 'dependencies') {
            window.CONSOLE_LOG_IGNORE(`[BaseComponent] ${this.componentName} single parameter '${singleParam}' found - assuming no dependencies`);
            return [];
        }
        
        // If parameter is named 'dependencies', can't infer specific deps from signature
        window.CONSOLE_LOG_IGNORE(`[BaseComponent] ${this.componentName} generic 'dependencies' parameter found - no signature parsing possible`);
        return [];
    }

    /**
     * Check if initialize function uses destructured parameters
     * @returns {boolean} True if uses destructuring
     * @private
     */
    _usesDestructuredParameters() {
        if (!this.initialize || typeof this.initialize !== 'function') {
            return false;
        }

        const funcStr = this.initialize.toString();
        const paramMatch = funcStr.match(/(?:async\s+)?initialize\s*\(\s*([^)]*)\s*\)/);
        
        if (!paramMatch || !paramMatch[1].trim()) {
            return false;
        }
        
        const paramStr = paramMatch[1].trim();
        return /\{\s*[^}]+\s*\}/.test(paramStr); // Has destructuring pattern
    }

    /**
     * Synchronous registration with InitializationManager
     * PRIVATE - called in constructor
     */
    _registerSync() {
        try {
            // Parse dependencies from initialize function signature first
            const signatureDependencies = this._parseDependenciesFromSignature();
            
            if (signatureDependencies.length > 0) {
                window.CONSOLE_LOG_IGNORE(`[BaseComponent] ${this.componentName} parsed dependencies from signature:`, signatureDependencies);
                this.dependencies = signatureDependencies;
            } else {
                // Fall back to getDependencies method
                const manualDependencies = this.getDependencies();
                
                if (manualDependencies === null) {
                    console.warn(`[BaseComponent] ${this.componentName} requested auto-discovery, using empty dependencies for now`);
                    this.dependencies = [];
                } else {
                    this.dependencies = manualDependencies;
                }
            }
            
            // Register synchronously with InitializationManager
            this._registerWithManager();
            
        } catch (error) {
            console.error(`[BaseComponent] ${this.componentName} failed to register:`, error);
            throw error;
        }
    }

    /**
     * Register with InitializationManager (synchronous)
     * PRIVATE - called from _registerSync
     */
    _registerWithManager() {
        // Create wrapped initialization function
        const wrappedInit = async (dependenciesMap = {}) => {
            window.CONSOLE_LOG_IGNORE(`🔍 [${this.componentName}] Starting initialization with dependencies:`, Object.keys(dependenciesMap));
            
            // Simple dependency validation - just check if they're strings
            for (const dep of this.dependencies) {
                if (typeof dep !== 'string' || dep.trim().length === 0) {
                    throw new Error(`❌ [${this.componentName}] Invalid dependency: '${dep}' must be a non-empty string`);
                }
            }

            // Run component-specific validation
            const componentValidation = this.validateComponent();
            if (!componentValidation.valid) {
                throw new Error(`❌ [${this.componentName}] Component validation failed:\\n${componentValidation.errors.join('\\n')}`);
            }

            // Call the actual initialize method with dependency injection
            window.CONSOLE_LOG_IGNORE(`🚀 [${this.componentName}] Starting initialization...`);
            
            // Check if initialize function uses destructured parameters
            const usesDestructuring = this._usesDestructuredParameters();
            
            if (usesDestructuring) {
                // Call with destructured parameters: initialize({ VueDomManager, SceneContainer })
                await this.initialize(dependenciesMap);
            } else {
                // Call with dependencies object: initialize(dependencies)
                await this.initialize(dependenciesMap);
            }
            
            this.isInitialized = true;
            
            // Register this component instance in the central registry for service lookup
            initializationManager.registerComponentInstance(this.componentName, this);
            // window.CONSOLE_LOG_IGNORE(`✅ [${this.componentName}] Registered in service locator registry`);
            
            window.CONSOLE_LOG_IGNORE(`✅ [${this.componentName}] Initialization complete`);
            
            return this;
        };

        // Register with InitializationManager (this must be synchronous)
        // We'll use a promise-based approach but register immediately
        initializationManager.registerSync(
            this.componentName,
            wrappedInit,
            this.dependencies,
            { priority: this.getPriority?.() || 'medium' }
        );
    }

    /**
     * Auto-registration with InitializationManager (async version - kept for compatibility)
     * PRIVATE - called in constructor
     */
    async _autoRegister() {
        try {
            // Get dependencies - either manual or auto-discovered
            const manualDependencies = this.getDependencies();
            
            if (manualDependencies === null) {
                // Auto-discover dependencies from imports
                // First, register this component's file path for analysis
                const filePath = this._getComponentFilePath();
                if (filePath) {
                    importParser.registerComponentPath(this.componentName, filePath);
                    this.dependencies = await importParser.getDependencies(this.componentName);
                } else {
                    console.warn(`[BaseComponent] Could not determine file path for ${this.componentName}, using empty dependencies`);
                    this.dependencies = [];
                }
            } else {
                // Use manually defined dependencies
                this.dependencies = manualDependencies;
                // window.CONSOLE_LOG_IGNORE(`[BaseComponent] ${this.componentName} using manual dependencies:`, this.dependencies);
            }
            
            // Create wrapped initialization function
            const wrappedInit = async (dependenciesMap = {}) => {
                // window.CONSOLE_LOG_IGNORE(`🔍 [${this.componentName}] Validating dependencies...`);
                
                // Simple dependency validation - just check if they're strings
                for (const dep of this.dependencies) {
                    if (typeof dep !== 'string' || dep.trim().length === 0) {
                        throw new Error(`❌ [${this.componentName}] Invalid dependency: '${dep}' must be a non-empty string`);
                    }
                }

                // Run component-specific validation
                const componentValidation = this.validateComponent();
                if (!componentValidation.valid) {
                    throw new Error(`❌ [${this.componentName}] Component validation failed:\\n${componentValidation.errors.join('\\n')}`);
                }

                // Call the actual initialize method with dependency injection
                // window.CONSOLE_LOG_IGNORE(`🚀 [${this.componentName}] Starting initialization...`);
                await this.initialize(dependenciesMap);
                
                this.isInitialized = true;
                
                // Register this component instance in the central registry for service lookup
                initializationManager.registerComponentInstance(this.componentName, this);
                // window.CONSOLE_LOG_IGNORE(`✅ [${this.componentName}] Registered in service locator registry`);
                
                // window.CONSOLE_LOG_IGNORE(`✅ [${this.componentName}] Initialization complete`);
                
                return this;
            };

            // Register with InitializationManager and wait for it to complete
            await initializationManager.register(
                this.componentName,
                wrappedInit,
                this.dependencies,
                { priority: this.getPriority?.() || 'medium' }
            );
            
            // Immediately try to initialize if no dependencies
            if (this.dependencies.length === 0) {
                // No dependencies, can initialize immediately
                await initializationManager.checkDependencies();
            }

            // window.CONSOLE_LOG_IGNORE(`📋 [${this.componentName}] Auto-registered with dependencies:`, this.dependencies);

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
     * Get another component instance from the IM registry
     * @param {string} componentName - Name of component to retrieve
     * @returns {Object|null} Component instance or null if not found
     */
    getComponent(componentName) {
        return initializationManager.getComponent(componentName);
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
    data() {
        return {
            _isInitialized: false
        };
    },
    
    computed: {
        isInitialized() {
            return this._isInitialized;
        }
    },
    
    created() {
        this._componentName = this.$options.name || 'UnnamedVueComponent';
        console.log(`🔍 [${this._componentName}] Vue component created - registering with IM...`);
        
        // Check if component has defined initialization method
        if (!this.initialize) {
            throw new Error(`❌ FATAL: Vue component ${this._componentName} MUST implement initialize(dependencies) method.
            
            Example:
            methods: {
                getComponentDependencies() {
                    return ['BadgeManager', 'SelectionManager']; // Declare dependencies
                },
                async initialize(dependencies) {
                    // Dependencies are guaranteed to be available and ready
                    this.badgeManager = dependencies.BadgeManager;
                    this.selectionManager = dependencies.SelectionManager;
                    this.setupEventListeners();
                    this.createElements();
                }
            }
            
            Component will NOT work until this is fixed.`);
        }
        
        // Register with InitializationManager for proper dependency management
        this._registerVueComponent();
    },

    async mounted() {
        // Wait for IM to initialize this component with its dependencies
        try {
            await initializationManager.waitForComponent(this._componentName);
            window.CONSOLE_LOG_IGNORE(`✅ [${this._componentName}] Vue component initialization complete via IM`);
        } catch (error) {
            console.error(`❌ [${this._componentName}] Vue component initialization failed:`, error);
            throw error;
        }
    },

    beforeUnmount() {
        if (this.cleanupDependencies) {
            this.cleanupDependencies();
        }
    },

    methods: {
        /**
         * Register Vue component with InitializationManager
         * @private
         */
        _registerVueComponent() {
            // Get dependencies from component
            const dependencies = this.getComponentDependencies ? this.getComponentDependencies() : [];
            
            // Create wrapped initialization function for IM
            const wrappedInit = async (dependenciesMap = {}) => {
                window.CONSOLE_LOG_IGNORE(`🔍 [${this._componentName}] Vue component initializing with dependencies:`, Object.keys(dependenciesMap));
                
                // Call the component's initialize method with dependency injection
                await this.initialize(dependenciesMap);
                
                // Mark as initialized
                this._isInitialized = true;
                
                window.CONSOLE_LOG_IGNORE(`✅ [${this._componentName}] Vue component initialized`);
                return this;
            };
            
            // Register with IM synchronously
            initializationManager.registerSync(
                this._componentName,
                wrappedInit,
                dependencies,
                { type: 'vue-component' }
            );
            
            window.CONSOLE_LOG_IGNORE(`🔍 [${this._componentName}] Vue component registered with IM. Dependencies: [${dependencies.join(', ')}]`);
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
        // Override window.CONSOLE_LOG_IGNORE to catch component creation patterns
        const originalLog = window.CONSOLE_LOG_IGNORE;
        window.CONSOLE_LOG_IGNORE = (...args) => {
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