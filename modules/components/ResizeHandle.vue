<script setup lang="ts">
import { ref, computed, watch, onMounted, type Ref, type ComputedRef } from 'vue';
// useAimPoint removed during Vue 3 migration cleanup
import { useFocalPoint } from '@/modules/composables/useFocalPointVue3.mjs';
import { useResizeHandle } from '@/modules/composables/useResizeHandle.mjs';
import { useLayoutToggle } from '@/modules/composables/useLayoutToggle.mjs';
import { useAppState } from '@/modules/composables/useAppState';
import type { ResizeHandleProps, ResizeHandleEmits } from '@/modules/types/components';
import { useBullsEyeService } from '@/modules/core/globalServices';
import { reportError } from '@/modules/utils/errorReporting.mjs';

// Local type definitions
interface StepButton {
  id: string;
  action: (event: MouseEvent) => Promise<void>;
  disabled: boolean;
  title: string;
  icon: string;
}

// Component props and emits with type safety
const props = withDefaults(defineProps<ResizeHandleProps>(), {});
const emit = defineEmits<ResizeHandleEmits>();

// --- Composables ---
const { 
  percentage: scenePercentage, 
  isLeftCollapsed, 
  isRightCollapsed, 
  startDrag, 
  collapseLeft, 
  collapseRight, 
  toggleStepping 
} = useResizeHandle();

// Local reactive step count - simpler approach
const stepCount: Ref<number> = ref(1);

const { orientation } = useLayoutToggle();
const { updateAppState, appState } = useAppState();

// Use Vue 3 provide/inject instead of window.bullsEye
const bullsEye = useBullsEyeService();

// Sync stepCount from AppState (correct path: user-settings.resizeHandle.stepCount)
watch(
  () => appState.value?.['user-settings']?.resizeHandle?.stepCount,
  (newCount) => {
    if (newCount !== undefined && stepCount.value !== newCount) {
      stepCount.value = newCount;
    }
  },
  { immediate: true }
);

// Computed properties for button states - orientation aware
const isLeftDisabled: ComputedRef<boolean> = computed(() => {
  if (stepCount.value === 1) return true; // Always disabled in free drag mode
  
  if (orientation.value === 'scene-right') {
    // In scene-right: left button increases scene, disable when scene is at max (100%)
    return scenePercentage.value >= 95;
  } else {
    // In scene-left: left button decreases scene, disable when scene is at min (0%)
    return scenePercentage.value <= 5;
  }
});

const isRightDisabled: ComputedRef<boolean> = computed(() => {
  if (stepCount.value === 1) return true; // Always disabled in free drag mode
  
  if (orientation.value === 'scene-right') {
    // In scene-right: right button decreases scene, disable when scene is at min (0%)
    return scenePercentage.value <= 5;
  } else {
    // In scene-left: right button increases scene, disable when scene is at max (100%)
    return scenePercentage.value >= 95;
  }
});

// Step button click handlers with debug logging
async function handleStepLeft(event: MouseEvent): Promise<void> {
  // console.log('[ResizeHandle] Step left clicked');
  // console.log('[ResizeHandle] Orientation:', orientation.value);
  // console.log('[ResizeHandle] Current percentage:', scenePercentage.value);
  // console.log('[ResizeHandle] Step count:', stepCount.value);
  // console.log('[ResizeHandle] IsLeftDisabled:', isLeftDisabled.value);
  event.stopPropagation();
  
  // In scene-left: left button decreases scene percentage
  // In scene-right: left button increases scene percentage (mirrored behavior)
  if (orientation.value === 'scene-right') {
    // console.log('[ResizeHandle] Scene-right: Calling collapseRight to increase scene percentage');
    await collapseRight();
  } else {
    // console.log('[ResizeHandle] Scene-left: Calling collapseLeft to decrease scene percentage');
    await collapseLeft();
  }
  
  // Ensure bulls-eye is recentered after step operation
  if (bullsEye) {
    // console.log('[ResizeHandle] Recentering bulls-eye after step left');
    bullsEye.recenter();
  }
}

