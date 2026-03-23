<script setup lang="ts">
import { ref, computed, watch, onMounted, type Ref, type ComputedRef } from 'vue';
// useAimPoint removed during Vue 3 migration cleanup
import { FOCALPOINT_MODES } from '@/modules/composables/useFocalPointVue3.mjs';
import { useAppStore } from '@/modules/stores/appStore.mjs';
import { useResizeHandle } from '@/modules/composables/useResizeHandle.mjs';
import { useLayoutToggle } from '@/modules/composables/useLayoutToggle.mjs';
import { useAppState } from '@/modules/composables/useAppState';
import type { ResizeHandleProps, ResizeHandleEmits } from '@/modules/types/components';
import { useBullsEyeService } from '@/modules/core/globalServices';
import { reportError } from '@/modules/utils/errorReporting.mjs';
import Scene3DSettings from './Scene3DSettings.vue';

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
const { store, actions: appStoreActions } = useAppStore();

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

// Focal tri-state: use shared app store only (avoid a second useFocalPoint() instance in this component).
const focalPointMode = computed(() => store.focalPoint.mode);

const FOCAL_CYCLE_ORDER = [
  FOCALPOINT_MODES.LOCKED,
  FOCALPOINT_MODES.FOLLOWING,
  FOCALPOINT_MODES.DRAGGING,
] as const;

function cycleFocalPointMode(): void {
  const modes = FOCAL_CYCLE_ORDER;
  const i = modes.indexOf(store.focalPoint.mode as (typeof modes)[number]);
  const currentIndex = i >= 0 ? i : 0;
  const next = modes[(currentIndex + 1) % modes.length];
  appStoreActions.setFocalPointMode(next);
}

const {
  toggleOrientation,
  getToggleButtonText,
  getOrientationLabel
} = useLayoutToggle();

const isHovering = ref(false);
const isSteppingHovering = ref(false);
const isLayoutHovering = ref(false);
const hasJustClicked = ref(false); // Track if we just clicked (to maintain hover state)

/** Tooltip visible only on mouse hover over the tri-state button. */
const showFocalTriStateTooltip = computed(() => isHovering.value);

const FOCAL_MODE_TITLE: Record<string, string> = {
  [FOCALPOINT_MODES.LOCKED]: 'focal point locked at viewport center (bulls eye)\n→ no motion parallax',
  [FOCALPOINT_MODES.FOLLOWING]: 'focal point eases to mouse\n→ smooth motion parallax',
  [FOCALPOINT_MODES.DRAGGING]: 'mouse drags focal point\n→ fast motion parallax',
};

/** Tooltip and aria: current mode only, no "click to cycle". */
const triStateFocalButtonTitle = computed(() => {
  return FOCAL_MODE_TITLE[focalPointMode.value] ?? `Mode: ${focalPointMode.value}`;
});

