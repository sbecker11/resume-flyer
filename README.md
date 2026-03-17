# resume-flock

<img src="static_content/movie.gif" width=400 height=300>

# Dark, chaotic, and deep

**resume-flock** is an interactive resume explorer. Upload a DOCX or PDF resume and it is parsed into your employment experience and technical skills. You explore them as **business cards** (one per job) and **skill cards** (one per skill) in 3D or in a linear list. Add details, dates, and skills for each job, then print your revised resume as a new HTML file.

### High-level functionality

- **resume-parser** — Parses uploaded DOCX/PDF resumes at runtime into jobs and skills (via the resume-parser package). Optional **LLM-based skill merging** can normalize and merge skill names during or after parsing.
- **resume-selector** — Choose which resume to view when you have multiple resumes; switch between them from the header dropdown.
- **resume-details-editor** — Modal to edit resume-level data: metadata (Meta tab), other sections (summary, contact, certifications, websites; Other tab), and skill categories (Skills tab).
- **job-details-editor** — Edit each job’s employer, title, dates, and description from the resume-details-editor Jobs tab.
- **job-skills-selector** — Assign or change skills per job (JobSkillEditor); skills are merged with parser-extracted job-skills and shown on the resume list.
- **resume-print** — Build a printable HTML resume from the current in-memory data and open it in a new tab (Print button in the resume header).

## 📚 Framework Documentation

### Vue 3 Composition API Architecture

The modern reactive state management and component composition system:

