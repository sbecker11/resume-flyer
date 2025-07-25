# Initialization Manager (IM) Framework

## Overview

The Initialization Manager (IM) is a sophisticated **dependency management system** that orchestrates the startup sequence of JavaScript modules and Vue.js components in the resume-flock project. It provides a declarative way to manage component dependencies, prevents circular dependencies, and ensures proper initialization order without tight coupling between components.

### 🎯 **Latest Enhancement: Vue Component Reactive Dependency Injection**

The IM framework now provides **reactive dependency injection** for Vue components through an enhanced `BaseVueComponentMixin`. This eliminates manual service locator calls and null checks, providing the same robust dependency management as regular components.

**Key Benefits:**
- ✅ **No null checks required** - Dependencies are guaranteed to be available
- ✅ **Automatic IM registration** - Vue components register seamlessly with the IM
- ✅ **Consistent pattern** - Same clean `initialize(dependencies)` pattern as regular components
- ✅ **Reactive by design** - Immediate access to dependency state and methods

```javascript
// Vue components now use clean dependency injection
async initialize(dependencies) {
  // Dependencies guaranteed by IM - no null checks needed!
  this.badgeManager = dependencies.BadgeManager;
  this.selectionManager = dependencies.SelectionManager;
  
  // Immediate reactive setup
  this.badgeMode = this.badgeManager.getMode();
}
```

This creates **perfect architectural symmetry** - whether you're writing a regular class component or a Vue component, the dependency injection pattern is identical.

## Core Concepts

### Dependent Components (DC)

All components in the framework must implement an **initialization interface** by extending `BaseComponent.mjs` or using the Vue mixin. These are called **Dependent Components (DC)** because they declare their dependencies and rely on the IM for proper initialization.

### Initialization Contract

Every DC must implement:
- **`initialize()`** method - Contains the component's startup logic
- **`destroy()`** method - Contains cleanup logic  
- **Dependencies via signature** - Declare dependencies via function parameters (recommended)
- **`getDependencies()`** method (fallback) - Returns array of dependency names (legacy)

### Promise-Based Architecture

The IM uses **promises** to track component initialization state:
- Each DC gets an initialization promise upon registration
- Dependencies are resolved by waiting for their promises
- Components notify the IM when initialization completes

## How It Works

### 1. Component Registration

Components register with the IM by providing:
```javascript
initializationManager.register(
  'ComponentName',           // Unique component identifier
  async () => {              // Initialization function
    await this.initialize();
    return this;
  },
  ['Dependency1', 'Dependency2'], // Array of dependencies
  { priority: 'medium' }     // Optional configuration
);
```

### 2. Dependency Resolution

The IM builds a **dependency graph** and uses promises to ensure proper initialization order:
```javascript
// Component can't initialize until all dependencies are ready
const dependencyPromises = dependencies.map(dep => 
  this.initializationPromises.get(dep)
);
await Promise.all(dependencyPromises);
```

### 3. Circular Dependency Detection

Before registration, the IM validates the dependency graph using **DFS (Depth-First Search)**:
```javascript
if (this.wouldCreateCircularDependency(componentName, dependencies)) {
  const cycle = this.findCircularDependency(componentName, dependencies);
  throw new Error(`Circular dependency detected: ${cycle.join(' -> ')}`);
}
```

### 4. Service Locator Pattern

Once initialized, components are registered in a **central registry** for lookup:
```javascript
// After initialization
initializationManager.registerComponentInstance(componentName, componentInstance);

// Later retrieval
const component = initializationManager.getComponent('ComponentName');
```

## Recent Framework Enhancements (2025)

### 1. Signature-Based Dependency Parsing

**NEW**: Components can now declare dependencies directly in their `initialize()` function signature instead of using `getDependencies()`.

#### Before (Legacy Pattern)
```javascript
class CardsController extends BaseComponent {
  getDependencies() {
    return ['VueDomManager', 'SceneContainer', 'BadgeManager', 'SelectionManager'];
  }

  async initialize(dependencies) {
    this.vueDomManager = dependencies.VueDomManager;
    this.sceneContainer = dependencies.SceneContainer; 
    this.badgeManager = dependencies.BadgeManager;
    this.selectionManager = dependencies.SelectionManager;
  }
}
```

#### After (Modern Pattern)
```javascript
class CardsController extends BaseComponent {
  async initialize({ VueDomManager, SceneContainer, BadgeManager, SelectionManager }) {
    this.vueDomManager = VueDomManager;
    this.sceneContainer = SceneContainer;
    this.badgeManager = BadgeManager;
    this.selectionManager = SelectionManager;
  }
}
```

**Benefits:**
- Dependencies declared exactly where they're used
- No redundancy between `getDependencies()` and parameter usage
- Automatic parsing via function signature analysis
- Cleaner, more explicit code

### 2. VueDomManager Component

**NEW**: Dedicated component for managing Vue DOM readiness lifecycle.

```javascript
// modules/core/vueDomManager.mjs
class VueDomManager extends BaseComponent {
  async initialize() {
    // Waits for 'vue-dom-ready' event internally
    await this.domReadyPromise;
    console.log('[VueDomManager] Vue DOM is ready');
  }
}
```

**Usage Pattern:**
```javascript
class SceneContainer extends BaseComponent {
  async initialize({ VueDomManager }) {
    // VueDomManager dependency ensures Vue DOM is ready
    this._sceneContainer = document.getElementById('scene-container');
    if (!this._sceneContainer) {
      throw new Error('[SceneContainer] scene-container element not found');
    }
  }
}
```

**Benefits:**
- Clean separation of DOM readiness from IM core logic
- Explicit dependency declaration for components needing DOM access
- Eliminates hardcoded Vue DOM assumptions in IM

### 3. Enhanced Validation Framework

**UPDATED**: Validation rules now support signature-based dependency parsing.

#### Removed Obsolete Rules:
- ❌ `getDependencies()` method requirement
- ❌ Vue component `getComponentDependencies()` requirement (except for Vue-specific cases)

#### Added New Rules:
- ✅ Destructured parameter detection in `initialize()` signatures
- ✅ VueDomManager dependency validation for DOM-accessing components
- ✅ Anti-pattern detection (see below)

### 4. IM Migration Validator

**NEW**: Comprehensive migration validator for detecting components using old patterns.

```javascript
// Run migration analysis
const results = await imMigrationValidator.validateIMMigration('.');

// Migration statistics
console.log(`Migration Rate: ${results.migrationRate}%`);
console.log(`Components needing migration: ${results.complianceStats.notMigrated}`);

// Generate detailed report
const report = imMigrationValidator.generateMigrationReport();
```

**Detects:**
- Service locator anti-pattern usage
- Components not extending BaseComponent
- Missing dependency injection signatures
- Components not registered with IM

## Anti-Patterns to Avoid

### 1. **DOM Access Without VueDomManager Dependency**

❌ **Anti-Pattern:**
```javascript
class SceneContainer extends BaseComponent {
  async initialize() {
    // WRONG: Assumes DOM readiness without declaring dependency
    this._element = document.getElementById('scene-container');
    
    if (!this._element) {
      throw new Error('IM should have ensured DOM readiness'); // ❌ Blames IM
    }
  }
}
```

✅ **Correct Pattern:**
```javascript
class SceneContainer extends BaseComponent {
  async initialize({ VueDomManager }) {
    // CORRECT: VueDomManager dependency ensures DOM is ready
    this._element = document.getElementById('scene-container');
    
    if (!this._element) {
      throw new Error('Check Vue template for scene-container element'); // ✅ Clear error
    }
  }
}
```

### 2. **Service Locator Pattern (Legacy)**

❌ **Anti-Pattern:**
```javascript
class CardsController extends BaseComponent {
  async initialize() {
    // WRONG: Manual service locator lookup
    this.selectionManager = initializationManager.getComponent('SelectionManager');
    this.stateManager = initializationManager.getComponent('StateManager');
  }
}
```

✅ **Correct Pattern:**
```javascript
class CardsController extends BaseComponent {
  async initialize({ SelectionManager, StateManager }) {
    // CORRECT: Dependencies injected automatically
    this.selectionManager = SelectionManager;
    this.stateManager = StateManager;
  }
}
```

### 3. **Hardcoded Initialization Assumptions**

❌ **Anti-Pattern:**
```javascript
class ComponentA extends BaseComponent {
  async initialize() {
    // WRONG: Assumes other components are ready
    if (!window.someGlobalManager) {
      throw new Error('SomeManager should be initialized by now');
    }
    
    // WRONG: Direct access to global singletons
    this.dependency = window.globalDependency;
  }
}
```

✅ **Correct Pattern:**
```javascript
class ComponentA extends BaseComponent {
  async initialize({ SomeManager, GlobalDependency }) {
    // CORRECT: Explicit dependency declaration
    this.someManager = SomeManager;
    this.dependency = GlobalDependency;
  }
}
```

### 4. **Manual Registration for BaseComponent Subclasses**

❌ **Anti-Pattern:**
```javascript
class MyComponent extends BaseComponent {
  constructor() {
    super('MyComponent');
  }
}

// WRONG: Manual registration when extending BaseComponent
initializationManager.register('MyComponent', {
  initFunction: async () => myComponent.initialize(),
  dependencies: []
});
```

✅ **Correct Pattern:**
```javascript
class MyComponent extends BaseComponent {
  constructor() {
    super('MyComponent'); // ✅ Auto-registers with IM
  }
  
  async initialize() {
    // ✅ Component automatically registers and initializes
  }
}
```

### 5. **Error Messages That Blame the IM**

❌ **Anti-Pattern Error Messages:**
```javascript
throw new Error('IM should have ensured DOM readiness');
throw new Error('InitializationManager failed to provide dependency');
throw new Error('Component should be ready by now - IM issue');
```

✅ **Clear Error Messages:**
```javascript
throw new Error('scene-container element not found - check Vue template');
throw new Error('SelectionManager dependency not provided');
throw new Error('Component initialization failed - check component logic');
```

### Detection Strategies

**Static Analysis (Hard to Catch):**
```javascript
// These patterns can be detected with validation rules:
if (content.includes('document.getElementById') && 
    !hasVueDomDependency(content)) {
  :s.push('DOM access without VueDomManager dependency');
}

if (content.includes('IM should have ensured')) {
  violations.push('Error message blames IM instead of declaring dependencies');
}
```

**Runtime Detection (Easier):**
- Monitor for components accessing DOM without VueDomManager
- Track service locator usage vs dependency injection
- Log components making assumptions about initialization order

**Code Review Focus Areas:**
- Components accessing `document.*` methods
- Error messages mentioning "IM should" or "should be ready"
- Manual `initializationManager.getComponent()` calls
- Comments like "should be available since IM manages..."

## Component Types

### 1. JavaScript Module Components

JavaScript modules extend `BaseComponent` and are automatically registered:

```javascript
// modules/core/stateManager.mjs
import { BaseComponent } from './abstracts/BaseComponent.mjs';

class StateManager extends BaseComponent {
  constructor() {
    super('StateManager');  // Auto-registers with IM
  }

  async initialize() {
    // No dependencies - no parameters needed
    this.state = {};
    this.setupEventListeners();
    console.log('StateManager initialized');
  }

  destroy() {
    this.removeEventListeners();
    this.isInitialized = false;
  }
}

export const stateManager = new StateManager();
```

### 2. Vue.js Components

Vue components register manually in their setup or mounted lifecycle:

```javascript
// modules/components/AppContent.vue
import { initializationManager } from '../core/initializationManager.mjs';

export default {
  setup() {
    // Register components with their dependencies
    initializationManager.register(
      'Layout',
      async () => {
        viewport.initialize();
        await viewPort.initialize();
      },
      ['CardsController', 'ResumeListController']
    );

    initializationManager.register(
      'ReactiveSystems', 
      async () => {
        bullsEye.initialize();
        aimPoint.initialize();
        focalPoint.initialize();
      },
      ['Layout']
    );
  }
}
```

### 3. Controller Classes

Controllers extend `BaseComponent` and define specific dependencies:

```javascript
// modules/scene/CardsController.mjs
import { BaseComponent } from '../core/abstracts/BaseComponent.mjs';

class CardsController extends BaseComponent {
  constructor() {
    super('CardsController');
  }

  async initialize({ StateManager, SelectionManager }) {
    // Dependencies injected via destructured parameters
    this.stateManager = StateManager;
    this.selectionManager = SelectionManager;
    
    this.setupCardElements();
    this.setupEventListeners();
    this.startAnimation();
  }

  destroy() {
    this.removeEventListeners();
    this.cleanup();
    this.isInitialized = false;
  }
}

export const cardsController = new CardsController();
```

## Framework Architecture

### BaseComponent Abstract Class

All JavaScript components must extend this base class:

```javascript
export class BaseComponent {
  constructor(name) {
    this.componentName = name;
    this.isInitialized = false;
    this._validateAbstractMethods();  // Enforces implementation
    this._registerSync();             // Auto-registers with IM
  }

  // ABSTRACT - Must be overridden
  async initialize() {
    throw new Error(`${this.componentName} MUST override initialize() method`);
  }

  // ABSTRACT - Must be overridden  
  destroy() {
    throw new Error(`${this.componentName} MUST override destroy() method`);
  }

  // OPTIONAL - Auto-discovery used if not provided
  getDependencies() {
    return null;  // Use auto-discovery
  }
}
```

