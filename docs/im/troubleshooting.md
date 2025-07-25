# Troubleshooting

## Common Issues and Solutions

### Component Registration Issues

#### ❌ "Component not found" Error
```javascript
// Error: Component 'MyComponent' not found in registry
const component = initializationManager.getComponent('MyComponent');
```

**Solutions:**
1. **Check registration:**
   ```javascript
   if (!initializationManager.isRegistered('MyComponent')) {
     console.error('MyComponent is not registered!');
   }
   ```

2. **Verify component name:**
   ```javascript
   // Make sure the registration name matches the getter name
   initializationManager.register('MyComponent', MyComponent); // ✅
   const component = initializationManager.getComponent('MyComponent'); // ✅
   ```

3. **Check initialization order:**
   ```javascript
   // Make sure you're calling getComponent after initializeAll
   await initializationManager.initializeAll();
   const component = initializationManager.getComponent('MyComponent');
   ```

### Dependency Issues

#### ❌ Circular Dependency Error
```
Error: Circular dependency detected: ComponentA -> ComponentB -> ComponentA
```

**Solutions:**
1. **Extract shared logic:**
   ```javascript
   // ❌ Bad - circular dependency
   class ComponentA extends BaseComponent {
     initialize({ ComponentB }) { this.componentB = ComponentB; }
   }
   class ComponentB extends BaseComponent {
     initialize({ ComponentA }) { this.componentA = ComponentA; }
   }
   
   // ✅ Good - shared service
   class SharedService extends BaseComponent {
     initialize() { /* shared logic */ }
   }
   class ComponentA extends BaseComponent {
     initialize({ SharedService }) { this.shared = SharedService; }
   }
   class ComponentB extends BaseComponent {
     initialize({ SharedService }) { this.shared = SharedService; }
   }
   ```

2. **Use event-driven communication:**
   ```javascript
   class ComponentA extends BaseComponent {
     initialize({ EventBus }) {
       this.eventBus = EventBus;
       this.eventBus.on('componentB-ready', this.handleComponentB);
     }
   }
   ```

#### ❌ Missing Dependency Error
```
Error: Dependency 'NonExistentComponent' not found
```

**Solutions:**
1. **Check spelling and case:**
   ```javascript
   // ❌ Case mismatch
   initialize({ viewPort }) { } // looking for 'viewPort'
   // But registered as:
   initializationManager.register('ViewPort', ViewPortClass);
   
   // ✅ Correct case
   initialize({ ViewPort }) { }
   ```

2. **Verify dependency registration:**
   ```javascript
   // Make sure the dependency is registered before this component
   initializationManager.register('ViewPort', ViewPortClass);
   initializationManager.register('MyComponent', MyComponent); // Depends on ViewPort
   ```

### Vue Integration Issues

#### ❌ "Dependencies not available in mounted()" Error
```javascript
export default {
  mounted() {
    console.log(this.viewPort); // undefined!
  }
}
```

**Solutions:**
1. **Use BaseVueComponentMixin:**
   ```javascript
   import { BaseVueComponentMixin } from '@/modules/core/abstracts/BaseComponent.mjs';
   
   export default {
     mixins: [BaseVueComponentMixin], // ✅ Add this
     
     initialize({ ViewPort }) {
       this.viewPort = ViewPort; // ✅ Dependencies ready here
     },
     
     mounted() {
       console.log(this.viewPort); // ✅ Now available
     }
   };
   ```

2. **Don't access dependencies in data():**
   ```javascript
   export default {
     data() {
       return {
         // ❌ Bad - dependencies not ready yet
         viewPortWidth: this.viewPort?.width || 0
       };
     },
     
     initialize({ ViewPort }) {
       this.viewPort = ViewPort;
       // ✅ Good - set reactive data after dependencies are ready
       this.$set(this, 'viewPortWidth', ViewPort.width);
     }
   };
   ```

### Performance Issues

#### ❌ Slow Initialization
```
Warning: Initialization taking longer than expected
```

**Solutions:**
1. **Check for unnecessary await calls:**
   ```javascript
   // ❌ Bad - unnecessary async
   async initialize({ DataService }) {
     this.dataService = DataService;
     await this.unnecessaryAsyncCall(); // Slows down entire chain
   }
   
   // ✅ Good - keep initialize synchronous
   initialize({ DataService }) {
     this.dataService = DataService;
     this.scheduleAsyncWork(); // Do async work separately
   }
   ```

