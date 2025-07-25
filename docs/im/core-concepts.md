# Core Concepts

## Dependent Components (DC)

All components in the framework must implement an **initialization interface** by extending `BaseComponent.mjs` or using the Vue mixin. These are called **Dependent Components (DC)** because they declare their dependencies and rely on the IM for proper initialization.

## Initialization Contract

Every DC must implement:
- **`initialize()`** method - Contains the component's startup logic
- **`destroy()`** method - Contains cleanup logic  
- **Dependencies via signature** - Declare dependencies via function parameters (recommended)
- **`getDependencies()`** method (fallback) - Returns array of dependency names (legacy)

## Promise-Based Architecture

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

## Signature-Based Dependency Parsing

**Modern Pattern**: Components can now declare dependencies directly in their `initialize()` function signature instead of using `getDependencies()`.

### Before (Legacy Pattern)
```javascript
class CardsController extends BaseComponent {
  getDependencies() {
    return ['VueDomManager', 'SceneContainer', 'BadgeManager', 'SelectionManager'];
  }

  initialize(dependencies) {
    this.vueDomManager = dependencies.VueDomManager;
    this.sceneContainer = dependencies.SceneContainer; 
    this.badgeManager = dependencies.BadgeManager;
    this.selectionManager = dependencies.SelectionManager;
  }
}
```

### After (Modern Pattern)
```javascript
class CardsController extends BaseComponent {
  initialize({ VueDomManager, SceneContainer, BadgeManager, SelectionManager }) {
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

## Dependency Injection Principles

### Inversion of Control (IoC)
Components don't create their dependencies - they declare what they need and receive ready-to-use instances.

### Dependency Declaration
Components explicitly list their requirements, making the dependency graph visible and analyzable.

### Lifecycle Management
The IM manages the complete lifecycle from registration through initialization to cleanup.

### Single Responsibility
Each component focuses on its core functionality while the IM handles orchestration.

## Component States

```
┌─────────────┐    register()    ┌─────────────┐    dependencies    ┌─────────────┐
│ Unregistered│ ──────────────→ │ Registered  │ ─────────────────→ │ Initializing│
└─────────────┘                 └─────────────┘                    └─────────────┘
                                                                           │
                                                                   initialize()
                                                                           ↓
┌─────────────┐    destroy()     ┌─────────────┐    complete       ┌─────────────┐
│ Destroyed   │ ←────────────── │ Initialized │ ←──────────────── │ Ready       │
└─────────────┘                 └─────────────┘                    └─────────────┘
```

## Error Handling

The IM provides robust error handling for common scenarios:

### Circular Dependencies
```javascript
// ❌ This will be detected and prevented
ComponentA depends on ComponentB
ComponentB depends on ComponentC  
ComponentC depends on ComponentA  // Circular!
```

### Missing Dependencies
```javascript
// ❌ This will throw a clear error
initialize({ NonExistentComponent }) {
  // IM will detect that NonExistentComponent was never registered
}
```

### Initialization Failures
```javascript
// ❌ If any component's initialize() fails, the entire chain stops
initialize({ WorkingComponent }) {
  throw new Error("Something went wrong");
  // All dependent components will also fail with context
}
```

---

**Next:** [Component Patterns](component-patterns.md) - Learn about BaseComponent, Vue mixins, and composables