- **[📖 Vue 3 Composition API](https://vuejs.org/guide/extras/composition-api-faq.html)** - Official Vue 3 documentation
- **[🚀 Composables Guide](https://vuejs.org/guide/reusability/composables.html)** - Reusable composition functions  
- **[💡 Reactivity in Depth](https://vuejs.org/guide/extras/reactivity-in-depth.html)** - Understanding reactive systems
- **[🏗️ Script Setup](https://vuejs.org/api/sfc-script-setup.html)** - Modern component authoring
- **[🎯 Template Refs](https://vuejs.org/guide/essentials/template-refs.html)** - DOM element access patterns
- **[🔄 Watchers](https://vuejs.org/guide/essentials/watchers.html)** - Reactive data watching
- **[🔧 TypeScript Support](https://vuejs.org/guide/typescript/overview.html)** - Type-safe Vue development

## 🧬 Critical Inter-Relationships & System Dependencies

These **critical inter-relationships** are essential for understanding how the application functions. Preserve them during modifications.

### **🎨 Color Palette System Dependencies**

The palette system handles **cards** (CSS variables), **clones** (inline selected state), **badges** (SELECTED state colors to match clones), and **timeline** (normal state). Palette or clone changes require **cache clearing** (`clearAllCache()`) so the registry discovers new elements. Badges must update on `color-palette-changed`, `job-selected`, and badge visibility toggle.

### **State System Coordination**

The resize handle must update **both** persistence and reactive UI: `updateAppState(...)` for persistence and `storeActions.setScenePercentage(...)` for labels. Scene and Resume viewer percentages use the same mapping logic and must total 100%.

### **🎯 Template Ref Injection Dependencies**

#### **DOM Element Availability Chain**

**Parent-to-child template ref injection**: AppContent provides sceneContainerRef, bullsEyeRef, and focalPointRef to SceneContainer, bullsEye, and focal point systems; SceneContainer provides scenePlaneRef to CardsController and sceneContentRef to Timeline. Refs are passed into managers via setXxxElement() so DOM is never queried by id.

#### **Initialization Order Dependency**

**Critical timing**: (1) Vue mount makes template refs available; (2) watchers on those refs inject elements into systems; (3) systems then initialize using the injected elements; (4) event binding attaches to the real DOM. Initialization code runs only after refs are set.

### **⚡ Event System Coordination**

#### **Debounced Event Architecture**

**Performance dependency**: Resize events are debounced (e.g. 150ms) during drag to avoid cascading updates; on drag end or for step operations events dispatch immediately.

#### **Cross-Component Event Chain**

**Selection sync**: A cDiv click calls selectionManager.selectJobNumber() and fires 'job-selected'. Listeners then create the clone (hide original, show clone), show badges relative to the clone, clear the element registry cache, apply palette (selected state colors), and scroll into view (rDiv and cDiv in sync).

### **🏗️ System Architecture Dependencies**

#### **Global Element Registry Pattern**

**Performance optimization**: The element registry caches DOM queries (e.g. getAllBizCardDivs). After DOM changes (clone creation, palette updates), call `clearAllCache()` so the next query returns fresh results.

#### **Composable Singleton Pattern**

**State management**: Composables like useBadgeToggle hold shared refs at module scope so every component gets the same reactive instance (e.g. isBadgesVisible, toggleBadges) without prop drilling.

### **🔧 Critical Maintenance Guidelines**

#### **When Modifying Color System**

1. ✅ **Update all four element types** (cards, clones, badges, timeline)
2. ✅ **Clear registry cache** after DOM changes
3. ✅ **Use selected state colors** for badges/clones
4. ✅ **Test palette changes** with clones visible

#### **When Modifying Layout System**

1. ✅ **Keep percentage calculations synchronized** between components
2. ✅ **Update both state systems** (persistence + reactive)
3. ✅ **Verify totals equal 100%**
4. ✅ **Test debouncing behavior** during drag operations

#### **When Adding New Components**

1. ✅ **Follow template ref injection pattern**
2. ✅ **Register in global element registry** if searchable
3. ✅ **Clear cache** when adding/removing DOM elements
4. ✅ **Use composable singletons** for shared state

#### **When Debugging Issues**

1. 🔍 **Check element registry cache** with `printRegistryStats()`
2. 🔍 **Verify percentage totals** with `getCurrentViewerPercentages()`
3. 🔍 **Test clone visibility** with `testCloneVisibility(jobNumber)`
4. 🔍 **Validate badge colors** with `testCloneAndBadgePaletteUpdate(jobNumber)`

### **⚠️ Breaking Change Warning**

**These inter-relationships are fragile and interdependent.** Changes to one system often affect multiple others. The debug tools created during modernization (`debug-*.mjs` files) should be used to verify system integrity after any modifications.

**Key insight**: This application's complexity emerges from the **interaction between systems**, not individual components. Understanding these critical dependencies is essential for maintaining system stability and implementing new features successfully.

## 🚨 Fail-Fast Dependency Initialization Strategies

The application implements a **multi-layered "Fail Fast" approach** with different strategies for different types of dependencies, ensuring that dependency problems are caught early in development while maintaining robustness in production.

### **🚨 1. Immediate Fail-Fast Validation (Development Safety)**

**Strategy**: Throw errors immediately when critical dependencies are missing (e.g. bullsEye, timeline, colorPalette, sceneContainer in useCardsController). No fallbacks—missing Provide/Inject services surface at once with clear error messages.

**Benefits**:

- ✅ **Immediate detection** of missing Vue Provide/Inject services
- ✅ **Clear error messages** indicating exactly what's missing
- ✅ **No silent failures** - problems surface immediately during development
- ✅ **Forces proper dependency setup** in parent components

### **🎯 2. Reactive Readiness Tracking (Smart Waiting)**

**Strategy**: A reactive computed tracks when all required services report ready (`isReady`). Logging shows which dependency is not ready so initialization proceeds only when the full set is available.

**Benefits**:

- ✅ **Real-time readiness monitoring** with detailed logging
- ✅ **Granular visibility** into which specific dependencies are/aren't ready
- ✅ **Reactive coordination** - automatically proceeds when all deps are ready
- ✅ **Debug-friendly** with comprehensive logging

### **🏗️ 3. Service Readiness Declaration (Provider Contracts)**

**Strategy**: Each provided service exposes a standard `isReady` (computed or ref). Parents in AppContent declare when bullsEye, timeline, colorPalette, and sceneContainer are ready so consumers can wait on a single contract.

**Benefits**:

- ✅ **Standardized readiness interface** across all services
- ✅ **Provider responsibility** - services control their own readiness declaration
- ✅ **Vue reactivity integration** - uses computed/ref for automatic updates
- ✅ **Consumer simplicity** - consumers just check `service.isReady.value`

### **⏰ 4. Idempotent Initialization with Promises (Async Coordination)**

**Strategy**: State initialization runs once; the same promise is returned for every caller so multiple consumers can await without duplicate work or races (e.g. in stateManager).

**Benefits**:

- ✅ **Single initialization guarantee** - prevents double-initialization bugs
- ✅ **Promise-based coordination** - multiple consumers can await readiness
- ✅ **Race condition protection** - safe for concurrent access
- ✅ **Predictable timing** - always returns the same promise

### **🔄 5. Retry with Timeout (Graceful Recovery)**

**Strategy**: If a required DOM element (e.g. scene-plane) is not yet available, the controller schedules a retry after a short delay instead of failing permanently, so mount-order edge cases recover automatically.

**Benefits**:

- ✅ **Handles timing edge cases** - DOM elements that aren't ready yet
- ✅ **Automatic recovery** - doesn't require manual intervention
- ✅ **Bounded retries** - prevents infinite loops
- ✅ **Visible debugging** - logs retry attempts

### **🛡️ 6. Safe Access Patterns (Runtime Protection)**

**Strategy**: Optional chaining and existence checks before calling registry or service methods (e.g. getScenePlane, clearAllCache) so timing or missing deps do not cause runtime crashes.

**Benefits**:

- ✅ **Runtime robustness** - prevents crashes from timing issues
- ✅ **Graceful degradation** - continues functioning with reduced capabilities
- ✅ **Development safety** - won't crash during rapid development changes
- ✅ **Production reliability** - handles edge cases in production

### **👁️ 7. Template Ref Watchers (DOM Readiness)**

**Strategy**: Watchers on template refs (e.g. focalPointRef) run when refs become available; they inject the element into services and register it in the global element registry, with `immediate: true` so already-mounted refs are handled.

**Benefits**:

- ✅ **DOM timing coordination** - automatically detects when elements are mounted
- ✅ **Immediate execution** - `{ immediate: true }` catches already-available refs
- ✅ **Reactive registration** - automatically updates when refs change
- ✅ **Centralized registry** - makes elements available to other components

### **🎪 8. Global Singleton Coordination (Legacy Bridge)**

**Strategy**: Some singletons (e.g. selectionManager, resumeListController) are attached to `window` for legacy or cross-cutting access. Call sites validate presence and fail fast with clear errors when a singleton is missing.

**Benefits**:

- ✅ **Cross-cutting coordination** - bridges Vue and legacy systems
- ✅ **Explicit error messages** - clear debugging when singletons are missing
- ✅ **Development visibility** - easy to inspect global state in dev tools
- ✅ **Fallback coordination** - provides alternative access path

### **📊 Strategy Summary by Use Case**


| **Use Case**              | **Strategy**                        | **When to Use**                     | **Fail-Fast Level** |
| ------------------------- | ----------------------------------- | ----------------------------------- | ------------------- |
| **Critical Vue Services** | Immediate Throw + Reactive Tracking | Vue Provide/Inject dependencies     | 🚨 **IMMEDIATE**    |
| **Async Resources**       | Promise-based + Idempotent          | File loading, network requests      | ⏰ **COORDINATED**   |
| **DOM Elements**          | Template Ref Watchers               | When elements must exist before use | 👁️ **REACTIVE**    |
| **Timing Edge Cases**     | Retry with Timeout                  | DOM not ready, race conditions      | 🔄 **RECOVERY**     |
| **Legacy Integration**    | Global Singletons + Validation      | Cross-system communication          | 🎪 **BRIDGED**      |
| **Runtime Safety**        | Safe Access Patterns                | Production robustness               | 🛡️ **GRACEFUL**    |


### **🎯 Development vs Production Balance**

The application cleverly balances **"Fail Fast" development** with **production robustness**:

- **Development**: Immediate errors with detailed logging expose problems early
- **Production**: Safe access patterns and retries prevent crashes from timing issues
- **Both**: Reactive readiness tracking provides real-time visibility into system state

This **layered approach** ensures that dependency problems are caught early in development while maintaining robustness in production, providing multiple fallback strategies for different types of initialization dependencies.

## Application Overview

The flock

Large `business cards`are used to describe various jobs, each with its role,  
employer, and time period. These cards are larger, slowing moving, and further away from your view. Each `business card` is surrounded by its flock of  
smaller `skill cards` that hover around them. Business cards include a list of skills learned or used during that job. Click on any skill to see that skill card. Each skill card includes a back arrow that points to each job that used that skill.

Mouse motion over the scene plane causes your point of view to move around, using `motion parallax` and a fuzzy `depth of field` to give the flock its sense of depth. Besides focal-point–driven motion parallax, a sense of 3D depth is enhanced by blur and darkness that increase with distance from the view plane.

Moving the mouse vertically also causes your view to slide over the `career timeline` shown at the scene edge. 

Click on a `business card` or `skill card` to make it pop into focus at the top of the flock, and to see its details in the details area. Use the color palette selector to enhance the viewing experience.

Each job has a description (from your uploaded resume). Skills, terms, and tools can be marked in the resume details editor. Each skill is displayed as a clickable link that pops up its `skill card`.

Web links are marked up with parens and are displayed with clickable world wide web icons 

. 

Image links are marked up with curly braces and are displayed as clickable image icons <img src="static_content/icons/icons8-img-16-white.png'>. 

A `skill card` is created for each square bracketed phrase in the job details. A skill is typically used over many jobs, so each `skill card` has  
one or more return icons 

 that serve as clickable links back to jobs that used that skill. The number  
of return icons indicates the number of jobs and the amount of time used to hone that skill.

# Run the `resume-flock` career resume web app using Cursor with Claude Code agent

## Clone this repo to your local development folder

`cd <your-local-dev-folder>`  
`git clone git@github.com:sbecker11/resume-flock.git`  
`cd <your-local-dev-folder>/resume-flock`

**Resume parser:** DOCX and PDF resumes are parsed at runtime. The app uses the **resume-parser** package to convert uploaded resumes into flock data (jobs and skills). To work on or extend the parser locally, clone the resume-parser repo:  
`git clone git@github.com:sbecker11/resume-parser.git`

## Cursor IDE with Vite

The app is built with **Vite** and uses ES modules. Use **Cursor** (or another editor) with the project's dev script:

- Install dependencies: `npm install`
- Start the dev server: `npm run dev`

This runs the Vite dev server (frontend) and the backend API. Open the URL shown in the terminal (e.g. `http://localhost:5174`) in your browser. Upload a DOCX or PDF resume to explore your career as business cards and skill cards.

# Behold your flock of skill cards and business cards

## Naming Conventions

This project follows consistent naming conventions to avoid conflicts and improve code clarity:

### File Naming

- **Composables** (Vue reactive functions): `useXxx.mjs`
  - Example: `useViewport.mjs`, `useBullsEye.mjs`, `useFocalPoint.mjs`
- **Modules** (regular JavaScript modules): `xxxModule.mjs`
  - Example: `sceneContainerModule.mjs`, `keyDownModule.mjs`, `parallaxModule.mjs`

### Variable Naming

- **DOM Elements**: `xxxElement`
  - Example: `sceneContainerElement`, `resumeContentDivElement`
- **Imported Modules**: `xxx` (no suffix)
  - Example: `sceneContainer`, `keyDown`, `parallax`
- **Vue Refs**: `xxx` (no suffix)
  - Example: `viewport`, `bullsEye`, `focalPoint`
- **Computed Properties**: `xxx` (no suffix)
  - Example: `focalPointStyle`, `sceneContainerStyle`

### Architecture

The application uses a reactive chain: viewport drives bullsEye, which drives aimPoint, which drives focalPoint; Vue composables wire these together.

**Benefits:**

- Clear distinction between different types of code
- Prevents naming conflicts between DOM elements and imported modules
- Consistent patterns throughout the codebase
- Vue's reactivity system handles all dependency tracking automatically

### Module Initialization

Initialization is handled in `modules/components/AppContent.vue` using Vue's reactive architecture:

Initialization Sequence:

1. Core services (keyDown, sceneContainer)
2. Data controllers (cardsController, resumeItemsController, resumeListController)
3. Assembly (scenePlane, parallax)
4. Layout systems (resizeHandle, timeline)
5. Template rendering (isLoading = false, nextTick)
6. Reactive systems (viewport, bullsEye, aimPoint, focalPoint)
7. Final services (sceneViewLabel, autoScroll)

## Modern Vue 3 Reactive Architecture

This project uses **Vue 3 Composition API** patterns to provide clean, maintainable, and performant reactive state management:

### 1. **Composable-Based State Management**

The project uses **Vue 3 composables** (e.g. useBadgeToggle, useResizeHandle) that expose shared reactive refs and methods. State lives in composables so components stay decoupled and get automatic UI updates.

**Features:**

- **Reactive references**: Automatic UI updates when state changes
- **Global state sharing**: Singleton pattern with Vue reactivity
- **Loose coupling**: Components import only what they need

### 2. **Vue 3 Watcher System**

Components use **watchers** so that when shared state (e.g. badge visibility, selection) changes, side effects run—for example showing or hiding badges for the selected job so UI stays in sync without manual wiring.

**Benefits:**

- **Automatic reactivity**: State changes trigger appropriate actions
- **Performance optimized**: Only runs when watched values change  
- **Declarative**: Clear cause-and-effect relationships

### 3. **Template Refs and DOM Access**

Components use **template refs** (e.g. sceneContainerRef, resizeHandleRef) instead of getElementById. Refs are set after mount, so DOM access and event binding happen in onMounted or in watchers that run when refs become available.

### 4. **Event-Driven Communication**

Components communicate via **custom events** (e.g. resize-handle-changed, job-selected) with detail payloads, and by reading shared **reactive state** from composables so multiple parts of the app stay in sync without direct references.

### 5. **TypeScript Integration**

Components use **typed props and emits** (e.g. ResizeHandleProps, ResizeHandleEmits) with defineProps and defineEmits so the contract between parent and child is clear and the tooling can catch mismatches.

### 6. **Performance-Optimized Patterns**

Resize and other high-frequency updates use **debouncing** (e.g. 150ms during drag) so the UI does not cascade; when not dragging, events dispatch immediately. **Computed properties** avoid redundant work by depending only on reactive inputs.

### 7. **Module Organization Strategy**

**Clean separation**: `components/` (Vue SFCs with script setup), `composables/` (reactive state and logic), `types/` (TypeScript definitions), `utils/` (pure helpers), `core/` (managers and services), `scene/` (scene and card logic).

## 🎯 **Key Benefits of Vue 3 Architecture**

1. **Reactive by Default**: Automatic UI updates when state changes
2. **Type Safety**: Full TypeScript integration prevents runtime errors
3. **Performance Optimized**: Fine-grained reactivity and debounced events
4. **Developer Experience**: Hot module replacement and reactive debugging
5. **Maintainable**: Clear separation with composables and template refs
6. **Modern Standards**: Following official Vue 3 best practices

This **Vue 3 Composition API architecture** provides a modern, maintainable, and performant foundation that eliminates the complexity of manual dependency management while providing superior reactivity and type safety.

## Hover Flickering Fix for Overlapping Elements

The application contains business card elements (cDivs) that can visually overlap due to their absolute positioning and parallax effects. When multiple cDivs overlap under the mouse cursor, rapid mouseenter/mouseleave events can cause flickering as the elements compete for hover state.

### Problem Analysis

- **Root Cause**: Overlapping absolutely positioned elements receive rapid mouse events
- **Z-index Ineffective**: Unique z-index values don't prevent event conflicts between overlapping elements
- **CSS Transitions Avoided**: Project eschews transitions for immediate state changes
- **Event Competition**: Multiple elements simultaneously trigger hover state changes

### Solution Implementation

The fix uses a **tracked hover state** approach with **DOM reordering** and **event capture**:

#### 1. Tracked Hover State

CardsController keeps a single **currently hovered element**. Incoming mouseenter is ignored if it is for the same element, avoiding redundant updates and flicker.

#### 2. DOM Reordering Strategy

- **Hovered Element Positioning**: The hovered cDiv is moved in the DOM to position N-1 (just before the selected clone at N) so it receives pointer events on top.
- **Original Position Tracking**: The original next sibling (or a marker) is stored (e.g. in a data attribute) so the element can be restored on mouseleave.
- **Atomic Operations**: `insertBefore()` is used for a single, predictable DOM update.

#### 3. Event Capture and Propagation Control

mouseenter is attached in the **capture phase** and propagation is stopped so overlapping elements do not compete; only the intended handler runs for the hovered card.

#### 4. Position Restoration

On mouseleave, the element is reinserted using the stored original-next-sibling reference (or appended if it was the last child), restoring DOM order and avoiding stale stacking.

### Key Insights

- **DOM Order vs Visual Layer**: DOM reordering doesn't affect visual stacking for absolutely positioned elements (z-index controls visual layer)
- **Event Conflict Prevention**: The fix prevents rapid event switching rather than visual layering conflicts
- **Single Hover Constraint**: Only one element can be hovered at a time, eliminating competition
- **Atomic Operations**: `insertBefore()` automatically removes and repositions elements without changing total child count

### Result

- **No More Flickering**: Overlapping elements no longer compete for hover state
- **Smooth Transitions**: Moving between overlapping elements works seamlessly
- **Preserved Functionality**: All hover behaviors maintained while eliminating flickering
- **Paired Selection/Hover**: Both cDiv and rDiv elements now display simultaneous selection and hover states through centralized SelectionManager coordination
- **Reversible Implementation**: Changes can be easily reverted if needed

This solution demonstrates how event management and DOM manipulation can solve visual interaction issues in complex overlapping UI scenarios.

## Separation of Concerns: Modules, Components, and Composables

This project implements a clear **separation of concerns** across different architectural layers to maintain clean, maintainable code:

### **Modules** (`*.mjs` files)

**Purpose**: Pure business logic and utilities with no UI dependencies

**Characteristics:**

- **Framework-agnostic**: Can be used in any JavaScript environment
- **Stateless**: Focus on pure functions and data processing
- **Reusable**: Can be imported into any other module or component
- **Testable**: Easy to unit test in isolation

**Examples:** Pure helpers (e.g. mathUtils, colorUtils), global state (stateManager), and other framework-agnostic logic live in `.mjs` modules.

**Responsibilities:**

- Data processing and transformation
- Business logic implementation
- Utility functions
- State management
- Event handling

### **Components** (`*.vue` files)

**Purpose**: Vue.js UI components that handle presentation and user interaction

**Characteristics:**

- **Framework-specific**: Built for Vue.js ecosystem
- **Reactive**: Use Vue's reactivity system for UI updates
- **Template-driven**: Combine HTML templates with JavaScript logic
- **Lifecycle-aware**: Leverage Vue's component lifecycle hooks

**Examples:** AppContent (main shell), ResumeContainer (resume list and details), and other Vue SFCs use setup(), props, and emits for UI and interaction.

**Responsibilities:**

- UI rendering and presentation
- User interaction handling
- Component lifecycle management
- Props and event communication
- Template logic

### **Composables** (`use*.mjs` files)

**Purpose**: Vue 3 composables that provide reactive state and logic

**Characteristics:**

- **Reactive**: Use Vue's `ref()`, `computed()`, and `watch()`
- **Composable**: Can be combined and reused across components
- **Stateful**: Maintain reactive state across component instances
- **Framework-specific**: Built for Vue 3 Composition API

**Examples:** useViewport, useColorPalette, and other `use*.mjs` composables expose refs and methods (e.g. viewportState/updateViewport, currentPalette/applyPalette) for reactive, shareable state.

**Responsibilities:**

- Reactive state management
- Cross-component logic sharing
- Side effect handling
- Event subscription management
- Computed property calculations

## Singleton Pattern Implementation Strategy

The project uses **singleton patterns** strategically to manage global state and prevent dependency cycles:

### **When to Use Singletons**

**✅ Good Candidates:**

- **Global state managers**: `stateManager`, `selectionManager`
- **Event systems**: `eventBus`, `navigationAPI`
- **Resource managers**: `viewport`, `colorPalette`
- **Configuration systems**: App settings and preferences
- **Service locators**: Central access points for shared services

**❌ Avoid Singletons For:**

- **UI components**: Use Vue components instead
- **Pure utilities**: Use regular modules
- **Temporary state**: Use composables or component state
- **User-specific data**: Use props or reactive state

### **Singleton Implementation Patterns**

#### **1. Classic Singleton Pattern**

StateManager and similar cores use a static `instance` check in the constructor so only one instance exists; the module exports that single instance (e.g. `stateManager`).

#### **2. EventTarget Singleton**

SelectionManager extends EventTarget and uses the same constructor guard; one instance is exported so selection and custom events are shared app-wide.

#### **3. Vue Composable Singleton**

Composables like useViewport can keep a module-level `_instance` and return it on subsequent calls so all components share the same reactive state and methods.

### **Singleton Conversion Process**

When converting a class to a singleton pattern:

#### **Step 1: Analysis**

Identify a class that is currently instantiated once and exported (e.g. ResumeItemsController with items and isInitialized). That candidate is turned into a singleton.

#### **Step 2: Add Singleton Pattern**

In the constructor, add a check for `ClassName.instance`; if it exists, return it. Otherwise set `ClassName.instance = this` before any other initialization. Keep a single module-level export.

#### **Step 3: Update Dependencies**

Call sites import the singleton from its module and use it directly; no `new` or factory calls—the singleton is already initialized.

### **Benefits of This Separation**

1. **Clear Responsibilities**: Each layer has a specific purpose
2. **Testability**: Modules can be tested independently
3. **Reusability**: Logic can be shared across different contexts
4. **Maintainability**: Changes are isolated to specific layers
5. **Performance**: Reactive updates only affect necessary components
6. **Scalability**: New features can be added without affecting existing code

### **Migration Guidelines**

When adding new functionality:

1. **Start with modules** for pure business logic
2. **Use composables** for reactive state management
3. **Create components** for UI presentation
4. **Apply singletons** only for truly global state
5. **Use events** for cross-component communication

This layered approach ensures that the application remains maintainable, testable, and scalable as it grows in complexity.

## Layout Architecture: Container Width Management

### **🏗️ Critical Layout Constraint: Available Width Calculation**

**IMPORTANT**: The total available width for scene and resume is **window width minus the fixed 20px resize handle**. All percentage-based layout (scene/resume split, drag, persistence) must use this **available width**, not raw window width.

This constraint affects:

- **Percentage calculations** in all components
- **Container sizing** and positioning
- **Drag operation** coordinate transformations
- **Layout persistence** in app_state.json

### **📐 Layout Math Verification**

All layout calculations must satisfy: **scene width + resume width + 20px handle = window width**. Example: 1920px window → 1900px available; 60% scene = 1140px, 40% resume = 760px; 1140 + 760 + 20 = 1920.

### **⚠️ Common Implementation Errors**

**❌ WRONG**: Using `window.innerWidth` directly for percentage-to-pixel conversion. **✅ CORRECT**: Subtract the handle width (20px) first, then apply percentages to that available width.

### **🔧 Implementation Locations**

This constraint is implemented in:

1. `useResizeHandle.mjs` - Core percentage calculations
2. `AppContent.vue` - Layout percentage display
3. `SceneContainer.vue` - Scene width calculations
4. `appStore.mjs` - State management
5. `app_state.json` - Persistent storage (see [docs/LOCAL-FILES-AND-SECRETS.md](docs/LOCAL-FILES-AND-SECRETS.md) for local files and secrets, including `.env`)

### **🧮 Percentage Calculation Pattern**

Use a constant handle width (20px), compute `availableWidth = windowWidth - HANDLE_WIDTH`, then derive scene/resume pixel widths from percentages of available width. For drag, convert pixel position back to a 0–100% value using available width and clamp.

## ResizeHandle: The Layout Orchestrator

The **resizeHandle** is a sophisticated **20px-wide interactive control panel** that serves as the **central layout orchestrator** for the entire application. It's positioned between the scene and resume containers, providing both **visual separation** and **interactive layout control**.

### **🎯 Novel Innovation: Multi-Functional Control Hub**

The resizeHandle represents a **novel approach to layout management** that goes beyond traditional resize handles by combining **layout control**, **interaction modes**, and **visual feedback** in a single compact interface. This **multi-functional control hub** eliminates the need for separate UI controls while providing intuitive access to the application's core interaction modes.

### **🏗️ Container Hierarchy**

The app-container fills the viewport. Inside it: scene-container has dynamic width; resume-container uses flex, with a fixed 20px left strip that holds the resize-handle, and a flex-grow right area for resume content.

### **🎮 Interactive Features**

#### **Layout Control**

- **Drag to resize**: Click and drag to adjust scene/resume container proportions
- **Percentage-based**: Layout changes are calculated as percentages of total width
- **Smooth transitions**: Layout changes are animated for visual continuity
- **State persistence**: Layout preferences are saved and restored

#### **Interaction Modes**

- **Stepping mode**: Toggle between smooth and stepped layout changes
- **Step count control**: Adjust the number of layout steps (1-10)
- **Visual feedback**: Real-time preview of layout changes
- **Keyboard shortcuts**: Arrow keys for precise layout adjustments

#### **Visual Design**

- **Minimal footprint**: Only 20px wide to maximize content space
- **Hover effects**: Visual feedback on mouse interaction
- **Color integration**: Adapts to current color palette
- **Responsive design**: Adapts to different screen sizes

### **🔧 Technical Implementation**

#### **Composable Architecture**

useResizeHandle exposes reactive percentage and stepCount (1 = free drag, 2–10 = discrete steps), computed scene/resume percentages, and mouse handlers that start drag and update layout from clientX. Layout is derived from container width and optional stepping.

#### **State Management**

updateLayout turns clientX into a percentage of container width. If stepCount > 1, the value is snapped to steps; otherwise it’s free. The result is clamped 0–100, written to the composable state, and persisted (e.g. AppState + saveState).

#### **Event Integration**

When layout changes, container widths are set from the current percentages and a layoutChanged (or similar) custom event is dispatched with scene and resume percentages so the rest of the app can react.

### **🎨 Visual Innovations**

#### **Smooth Animations**

- **CSS transitions**: Layout changes are smoothly animated
- **Performance optimized**: Uses transform and opacity for 60fps animations
- **Easing functions**: Natural-feeling animation curves
- **Reduced motion**: Respects user's motion preferences

#### **Responsive Behavior**

- **Minimum widths**: Ensures containers remain usable
- **Maximum widths**: Prevents containers from becoming too large
- **Touch support**: Works with touch devices and mobile
- **Keyboard accessibility**: Full keyboard navigation support

### **🔄 Integration with Application Architecture**

#### **Component Communication**

- **Event-driven updates**: Layout changes trigger events for other components
- **Reactive updates**: Vue reactivity ensures UI consistency
- **State synchronization**: Layout state is synchronized across components
- **Performance monitoring**: Layout changes are optimized for performance

#### **User Experience**

- **Intuitive interaction**: Natural drag-to-resize behavior
- **Visual feedback**: Clear indication of layout changes
- **State persistence**: Layout preferences are remembered
- **Accessibility**: Full keyboard and screen reader support

This **resizeHandle** represents a significant advancement in layout management, providing a **unified interface** for both layout control and interaction mode management while maintaining the application's visual coherence and performance.

## Resize Handle Performance Optimization: Debounced Event Architecture

### **🚀 Problem Solved: Cascading Resize Chain**

The resize handle drag was causing a cascade: **ResizeHandle drag → resize events → ResumeContainer resize → ResumeListScrollContainer → rDiv recalculation → jerky feedback**. Firing resize events on every mouse move triggered expensive layout work across the tree.

### **⚡ Solution: Debounced Event Dispatching**

#### **Smart Event Management System**

During drag, resize-handle-changed and scene-width-changed are not fired on every move; the latest scene width is stored and a 150ms timer is set. When the timer fires, one event pair is dispatched. If not dragging (or when explicitly requested), events dispatch immediately so step clicks and initial layout stay accurate.

#### **Drag End Optimization**

On mouse up, dragging is cleared and any pending debounced events are flushed immediately (clear timeout and dispatch with the last pending width), so the final layout is correct and dragStateManager/updateLayout run with the current percentage.

### **🎯 Performance Benefits**

#### **Before Optimization:**

- ❌ Events fired on every mouse move (dozens per second)
- ❌ Cascading layout recalculations during drag
- ❌ Jerky, unresponsive resize handle feedback
- ❌ Performance degradation with complex layouts

#### **After Optimization:**

- ✅ **Smooth dragging**: Events debounced during drag operations
- ✅ **Responsive UI**: Visual feedback updates without cascade interruptions
- ✅ **Final accuracy**: Layout updates correctly when drag ends
- ✅ **Step operations**: Button clicks still work instantly (no debouncing)
- ✅ **150ms debounce**: Optimal balance between performance and responsiveness

### **🏗️ Architecture Highlights**

#### **Intelligent Event Classification**

- **Drag operations**: Debounced to prevent cascade
- **Step operations**: Immediate dispatch (no performance impact)
- **Initialization**: Immediate dispatch for setup accuracy

#### **State Management**

- `_eventDebounceTimeoutId`: Tracks pending debounced events
- `_pendingSceneWidth`: Stores the latest width value during debouncing
- `isDragging.value`: Controls debouncing behavior

#### **Graceful Cleanup**

- Pending events flushed immediately on drag end
- No event loss during transitions
- Maintains final layout accuracy

This **debounced event architecture** eliminates the cascading resize performance bottleneck while preserving the responsive user experience and accurate final layout positioning.

## Resume List Scroll Container: Novel Virtual Scrolling Architecture

This project implements a **sophisticated resume list scroll (wrapping) system** that provides seamless performance for large datasets while maintaining visual continuity and state preservation. The `ResumeListScrollContainer` represents a novel approach to virtual scrolling that goes beyond traditional implementations.

### **🎯 Core Innovation: Hybrid Virtual Scrolling**

Unlike traditional virtual scrolling that only renders visible items, this system uses a **hybrid approach** that combines:

- **Virtual positioning**: Items are positioned absolutely with calculated heights
- **Physical rendering**: All items are actually rendered in the DOM
- **Intelligent cloning**: Selected items get clones for interaction
- **State preservation**: Scroll position and selection state are maintained

### **🏗️ Architecture Overview**

ResumeListScrollContainer holds all items with computed positions, a visible subset, references to the scrollport and content holder, a cache of item heights, and a clone manager. Items are absolutely positioned; the container manages which are visible and handles clones for the selected item.

### **📊 Novel Height Calculation System**

#### **Dynamic Height Measurement**

Heights are measured by temporarily setting height to auto, forcing layout (e.g. reading offsetHeight), then reading scrollHeight; results are cached by item id. Positions are computed by stacking (currentTop += height), then each item gets absolute top and height. A force flag allows invalidating the cache when content changes.

#### **Height Caching Strategy**

- **Lazy measurement**: Heights are calculated only when needed
- **Persistent cache**: Heights are stored and reused
- **Force recalculation**: Heights can be recalculated on demand
- **Content-aware**: Adapts to dynamic content changes

### **🎭 Intelligent Clone Management**

#### **Clone Creation System**

Clones are created with cloneNode(true), tagged with classes and data attributes (e.g. resume-list-clone, cloneType, originalIndex). Duplicate IDs are stripped. Palette is applied to the clone when it has a color index; hover/selected classes are cleared so the clone can show selected state independently.

### **🔄 Advanced Scroll Position Management**

#### **Scroll Position Preservation**

On scroll, the visible range (scrollTop to scrollTop + clientHeight) is computed and updateVisibleItems runs. Scroll position is preserved by storing a ratio (scrollTop / scrollHeight) and restoring it after content updates so the user’s place is not lost.

#### **Momentum Scrolling**

Wheel events update a velocity from deltaY; that velocity is applied to scrollTop and then decayed (e.g. multiplied by 0.95) so scrolling feels natural and continues briefly after the wheel stops.

### **🎨 Visual Continuity Features**

#### **Smooth Transitions**

Visible items are determined by comparing item top/height to the visible range. Items entering visibility are shown and faded in (opacity transition); items leaving are faded out and then hidden. visibleItems is updated so the list stays in sync with scroll.

#### **Content-Aware Styling**

Each item gets palette application when it has a color index. Selection and hover state are reflected by adding or removing selected/hovered classes so the list matches global selection and hover.

### **⚡ Performance Optimizations**

#### **Efficient Rendering**

1. **Position Caching**: Item positions are calculated once and cached
2. **Selective Updates**: Only changed items are updated
3. **Debounced Resize**: Resize events are debounced to prevent excessive calculations
4. **RequestAnimationFrame**: Smooth animations using RAF

#### **Memory Management**

On destroy, scroll and wheel listeners are removed, resize and momentum timeouts/animation frames are cleared, content is cleared, and caches (itemHeights, allItems, visibleItems) are reset so the container can be garbage-collected and recreated cleanly.

### **🎯 Novel Features**

#### **1. Content-Aware Height Calculation**

- **Dynamic measurement**: Heights adapt to content changes
- **Force recalculation**: Heights can be updated on demand
- **Cached results**: Performance optimization through caching

#### **2. Intelligent Clone System**

- **Multiple clone types**: Different clones for different purposes
- **Styling preservation**: Clones maintain visual consistency
- **State synchronization**: Clones stay in sync with originals

#### **3. Advanced Scroll Management**

- **Position preservation**: Scroll position maintained during updates
- **Momentum scrolling**: Natural-feeling scroll physics
- **Smooth transitions**: Items fade in/out smoothly

#### **4. State Integration**

- **Selection preservation**: Selected items remain selected during scroll
- **Visual state**: Hover and selection states are maintained
- **Palette integration**: Items maintain color theming

### **🔄 Integration with Application Architecture**

#### **Event-Driven Updates**

ResumeListController creates the ResumeListScrollContainer with the resume wrapper and content div, passes in the biz resume divs, and registers callbacks: onItemSelect delegates to selectionManager.selectJobNumber; onScroll persists scroll position to AppState and saves state so scroll is restored on reload.

#### **State Synchronization**

- **Global state**: Scroll position and selection state are persisted
- **Event system**: Changes are communicated via events
- **Reactive updates**: Vue reactivity ensures UI consistency

### **🎨 Visual Innovations**

#### **Seamless Transitions**

- **Opacity transitions**: Items fade in/out smoothly
- **Height animations**: Content changes are animated
- **Clone positioning**: Clones appear/disappear naturally

#### **Performance Indicators**

- **Scroll performance**: 60fps scrolling with large datasets
- **Memory efficiency**: Minimal memory footprint
- **Responsive design**: Adapts to different screen sizes

This **Infinite Scrolling Container** represents a significant advancement in virtual scrolling technology, providing the performance benefits of virtual scrolling while maintaining the visual richness and interaction capabilities of fully rendered content. It's particularly well-suited for applications that require both performance and visual fidelity, such as this resume visualization system.

## Development history

### version 1.2    March 2025

- **High-level features**: resume-parser (DOCX/PDF at runtime, optional LLM skill merging), resume-selector, resume-details-editor (Meta / Other / Skills / Jobs tabs), job-details-editor (Jobs tab), job-skills-selector (JobSkillEditor), resume-print (printable HTML). README now introduces these in a “High-level functionality” section.
- 3D Settings: parallax scale (near/far), blur, brightness, saturation at max Z; modal from 3D button (resize handle and next to color palette). Base z-scale (0.9→0) multiplied by user scale.
- Run instructions: Cursor IDE with Vite (`npm run dev`); removed VSCode + LiveServer. Resume data from DOCX/PDF parsed at runtime; removed Excel/jobs.xlsx workflow.
- README: removed Vue 3 migration narrative, reduced Color Palette and State System sections, removed Future Work and “illustrious career” Excel customization, updated resume-parser description.

### version 1.1    July 8, 2024

- Updated installation and customization instructions in README.md
- Deployed latest to github

[https://sbecker11.github.io/resume-flock](https://sbecker11.github.io/resume-flock/)

### version 1.0    March 8, 2024

[http://spexture.com](http://spexture.com/)

- CURRENT_DATE in job [end] replaced with first day of next month but displayed as 'working'
- Always scroll newly selected bizCardDiv (and optionally its bizCardLineItem) into view in selectTheBizCard
- not started  
in highlightTheDivCardBackArrow  
unhighlightTheHighlightedDivCardBackArrow  
update theHighlightedDivCardBackArrow  
find the CardDivLineItemTagSpan of theHighlightedDivCardBackArrow  
call highlightTheCardDivLineItemTagSpan  
 in highlightTheCardDivLineItemTagSpan  
unhighlightTheHighlightedCardDivLineItemTagSpan  
update theHighlightedCardDivLineItemTagSpan  
find the cardDivCardBackArrow of theHighlightedCardDivLineItemTagSpan  
call highlightTheCardDivCardBackArrow

### version 0.9:   January 4, 2024

### version 0.8:   January 1, 2024

### version 0.7:   November 18, 2023

- Default timeline year avg of min-max years
- Auto-computing timeline min-max years
- Interpolating CURRENT_DATE  in xlsx file
- GoLive link with port 5500 or 5501
- applying parallax on the target for restoreSavedStyle
- replaced addAimationEndListener with endAnimation on a timeout
- BizCards are now animating to the top, but not staying there
- Bizdards return to original position after losing focus
- fixed selectNextBizCard
- added links to three.mjs examples
- added links to Virtual Munsell Color Wheel
- added select all skills button
- added selectNext, selectAll, and clearAll buttons

### version 0.6:   July 3, 2023

- Upgraded static website to use ES6 modules, thus requiring a local webserver that supports ES6.  
- The focal point now eases towards the mouse when it enters the scene-plane area.  
- The focal point now eases toward the bullsEye when it leaves the scene-plane areas.  
- 8 MB animated gif

### version 0.5:   June 26, 2023

- A flock of small skill cards and larger business cards float over the scene-plane column (layout can put the scene on the left or right).
- A timeline is displayed at ground level, to visualize the date range of employment for each business card.
- A 3-D parallax effect on cards is controlled by the "focalPoint", which tracks the mouse while over the scene-plane.
- Add line items to the resume column by selecting business cards.
- Select a skill card or resume line item by clicking it, click again to deselect it.
- Selected skill cards and line-items have a red-dashed border.
- Once selected, a skill card or business card is temporarily moved above the flock where it is not subject to motion parallax.
- Click on a skill card to select and scroll its resume line item into view.
- Click on a resume line item to select and scroll its skill card into view.
- The scene-plane viewPort shows "BullsEye" with a plus sign at scene-plane center, where parallax effect is zero.
- FocalPoint defaults back to the viewPort center BullsEye when it leaves the scene-plane.
- The focalPoint starts tracking the mouse as soon as it re-enters the scene-plane area.
- Scene-div auto-scrolling starts when the focalPoint is in top or bottom quarter of the scene-plane.
- Autoscrolling stops when the focalPoint moves to viewPort center and when the mouse leaves the scene-plane.
- Click on a resume line item's top-right delete button to delete it.
- Click on the bottom-right green next button to open and select the resume line item for the next business card.
- Skill cards inherit the color of their parent business card.
- Click the underlined text in a business card's resume line item to select and bring that skill card into view over the flock.

### version 0.4:   June 18, 2023

- scripted process to convert WordPress media dump xml file into a javascript file of img paths of resized local img files (not included in github) for html inclusion.
- scripted process to convert job data into a javascript file of job objects for html inclusion (resumes now parsed from DOCX/PDF at runtime).
- right side now has fixed header and footer and an auto-scolling content.
- click on any skill card or underlying business card to add a new deletable line item to the right column.

### version 0.3:   June 7, 2023

- downloads bizCards from local jobs.csv file  
  - BUT only works when running local instance of http-server from the version3 folder
- click on a red-div to open a new pink line-item in the resume-container

### version 0.2:   June 6, 2023

- faded timeline on right side
- linear gradiens at top and bottom
- bizCards are purple and far away from viewer
- cards are red and closer to viewer
- cards turn yellow on rollover  
- horizontal and vertical mouse motion induce motion parallax
- parallax decreases as distance to viewer increases
- manual vertical scrolling is supported though scrollbar is invisible
- scene-plane scrolls vertically when mouse approaches top and bottom
- right column for diagnostics

### version 0.1 - May 23, 2023

- randomized div sizes, locations, and z-index
- z-index affects opacity and brightness
- autogenerated imgs from web
- vertical stack of divs moved to scene-container center on load and resize
- vertical scrollbar
- fat middle line for diagnositcs
- right column for diagnostics