async function handleStepRight(event: MouseEvent): Promise<void> {
  // console.log('[ResizeHandle] Step right clicked');
  // console.log('[ResizeHandle] Orientation:', orientation.value);
  // console.log('[ResizeHandle] Current percentage:', scenePercentage.value);
  // console.log('[ResizeHandle] Step count:', stepCount.value);
  // console.log('[ResizeHandle] IsRightDisabled:', isRightDisabled.value);
  event.stopPropagation();
  
  // In scene-left: right button increases scene percentage
  // In scene-right: right button decreases scene percentage (mirrored behavior)
  if (orientation.value === 'scene-right') {
    // console.log('[ResizeHandle] Scene-right: Calling collapseLeft to decrease scene percentage');
    await collapseLeft();
  } else {
    // console.log('[ResizeHandle] Scene-left: Calling collapseRight to increase scene percentage');
    await collapseRight();
  }
  
  // Ensure bulls-eye is recentered after step operation
  if (bullsEye) {
    // console.log('[ResizeHandle] Recentering bulls-eye after step right');
    bullsEye.recenter();
  }
}

// Step buttons for resize handle movement
const stepLeftButton: ComputedRef<StepButton> = computed(() => {
  if (orientation.value === 'scene-right') {
    // In scene-right: left button increases scene size (points away from scene)
    return {
      id: 'step-left',
      action: handleStepLeft,
      disabled: isLeftDisabled.value, // Disabled when scene is collapsed
      title: 'Increase Scene Size (Point Away From Scene)',
      icon: '‹'
    };
  } else {
    // In scene-left: left button decreases scene size (points away from scene)
    return {
      id: 'step-left',
      action: handleStepLeft,
      disabled: isLeftDisabled.value, // Disabled when scene is collapsed (0%)
      title: 'Decrease Scene Size (Point Away From Scene)',
      icon: '‹'
    };
  }
});

const stepRightButton: ComputedRef<StepButton> = computed(() => {
  if (orientation.value === 'scene-right') {
    // In scene-right: right button decreases scene size (points away from resume)
    return {
      id: 'step-right',
      action: handleStepRight,
      disabled: isRightDisabled.value, // Disabled when resume is collapsed
      title: 'Decrease Scene Size (Point Away From Resume)',
      icon: '›'
    };
  } else {
    // In scene-left: right button increases scene size (points away from resume)
    return {
      id: 'step-right',
      action: handleStepRight,
      disabled: isRightDisabled.value, // Disabled when resume is collapsed (scene at 100%)
      title: 'Increase Scene Size (Point Away From Resume)',
      icon: '›'
    };
  }
});

// Get focal point mode from useFocalPoint - restored tri-state functionality
const { 
  mode: focalPointMode,
  cycleMode: cycleFocalPointMode
} = useFocalPoint();

// Debug watcher to see mode changes
watch(focalPointMode, (newMode, oldMode) => {
  console.log(`ResizeHandle: focalPointMode changed from ${oldMode} to ${newMode}`);
}, { immediate: true });

const {
  toggleOrientation,
  getToggleButtonText,
  getOrientationLabel
} = useLayoutToggle();

const isHovering = ref(false);
const isSteppingHovering = ref(false);
const isLayoutHovering = ref(false);
const hasJustClicked = ref(false); // Track if we just clicked (to maintain hover state)

const nextMode = computed(() => {
  switch (focalPointMode.value) {
    case 'locked': return 'following';
    case 'following': return 'dragging';
    case 'dragging': return 'locked';
    default: return 'locked';
  }
});

// Get layout button text - shows opposite direction on hover
const layoutButtonText = computed(() => {
  if (isLayoutHovering.value) {
    // On hover: show where scene will move to (opposite direction)
    return orientation.value === 'scene-left' ? '→' : '←';
  } else {
    // Normal state: show where scene currently is
    return getToggleButtonText();
  }
});

// The mode whose icon we're currently displaying (for CSS class styling)
const displayedIconMode = computed(() => {
    return isHovering.value ? nextMode.value : focalPointMode.value;
});

