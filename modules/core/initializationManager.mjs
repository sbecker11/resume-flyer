/**
 * Event-driven initialization manager that removes tight coupling between components
 * Components register their dependencies and initialize when all dependencies are ready
 */

class InitializationManager {
  constructor() {
    this.components = new Map();
    this.dependencies = new Map();
    this.readyComponents = new Set();
    this.initializationPromises = new Map();
    this.eventTarget = new EventTarget();
    this.componentRegistry = new Map(); // Central registry for initialized component instances
    this.pendingComponents = new Set(); // Components waiting for dependencies
    
    // Singleton pattern
    if (InitializationManager.instance) {
      return InitializationManager.instance;
    }
    InitializationManager.instance = this;
  }




  /**
   * Start the application initialization process
   * This method should be called by Vue after DOM is ready
   * @returns {Promise} Promise that resolves when all components are initialized
   */
  async startApplication() {
    window.CONSOLE_LOG_IGNORE('[INIT] Starting application initialization...');
    window.CONSOLE_LOG_IGNORE('[INIT] Currently registered components:', Array.from(this.components.keys()));
    
    window.CONSOLE_LOG_IGNORE('[INIT] Starting component initialization process');
    
    // Get all components and try to initialize them
    const allComponents = Array.from(this.components.keys());
    window.CONSOLE_LOG_IGNORE('[INIT] Components to initialize:', allComponents);
    
    if (allComponents.length === 0) {
      console.warn('[INIT] No components registered! This suggests imports are not triggering registration.');
      return { error: 'No components registered' };
    }
    
    // Process all components (dependency resolution will handle order)
    await this.checkDependencies();
    
    // Wait for all initialization promises to complete
    const initPromises = Array.from(this.initializationPromises.values());
    window.CONSOLE_LOG_IGNORE('[INIT] Waiting for', initPromises.length, 'initialization promises');
    
    try {
      await Promise.all(initPromises);
      window.CONSOLE_LOG_IGNORE('[INIT] All components initialized successfully');
    } catch (error) {
      console.error('[INIT] Some components failed to initialize:', error);
      throw error;
    }
    
    const finalStatus = this.getStatus();
    window.CONSOLE_LOG_IGNORE('[INIT] Final component status:', finalStatus);
    return finalStatus;
  }

  /**
   * Register a component with its dependencies (synchronous version)
   * @param {string} componentName - Name of the component
   * @param {Function} initFunction - Async function to initialize the component
   * @param {Array<string>} dependencies - Array of component names this depends on
   * @param {Object} options - Additional options
   */
  registerSync(componentName, initFunction, dependencies = [], options = {}) {
    console.log(`[INIT] Registering component: ${componentName} with dependencies: [${dependencies.join(', ')}]`);
    
    // Check for circular dependencies before registering
    if (this.wouldCreateCircularDependency(componentName, dependencies)) {
      const cycle = this.findCircularDependency(componentName, dependencies);
      throw new Error(`[INIT] Circular dependency detected: ${cycle.join(' -> ')} -> ${componentName}`);
    }
    
    this.components.set(componentName, {
      initFunction,
      dependencies: new Set(dependencies),
      options,
      status: 'pending'
    });
    
    this.dependencies.set(componentName, new Set(dependencies));
    
    // Create initialization promise immediately for dependency tracking
    this.initializationPromises.set(componentName, new Promise((resolve, reject) => {
      // Store the resolve/reject functions for later use
      this.components.get(componentName).promiseResolve = resolve;
      this.components.get(componentName).promiseReject = reject;
    }));
    
    // If no dependencies, can initialize immediately (but may still need Vue DOM)
    if (dependencies.length === 0) {
      // Trigger initialization since dependencies are satisfied
      this.checkDependencies();
    }
  }

