import { ref, computed, onMounted, onUnmounted, watchEffect, getCurrentInstance } from 'vue';
import { BaseComponent } from '@/modules/core/abstracts/BaseComponent.mjs';
import { useBullsEye } from './useBullsEye.mjs';

// --- Constants ---
export const MODES = {
  LOCKED: 'locked',
  FOLLOWING: 'following',
  DRAGGING: 'dragging'
};

// --- AimPoint Manager Component (IM-managed) ---
export class AimPointManager extends BaseComponent {
  constructor() {
    super('AimPointManager');
    this.aimPointElement = null;
    this.bullsEyeManager = null;
    this.modeState = ref(MODES.LOCKED); // Make mode reactive
    this.mousePosition = { x: 0, y: 0 };
    this.lastLoggedPosition = { x: -1, y: -1 };
    
    // Reactive state
    this.aimPointState = ref({
      x: 0,
      y: 0
    });
  }

  getDependencies() {
    return ['BullsEyeManager']; // Depend on BullsEye for coordination
  }

  initialize(dependencies) {
    this.bullsEyeManager = dependencies.BullsEyeManager;
    
    // Set up event listeners for mouse tracking
    this.setupEventListeners();
    
    // Initial position sync with bulls-eye
    this.syncWithBullsEye();
  }

  // Called by Vue component to provide template ref
  setAimPointElement(element) {
    this.aimPointElement = element;
    console.log('[AimPointManager] AimPoint element set via template ref');
    
    // Initialize position based on current mode
    this.initializePosition();
    
    // Apply initial positioning
    this.updateAimPointPosition();
  }
  
  initializePosition() {
    if (this.modeState.value === MODES.LOCKED) {
      // Position at bulls-eye center
      const initializationManager = window.initializationManager;
      if (initializationManager) {
        const bullsEye = initializationManager.getComponent('BullsEye');
        if (bullsEye && bullsEye.getPosition) {
          const bullsEyePos = bullsEye.getPosition();
          this.aimPointState.value.x = bullsEyePos.x;
          this.aimPointState.value.y = bullsEyePos.y;
          console.log('[AimPointManager] Initialized at bulls-eye position:', bullsEyePos);
          return;
        }
      }
      
      // Fallback: center of viewport
      this.aimPointState.value.x = window.innerWidth / 2;
      this.aimPointState.value.y = window.innerHeight / 2;
      console.log('[AimPointManager] Initialized at viewport center');
    } else if (this.modeState.value === MODES.FOLLOWING) {
      // Position at current mouse position
      this.aimPointState.value.x = this.mousePosition.x || window.innerWidth / 2;
      this.aimPointState.value.y = this.mousePosition.y || window.innerHeight / 2;
      console.log('[AimPointManager] Initialized at mouse position:', this.mousePosition);
    }
  }

  syncWithBullsEye() {
    if (this.bullsEyeManager && this.bullsEyeManager.bullsEyeState) {
      // Sync position with bulls-eye
      const bullsEyePos = this.bullsEyeManager.bullsEyeState.value;
      this.aimPointState.value.x = bullsEyePos.x;
      this.aimPointState.value.y = bullsEyePos.y;
      this.updateAimPointPosition();
    }
  }

  updateAimPointPosition() {
    if (!this.aimPointElement) {
      console.warn('[AimPointManager] Cannot update position - no element available');
      return;
    }

    const { x, y } = this.aimPointState.value;
    console.log(`[AimPointManager] Updating aim point position to: (${x}, ${y})`);
    
    // Apply positioning styles
    this.aimPointElement.style.position = 'fixed';
    this.aimPointElement.style.left = `${x}px`;
    this.aimPointElement.style.top = `${y}px`;
    this.aimPointElement.style.transform = 'translate(-50%, -50%)';
    this.aimPointElement.style.pointerEvents = 'none';
    this.aimPointElement.style.zIndex = '10000'; // Above bulls-eye
    this.aimPointElement.style.visibility = 'visible'; // Ensure visibility
    this.aimPointElement.style.display = 'block'; // Ensure display
  }

  setPosition(x, y, source = 'external') {
    this.aimPointState.value.x = x;
    this.aimPointState.value.y = y;
    this.updateAimPointPosition();
    
    // NOTE: Bulls-eye NEVER moves - it always stays at viewport center
    // The aim point moves independently of the bulls-eye
    // Bulls-eye position is managed by the core BullsEye component
  }

