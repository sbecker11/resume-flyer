# Component Patterns

## BaseComponent Pattern

All IM components extend the `BaseComponent` class, which provides the foundation for dependency injection and lifecycle management.

### Basic Structure
```javascript
import { BaseComponent } from '@/modules/core/abstracts/BaseComponent.mjs';

export class MyComponent extends BaseComponent {
  constructor() {
    super('MyComponent'); // Component name for IM registration
  }
  
  // Dependency injection entry point
  initialize(dependencies) {
    // Store dependency references
    // Set up component state
    // Initialize event listeners
  }
  
  // Cleanup method
  destroy() {
    // Remove event listeners
    // Clear timers/intervals
    // Release references
  }
}
```

### Dependency Declaration Methods

#### Method 1: Signature-Based (Recommended)
```javascript
// Dependencies automatically detected from parameter destructuring
initialize({ StateManager, EventBus, ViewPort }) {
  this.stateManager = StateManager;
  this.eventBus = EventBus;
  this.viewPort = ViewPort;
}
```

#### Method 2: getDependencies() (Legacy)
```javascript
getDependencies() {
  return ['StateManager', 'EventBus', 'ViewPort'];
}

initialize(dependencies) {
  this.stateManager = dependencies.StateManager;
  this.eventBus = dependencies.EventBus;
  this.viewPort = dependencies.ViewPort;
}
```

## Vue Component Patterns

### BaseVueComponentMixin

Vue components use the `BaseVueComponentMixin` to integrate with the IM system:

```javascript
import { BaseVueComponentMixin } from '@/modules/core/abstracts/BaseComponent.mjs';

export default {
  name: 'MyVueComponent',
  mixins: [BaseVueComponentMixin],
  
  // IM dependency injection
  initialize({ DataService, EventBus }) {
    this.dataService = DataService;
    this.eventBus = EventBus;
    
    // Set up reactive relationships
    this.setupWatchers();
  },
  
  data() {
    return {
      items: []
    };
  },
  
  methods: {
    setupWatchers() {
      // Use dependencies in Vue's reactivity system
      this.$watch(() => this.dataService.data, this.handleDataChange);
    },
    
    handleDataChange(newData) {
      this.items = newData;
    }
  }
};
```

### Vue Lifecycle Integration
```javascript
export default {
  mixins: [BaseVueComponentMixin],
  
  initialize({ ApiService }) {
    this.apiService = ApiService;
    // Dependencies are ready here
  },
  
  async mounted() {
    // Dependencies are guaranteed available
    const data = await this.apiService.fetchData();
    this.processData(data);
  },
  
  beforeUnmount() {
    // Cleanup is handled by BaseVueComponentMixin
    this.cleanup();
  }
};
```

## Composable Patterns

### Singleton Composables
```javascript
// modules/composables/useDataStore.mjs
import { ref, computed } from 'vue';

// Singleton instance
let _instance = null;

export function useDataStore() {
  if (!_instance) {
    const data = ref([]);
    const isLoading = ref(false);
    
    const filteredData = computed(() => {
      return data.value.filter(item => item.active);
    });
    
    function addItem(item) {
      data.value.push(item);
    }
    
    function removeItem(id) {
      const index = data.value.findIndex(item => item.id === id);
      if (index > -1) {
        data.value.splice(index, 1);
      }
    }
    
    _instance = {
      // Reactive state
      data: readonly(data),
      isLoading: readonly(isLoading),
      filteredData,
      
      // Methods
      addItem,
      removeItem,
      
      // Internal methods for IM components
      _setData(newData) {
        data.value = newData;
      },
      
      _setLoading(loading) {
        isLoading.value = loading;
      }
    };
  }
  
  return _instance;
}
```

### IM Registration for Composables
```javascript
// Register the composable as an IM component
import { useDataStore } from '@/modules/composables/useDataStore.mjs';

initializationManager.register('DataStore', () => {
  return useDataStore(); // Return the singleton instance
});
```

## Service Patterns

### Data Service
```javascript
export class ApiService extends BaseComponent {
  constructor() {
    super('ApiService');
    this.baseUrl = '/api';
  }
  
  initialize({ CacheManager, EventBus }) {
    this.cache = CacheManager;
    this.eventBus = EventBus;
  }
  
  async fetchData(endpoint) {
    // Check cache first
    const cached = this.cache.get(endpoint);
    if (cached) {
      return cached;
    }
    
    // Fetch from API
    const response = await fetch(`${this.baseUrl}/${endpoint}`);
    const data = await response.json();
    
    // Cache the result
    this.cache.set(endpoint, data);
    
    // Emit event
    this.eventBus.emit('data-fetched', { endpoint, data });
    
    return data;
  }
}
```

### State Manager
```javascript
export class StateManager extends BaseComponent {
  constructor() {
    super('StateManager');
    this.state = new Map();
    this.subscribers = new Map();
  }
  
  initialize({ EventBus }) {
    this.eventBus = EventBus;
  }
  
  setState(key, value) {
    const oldValue = this.state.get(key);
    this.state.set(key, value);
    
    // Notify subscribers
    const keySubscribers = this.subscribers.get(key) || [];
    keySubscribers.forEach(callback => {
      callback(value, oldValue);
    });
    
    // Emit global event
    this.eventBus.emit('state-changed', { key, value, oldValue });
  }
  
  getState(key) {
    return this.state.get(key);
  }
  
  subscribe(key, callback) {
    if (!this.subscribers.has(key)) {
      this.subscribers.set(key, []);
    }
    this.subscribers.get(key).push(callback);
    
    // Return unsubscribe function
    return () => {
      const callbacks = this.subscribers.get(key);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    };
  }
}
```