  /**
   * Register a component with its dependencies (async version)
   * @param {string} componentName - Name of the component
   * @param {Function} initFunction - Async function to initialize the component
   * @param {Array<string>|Promise<Array<string>>} dependencies - Array of component names this depends on (can be async)
   * @param {Object} options - Additional options
   */
  async register(componentName, initFunction, dependencies = [], options = {}) {
    // Resolve dependencies if they're a promise (from auto-discovery)
    const resolvedDependencies = await Promise.resolve(dependencies);
    
    window.CONSOLE_LOG_IGNORE(`[INIT] Registering component: ${componentName} with dependencies: [${resolvedDependencies.join(', ')}]`);
    
    // Check for circular dependencies before registering
    if (this.wouldCreateCircularDependency(componentName, resolvedDependencies)) {
      const cycle = this.findCircularDependency(componentName, resolvedDependencies);
      throw new Error(`[INIT] Circular dependency detected: ${cycle.join(' -> ')} -> ${componentName}`);
    }
    
    this.components.set(componentName, {
      initFunction,
      dependencies: new Set(resolvedDependencies),
      options,
      status: 'pending'
    });
    
    this.dependencies.set(componentName, new Set(resolvedDependencies));
    
    // Create initialization promise immediately for dependency tracking
    this.initializationPromises.set(componentName, new Promise((resolve, reject) => {
      // Store the resolve/reject functions for later use
      this.components.get(componentName).promiseResolve = resolve;
      this.components.get(componentName).promiseReject = reject;
    }));
    
    // If no dependencies, can initialize immediately (but don't mark as ready until after init)
    if (resolvedDependencies.length === 0) {
      // Don't mark as ready yet - that happens after initialization completes
      this.checkDependencies(); // Trigger initialization since dependencies are satisfied
    }
  }

  /**
   * Check if adding a new dependency would create a circular dependency
   * @param {string} componentName - Name of the component being registered
   * @param {Array<string>} newDependencies - New dependencies to add
   * @returns {boolean} - Whether this would create a circular dependency
   */
  wouldCreateCircularDependency(componentName, newDependencies) {
    // Create a temporary graph to test
    const tempDependencies = new Map(this.dependencies);
    tempDependencies.set(componentName, new Set(newDependencies));
    
    return this.hasCircularDependency(tempDependencies);
  }

  /**
   * Check if a dependency graph has circular dependencies using DFS
   * @param {Map} dependencies - The dependency graph to check
   * @returns {boolean} - Whether there are circular dependencies
   */
  hasCircularDependency(dependencies) {
    const visited = new Set();
    const recursionStack = new Set();
    
    const dfs = (component) => {
      if (recursionStack.has(component)) {
        return true; // Found a cycle
      }
      
      if (visited.has(component)) {
        return false; // Already processed
      }
      
      visited.add(component);
      recursionStack.add(component);
      
      const componentDeps = dependencies.get(component);
      if (componentDeps) {
        for (const dep of componentDeps) {
          if (dfs(dep)) {
            return true;
          }
        }
      }
      
      recursionStack.delete(component);
      return false;
    };
    
    // Check all components
    for (const component of dependencies.keys()) {
      if (!visited.has(component)) {
        if (dfs(component)) {
          return true;
        }
      }
    }
    
    return false;
  }

  /**
   * Find the circular dependency path
   * @param {string} componentName - Name of the component being registered
   * @param {Array<string>} newDependencies - New dependencies to add
   * @returns {Array<string>} - The circular dependency path
   */
  findCircularDependency(componentName, newDependencies) {
    // Create a temporary graph to test
    const tempDependencies = new Map(this.dependencies);
    tempDependencies.set(componentName, new Set(newDependencies));
    
    const visited = new Set();
    const recursionStack = new Set();
    const path = [];
    
    const dfs = (component, currentPath) => {
      if (recursionStack.has(component)) {
        // Found a cycle, return the path
        const cycleStart = currentPath.indexOf(component);
        return currentPath.slice(cycleStart).concat([component]);
      }
      
      if (visited.has(component)) {
        return null; // Already processed
      }
      
      visited.add(component);
      recursionStack.add(component);
      currentPath.push(component);
      
      const componentDeps = tempDependencies.get(component);
      if (componentDeps) {
        for (const dep of componentDeps) {
          const cycle = dfs(dep, [...currentPath]);
          if (cycle) {
            return cycle;
          }
        }
      }
      
      recursionStack.delete(component);
      currentPath.pop();
      return null;
    };
    
    // Check all components
    for (const component of tempDependencies.keys()) {
      if (!visited.has(component)) {
        const cycle = dfs(component, []);
        if (cycle) {
          return cycle;
        }
      }
    }
    
    return [];
  }