### Validation Scanner

The framework includes a **validation scanner** that ensures components implement required methods:

```javascript
_validateAbstractMethods() {
  const requiredMethods = ['initialize', 'destroy'];
  const errors = [];

  for (const method of requiredMethods) {
    const methodExists = this[method] && this[method] !== BaseComponent.prototype[method];
    if (!methodExists) {
      errors.push(`Missing required method: ${method}()`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`${this.componentName} is missing required methods:\n${errors.join('\n')}`);
  }
}
```

## Initialization Flow

### 1. Registration Phase
```javascript
// Components register themselves during module loading
constructor() {
  super('ComponentName');  // Triggers registration
}
```

### 2. Dependency Analysis Phase
```javascript
// IM builds dependency graph and validates for cycles
this.dependencies.set(componentName, new Set(dependencies));
if (this.hasCircularDependency(this.dependencies)) {
  throw new Error('Circular dependency detected');
}
```

### 3. Initialization Phase
```javascript
// IM initializes components in dependency order
async checkDependencies() {
  for (const [componentName, component] of this.components) {
    if (component.status === 'pending' && await this.canInitialize(componentName)) {
      await this.initializeComponent(componentName);
    }
  }
}
```

### 4. Service Registry Phase
```javascript
// Components are registered for lookup after initialization
initializationManager.registerComponentInstance(componentName, componentInstance);
```

## Key Benefits

### 1. **Prevents Circular Dependencies**
- DFS-based cycle detection at registration time
- Clear error messages showing the circular path
- Prevents runtime failures and infinite loops

### 2. **Eliminates Tight Coupling** 
- Components don't directly instantiate dependencies
- Service locator pattern for loose coupling
- Event-driven communication between components

### 3. **Enforces Implementation Standards**
- Abstract base class requires method implementation
- Validation scanner ensures compliance
- Clear error messages guide developers

### 4. **Provides Predictable Initialization**
- Promise-based dependency resolution
- Deterministic initialization order
- Handles async initialization properly

### 5. **Enables Debugging and Monitoring**
- Complete visibility into dependency graph
- Component status tracking
- Visual dependency graph generation

## API Reference

### InitializationManager Methods

#### Registration
```javascript
// Async registration (recommended)
await initializationManager.register(name, initFunction, dependencies, options)

// Sync registration (for constructors)
initializationManager.registerSync(name, initFunction, dependencies, options)
```

#### Dependency Management
```javascript
// Wait for specific component
await initializationManager.waitForComponent('ComponentName')

// Wait for multiple components
await initializationManager.waitForComponents(['Comp1', 'Comp2'])

// Service locator
const component = initializationManager.getComponent('ComponentName')
```

#### Debugging and Monitoring
```javascript
// Get status of all components
const status = initializationManager.getStatus()

// Get visual dependency graph
const graph = initializationManager.getDependencyGraph()

// Validate dependencies
const validation = initializationManager.validateDependencies()
```

### BaseComponent Methods

#### Required Implementations
```javascript
// Component initialization logic
async initialize() {
  // Setup code here
}

// Component cleanup logic  
destroy() {
  // Cleanup code here
}
```

#### Optional Implementations
```javascript
// Define dependencies (auto-discovery if not provided)
getDependencies() {
  return ['Dependency1', 'Dependency2'];
}

// Custom validation logic
validateComponent() {
  return { valid: true, errors: [] };
}
```

#### Utility Methods
```javascript
// Check if initialized
component.checkInitialized()

// Wait for component to be ready
await component.waitForReady()

// Get component status
const status = component.getStatus()
```

## Example Usage

### Complete Component Example

```javascript
// modules/core/exampleComponent.mjs
import { BaseComponent } from './abstracts/BaseComponent.mjs';
import { initializationManager } from './initializationManager.mjs';

class ExampleComponent extends BaseComponent {
  constructor() {
    super('ExampleComponent');  // Auto-registers with IM
  }

  getDependencies() {
    return ['StateManager', 'EventBus'];
  }

  async initialize() {
    // Get dependencies from service locator
    this.stateManager = initializationManager.getComponent('StateManager');
    this.eventBus = initializationManager.getComponent('EventBus');
    
    // Initialize component
    this.setupEventListeners();
    this.createElements();
    
    console.log('ExampleComponent initialized');
  }

  destroy() {
    this.removeEventListeners();
    this.cleanup();
    this.isInitialized = false;
  }

  validateComponent() {
    const errors = [];
    if (!this.requiredConfig) {
      errors.push('Missing required configuration');
    }
    return { valid: errors.length === 0, errors };
  }

  setupEventListeners() {
    this.eventBus.addEventListener('data-changed', this.handleDataChange.bind(this));
  }

  removeEventListeners() {
    this.eventBus.removeEventListener('data-changed', this.handleDataChange.bind(this));
  }

  handleDataChange(event) {
    // Handle data changes
  }

  createElements() {
    // Create DOM elements
  }

  cleanup() {
    // Additional cleanup
  }
}

// Export singleton instance
export const exampleComponent = new ExampleComponent();
```

### Vue Component Integration

```javascript
// modules/components/ExampleVue.vue
<template>
  <div>{{ message }}</div>
</template>

<script>
import { initializationManager } from '../core/initializationManager.mjs';

export default {
  name: 'ExampleVue',
  
  setup() {
    const message = ref('Loading...');

    // Register with IM
    initializationManager.register(
      'ExampleVue',
      async () => {
        // Wait for dependencies
        await initializationManager.waitForComponents(['StateManager']);
        
        // Initialize component
        const stateManager = initializationManager.getComponent('StateManager');
        message.value = 'Initialized with ' + stateManager.componentName;
        
        console.log('ExampleVue initialized');
      },
      ['StateManager']
    );

    return { message };
  }
}
</script>
```

## Vue Component Reactive Dependency Injection

The IM framework now provides **reactive dependency injection** for Vue components through an enhanced `BaseVueComponentMixin`. This eliminates manual service locator calls and null checks, providing the same robust dependency management as regular components.

### Enhanced BaseVueComponentMixin Pattern

Vue components now use proper dependency injection with guaranteed-available dependencies:

```javascript
// BadgeToggle.vue
export default {
  name: 'BadgeToggle',
  mixins: [BaseVueComponentMixin],
  
  methods: {
    // Declare dependencies for IM to resolve
    getComponentDependencies() {
      return ['BadgeManager', 'SelectionManager'];
    },
    
    // Dependencies are guaranteed to be available - no null checks needed!
    async initialize(dependencies) {
      // Clean, reactive dependency access
      this.badgeManager = dependencies.BadgeManager;
      this.selectionManager = dependencies.SelectionManager;
      
      // Set up reactive data immediately
      this.badgeMode = this.badgeManager.getMode();
      this.selectedJobNumber = this.selectionManager.getSelectedJobNumber();
      
      // Set up event listeners
      this.badgeManager.addEventListener('badgeModeChanged', this.handleBadgeModeChanged);
      this.selectionManager.addEventListener('selectionChanged', this.handleSelectionChanged);
    },
    
    // Component logic remains reactive and clean
    handleBadgeModeChanged(event) {
      this.badgeMode = event.detail.mode; // Reactive updates
    }
  }
}
```

### Key Benefits of Reactive Dependency Injection

#### ✅ **No Null Checks Required**
```javascript
// OLD PATTERN (manual service locator)
async initializeWithDependencies() {
  this.badgeManager = initializationManager.getComponent('BadgeManager');
  
  // Required null check - component might not be ready
  if (!this.badgeManager) {
    throw new Error('BadgeManager not available');
  }
}

// NEW PATTERN (reactive dependency injection)
async initialize(dependencies) {
  // Dependencies guaranteed to be available by IM
  this.badgeManager = dependencies.BadgeManager; // Never null!
}
```

#### ✅ **Automatic IM Registration**
```javascript
// BaseVueComponentMixin automatically handles registration
export const BaseVueComponentMixin = {
  created() {
    this._componentName = this.$options.name || 'UnnamedVueComponent';
    
    // Validates component implements initialize(dependencies)
    if (!this.initialize) {
      throw new Error(`Vue component must implement initialize(dependencies)`);
    }
    
    // Registers with IM automatically
    this._registerVueComponent();
  },
  
  async mounted() {
    // Waits for IM to complete dependency resolution
    await initializationManager.waitForComponent(this._componentName);
  }
}
```

#### ✅ **Consistent Pattern with Regular Components**
```javascript
// Regular Component
class CardsController extends BaseComponent {
  async initialize(dependencies) {
    this.badgeManager = dependencies.BadgeManager;
  }
}

// Vue Component - Same pattern!
export default {
  async initialize(dependencies) {
    this.badgeManager = dependencies.BadgeManager;
  }
}
```

### Vue Component Lifecycle Integration

The enhanced mixin seamlessly integrates Vue's lifecycle with IM dependency management:

```
┌─────────────────────────────────────────────────────────────┐
│                    Vue Component Lifecycle                  │
├─────────────────────────────────────────────────────────────┤
│ 1. created()                                                │
│    ├── Validate initialize() method exists                 │
│    ├── Extract dependencies via getComponentDependencies() │
│    └── Register with IM automatically                      │
│                                                             │
│ 2. IM Dependency Resolution (asynchronous)                 │
│    ├── Wait for declared dependencies to initialize        │
│    ├── Build dependencies map with actual instances        │
│    └── Call initialize(dependencies) when ready            │
│                                                             │
│ 3. mounted()                                               │
│    ├── Wait for IM initialization to complete              │
│    └── Component is ready with guaranteed dependencies     │
└─────────────────────────────────────────────────────────────┘
```

### Migration from Service Locator Pattern

**Before (Service Locator with Null Checks):**
```javascript
// OLD - Manual service locator with error-prone null checks
methods: {
  getComponentDependencies() {
    return ['BadgeManager', 'SelectionManager'];
  },
  
  async initializeWithDependencies() {
    // Manual service locator calls
    this.badgeManager = initializationManager.getComponent('BadgeManager');
    this.selectionManager = initializationManager.getComponent('SelectionManager');
    
    // Required null checks
    if (!this.badgeManager || !this.selectionManager) {
      throw new Error('Dependencies not available');
    }
    
    // Setup code...
  }
}
```

**After (Reactive Dependency Injection):**
```javascript
// NEW - Clean dependency injection with guaranteed availability
methods: {
  getComponentDependencies() {
    return ['BadgeManager', 'SelectionManager'];
  },
  
  async initialize(dependencies) {
    // Dependencies guaranteed by IM - no null checks needed!
    this.badgeManager = dependencies.BadgeManager;
    this.selectionManager = dependencies.SelectionManager;
    
    // Immediate reactive setup
    this.badgeMode = this.badgeManager.getMode();
    this.selectedJobNumber = this.selectionManager.getSelectedJobNumber();
  }
}
```

### Error Handling and Validation

The enhanced BaseVueComponentMixin provides comprehensive validation:

```javascript
// Automatic validation during created() lifecycle
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
```

The IM's enhanced dependency validation ensures:
- All declared dependencies exist before `initialize()` is called
- Dependencies are fully initialized and ready
- Clear error messages if dependencies fail or are missing
- Proper initialization order based on dependency graph

## Architectural Patterns & Method Signatures

### Component Type Differences

The IM framework supports two distinct component types with different initialization patterns:

#### Regular Components (extending BaseComponent)
```javascript
class MyComponent extends BaseComponent {
    constructor() {
        super('MyComponent');
    }
    
    getDependencies() {
        return ['StateManager', 'SelectionManager']; // Optional - can be empty array
    }
    
    async initialize(dependencies = {}) {  // ✅ MUST accept dependencies parameter
        // Access dependencies from parameter
        this.stateManager = dependencies.StateManager;
        this.selectionManager = dependencies.SelectionManager;
        
        // Component initialization logic here
    }
    
    destroy() {
        // Cleanup logic here
        // ❌ Do NOT set this.isInitialized = false (BaseComponent manages this)
    }
}
```

#### Vue Components (using BaseVueComponentMixin)
```javascript
// MyVueComponent.vue
export default {
    name: 'MyVueComponent',
    mixins: [BaseVueComponentMixin],
    
    methods: {
        getComponentDependencies() {
            return ['SceneContainer', 'SelectionManager'];
        },
        
        async initializeWithDependencies() {  // ✅ Different method name, NO parameters
            // Get dependencies via service locator (not parameters)
            this.sceneContainer = initializationManager.getComponent('SceneContainer');
            this.selectionManager = initializationManager.getComponent('SelectionManager');
            
            // Component initialization logic here
        },
        
        cleanupDependencies() {
            // Cleanup logic here
        }
    }
}
```

### Key Architectural Insights

#### 1. Method Signature Requirements
- **Regular Components**: `initialize(dependencies = {})` - MUST accept dependencies parameter
- **Vue Components**: `initializeWithDependencies()` - NO parameters, uses service locator

#### 2. Dependency Access Patterns
- **Regular Components**: Receive dependencies via parameter injection
- **Vue Components**: Access dependencies via `initializationManager.getComponent()`

#### 3. Initialization State Management
- ❌ **Never manually set** `this.isInitialized = true/false`
- ✅ **BaseComponent automatically manages** initialization state
- ✅ **Only read** `this.isInitialized` to check status