## Manager Patterns

### Scene Manager
```javascript
export class SceneManager extends BaseComponent {
  constructor() {
    super('SceneManager');
    this.components = new Map();
  }
  
  initialize({ ViewPort, EventBus, AimPoint, FocalPoint }) {
    this.viewPort = ViewPort;
    this.eventBus = EventBus;
    this.aimPoint = AimPoint;
    this.focalPoint = FocalPoint;
    
    this.setupEventListeners();
  }
  
  setupEventListeners() {
    this.eventBus.on('viewport-changed', this.handleViewportChange.bind(this));
    this.aimPoint.on('position-changed', this.handleAimPointMove.bind(this));
  }
  
  addComponent(id, component) {
    this.components.set(id, component);
    this.eventBus.emit('scene-component-added', { id, component });
  }
  
  removeComponent(id) {
    const component = this.components.get(id);
    if (component) {
      this.components.delete(id);
      this.eventBus.emit('scene-component-removed', { id, component });
    }
  }
  
  handleViewportChange(viewportData) {
    // Update all scene components with new viewport
    for (const [id, component] of this.components) {
      if (component.updateViewport) {
        component.updateViewport(viewportData);
      }
    }
  }
}
```

### UI Controller
```javascript
export class UIController extends BaseComponent {
  constructor() {
    super('UIController');
    this.activeMode = 'view';
  }
  
  initialize({ SceneManager, SelectionManager, EventBus }) {
    this.sceneManager = SceneManager;
    this.selectionManager = SelectionManager;
    this.eventBus = EventBus;
    
    this.setupEventListeners();
    this.setupKeyboardHandlers();
  }
  
  setupEventListeners() {
    this.selectionManager.on('selection-changed', this.handleSelectionChange.bind(this));
    this.eventBus.on('mode-change-requested', this.handleModeChange.bind(this));
  }
  
  setupKeyboardHandlers() {
    document.addEventListener('keydown', this.handleKeyDown.bind(this));
  }
  
  handleKeyDown(event) {
    switch (event.key) {
      case 'Escape':
        this.selectionManager.clearSelection();
        break;
      case 'Tab':
        event.preventDefault();
        this.cycleFocusMode();
        break;
    }
  }
  
  cycleFocusMode() {
    const modes = ['locked', 'following', 'dragging'];
    const currentIndex = modes.indexOf(this.activeMode);
    const nextMode = modes[(currentIndex + 1) % modes.length];
    
    this.setMode(nextMode);
  }
  
  setMode(mode) {
    this.activeMode = mode;
    this.eventBus.emit('ui-mode-changed', { mode });
  }
}
```

## Utility Component Patterns

### Event Bus
```javascript
export class EventBus extends BaseComponent {
  constructor() {
    super('EventBus');
    this.listeners = new Map();
  }
  
  initialize() {
    // EventBus typically has no dependencies
  }
  
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }
  
  off(event, callback) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }
  
  emit(event, data) {
    const callbacks = this.listeners.get(event) || [];
    callbacks.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`Error in event listener for '${event}':`, error);
      }
    });
  }
  
  destroy() {
    this.listeners.clear();
  }
}
```

### Cache Manager
```javascript
export class CacheManager extends BaseComponent {
  constructor() {
    super('CacheManager');
    this.cache = new Map();
    this.ttl = new Map(); // Time-to-live tracking
  }
  
  initialize() {
    // Start cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000); // Clean up every minute
  }
  
  set(key, value, ttlSeconds = 300) {
    this.cache.set(key, value);
    this.ttl.set(key, Date.now() + (ttlSeconds * 1000));
  }
  
  get(key) {
    // Check if expired
    const expiry = this.ttl.get(key);
    if (expiry && Date.now() > expiry) {
      this.delete(key);
      return undefined;
    }
    
    return this.cache.get(key);
  }
  
  delete(key) {
    this.cache.delete(key);
    this.ttl.delete(key);
  }
  
  cleanup() {
    const now = Date.now();
    for (const [key, expiry] of this.ttl) {
      if (now > expiry) {
        this.delete(key);
      }
    }
  }
  
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.cache.clear();
    this.ttl.clear();
  }
}
```

## Registration Patterns

### Simple Registration
```javascript
initializationManager.register('ComponentName', ComponentClass);
```

### Registration with Priority
```javascript
initializationManager.register('CriticalComponent', CriticalComponent, {
  priority: 'high'
});

initializationManager.register('UIComponent', UIComponent, {
  priority: 'low'
});
```

### Factory Registration
```javascript
initializationManager.register('ConfigurableComponent', () => {
  return new ConfigurableComponent({
    setting1: 'value1',
    setting2: 'value2'
  });
});
```

### Composable Registration
```javascript
initializationManager.register('DataStore', () => {
  return useDataStore(); // Return singleton instance
});
```

---

**Next:** [Dependency Management](dependency-management.md) - Advanced dependency patterns and resolution