  /**
   * Mark a component as ready (dependencies satisfied)
   * @param {string} componentName - Name of the component
   */
  markComponentReady(componentName) {
    // window.CONSOLE_LOG_IGNORE(`[INIT] Component ready: ${componentName}`);
    this.readyComponents.add(componentName);
    this.eventTarget.dispatchEvent(new CustomEvent('component-ready', { 
      detail: { componentName } 
    }));
    
    // Try to initialize components that depend on this one
    this.checkDependencies();
  }

  /**
   * Sort components in dependency order using topological sort
   * @returns {Array<string>} - Component names in initialization order
   */
  _getInitializationOrder() {
    const allComponents = Array.from(this.components.keys());
    const visited = new Set();
    const visiting = new Set();
    const order = [];
    
    const visit = (componentName) => {
      if (visiting.has(componentName)) {
        throw new Error(`[INIT] Circular dependency detected involving ${componentName}`);
      }
      
      if (visited.has(componentName)) {
        return; // Already processed
      }
      
      visiting.add(componentName);
      
      const component = this.components.get(componentName);
      if (component && component.dependencies) {
        // Visit dependencies first
        for (const dep of component.dependencies) {
          if (allComponents.includes(dep)) {
            visit(dep);
          }
        }
      }
      
      visiting.delete(componentName);
      visited.add(componentName);
      order.push(componentName);
    };
    
    // Visit all components
    for (const componentName of allComponents) {
      visit(componentName);
    }
    
    return order;
  }

  /**
   * Check if any components can now be initialized
   */
  async checkDependencies() {
    window.CONSOLE_LOG_IGNORE('[INIT] checkDependencies() - sorting components by dependency order');
    
    let sortedComponents;
    try {
      sortedComponents = this._getInitializationOrder();
      window.CONSOLE_LOG_IGNORE('[INIT] Initialization order:', sortedComponents);
    } catch (error) {
      console.error('[INIT] Failed to sort components:', error);
      // Fallback to registration order
      sortedComponents = Array.from(this.components.keys());
    }
    
    window.CONSOLE_LOG_IGNORE('[INIT] checkDependencies() - processing', sortedComponents.length, 'components in order');
    
    // Process components in dependency order
    let componentsInitialized = 0;
    
    for (let i = 0; i < sortedComponents.length; i++) {
      const componentName = sortedComponents[i];
      const component = this.components.get(componentName);
      
      if (component.status === 'pending') {
        try {
          window.CONSOLE_LOG_IGNORE(`[INIT] Processing ${componentName} (${i + 1}/${sortedComponents.length})...`);
          const canInit = await this.canInitialize(componentName);
          window.CONSOLE_LOG_IGNORE(`[INIT] ${componentName} canInitialize: ${canInit}`);
          
          if (canInit) {
            window.CONSOLE_LOG_IGNORE(`[INIT] Initializing ${componentName}...`);
            await this.initializeComponent(componentName);
            componentsInitialized++;
          } else {
            console.warn(`[INIT] ${componentName} cannot initialize despite dependency order - dependencies may have failed`);
          }
        } catch (error) {
          console.error(`[INIT] Error checking/initializing ${componentName}:`, error);
        }
      } else {
        window.CONSOLE_LOG_IGNORE(`[INIT] ${componentName} already processed - status: ${component.status}`);
      }
    }
    
    window.CONSOLE_LOG_IGNORE(`[INIT] checkDependencies() complete - initialized ${componentsInitialized} components`);
    
    // Check if any components are still pending
    const stillPending = Array.from(this.components.entries())
      .filter(([name, comp]) => comp.status === 'pending')
      .map(([name]) => name);
    
    if (stillPending.length > 0) {
      console.warn(`[INIT] ${stillPending.length} components still pending:`, stillPending);
    }
  }

