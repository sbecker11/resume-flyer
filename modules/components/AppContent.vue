<template>
  <div id="app-container" :class="appContainerClass">
    <!-- Scene Container -->
    <SceneContainer 
      :sceneContainerStyle="sceneContainerStyle"
      :firstContainer="firstContainer"
      :secondContainer="secondContainer" 
      :scenePercentage="scenePercentage"
      :timelineAlignment="timelineAlignment"
      ref="sceneContainerRef"
    />
    
    <!-- ResizeHandle - positioned between containers -->
    <ResizeHandle />
    
    <!-- Resume Container -->
    <div 
      id="resume-container"
      :class="{ 'container-first': firstContainer === 'resume-container', 'container-second': secondContainer === 'resume-container' }"
    >
      <div class="resume-content">
        <div class="resume-wrapper">
          <ResumeContainer />
        </div>
      </div>
      <!-- Resume Viewer Label - positioned inside resume container like Scene Viewer -->
      <div id="resume-view-label">
        <span class="viewer-label">Resume Viewer ({{ roundedResumePercentage }}%)</span>
      </div>
    </div>

    <div id="bulls-eye" ref="bullsEyeRef">+</div>
    <div 
      id="focal-point" 
      ref="focalPointRef"
      :style="focalPointIsDragging ? {} : focalPointStyle" 
      :class="{ locked: focalPointIsLocked, dragging: focalPointIsDragging }"
    >⦻</div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick, provide, inject } from 'vue'

// Vue components
import SceneContainer from './SceneContainer.vue'
import ResizeHandle from './ResizeHandle.vue'
import ResumeContainer from './ResumeContainer.vue'

// Global element registry now provided from main.ts - no need to provide again

// Vue 3 architecture - pure Vue patterns with critical systems preserved
import { useAppContext } from '../composables/useAppContext.mjs'
import { useAppStore } from '../stores/appStore.mjs'
import { useFocalPoint } from '../composables/useFocalPointVue3.mjs'
import { useBullsEye } from '../composables/useBullsEyeVue3.mjs'
import { useParallaxEnhanced } from '../composables/useParallaxVue3Enhanced.mjs'
import { useColorPalette } from '../composables/useColorPalette.mjs'
import { useLayoutToggle } from '../composables/useLayoutToggle.mjs'
import { useResizeHandle } from '../composables/useResizeHandle.mjs'
import { useAppState } from '../composables/useAppState.ts'
import { useSelectedElementIdPersistence } from '../composables/useSelectedElementIdPersistence.mjs'

// Resume system initialization (to be migrated)
import { initializeResumeSystem, testResumeSystem, checkResumeDivs, testScrolling } from '../resume/resumeSystemInitializer.mjs'

// Vue 3 keyboard navigation (replaces legacy keyDownModule)
import { useKeyboardNavigation } from '../composables/useKeyboardNavigation.mjs'

// Vue 3 provide/inject: services provided at root in App.vue; we update refs here

// =============================================================================
// VUE 3 ARCHITECTURE - Dependency injection and stores
// =============================================================================

// Use app-wide context provided by App.vue
const { registerDependency, getDependency } = useAppContext()

// Use centralized app store
const { store, computed: storeComputed, actions: storeActions } = useAppStore()

// Layout management from store
const orientation = computed({
  get: () => store.orientation,
  set: (value) => storeActions.setOrientation(value)
})
const scenePercentage = computed({
  get: () => store.scenePercentage,
  set: (value) => storeActions.setScenePercentage(value)
})
const resumePercentage = storeComputed.resumePercentage
const appContainerClass = computed(() => store.orientation)
const firstContainer = computed(() => store.orientation === 'scene-left' ? 'scene-container' : 'resume-container')
const secondContainer = computed(() => store.orientation === 'scene-left' ? 'resume-container' : 'scene-container')

// Resize handle functionality
const { sceneContainerStyle } = useResizeHandle()

// Persist and restore last selected DOM element ID
const { restoreSelectionFromState } = useSelectedElementIdPersistence()

// Color palette management
const { loadPalettes } = useColorPalette()

// Vue 3 bulls-eye system (must run before useFocalPoint so global ref can be set first)
const {
  setBullsEyeElement,
  setSceneContainerElement
} = useBullsEye()

