import { ref, computed, nextTick, getCurrentInstance } from 'vue';
import { BaseComponent } from '@/modules/core/abstracts/BaseComponent.mjs';
import { useLayoutToggle } from './useLayoutToggle.mjs';
import { AppState, saveState } from '@/modules/core/stateManager.mjs';
import { performanceMonitor } from '@/modules/utils/performanceMonitor.mjs';
import { errorBoundary } from '@/modules/core/errorBoundary.mjs';

const HANDLE_WIDTH = 20;
const DEFAULT_WIDTH_PERCENT = 50;

// --- ResizeHandle Manager Component (IM-managed) ---
export class ResizeHandleManager extends BaseComponent {
  constructor() {
    super('ResizeHandleManager');
    this.viewport = null;
    this.bullsEyeManager = null;
    this.aimPointManager = null;
    this._resizeTimeoutId = null;
    
    // Reactive state
    this.uiPercentage = ref(DEFAULT_WIDTH_PERCENT);
    this.sceneWidthInPixels = ref(0);
    this.isDragging = ref(false);
    this.steppingEnabled = ref(false);
    this.stepCount = ref(5);
  }

  getDependencies() {
    return ['ViewportManager', 'BullsEyeManager', 'AimPointManager'];
  }

  initialize(dependencies) {
    this.viewport = dependencies.ViewportManager;
    this.bullsEyeManager = dependencies.BullsEyeManager;
    this.aimPointManager = dependencies.AimPointManager;
    
    // Initialize state from AppState
    this.initializeState();
    
    // Add debounced window resize listener
    window.addEventListener('resize', this.debouncedResizeHandler.bind(this));
  }

  initializeState() {
    // Convert stored true scene percentage back to internal percentage
    const storedScenePercentage = AppState?.layout?.scenePercentage;
    let initialPercentage = DEFAULT_WIDTH_PERCENT;
    
    if (storedScenePercentage) {
      const windowWidth = window.innerWidth;
      const resumeContainerWidth = 20;
      const maxSceneWidth = windowWidth - resumeContainerWidth;
      const storedSceneWidth = (storedScenePercentage / 100) * windowWidth;
      initialPercentage = (storedSceneWidth / maxSceneWidth) * 100;
    }
    this.steppingEnabled.value = AppState?.resizeHandle?.steppingEnabled || false;
    this.stepCount.value = AppState?.resizeHandle?.stepCount || 5;
    this.uiPercentage.value = initialPercentage;
  }