  /**
   * Check if a component can be initialized (all dependencies ready)
   * @param {string} componentName - Name of the component
   * @returns {Promise<boolean>} - Whether the component can be initialized
   */
  async canInitialize(componentName) {
    const component = this.components.get(componentName);
    if (!component) {
      window.CONSOLE_LOG_IGNORE(`[INIT] canInitialize(${componentName}) - component not found`);
      return false;
    }
    
    window.CONSOLE_LOG_IGNORE(`[INIT] canInitialize(${componentName}) - dependencies: [${Array.from(component.dependencies).join(', ')}]`);
    
    // Early validation: check if all declared dependencies are registered
    const undefinedDependencies = [];
    for (const depName of component.dependencies) {
      if (!this.components.has(depName)) {
        undefinedDependencies.push(depName);
      }
    }
    
    if (undefinedDependencies.length > 0) {
      console.error(`[INIT] ${componentName} has undefined dependencies: [${undefinedDependencies.join(', ')}]. Available components: [${Array.from(this.components.keys()).join(', ')}]`);
      return false;
    }
    
    // Wait for all dependency Promises to resolve
    const dependencyPromises = Array.from(component.dependencies).map(depName => {
      const depPromise = this.initializationPromises.get(depName);
      if (!depPromise) {
        console.warn(`[INIT] Dependency '${depName}' for '${componentName}' not found in initialization promises`);
        return Promise.resolve(); // Allow initialization to continue
      }
      window.CONSOLE_LOG_IGNORE(`[INIT] ${componentName} waiting for dependency: ${depName}`);
      return depPromise;
    });
    
    window.CONSOLE_LOG_IGNORE(`[INIT] ${componentName} waiting for ${dependencyPromises.length} dependency promises`);
    
    if (dependencyPromises.length === 0) {
      window.CONSOLE_LOG_IGNORE(`[INIT] ${componentName} has no dependencies - can initialize immediately`);
      return true;
    }
    
    try {
      // Wait for all dependencies to resolve - no timeout, dependencies must complete
      await Promise.all(dependencyPromises);
      window.CONSOLE_LOG_IGNORE(`[INIT] ${componentName} all dependencies resolved`);
      return true;
    } catch (error) {
      console.error(`[INIT] Dependency initialization failed for ${componentName}:`, error);
      return false;
    }
  }

  /**
   * Initialize a specific component
   * @param {string} componentName - Name of the component
   */
  async initializeComponent(componentName) {
    const component = this.components.get(componentName);
    if (!component || component.status !== 'pending') {
      return;
    }

    console.log(`[INIT] Initializing component: ${componentName}`);
    component.status = 'initializing';

    try {
      // Build dependencies map for dependency injection
      const dependenciesMap = this._buildDependenciesMap(componentName);
      
      // Run the actual initialization function with dependency injection
      const result = await component.initFunction(dependenciesMap);
      
      component.status = 'ready';
      console.log(`[INIT] Component initialized successfully: ${componentName}`);
      
      // Resolve the promise so dependent components can proceed
      if (component.promiseResolve) {
        component.promiseResolve(result);
      }
      
      // Mark as ready for other components that depend on this one
      this.markComponentReady(componentName);
      
    } catch (error) {
      component.status = 'error';
      console.error(`[INIT] Failed to initialize component ${componentName}:`, error);
      
      // Reject the promise so dependent components know initialization failed
      if (component.promiseReject) {
        component.promiseReject(error);
      }
      
      throw error;
    }
  }