// The actual icon to show
const displayIcon = computed(() => {
    const modeToShow = isHovering.value ? nextMode.value : focalPointMode.value;
    // console.log('displayIcon computed:', {
    //     isHovering: isHovering.value,
    //     currentMode: focalPointMode.value,
    //     nextMode: nextMode.value,
    //     modeToShow,
    //     hasJustClicked: hasJustClicked.value
    // });
    switch (modeToShow) {
        case 'locked': return '⦻';
        case 'following': return '›';
        case 'dragging': return '⤮';
        default: return '⦻';
    }
});

// CSS classes for the button
const buttonClasses = computed(() => {
    return [
        displayedIconMode.value, // for mode-specific styling (font size, etc.)
        { hovering: isHovering.value } // for hover styling (colors)
    ];
});

const nextStepCount = computed(() => {
  return stepCount.value >= 10 ? 1 : stepCount.value + 1;
});

const displayStepCount = computed(() => {
  const currentStep = isSteppingHovering.value ? nextStepCount.value : stepCount.value;
  return currentStep === 1 ? '∞' : currentStep;
});

// --- Component Methods ---
function toggleFocalLock(event: MouseEvent): void {
  console.log('ResizeHandle: tri-state focal point toggle clicked');
  console.log('ResizeHandle: Current mode before cycling:', focalPointMode.value);
  event.stopPropagation();
  cycleFocalPointMode();
  console.log('ResizeHandle: Current mode after cycling:', focalPointMode.value);
  // Mark that we just clicked (don't reset hover state yet)
  hasJustClicked.value = true;
  
  // Force a small delay to ensure the mode change has been processed
  // This allows the nextMode computed to recalculate with the new current mode
  setTimeout(() => {
    // This setTimeout ensures the DOM and computeds have updated
    // The isHovering state remains true, so we'll show the next mode of the NEW current mode
  }, 0);
}

async function handleSteppingClick(event: MouseEvent): Promise<void> {
  event.stopPropagation();
  
  // Cycle through step counts: 1 -> 2 -> 3 -> ... -> 10 -> 1
  const currentSteps = stepCount.value;
  const nextSteps = currentSteps >= 10 ? 1 : currentSteps + 1;
  
  // Update local reactive state immediately
  stepCount.value = nextSteps;
  
  try {
    // Save to AppState (must include 'user-settings' wrapper)
    await updateAppState({
      'user-settings': {
        resizeHandle: {
          stepCount: nextSteps
        }
      }
    });
    
    console.log(`[ResizeHandle] Step count changed: ${currentSteps} -> ${nextSteps}`);
  } catch (error) {
    reportError(error, '[ResizeHandle] Failed to update step count', 'Reverting step count to previous value');
    stepCount.value = currentSteps;
    throw error;
  }
  
  // Reset hover state when step changes to prevent immediate hover preview
  isSteppingHovering.value = false;
}

function handleLayoutToggle(event: MouseEvent): void {
  event.stopPropagation();
  console.log('[ResizeHandle] BEFORE toggle:', orientation.value);
  toggleOrientation();
  console.log('[ResizeHandle] AFTER toggle:', orientation.value);
}

function handleResizeHandleClick(event: MouseEvent): void {
  // Prevent resize handle clicks from propagating to parent containers
  event.stopPropagation();
}
</script>

