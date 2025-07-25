# Migration Guide

## Converting Existing Code to IM

This guide helps you migrate existing components to use the Initialization Manager framework.

## Before You Start

### Assessment Checklist
- [ ] Identify all components that need dependencies
- [ ] Map out current dependency relationships
- [ ] Look for circular dependencies in existing code
- [ ] Find direct DOM access (`getElementById`, `querySelector`)
- [ ] Locate global variable usage
- [ ] Check for manual async coordination

## Step-by-Step Migration Process

### Step 1: Convert Regular JavaScript Components

#### Before (Manual Initialization)
```javascript
class OldComponent {
  constructor() {
    this.stateManager = null;
    this.eventBus = null;
    this.init();
  }
  
  init() {
    // Manual dependency lookup
    this.stateManager = window.stateManager;
    this.eventBus = window.eventBus;
    
    if (this.stateManager && this.eventBus) {
      this.setupEventListeners();
    }
  }
  
  setupEventListeners() {
    this.eventBus.on('data-changed', this.handleDataChange.bind(this));
  }
}
```

#### After (IM Pattern)
```javascript
import { BaseComponent } from '@/modules/core/abstracts/BaseComponent.mjs';

class NewComponent extends BaseComponent {
  constructor() {
    super('NewComponent'); // Component name for IM
  }
  
  // Dependencies automatically injected by IM
  initialize({ StateManager, EventBus }) {
    this.stateManager = StateManager;
    this.eventBus = EventBus;
    
    // Dependencies are guaranteed to be ready
    this.setupEventListeners();
  }
  
  setupEventListeners() {
    this.eventBus.on('data-changed', this.handleDataChange.bind(this));
  }
  
  destroy() {
    // Clean up event listeners
    this.eventBus.off('data-changed', this.handleDataChange);
    this.stateManager = null;
    this.eventBus = null;
  }
}

// Register with IM
initializationManager.register('NewComponent', NewComponent);
```

### Step 2: Convert Vue Components

#### Before (Manual Dependencies)
```javascript
export default {
  name: 'OldVueComponent',
  
  data() {
    return {
      manager: null,
      isReady: false
    };
  },
  
  async mounted() {
    // Manual dependency lookup with null checks
    await this.waitForDependencies();
    this.manager = this.getManager();
    
    if (this.manager) {
      this.isReady = true;
      this.setupComponent();
    }
  },
  
  methods: {
    async waitForDependencies() {
      // Manual waiting logic
      while (!window.managerReady) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    },
    
    getManager() {
      return window.someGlobalManager;
    }
  }
};
```

#### After (IM Pattern)
```javascript
import { BaseVueComponentMixin } from '@/modules/core/abstracts/BaseComponent.mjs';

export default {
  name: 'NewVueComponent',
  mixins: [BaseVueComponentMixin],
  
  // IM handles dependency injection
  initialize({ SomeManager, EventBus }) {
    this.manager = SomeManager;
    this.eventBus = EventBus;
    
    // Dependencies are guaranteed ready
    this.setupComponent();
  },
  
  data() {
    return {
      isReady: true // Always ready since dependencies are guaranteed
    };
  },
  
  mounted() {
    // Dependencies are already available
    console.log('Manager ready:', this.manager);
  },
  
  methods: {
    setupComponent() {
      // Use dependencies immediately
      this.manager.initialize();
      this.eventBus.emit('component-ready');
    }
  }
};
```

### Step 3: Convert Utility Functions

#### Before (Global Access)
```javascript
// utilities/dataProcessor.mjs
export function processData(input) {
  // Global dependency access
  const manager = window.dataManager;
  const cache = window.cacheManager;
  
  if (!manager || !cache) {
    throw new Error('Dependencies not available');
  }
  
  const processed = manager.process(input);
  cache.store(processed);
  return processed;
}
```

#### After (IM Component)
```javascript
// utilities/dataProcessor.mjs
import { BaseComponent } from '@/modules/core/abstracts/BaseComponent.mjs';

class DataProcessor extends BaseComponent {
  constructor() {
    super('DataProcessor');
  }
  
  initialize({ DataManager, CacheManager }) {
    this.dataManager = DataManager;
    this.cacheManager = CacheManager;
  }
  
  processData(input) {
    const processed = this.dataManager.process(input);
    this.cacheManager.store(processed);
    return processed;
  }
}

// Register with IM
initializationManager.register('DataProcessor', DataProcessor);

// Export for external use
export { DataProcessor };
```

### Step 4: Replace getElementById Patterns

#### Before (Direct DOM Access)
```javascript
class SceneController {
  constructor() {
    this.sceneContainer = null;
    this.init();
  }
  
  init() {
    // Direct DOM access
    this.sceneContainer = document.getElementById('scene-container');
    
    if (!this.sceneContainer) {
      console.error('Scene container not found');
      return;
    }
    
    this.setupScene();
  }
}
```

#### After (Dependency Injection)
```javascript
import { BaseComponent } from '@/modules/core/abstracts/BaseComponent.mjs';

class SceneController extends BaseComponent {
  constructor() {
    super('SceneController');
  }
  
  // SceneContainer component provides DOM element access
  initialize({ SceneContainer }) {
    this.sceneContainer = SceneContainer;
    
    // Element is guaranteed to be available
    this.setupScene();
  }
  
  setupScene() {
    // Use the SceneContainer component methods
    this.sceneContainer.show();
    this.sceneContainer.setDimensions(800, 600);
  }
}
```