const triStateFocalAriaLabel = computed(() => {
  return FOCAL_MODE_TITLE[focalPointMode.value] ?? String(focalPointMode.value);
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

/** Current mode only (no next-mode preview on hover). */
const displayedIconMode = computed(() => String(focalPointMode.value).toLowerCase());

function getRuntimeBase() {
  const envBase = (import.meta?.env?.BASE_URL || '/');
  let base = envBase;
  if (typeof window !== 'undefined') {
    const path = window.location.pathname || '/';
    const parts = path.split('/').filter(Boolean);
    const useSubpath = parts.length > 0 && (envBase === '/' || !path.startsWith(envBase));
    if (useSubpath) base = `/${parts[0]}/`;
  }
  return base.endsWith('/') ? base : `${base}/`;
}
function basePathJoin(relPath: string) {
  const b = getRuntimeBase();
  const p = relPath.startsWith('/') ? relPath.slice(1) : relPath;
  return `${b}${p}`;
}

/** 15x15 PNG path for LOCKED and DRAGGING only. FOLLOWING keeps SVG (no changes). */
const focalTriStateIconSrc = computed(() => {
  const mode = focalPointMode.value;
  if (mode === FOCALPOINT_MODES.FOLLOWING) return null;
  const variant = isHovering.value ? 'black' : 'white';
  const iconMode = String(mode).toLowerCase();
  return basePathJoin(`static_content/icons/x-hairs/15/${iconMode}-15-${variant}.png`);
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
            <div class="tri-state-wrap">
              <button id="tri-state-toggle" 
                      type="button"
                      class="toggle-circle" 
                      :class="buttonClasses"
                      @click.stop="toggleFocalLock" 
                      @mouseenter="isHovering = true; hasJustClicked = false"
                      @mouseleave="isHovering = false; hasJustClicked = false"
                      :aria-label="triStateFocalAriaLabel">
                <img
                  v-if="focalTriStateIconSrc"
                  :src="focalTriStateIconSrc"
                  class="tri-state-icon-img"
                  width="15"
                  height="15"
                  alt=""
                  aria-hidden="true"
                />
                <!-- FOLLOWING: unchanged (SVG reticle, inverted on hover via currentColor) -->
                <svg
                  v-else
                  class="tri-state-reticle"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.5" />
                  <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1" />
                  <line x1="12" y1="2" x2="12" y2="6" stroke="currentColor" stroke-width="1" />
                  <line x1="12" y1="18" x2="12" y2="22" stroke="currentColor" stroke-width="1" />
                  <line x1="2" y1="12" x2="6" y2="12" stroke="currentColor" stroke-width="1" />
                  <line x1="18" y1="12" x2="22" y2="12" stroke="currentColor" stroke-width="1" />
                </svg>
              </button>
              <div
                v-show="showFocalTriStateTooltip"
                id="tri-state-tooltip-text"
                class="tri-state-tooltip"
                role="tooltip"
              >
                {{ triStateFocalButtonTitle }}
              </div>
            </div>
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
            <Scene3DSettings />
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
    overflow: visible;
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
    overflow: visible; /* tooltip must not shrink to ~24px strip width */
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

.tri-state-wrap {
    position: relative;
    display: flex;
    justify-content: center;
    align-items: center;
    flex-shrink: 0;
    overflow: visible;
}

/*
 * Focal-mode tooltip: parent column is only ~24px wide; without explicit width,
 * shrink-to-fit can crush the box (serif fallback + “chimney” wrapping).
 */
.tri-state-tooltip {
    position: absolute;
    left: calc(100% + 6px);
    top: 50%;
    transform: translateY(-50%);
    margin: 0;
    box-sizing: border-box;
    width: clamp(200px, min(268px, calc(100vw - 32px)), 268px);
    padding: 10px 12px;
    background: rgba(32, 32, 32, 0.98);
    color: #f2f2f2;
    border: 1px solid #777;
    border-radius: 6px;
    font-family: var(
        --scene-font-family,
        system-ui,
        -apple-system,
        BlinkMacSystemFont,
        'Segoe UI',
        Roboto,
        'Helvetica Neue',
        Arial,
        sans-serif
    );
    font-size: 13px;
    font-weight: 500;
    line-height: 1.45;
    letter-spacing: 0.01em;
    -webkit-font-smoothing: antialiased;
    z-index: 10002;
    pointer-events: none;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.45);
    text-align: left;
    white-space: pre-line;
    hyphens: none;
    overflow-wrap: break-word;
    word-break: normal;
}

/* 15x15 PNG dead center; on-hover shows inverted (black) variant */
#tri-state-toggle {
    width: 24px;
    height: 24px;
    min-width: 24px;
    min-height: 24px;
    border-radius: 50%;
    border: 2px solid white;
    background-color: rgba(0,0,0,0.5);
    background-image: none;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
}

#tri-state-toggle .tri-state-icon-img,
#tri-state-toggle .tri-state-reticle {
    width: 15px;
    height: 15px;
    flex-shrink: 0;
    display: block;
    transform: translate(-0.5px, -0.5px);
}

#tri-state-toggle .tri-state-icon-img {
    object-fit: contain;
}

#tri-state-toggle .tri-state-reticle {
    color: inherit;
}

#tri-state-toggle.hovering .tri-state-reticle {
    color: black;
}

/* Hover: inverted icon (black on white) via PNG variant */
#tri-state-toggle.hovering {
    background-color: white;
    border-color: black;
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
