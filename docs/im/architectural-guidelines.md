# Architectural Guidelines

## Core Architectural Principles

### 1. Single Source of Truth
**IM controls all component lifecycles and instantiation**
- Only the IM framework should call `new Component()`
- All component instances are managed centrally
- No duplicate instances across the application

### 2. Dependency Injection First
**Declare dependencies upfront, don't fetch them**
- Every component declares its dependencies in `initialize({ Dep1, Dep2 })`
- No manual lookups or service locator calls within components
- Trust the framework to provide ready-to-use dependencies

### 3. Proper Initialization Order
**IM ensures dependencies are ready before components use them**
- Dependencies are resolved automatically via promise chains
- Components can safely use dependencies without null checks
- No race conditions between component initialization

### 4. Consistent State Management
**All components share the same singleton instances**
- Store references during initialization: get once, use many times
- No duplicate instances or conflicting state
- Predictable behavior across the application

### 5. Separation of Concerns
**Each component has a single, well-defined responsibility**
- Business logic separated from dependency management
- Clean interfaces between components
- Easy to test and maintain

## Access Patterns by Context

| Context | Pattern | Example | When to Use |
|---------|---------|---------|-------------|
| **IM Components** | Dependency injection | `this.stateManager = dependencies.StateManager` | Primary pattern for all IM components |
| **Vue Components** | Reactive dependency injection | `this.manager = dependencies.Manager` | Vue components using BaseVueComponentMixin |
| **Utility Functions** | Direct import | `import { manager } from './manager.mjs'` | Stateless utilities, pure functions |
| **Event Handlers** | Stored reference | `this.manager.method()` | Using dependencies cached from initialize() |

## The IM-First Mindset

### ✅ The IM Way (Declarative)

**Think dependencies first:**
```javascript
class MyComponent extends BaseComponent {
  // 1. Declare what you need upfront
  initialize({ JobsDataManager, SelectionManager, EventBus }) {
    // 2. Store references for later use
    this.jobsDataManager = JobsDataManager;
    this.selectionManager = SelectionManager;
    this.eventBus = EventBus;
    
    // 3. Use dependencies immediately - they're guaranteed ready
    this.setupEventListeners();
    this.loadInitialData();
  }
  
  setupEventListeners() {
    // Use stored references
    this.eventBus.on('selection-changed', this.handleSelectionChange.bind(this));
  }
}
```

### ❌ Anti-Patterns to Avoid

**Don't reach out for dependencies:**
```javascript
// ❌ DON'T: Dynamic imports during runtime
const { initializationManager } = await import('../core/initializationManager.mjs');
const component = initializationManager.getComponent('SomeComponent');

// ❌ DON'T: Service locator pattern in components
const component = this.getComponent('SomeComponent');

// ❌ DON'T: Global variable access
const manager = window.someGlobalManager;

// ❌ DON'T: getElementById for stateful components
this._element = document.getElementById('scene-container');

// ❌ DON'T: Manual async coordination
async initialize() {
  await this.waitForSomething();
  this.setup();
}

// ❌ DON'T: Utilities that "reach out" for dependencies
export function utilityFunction() {
  const manager = getSomeManagerSomehow(); // Where does this come from?
  return manager.getData();
}
```

### Decision Framework

**When designing a new component, ask:**

1. **"What are this component's dependencies?"**
   → Declare them in `initialize({ Dep1, Dep2 })`

2. **"How can I access Component X?"**
   → Declare it as a dependency, don't look it up

3. **"This utility needs data..."**
   → Convert it to an IM component with dependencies

4. **"I need to wait for something..."**
   → Declare it as a dependency, let IM handle timing

5. **"How do I get a DOM element?"**
   → Use dependency injection, not `getElementById`

## Component Design Patterns

### Service Components
**Stateless services providing functionality:**
```javascript
class DataService extends BaseComponent {
  initialize({ ApiClient, CacheManager }) {
    this.apiClient = ApiClient;
    this.cache = CacheManager;
  }
  
  async fetchData(id) {
    if (this.cache.has(id)) {
      return this.cache.get(id);
    }
    
    const data = await this.apiClient.get(`/data/${id}`);
    this.cache.set(id, data);
    return data;
  }
}
```

### Manager Components
**Stateful components managing a domain:**
```javascript
class SelectionManager extends BaseComponent {
  constructor() {
    super('SelectionManager');
    this.selectedItems = new Set();
  }
  
  initialize({ EventBus }) {
    this.eventBus = EventBus;
  }
  
  selectItem(item) {
    this.selectedItems.add(item);
    this.eventBus.emit('selection-changed', { 
      selected: Array.from(this.selectedItems) 
    });
  }
}
```