// Update root-provided global service refs before useFocalPoint so inject() sees bullsEye
const serviceUpdater = inject('globalServiceUpdater')
const debugFunctions = {
  testResumeSystem: () => console.log('testResumeSystem placeholder'),
  checkResumeDivs: () => console.log('checkResumeDivs placeholder'),
  testScrolling: () => console.log('testScrolling placeholder'),
  getBullsEyePosition: () => window.getBullsEyePosition?.() || { x: 0, y: 0 },
  getFocalPointPosition: () => window.getFocalPointPosition?.() || { x: 0, y: 0 },
  getViewportOrigin: () => window.getViewportOrigin?.() || { x: 0, y: 0 },
  renderAllCDivs: () => window.renderAllCDivs?.()
}
if (serviceUpdater) {
  const bullsEyeForInject = {
    isReady: () => true,
    getPosition: () => ({ x: store.bullsEye.x, y: store.bullsEye.y }),
    setBullsEyeElement,
    setSceneContainerElement
  }
  serviceUpdater.updateServices({
    bullsEye: bullsEyeForInject,
    focalPoint: null,
    resumeListController: window.resumeListController || null,
    resumeItemsController: window.resumeItemsController || null,
    appState: window.appState || null,
    debugFunctions
  })
}

// Vue 3 critical systems - useFocalPoint runs after refs are set so inject sees bullsEye
const {
  position: focalPointPosition,
  mode: focalPointMode,
  isLocked: focalPointIsLocked,
  isDragging: focalPointIsDragging,
  setFocalPointElement
} = useFocalPoint()

// Set focal point in global ref now that we have setFocalPointElement
if (serviceUpdater) {
  serviceUpdater.updateServices({
    focalPoint: { isReady: () => true, getPosition: () => ({ x: store.focalPoint.x, y: store.focalPoint.y }), setFocalPointElement }
  })
}

// Vue 3 enhanced parallax system (using provide/inject)
const {
  renderAllCDivs,
  stats: parallaxStats,
  checkServices
} = useParallaxEnhanced()

// Vue 3 keyboard navigation (replaces legacy keyDownModule)
const keyboardNavigation = useKeyboardNavigation()

// Global element registry already provided above

// Optimized card registry system (replaces DOM queries)
import { useCardRegistry } from '../composables/useCardRegistry.mjs'
const cardRegistry = useCardRegistry()

// CRITICAL: Provide Vue 3 services required by useCardsController reactive dependencies
console.log('[AppContent] 📦 Providing Vue 3 services for reactive dependencies...')

// Bulls-eye service for useCardsController (expects .isReady as ref)
const bullsEyeService = {
  isReady: computed(() => true),
  setBullsEyeElement,
  setSceneContainerElement
}
provide('bullsEyeService', bullsEyeService)

// Timeline service from existing IM system
// Mark ready immediately; CardsController will initialize timeline if needed
const timelineService = {
  isReady: ref(true),
}
provide('timelineService', timelineService)

// Color palette service from Vue composable
const colorPaletteService = {
  isReady: computed(() => true), // Color palette composable is ready when loaded
}
provide('colorPaletteService', colorPaletteService)

// Scene container service - track when DOM element is available
// Mark ready immediately; CardsController retries if scene-plane isn't yet available
const sceneContainerService = {
  isReady: ref(true),
}
provide('sceneContainerService', sceneContainerService)

// Computed properties from store
const focalPointX = computed(() => store.focalPoint.x)
const focalPointY = computed(() => store.focalPoint.y)

// App-level focal point and aim point (positioned relative to entire app)

// =============================================================================
// COMPUTED PROPERTIES
// =============================================================================

// Create dynamic focal point style from position
const focalPointStyle = computed(() => ({
  left: `${focalPointX.value}px`,
  top: `${focalPointY.value}px`,
  transform: 'translate(-50%, -50%)',
  position: 'fixed',
  visibility: (focalPointX.value > 0 && focalPointY.value > 0) ? 'visible' : 'hidden'
}))

// =============================================================================
// TEMPLATE REFS - App-level elements
// =============================================================================

// Template refs with reactive watchers
const sceneContainerRef = ref(null)  // Reference to SceneContainer component
const bullsEyeRef = ref(null)
const focalPointRef = ref(null)

