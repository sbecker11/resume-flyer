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
    <div id="scene-content" ref="sceneContentRef">
      <div id="scene-plane" ref="scenePlaneRef">
        <Timeline :alignment="timelineAlignment" />
        <!-- BizCardDivs will be dynamically appended here by CardsController -->
      </div>
    </div>
    <div id="scene-view-label">
      <span class="viewer-label">Scene Viewer ({{ roundedScenePercentage }}%)</span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'

// Vue components
import Timeline from './Timeline.vue'

// Scene-specific composables
import { useCardsController } from '../composables/useCardsController.mjs'
import { useTimeline } from '../composables/useTimeline.mjs'
import { useFocalPoint } from '../composables/useFocalPoint.mjs'
import { useAimPoint } from '../composables/useAimPoint.mjs'
import { useViewport } from '../composables/useViewport.mjs'

// Core functionality
import { bullsEye } from '../core/bullsEye.mjs'
import * as scenePlaneModule from '../scene/scenePlaneModule.mjs'

// Props from parent AppContent
const props = defineProps({
  sceneContainerStyle: Object,
  firstContainer: String,
  secondContainer: String,
  scenePercentage: Number,
  timelineAlignment: String
})

// Computed properties
const roundedScenePercentage = computed(() => Math.round(props.scenePercentage))

// Template refs
const sceneContainerRef = ref(null)
const sceneContentRef = ref(null)
const scenePlaneRef = ref(null)

// Scene-specific composables
const { timelineHeight } = useTimeline()
const { initializeCardsController } = useCardsController()

// Focal point and aim point systems
const { setFocalPointElement } = useFocalPoint()
const { setAimPointElement } = useAimPoint()
const { initializeViewport } = useViewport()

// Event handlers
const handleSceneContainerClick = (event) => {
  console.log('Scene container clicked:', event)
}

// Lifecycle
onMounted(async () => {
  console.log('[SceneContainer] Initializing scene-specific systems...')
  
  try {
    // Wait for DOM to be ready
    await nextTick()
    
    // Set scene-plane height based on timeline height
    if (timelineHeight.value) {
      document.documentElement.style.setProperty('--timeline-height', `${timelineHeight.value}px`)
    }
    
    // Initialize scene-specific systems (these will get refs from parent)
    initializeViewport(sceneContainerRef.value)
    
    // Initialize business cards controller
    await initializeCardsController()
    
    // Initialize scene plane click handling for selection clearing
    await scenePlaneModule.initialize()
    
    console.log('[SceneContainer] ✅ Scene initialization complete!')
    
  } catch (error) {
    console.error('[SceneContainer] ❌ Scene initialization failed:', error)
  }
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
  border-right: 1px solid #333;
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
  overflow-x: visible;
  /* Limit scroll area to actual timeline content height */
  padding: 0;
  margin: 0;
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

.viewer-label {
  font-family: sans-serif;
  font-size: 14px;
  font-weight: 600;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8);
  white-space: nowrap;
}
</style>