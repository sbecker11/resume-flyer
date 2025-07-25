import { ref, computed, onMounted, onUnmounted, watchEffect, getCurrentInstance } from 'vue';
import { BaseComponent } from '@/modules/core/abstracts/BaseComponent.mjs';
import { useLayoutToggle } from './useLayoutToggle.mjs';

// --- Constants ---
export const MODES = {
  LOCKED: 'locked',
  FOLLOWING: 'following',
  DRAGGING: 'dragging'
};

// --- BullsEye Manager Component (IM-managed) ---
export class BullsEyeManager extends BaseComponent {
  constructor() {
    super('BullsEyeManager');
    this.bullsEyeCore = null;
    this.mode = MODES.LOCKED;
    this.mousePosition = { x: 0, y: 0 };
    this.updateTimeout = null;
    
    // Reactive state
    this.bullsEyeState = ref({
      x: 0,
      y: 0
    });
  }

  getDependencies() {
    return ['BullsEye']; // Depend on the core BullsEye component
  }

  initialize(dependencies) {
    this.bullsEyeCore = dependencies.BullsEye;
    
    // Initial position update
    this.updateBullsEyePosition();
    
    // Set up event listeners for mouse tracking
    this.setupEventListeners();
  }

  updateBullsEyePosition() {
    if (this.bullsEyeCore && this.bullsEyeCore.isReady()) {
      const bullsEyeElement = this.bullsEyeCore.getBullsEyeElement();
      if (bullsEyeElement) {
        const rect = bullsEyeElement.getBoundingClientRect();
        this.bullsEyeState.value.x = rect.left + rect.width / 2;
        this.bullsEyeState.value.y = rect.top + rect.height / 2;
      }
    }
  }

  immediateBullsEyeUpdate(x, y, source = 'unknown') {
    // BULLS-EYE NEVER MOVES! It always stays at viewport center.
    // This method should NOT reposition the bulls-eye - that's handled by the core BullsEye component
    console.warn(`[BullsEyeManager] INVALID CALL: Bulls-eye should never move! Called from: ${source}`);
    console.warn('[BullsEyeManager] Bulls-eye position is managed by core BullsEye component and stays at viewport center');
    
    // Update reactive state to reflect current bulls-eye position (not the requested x,y)
    this.updateBullsEyePosition();
  }

  debouncedUpdateBullsEye(x, y, source = 'unknown') {
    if (this.updateTimeout) {
      clearTimeout(this.updateTimeout);
    }
    
    this.updateTimeout = setTimeout(() => {
      this.immediateBullsEyeUpdate(x, y, source);
      this.updateTimeout = null;
    }, 50); // 50ms debounce
  }

  setupEventListeners() {
    // Bulls-eye never moves - it stays at viewport center
    // No mouse tracking needed since bulls-eye position is fixed by core BullsEye component
    window.CONSOLE_LOG_IGNORE('[BullsEyeManager] No event listeners needed - bulls-eye position is fixed at viewport center');
  }

  setMode(newMode) {
    this.mode = newMode;
  }

  getMode() {
    return this.mode;
  }

  destroy() {
    if (this.updateTimeout) {
      clearTimeout(this.updateTimeout);
    }
    this.bullsEyeCore = null;
  }
}

// Create singleton instance
export const bullsEyeManager = new BullsEyeManager();

// --- Composable Wrapper (for Vue components) ---
let _instance = null;

export function useBullsEye() {
  // Singleton check - if instance exists, return it immediately
  if (_instance) {
    return _instance;
  }

  // Check if we're inside a Vue component instance
  const instance = getCurrentInstance();
  
  // Register cleanup on component unmount (only if inside a Vue component)
  if (instance) {
    onUnmounted(() => {
      cleanup();
    });
  }

  // Watch for layout changes and update bulls-eye reactively
  const layoutToggle = useLayoutToggle();
  watchEffect(() => {
    // Re-run when layout orientation changes
    const orientation = layoutToggle.orientation.value;
    window.CONSOLE_LOG_IGNORE(`BullsEye: Layout orientation changed to:`, orientation);
    
    // Trigger bulls-eye recalculation after layout change
    if (bullsEyeManager.bullsEyeCore) {
      setTimeout(() => {
        bullsEyeManager.updateBullsEyePosition();
      }, 350); // Wait for CSS transitions to complete
    }
  });

  // Create computed properties that reference the IM-managed bulls-eye state
  const x = computed(() => bullsEyeManager.bullsEyeState.value.x);
  const y = computed(() => bullsEyeManager.bullsEyeState.value.y);
  const position = computed(() => ({ 
    x: bullsEyeManager.bullsEyeState.value.x, 
    y: bullsEyeManager.bullsEyeState.value.y 
  }));
  const mode = computed(() => bullsEyeManager.getMode());
  const isLocked = computed(() => bullsEyeManager.getMode() === MODES.LOCKED);
  const isFollowing = computed(() => bullsEyeManager.getMode() === MODES.FOLLOWING);
  const isDragging = computed(() => bullsEyeManager.getMode() === MODES.DRAGGING);

  // Wrapper functions that delegate to the IM-managed instance
  function setBullsEye(x, y, source = 'composable') {
    console.warn(`[useBullsEye] INVALID CALL: Bulls-eye cannot be moved! Called from: ${source}`);
    console.warn('[useBullsEye] Bulls-eye position is fixed at viewport center by core BullsEye component');
    // Return current position instead of trying to move it
    return bullsEyeManager.updateBullsEyePosition();
  }

  function setMode(newMode) {
    return bullsEyeManager.setMode(newMode);
  }

  function updatePosition() {
    return bullsEyeManager.updateBullsEyePosition();
  }

  function cleanup() {
    // Cleanup handled by IM lifecycle
    window.CONSOLE_LOG_IGNORE('BullsEye: Composable cleanup called');
    _instance = null;
  }

  // Create the instance
  const bullsEyeInstance = {
    // Reactive state
    x,
    y,
    position,
    mode,
    isLocked,
    isFollowing,
    isDragging,
    
    // Methods
    setBullsEye,
    setMode,
    updatePosition,
    cleanup
  };

  _instance = bullsEyeInstance;
  return bullsEyeInstance;
}