// Make template refs reactive - watch for changes and update systems
watch(focalPointRef, (newRef) => {
  if (newRef) {
    setFocalPointElement(newRef)
    window.globalElementRegistry.registerElement('focal-point', newRef)
  }
}, { immediate: true })

watch(bullsEyeRef, (newRef) => {
  if (newRef) {
    setBullsEyeElement(newRef)
    window.globalElementRegistry.registerElement('bulls-eye', newRef)
  }
}, { immediate: true })

watch(sceneContainerRef, (newRef) => {
  if (newRef) {
    const sceneContainerElement = newRef?.$refs?.sceneContainerRef
    if (sceneContainerElement) {
      setSceneContainerElement(sceneContainerElement)
    }
  }
}, { immediate: true })

// =============================================================================
// COMPUTED PROPERTIES
// =============================================================================

const timelineAlignment = computed(() => {
  return orientation.value === 'scene-left' ? 'right' : 'left'
})

// Use the reactive store values directly - no complex mapping needed
const roundedScenePercentage = computed(() => {
  const rawPercentage = scenePercentage.value;
  const result = Math.round(Math.max(0, Math.min(100, rawPercentage)));
  
  console.log(`[Scene %] Raw: ${rawPercentage}% -> Display: ${result}%`);
  return result;
});

const roundedResumePercentage = computed(() => {
  return 100 - roundedScenePercentage.value;
});

// Verification computed property to ensure percentages always add up to 100%
const percentageVerification = computed(() => {
  const scenePercent = roundedScenePercentage.value;
  const resumePercent = roundedResumePercentage.value;
  const total = scenePercent + resumePercent;
  
  if (total !== 100) {
    console.warn(`⚠️ Percentage mismatch! Scene: ${scenePercent}% + Resume: ${resumePercent}% = ${total}% (should be 100%)`);
  }
  
  return { scenePercent, resumePercent, total, isValid: total === 100 };
});

// Watch for percentage changes and log verification
watch(percentageVerification, (newVerification) => {
  if (!newVerification.isValid) {
    console.error(`🚨 PERCENTAGE MISMATCH: Scene ${newVerification.scenePercent}% + Resume ${newVerification.resumePercent}% = ${newVerification.total}%`);
  }
}, { immediate: true });

// =============================================================================
// EVENT HANDLERS
// =============================================================================

const handleSceneContainerClick = (event) => {
  // Handle scene container clicks
  console.log('Scene container clicked:', event)
}

// =============================================================================
// LIFECYCLE - Vue's standard pattern
// =============================================================================

