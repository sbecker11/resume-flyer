<template>
  <div 
    id="scene-container" 
    ref="sceneContainerRef"
    :style="sceneContainerStyle" 
    @click="handleSceneContainerClick"
    :class="{ 'container-first': firstContainer === 'scene-container', 'container-second': secondContainer === 'scene-container' }"
  >
    <div id="scene-container-top-gradient"></div>
    <div id="scene-container-btm-gradient"></div>
    <div id="scene-content" ref="sceneContentRef" @scroll="onSceneContentScroll">
      <div id="scene-plane" ref="scenePlaneRef" @click="handleScenePlaneClick">
        <Timeline :alignment="timelineAlignment" />
        <!-- BizCardDivs will be dynamically appended here by CardsController -->
      </div>
      <!-- ConnectionLines removed during Vue 3 migration cleanup -->
    </div>
    <div id="scene-view-label">
      <span class="viewer-label">Scene Viewer ({{ roundedScenePercentage }}%)</span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'

// Vue components
import Timeline from './Timeline.vue'
// ConnectionLines removed during Vue 3 migration cleanup

// Scene-specific composables
import { useCardsController } from '../composables/useCardsController.mjs'
import { useTimeline } from '../composables/useTimeline.mjs'
import { useFocalPoint } from '../composables/useFocalPointVue3.mjs'
import { useViewport } from '../composables/useViewport.mjs'
import { useScenePlaneOptimized } from '../composables/useScenePlaneOptimized.mjs'
import { injectGlobalElementRegistry } from '../composables/useGlobalElementRegistry.mjs'
import { useAppState } from '../composables/useAppState.ts'

// Selection management
import { selectionManager } from '../core/selectionManager.mjs'
import {
  registerTimelineReinit,
  registerCardsReinit,
  registerGetBizCardDivs
} from '../resume/resumeReinitializer.mjs'

// Track SceneContainer instances (moved here so it persists across hot reloads)
if (!window.__sceneContainerInstanceCounter) {
  window.__sceneContainerInstanceCounter = 0
}
const sceneContainerInstanceId = ++window.__sceneContainerInstanceCounter
console.log(`🎬 [SceneContainer] Creating instance #${sceneContainerInstanceId}`)

const { appState, updateAppState } = useAppState()
let sceneContentScrollTimeoutId = null
const SCROLL_PERSIST_DEBOUNCE_MS = 300

// Legacy imports removed - now using Vue 3 composables
// import { bullsEye } from '../core/bullsEye.mjs' - replaced by useBullsEyeVue3
// import * as scenePlaneModule from '../scene/scenePlaneModule.mjs' - integrated into Vue composables

// Props from parent AppContent
const props = defineProps({
  sceneContainerStyle: Object,
  firstContainer: String,
  secondContainer: String,
  scenePercentage: Number,
  timelineAlignment: String
})

// Resolve registry once during setup (inject() only valid here); use in watchers/callbacks
let globalElementRegistry = null;
try {
  globalElementRegistry = injectGlobalElementRegistry();
} catch (e) {
  if (typeof window !== 'undefined' && window.globalElementRegistry) {
    globalElementRegistry = window.globalElementRegistry;
  }
  if (!globalElementRegistry) throw e;
}
function getElementRegistry() {
  return globalElementRegistry;
}

// Computed properties - use direct percentage values like AppContent.vue
const roundedScenePercentage = computed(() => {
  const rawPercentage = props.scenePercentage;
  const result = Math.round(Math.max(0, Math.min(100, rawPercentage)));
  
  return result;
})

// Optimized scene plane system with Vue 3 reactivity APIs
const {
  scenePlaneRef,
  sceneContainerRef, 
  sceneContentRef,
  setScenePlaneElement,
  setSceneContainerElement,
  setSceneContentElement,
  dimensions,
  elementCounts,
  scenePlanePosition,
  isInitialized: scenePlaneInitialized
} = useScenePlaneOptimized()

// Enhanced template ref watchers with optimized scene plane integration
watch(sceneContainerRef, (newRef) => {
  if (newRef) {
    console.log('[SceneContainer] sceneContainerRef became available - initializing viewport')
    initializeViewport(newRef)
    
    // Integration with optimized scene plane system
    setSceneContainerElement(newRef)
    
    // Register in global element registry (safely)
    try {
      getElementRegistry().registerElement('scene-container', newRef)
    } catch (error) {
      console.error('[SceneContainer] Registry not ready for scene-container:', error)
      throw error
    }
  }
}, { immediate: true })

function onSceneContentScroll() {
  const el = sceneContentRef.value
  if (!el || !appState.value) return
  if (sceneContentScrollTimeoutId) clearTimeout(sceneContentScrollTimeoutId)
  sceneContentScrollTimeoutId = setTimeout(() => {
    sceneContentScrollTimeoutId = null
    const scrollTop = Math.max(0, el.scrollTop)
    const current = appState.value['user-settings']?.scrollPositions ?? {}
    updateAppState({
      'user-settings': {
        scrollPositions: {
          ...current,
          sceneContentScrollTop: scrollTop
        }
      }
    }).catch((e) => {
      console.error('[SceneContainer] Failed to persist scene scroll position', e)
    })
  }, SCROLL_PERSIST_DEBOUNCE_MS)
}