#### 4. DOM Dependency Management
Vue components that access DOM elements should depend on the appropriate IM components:
```javascript
getComponentDependencies() {
    return [
        'SceneContainer',  // Ensures #scene-container exists before viewport access
        'VueDomManager'    // Ensures Vue DOM is ready
    ];
}
```

#### 5. Timing and Lifecycle
- **Vue components render first** (creating DOM elements)
- **IM components initialize second** (in dependency order)
- **Composables access DOM third** (after IM ensures readiness)

### Common Anti-Patterns

#### ❌ Wrong Method Signatures
```javascript
// Regular component - WRONG
async initialize() { }  // Missing dependencies parameter

// Vue component - WRONG  
async initialize(dependencies) { }  // Wrong method name and parameters
```

#### ❌ Manual Initialization Management
```javascript
async initialize(dependencies) {
    // Setup logic
    this.isInitialized = true;  // ❌ BaseComponent handles this
}

destroy() {
    this.isInitialized = false;  // ❌ BaseComponent handles this
}
```

#### ❌ DOM Access Without Dependencies
```javascript
// Vue component accessing DOM without ensuring it exists
async initializeWithDependencies() {
    const container = document.getElementById('scene-container');  // ❌ May not exist yet
}

// CORRECT - Depend on SceneContainer first
getComponentDependencies() {
    return ['SceneContainer'];  // ✅ Ensures DOM is ready
}
```

## Singleton Access Patterns

The IM framework enforces strict singleton management where **only the IM framework creates component instances**, and other code accesses these singletons through well-defined patterns.

### Component Instantiation Control

#### ✅ Correct Pattern - IM Controls Instantiation
```javascript
// ✅ CORRECT - IM framework creates and manages singletons
class MyComponent extends BaseComponent {
    constructor() {
        super('MyComponent');
        // BaseComponent automatically registers with IM
        // IM controls when and how this gets instantiated
    }
}

// ✅ IM framework creates the singleton
export const myComponent = new MyComponent(); // Only one instance ever created
```

#### ❌ Anti-Pattern - Manual Instantiation
```javascript
// ❌ WRONG - Don't create new instances
const badComponent = new MyComponent(); // Creates duplicate, breaks singleton pattern
```

### Singleton Method Call Patterns

#### 1. Within IM Components - Use Dependency Injection
```javascript
class MyComponent extends BaseComponent {
    async initialize({ StateManager, SelectionManager }) {
        // ✅ CORRECT - Store injected singleton references
        this.stateManager = StateManager;
        this.selectionManager = SelectionManager;
    }
    
    someMethod() {
        // ✅ CORRECT - Call methods on stored references
        this.stateManager.updateState(data);
        this.selectionManager.selectJobNumber(5);
    }
}
```

#### 2. Vue Components - Use Service Locator References
```javascript
// Vue component
export default {
    methods: {
        async initializeWithDependencies() {
            // ✅ CORRECT - Get singleton references via IM during initialization
            this.badgeManager = initializationManager.getComponent('BadgeManager');
            this.selectionManager = initializationManager.getComponent('SelectionManager');
        },
        
        handleClick() {
            // ✅ CORRECT - Call methods on stored references
            this.badgeManager.toggleMode();
            this.selectionManager.selectJobNumber(10);
        }
    }
}
```

#### 3. Legacy/Utility Code - Direct Imports
```javascript
// ✅ ACCEPTABLE - Direct import of singleton instance for utility functions
import { selectionManager } from '../core/selectionManager.mjs';
import { badgeManager } from '../core/badgeManager.mjs';

function utilityFunction() {
    // ✅ OK - Call methods on imported singleton
    selectionManager.selectJobNumber(3);
    badgeManager.setMode('skills');
}
```

#### 4. Event Handlers - Multiple Patterns
```javascript
// Pattern A: Use stored reference (preferred in IM components)
class MyComponent extends BaseComponent {
    handleEvent() {
        this.selectionManager.selectJobNumber(jobNumber); // Uses injected reference
    }
}

// Pattern B: Import singleton directly (utility functions)
import { selectionManager } from '../core/selectionManager.mjs';
document.addEventListener('click', () => {
    selectionManager.clearSelection(); // Direct import usage
});
```

### Performance and Best Practices

#### ✅ Efficient Reference Management
```javascript
// ✅ CORRECT - Store reference once during initialization
async initialize({ StateManager }) {
    this.stateManager = StateManager; // Store singleton reference once
}

someMethod() {
    this.stateManager.updateState(); // Use stored reference
    this.stateManager.saveState();   // Reuse same reference efficiently
}
```

#### ❌ Inefficient Service Locator Overuse
```javascript
// ❌ WRONG - Don't call service locator repeatedly for same component
someMethod() {
    initializationManager.getComponent('StateManager').updateState(); // Inefficient lookup
    initializationManager.getComponent('StateManager').saveState();   // Gets same instance twice
}
```

### Key Architectural Principles

1. **Single Source of Truth**: IM controls all component lifecycles and instantiation
2. **Store References During Initialization**: Get singleton references once, use many times
3. **Proper Initialization Order**: IM ensures dependencies are ready before method calls
4. **No Duplicate Instances**: Singleton pattern strictly enforced by IM framework
5. **Dependency Tracking**: IM knows what depends on what for proper initialization
6. **Consistent State**: All components share the same singleton instances

### Access Pattern Summary

| Context | Pattern | Example |
|---------|---------|---------|
| **IM Components** | Dependency injection | `this.stateManager = dependencies.StateManager` |
| **Vue Components** | **Reactive dependency injection** | `this.manager = dependencies.Manager` |
| **Utility Functions** | Direct import | `import { manager } from './manager.mjs'` |
| **Event Handlers** | Stored reference or import | `this.manager.method()` or imported singleton |

**Note:** Vue components now use the same clean dependency injection pattern as regular IM components, eliminating service locator calls and null checks.

### Critical Rule
> **Only the IM framework should call `new Component()`**  
> **Everyone else accesses singletons via dependency injection, service locator, or direct imports**

This ensures the IM framework maintains complete control over component instantiation, initialization order, and dependency resolution while providing efficient access patterns for different use cases.

## Error Handling

The framework provides comprehensive error messages for common issues:

### Missing Implementation
```javascript
❌ FATAL: ComponentName MUST override initialize() method.

Example:
async initialize() {
    this.setupEventListeners();
    this.createElements();
}

Component will NOT work until this is fixed.
```

### Circular Dependencies
```javascript
❌ FATAL: Circular dependency detected: ComponentA -> ComponentB -> ComponentC -> ComponentA

Components must not have circular dependencies.
Review your dependency declarations.
```

### Invalid Dependencies
```javascript
❌ [ComponentName] Invalid dependency: '' must be a non-empty string

All dependencies must be valid component names.
```

## Best Practices

### 1. **Keep Dependencies Minimal**
- Only declare dependencies you actually need
- Prefer event-driven communication over direct dependencies
- Use service locator pattern for optional dependencies

### 2. **Handle Initialization Errors**
- Validate configuration in `validateComponent()`
- Use try-catch blocks in `initialize()` method
- Provide meaningful error messages

### 3. **Implement Proper Cleanup**
- Remove all event listeners in `destroy()`
- Clear timeouts and intervals
- Release DOM references

### 4. **Use Descriptive Names**
- Component names should be unique and descriptive
- Dependency names must match registered component names
- Follow consistent naming conventions

### 5. **Leverage Debugging Tools**
- Use `getStatus()` to monitor component state
- Generate dependency graphs for visualization
- Validate dependencies during development

### 6. **IM-First Architectural Mindset**

**CRITICAL: Always think IM-first when designing components.** The framework is designed to eliminate manual dependency management entirely.

#### ✅ **The IM Way (Declarative)**
```javascript
// Declare dependencies upfront
class MyComponent extends BaseComponent {
    async initialize({ JobsDataManager, SelectionManager }) {
        this.jobsDataManager = JobsDataManager;
        this.selectionManager = SelectionManager;
        // Dependencies injected automatically
    }
}
```

#### ❌ **Anti-Patterns to Avoid (Imperative)**
```javascript
// DON'T: Dynamic imports during runtime
const { initializationManager } = await import('../core/initializationManager.mjs');
const component = initializationManager.getComponent('SomeComponent');

// DON'T: Service locator pattern  
const component = this.getComponent('SomeComponent');

// DON'T: Manual lookups
const manager = window.someGlobalManager;

// DON'T: Standalone utility functions that "reach out" for dependencies
export function utilityFunction() {
    const manager = getSomeManagerSomehow(); // Where does this come from?
}
```

#### **Key Principles**
1. **Every component declares its dependencies upfront** via `initialize({ Dep1, Dep2 })`
2. **No manual lookups** - let the IM handle dependency resolution
3. **No dynamic imports** during runtime - everything flows through dependency injection
4. **Convert utilities to IM components** - even utility modules should participate in the IM system
5. **Trust the framework** - the IM manages initialization order, component access, and lifecycle

#### **When Tempted to Use Old Patterns, Ask:**
- "What are this component's dependencies?" → Declare them in `initialize()`
- "How can I access Component X?" → Declare it as a dependency
- "This utility needs data..." → Convert it to an IM component with dependencies

**The IM framework makes dependency management declarative, not imperative.** Embrace this paradigm for cleaner, more predictable, and more testable code.

## Debugging and Troubleshooting

### Common Issues

#### Component Not Initializing
```javascript
// Check if dependencies are registered
const status = initializationManager.getStatus();
console.log('Component status:', status);

// Check for circular dependencies
const validation = initializationManager.validateDependencies();
if (!validation.isValid) {
  console.error('Dependency issues:', validation);
}
```

#### Dependency Graph Visualization
```javascript
// Generate ASCII dependency graph
const graph = initializationManager.getDependencyGraph();
console.log(graph);

/*
Output:
Dependency Graph:
✓ StateManager
✓ EventBus
  ✓ StateManager
⏳ ComponentA
  ✓ StateManager
  ✓ EventBus
*/
```

#### Service Locator Usage
```javascript
// Check if component is available
const component = initializationManager.getComponent('ComponentName');
if (!component) {
  console.error('Component not found or not ready');
  
  // Check available components
  const available = initializationManager.getAvailableComponents();
  console.log('Available components:', available);
}
```

## Migration Guide

### Converting Existing Components

#### Before (Manual Initialization)
```javascript
class OldComponent {
  constructor() {
    this.init();
  }
  
  init() {
    // Direct dependency access
    this.stateManager = window.stateManager;
    this.setupEventListeners();
  }
}
```

#### After (IM Framework)
```javascript
class NewComponent extends BaseComponent {
  constructor() {
    super('NewComponent');
  }
  
  getDependencies() {
    return ['StateManager'];
  }
  
  async initialize() {
    // Service locator access
    this.stateManager = initializationManager.getComponent('StateManager');
    this.setupEventListeners();
  }
  
  destroy() {
    this.removeEventListeners();
    this.isInitialized = false;
  }
}
```

## Validator Tests for IM Framework Compliance

The IM framework includes comprehensive validation to ensure all components meet framework requirements. Components must pass all validator tests to be considered compliant.

### 1. Interface Implementation Validators

#### Abstract Method Implementation Test
```javascript
class IMInterfaceValidator {
  static validateAbstractMethods(component) {
    const errors = [];
    const requiredMethods = ['initialize', 'destroy'];
    
    for (const method of requiredMethods) {
      if (!component[method]) {
        errors.push(`Missing required method: ${method}()`);
      } else if (component[method] === BaseComponent.prototype[method]) {
        errors.push(`Method ${method}() not overridden from BaseComponent`);
      } else if (typeof component[method] !== 'function') {
        errors.push(`${method} must be a function`);
      }
    }
    
    return { valid: errors.length === 0, errors };
  }
}
```

#### Dependency Declaration Test
```javascript
static validateDependencyDeclaration(component) {
  const errors = [];
  const dependencies = component.getDependencies?.() || [];
  
  if (!Array.isArray(dependencies)) {
    errors.push('getDependencies() must return an array');
  } else {
    dependencies.forEach((dep, index) => {
      if (typeof dep !== 'string' || dep.trim().length === 0) {
        errors.push(`Dependency at index ${index} must be a non-empty string`);
      }
    });
  }
  
  return { valid: errors.length === 0, errors };
}
```

#### IM Registration Test
```javascript
static validateIMRegistration(component) {
  const errors = [];
  const componentName = component.componentName;
  
  if (!componentName) {
    errors.push('Component must have a componentName property');
  } else if (!initializationManager.isComponentRegistered(componentName)) {
    errors.push(`Component '${componentName}' not registered with InitializationManager`);
  }
  
  return { valid: errors.length === 0, errors };
}
```

### 2. Singleton Pattern Validators

#### Singleton Implementation Test
```javascript
static validateSingletonPattern(ComponentClass) {
  const errors = [];
  
  // Test 1: Constructor returns existing instance
  const instance1 = new ComponentClass();
  const instance2 = new ComponentClass();
  
  if (instance1 !== instance2) {
    errors.push('Constructor must return same instance (singleton pattern violated)');
  }
  
  // Test 2: Static instance property exists
  if (!ComponentClass.instance) {
    errors.push('Singleton must have static instance property');
  }
  
  // Test 3: Instance matches static property
  if (ComponentClass.instance !== instance1) {
    errors.push('Static instance property must match constructor return value');
  }
  
  return { valid: errors.length === 0, errors };
}
```