onMounted(async () => {
  console.log('🚀 [AppContent] Vue 3 App Initialization Started')
  
  try {
    // PHASE 0: Register app container in global element registry
    await nextTick() // Wait for DOM to be ready
    const appContainer = document.getElementById('app-container')
    if (appContainer) {
      window.globalElementRegistry.registerElement('app-container', appContainer)
      console.log('[AppContent] 📋 Registered app-container in global element registry')
    }
    
    // PHASE 1: Load AppState from server FIRST
    console.log('[AppContent] 📊 Loading AppState from server...')
    const { loadAppState } = useAppState()
    await loadAppState()
    console.log('[AppContent] ✅ AppState loaded successfully')
    
    // PHASE 2: Initialize app store
    console.log('[AppContent] 📊 Initializing app store...')
    storeActions.initialize()
    
    // Wait for DOM to be ready
    await nextTick()
    
    // PHASE 3: Initialize color palette system (now AppState is available)
    console.log('[AppContent] 🎨 Loading color palettes...')
    try {
      await loadPalettes()
      console.log('[AppContent] ✅ Color palettes loaded successfully')
    } catch (error) {
      console.error('[AppContent] ❌ Color palette loading failed:', error)
      throw error
    }
    
    // PHASE 4: Critical positioning systems now handled by reactive watchers
    console.log('[AppContent] 🎯 Critical positioning systems handled by reactive watchers')
    
    // PHASE 4.5: Check parallax system services
    console.log('[AppContent] 🔧 Checking parallax system services...')
    checkServices()
    console.log('[AppContent] 📊 Parallax stats:', parallaxStats.value)
    
    // PHASE 5: Resume system (legacy during migration)
    console.log('[AppContent] 📋 Initializing resume system...')
    await initializeResumeSystem()

    // Restore last selected DOM element from persisted state (after rDivs exist)
    setTimeout(() => {
      restoreSelectionFromState()
    }, 400)

    // PHASE 6: Service readiness logs (now ready from start)
    console.log('[AppContent] 🔧 Service readiness (pre-marked ready) ...')
    console.log('  - timelineService.isReady:', timelineService.isReady.value)
    console.log('  - sceneContainerService.isReady:', sceneContainerService.isReady.value)
    
    // Bulls-eye and color palette are already ready (Vue composables)
    console.log('  - bullsEyeService.isReady:', bullsEyeService.isReady.value)
    console.log('  - colorPaletteService.isReady:', colorPaletteService.isReady.value)
    
    // Update debug functions with real implementations
    debugFunctions.testResumeSystem = testResumeSystem
    debugFunctions.checkResumeDivs = checkResumeDivs
    debugFunctions.testScrolling = testScrolling
    
    // Update services with initialized values (window.* may be set by resume system)
    if (serviceUpdater) {
      serviceUpdater.updateServices({
        bullsEye: window.bullsEye || bullsEyeService,
        resumeListController: window.resumeListController,
        resumeItemsController: window.resumeItemsController,
        focalPoint: window.focalPoint || { isReady: () => true, getPosition: () => ({ x: store.focalPoint.x, y: store.focalPoint.y }), setFocalPointElement },
        appState: window.appState,
        debugFunctions
      })
    }
    
    // Keep window globals temporarily for backwards compatibility during migration
    window.testResumeSystem = testResumeSystem
    window.checkResumeDivs = checkResumeDivs
    window.testScrolling = testScrolling
    
    // Make card registry globally available for legacy code migration
    window.cardRegistry = cardRegistry
    console.log('[AppContent] 📋 Card registry made globally available for DOM query optimization')
    
    // PHASE 7: Global event handlers (now handled by Vue 3 composables)
    console.log('[AppContent] 🎹 Keyboard navigation handled by Vue 3 composable')
    
    // PHASE 8: Render scene view on initial load / hard refresh (parallax and layout)
    requestAnimationFrame(() => {
      renderAllCDivs()
      console.log('[AppContent] 🖼️ Scene view render triggered (initial load / refresh)')
    })
    
    console.log('[AppContent] ✅ Vue 3 app initialization complete!')
    
  } catch (error) {
    console.error('[AppContent] ❌ App initialization failed:', error)
    throw error
  }
})

onUnmounted(() => {
  console.log('[AppContent] 🧹 Cleaning up...')
  
  // Vue 3 composables handle their own cleanup automatically
  // No manual event listener removal needed for Vue composables
  
  console.log('[AppContent] ✅ Cleanup complete')
})

// =============================================================================
// REACTIVE UPDATES - Vue's native reactivity
// =============================================================================

// Watch for layout changes via store
watch(orientation, (newOrientation) => {
  // Layout change handling without excessive logging
}, { immediate: true })

</script>

<style scoped>
/* =============================================================================
   LAYOUT STYLES - Scoped to this component
   ============================================================================= */

#app-container {
  display: flex !important;
  height: 100vh;
  width: 100vw;
  overflow: visible;
  position: relative;
}

/* =============================================================================
   APP CONTAINER LAYOUT VARIATIONS
   ============================================================================= */

/* Common app-container styling regardless of orientation */
#app-container {
  flex-direction: row !important;
  /* Both scene-left and scene-right use same flex direction */
}

/* =============================================================================
   CLONE VISIBILITY MANAGEMENT - Force hiding for cards with clones
   ============================================================================= */
/* MAXIMUM specificity to override all other rules */
:deep(html body #scene-container #scene-plane .biz-card-div.force-hidden-for-clone.hasClone),
:deep(html body #scene-container .biz-card-div.force-hidden-for-clone.hasClone),
:deep(html body .biz-card-div.force-hidden-for-clone.hasClone),
:deep(.biz-card-div.force-hidden-for-clone.hasClone) {
    display: none !important;
    visibility: hidden !important;
    opacity: 0 !important;
    pointer-events: none !important;
}

/* Orientation-specific container ordering is handled by individual components */

/* Debug borders removed per user request */

/* Debug background gradients also removed */

/* Scene-specific styles moved to SceneContainer.vue */

/* =============================================================================
   RESUME CONTAINER STYLES
   ============================================================================= */

#resume-container {
  display: flex;
  flex: 1;
  background: var(--background-dark, #1a1a1a);
  position: relative;
}

#resume-container {
  flex: 1;
}

#resume-container.container-first {
  order: 1 !important;
}

