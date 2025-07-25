# Getting Started with IM

## Quick Start

### 1. Create Your First Component

```javascript
// modules/components/MyComponent.mjs
import { BaseComponent } from '@/modules/core/abstracts/BaseComponent.mjs';

export class MyComponent extends BaseComponent {
  constructor() {
    super('MyComponent');
  }
  
  // Declare dependencies in the method signature
  initialize({ ViewPort, SceneContainer }) {
    this.viewPort = ViewPort;
    this.sceneContainer = SceneContainer;
    
    console.log('MyComponent initialized with dependencies!');
  }
  
  destroy() {
    // Cleanup logic here
    this.viewPort = null;
    this.sceneContainer = null;
  }
}
```

### 2. Register with IM

```javascript
// In your main application file
import { initializationManager } from '@/modules/core/initializationManager.mjs';
import { MyComponent } from '@/modules/components/MyComponent.mjs';

// Register the component
initializationManager.register('MyComponent', MyComponent);
```

### 3. Let IM Handle Everything

```javascript
// Start the initialization process
await initializationManager.initializeAll();

// Your component is now ready to use!
const myComponent = initializationManager.getComponent('MyComponent');
```

## Step-by-Step Tutorial

### Step 1: Understanding BaseComponent

All IM components extend `BaseComponent`:

```javascript
import { BaseComponent } from '@/modules/core/abstracts/BaseComponent.mjs';

export class Tutorial extends BaseComponent {
  constructor() {
    super('Tutorial'); // Component name for IM registration
  }
  
  initialize(dependencies) {
    // This is called when all dependencies are ready
    console.log('Tutorial component is initializing!');
  }
  
  destroy() {
    // Cleanup when component is destroyed
    console.log('Tutorial component is cleaning up!');
  }
}
```

### Step 2: Declaring Dependencies

There are two ways to declare dependencies:

#### Method 1: Signature-Based (Recommended)
```javascript
// Dependencies are automatically detected from the parameter names
initialize({ ViewPort, SceneContainer, BadgeManager }) {
  this.viewPort = ViewPort;
  this.sceneContainer = SceneContainer;
  this.badgeManager = BadgeManager;
}
```

#### Method 2: getDependencies() (Legacy)
```javascript
getDependencies() {
  return ['ViewPort', 'SceneContainer', 'BadgeManager'];
}

initialize(dependencies) {
  this.viewPort = dependencies.ViewPort;
  this.sceneContainer = dependencies.SceneContainer;
  this.badgeManager = dependencies.BadgeManager;
}
```

### Step 3: Registration Patterns

#### Simple Registration
```javascript
initializationManager.register('ComponentName', ComponentClass);
```

#### Registration with Options
```javascript
initializationManager.register('ComponentName', ComponentClass, {
  priority: 'high',        // 'low', 'medium', 'high'
  singleton: true,         // Default: true
  autoStart: true          // Default: true
});
```

#### Manual Dependency Declaration
```javascript
initializationManager.register(
  'ComponentName', 
  ComponentClass,
  ['Dependency1', 'Dependency2'] // Explicit dependencies
);
```

### Step 4: Vue Component Integration

For Vue components, use the mixin:

```javascript
import { BaseVueComponentMixin } from '@/modules/core/abstracts/BaseComponent.mjs';

export default {
  name: 'MyVueComponent',
  mixins: [BaseVueComponentMixin],
  
  initialize({ ViewPort, SceneContainer }) {
    this.viewPort = ViewPort;
    this.sceneContainer = SceneContainer;
  },
  
  mounted() {
    // Dependencies are guaranteed available here
    this.setupComponent();
  }
};
```

## Common Patterns

### Singleton Services
```javascript
export class DataService extends BaseComponent {
  constructor() {
    super('DataService');
    this.cache = new Map();
  }
  
  initialize() {
    // No dependencies needed for this service
    this.loadInitialData();
  }
  
  getData(key) {
    return this.cache.get(key);
  }
}
```

### UI Controllers
```javascript
export class UIController extends BaseComponent {
  constructor() {
    super('UIController');
  }
  
  initialize({ DataService, EventBus }) {
    this.dataService = DataService;
    this.eventBus = EventBus;
    
    this.setupEventListeners();
  }
  
  setupEventListeners() {
    this.eventBus.on('data-updated', this.handleDataUpdate.bind(this));
  }
}
```

### Composable Wrappers
```javascript
// For wrapping Vue composables in IM
import { useMyComposable } from '@/composables/useMyComposable.mjs';

export class MyComposableWrapper extends BaseComponent {
  constructor() {
    super('MyComposable');
  }
  
  initialize() {
    // Return the composable instance
    return useMyComposable();
  }
}
```

## Debugging Your Components

### Enable IM Logging
```javascript
// In your main file
window.IM_DEBUG = true;

// This will log:
// - Component registration
// - Dependency resolution
// - Initialization order
// - Error details
```

### Check Component Status
```javascript
// Check if a component is registered
console.log(initializationManager.isRegistered('MyComponent'));

// Check if a component is initialized
const component = initializationManager.getComponent('MyComponent');
console.log(component?.isInitialized);

// Get all registered components
console.log(initializationManager.getRegisteredComponents());
```

### Common Issues

#### Component Not Found
```javascript
// ❌ Error: Component 'MyComponent' not found
const component = initializationManager.getComponent('MyComponent');

// ✅ Solution: Check registration
if (!initializationManager.isRegistered('MyComponent')) {
  console.error('MyComponent is not registered!');
}
```

#### Circular Dependencies
```javascript
// ❌ Error: Circular dependency detected
// ComponentA -> ComponentB -> ComponentC -> ComponentA

// ✅ Solution: Refactor dependencies
// Extract shared logic into a separate service
```

## Next Steps

- **Ready for more?** Check out [Component Patterns](component-patterns.md)
- **Working with Vue?** See [Vue Integration](vue-integration.md)
- **Migrating existing code?** Visit [Migration Guide](migration-guide.md)
- **Having issues?** Browse [Troubleshooting](troubleshooting.md)

## Complete Example

Here's a complete, working example:

```javascript
// 1. Create a service
export class MathService extends BaseComponent {
  constructor() {
    super('MathService');
  }
  
  initialize() {
    console.log('MathService ready!');
  }
  
  add(a, b) {
    return a + b;
  }
}

// 2. Create a component that uses the service
export class Calculator extends BaseComponent {
  constructor() {
    super('Calculator');
  }
  
  initialize({ MathService }) {
    this.mathService = MathService;
    console.log('Calculator ready!');
  }
  
  calculate(a, b) {
    return this.mathService.add(a, b);
  }
}

// 3. Register both components
initializationManager.register('MathService', MathService);
initializationManager.register('Calculator', Calculator);

// 4. Initialize everything
await initializationManager.initializeAll();

// 5. Use your components
const calculator = initializationManager.getComponent('Calculator');
console.log(calculator.calculate(2, 3)); // 5
```

---

**Next:** [Core Concepts](core-concepts.md) - Deep dive into IM principles