  clampToRange(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  handleViewportResize() {
    // 1. Recenter the bullsEye
    if (this.bullsEyeManager && this.bullsEyeManager.recenterBullsEye) {
        this.bullsEyeManager.recenterBullsEye();
    }
    
    // 2. Update aimPoint position to bullsEye center
    let bullsEyeCenter = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    if (this.bullsEyeManager && this.bullsEyeManager.getBullsEyePosition) {
        const bullsEyePosition = this.bullsEyeManager.getBullsEyePosition();
        if (bullsEyePosition) {
            bullsEyeCenter = {
                x: bullsEyePosition.x,
                y: bullsEyePosition.y
            };
        }
    }
    this.aimPointManager.setPosition(bullsEyeCenter.x, bullsEyeCenter.y, 'viewportResize');
    
    // 3. Update focal point to aimPoint position
    const event = new CustomEvent('focal-point-update', { 
        detail: { 
            source: 'viewportResize',
            position: bullsEyeCenter
        } 
    });
    window.dispatchEvent(event);
  }

  updateLayout(newUiPercentage, shouldSave = true) {
    // Performance monitoring
    const perfId = performanceMonitor.startTiming('resize_layout');
    
    try {
        const windowWidth = window.innerWidth;
        const resumeContainerWidth = 20;
        const maxSceneWidth = windowWidth - resumeContainerWidth;
        
        let actualPercentage = this.clampToRange(newUiPercentage, 0, 100);
        let finalSceneWidth = Math.floor((actualPercentage / 100) * maxSceneWidth);
        
        // Store the values
        this.sceneWidthInPixels.value = finalSceneWidth;
        this.uiPercentage.value = actualPercentage;
        
        if (this.viewport) {
            this.viewport.setViewPortWidth(finalSceneWidth);
        }
        
        if (AppState?.layout) {
            // Calculate true percentages of total window width
            const trueScenePercentage = (finalSceneWidth / windowWidth) * 100;
            const trueResumePercentage = ((windowWidth - finalSceneWidth) / windowWidth) * 100;
            
            AppState.layout.scenePercentage = trueScenePercentage;
            AppState.layout.resumePercentage = trueResumePercentage;
            
            if (shouldSave) {
                saveState(AppState);
            }
        }
        
        const event = new CustomEvent('layout-changed', { detail: { sceneWidth: finalSceneWidth } });
        window.dispatchEvent(event);
        
        // Log completion - no logAndReset method exists
    } catch (error) {
        console.error('ResizeHandle updateLayout error:', error);
    } finally {
        performanceMonitor.endTiming(perfId);
    }
  }

  debouncedResizeHandler() {
    if (this._resizeTimeoutId) {
        clearTimeout(this._resizeTimeoutId);
    }
    this._resizeTimeoutId = setTimeout(() => {
        this.handleViewportResize();
        this._resizeTimeoutId = null;
    }, 100);
  }

  // Stepping functionality
  async collapseLeft() {
    const increment = 100 / this.stepCount.value;
    let newPercentage;
    if (this.stepCount.value === 1) {
        newPercentage = 0;
    } else {
        const currentBlock = Math.ceil(this.uiPercentage.value / increment);
        newPercentage = Math.max(0, currentBlock - 1) * increment;
    }
    this.updateLayout(newPercentage);
    await nextTick();
    this.viewport.updateViewportProperties();
  }

  async collapseRight() {
    const increment = 100 / this.stepCount.value;
    let newPercentage;
    if (this.stepCount.value === 1) {
        newPercentage = 100;
    } else {
        const currentBlock = Math.floor(this.uiPercentage.value / increment);
        newPercentage = Math.min(100, currentBlock + 1) * increment;
    }
    this.updateLayout(newPercentage);
    await nextTick();
    this.viewport.updateViewportProperties();
  }

  applyInitialLayout() {
    this.updateLayout(this.uiPercentage.value, false);
  }

  destroy() {
    if (this._resizeTimeoutId) {
        clearTimeout(this._resizeTimeoutId);
        this._resizeTimeoutId = null;
    }
    window.removeEventListener('resize', this.debouncedResizeHandler.bind(this));
  }
}

// Create singleton instance
export const resizeHandleManager = new ResizeHandleManager();

// --- Composable Wrapper (for Vue components) ---
let _instance = null;

export function useResizeHandle() {
  // Singleton check
  if (_instance) {
    return _instance;
  }

  // Get layout orientation
  const { orientation } = useLayoutToggle();

  // Create computed properties that reference the IM-managed state
  const uiPercentage = computed(() => resizeHandleManager.uiPercentage?.value || DEFAULT_WIDTH_PERCENT);
  const sceneWidthInPixels = computed(() => resizeHandleManager.sceneWidthInPixels?.value || 0);
  const isDragging = computed(() => resizeHandleManager.isDragging?.value || false);
  const steppingEnabled = computed(() => resizeHandleManager.steppingEnabled?.value || false);
  const stepCount = computed(() => resizeHandleManager.stepCount?.value || 5);

  // Computed properties for layout
  const incrementPercentage = computed(() => {
    return steppingEnabled.value ? 100 / stepCount.value : 0;
  });

  const scenePercentage = computed(() => {
    const windowWidth = window.innerWidth;
    return windowWidth > 0 ? (sceneWidthInPixels.value / windowWidth) * 100 : 50;
  });

  const resumePercentage = computed(() => {
    return 100 - scenePercentage.value;
  });

  const handleStyle = computed(() => ({
    left: `${sceneWidthInPixels.value}px`,
    width: `${HANDLE_WIDTH}px`,
    zIndex: 1000
  }));

  // Computed properties for collapse states
  const isLeftCollapsed = computed(() => {
    return uiPercentage.value <= 5; // Consider collapsed if less than 5%
  });

  const isRightCollapsed = computed(() => {
    return uiPercentage.value >= 95; // Consider collapsed if greater than 95%
  });

  // Legacy compatibility aliases
  const percentage = computed(() => scenePercentage.value);

  // Wrapper functions that delegate to the IM-managed instance
  function updateLayoutFromPercentage(newPercentage) {
    return resizeHandleManager.updateLayout(newPercentage);
  }

  function applyInitialLayout() {
    return resizeHandleManager.applyInitialLayout();
  }

  function collapseLeft() {
    return resizeHandleManager.collapseLeft();
  }

  function collapseRight() {
    return resizeHandleManager.collapseRight();
  }

  function startDrag() {
    if (resizeHandleManager) {
      resizeHandleManager.isDragging.value = true;
    }
  }

  function toggleStepping() {
    if (resizeHandleManager) {
      resizeHandleManager.steppingEnabled.value = !resizeHandleManager.steppingEnabled.value;
    }
  }

  // Legacy compatibility method (will be removed after migration)
  function initializeResizeHandleState(viewport = null, bullsEyeInstance = null) {
    console.warn('[ResizeHandle] initializeResizeHandleState is deprecated - ResizeHandleManager handles initialization via IM');
    // No-op - IM handles initialization
  }

  // Create the instance
  const resizeHandleInstance = {
    // Reactive state
    uiPercentage,
    sceneWidthInPixels,
    isDragging,
    steppingEnabled,
    stepCount,
    incrementPercentage,
    scenePercentage,
    resumePercentage,
    handleStyle,
    orientation,
    isLeftCollapsed,
    isRightCollapsed,
    percentage, // Legacy alias for scenePercentage
    
    // Methods
    updateLayoutFromPercentage,
    applyInitialLayout,
    collapseLeft,
    collapseRight,
    startDrag,
    toggleStepping,
    initializeResizeHandleState // Legacy compatibility
  };

  _instance = resizeHandleInstance;
  return resizeHandleInstance;
}