#### Memory Leak Test for Singletons
```javascript
static validateSingletonMemoryManagement(ComponentClass) {
  const errors = [];
  const warnings = [];
  
  // Test cleanup method exists
  const instance = new ComponentClass();
  if (!instance.destroy || typeof instance.destroy !== 'function') {
    errors.push('Singleton must implement destroy() method for cleanup');
  }
  
  // Test reset capability for testing
  if (!ComponentClass.resetInstance && !ComponentClass.reset) {
    warnings.push('Singleton should provide reset capability for testing');
  }
  
  return { valid: errors.length === 0, errors, warnings };
}
```

### 3. Initialization Sequence Validators

#### Pre-Initialization State Test
```javascript
static validatePreInitializationState(component) {
  const errors = [];
  
  if (component.isInitialized === true) {
    errors.push('Component should not be initialized before initialize() is called');
  }
  
  if (!component.componentName) {
    errors.push('Component must have componentName set in constructor');
  }
  
  return { valid: errors.length === 0, errors };
}
```

#### Post-Initialization State Test
```javascript
static async validatePostInitializationState(component) {
  const errors = [];
  
  // Wait for initialization to complete
  await component.waitForReady();
  
  if (component.isInitialized !== true) {
    errors.push('Component must set isInitialized = true after initialization');
  }
  
  // Check if registered in service locator
  const retrievedComponent = initializationManager.getComponent(component.componentName);
  if (retrievedComponent !== component) {
    errors.push('Component must be registered in service locator after initialization');
  }
  
  return { valid: errors.length === 0, errors };
}
```

#### Dependency Resolution Test
```javascript
static async validateDependencyResolution(component) {
  const errors = [];
  const dependencies = component.getDependencies?.() || [];
  
  for (const depName of dependencies) {
    try {
      await initializationManager.waitForComponent(depName);
      const depComponent = initializationManager.getComponent(depName);
      
      if (!depComponent) {
        errors.push(`Dependency '${depName}' not available in service locator`);
      } else if (!depComponent.isInitialized) {
        errors.push(`Dependency '${depName}' not properly initialized`);
      }
    } catch (error) {
      errors.push(`Failed to resolve dependency '${depName}': ${error.message}`);
    }
  }
  
  return { valid: errors.length === 0, errors };
}
```

### 4. Service Locator Pattern Validators

#### Service Locator Usage Test
```javascript
static validateServiceLocatorUsage(component) {
  const errors = [];
  const warnings = [];
  
  // Scan initialize() method source for direct imports/requires
  const initSource = component.initialize.toString();
  
  if (initSource.includes('import ') || initSource.includes('require(')) {
    warnings.push('Component should use service locator instead of direct imports in initialize()');
  }
  
  // Check if component uses IM.getComponent()
  if (!initSource.includes('getComponent')) {
    warnings.push('Component should retrieve dependencies via initializationManager.getComponent()');
  }
  
  return { valid: errors.length === 0, errors, warnings };
}
```

#### Service Registration Test
```javascript
static validateServiceRegistration(component) {
  const errors = [];
  
  const componentName = component.componentName;
  const registeredInstance = initializationManager.getComponent(componentName);
  
  if (!registeredInstance) {
    errors.push(`Component '${componentName}' not registered in service locator`);
  } else if (registeredInstance !== component) {
    errors.push(`Registered instance does not match component instance`);
  }
  
  return { valid: errors.length === 0, errors };
}
```

### 5. Error Handling Validators

#### Exception Safety Test
```javascript
static async validateExceptionSafety(component) {
  const errors = [];
  
  // Test initialize() error handling
  try {
    // Create a component that should fail initialization
    const testComponent = Object.create(component);
    testComponent.initialize = async () => {
      throw new Error('Test initialization failure');
    };
    
    await testComponent.initialize();
    errors.push('Component should propagate initialization errors');
  } catch (error) {
    // Expected behavior - initialization errors should be thrown
  }
  
  return { valid: errors.length === 0, errors };
}
```

#### Cleanup Validation Test
```javascript
static validateCleanupBehavior(component) {
  const errors = [];
  
  // Test destroy() method
  try {
    const originalState = { ...component };
    component.destroy();
    
    if (component.isInitialized !== false) {
      errors.push('destroy() must set isInitialized = false');
    }
    
    // Check for common cleanup patterns
    const destroySource = component.destroy.toString();
    if (!destroySource.includes('removeEventListener') && 
        !destroySource.includes('cleanup') && 
        !destroySource.includes('clear')) {
      errors.push('destroy() should include cleanup logic (removeEventListener, cleanup, clear, etc.)');
    }
    
  } catch (error) {
    errors.push(`destroy() method failed: ${error.message}`);
  }
  
  return { valid: errors.length === 0, errors };
}
```

### 6. Framework Integration Validators

#### BaseComponent Extension Test
```javascript
static validateBaseComponentExtension(ComponentClass) {
  const errors = [];
  
  if (!(ComponentClass.prototype instanceof BaseComponent)) {
    errors.push('Component must extend BaseComponent');
  }
  
  // Check constructor calls super()
  const constructorSource = ComponentClass.toString();
  if (!constructorSource.includes('super(')) {
    errors.push('Constructor must call super() with component name');
  }
  
  return { valid: errors.length === 0, errors };
}
```

#### Vue Component Integration Test
```javascript
static validateVueComponentIntegration(vueComponent) {
  const errors = [];
  
  if (vueComponent.setup || vueComponent.mounted) {
    // Check for IM registration in Vue lifecycle
    const setupSource = vueComponent.setup?.toString() || '';
    const mountedSource = vueComponent.mounted?.toString() || '';
    
    if (!setupSource.includes('initializationManager.register') && 
        !mountedSource.includes('initializationManager.register')) {
      errors.push('Vue component must register with InitializationManager in setup() or mounted()');
    }
  }
  
  return { valid: errors.length === 0, errors };
}
```

### 7. Complete Component Validation Suite

#### Comprehensive Component Validator
```javascript
class ComponentValidator {
  static async validateComponent(component) {
    const results = {
      valid: true,
      errors: [],
      warnings: [],
      tests: {}
    };
    
    const tests = [
      { name: 'AbstractMethods', fn: () => this.validateAbstractMethods(component) },
      { name: 'DependencyDeclaration', fn: () => this.validateDependencyDeclaration(component) },
      { name: 'IMRegistration', fn: () => this.validateIMRegistration(component) },
      { name: 'PreInitialization', fn: () => this.validatePreInitializationState(component) },
      { name: 'PostInitialization', fn: () => this.validatePostInitializationState(component) },
      { name: 'DependencyResolution', fn: () => this.validateDependencyResolution(component) },
      { name: 'ServiceLocatorUsage', fn: () => this.validateServiceLocatorUsage(component) },
      { name: 'ServiceRegistration', fn: () => this.validateServiceRegistration(component) },
      { name: 'ExceptionSafety', fn: () => this.validateExceptionSafety(component) },
      { name: 'CleanupBehavior', fn: () => this.validateCleanupBehavior(component) }
    ];
    
    // Add singleton tests if component is singleton
    if (component.constructor.instance) {
      tests.push(
        { name: 'SingletonPattern', fn: () => this.validateSingletonPattern(component.constructor) },
        { name: 'SingletonMemory', fn: () => this.validateSingletonMemoryManagement(component.constructor) }
      );
    }
    
    for (const test of tests) {
      try {
        const result = await test.fn();
        results.tests[test.name] = result;
        
        if (!result.valid) {
          results.valid = false;
          results.errors.push(...result.errors);
        }
        
        if (result.warnings) {
          results.warnings.push(...result.warnings);
        }
        
      } catch (error) {
        results.valid = false;
        results.errors.push(`Test ${test.name} failed: ${error.message}`);
      }
    }
    
    return results;
  }
  
  static generateValidationReport(results) {
    const report = [`Validation Report for ${results.componentName || 'Component'}`];
    report.push('='.repeat(50));
    
    if (results.valid) {
      report.push('✅ PASSED - All validation tests successful');
    } else {
      report.push('❌ FAILED - Component does not meet IM framework requirements');
    }
    
    report.push('\nTest Results:');
    for (const [testName, result] of Object.entries(results.tests)) {
      const status = result.valid ? '✅' : '❌';
      report.push(`  ${status} ${testName}`);
      
      if (result.errors && result.errors.length > 0) {
        result.errors.forEach(error => report.push(`    - ${error}`));
      }
    }
    
    if (results.warnings.length > 0) {
      report.push('\nWarnings:');
      results.warnings.forEach(warning => report.push(`  ⚠️  ${warning}`));
    }
    
    if (!results.valid) {
      report.push('\nRequired Actions:');
      report.push('1. Fix all failed validation tests');
      report.push('2. Ensure component extends BaseComponent');
      report.push('3. Implement required abstract methods');
      report.push('4. Register with InitializationManager');
      report.push('5. Use service locator pattern for dependencies');
    }
    
    return report.join('\n');
  }
}
```

### 8. Usage Examples

#### Testing a Component
```javascript
// Test individual component
const cardsController = new CardsController();
const validationResult = await ComponentValidator.validateComponent(cardsController);

if (!validationResult.valid) {
  console.error('Component validation failed:');
  console.error(ComponentValidator.generateValidationReport(validationResult));
} else {
  console.log('✅ Component passed all validation tests');
}
```

#### Testing All Components
```javascript
// Validate all registered components
async function validateAllComponents() {
  const components = initializationManager.getAvailableComponents();
  const results = [];
  
  for (const componentName of components) {
    const component = initializationManager.getComponent(componentName);
    if (component) {
      const result = await ComponentValidator.validateComponent(component);
      result.componentName = componentName;
      results.push(result);
    }
  }
  
  // Generate summary report
  const passed = results.filter(r => r.valid).length;
  const failed = results.filter(r => !r.valid).length;
  
  console.log(`\nValidation Summary: ${passed} passed, ${failed} failed`);
  
  // Show failed components
  results.filter(r => !r.valid).forEach(result => {
    console.log('\n' + ComponentValidator.generateValidationReport(result));
  });
  
  return results;
}
```

### 9. Automated Testing Integration

#### Jest Test Integration
```javascript
// tests/im-compliance.test.js
describe('IM Framework Compliance', () => {
  test('All components extend BaseComponent', async () => {
    const components = initializationManager.getAvailableComponents();
    
    for (const componentName of components) {
      const component = initializationManager.getComponent(componentName);
      expect(component).toBeInstanceOf(BaseComponent);
    }
  });
  
  test('All components implement required methods', async () => {
    const components = initializationManager.getAvailableComponents();
    
    for (const componentName of components) {
      const component = initializationManager.getComponent(componentName);
      const result = await ComponentValidator.validateComponent(component);
      
      if (!result.valid) {
        const report = ComponentValidator.generateValidationReport(result);
        fail(`Component ${componentName} failed validation:\n${report}`);
      }
    }
  });
  
  test('Singleton components follow singleton pattern', () => {
    const singletonComponents = [
      'StateManager', 'SelectionManager', 'EventBus', 
      'CardsController', 'ResumeListController'
    ];
    
    singletonComponents.forEach(componentName => {
      const component = initializationManager.getComponent(componentName);
      if (component) {
        const ComponentClass = component.constructor;
        const result = ComponentValidator.validateSingletonPattern(ComponentClass);
        
        if (!result.valid) {
          fail(`${componentName} singleton pattern validation failed: ${result.errors.join(', ')}`);
        }
      }
    });
  });
});
```

## Project Component Architecture

The resume-flock project uses a layered architecture with the IM framework orchestrating component initialization. Components are organized into distinct categories based on their responsibilities and relationships.

### Component Hierarchy Overview

```
Application Layer
├── Vue Components (AppContent, Timeline, etc.)
├── Composables (useViewport, useBullsEye, etc.)
└── Controllers (CardsController, ResumeListController)

Core Services Layer  
├── Initialization Manager (IM)
├── State Manager
├── Selection Manager
└── Event Bus

Utility Layer
├── Coordinate Manager
├── CSS Variable Injector
├── Badge Manager
└── Dependency Enforcement

Infrastructure Layer
├── Component Scanner
├── Import Parser
└── Runtime Enforcement

Fundamental Layer
├── VueDomManager (DOM lifecycle)
├── BaseComponent (abstract base class)
└── InitializationManager Core (dependency resolution engine)
```

### 0. Fundamental Layer Components

The fundamental layer provides the essential infrastructure that all other components depend on. These are the lowest-level components that must be available before any other initialization can occur.

#### VueDomManager (`modules/core/vueDomManager.mjs`)

The **most fundamental** component that manages Vue DOM lifecycle - everything that needs DOM access depends on this.

```javascript
class VueDomManager extends BaseComponent {
  constructor() {
    super('VueDomManager');
    this.isDomReady = false;
    this.domReadyPromise = this._setupDomReadyPromise();
  }

  async initialize() {
    // Waits for 'vue-dom-ready' event from Vue app
    await this.domReadyPromise;
    this.isDomReady = true;
    console.log('[VueDomManager] Vue DOM is ready');
  }

  _setupDomReadyPromise() {
    return new Promise((resolve) => {
      const handleVueDomReady = () => {
        window.removeEventListener('vue-dom-ready', handleVueDomReady);
        resolve();
      };
      
      if (document.readyState === 'complete' && window.Vue) {
        resolve(); // Already ready
      } else {
        window.addEventListener('vue-dom-ready', handleVueDomReady);
      }
    });
  }
}
```

