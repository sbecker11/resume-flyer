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
          <div id="resume-view-label">
            <span class="viewer-label">Resume Viewer ({{ roundedResumePercentage }}%)</span>
          </div>
        </div>
      </div>
    </div>

    <div id="aim-point" ref="aimPointRef"></div>
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
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'

// Vue components
import SceneContainer from './SceneContainer.vue'
import ResizeHandle from './ResizeHandle.vue'
import ResumeContainer from './ResumeContainer.vue'

// Centralized state management - replaces IM framework
import { useAppState } from '../composables/useAppState.mjs'
import { useColorPalette } from '../composables/useColorPalette.mjs'
import { useLayoutToggle } from '../composables/useLayoutToggle.mjs'

// Resume system initialization
import { initializeResumeSystem, testResumeSystem, checkResumeDivs, testScrolling } from '../resume/resumeSystemInitializer.mjs'
import { useResizeHandle } from '../composables/useResizeHandle.mjs'
import { useFocalPoint } from '../composables/useFocalPoint.mjs'
import { useAimPoint } from '../composables/useAimPoint.mjs'

// Core functionality imports
import { handleKeyDown } from '../core/keyDownModule.mjs'
// Direct BullsEye import - no more IM framework
import { bullsEye } from '../core/bullsEye.mjs'
// Import parallax module to trigger auto-initialization
import '../core/parallaxModule.mjs'
// Temporarily commented out old IM modules during Vue migration
// import { sceneContainer } from '../scene/sceneContainerModule.mjs'

// =============================================================================
// STATE MANAGEMENT - Centralized via composables
// =============================================================================

// Load AppState once for entire application
const { appState, loadAppState } = useAppState()

// Layout and viewport management
const { 
  orientation, 
  toggleOrientation, 
  scenePercentage, 
  resumePercentage,
  appContainerClass,
  firstContainer,
  secondContainer
} = useLayoutToggle()

// Resize handle functionality
const { 
  sceneContainerStyle 
} = useResizeHandle()

// Color palette management
const { loadPalettes } = useColorPalette()

// Focal point system
const { 
  position: focalPointPosition,
  x: focalPointX,
  y: focalPointY,
  isLocked: focalPointIsLocked,
  isDragging: focalPointIsDragging,
  setFocalPointElement
} = useFocalPoint()

// Aim point system  
const { setAimPointElement } = useAimPoint()

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

const sceneContainerRef = ref(null)  // Reference to SceneContainer component
const aimPointRef = ref(null)
const bullsEyeRef = ref(null)
const focalPointRef = ref(null)

// =============================================================================
// COMPUTED PROPERTIES
// =============================================================================

const timelineAlignment = computed(() => {
  return orientation.value === 'scene-left' ? 'right' : 'left'
})

// Ensure rounded percentages that add up to 100%
const roundedScenePercentage = computed(() => {
  const rounded = Math.round(scenePercentage.value)
  console.log(`[AppContent] scenePercentage: ${scenePercentage.value} -> rounded: ${rounded}`)
  return rounded
})
const roundedResumePercentage = computed(() => {
  const rawResumePercentage = resumePercentage.value
  const rounded = Math.round(rawResumePercentage)
  console.log(`[AppContent] *** DISPLAYED RESUME %: ${rounded}% *** (from composable: ${rawResumePercentage})`)
  console.log(`[AppContent] scenePercentage: ${scenePercentage.value}, should be: ${100 - scenePercentage.value}`)
  return rounded
})

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
  console.log('🔵 [AppContent] MOUNTED - SHOULD LOAD SCENECONTAINER 🔵')
  console.log('[AppContent] 🚀 Starting app-level initialization...')
  
  try {
    // PHASE 1: Load AppState (app-level state management)
    console.log('[AppContent] 📄 Loading AppState...')
    await loadAppState()
    
    // PHASE 2: Initialize app-level systems
    console.log('[AppContent] ⚙️ Initializing app-level systems...')
    
    // Wait for next tick to ensure DOM is fully rendered
    await nextTick()
    
    // Initialize color palette system (app-wide)
    console.log('[AppContent] About to call loadPalettes()...')
    try {
      await loadPalettes()
      console.log('[AppContent] ✅ loadPalettes() completed successfully')
    } catch (error) {
      console.error('[AppContent] ❌ loadPalettes() failed:', error)
    }
    
    // Initialize app-level positioning systems
    setFocalPointElement(focalPointRef.value)
    setAimPointElement(aimPointRef.value)
    
    // BullsEye needs reference to scene container (get from SceneContainer component)
    const sceneContainerElement = sceneContainerRef.value?.$refs?.sceneContainerRef
    if (sceneContainerElement) {
      bullsEye.initialize(bullsEyeRef.value, sceneContainerElement)
    }
    
    // Initialize resume system (make controllers globally available)
    console.log('[AppContent] 📋 Initializing resume system...')
    await initializeResumeSystem()
    
    // Make test functions available for browser console testing
    window.testResumeSystem = testResumeSystem
    window.checkResumeDivs = checkResumeDivs
    window.testScrolling = testScrolling
    
    // Setup keyboard event handling (app-level)
    document.addEventListener('keydown', handleKeyDown)
    
    console.log('[AppContent] ✅ App-level initialization complete!')
    
  } catch (error) {
    console.error('[AppContent] ❌ App initialization failed:', error)
  }
})