watch(sceneContentRef, (newRef) => {
  if (newRef) {
    console.log('[SceneContainer] sceneContentRef became available')
    // Notify other systems that scene-content is available
    window.dispatchEvent(new CustomEvent('scene-content-ready', { detail: { element: newRef } }))
    
    // Integration with optimized scene plane system
    setSceneContentElement(newRef)
    
    // Register in global element registry (safely)
    try {
      getElementRegistry().registerElement('scene-content', newRef)
    } catch (error) {
      console.log('[SceneContainer] Registry not ready yet for scene-content, will register later')
    }
    // Restore persisted vertical scroll position (initial load / hard refresh)
    const saved = appState.value?.['user-settings']?.scrollPositions?.sceneContentScrollTop
    if (typeof saved === 'number' && saved > 0) {
      nextTick(() => {
        newRef.scrollTop = saved
      })
    }
  }
}, { immediate: true })

watch(scenePlaneRef, (newRef) => {
  if (newRef) {
    console.log('[SceneContainer] scenePlaneRef became available - optimized reactivity enabled')
    // Notify cards controller that scene-plane is available
    window.dispatchEvent(new CustomEvent('scene-plane-ready', { detail: { element: newRef } }))
    
    // Integration with optimized scene plane system (already handled by useScenePlaneOptimized)
    setScenePlaneElement(newRef)
    
    // Register in global element registry (safely)
    try {
      getElementRegistry().registerElement('scene-plane', newRef)
    } catch (error) {
      console.error('[SceneContainer] Registry not ready for scene-plane:', error)
      throw error
    }
  }
}, { immediate: true })

// Log optimized scene plane stats
watch(dimensions, (newDimensions) => {
  console.log('[SceneContainer] Scene plane dimensions updated (optimized):', newDimensions)
}, { deep: true })

watch(elementCounts, (newCounts) => {
  console.log('[SceneContainer] Scene plane element counts updated (optimized):', newCounts)
}, { deep: true })

// Scene-specific composables
const timelineComposable = useTimeline()
const { timelineHeight, reinitialize: timelineReinitialize } = timelineComposable
// Cards controller will auto-initialize when scene-plane-ready event fires
console.log(`🎬 [SceneContainer #${sceneContainerInstanceId}] Creating CardsController...`)
const cardsController = useCardsController()
const { initializeCardsController, reinitializeResumeData, bizCardDivs } = cardsController
console.log(`🎬 [SceneContainer #${sceneContainerInstanceId}] CardsController created`)

// Register reinit callbacks for resume system (parsed resume switch)
registerTimelineReinit((jobsData) => timelineReinitialize(jobsData))
registerCardsReinit(() => reinitializeResumeData())
registerGetBizCardDivs(() => bizCardDivs.value ?? [])

// Focal point system (aim point removed)
const { setFocalPointElement } = useFocalPoint()
const { initializeViewport } = useViewport()

// Event handlers
const handleSceneContainerClick = (event) => {
  console.log('[SceneContainer] Scene container clicked:', event)
}

const handleScenePlaneClick = (event) => {
  // Deselect when clicking background: not on a biz card or skill card (card handlers do select/deselect)
  const onCard = event.target.closest('.biz-card-div') || event.target.closest('.skill-card-div')
  if (onCard) return
  selectionManager.clearSelection("SceneContainer.handleScenePlaneClick")
}

// Lifecycle
onMounted(async () => {
  console.log('🟢 [SceneContainer] MOUNTED - TEMPLATE SHOULD BE VISIBLE 🟢')
  console.log('[SceneContainer] Initializing scene-specific systems...')
  
  try {
    // Wait for DOM to be ready
    await nextTick()
    
    // Set scene-plane height based on timeline height
    if (timelineHeight.value) {
      document.documentElement.style.setProperty('--timeline-height', `${timelineHeight.value}px`)
    }
    
    // Viewport initialization now handled by reactive watcher
    
    // Cards controller will auto-initialize when scene-plane-ready event fires
    // No manual initialization needed here
    
    // Scene plane initialization now handled by Vue composables
    // await scenePlaneModule.initialize() - replaced by Vue 3 composables
    
    console.log('[SceneContainer] ✅ Scene initialization complete!')
    
  } catch (error) {
    console.error('[SceneContainer] ❌ Scene initialization failed:', error)
    throw error
  }
})

onUnmounted(() => {
  if (sceneContentScrollTimeoutId) clearTimeout(sceneContentScrollTimeoutId)
})

// Expose refs to parent if needed
defineExpose({
  sceneContainerRef,
  sceneContentRef,
  scenePlaneRef
})
</script>