**Key Characteristics:**
- **No dependencies**: Can initialize immediately
- **Highest priority**: Must be ready before DOM-accessing components
- **Event-driven**: Waits for Vue to signal DOM readiness
- **Foundational**: Required by most UI components

**Dependents:** SceneContainer, CardsController, all Vue components accessing DOM

#### BaseComponent (`modules/core/abstracts/BaseComponent.mjs`)

The **abstract base class** that provides the component interface and auto-registration with IM.

```javascript
export class BaseComponent {
  constructor(name) {
    this.componentName = name;
    this.isInitialized = false;
    
    // CRITICAL: Auto-registration with IM happens here
    this._validateAbstractMethods();  // Enforces implementation
    this._registerSync();             // Registers with IM immediately
  }

  // ABSTRACT - Must be overridden by subclasses
  async initialize() {
    throw new Error(`${this.componentName} MUST override initialize() method`);
  }

  // ABSTRACT - Must be overridden by subclasses
  destroy() {
    throw new Error(`${this.componentName} MUST override destroy() method`);
  }

  // Signature-based dependency parsing (NEW)
  _parseDependenciesFromSignature() {
    const funcStr = this.initialize.toString();
    const paramMatch = funcStr.match(/initialize\s*\(\s*\{([^}]+)\}/);
    
    if (paramMatch) {
      // Extract destructured parameter names: { VueDomManager, StateManager }
      return paramMatch[1].split(',').map(p => p.trim());
    }
    
    return []; // No destructured dependencies found
  }

  // Auto-registration with IM
  _registerSync() {
    // Parse dependencies from initialize() signature
    const signatureDeps = this._parseDependenciesFromSignature();
    
    if (signatureDeps.length > 0) {
      this.dependencies = signatureDeps;
    } else {
      // Fallback to getDependencies() method if it exists
      this.dependencies = this.getDependencies?.() || [];
    }

    // Register with InitializationManager
    this._registerWithManager();
  }
}
```

**Key Characteristics:**
- **Abstract base**: Cannot be instantiated directly
- **Auto-registration**: All subclasses automatically register with IM
- **Signature parsing**: Automatically extracts dependencies from initialize() method
- **Validation enforcement**: Ensures subclasses implement required methods
- **Universal pattern**: All framework components must extend this

**Dependents:** Every component in the system (StateManager, SelectionManager, CardsController, etc.)

#### InitializationManager Core (`modules/core/initializationManager.mjs`)

The **dependency resolution engine** that orchestrates the entire initialization process.

```javascript
class InitializationManager {
  constructor() {
    // Core data structures
    this.components = new Map();           // Component registry
    this.dependencies = new Map();         // Dependency graph
    this.initializationPromises = new Map(); // Promise tracking
    this.componentRegistry = new Map();    // Service locator registry
    this.readyComponents = new Set();      // Initialized components
  }

  // FUNDAMENTAL: Component registration
  registerSync(componentName, initFunction, dependencies = [], options = {}) {
    // 1. Validate no circular dependencies
    if (this.wouldCreateCircularDependency(componentName, dependencies)) {
      const cycle = this.findCircularDependency(componentName, dependencies);
      throw new Error(`Circular dependency detected: ${cycle.join(' -> ')}`);
    }

    // 2. Store component information
    this.components.set(componentName, {
      initFunction,
      dependencies: new Set(dependencies),
      options,
      status: 'pending'
    });

    // 3. Create initialization promise for dependency tracking
    this.initializationPromises.set(componentName, new Promise((resolve, reject) => {
      this.components.get(componentName).promiseResolve = resolve;
      this.components.get(componentName).promiseReject = reject;
    }));

    // 4. Trigger dependency checking
    this.checkDependencies();
  }

  // FUNDAMENTAL: Dependency resolution algorithm
  async canInitialize(componentName) {
    const component = this.components.get(componentName);
    if (!component) return false;

    // Wait for all dependency promises to resolve
    const dependencyPromises = Array.from(component.dependencies).map(depName => {
      const depPromise = this.initializationPromises.get(depName);
      if (!depPromise) {
        console.warn(`Dependency '${depName}' not found for '${componentName}'`);
        return Promise.resolve();
      }
      return depPromise;
    });

    try {
      await Promise.all(dependencyPromises);
      return true; // All dependencies resolved
    } catch (error) {
      console.error(`Dependency resolution failed for ${componentName}:`, error);
      return false;
    }
  }

  // FUNDAMENTAL: Component initialization
  async initializeComponent(componentName) {
    const component = this.components.get(componentName);
    component.status = 'initializing';

    try {
      // Build dependencies map for injection
      const dependenciesMap = this._buildDependenciesMap(componentName);
      
      // Call component's initialization function with dependencies
      const result = await component.initFunction(dependenciesMap);
      
      // Mark as ready and register in service locator
      component.status = 'ready';
      this.readyComponents.add(componentName);
      this.componentRegistry.set(componentName, result);
      
      // Resolve the initialization promise
      component.promiseResolve(result);
      
      console.log(`✅ [${componentName}] Initialization complete`);
    } catch (error) {
      component.status = 'failed';
      component.promiseReject(error);
      throw error;
    }
  }

  // FUNDAMENTAL: Dependency map building for injection
  _buildDependenciesMap(componentName) {
    const component = this.components.get(componentName);
    const dependenciesMap = {};
    
    for (const dependencyName of component.dependencies) {
      const dependencyInstance = this.componentRegistry.get(dependencyName);
      
      if (!dependencyInstance) {
        throw new Error(`Dependency '${dependencyName}' not found for '${componentName}'`);
      }
      
      dependenciesMap[dependencyName] = dependencyInstance;
    }
    
    return dependenciesMap;
  }
}
```

**Key Characteristics:**
- **Singleton**: Only one instance manages entire system
- **Dependency resolution**: Uses promises and topological sorting
- **Circular dependency detection**: Prevents infinite loops
- **Service locator**: Central registry for initialized components
- **Event coordination**: Manages initialization lifecycle

**Dependents:** Every component that extends BaseComponent (which is everything)

### Fundamental Layer Initialization Flow

The fundamental layer components bootstrap the entire system:

```
1. InitializationManager (Singleton Creation)
   ├── Creates core data structures
   ├── Sets up dependency tracking
   └── Waits for component registrations

2. BaseComponent Subclass Constructors (During Module Loading)
   ├── Call super(componentName)
   ├── Trigger _parseDependenciesFromSignature()
   ├── Auto-register with InitializationManager
   └── Create initialization promises

3. VueDomManager (First Component to Initialize)
   ├── No dependencies - can start immediately
   ├── Waits for 'vue-dom-ready' event
   ├── Resolves domReadyPromise
   └── Enables DOM-dependent components

4. Cascade Initialization (Dependency Order)
   ├── Components with VueDomManager dependency wait
   ├── StateManager initializes (no dependencies)
   ├── SelectionManager initializes (no dependencies)
   └── Higher-level components initialize as dependencies resolve
```

### Why the Fundamental Layer is Critical

1. **Bootstrap Problem**: These components solve the chicken-and-egg problem of "who initializes the initializer?"

2. **Universal Dependency**: Every other component depends on at least one fundamental component:
   - **BaseComponent**: Required for registration and lifecycle
   - **VueDomManager**: Required for DOM access
   - **InitializationManager**: Required for dependency resolution

3. **System Reliability**: If any fundamental component fails, the entire system cannot start

4. **Architecture Enforcement**: These components enforce the patterns and contracts that make the IM framework work

### Fundamental Layer Anti-Patterns

❌ **Don't bypass the fundamental layer:**
```javascript
// WRONG: Direct component instantiation without BaseComponent
class MyComponent {
  constructor() {
    // Missing: super() call, no IM registration
  }
}

// WRONG: Manual DOM access without VueDomManager
class BadComponent extends BaseComponent {
  async initialize() {
    // Missing: VueDomManager dependency
    document.getElementById('some-element'); // Might not exist yet!
  }
}
```

✅ **Always use the fundamental layer:**
```javascript
// CORRECT: Proper BaseComponent usage
class MyComponent extends BaseComponent {
  constructor() {
    super('MyComponent'); // Auto-registers with IM
  }
  
  async initialize({ VueDomManager }) {
    // VueDomManager ensures DOM is ready
    const element = document.getElementById('some-element');
  }
}
```

### 1. Core Management Components

These are the foundational singleton components that provide essential services across the application.

#### InitializationManager (`modules/core/initializationManager.mjs`)
- **Role**: Central orchestrator for component initialization
- **Dependencies**: None (root component)
- **Dependents**: All other components
- **Key Features**: 
  - Circular dependency detection
  - Promise-based initialization
  - Service locator registry
  - Dependency graph validation

#### StateManager (`modules/core/stateManager.mjs`)
```javascript
class StateManager extends BaseComponent {
  getDependencies() { return []; }
  // Manages global application state
  // Handles persistence to server
  // Provides reactive state updates
}
export const stateManager = new StateManager();
```
- **Role**: Global state management and persistence
- **Dependencies**: None
- **Dependents**: Most application components
- **Relationships**: Used by controllers for state persistence

#### SelectionManager (`modules/core/selectionManager.mjs`)
```javascript
class SelectionManager extends EventTarget {
  // Singleton pattern with EventTarget for event-driven communication
}
export const selectionManager = new SelectionManager();
```
- **Role**: Manages item selection state across UI components
- **Dependencies**: None
- **Dependents**: CardsController, ResumeListController, Vue components
- **Relationships**: Event-driven communication with UI components

### 2. Controller Components

Controllers manage specific domains of the application and coordinate between UI and core services.

#### CardsController (`modules/scene/CardsController.mjs`)
```javascript
class CardsController extends BaseComponent {
  getDependencies() { 
    return ['StateManager', 'SelectionManager']; 
  }
  // Manages business card rendering and interactions
  // Handles parallax effects and animations
  // Coordinates with BadgeManager for skill badges
}
export const cardsController = new CardsController();
```
- **Role**: Manages scene container business cards
- **Dependencies**: StateManager, SelectionManager
- **Dependents**: SkillBadges, ConnectionLines, Vue components
- **Key Features**:
  - Card positioning and parallax effects
  - Mouse interaction handling
  - Animation coordination
  - Clone management for selected cards

#### ResumeListController (`modules/resume/ResumeListController.mjs`)
```javascript
class ResumeListController extends BaseComponent {
  getDependencies() { 
    return ['StateManager', 'SelectionManager']; 
  }
  // Manages resume container content
  // Handles infinite scrolling
  // Coordinates with CardsController for selection sync
}
export const resumeListController = new ResumeListController();
```
- **Role**: Manages resume container content and infinite scrolling
- **Dependencies**: StateManager, SelectionManager
- **Dependents**: Vue components, infinite scroll system
- **Key Features**:
  - Infinite scrolling container management
  - Resume item rendering
  - Selection synchronization with scene

### 3. Specialized Service Components

These components provide specific functionality and often implement singleton patterns.

#### BadgeManager (`modules/core/badgeManager.mjs`)
```javascript
class BadgeManager extends BaseComponent {
  getDependencies() { 
    return ['StateManager', 'CardsController']; 
  }
  // Manages skill badge positioning and clustering
  // Handles badge-to-card relationships
  // Provides badge positioning algorithms
}
export const badgeManager = new BadgeManager();
```
- **Role**: Skill badge management and positioning
- **Dependencies**: StateManager, CardsController
- **Dependents**: SkillBadges Vue component
- **Key Features**:
  - Badge clustering algorithms
  - Position calculation
  - Badge-to-job relationship management

#### CoordinateManager (`modules/core/coordinateManager.mjs`)
```javascript
class CoordinateManager {
  // Handles coordinate transformations
  // Manages viewport-to-scene conversions
  // Provides parallax calculations
}
export const coordinateManager = new CoordinateManager();
```
- **Role**: Coordinate system transformations
- **Dependencies**: None
- **Dependents**: CardsController, BadgeManager, parallax systems
- **Relationships**: Utility component used for spatial calculations

### 4. Vue Composables

Reactive composables provide Vue-specific functionality with singleton-like behavior.

#### useViewport (`modules/composables/useViewport.mjs`)
```javascript
let _viewportInstance = null;

export function useViewport(label = 'unnamed') {
  if (_viewportInstance) {
    return _viewportInstance;
  }
  
  // Singleton pattern for Vue composables
  _viewportInstance = {
    width: ref(window.innerWidth),
    height: ref(window.innerHeight),
    // ... other reactive properties
  };
  
  return _viewportInstance;
}
```
- **Role**: Reactive viewport dimensions and state
- **Dependencies**: None
- **Dependents**: Multiple Vue components
- **Pattern**: Singleton composable with reactive refs

#### useBullsEye (`modules/composables/useBullsEye.mjs`)
```javascript
export function useBullsEye() {
  // Manages bulls-eye positioning in scene center
  // Provides focal point reference
  // Handles parallax calculations
}
```
- **Role**: Bulls-eye positioning and focal point management
- **Dependencies**: useViewport
- **Dependents**: AppContent.vue, parallax system
- **Relationships**: Works with focal point and aim point systems