onUnmounted(() => {
  console.log('[AppContent] 🧹 Cleaning up...')
  
  // Remove event listeners
  document.removeEventListener('keydown', handleKeyDown)
  
  // Cleanup systems - TODO: replace with Vue composable cleanup
  // parallaxModule.destroy?.()
  // sceneContainer.destroy?.()
  
  console.log('[AppContent] ✅ Cleanup complete')
})

// =============================================================================
// REACTIVE UPDATES - Vue's native reactivity
// =============================================================================

// Watch for layout changes and update accordingly
watch(orientation, (newOrientation) => {
  console.log(`[AppContent] Layout changed to: ${newOrientation}`)
  console.log(`[AppContent] appContainerClass: ${appContainerClass.value}`)
  console.log(`[AppContent] firstContainer: ${firstContainer.value}`)
  console.log(`[AppContent] secondContainer: ${secondContainer.value}`)
  console.log(`[AppContent] scenePercentage: ${scenePercentage.value}%`)
  console.log(`[AppContent] resumePercentage: ${resumePercentage.value}%`)
  
  // Debug the DOM structure
  setTimeout(() => {
    const appContainer = document.getElementById('app-container');
    const sceneContainer = document.getElementById('scene-container');
    const resumeContainer = document.getElementById('resume-container');
    const resizeHandle = document.getElementById('resize-handle');
    
    console.log('[AppContent] DOM DEBUG:');
    console.log('  app-container classes:', appContainer?.className);
    console.log('  scene-container classes:', sceneContainer?.className);
    console.log('  scene-container computed order:', getComputedStyle(sceneContainer)?.order);
    console.log('  resume-container classes:', resumeContainer?.className);
    console.log('  resume-container computed order:', getComputedStyle(resumeContainer)?.order);
    console.log('  resize-handle computed order:', getComputedStyle(resizeHandle)?.order);
    
    // Expected orders for scene-left: scene=1, handle=2, resume=3
    // Expected orders for scene-right: resume=1, handle=2, scene=3
    const expectedSceneOrder = newOrientation === 'scene-left' ? '1' : '3';
    const expectedResumeOrder = newOrientation === 'scene-left' ? '3' : '1';
    console.log(`[AppContent] Expected scene order: ${expectedSceneOrder}, actual: ${getComputedStyle(sceneContainer)?.order}`);
    console.log(`[AppContent] Expected resume order: ${expectedResumeOrder}, actual: ${getComputedStyle(resumeContainer)?.order}`);
  }, 100);
}, { immediate: true })

// Watch for AppState changes
watch(appState, (newState) => {
  if (newState) {
    console.log('[AppContent] AppState updated:', newState.version)
    // React to AppState changes
  }
}, { deep: true })

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

/* Scene layout variations */
#app-container.scene-left {
  flex-direction: row !important;
}

#app-container.scene-right {
  flex-direction: row !important;
}

/* Debug borders removed per user request */

/* Debug background gradients also removed */

/* Scene-specific styles moved to SceneContainer.vue */

/* =============================================================================
   RESUME CONTAINER STYLES
   ============================================================================= */

#resume-container {
  display: flex;
  flex: 1;
  background: #f8f9fa;
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

/* ResizeHandle always stays in the middle */
.resize-handle {
  order: 2 !important;
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

#aim-point {
  position: absolute;
  width: 10px;
  height: 10px;
  background: rgba(255, 0, 0, 0.8);
  border-radius: 50%;
  pointer-events: none;
  z-index: var(--z-aim-point, 101);
  transform: translate(-50%, -50%);
}

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
  color: #00ff00;
}

#focal-point.dragging {
  color: #ff6600;
  transform: translate(-50%, -50%) scale(1.2);
}

/* =============================================================================
   VIEWER LABELS
   ============================================================================= */

#resume-view-label {
  position: absolute;
  bottom: 9px;
  background: transparent;
  color: black;
  padding: 6px 10px;
  border-radius: 6px;
  font-family: sans-serif;
  font-size: 14px;
  font-weight: 600;
  pointer-events: none;
  z-index: 1000;
  text-shadow: 2px 2px 4px rgba(255, 255, 255, 0.8);
}

/* Position mirrored based on layout orientation */
#app-container.scene-left #resume-view-label {
  left: 10px; /* Resume on right when scene on left, label on left side */
}

#app-container.scene-right #resume-view-label {
  right: 10px; /* Resume on left when scene on right, label on right side */
}

.viewer-label {
  font-family: sans-serif;
  font-size: 14px;
  font-weight: 600;
  text-shadow: 2px 2px 4px rgba(255, 255, 255, 0.8);
  white-space: nowrap;
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
  
  #aim-point {
    background: #ff0000;
  }
  
  #bulls-eye {
    color: #00ffff;
  }
}
</style>