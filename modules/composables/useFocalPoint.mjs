import { ref, computed, onMounted, onUnmounted, getCurrentInstance } from 'vue';
import { BaseComponent } from '@/modules/core/abstracts/BaseComponent.mjs';
import { useAimPoint, MODES } from './useAimPoint.mjs';
import * as mathUtils from '@/modules/utils/mathUtils.mjs';

// --- Constants ---
const EASE_FACTOR = 0.05;

// --- FocalPoint Manager Component (IM-managed) ---
export class FocalPointManager extends BaseComponent {
  constructor() {
    super('FocalPointManager');
    this.focalPointElement = null;
    this.stateManager = null;
    this.animationFrameId = null;
    
    // Reactive state
    this.focalPointState = ref({
      current: { x: 0, y: 0 },
      target: { x: 0, y: 0 }
    });
  }

  getDependencies() {
    return ['StateManager']; // Only depend on StateManager
  }

  initialize(dependencies) {
    this.stateManager = dependencies.StateManager;
    
    // Set up animation loop for smooth focal point movement
    this.startAnimationLoop();
    
    // Set up event listeners
    this.setupEventListeners();
    
    // Listen for mode changes from AimPointManager
    window.addEventListener('focal-point-mode-changed', (event) => {
      const mode = event.detail.mode;
      if (mode === MODES.LOCKED) {
        // Position at bulls-eye when locked
        const initializationManager = window.initializationManager;
        if (initializationManager) {
          const bullsEye = initializationManager.getComponent('BullsEye');
          if (bullsEye && bullsEye.getPosition) {
            const bullsEyePos = bullsEye.getPosition();
            this.setTarget(bullsEyePos.x, bullsEyePos.y, 'mode-change-to-locked');
          }
        }
      }
    });
    
    // Sync focal point with aim point position changes  
    this.syncWithAimPoint();
  }
  
  syncWithAimPoint() {
    // Get AimPointManager from IM
    const initializationManager = window.initializationManager;
    if (initializationManager) {
      const aimPointManager = initializationManager.getComponent('AimPointManager');
      if (aimPointManager && aimPointManager.aimPointState) {
        // Set up continuous sync with aim point position
        this.aimPointSyncInterval = setInterval(() => {
          const aimPos = aimPointManager.aimPointState.value;
          this.setTarget(aimPos.x, aimPos.y, 'aim-point-sync');
        }, 50); // ~20fps sync for smoother easing
        
        console.log('[FocalPointManager] Started syncing with aim point position');
      }
    }
  }

  // Called by Vue component to provide template ref
  setFocalPointElement(element) {
    this.focalPointElement = element;
    window.CONSOLE_LOG_IGNORE('[FocalPointManager] FocalPoint element set via template ref');
    
    // Apply initial positioning
    this.updateFocalPointPosition();
  }

  updateFocalPointPosition() {
    if (!this.focalPointElement) return;

    const { x, y } = this.focalPointState.value.current;
    
    // Apply positioning styles
    this.focalPointElement.style.position = 'fixed';
    this.focalPointElement.style.left = `${x}px`;
    this.focalPointElement.style.top = `${y}px`;
    this.focalPointElement.style.transform = 'translate(-50%, -50%)';
    this.focalPointElement.style.zIndex = '1001'; // Above bulls-eye and aim point
    
    // Update visual state based on mode
    this.updateVisualState();
  }

  updateVisualState() {
    if (!this.focalPointElement) return;
    
    // Get current mode from AimPointManager
    const initializationManager = window.initializationManager;
    const aimPointManager = initializationManager?.getComponent('AimPointManager');
    const mode = aimPointManager?.getMode() || MODES.LOCKED;
    
    // Remove all mode classes
    this.focalPointElement.classList.remove('locked', 'following', 'dragging');
    
    // Add current mode class
    this.focalPointElement.classList.add(mode);
    
    // Update locked state data attribute for CSS styling
    const isLocked = mode === MODES.LOCKED;
    this.focalPointElement.setAttribute('data-locked', isLocked);
    this.focalPointElement.classList.toggle('locked', isLocked);
    
    // Update dragging state
    const isDragging = mode === MODES.DRAGGING;
    this.focalPointElement.setAttribute('data-dragging', isDragging);
    this.focalPointElement.classList.toggle('dragging', isDragging);
  }

  setTarget(x, y, source = 'external') {
    this.focalPointState.value.target.x = x;
    this.focalPointState.value.target.y = y;
    
    // Get current mode from AimPointManager
    const initializationManager = window.initializationManager;
    const aimPointManager = initializationManager?.getComponent('AimPointManager');
    const mode = aimPointManager?.getMode() || MODES.LOCKED;
    
    // In DRAGGING mode, snap immediately for aggressive tracking
    if (mode === MODES.DRAGGING) {
      this.focalPointState.value.current.x = x;
      this.focalPointState.value.current.y = y;
      this.updateFocalPointPosition();
    }
    // In other modes, let animation loop handle smooth movement with easing
  }

