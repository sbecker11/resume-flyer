# Initialization Manager (IM) Framework

## Quick Links
- [🚀 Getting Started](getting-started.md) - Setup and basic examples
- [💡 Core Concepts](core-concepts.md) - IM principles and dependency injection theory
- [🔧 Component Patterns](component-patterns.md) - BaseComponent, Vue mixins, composables
- [🎯 Vue Integration](vue-integration.md) - Vue-specific patterns, imports, lifecycle
- [🔄 Migration Guide](migration-guide.md) - Converting existing code to IM
- [📚 API Reference](api-reference.md) - Complete API documentation
- [🔧 Troubleshooting](troubleshooting.md) - Common issues and debugging
- [⚡ Advanced Topics](advanced-topics.md) - Performance, testing, edge cases

## Overview

The Initialization Manager (IM) is a sophisticated **dependency management system** that orchestrates the startup sequence of JavaScript modules and Vue.js components in the resume-flock project. It provides a declarative way to manage component dependencies, prevents circular dependencies, and ensures proper initialization order without tight coupling between components.

### ⚡ **IM Compliance Status**

Compliance is measured by the component scanner (dependency injection, DOM separation, no `getElementById` on key elements, etc.). To get the **current** rate and component lists:

- Run: **`node scripts/run-compliance-scan.mjs`** (from project root).  
  Prints current compliance summary. Use **`--write-fragment`** to write `docs/im/compliance-summary-fragment.md`.
- See **[How the compliance summary was generated (and how to improve it)](COMPLIANCE-SUMMARY-HOWTO.md)** for details and server options.

**Key compliance patterns** the scanner considers: BaseVueComponentMixin / BaseComponent, DOM separation (initialize vs setupDom), template ref injection instead of getElementById, server-side isolation of browser APIs.

### 🎯 **Enhanced Vue Component Reactive Dependency Injection**

The IM framework provides **reactive dependency injection** for Vue components through an enhanced `BaseVueComponentMixin`. This eliminates manual service locator calls and null checks, providing the same robust dependency management as regular components.

**Key Benefits:**
- ✅ **No null checks required** - Dependencies are guaranteed to be available
- ✅ **Automatic IM registration** - Vue components register seamlessly with the IM
- ✅ **Consistent pattern** - Same clean `initialize(dependencies)` pattern as regular components
- ✅ **Reactive by design** - Immediate access to dependency state and methods

```javascript
// Vue components now use clean dependency injection
initialize(dependencies) {
  // Dependencies guaranteed by IM - no null checks needed!
  this.badgeManager = dependencies.BadgeManager;
  this.selectionManager = dependencies.SelectionManager;
  
  // Immediate reactive setup
  this.badgeMode = this.badgeManager.getMode();
}
```

This creates **perfect architectural symmetry** - whether you're writing a regular class component or a Vue component, the dependency injection pattern is identical.

## Architecture at a Glance

```
┌─────────────────────────────────────────────────────────────┐
│                 Initialization Manager                      │
├─────────────────────────────────────────────────────────────┤
│  • Dependency Graph Resolution                              │
│  • Circular Dependency Detection                            │
│  • Promise-Based Initialization                             │
│  • Service Locator Registry                                 │
└─────────────────────────────────────────────────────────────┘
           ↙                ↓                ↘
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ JavaScript      │  │ Vue Components  │  │ Vue Composables │
│ Components      │  │ (.vue files)    │  │ (.mjs files)    │
├─────────────────┤  ├─────────────────┤  ├─────────────────┤
│ • BaseComponent │  │ • BaseVueMixin  │  │ • Singleton     │
│ • initialize()  │  │ • initialize()  │  │ • Reactive      │
│ • getDeps()     │  │ • Auto-register │  │ • Lifecycle     │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

## When to Use IM

### ✅ Perfect for:
- Components that depend on other components
- Complex initialization sequences
- Shared state management
- DOM-dependent components
- Scene/viewport management systems

### ❌ Avoid for:
- Simple utility functions
- Pure stateless components
- Basic mathematical operations
- Static configuration objects

## Next Steps

- **New to IM?** Start with [Getting Started](getting-started.md)
- **Migrating existing code?** See [Migration Guide](migration-guide.md)
- **Vue developer?** Check [Vue Integration](vue-integration.md)
- **Having issues?** Visit [Troubleshooting](troubleshooting.md)
- **Need API details?** Browse [API Reference](api-reference.md)

## Quick Example

```javascript
// 1. Create a component
class MyComponent extends BaseComponent {
  initialize({ SceneContainer, ViewPort }) {
    this.sceneContainer = SceneContainer;
    this.viewPort = ViewPort;
    // Component logic here
  }
}

// 2. Register with IM
initializationManager.register('MyComponent', MyComponent);

// 3. IM handles the rest!
// - Resolves dependencies
// - Prevents circular deps
// - Manages initialization order
```

---

*This documentation covers the complete IM framework. Each section is designed to be read independently, but following the suggested order will provide the best learning experience.*