<style scoped>
/* =============================================================================
   SCENE CONTAINER STYLES
   ============================================================================= */

#scene-container {
  position: relative;
  overflow: visible;
  background: linear-gradient(to bottom, var(--background-light, #2a2a2a), var(--background-dark, #1a1a1a));
  /* border-right: 1px solid #333; */ /* Removed - creating unwanted vertical line */
  flex-shrink: 0;
  /* Ensure gradients position relative to this container */
}

#scene-container.container-first {
  order: 1 !important;
}

#scene-container.container-second {
  order: 3 !important;
  border-right: none;
  border-left: 1px solid #333;
}

#scene-content {
  position: relative;
  width: 100%;
  height: 100%;
  max-height: var(--timeline-height, 2000px);
  overflow-y: auto;
  overflow-x: auto;
  /* Hide scrollbar for Firefox - with !important */
  scrollbar-width: none !important;
  /* Fallback: Make scrollbar thin if browser doesn't support 'none' */
  -ms-overflow-style: none !important; /* IE and Edge */
  /* Limit scroll area to actual timeline content height */
  padding: 0;
  margin: 0;
}

/* Hide scrollbar for WebKit browsers (Chrome, Safari, Edge) - High specificity */
#scene-container #scene-content::-webkit-scrollbar {
  display: none !important;
}

/* Additional WebKit scrollbar properties to ensure complete hiding */
#scene-container #scene-content::-webkit-scrollbar-track {
  display: none !important;
}

/* CRITICAL: Force hide cards with hasClone class (when their clone is displayed) */
:deep(.biz-card-div.hasClone),
:deep(.biz-card-div.force-hidden-for-clone) {
  display: none !important;
  visibility: hidden !important;
  opacity: 0 !important;
  pointer-events: none !important;
}

#scene-container #scene-content::-webkit-scrollbar-thumb {
  display: none !important;
}

#scene-plane {
  position: relative;
  width: 100%; /* Match scene-content width instead of fixed 500px */
  min-width: 500px; /* Ensure minimum width for card positioning */
  height: var(--timeline-height, 2000px);
  overflow: visible;
  /* Height now calculated to exactly match bottom-most content position */
  /* Removed min-height: 100% to prevent overscroll beyond timeline content */
  /* Force no extra spacing */
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

/* Scene gradients - positioned to fill full scene-container width */
#scene-container-top-gradient {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 50vh; /* Use viewport-relative height instead of fixed 1000px */
  pointer-events: none;
  z-index: 2;
  background: linear-gradient(to bottom, var(--background-light, #2a2a2a), transparent);
  /* Changed to 50vh to prevent overflow beyond container */
}

#scene-container-btm-gradient {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 50vh; /* Use viewport-relative height instead of fixed 1000px */
  pointer-events: none;
  z-index: 2;
  background: linear-gradient(to top, var(--background-dark, #1a1a1a), transparent);
  /* Changed to 50vh to prevent overflow beyond container */
}

/* =============================================================================
   BIZ CARD DIV STYLES (Scene-specific)
   ============================================================================= */

.biz-card-div {
  position: absolute;
  font-family: var(--scene-font-family, 'Inter', sans-serif);
  font-size: 12px;
  width: 180px;
  /* height: 200px; - REMOVED: Height now set dynamically based on job duration */
  min-height: 180px; /* Fallback minimum height if dynamic calculation fails */
  border: 1px solid #ccc;
  border-radius: 8px;
  padding: 10px;
  cursor: pointer;
  z-index: 10;
  box-sizing: border-box;
  
  /* Allow cards to extend beyond scene container boundaries */
  
  /* Color palette styling - these will be set by applyPaletteToElement */
  background-color: var(--data-background-color, #f0f0f0);
  color: var(--data-foreground-color, #333);
}

.biz-details-employer {
  font-weight: bold;
  margin-bottom: 5px;
  font-family: var(--scene-font-family, 'Inter', sans-serif);
}

.biz-details-role {
  margin-bottom: 5px;
  font-family: var(--scene-font-family, 'Inter', sans-serif);
}

.biz-details-dates {
  font-size: 0.9em;
  color: #666;
  font-family: var(--scene-font-family, 'Inter', sans-serif);
}

/* =============================================================================
   VIEWER LABEL
   ============================================================================= */

#scene-view-label {
  position: absolute;
  bottom: 5px;
  background: transparent;
  color: white;
  padding: 6px 10px;
  border-radius: 6px;
  font-family: sans-serif;
  font-size: 14px;
  font-weight: 600;
  pointer-events: none;
  z-index: 1000;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8);
}

/* Position mirrored based on layout */
.container-first #scene-view-label {
  right: 10px; /* Scene on left, label on right side */
}

.container-second #scene-view-label {
  left: 10px; /* Scene on right, label on left side */
}

/* .viewer-label styling consolidated in AppContent.vue */
</style>