#### useColorPalette (`modules/composables/useColorPalette.mjs`)
```javascript
export function useColorPalette() {
  // Manages dynamic color palette loading
  // Applies colors to elements via CSS custom properties
  // Handles palette switching and persistence
}
```
- **Role**: Dynamic color palette management
- **Dependencies**: None (has ready promise)
- **Dependents**: All UI components requiring theming
- **Key Features**:
  - Server-side palette loading
  - CSS custom property injection
  - Palette switching with persistence

### 5. Infrastructure Components

These components provide development and runtime support services.

#### ComponentScanner (`modules/core/componentScanner.mjs`)
```javascript
class ComponentScanner {
  // Scans codebase for BaseComponent implementations
  // Validates component compliance
  // Generates compliance reports
}
export const componentScanner = new ComponentScanner();
```
- **Role**: Development-time component validation
- **Dependencies**: None
- **Purpose**: Ensures all components follow IM framework patterns

#### DependencyEnforcement (`modules/core/dependencyEnforcement.mjs`)
```javascript
class DependencyEnforcement {
  // Runtime validation of component dependencies
  // Prevents circular dependencies
  // Enforces initialization order
}
export const dependencyEnforcement = new DependencyEnforcement();
```
- **Role**: Runtime dependency validation
- **Dependencies**: InitializationManager
- **Purpose**: Prevents runtime dependency violations

### Component Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                          Vue Layer                              │
├─────────────────────────────────────────────────────────────────┤
│ AppContent.vue → Timeline.vue → SkillBadges.vue                 │
│      ↓              ↓              ↓                           │
│ useViewport → useBullsEye → useColorPalette                     │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      Controller Layer                          │
├─────────────────────────────────────────────────────────────────┤
│ CardsController ←→ ResumeListController                         │
│      ↓                    ↓                                    │
│ BadgeManager         InfiniteScrolling                          │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                       Core Services                            │
├─────────────────────────────────────────────────────────────────┤
│ InitializationManager → StateManager → SelectionManager        │
│                    ↓                                           │
│              Service Locator Registry                          │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      Utility Layer                             │
├─────────────────────────────────────────────────────────────────┤
│ CoordinateManager → CSSVariableInjector → ComponentScanner     │
└─────────────────────────────────────────────────────────────────┘
```

### Initialization Order and Dependencies

The IM framework ensures components initialize in the correct order:

```
1. Core Services (No Dependencies)
   ├── InitializationManager (auto-initialized)
   ├── StateManager
   ├── SelectionManager
   └── EventBus

2. Utility Services (Core Dependencies)
   ├── CoordinateManager
   ├── CSSVariableInjector  
   └── ComponentScanner

3. Controllers (Core + Utility Dependencies)
   ├── CardsController → [StateManager, SelectionManager]
   ├── ResumeListController → [StateManager, SelectionManager]
   └── BadgeManager → [StateManager, CardsController]

4. Vue Composables (Independent)
   ├── useViewport (singleton)
   ├── useColorPalette (with ready promise)
   └── useBullsEye → [useViewport]

5. Vue Components (Manual Registration)
   ├── Layout → [CardsController, ResumeListController]
   ├── ReactiveSystems → [Layout]
   └── SceneSystems → [Layout]
```

### Key Relationships and Communication Patterns

#### 1. Event-Driven Communication
```javascript
// SelectionManager dispatches events that controllers listen for
selectionManager.addEventListener('selection-changed', (event) => {
  cardsController.handleSelectionChange(event.detail);
  resumeListController.syncSelection(event.detail);
});
```

#### 2. Service Locator Pattern
```javascript
// Components retrieve dependencies through IM service locator
async initialize() {
  this.stateManager = initializationManager.getComponent('StateManager');
  this.selectionManager = initializationManager.getComponent('SelectionManager');
}
```

#### 3. Reactive State Propagation
```javascript
// Vue composables provide reactive state across components
const viewport = useViewport();
const bullsEye = useBullsEye(); // Automatically gets viewport dependency
const colorPalette = useColorPalette(); // Independent singleton
```

#### 4. Promise-Based Initialization
```javascript
// Components wait for dependencies before initializing
initializationManager.register(
  'BadgeManager',
  async () => {
    await initializationManager.waitForComponents(['CardsController']);
    badgeManager.initialize();
  },
  ['StateManager', 'CardsController']
);
```

### Component Testing and Validation

Each component type has specific validation requirements:

#### Controllers
- Must extend BaseComponent
- Must implement initialize() and destroy()
- Must declare dependencies correctly
- Must register with IM

#### Singletons
- Constructor must return same instance
- Must have static instance property
- Must implement proper cleanup

#### Vue Composables
- Must follow singleton pattern if shared state
- Must handle reactive dependencies correctly
- Must integrate with Vue lifecycle

#### Vue Components
- Must register with IM in setup/mounted
- Must declare component dependencies
- Must use service locator for dependency access

### Vue Import Patterns and Dependency Injection

Understanding the difference between importing Vue **composables** vs **components** is crucial for proper IM dependency management:

#### Vue Composables (Reactive Functions)
**What they are:** JavaScript functions that return reactive state and methods using Vue's Composition API.

**Import pattern:**
```javascript
// ✅ Correct - Named import for composables
import { useAimPoint } from '@/modules/composables/useAimPoint.mjs';
import { useFocalPoint } from '@/modules/composables/useFocalPoint.mjs';
import { useBullsEye } from '@/modules/composables/useBullsEye.mjs';
```

**Usage in IM dependencies:**
```javascript
// In your component's initialize method
initialize(dependencies) {
  // Dependencies provide instances, not the composable functions
  this.aimPoint = dependencies.aimPoint;        // Instance from useAimPoint()
  this.focalPoint = dependencies.focalPoint;    // Instance from useFocalPoint()
  this.bullsEye = dependencies.bullsEye;        // Instance from useBullsEye()
}
```

#### Vue Components (.vue files)
**What they are:** Single File Components that define templates, scripts, and styles.

**Import pattern:**
```javascript
// ✅ Correct - Default import for .vue components
import SceneContainer from '@/modules/components/SceneContainer.vue';
import ResizeHandle from '@/modules/components/ResizeHandle.vue';

// ❌ Incorrect - Don't use namespace imports for .vue files
// import * as UseSceneContainer from "useSceneContainer.vue";  // Wrong!
```

**Usage in IM dependencies:**
```javascript
// In your component's initialize method
initialize(dependencies) {
  // Dependencies provide component instances or refs
  this.sceneContainer = dependencies.sceneContainer;    // Component instance/ref
  this.resizeHandle = dependencies.resizeHandle;        // Component instance/ref
}
```

#### Key Differences Summary

| Type | File Extension | Import Style | IM Registration | Purpose |
|------|----------------|--------------|-----------------|---------|
| **Composables** | `.mjs` | Named import `{ useX }` | Singleton instance | Reactive state/logic |
| **Components** | `.vue` | Default import | Component ref | UI elements |

#### Anti-Pattern: getElementById
**❌ Never use direct DOM access:**
```javascript
// ❌ Bad - bypasses IM dependency system
this._sceneContainer = document.getElementById('scene-container');
```

**✅ Use dependency injection instead:**
```javascript
// ✅ Good - proper IM dependency pattern
initialize(dependencies) {
  this.sceneContainer = dependencies.sceneContainer;  // Reference from IM
}
```

This architecture ensures clean separation of concerns, predictable initialization order, and maintainable component relationships throughout the application.

## Performance Considerations

### Initialization Overhead

The IM framework introduces minimal performance overhead while providing significant architectural benefits:

#### Time Complexity
- **Component Registration**: O(1) per component
- **Dependency Resolution**: O(V + E) where V = components, E = dependencies (topological sort)
- **Circular Dependency Detection**: O(V + E) using DFS
- **Initialization**: O(n) where n = number of components

#### Memory Usage
```javascript
// Memory footprint per component (approximate)
const componentOverhead = {
  componentRegistry: '~200 bytes per component',
  dependencyMap: '~100 bytes per dependency',
  initializationPromise: '~150 bytes per component',
  serviceLocatorEntry: '~50 bytes per component'
};

// Total: ~500 bytes + dependencies per component
```

#### Optimization Strategies

**1. Lazy Loading for Large Applications**
```javascript
// Defer non-critical component registration
class LazyComponent extends BaseComponent {
  constructor() {
    super('LazyComponent');
    this.priority = 'low'; // Initialize after critical components
  }

  async initialize({ CriticalDependency }) {
    // Only initialize when actually needed
    if (this.shouldInitialize()) {
      await this.setupExpensiveOperations();
    }
  }
}
```

**2. Batch Operations**
```javascript
// Register multiple components efficiently
const batchRegistration = [
  { name: 'ComponentA', deps: ['StateManager'] },
  { name: 'ComponentB', deps: ['StateManager', 'ComponentA'] },
  { name: 'ComponentC', deps: ['ComponentB'] }
];

// IM processes these in optimal order automatically
batchRegistration.forEach(({ name, deps }) => {
  initializationManager.registerSync(name, initFn, deps);
});
```

**3. Priority-Based Loading**
```javascript
class HighPriorityComponent extends BaseComponent {
  getPriority() {
    return 'critical'; // Initialize first
  }
}

class BackgroundComponent extends BaseComponent {
  getPriority() {
    return 'low'; // Initialize when system is idle
  }
}
```

#### Performance Monitoring
```javascript
// Monitor initialization times
const performanceTracker = {
  async trackComponentInit(componentName) {
    const start = performance.now();
    await initializationManager.waitForComponent(componentName);
    const duration = performance.now() - start;
    
    console.log(`[PERF] ${componentName}: ${duration.toFixed(2)}ms`);
    
    if (duration > 100) {
      console.warn(`[PERF] Slow initialization: ${componentName}`);
    }
  }
};
```

### Scalability Guidelines

**For Applications with 50+ Components:**
- Use priority-based initialization
- Implement lazy loading for non-critical components  
- Monitor dependency graph complexity
- Consider component grouping/bundling

**For Applications with 100+ Components:**
- Implement progressive loading
- Use worker threads for expensive initialization
- Cache dependency resolution results
- Profile memory usage regularly

## Testing Strategies for IM Components

### Unit Testing Patterns

#### 1. Component Isolation Testing
```javascript
// tests/components/stateManager.test.js
import { StateManager } from '../../modules/core/stateManager.mjs';

describe('StateManager', () => {
  let stateManager;
  
  beforeEach(() => {
    // Create isolated instance for testing
    stateManager = new StateManager();
  });
  
  afterEach(() => {
    // Clean up component state
    stateManager.destroy();
  });

  test('initializes without dependencies', async () => {
    await stateManager.initialize();
    expect(stateManager.isInitialized).toBe(true);
  });

  test('manages state correctly', () => {
    stateManager.setState('testKey', 'testValue');
    expect(stateManager.getState('testKey')).toBe('testValue');
  });
});
```

#### 2. Dependency Injection Testing
```javascript
// tests/components/cardsController.test.js
import { CardsController } from '../../modules/scene/CardsController.mjs';

describe('CardsController', () => {
  let cardsController;
  let mockDependencies;
  
  beforeEach(() => {
    // Create mock dependencies
    mockDependencies = {
      VueDomManager: { isDomReady: true },
      StateManager: { 
        getState: jest.fn(),
        setState: jest.fn()
      },
      SelectionManager: { 
        addEventListener: jest.fn(),
        dispatchEvent: jest.fn()
      }
    };
    
    cardsController = new CardsController();
  });

  test('initializes with injected dependencies', async () => {
    await cardsController.initialize(mockDependencies);
    
    expect(cardsController.stateManager).toBe(mockDependencies.StateManager);
    expect(cardsController.selectionManager).toBe(mockDependencies.SelectionManager);
  });
});
```

### Integration Testing

#### 1. IM Framework Integration Tests
```javascript
// tests/integration/im-framework.test.js
import { initializationManager } from '../../modules/core/initializationManager.mjs';

