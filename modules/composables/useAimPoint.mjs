import { ref, computed, getCurrentInstance } from 'vue';

// Constants
export const FOCALPOINT_MODES = {
  LOCKED: 'locked',
  FOLLOWING: 'following',
  DRAGGING: 'dragging'
};

// Simple aim point composable without IM framework
let _instance = null;

export function useAimPoint() {
  if (_instance) {
    return _instance;
  }

  // Reactive state
  const x = ref(window.innerWidth / 2);
  const y = ref(window.innerHeight / 2);
  const position = computed(() => ({ x: x.value, y: y.value }));
  
  // Focal point mode state
  const focalPointMode = ref(FOCALPOINT_MODES.LOCKED);
  const isLocked = computed(() => focalPointMode.value === FOCALPOINT_MODES.LOCKED);
  const isFollowing = computed(() => focalPointMode.value === FOCALPOINT_MODES.FOLLOWING);
  const isDragging = computed(() => focalPointMode.value === FOCALPOINT_MODES.DRAGGING);

  // Aim point element reference
  let aimPointElement = null;

  function setAimPointElement(element) {
    aimPointElement = element;
    console.log('[useAimPoint] AimPoint element set via template ref');
    updatePosition();
  }

  function updatePosition() {
    if (!aimPointElement) return;

    aimPointElement.style.position = 'fixed';
    aimPointElement.style.left = `${x.value}px`;
    aimPointElement.style.top = `${y.value + 1.375}px`;
    aimPointElement.style.transform = 'translate(-50%, -50%)';
    aimPointElement.style.zIndex = '101';
    aimPointElement.style.pointerEvents = 'none';
    aimPointElement.style.visibility = 'visible';
  }

  function setAimPoint(newX, newY, source = 'composable') {
    x.value = newX;
    y.value = newY;
    updatePosition();
  }

  function setFocalPointMode(newMode) {
    focalPointMode.value = newMode;
    
    // When switching to locked or dragging mode, position aim point at bulls-eye
    if (newMode === FOCALPOINT_MODES.LOCKED || newMode === FOCALPOINT_MODES.DRAGGING) {
      syncWithBullsEye();
    }
    
    window.dispatchEvent(new CustomEvent('focal-point-mode-changed', {
      detail: { focalPointMode: newMode }
    }));
  }

  function syncWithBullsEye() {
    // Get bulls-eye position if available
    if (window.bullsEye && window.bullsEye.isReady && window.bullsEye.isReady()) {
      const bullsEyePosition = window.bullsEye.getPosition();
      if (bullsEyePosition && bullsEyePosition.x && bullsEyePosition.y) {
        setAimPoint(bullsEyePosition.x, bullsEyePosition.y, 'bulls-eye-sync');
        console.log(`[useAimPoint] Synced with bulls-eye: ${bullsEyePosition.x}, ${bullsEyePosition.y}`);
      }
    }
  }

  function cycleFocalPointMode() {
    const modes = [FOCALPOINT_MODES.LOCKED, FOCALPOINT_MODES.FOLLOWING, FOCALPOINT_MODES.DRAGGING];
    const currentIndex = modes.indexOf(focalPointMode.value);
    const nextIndex = (currentIndex + 1) % modes.length;
    setFocalPointMode(modes[nextIndex]);
  }

  function cleanup() {
    window.CONSOLE_LOG_IGNORE('AimPoint: Composable cleanup called');
    document.removeEventListener('mousemove', handleMouseMove);
    _instance = null;
  }

  // Listen for bulls-eye movements when in locked mode
  window.addEventListener('bulls-eye-moved', (event) => {
    if (focalPointMode.value === FOCALPOINT_MODES.LOCKED) {
      const { position } = event.detail;
      setAimPoint(position.x, position.y, 'bulls-eye-moved');
      console.log(`[useAimPoint] Bulls-eye moved, aim point updated to: ${position.x}, ${position.y}`);
    }
  });

  // Mouse tracking for following mode only (drag mode parks at bulls-eye)
  const handleMouseMove = (event) => {
    if (focalPointMode.value === FOCALPOINT_MODES.FOLLOWING) {
      setAimPoint(event.clientX, event.clientY, 'mouse-tracking');
    }
    // In drag mode, AimPoint stays parked at bulls-eye - no mouse tracking
  };

  // Add mouse move listener
  document.addEventListener('mousemove', handleMouseMove);

  // Initial sync if already in locked mode
  if (focalPointMode.value === FOCALPOINT_MODES.LOCKED) {
    syncWithBullsEye();
  }

  // Create the instance
  const aimPointInstance = {
    // Reactive state
    x,
    y,
    position,
    focalPointMode,
    isLocked,
    isFollowing,
    isDragging,
    
    // Methods
    setAimPoint,
    setFocalPointMode,
    cycleFocalPointMode,
    setAimPointElement,
    updatePosition,
    syncWithBullsEye,
    cleanup
  };

  _instance = aimPointInstance;
  return aimPointInstance;
}