  setupEventListeners() {
    // Dragging state
    let isDragging = false;
    
    // Mouse tracking for following mode
    const handleMouseMove = (event) => {
      this.mousePosition.x = event.clientX;
      this.mousePosition.y = event.clientY;
      
      if (this.modeState.value === MODES.FOLLOWING) {
        this.setPosition(event.clientX, event.clientY, 'mouse-follow');
      } else if (this.modeState.value === MODES.DRAGGING) {
        // DRAGGING mode: aim point follows mouse for aggressive/immediate tracking
        this.setPosition(event.clientX, event.clientY, 'aggressive-tracking');
      }
    };

    // Mouse down to start dragging
    const handleMouseDown = (event) => {
      console.log(`[AimPointManager] Mouse down - mode: ${this.modeState.value}, isDragging: ${isDragging}`);
      if (this.modeState.value === MODES.DRAGGING) {
        isDragging = true;
        console.log(`[AimPointManager] Starting drag at: (${event.clientX}, ${event.clientY})`);
        this.setPosition(event.clientX, event.clientY, 'drag-start');
        event.preventDefault();
      }
    };

    // Mouse up to stop dragging
    const handleMouseUp = (event) => {
      if (isDragging) {
        console.log(`[AimPointManager] Stopping drag at: (${event.clientX}, ${event.clientY})`);
        isDragging = false;
      }
    };

    // Tri-state focal point button click handler
    const handleFocalPointButtonClick = (event) => {
      if (event.target.matches('[data-focal-point-button], .focal-point-button, #focal-point-button')) {
        this.cycleFocalPointMode();
        event.preventDefault();
        event.stopPropagation();
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('click', handleFocalPointButtonClick);
    
    // Store for cleanup
    this.handleMouseMove = handleMouseMove;
    this.handleMouseDown = handleMouseDown;
    this.handleMouseUp = handleMouseUp;
    this.handleFocalPointButtonClick = handleFocalPointButtonClick;
  }

  // Tri-state focal point button functionality
  cycleFocalPointMode() {
    const modes = [MODES.LOCKED, MODES.FOLLOWING, MODES.DRAGGING];
    const currentIndex = modes.indexOf(this.modeState.value);
    const nextIndex = (currentIndex + 1) % modes.length;
    const newMode = modes[nextIndex];
    
    this.setMode(newMode);
    
    // Update button visual state
    this.updateFocalPointButtonState(newMode);
    
    // Notify bulls-eye of mode change
    if (this.bullsEyeManager) {
      this.bullsEyeManager.setMode(newMode);
    }
    
    window.CONSOLE_LOG_IGNORE(`[AimPointManager] Focal point mode changed to: ${newMode}`);
  }

  updateFocalPointButtonState(mode) {
    const button = document.querySelector('[data-focal-point-button], .focal-point-button, #focal-point-button');
    if (button) {
      // Remove all mode classes
      button.classList.remove('locked', 'following', 'dragging');
      // Add current mode class
      button.classList.add(mode);
      
      // Update button text/icon based on mode
      const modeTexts = {
        [MODES.LOCKED]: '🔒',
        [MODES.FOLLOWING]: '👁️',
        [MODES.DRAGGING]: '✋'
      };
      
      if (button.textContent !== undefined) {
        button.textContent = modeTexts[mode] || '?';
      }
      
      // Update aria-label for accessibility
      button.setAttribute('aria-label', `Focal point mode: ${mode}`);
    }
  }

  setMode(newMode, skipSync = false) {
    console.log(`[AimPointManager] setMode called: ${this.modeState.value} -> ${newMode}`);
    this.modeState.value = newMode;
    this.updateFocalPointButtonState(newMode);
    
    // Update aim point position based on new mode
    if (this.aimPointElement) {
      this.initializePosition();
      this.updateAimPointPosition();
    }
    
    // Dispatch mode change event for FocalPointManager to listen to
    window.dispatchEvent(new CustomEvent('focal-point-mode-changed', { 
      detail: { mode: newMode } 
    }));
    
    console.log(`[AimPointManager] Mode successfully changed to: ${newMode}`);
  }

  getMode() {
    return this.modeState.value;
  }

  destroy() {
    if (this.handleMouseMove) {
      document.removeEventListener('mousemove', this.handleMouseMove);
    }
    if (this.handleMouseDown) {
      document.removeEventListener('mousedown', this.handleMouseDown);
    }
    if (this.handleMouseUp) {
      document.removeEventListener('mouseup', this.handleMouseUp);
    }
    if (this.handleFocalPointButtonClick) {
      document.removeEventListener('click', this.handleFocalPointButtonClick);
    }
    this.aimPointElement = null;
    this.bullsEyeManager = null;
  }
}

// Create singleton instance
export const aimPointManager = new AimPointManager();

// --- Composable Wrapper (for Vue components) ---
let _instance = null;

export function useAimPoint() {
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

  const bullsEye = useBullsEye();

  // Create computed properties that reference the IM-managed aim point state
  const x = computed(() => aimPointManager.aimPointState.value.x);
  const y = computed(() => aimPointManager.aimPointState.value.y);
  const position = computed(() => ({ 
    x: aimPointManager.aimPointState.value.x, 
    y: aimPointManager.aimPointState.value.y 
  }));
  const mode = computed(() => aimPointManager.modeState.value);
  const isLocked = computed(() => aimPointManager.modeState.value === MODES.LOCKED);
  const isFollowing = computed(() => aimPointManager.modeState.value === MODES.FOLLOWING);
  const isDragging = computed(() => aimPointManager.modeState.value === MODES.DRAGGING);

  // Wrapper functions that delegate to the IM-managed instance
  function setAimPoint(x, y, source = 'composable') {
    return aimPointManager.setPosition(x, y, source);
  }

  function setMode(newMode) {
    return aimPointManager.setMode(newMode);
  }

  function cycleFocalPointMode() {
    return aimPointManager.cycleFocalPointMode();
  }

  // Method for Vue component to provide template ref
  function setAimPointElement(element) {
    return aimPointManager.setAimPointElement(element);
  }

  function updatePosition() {
    return aimPointManager.updateAimPointPosition();
  }

  function cleanup() {
    // Cleanup handled by IM lifecycle
    window.CONSOLE_LOG_IGNORE('AimPoint: Composable cleanup called');
    _instance = null;
  }

  // Create the instance
  const aimPointInstance = {
    // Reactive state
    x,
    y,
    position,
    mode,
    isLocked,
    isFollowing,
    isDragging,
    
    // Methods
    setAimPoint,
    setMode,
    cycleFocalPointMode,
    setAimPointElement, // For template ref injection
    updatePosition,
    cleanup
  };

  _instance = aimPointInstance;
  return aimPointInstance;
}