  /**
   * Build dependencies map for dependency injection
   * @param {string} componentName - Name of the component being initialized
   * @returns {Object} - Map of dependency names to component instances
   * @private
   */
  _buildDependenciesMap(componentName) {
    const component = this.components.get(componentName);
    if (!component || !component.dependencies) {
      return {};
    }

    const dependenciesMap = {};
    const missingDependencies = [];
    const unreadyDependencies = [];
    
    // Validate all dependencies before building the map
    for (const dependencyName of component.dependencies) {
      // Check if dependency was ever registered
      if (!this.components.has(dependencyName)) {
        missingDependencies.push(dependencyName);
        continue;
      }
      
      const dependencyInstance = this.componentRegistry.get(dependencyName);
      
      if (!dependencyInstance) {
        missingDependencies.push(`${dependencyName} (not in registry)`);
        continue;
      }
      
      if (!this.readyComponents.has(dependencyName)) {
        const depComponent = this.components.get(dependencyName);
        unreadyDependencies.push(`${dependencyName} (status: ${depComponent?.status || 'unknown'})`);
        continue;
      }
      
      console.log(`[INIT] Adding dependency ${dependencyName} to ${componentName} - instance:`, dependencyInstance);
      dependenciesMap[dependencyName] = dependencyInstance;
    }
    
    // Report all validation errors at once
    if (missingDependencies.length > 0 || unreadyDependencies.length > 0) {
      let errorMsg = `[INIT] Cannot initialize '${componentName}' - dependency validation failed:\n`;
      
      if (missingDependencies.length > 0) {
        errorMsg += `  Missing dependencies: [${missingDependencies.join(', ')}]\n`;
      }
      
      if (unreadyDependencies.length > 0) {
        errorMsg += `  Unready dependencies: [${unreadyDependencies.join(', ')}]\n`;
      }
      
      const availableComponents = Array.from(this.componentRegistry.keys());
      errorMsg += `  Available components: [${availableComponents.join(', ')}]`;
      
      throw new Error(errorMsg);
    }
    
    window.CONSOLE_LOG_IGNORE(`[INIT] Built dependencies map for ${componentName}:`, Object.keys(dependenciesMap));
    return dependenciesMap;
  }

  /**
   * Wait for a specific component to be ready
   * @param {string} componentName - Name of the component
   * @returns {Promise} - Promise that resolves when component is ready
   */
  async waitForComponent(componentName) {
    const initPromise = this.initializationPromises.get(componentName);
    if (!initPromise) {
      const availableComponents = Array.from(this.initializationPromises.keys()).join(', ');
      throw new Error(`[INIT] Component '${componentName}' not registered. Available components: [${availableComponents}]`);
    }
    
    try {
      await initPromise;
      window.CONSOLE_LOG_IGNORE(`[INIT] waitForComponent('${componentName}') resolved`);
    } catch (error) {
      console.error(`[INIT] waitForComponent('${componentName}') failed:`, error);
      throw error;
    }
  }

  /**
   * Wait for multiple components to be ready
   * @param {Array<string>} componentNames - Array of component names
   * @returns {Promise} - Promise that resolves when all components are ready
   */
  async waitForComponents(componentNames) {
    const promises = componentNames.map(name => this.waitForComponent(name));
    await Promise.all(promises);
  }

  /**
   * Get the status of all components
   * @returns {Object} - Status of all components
   */
  getStatus() {
    const status = {};
    for (const [name, component] of this.components) {
      status[name] = {
        status: component.status,
        dependencies: Array.from(component.dependencies),
        ready: this.readyComponents.has(name)
      };
    }
    return status;
  }

  /**
   * Get a visual representation of the dependency graph
   * @returns {string} - ASCII representation of the dependency graph
   */
  getDependencyGraph() {
    const lines = ['Dependency Graph:'];
    const visited = new Set();
    
    const visit = (component, depth = 0) => {
      if (visited.has(component)) {
        return;
      }
      visited.add(component);
      
      const indent = '  '.repeat(depth);
      const status = this.readyComponents.has(component) ? '✓' : '⏳';
      lines.push(`${indent}${status} ${component}`);
      
      const deps = this.dependencies.get(component);
      if (deps) {
        for (const dep of deps) {
          visit(dep, depth + 1);
        }
      }
    };
    
    // Start with components that have no dependencies
    for (const [component, deps] of this.dependencies) {
      if (deps.size === 0) {
        visit(component);
      }
    }
    
    // Then visit any remaining components
    for (const component of this.dependencies.keys()) {
      if (!visited.has(component)) {
        visit(component);
      }
    }
    
    return lines.join('\n');
  }