#resume-container.container-second {
  order: 3 !important;
}

/* ResizeHandle always stays between scene and resume; always visible even when scene width is 0 */
.resize-handle {
  order: 2 !important;
  flex-shrink: 0 !important;
  min-width: 20px !important;
  visibility: visible !important;
  z-index: 10000;
  pointer-events: auto;
}

.resume-content {
  flex: 1;
  overflow: hidden;
}

.resume-wrapper {
  height: 100%;
  position: relative;
}

/* =============================================================================
   CONTROL ELEMENTS STYLES
   ============================================================================= */


#bulls-eye {
  position: absolute;
  font-size: 20px;
  color: rgba(0, 255, 255, 0.8);
  pointer-events: none;
  z-index: var(--z-bulls-eye, 98);
  transform: translate(-50%, -50%);
  user-select: none;
}


#focal-point {
  position: absolute;
  font-size: 24px;
  color: #fff;
  cursor: pointer;
  z-index: var(--z-focal-point, 100);
  transform: translate(-50%, -50%);
  user-select: none;
  transition: all 0.2s ease;
}

#focal-point.locked {
  color: #666666;
}

#focal-point.dragging {
  color: #ff6600;
  transform: translate(-50%, -50%) scale(1.2);
}

/* =============================================================================
   VIEWER LABELS
   ============================================================================= */


.viewer-label-div {
  top: 461px;
  position: absolute;
  bottom: 9px;
  background: transparent;
  padding: 6px 10px;
  font-family: sans-serif;
  font-size: 14px;
  font-weight: 600;
  pointer-events: none;
  z-index: 1000;
}

/* =============================================================================
   VIEWER LABEL CONSOLIDATED STYLING
   ============================================================================= */

/* Common base styling for all viewer labels */
.viewer-label,
.resume-viewer-label,
.scene-viewer-label {
  font-family: sans-serif;
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  pointer-events: none;
  user-select: none;
}

/* Resume viewer label (dark text for light backgrounds) */
.resume-viewer-label,
.viewer-label.resume-viewer-label {
  color: black !important;
}

/* Scene viewer label (light text with dark shadow for dark backgrounds) */
.scene-viewer-label,
.viewer-label.scene-viewer-label {
  color: white !important;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.7);
}

/* Resume viewer label positioning - matches Scene viewer exactly */
#resume-view-label {
  position: absolute;
  bottom: 5px;
  background: transparent;
  padding: 6px 10px;
  border-radius: 6px;
  font-family: sans-serif;
  font-size: 14px;
  font-weight: 600;
  pointer-events: none;
  z-index: 1000;
  color: black;
}

/* Position mirrored based on layout - opposite sides */
.container-first #resume-view-label {
  right: 10px; /* Resume on left, label on right side */
}

.container-second #resume-view-label {
  left: 10px; /* Resume on right, label on left side */
}

/* =============================================================================
   RESPONSIVE DESIGN
   ============================================================================= */

@media (max-width: 768px) {
  #app-container {
    flex-direction: column;
  }
  
  #scene-container,
  #resume-container {
    min-height: 50vh;
  }
  
  #scene-view-label,
  #resume-view-label {
    font-size: 10px;
    padding: 2px 6px;
  }
}

/* =============================================================================
   ACCESSIBILITY
   ============================================================================= */

@media (prefers-reduced-motion: reduce) {
  #focal-point,
  #scene-plane-top-gradient,
  #scene-plane-btm-gradient {
    transition: none;
  }
}

/* =============================================================================
   HIGH CONTRAST MODE
   ============================================================================= */

@media (prefers-contrast: high) {
  #scene-container {
    border-right-color: #fff;
  }
  
  #scene-container.container-second {
    border-left-color: #fff;
  }
  
  
  #bulls-eye {
    color: #00ffff;
  }
}
</style>