describe('IM Framework Integration', () => {
  beforeEach(() => {
    // Reset IM state for clean testing
    initializationManager.reset();
  });

  test('initializes components in correct dependency order', async () => {
    const initOrder = [];
    
    // Create test components with dependencies
    const componentA = createTestComponent('A', [], initOrder);
    const componentB = createTestComponent('B', ['A'], initOrder);
    const componentC = createTestComponent('C', ['A', 'B'], initOrder);
    
    // Start initialization
    await initializationManager.startApplication();
    
    // Verify order: A -> B -> C
    expect(initOrder).toEqual(['A', 'B', 'C']);
  });

  test('detects circular dependencies', () => {
    expect(() => {
      // Create circular dependency: A -> B -> A
      initializationManager.registerSync('A', async () => {}, ['B']);
      initializationManager.registerSync('B', async () => {}, ['A']);
    }).toThrow('Circular dependency detected');
  });
});
```

#### 2. End-to-End Component Testing
```javascript
// tests/e2e/component-lifecycle.test.js
describe('Component Lifecycle E2E', () => {
  test('complete application startup', async () => {
    // Simulate full application startup
    const appStartTime = performance.now();
    
    // Start IM initialization
    const initResult = await initializationManager.startApplication();
    
    const appStartDuration = performance.now() - appStartTime;
    
    // Verify all critical components initialized
    expect(initResult.StateManager).toBeDefined();
    expect(initResult.SelectionManager).toBeDefined();
    expect(initResult.CardsController).toBeDefined();
    
    // Performance assertions
    expect(appStartDuration).toBeLessThan(5000); // 5 second max startup
    
    // Verify component interactions work
    const stateManager = initializationManager.getComponent('StateManager');
    const selectionManager = initializationManager.getComponent('SelectionManager');
    
    stateManager.setState('selectedCard', 'card-123');
    selectionManager.dispatchEvent(new CustomEvent('selection-changed', {
      detail: { cardId: 'card-123' }
    }));
    
    // Verify state propagated correctly
    expect(stateManager.getState('selectedCard')).toBe('card-123');
  });
});
```

### Mock Component Creation

#### Test Component Factory
```javascript
// tests/helpers/mockComponents.js
export function createTestComponent(name, dependencies = [], initOrder = []) {
  class TestComponent extends BaseComponent {
    constructor() {
      super(name);
    }

    async initialize(deps = {}) {
      initOrder.push(name);
      
      // Simulate async initialization
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Store injected dependencies
      this.dependencies = deps;
      
      console.log(`[TEST] ${name} initialized with:`, Object.keys(deps));
    }

    destroy() {
      this.isInitialized = false;
    }
  }

  const component = new TestComponent();
  
  // Override getDependencies to return test dependencies
  component.getDependencies = () => dependencies;
  
  return component;
}
```

#### Dependency Mocking Utilities
```javascript
// tests/helpers/mockDependencies.js
export function createMockStateManager() {
  return {
    componentName: 'StateManager',
    isInitialized: true,
    state: new Map(),
    
    getState: jest.fn((key) => this.state.get(key)),
    setState: jest.fn((key, value) => this.state.set(key, value)),
    clearState: jest.fn(() => this.state.clear())
  };
}

export function createMockSelectionManager() {
  return {
    componentName: 'SelectionManager',
    isInitialized: true,
    listeners: new Map(),
    
    addEventListener: jest.fn((event, handler) => {
      if (!this.listeners.has(event)) {
        this.listeners.set(event, []);
      }
      this.listeners.get(event).push(handler);
    }),
    
    dispatchEvent: jest.fn((event) => {
      const handlers = this.listeners.get(event.type) || [];
      handlers.forEach(handler => handler(event));
    })
  };
}
```

### Testing Best Practices

#### 1. Test Component Contracts
```javascript
// Always test the component interface
test('implements BaseComponent interface', () => {
  const component = new MyComponent();
  
  expect(component).toBeInstanceOf(BaseComponent);
  expect(typeof component.initialize).toBe('function');
  expect(typeof component.destroy).toBe('function');
  expect(component.componentName).toBeDefined();
});
```

#### 2. Test Dependency Injection
```javascript
// Test that dependencies are properly injected and used
test('uses injected dependencies', async () => {
  const mockDeps = createMockDependencies();
  await component.initialize(mockDeps);
  
  // Verify component uses dependencies, not imports
  component.someOperation();
  expect(mockDeps.StateManager.setState).toHaveBeenCalled();
});
```

#### 3. Test Error Handling
```javascript
// Test component behavior with failed dependencies
test('handles dependency failures gracefully', async () => {
  const failingDeps = {
    StateManager: null, // Missing dependency
    SelectionManager: { 
      addEventListener: () => { throw new Error('Connection failed'); }
    }
  };
  
  await expect(component.initialize(failingDeps))
    .rejects.toThrow('Dependency initialization failed');
});
```

## Migration Checklist for Teams

### Pre-Migration Assessment

#### 1. Inventory Existing Components
```bash
# Scan codebase for components that need migration
node -e "
import { componentScanner } from './modules/core/componentScanner.mjs';
const results = await componentScanner.scanProject('.');
console.log(componentScanner.generateReport());
"
```

#### 2. Identify High-Priority Components
- **Critical Path Components**: Components that block application startup
- **Shared Dependencies**: Components used by multiple other components  
- **Complex Components**: Components with many dependencies or side effects

#### 3. Map Current Dependencies
```javascript
// Create dependency map of existing components
const currentDependencies = {
  'CardsController': ['stateManager', 'selectionManager'],
  'ResumeListController': ['stateManager', 'infiniteScroll'],
  // ... map all components
};
```

### Migration Phases

#### Phase 1: Foundation (Week 1-2)
- [ ] **Install IM Framework Dependencies**
  - [ ] Import BaseComponent abstract class
  - [ ] Set up InitializationManager singleton
  - [ ] Create VueDomManager component

- [ ] **Convert Core Service Components**
  - [ ] StateManager → BaseComponent extension
  - [ ] SelectionManager → BaseComponent extension  
  - [ ] EventBus → BaseComponent extension

- [ ] **Update Component Registration**
  - [ ] Remove manual singleton patterns
  - [ ] Add BaseComponent constructors with super() calls
  - [ ] Verify auto-registration works

#### Phase 2: Controllers (Week 3-4)
- [ ] **Convert Controller Components**
  - [ ] CardsController → BaseComponent + dependency injection
  - [ ] ResumeListController → BaseComponent + dependency injection
  - [ ] BadgeManager → BaseComponent + dependency injection

- [ ] **Update Initialization Methods**
  - [ ] Change from constructor logic to initialize() methods
  - [ ] Replace direct imports with service locator calls
  - [ ] Add dependency declarations

- [ ] **Update Destruction Logic**
  - [ ] Add destroy() method implementations
  - [ ] Move cleanup logic from manual cleanup to destroy()
  - [ ] Test component cleanup behavior

#### Phase 3: Vue Components (Week 5-6)
- [ ] **Vue Component Integration**
  - [ ] Add IM registration in setup() or mounted() lifecycle
  - [ ] Replace direct component imports with service locator
  - [ ] Add component dependency declarations

- [ ] **Composable Updates** 
  - [ ] Update Vue composables to work with IM
  - [ ] Ensure singleton composables integrate properly
  - [ ] Test reactive state management

- [ ] **Template Updates**
  - [ ] Update Vue templates to use IM-managed components
  - [ ] Test component reactivity and lifecycle

#### Phase 4: Validation & Testing (Week 7)
- [ ] **Run Migration Validator**
  ```javascript
  // Check migration status
  const results = await imMigrationValidator.validateIMMigration('.');
  console.log(imMigrationValidator.generateMigrationReport());
  ```

- [ ] **Fix Validation Issues**
  - [ ] Address HIGH priority issues (service locator, BaseComponent)
  - [ ] Fix MEDIUM priority issues (dependency injection, signatures)
  - [ ] Resolve any circular dependencies

- [ ] **Integration Testing**
  - [ ] Test complete application startup
  - [ ] Verify component interactions work
  - [ ] Performance testing and optimization

### Component Migration Template

#### Before (Legacy Pattern)
```javascript
// Legacy component pattern
class OldComponent {
  constructor() {
    // Direct imports and initialization
    this.stateManager = window.stateManager;
    this.selectionManager = import('./selectionManager.mjs');
    this.init();
  }
  
  init() {
    this.setupEventListeners();
    this.createElements();
  }
  
  cleanup() {
    // Manual cleanup
  }
}

const component = new OldComponent();
export { component };
```

#### After (IM Framework Pattern)
```javascript
// IM framework pattern
import { BaseComponent } from '../core/abstracts/BaseComponent.mjs';

class NewComponent extends BaseComponent {
  constructor() {
    super('NewComponent'); // Auto-registers with IM
  }

  async initialize({ StateManager, SelectionManager }) {
    // Dependencies injected via parameter
    this.stateManager = StateManager;
    this.selectionManager = SelectionManager;
    
    this.setupEventListeners();
    this.createElements();
    
    console.log('[NewComponent] Initialized');
  }

  destroy() {
    this.removeEventListeners();
    this.cleanup();
    this.isInitialized = false;
  }

  // Component-specific methods...
}

export const newComponent = new NewComponent();
```

### Migration Scripts

#### Automated Pattern Replacement
```bash
#!/bin/bash
# migrate-component.sh - Semi-automated migration helper

COMPONENT_FILE=$1

if [ -z "$COMPONENT_FILE" ]; then
  echo "Usage: ./migrate-component.sh <component-file>"
  exit 1
fi

echo "Migrating $COMPONENT_FILE to IM framework pattern..."

# 1. Add BaseComponent import
sed -i '1i import { BaseComponent } from "../core/abstracts/BaseComponent.mjs";' "$COMPONENT_FILE"

# 2. Replace class declaration
sed -i 's/class \([A-Za-z]*\) {/class \1 extends BaseComponent {/' "$COMPONENT_FILE"

# 3. Add super() call to constructor
sed -i '/constructor() {/a\    super("'$(basename "$COMPONENT_FILE" .mjs)'");' "$COMPONENT_FILE"

# 4. Convert init() to initialize()
sed -i 's/init(/initialize(/' "$COMPONENT_FILE"
sed -i 's/async init(/async initialize(/' "$COMPONENT_FILE"

echo "Migration complete. Manual review required for:"
echo "- Dependency injection parameter"
echo "- Service locator calls"
echo "- Destroy method implementation"
```

#### Validation Script
```javascript
// scripts/validate-migration.mjs
import { imMigrationValidator } from '../modules/core/imMigrationValidator.mjs';

async function validateMigration() {
  console.log('🔄 Running migration validation...');
  
  const results = await imMigrationValidator.validateIMMigration('.');
  
  if (results.complianceStats.fullyMigrated === results.complianceStats.total) {
    console.log('✅ Migration complete! All components migrated.');
    return true;
  } else {
    console.log('❌ Migration incomplete:');
    console.log(imMigrationValidator.generateMigrationReport());
    
    // Enforce compliance in CI/CD
    if (process.env.CI) {
      imMigrationValidator.enforceIMCompliance();
    }
    
    return false;
  }
}

validateMigration().catch(console.error);
```

### Rollback Strategy

#### Component-Level Rollback
```javascript
// Keep legacy versions during migration
const componentVersions = {
  'StateManager': {
    legacy: './legacy/stateManager.mjs',
    migrated: './core/stateManager.mjs'
  }
};

// Feature flag for gradual rollout
const USE_IM_FRAMEWORK = process.env.USE_IM_FRAMEWORK === 'true';

if (USE_IM_FRAMEWORK) {
  await import('./core/stateManager.mjs');
} else {
  await import('./legacy/stateManager.mjs');
}
```

#### Testing Strategy During Migration
- **Parallel Running**: Run both legacy and IM versions in test environment
- **A/B Testing**: Gradually roll out IM framework to subset of users
- **Performance Monitoring**: Track initialization times and memory usage
- **Rollback Triggers**: Automatic rollback if error rates exceed threshold

### Success Criteria

#### Technical Metrics
- [ ] **100% Migration Rate**: All components extend BaseComponent
- [ ] **Zero Service Locator Usage**: No components use `initializationManager.getComponent()` in initialize()
- [ ] **Zero Circular Dependencies**: Dependency graph validates successfully
- [ ] **Performance Maintained**: Startup time within 10% of baseline

#### Quality Metrics  
- [ ] **Test Coverage**: All migrated components have unit tests
- [ ] **Documentation**: All components documented with dependencies
- [ ] **Code Review**: All migration changes reviewed by team
- [ ] **Validation Passes**: Migration validator reports 100% compliance

## Debugging Guide for IM Initialization Issues

### Common Initialization Problems

#### 1. Component Not Initializing

**Symptoms:**
```
[INIT] Component 'MyComponent' status: pending
[INIT] MyComponent cannot initialize despite dependency order
```

**Diagnostic Steps:**
```javascript
// Check component registration
const status = initializationManager.getStatus();
console.log('Component status:', status['MyComponent']);

// Check if dependencies are registered
const component = initializationManager.components.get('MyComponent');
console.log('Dependencies:', Array.from(component.dependencies));

// Check dependency status
component.dependencies.forEach(dep => {
  const depStatus = status[dep];
  console.log(`Dependency '${dep}':`, depStatus);
});
```

**Common Causes & Solutions:**
```javascript
// CAUSE: Missing dependency registration
// SOLUTION: Ensure dependency extends BaseComponent
class MissingDependency extends BaseComponent {
  constructor() {
    super('MissingDependency'); // This registers with IM
  }
}

// CAUSE: Typo in dependency name
// SOLUTION: Check spelling matches component name exactly
async initialize({ StateManager }) { // Must match 'StateManager' exactly
  this.stateManager = StateManager;
}

// CAUSE: Circular dependency
// SOLUTION: Break circular reference
class ComponentA extends BaseComponent {
  // Remove ComponentB from dependencies, use events instead
  async initialize({ EventBus }) {
    this.eventBus = EventBus;
    this.eventBus.addEventListener('component-b-ready', this.handleBReady);
  }
}
```

#### 2. "Dependency Not Found in Registry" Error

**Error Message:**
```
❌ [INIT] Dependency 'SelectionManager' for component 'CardsController' not found in registry
```

**Diagnostic Commands:**
```javascript
// Check what's actually registered
const availableComponents = initializationManager.getAvailableComponents();
console.log('Available components:', availableComponents);

// Check component registry vs. initialization promises
console.log('Registry:', Array.from(initializationManager.componentRegistry.keys()));
console.log('Promises:', Array.from(initializationManager.initializationPromises.keys()));

// Check if component constructed but not initialized
const components = Array.from(initializationManager.components.keys());
console.log('Registered components:', components);
```

**Solutions:**
```javascript
// SOLUTION 1: Import the component file to trigger registration
import './modules/core/selectionManager.mjs'; // Triggers constructor -> registration