### Controller Components
**Orchestrating interactions between other components:**
```javascript
class UIController extends BaseComponent {
  initialize({ DataService, SelectionManager, ViewManager }) {
    this.dataService = DataService;
    this.selectionManager = SelectionManager;
    this.viewManager = ViewManager;
    
    this.setupEventListeners();
  }
  
  setupEventListeners() {
    this.selectionManager.on('selection-changed', this.updateView.bind(this));
  }
  
  async updateView(selection) {
    const data = await this.dataService.fetchData(selection.id);
    this.viewManager.render(data);
  }
}
```

### Vue Component Integration
**Vue components as first-class IM citizens:**
```javascript
export default {
  name: 'DataViewer',
  mixins: [BaseVueComponentMixin],
  
  initialize({ DataService, SelectionManager }) {
    this.dataService = DataService;
    this.selectionManager = SelectionManager;
    
    // Set up reactive relationships
    this.setupWatchers();
  },
  
  data() {
    return {
      currentData: null
    };
  },
  
  methods: {
    setupWatchers() {
      // Use dependencies in Vue reactivity system
      this.$watch(() => this.selectionManager.selectedItems, this.loadData);
    },
    
    async loadData(selectedItems) {
      if (selectedItems.length > 0) {
        this.currentData = await this.dataService.fetchData(selectedItems[0]);
      }
    }
  }
};
```

## Best Practices

### 1. Keep Dependencies Minimal
- Only declare dependencies you actually need
- Prefer event-driven communication over direct dependencies
- Use composition over deep dependency chains

### 2. Design for Testability
```javascript
class TestableComponent extends BaseComponent {
  initialize({ DataService, EventBus }) {
    this.dataService = DataService;
    this.eventBus = EventBus;
  }
  
  // Easy to test - all dependencies are injected
  async processData(input) {
    const data = await this.dataService.process(input);
    this.eventBus.emit('data-processed', data);
    return data;
  }
}

// In tests:
const mockDataService = { process: jest.fn() };
const mockEventBus = { emit: jest.fn() };
component.initialize({ DataService: mockDataService, EventBus: mockEventBus });
```

### 3. Handle Errors Gracefully
```javascript
class RobustComponent extends BaseComponent {
  initialize({ ExternalService }) {
    this.externalService = ExternalService;
  }
  
  async performOperation() {
    try {
      return await this.externalService.doSomething();
    } catch (error) {
      console.error('Operation failed:', error);
      return this.getDefaultValue();
    }
  }
}
```

### 4. Use Descriptive Names
- Component names should be unique and descriptive
- Dependency names must exactly match registered component names
- Follow consistent naming conventions (PascalCase for components)

### 5. Implement Proper Cleanup
```javascript
class CleanComponent extends BaseComponent {
  initialize({ EventBus }) {
    this.eventBus = EventBus;
    this.timers = [];
    this.listeners = [];
    
    this.setupEventListeners();
  }
  
  setupEventListeners() {
    const handler = this.handleEvent.bind(this);
    this.eventBus.on('some-event', handler);
    this.listeners.push({ event: 'some-event', handler });
  }
  
  destroy() {
    // Clean up event listeners
    this.listeners.forEach(({ event, handler }) => {
      this.eventBus.off(event, handler);
    });
    
    // Clear timers
    this.timers.forEach(clearTimeout);
    
    // Release references
    this.eventBus = null;
    this.listeners = [];
    this.timers = [];
  }
}
```

## Architecture Validation

The IM framework includes validation tools to enforce these principles:

### Component Scanner
```javascript
import { componentScanner } from '@/modules/core/componentScanner.mjs';

// Scan project for violations
const results = await componentScanner.scanProject();

// Common violations caught:
// - Using getElementById instead of dependency injection
// - Async initialize methods (should be synchronous)
// - Missing BaseComponent extension
// - Circular dependencies
// - Direct imports instead of dependency injection
```

### Common Violations and Fixes

| Violation | Fix |
|-----------|-----|
| `Using getElementById('scene-container')` | Use dependency injection: `initialize({ SceneContainer })` |
| `async initialize()` | Remove async - IM handles async coordination |
| `await component.initialize()` | Declare as dependency instead |
| `setTimeout for initialization` | Use dependency declarations |
| `Manual dependency waiting` | Declare dependencies, let IM handle timing |

## Critical Rules

### 🚨 Architecture Enforcement Rules

1. **Only IM creates component instances** - Never call `new Component()` outside IM
2. **Dependencies declared upfront** - No dynamic lookups during runtime  
3. **Synchronous initialization** - IM handles all async coordination
4. **No getElementById for stateful components** - Use dependency injection
5. **BaseComponent inheritance required** - All IM components extend BaseComponent
6. **Vue components use BaseVueComponentMixin** - For proper IM integration

### 🎯 Success Metrics

A well-architected IM application has:
- **Zero circular dependencies** detected by validation
- **No getElementById usage** for stateful components  
- **No async initialize methods** - all synchronous
- **Clean dependency declarations** - minimal and explicit
- **High test coverage** - easy to mock dependencies
- **Fast initialization** - proper dependency ordering

---

**Next:** [Migration Guide](migration-guide.md) - Convert existing code to follow these architectural principles