## Common Migration Scenarios

### Scenario 1: Component with Multiple Dependencies

#### Before
```javascript
class ComplexComponent {
  constructor() {
    this.dependencies = {};
    this.loadDependencies();
  }
  
  async loadDependencies() {
    // Manual dependency loading
    this.dependencies.stateManager = await import('./stateManager.mjs');
    this.dependencies.apiClient = await import('./apiClient.mjs');
    this.dependencies.cacheManager = await import('./cacheManager.mjs');
    
    this.init();
  }
  
  init() {
    if (this.allDependenciesLoaded()) {
      this.setupComponent();
    }
  }
}
```

#### After
```javascript
class ComplexComponent extends BaseComponent {
  constructor() {
    super('ComplexComponent');
  }
  
  initialize({ StateManager, ApiClient, CacheManager }) {
    this.stateManager = StateManager;
    this.apiClient = ApiClient;
    this.cacheManager = CacheManager;
    
    // All dependencies are guaranteed loaded and ready
    this.setupComponent();
  }
}
```

### Scenario 2: Event-Driven Component

#### Before
```javascript
class EventComponent {
  constructor() {
    this.setupEventListeners();
  }
  
  setupEventListeners() {
    // Wait for global event bus
    window.addEventListener('eventbus-ready', () => {
      window.eventBus.on('data-changed', this.handleDataChange.bind(this));
    });
  }
}
```

#### After
```javascript
class EventComponent extends BaseComponent {
  constructor() {
    super('EventComponent');
  }
  
  initialize({ EventBus }) {
    this.eventBus = EventBus;
    this.setupEventListeners();
  }
  
  setupEventListeners() {
    // EventBus is guaranteed ready
    this.eventBus.on('data-changed', this.handleDataChange.bind(this));
  }
  
  destroy() {
    this.eventBus.off('data-changed', this.handleDataChange);
  }
}
```

### Scenario 3: DOM-Dependent Component

#### Before
```javascript
class DOMComponent {
  constructor() {
    this.waitForDOM();
  }
  
  waitForDOM() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        this.initDOM();
      });
    } else {
      this.initDOM();
    }
  }
  
  initDOM() {
    this.element = document.getElementById('my-element');
    this.setupElement();
  }
}
```

#### After
```javascript
class DOMComponent extends BaseComponent {
  constructor() {
    super('DOMComponent');
  }
  
  // VueDomManager ensures DOM is ready
  initialize({ VueDomManager, MyElement }) {
    this.vueDomManager = VueDomManager;
    this.element = MyElement; // Component wrapper for the DOM element
    
    // DOM is guaranteed ready
    this.setupElement();
  }
}
```

## Migration Checklist

### Pre-Migration
- [ ] Identify all components and their dependencies
- [ ] Check for circular dependencies
- [ ] Plan migration order (dependencies first)
- [ ] Backup existing code

### During Migration
- [ ] Convert one component at a time
- [ ] Test each component after conversion
- [ ] Update import statements
- [ ] Register components with IM
- [ ] Remove global variable usage

### Post-Migration
- [ ] Run component scanner to catch violations
- [ ] Test full application initialization
- [ ] Verify no circular dependencies
- [ ] Check performance impact
- [ ] Update documentation

## Validation and Testing

### Use Component Scanner
```javascript
import { componentScanner } from '@/modules/core/componentScanner.mjs';

// Scan for migration violations
const results = await componentScanner.scanProject();

// Check for common issues:
// - getElementById usage
// - Async initialize methods
// - Missing BaseComponent extension
// - Circular dependencies

if (results.violatingComponents.length > 0) {
  console.log('Migration issues found:', results.violatingComponents);
}
```

### Test Initialization Order
```javascript
// Enable debug logging
window.IM_DEBUG = true;

// Initialize and watch the order
await initializationManager.initializeAll();

// Check that dependencies load before dependents
const graph = initializationManager.getDependencyGraph();
console.log(graph);
```

## Troubleshooting Migration Issues

### Issue: "Component not found"
**Cause:** Component not registered with IM
**Solution:** Add registration call
```javascript
initializationManager.register('ComponentName', ComponentClass);
```

### Issue: "Circular dependency detected"
**Cause:** Components depend on each other
**Solution:** Extract shared functionality
```javascript
// Instead of A -> B -> A
// Create: A -> Shared, B -> Shared
```

### Issue: "Dependencies not available"
**Cause:** Trying to access dependencies before initialization
**Solution:** Move logic to initialize() method
```javascript
initialize({ Dependency }) {
  this.dependency = Dependency;
  this.usedependency(); // ✅ Safe here
}
```

### Issue: "Async timing issues"
**Cause:** Using async initialize() method
**Solution:** Make initialize synchronous
```javascript
// ❌ Don't do this
async initialize() { }

// ✅ Do this
initialize() { }
```

## Performance Considerations

### Before Migration Benchmark
```javascript
// Measure current initialization time
const start = performance.now();
await initializeEverything();
const oldTime = performance.now() - start;
```

### After Migration Benchmark
```javascript
// Measure IM initialization time
const start = performance.now();
await initializationManager.initializeAll();
const newTime = performance.now() - start;

console.log(`Migration impact: ${newTime - oldTime}ms`);
```

The IM framework typically improves initialization performance by:
- Eliminating redundant dependency checks
- Optimizing initialization order
- Reducing manual async coordination overhead

---

**Next:** [Troubleshooting](troubleshooting.md) - Solutions for common migration issues