// SOLUTION 2: Check component extends BaseComponent
class SelectionManager extends BaseComponent { // Must extend BaseComponent
  constructor() {
    super('SelectionManager'); // Must call super with exact name
  }
}

// SOLUTION 3: Verify singleton export
export const selectionManager = new SelectionManager(); // Must instantiate
```

#### 3. Race Conditions and Timing Issues  

**Symptoms:**
```
[INIT] Component 'VueDomManager' initialized
[INIT] Component 'SceneContainer' trying to access DOM before VueDomManager ready
```

**Debug Race Conditions:**
```javascript
async function debugRaceCondition(componentName) {
  console.log(`🔍 Debugging ${componentName} initialization...`);
  
  const component = initializationManager.components.get(componentName);
  const deps = Array.from(component.dependencies);
  
  // Check each dependency status
  for (const dep of deps) {
    const depPromise = initializationManager.initializationPromises.get(dep);
    const isReady = initializationManager.readyComponents.has(dep);
    
    console.log(`Dependency '${dep}': Ready=${isReady}`);
    
    if (!isReady) {
      console.log(`⏳ Waiting for ${dep}...`);
      try {
        await depPromise;
        console.log(`✅ ${dep} is now ready`);
      } catch (error) {
        console.error(`❌ ${dep} failed to initialize:`, error);
      }
    }
  }
}

// Usage
await debugRaceCondition('SceneContainer');
```

**Solutions:**
```javascript
// SOLUTION 1: Explicit dependency declaration
class SceneContainer extends BaseComponent {
  async initialize({ VueDomManager }) { // VueDomManager ensures DOM ready
    // DOM is guaranteed to be ready here
    this.element = document.getElementById('scene-container');
  }
}

// SOLUTION 2: Add missing DOM dependency  
class ComponentNeedingDOM extends BaseComponent {
  constructor() {
    super('ComponentNeedingDOM');
  }

  async initialize({ VueDomManager }) { // Add this dependency
    // Now safe to access DOM
  }
}
```

#### 4. Circular Dependency Detection

**Error Message:**
```
❌ FATAL: Circular dependency detected: ComponentA -> ComponentB -> ComponentC -> ComponentA
```

**Circular Dependency Debugging:**
```javascript
function analyzeDependencyGraph() {
  const dependencies = initializationManager.dependencies;
  const graph = {};
  
  // Build graph representation
  for (const [component, deps] of dependencies) {
    graph[component] = Array.from(deps);
  }
  
  console.log('📊 Dependency Graph:');
  console.log(JSON.stringify(graph, null, 2));
  
  // Find strongly connected components (cycles)
  const visited = new Set();
  const recursionStack = new Set();
  
  function findCycle(node, path = []) {
    if (recursionStack.has(node)) {
      const cycleStart = path.indexOf(node);
      const cycle = [...path.slice(cycleStart), node];
      console.log('🔄 Found cycle:', cycle.join(' -> '));
      return cycle;
    }
    
    if (visited.has(node)) return null;
    
    visited.add(node);
    recursionStack.add(node);
    path.push(node);
    
    for (const dep of graph[node] || []) {
      const cycle = findCycle(dep, [...path]);
      if (cycle) return cycle;
    }
    
    recursionStack.delete(node);
    path.pop();
    return null;
  }
  
  // Check each component for cycles
  for (const component of Object.keys(graph)) {
    if (!visited.has(component)) {
      const cycle = findCycle(component);
      if (cycle) {
        return cycle;
      }
    }
  }
  
  return null;
}

// Usage
const cycle = analyzeDependencyGraph();
if (cycle) {
  console.log('❌ Circular dependency found:', cycle);
} else {
  console.log('✅ No circular dependencies detected');
}
```

**Breaking Circular Dependencies:**
```javascript
// BEFORE: Circular dependency
class ComponentA extends BaseComponent {
  async initialize({ ComponentB }) { // A depends on B
    this.componentB = ComponentB;
  }
}

class ComponentB extends BaseComponent {
  async initialize({ ComponentA }) { // B depends on A ❌ CIRCULAR
    this.componentA = ComponentA;
  }
}

// SOLUTION 1: Event-driven communication
class ComponentA extends BaseComponent {
  async initialize({ EventBus }) {
    this.eventBus = EventBus;
    this.eventBus.addEventListener('component-b-ready', this.handleBReady);
  }
  
  handleBReady = (event) => {
    this.componentB = event.detail.component; // Get B through event
  }
}

class ComponentB extends BaseComponent {
  async initialize({ EventBus }) {
    this.eventBus = EventBus;
    // Notify A that B is ready
    this.eventBus.dispatchEvent(new CustomEvent('component-b-ready', {
      detail: { component: this }
    }));
  }
}

// SOLUTION 2: Common dependency
class SharedService extends BaseComponent {
  async initialize() {
    this.dataStore = new Map();
  }
}

class ComponentA extends BaseComponent {
  async initialize({ SharedService }) {
    this.shared = SharedService; // Both use shared service
  }
}

class ComponentB extends BaseComponent {
  async initialize({ SharedService }) {
    this.shared = SharedService; // No direct dependency between A & B
  }
}
```

#### 5. Vue DOM Readiness Issues

**Symptoms:**
```
[SceneContainer] scene-container element not found - check Vue template
[ERROR] Cannot access DOM elements during initialization
```

**DOM Readiness Debugging:**
```javascript
function debugDOMReadiness() {
  console.log('🔍 DOM Readiness Debug:');
  console.log('Document ready state:', document.readyState);
  console.log('Vue app mounted:', !!window.Vue);
  console.log('VueDomManager ready:', initializationManager.readyComponents.has('VueDomManager'));
  
  // Check for expected DOM elements
  const expectedElements = ['#app', '#scene-container', '#resume-container'];
  expectedElements.forEach(selector => {
    const element = document.querySelector(selector);
    console.log(`Element '${selector}':`, element ? 'Found' : 'Missing');
  });
  
  // Check VueDomManager status
  const vueDomManager = initializationManager.getComponent('VueDomManager');
  if (vueDomManager) {
    console.log('VueDomManager isDomReady:', vueDomManager.isDomReady);
  } else {
    console.log('❌ VueDomManager not available');
  }
}

// Run during initialization issues
debugDOMReadiness();
```

**Solutions:**
```javascript
// SOLUTION 1: Always depend on VueDomManager for DOM access
class SceneContainer extends BaseComponent {
  async initialize({ VueDomManager }) { // Add VueDomManager dependency
    // DOM is guaranteed ready here
    this.element = document.getElementById('scene-container');
    
    if (!this.element) {
      throw new Error('scene-container element not found - check Vue template');
    }
  }
}

// SOLUTION 2: Wait for Vue DOM ready event in Vue app
// main.ts or App.vue
const app = createApp(App);
app.mount('#app');

// Dispatch DOM ready event AFTER mounting
window.dispatchEvent(new CustomEvent('vue-dom-ready'));
```

### Debugging Tools and Utilities

#### 1. IM Status Dashboard
```javascript
// Debug utility: Real-time IM status
function createIMDashboard() {
  const dashboard = {
    showStatus() {
      const status = initializationManager.getStatus();
      console.table(status);
    },
    
    showDependencies() {
      const graph = initializationManager.getDependencyGraph();
      console.log(graph);
    },
    
    showTimeline() {
      const components = Array.from(initializationManager.components.entries());
      const timeline = components.map(([name, component]) => ({
        component: name,
        status: component.status,
        dependencies: Array.from(component.dependencies),
        ready: initializationManager.readyComponents.has(name)
      }));
      
      console.table(timeline);
    },
    
    async waitAndLog(componentName) {
      console.log(`⏳ Waiting for ${componentName}...`);
      const start = performance.now();
      
      try {
        await initializationManager.waitForComponent(componentName);
        const duration = performance.now() - start;
        console.log(`✅ ${componentName} ready after ${duration.toFixed(2)}ms`);
      } catch (error) {
        console.error(`❌ ${componentName} failed:`, error);
      }
    }
  };
  
  // Make available globally for debugging
  window.IMDebug = dashboard;
  return dashboard;
}

// Usage in browser console:
// IMDebug.showStatus()
// IMDebug.showDependencies()
// await IMDebug.waitAndLog('CardsController')
```

#### 2. Component Dependency Tracer
```javascript
// Trace why a component can't initialize
async function traceComponent(componentName) {
  console.log(`🔍 Tracing ${componentName} initialization...`);
  
  const component = initializationManager.components.get(componentName);
  if (!component) {
    console.error(`❌ Component '${componentName}' not registered`);
    return;
  }
  
  console.log(`📋 Status: ${component.status}`);
  console.log(`📋 Dependencies: [${Array.from(component.dependencies).join(', ')}]`);
  
  // Check each dependency
  for (const dep of component.dependencies) {
    const isReady = initializationManager.readyComponents.has(dep);
    const depComponent = initializationManager.components.get(dep);
    
    if (!depComponent) {
      console.error(`❌ Dependency '${dep}' not registered`);
      continue;
    }
    
    if (!isReady) {
      console.warn(`⏳ Dependency '${dep}' not ready (status: ${depComponent.status})`);
      
      // Recursively trace dependency
      if (depComponent.dependencies.size > 0) {
        console.log(`  └─ Tracing ${dep} dependencies...`);
        await traceComponent(dep);
      }
    } else {
      console.log(`✅ Dependency '${dep}' ready`);
    }
  }
  
  // Check if component can initialize now
  const canInit = await initializationManager.canInitialize(componentName);
  console.log(`🎯 Can initialize: ${canInit}`);
}

// Usage
await traceComponent('CardsController');
```

#### 3. Performance Profiler
```javascript
// Profile IM initialization performance
class IMProfiler {
  constructor() {
    this.measurements = new Map();
    this.startTime = null;
  }
  
  start() {
    this.startTime = performance.now();
    console.log('📊 Starting IM profiling...');
    
    // Hook into IM events
    const originalInitialize = initializationManager.initializeComponent;
    initializationManager.initializeComponent = async (componentName) => {
      const start = performance.now();
      
      try {
        const result = await originalInitialize.call(initializationManager, componentName);
        const duration = performance.now() - start;
        
        this.measurements.set(componentName, {
          duration,
          success: true,
          timestamp: Date.now()
        });
        
        console.log(`⏱️  ${componentName}: ${duration.toFixed(2)}ms`);
        return result;
      } catch (error) {
        const duration = performance.now() - start;
        this.measurements.set(componentName, {
          duration,
          success: false,
          error: error.message,
          timestamp: Date.now()
        });
        
        console.error(`❌ ${componentName}: ${duration.toFixed(2)}ms (FAILED)`);
        throw error;
      }
    };
  }
  
  generateReport() {
    const totalTime = performance.now() - this.startTime;
    const components = Array.from(this.measurements.entries());
    
    console.log('\n📊 IM Initialization Performance Report');
    console.log('='.repeat(50));
    console.log(`Total Time: ${totalTime.toFixed(2)}ms`);
    console.log(`Components: ${components.length}`);
    
    // Sort by duration
    components.sort((a, b) => b[1].duration - a[1].duration);
    
    console.log('\nSlowest Components:');
    components.slice(0, 5).forEach(([name, data], index) => {
      const status = data.success ? '✅' : '❌';
      console.log(`${index + 1}. ${status} ${name}: ${data.duration.toFixed(2)}ms`);
    });
    
    // Failed components
    const failed = components.filter(([, data]) => !data.success);
    if (failed.length > 0) {
      console.log('\n❌ Failed Components:');
      failed.forEach(([name, data]) => {
        console.log(`- ${name}: ${data.error}`);
      });
    }
  }
}

// Usage
const profiler = new IMProfiler();
profiler.start();

// After application startup
setTimeout(() => profiler.generateReport(), 5000);
```

## Conclusion

The Initialization Manager framework provides a robust foundation for managing complex application startup sequences. By enforcing implementation standards, preventing circular dependencies, and providing a service locator pattern, it enables scalable and maintainable architecture.

The comprehensive validator tests ensure that all components properly implement the IM interface requirements, follow singleton patterns where appropriate, and integrate correctly with the dependency management system. This validation framework prevents common integration issues and ensures consistent component behavior across the application.

The framework's strength lies in its **declarative approach** - components simply declare their dependencies and implement their initialization logic, while the IM handles the complex orchestration automatically. Combined with thorough validation, this leads to more reliable applications with clear separation of concerns and predictable behavior.

**Performance Considerations** ensure the framework scales effectively from small applications to enterprise-level systems with hundreds of components. The optimization strategies and monitoring tools help teams maintain fast startup times even as applications grow in complexity.

**Testing Strategies** provide comprehensive approaches for unit testing, integration testing, and end-to-end validation of IM components. The testing patterns ensure components work correctly in isolation and integrate properly within the full system.

**Migration Checklists** give teams structured approaches for converting existing applications to use the IM framework. The phase-by-phase migration strategy minimizes risk while ensuring complete coverage of all components.

**Debugging Guides** provide systematic approaches to diagnosing and resolving initialization issues. The debugging tools and utilities make it easy to understand why components aren't initializing and how to fix common problems.

Together, these additions make the IM framework documentation comprehensive and practical, providing everything teams need to successfully implement, migrate to, and maintain robust initialization management systems.