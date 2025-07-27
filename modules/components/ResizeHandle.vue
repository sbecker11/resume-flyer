<script setup>
import { ref, computed, watch } from 'vue';
import { useAimPoint } from '@/modules/composables/useAimPoint.mjs';
import { useResizeHandle, resizeHandleManager } from '@/modules/composables/useResizeHandle.mjs';
import { useLayoutToggle } from '@/modules/composables/useLayoutToggle.mjs';
import { AppState, saveState } from '@/modules/core/stateManager.mjs';
import BadgeToggle from '@/modules/components/BadgeToggle.vue';

// --- Composables ---
const { 
  percentage: scenePercentage, 
  isLeftCollapsed, 
  isRightCollapsed, 
  stepCount,
  startDrag, 
  collapseLeft, 
  collapseRight, 
  toggleStepping 
} = useResizeHandle();

// Computed properties for button states
const isLeftDisabled = computed(() => {
  return isLeftCollapsed.value || stepCount.value === 1;
});

const isRightDisabled = computed(() => {
  return isRightCollapsed.value || stepCount.value === 1;
});

// Step button click handlers with debug logging
function handleStepLeft(event) {
  console.log('[ResizeHandle] Step left clicked - DECREASE scene percentage');
  console.log('[ResizeHandle] Orientation:', orientation.value);
  console.log('[ResizeHandle] Current percentage:', scenePercentage.value);
  console.log('[ResizeHandle] Step count:', stepCount.value);
  console.log('[ResizeHandle] IsLeftDisabled:', isLeftDisabled.value);
  event.stopPropagation();
  
  // Left button decreases scene percentage (collapseLeft decreases percentage)
  console.log('[ResizeHandle] Calling collapseLeft to decrease scene percentage');
  collapseLeft();
}

function handleStepRight(event) {
  console.log('[ResizeHandle] Step right clicked - INCREASE scene percentage');
  console.log('[ResizeHandle] Orientation:', orientation.value);
  console.log('[ResizeHandle] Current percentage:', scenePercentage.value);
  console.log('[ResizeHandle] Step count:', stepCount.value);
  console.log('[ResizeHandle] IsRightDisabled:', isRightDisabled.value);
  event.stopPropagation();
  
  // Right button increases scene percentage (collapseRight increases percentage)
  console.log('[ResizeHandle] Calling collapseRight to increase scene percentage');
  collapseRight();
}

// Step buttons for resize handle movement
const stepLeftButton = computed(() => {
  // Left button moves handle left (right side grows, left side shrinks)
  return {
    id: 'step-left',
    action: handleStepLeft,
    disabled: isRightDisabled.value, // Disabled when right side is collapsed
    title: 'Move Handle Left (Right Side Grows)',
    icon: '‹'
  };
});

const stepRightButton = computed(() => {
  // Right button moves handle right (left side grows, right side shrinks)  
  return {
    id: 'step-right',
    action: handleStepRight,
    disabled: isLeftDisabled.value, // Disabled when left side is collapsed
    title: 'Move Handle Right (Left Side Grows)',
    icon: '›'
  };
});

const { 
  mode: focalPointMode,
  cycleFocalPointMode
} = useAimPoint();

// Debug watcher to see mode changes
watch(focalPointMode, (newMode, oldMode) => {
  console.log(`ResizeHandle: focalPointMode changed from ${oldMode} to ${newMode}`);
}, { immediate: true });

const {
  orientation,
  toggleOrientation,
  getToggleButtonText,
  getOrientationLabel
} = useLayoutToggle();

const isHovering = ref(false);
const isSteppingHovering = ref(false);
const hasJustClicked = ref(false); // Track if we just clicked (to maintain hover state)

const nextMode = computed(() => {
  switch (focalPointMode.value) {
    case 'locked': return 'following';
    case 'following': return 'dragging';
    case 'dragging': return 'locked';
    default: return 'locked';
  }
});

// The mode whose icon we're currently displaying (for CSS class styling)
const displayedIconMode = computed(() => {
    return isHovering.value ? nextMode.value : focalPointMode.value;
});

// The actual icon to show
const displayIcon = computed(() => {
    const modeToShow = isHovering.value ? nextMode.value : focalPointMode.value;
    console.log('displayIcon computed:', {
        isHovering: isHovering.value,
        currentMode: focalPointMode.value,
        nextMode: nextMode.value,
        modeToShow,
        hasJustClicked: hasJustClicked.value
    });
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
function toggleFocalLock(event) {
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

function handleSteppingClick(event) {
  event.stopPropagation();
  
  // Cycle through step counts: 1 -> 2 -> 3 -> ... -> 10 -> 1
  if (resizeHandleManager) {
    const currentSteps = resizeHandleManager.stepCount.value;
    const nextSteps = currentSteps >= 10 ? 1 : currentSteps + 1;
    resizeHandleManager.stepCount.value = nextSteps;
    
    // Update AppState and save
    if (AppState?.resizeHandle) {
      AppState.resizeHandle.stepCount = nextSteps;
      saveState(AppState);
    }
    
    console.log(`[ResizeHandle] Step count changed: ${currentSteps} -> ${nextSteps}`);
  }
  
  // Reset hover state when step changes to prevent immediate hover preview
  isSteppingHovering.value = false;
}

function handleLayoutToggle(event) {
  event.stopPropagation();
  window.CONSOLE_LOG_IGNORE('BEFORE toggle:', orientation.value);
  toggleOrientation();
  window.CONSOLE_LOG_IGNORE('AFTER toggle:', orientation.value);
}
</script>

<template>
    <div id="resize-handle" class="resize-handle" @mousedown="startDrag">
        <div class="button-container">
            <button :id="stepLeftButton.id" class="toggle-circle" @click.stop="stepLeftButton.action" :disabled="stepLeftButton.disabled" :title="stepLeftButton.title">{{ stepLeftButton.icon }}</button>
            <button id="tri-state-toggle" 
                    class="toggle-circle" 
                    :class="buttonClasses"
                    @click.stop="toggleFocalLock" 
                    @mousedown="startDrag"
                    @mouseenter="isHovering = true; hasJustClicked = false"
                    @mouseleave="isHovering = false; hasJustClicked = false"
                    :title="isHovering ? 'Next: ' + nextMode + ' (click to switch)' : 'Current: ' + focalPointMode + ' (hover to preview next)'">
                <span>{{ displayIcon }}</span>
            </button>
            <BadgeToggle @mousedown="startDrag" />
            <button id="layout-toggle" 
                    class="toggle-circle" 
                    @click.stop="handleLayoutToggle" 
                    @mousedown="startDrag"
                    :title="`Layout: ${getOrientationLabel()} (click to swap)`">
                {{ getToggleButtonText() }}
            </button>
            <button id="stepping-indicator" 
                    class="toggle-circle" 
                    :class="{ 'hovering': isSteppingHovering, 'infinity-mode': stepCount === 1 }"
                    @click.stop="handleSteppingClick" 
                    @mousedown="startDrag"
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
    background-color: var(--resize-handle-bg-color, #333);
    z-index: 10000;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    align-items: center;
    padding-bottom: 20px;
    box-sizing: border-box;
    flex-shrink: 0;
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
    font-size: 18px;
    font-weight: bold;
}

#layout-toggle:hover {
    background-color: white;
    color: black;
    border-color: black;
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