2. **Use priority levels:**
   ```javascript
   // Critical components get high priority
   initializationManager.register('CoreService', CoreService, {
     priority: 'high'
   });
   
   // UI components can be lower priority
   initializationManager.register('UIComponent', UIComponent, {
     priority: 'low'
   });
   ```

### Import and Module Issues

#### ❌ Wrong Import Pattern for Vue Components
```javascript
// ❌ Bad - namespace import for .vue files
import * as UseSceneContainer from "useSceneContainer.vue";
```

**Solutions:**
```javascript
// ✅ Good - default import for .vue files
import SceneContainer from '@/modules/components/SceneContainer.vue';

// ✅ Good - named import for composables
import { useAimPoint } from '@/modules/composables/useAimPoint.mjs';
```

#### ❌ getElementById Anti-Pattern
```javascript
// ❌ Bad - bypasses IM system
this._element = document.getElementById('scene-container');
```

**Solutions:**
```javascript
// ✅ Good - use dependency injection
initialize({ SceneContainer }) {
  this.sceneContainer = SceneContainer; // Get reference from IM
}
```

## Debugging Tools

### Enable Debug Logging
```javascript
// In your main application file
window.IM_DEBUG = true;

// This will log:
// - Component registration order
// - Dependency resolution steps
// - Initialization timing
// - Error stack traces
```

### Manual Inspection
```javascript
// Check registration status
console.log('Registered components:', initializationManager.getRegisteredComponents());

// Check dependency graph
console.log('Dependency graph:', initializationManager.getDependencyGraph());

// Check component status
const component = initializationManager.getComponent('MyComponent');
console.log('Is initialized:', component?.isInitialized);
```

### Validation Scanner
```javascript
// Use the built-in component scanner to find violations
import { componentScanner } from '@/modules/core/componentScanner.mjs';

const results = await componentScanner.scanProject();
console.log('Violations found:', results.violatingComponents);
```

## Error Messages Reference

### Registration Errors
- `Component name must be a non-empty string` - Provide a valid component name
- `Component class must be a constructor function` - Pass a class, not an instance
- `Component already registered` - Each component can only be registered once

### Dependency Errors
- `Circular dependency detected` - Refactor to remove circular references
- `Dependency 'X' not found` - Register the dependency first
- `Maximum dependency depth exceeded` - Simplify your dependency graph

### Initialization Errors
- `Component initialization failed` - Check your initialize() method for errors
- `Initialize method must be synchronous` - Remove async/await from initialize()
- `Component not properly extending BaseComponent` - Ensure proper inheritance

### Vue-Specific Errors
- `BaseVueComponentMixin not found` - Import the mixin correctly
- `Vue component must have initialize method` - Add initialize() method to your component
- `Dependencies not available in lifecycle hooks` - Use initialize() not mounted()

## Best Practices for Debugging

### 1. Start Simple
```javascript
// Test with minimal dependencies first
class TestComponent extends BaseComponent {
  initialize() {
    console.log('TestComponent initialized!');
  }
}
```

### 2. Add Dependencies Gradually
```javascript
// Add one dependency at a time
class TestComponent extends BaseComponent {
  initialize({ ViewPort }) { // Start with one
    this.viewPort = ViewPort;
  }
}

// Then add more:
// initialize({ ViewPort, SceneContainer }) {
```

### 3. Use Console Logging
```javascript
class MyComponent extends BaseComponent {
  initialize({ ViewPort }) {
    console.log('MyComponent initializing with ViewPort:', ViewPort);
    this.viewPort = ViewPort;
    console.log('MyComponent initialization complete');
  }
}
```

### 4. Check Browser Dev Tools
- **Console** - Look for IM debug messages and errors
- **Network** - Ensure all modules are loading correctly
- **Application** - Check Vue devtools for component state

## Getting Help

If you're still having issues:

1. **Check the logs** - Enable `window.IM_DEBUG = true`
2. **Run the scanner** - Use `componentScanner.scanProject()` to find violations
3. **Simplify the case** - Create a minimal reproduction
4. **Check dependencies** - Verify all dependencies are properly registered

---

**Next:** [Advanced Topics](advanced-topics.md) - Performance optimization and testing strategies