  startAnimationLoop() {
    const animate = () => {
      const current = this.focalPointState.value.current;
      const target = this.focalPointState.value.target;
      
      // Calculate distance and apply easing
      const dx = target.x - current.x;
      const dy = target.y - current.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      // Only animate if there's significant movement needed
      if (distance > 0.5) {
        current.x += dx * EASE_FACTOR;
        current.y += dy * EASE_FACTOR;
        this.updateFocalPointPosition();
      }
      
      // Continue animation loop
      this.animationFrameId = requestAnimationFrame(animate);
    };
    
    this.animationFrameId = requestAnimationFrame(animate);
  }

  setupEventListeners() {
    // Sync with aim point position changes
    if (this.aimPointManager) {
      // Watch for aim point changes and update focal point target
      const syncWithAimPoint = () => {
        if (this.aimPointManager.aimPointState) {
          const aimPos = this.aimPointManager.aimPointState.value;
          this.setTarget(aimPos.x, aimPos.y, 'aim-point-sync');
        }
      };
      
      // Initial sync
      syncWithAimPoint();
      
      // Set up periodic sync (since we can't directly watch the aim point state from here)
      this.syncInterval = setInterval(syncWithAimPoint, 50);
    }

    // Handle focal point dragging
    let isDragging = false;
    let dragOffset = { x: 0, y: 0 };

    const handleMouseDown = (event) => {
      if (event.target === this.focalPointElement && this.mode === MODES.DRAGGING) {
        isDragging = true;
        const rect = this.focalPointElement.getBoundingClientRect();
        dragOffset.x = event.clientX - (rect.left + rect.width / 2);
        dragOffset.y = event.clientY - (rect.top + rect.height / 2);
        event.preventDefault();
      }
    };

    const handleMouseMove = (event) => {
      if (isDragging) {
        const newX = event.clientX - dragOffset.x;
        const newY = event.clientY - dragOffset.y;
        this.setTarget(newX, newY, 'drag');
        
        // Update aim point and bulls-eye when dragging
        if (this.aimPointManager) {
          this.aimPointManager.setPosition(newX, newY, 'focal-point-drag');
        }
      }
    };

    const handleMouseUp = () => {
      if (isDragging) {
        isDragging = false;
        
        // Save focal point position to state
        if (this.stateManager) {
          const AppState = this.stateManager.getAppState();
          if (AppState && AppState.focalPoint) {
            AppState.focalPoint.x = this.focalPointState.value.current.x;
            AppState.focalPoint.y = this.focalPointState.value.current.y;
            // Note: StateManager handles saving automatically
          }
        }
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    // Store for cleanup
    this.handleMouseDown = handleMouseDown;
    this.handleMouseMove = handleMouseMove;
    this.handleMouseUp = handleMouseUp;
  }


  destroy() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    if (this.aimPointSyncInterval) {
      clearInterval(this.aimPointSyncInterval);
    }
    if (this.handleMouseDown) {
      document.removeEventListener('mousedown', this.handleMouseDown);
    }
    if (this.handleMouseMove) {
      document.removeEventListener('mousemove', this.handleMouseMove);
    }
    if (this.handleMouseUp) {
      document.removeEventListener('mouseup', this.handleMouseUp);
    }
    this.focalPointElement = null;
    this.stateManager = null;
  }
}

// Create singleton instance
export const focalPointManager = new FocalPointManager();

// --- Composable Wrapper (for Vue components) ---
let _instance = null;

export function useFocalPoint() {
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

  const aimPoint = useAimPoint();
  const { position: aimPointPosition, mode: aimPointMode } = aimPoint;

  // Create computed properties that reference the IM-managed focal point state
  const position = computed(() => focalPointManager.focalPointState.value.current);
  const target = computed(() => focalPointManager.focalPointState.value.target);
  const mode = computed(() => aimPointMode.value); // Get mode from AimPointManager
  const isLocked = computed(() => aimPointMode.value === MODES.LOCKED);
  const isDragging = computed(() => aimPointMode.value === MODES.DRAGGING);

  // Current position components
  const x = computed(() => focalPointManager.focalPointState.value.current.x);
  const y = computed(() => focalPointManager.focalPointState.value.current.y);

  // Wrapper functions that delegate to the IM-managed instance
  function setFocalPoint(x, y, source = 'composable') {
    return focalPointManager.setTarget(x, y, source);
  }

  // Method for Vue component to provide template ref
  function setFocalPointElement(element) {
    return focalPointManager.setFocalPointElement(element);
  }

  function updatePosition() {
    return focalPointManager.updateFocalPointPosition();
  }

  function cleanup() {
    // Cleanup handled by IM lifecycle
    window.CONSOLE_LOG_IGNORE('FocalPoint: Composable cleanup called');
    _instance = null;
  }

  // Create the instance
  const focalPointInstance = {
    // Reactive state
    position,
    target,
    mode,
    isLocked,
    isDragging,
    x,
    y,
    
    // Methods
    setFocalPoint,
    setFocalPointElement, // For template ref injection
    updatePosition,
    cleanup
  };

  _instance = focalPointInstance;
  return focalPointInstance;
}