<template>
    <div id="resize-handle" class="resize-handle" @mousedown="startDrag" @click="handleResizeHandleClick">
        <div class="button-container" @click.stop @mousedown.stop>
            <button :id="stepLeftButton.id" class="toggle-circle" @click.stop="stepLeftButton.action" :disabled="stepLeftButton.disabled" :title="stepLeftButton.title">{{ stepLeftButton.icon }}</button>
            <button id="tri-state-toggle" 
                    class="toggle-circle" 
                    :class="buttonClasses"
                    @click.stop="toggleFocalLock" 
                    @mouseenter="isHovering = true; hasJustClicked = false"
                    @mouseleave="isHovering = false; hasJustClicked = false"
                    :title="isHovering ? 'Next: ' + nextMode + ' (click to switch)' : 'Current: ' + focalPointMode + ' (hover to preview next)'">
                <span>{{ displayIcon }}</span>
            </button>
            <button id="layout-toggle" 
                    class="toggle-circle" 
                    :class="{ 'hovering': isLayoutHovering }"
                    @click.stop="handleLayoutToggle" 
                    @mouseenter="isLayoutHovering = true"
                    @mouseleave="isLayoutHovering = false"
                    :title="`Scene is ${orientation === 'scene-left' ? 'on the left' : 'on the right'} (click to move scene ${orientation === 'scene-left' ? 'right' : 'left'})`">
                {{ layoutButtonText }}
            </button>
            <button id="stepping-indicator" 
                    class="toggle-circle" 
                    :class="{ 'hovering': isSteppingHovering, 'infinity-mode': stepCount === 1 }"
                    @click.stop="handleSteppingClick" 
                    @mouseenter="isSteppingHovering = true"
                    @mouseleave="isSteppingHovering = false"
                    :title="stepCount === 1 ? 'Free dragging (no steps)' : `Stepping: ${stepCount} steps`">{{ displayStepCount }}</button>
            <button :id="stepRightButton.id" class="toggle-circle" @click.stop="stepRightButton.action" :disabled="stepRightButton.disabled" :title="stepRightButton.title">{{ stepRightButton.icon }}</button>
        </div>
    </div>
</template>

<style scoped>
.resize-handle {
    position: relative;
    width: 20px;
    height: 100%;
    cursor: col-resize;
    background-color: var(--resize-handle-bg-color, #444);
    border-left: 1px solid #555;
    border-right: 1px solid #555;
    z-index: 10000;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    align-items: center;
    padding-bottom: 20px;
    box-sizing: border-box;
    flex-shrink: 0;
}

/* Add drop shadow on the scene-facing edge */
/* When scene is on left, shadow on left edge of handle */
.scene-left .resize-handle {
    box-shadow: -3px 0 8px rgba(0, 0, 0, 0.3);
}

/* When scene is on right, shadow on right edge of handle */
.scene-right .resize-handle {
    box-shadow: 3px 0 8px rgba(0, 0, 0, 0.3);
}



.button-container {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    pointer-events: auto; /* Ensure buttons can receive clicks */
}

.toggle-circle {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 2px solid white;
    background-color: var(--button-bg-color, #555);
    color: var(--button-text-color, white);
    cursor: pointer;
    display: flex;
    justify-content: center;
    align-items: center;
    font-size: 14px;
    font-weight: bold;
    padding: 0;
    flex-shrink: 0;
    transition: all 0.2s ease;
}

#tri-state-toggle {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 2px solid white;
    background-color: rgba(0,0,0,0.5);
    background-image: none;
    cursor: pointer;
    transition: all 0.2s ease;
    font-size: 16px;
    line-height: 1;
    text-align: center;
    position: relative;
}

/* Default state: current mode with white icon on black background */
#tri-state-toggle span {
    color: white;
    transition: color 0.2s ease;
}

/* Hover state: next mode with black icon on white background */
#tri-state-toggle.hovering {
    background-color: white;
    color: black;
    border-color: black;
}

#tri-state-toggle.hovering span {
    color: black;
}

/* Mode-specific font sizing adjustments */
#tri-state-toggle.following span,
#tri-state-toggle.dragging span {
    font-size: 20px;
}

#tri-state-toggle.following span {
    position: relative;
    top: -1px;
}

#stepping-indicator {
    font-size: 12px;
}

#stepping-indicator.infinity-mode {
    font-size: 16px;
}

#stepping-indicator.hovering {
    background-color: white;
    color: black;
    border-color: black;
}

#layout-toggle {
    font-size: 16px;
    font-weight: bold;
    font-family: monospace;
    line-height: 1;
    transition: all 0.2s ease;
}

#layout-toggle.hovering {
    background-color: white;
    color: black;
    border-color: black;
    transform: scale(1.1);
}

/* Hover effects for step buttons only */
#step-left:hover:not(:disabled),
#step-right:hover:not(:disabled) {
    background-color: var(--button-text-color, white);
    color: var(--button-bg-color, #555);
    border-color: var(--button-text-color, white);
}

/* Disabled state for step buttons */
#step-left:disabled,
#step-right:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    background-color: #444;
    color: #999;
    border-color: #666;
    transform: scale(0.95);
    pointer-events: none;
}
</style> 
