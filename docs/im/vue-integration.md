# Vue Integration

## Overview

The IM framework provides seamless integration with Vue.js through the `BaseVueComponentMixin`, making Vue components first-class citizens in the dependency injection system.

## Vue Import Patterns and Dependency Injection

Understanding the difference between importing Vue **composables** vs **components** is crucial for proper IM dependency management.

### Vue Composables (Reactive Functions)

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

### Vue Components (.vue files)

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

### Key Differences Summary

| Type | File Extension | Import Style | IM Registration | Purpose |
|------|----------------|--------------|-----------------|---------|
| **Composables** | `.mjs` | Named import `{ useX }` | Singleton instance | Reactive state/logic |
| **Components** | `.vue` | Default import | Component ref | UI elements |

## BaseVueComponentMixin

The `BaseVueComponentMixin` provides Vue components with the same dependency injection capabilities as regular components.

### Setup
```javascript
import { BaseVueComponentMixin } from '@/modules/core/abstracts/BaseComponent.mjs';

export default {
  name: 'MyVueComponent',
  mixins: [BaseVueComponentMixin],
  
  // Your component's initialize method
  initialize(dependencies) {
    // Dependencies are guaranteed to be available
    this.badgeManager = dependencies.BadgeManager;
    this.selectionManager = dependencies.SelectionManager;
    
    // Immediate reactive setup
    this.badgeMode = this.badgeManager.getMode();
  },
  
  // Rest of your Vue component
  data() {
    return {
      // component data
    };
  }
};
```

### Benefits
- ✅ **No null checks required** - Dependencies are guaranteed to be available
- ✅ **Automatic IM registration** - Vue components register seamlessly with the IM
- ✅ **Consistent pattern** - Same clean `initialize(dependencies)` pattern as regular components
- ✅ **Reactive by design** - Immediate access to dependency state and methods

## Vue Lifecycle Integration

The IM integrates with Vue's lifecycle hooks to ensure proper timing:

```javascript
export default {
  mixins: [BaseVueComponentMixin],
  
  mounted() {
    // IM ensures dependencies are ready before this runs
    console.log('All dependencies available:', this.badgeManager);
  },
  
  initialize(dependencies) {
    // Called before mounted() with guaranteed dependencies
    this.setupWithDependencies(dependencies);
  },
  
  beforeUnmount() {
    // Cleanup is handled automatically by BaseVueComponentMixin
    this.cleanup();
  }
};
```

## Composables Best Practices

### Singleton Pattern
```javascript
// ✅ Good - Singleton composable with shared state
let _sharedInstance = null;

export function useMyComposable() {
  if (!_sharedInstance) {
    _sharedInstance = {
      state: ref(initialState),
      methods: {
        // shared methods
      }
    };
  }
  return _sharedInstance;
}
```

### IM Registration for Composables
```javascript
// In your composable registration
initializationManager.register('MyComposable', () => {
  return useMyComposable(); // Return the singleton instance
});
```

## Anti-Patterns to Avoid

### ❌ Direct DOM Access
**Never use `getElementById` for stateful components:**
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

### ❌ Manual Dependency Waiting
```javascript
// ❌ Bad - manual async coordination
async mounted() {
  await this.waitForDependencies();
  this.setup();
}
```

**✅ Use IM initialization:**
```javascript
// ✅ Good - IM handles dependency timing
initialize(dependencies) {
  this.setup(dependencies);  // Dependencies guaranteed ready
}
```

### ❌ Async Initialize Methods
```javascript
// ❌ Bad - components should be synchronous
async initialize(dependencies) {
  await someAsyncOperation();
  this.setup(dependencies);
}
```

**✅ Synchronous initialization:**
```javascript
// ✅ Good - let IM handle async coordination
initialize(dependencies) {
  this.setup(dependencies);  // Synchronous setup only
}
```

## Complete Vue Component Example

```javascript
import { BaseVueComponentMixin } from '@/modules/core/abstracts/BaseComponent.mjs';

export default {
  name: 'SceneViewer',
  mixins: [BaseVueComponentMixin],
  
  // IM will call this with resolved dependencies
  initialize({ SceneContainer, ViewPort, AimPoint, FocalPoint }) {
    // Cache dependency references
    this.sceneContainer = SceneContainer;
    this.viewPort = ViewPort;
    this.aimPoint = AimPoint;
    this.focalPoint = FocalPoint;
    
    // Set up reactive relationships
    this.setupReactiveBindings();
  },
  
  data() {
    return {
      isReady: false
    };
  },
  
  mounted() {
    // Dependencies are guaranteed to be available here
    this.isReady = true;
    this.startVisualization();
  },
  
  methods: {
    setupReactiveBindings() {
      // Set up watchers, computed properties, etc.
      this.$watch(() => this.aimPoint.position, this.onAimPointMove);
    },
    
    onAimPointMove(newPosition) {
      // React to dependency state changes
      this.updateVisualization(newPosition);
    },
    
    startVisualization() {
      // Use dependencies to set up the visualization
      this.sceneContainer.show();
      this.viewPort.center();
    }
  }
};
```

---

**Next:** [Migration Guide](migration-guide.md) - Convert your existing Vue components to use IM