  /**
   * Validate the current dependency graph
   * @returns {Object} - Validation result
   */
  validateDependencies() {
    const result = {
      isValid: true,
      errors: [],
      warnings: []
    };
    
    // Check for circular dependencies
    if (this.hasCircularDependency(this.dependencies)) {
      result.isValid = false;
      result.errors.push('Circular dependency detected in the graph');
    }
    
    // Check for missing dependencies
    for (const [component, deps] of this.dependencies) {
      for (const dep of deps) {
        if (!this.components.has(dep)) {
          result.warnings.push(`Component '${component}' depends on '${dep}' which is not registered`);
        }
      }
    }
    
    // Check for orphaned components (no dependencies and no dependents)
    const dependents = new Map();
    for (const [component, deps] of this.dependencies) {
      for (const dep of deps) {
        if (!dependents.has(dep)) {
          dependents.set(dep, new Set());
        }
        dependents.get(dep).add(component);
      }
    }
    
    for (const [component, deps] of this.dependencies) {
      if (deps.size === 0 && !dependents.has(component)) {
        result.warnings.push(`Component '${component}' has no dependencies and no dependents (orphaned)`);
      }
    }
    
    return result;
  }

  /**
   * Get a component instance by name (service locator pattern)
   * @param {string} componentName - Name of the component to retrieve
   * @returns {Object|null} - The component instance or null if not found/ready
   */
  getComponent(componentName) {
    // Reduced logging to prevent CLI scroll issues
    // window.CONSOLE_LOG_IGNORE(`[DEBUG] getComponent('${componentName}') called`);
    
    if (!this.componentRegistry.has(componentName)) {
      // Only warn during startup if component is never expected to be available
      // For components still initializing, just return null silently
      const component = this.components.get(componentName);
      if (!component) {
        console.warn(`[INIT] Component '${componentName}' not found in registry. Available components: [${Array.from(this.componentRegistry.keys()).join(', ')}]`);
      }
      return null;
    }
    
    if (!this.readyComponents.has(componentName)) {
      console.warn(`[INIT] Component '${componentName}' found but not ready yet. Status: ${this.components.get(componentName)?.status || 'unknown'}`);
      return null;
    }
    
    // window.CONSOLE_LOG_IGNORE(`[INIT] getComponent('${componentName}') returning component instance`);
    return this.componentRegistry.get(componentName);
  }

  /**
   * Register a component instance in the central registry
   * @param {string} componentName - Name of the component
   * @param {Object} componentInstance - The initialized component instance
   */
  registerComponentInstance(componentName, componentInstance) {
    console.log(`[INIT] Registering component instance: ${componentName}`, componentInstance);
    this.componentRegistry.set(componentName, componentInstance);
  }

  /**
   * Check if a component is registered in the registry
   * @param {string} componentName - Name of the component
   * @returns {boolean} - Whether the component is registered
   */
  isComponentRegistered(componentName) {
    return this.components.has(componentName);
  }

  /**
   * Get all available component names
   * @returns {Array<string>} - Array of component names
   */
  getAvailableComponents() {
    return Array.from(this.componentRegistry.keys());
  }

  /**
   * Get Vue DOM ready status for debugging
   * @returns {Object} - Vue DOM status information
   */

  /**
   * Reset the initialization manager (for testing)
   */
  reset() {
    this.components.clear();
    this.dependencies.clear();
    this.readyComponents.clear();
    this.initializationPromises.clear();
    this.componentRegistry.clear();
    this.pendingComponents.clear();
    InitializationManager.instance = null;
  }
}

// Create and export singleton instance
export const initializationManager = new InitializationManager();

// Export the class for testing
export { InitializationManager }; 