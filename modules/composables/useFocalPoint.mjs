import { ref, computed, getCurrentInstance } from 'vue';
import { useAimPoint, FOCALPOINT_MODES } from './useAimPoint.mjs';

// Simple focal point composable without IM framework
let _instance = null;

export function useFocalPoint() {
  // Singleton check - if instance exists, return it immediately
  if (_instance) {
    return _instance;
  }

  // Current position components
  const x = ref(0);
  const y = ref(0);

  // Computed position object
  const position = computed(() => ({ x: x.value, y: y.value }));
  
  // Get focal point mode from aim point
  const aimPoint = useAimPoint();
  const focalPointMode = computed(() => aimPoint.focalPointMode.value || FOCALPOINT_MODES.LOCKED);
  const isLocked = computed(() => focalPointMode.value === FOCALPOINT_MODES.LOCKED);
  const isDragging = computed(() => focalPointMode.value === FOCALPOINT_MODES.DRAGGING);

  // Simple focal point element reference
  let focalPointElement = null;

  // Method for Vue component to provide template ref
  function setFocalPointElement(element) {
    focalPointElement = element;
    console.log('[useFocalPoint] FocalPoint element set via template ref');
    updatePosition();
  }

  function updatePosition() {
    if (!focalPointElement) return;

    focalPointElement.style.position = 'fixed';
    focalPointElement.style.left = `${x.value}px`;
    focalPointElement.style.top = `${y.value}px`;
    focalPointElement.style.transform = 'translate(-50%, -50%)';
    focalPointElement.style.zIndex = '100';
    focalPointElement.style.pointerEvents = 'none';
    focalPointElement.style.visibility = (x.value > 0 && y.value > 0) ? 'visible' : 'hidden';
  }

  function setFocalPoint(newX, newY, source = 'composable') {
    x.value = newX;
    y.value = newY;
    updatePosition();
  }

  function cleanup() {
    window.CONSOLE_LOG_IGNORE('FocalPoint: Composable cleanup called');
    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }
    removeMouseListener();
    _instance = null;
  }

  // Initialize with center position
  x.value = window.innerWidth / 2;
  y.value = window.innerHeight / 2;

  // Animation state
  let animationFrame = null;
  let targetX = x.value;
  let targetY = y.value;

  function startEasing() {
    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
    }

    function animate() {
      const currentX = x.value;
      const currentY = y.value;
      
      // Calculate distance to target
      const dx = targetX - currentX;
      const dy = targetY - currentY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      // If we're close enough, snap to target
      if (distance < 1) {
        x.value = targetX;
        y.value = targetY;
        updatePosition();
        animationFrame = null;
        return;
      }
      
      // Easing factor - adjust for desired animation speed
      const easingFactor = isDragging.value ? 1 : 0.15; // Immediate in dragging mode, smooth otherwise
      
      // Update position with easing
      x.value = currentX + (dx * easingFactor);
      y.value = currentY + (dy * easingFactor);
      updatePosition();
      
      // Continue animation
      animationFrame = requestAnimationFrame(animate);
    }
    
    animate();
  }

  function setTarget(newX, newY, source = 'composable') {
    targetX = newX;
    targetY = newY;
    
    if (isDragging.value) {
      // In drag mode: Pure DOM manipulation, no Vue reactivity, no animation
      if (focalPointElement) {
        focalPointElement.style.left = `${newX}px`;
        focalPointElement.style.top = `${newY}px`;
      }
      // Cancel animation loop entirely - no need to run it in drag mode
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
        animationFrame = null;
      }
      // Skip all Vue reactive updates for maximum performance
      return;
    } else {
      // Non-drag modes: Start smooth easing animation with Vue reactivity
      startEasing();
    }
  }

  // Pure vanilla JavaScript mouse handler - completely bypass composable in drag mode
  let isDragModeActive = false;
  let vanillaMouseHandler = null;
  
  // Create separate vanilla JS handler that never touches Vue
  function createVanillaHandler() {
    return (event) => {
      if (focalPointElement) {
        focalPointElement.style.left = event.clientX + 'px';
        focalPointElement.style.top = event.clientY + 'px';
      }
    };
  }
  
  const handleMouseMove = (event) => {
    // Only used for non-drag modes - Vue path
    x.value = event.clientX;
    y.value = event.clientY;
  };

  let mouseListenerActive = false;

  function addMouseListener() {
    if (!mouseListenerActive) {
      if (isDragModeActive) {
        // Pure vanilla JS handler for drag mode - never calls Vue composable
        vanillaMouseHandler = createVanillaHandler();
        document.addEventListener('mousemove', vanillaMouseHandler, { passive: true });
        console.log('[useFocalPoint] Pure vanilla JS mouse listener added for drag mode');
      } else {
        // Vue composable handler for other modes
        document.addEventListener('mousemove', handleMouseMove, { passive: true });
        console.log('[useFocalPoint] Vue mouse listener added for non-drag mode');
      }
      mouseListenerActive = true;
    }
  }

  function removeMouseListener() {
    if (mouseListenerActive) {
      if (vanillaMouseHandler) {
        document.removeEventListener('mousemove', vanillaMouseHandler, { passive: true });
        vanillaMouseHandler = null;
        console.log('[useFocalPoint] Pure vanilla JS mouse listener removed');
      } else {
        document.removeEventListener('mousemove', handleMouseMove, { passive: true });
        console.log('[useFocalPoint] Vue mouse listener removed');
      }
      mouseListenerActive = false;
    }
  }

  // Listen for aim point changes to update focal point target
  window.addEventListener('focal-point-mode-changed', () => {
    console.log('[useFocalPoint] Mode changed event received, current mode:', focalPointMode.value);
    // Handle mode-specific behavior
    if (focalPointMode.value === FOCALPOINT_MODES.DRAGGING) {
      // Switch to cursor-based drag mode - hide DOM element, show custom cursor
      isDragModeActive = true;
      
      // Hide the focal point DOM element entirely
      if (focalPointElement) {
        focalPointElement.style.display = 'none';
      }
      
      // Set crosshair cursor specifically on scene container and its children
      const sceneContainer = document.getElementById('scene-container');
      if (sceneContainer) {
        sceneContainer.style.setProperty('cursor', 'crosshair', 'important');
        
        // Apply crosshair to all elements within scene container
        const sceneElements = sceneContainer.querySelectorAll('*');
        sceneElements.forEach(el => {
          el.style.setProperty('cursor', 'crosshair', 'important');
        });
        
        console.log('[useFocalPoint] Applied crosshair cursor to scene container and its children');
      }
      
      console.log('[useFocalPoint] Switched to cursor-based drag mode');
    } else {
      // Switch away from drag mode - show DOM element, restore normal cursor
      isDragModeActive = false;
      
      // Show the focal point DOM element
      if (focalPointElement) {
        focalPointElement.style.display = 'flex';
      }
      
      // Restore normal cursor by removing the forced styles from scene container
      const sceneContainer = document.getElementById('scene-container');
      if (sceneContainer) {
        sceneContainer.style.removeProperty('cursor');
        
        // Clear cursor from scene container children
        const sceneElements = sceneContainer.querySelectorAll('*');
        sceneElements.forEach(el => {
          el.style.removeProperty('cursor');
        });
        
        console.log('[useFocalPoint] Restored default cursors in scene container');
      }
      
      // Sync reactive values with current mouse position since DOM element was hidden
      x.value = targetX;
      y.value = targetY;
      
      // Restart animation loop for non-drag modes
      if (!aimPointWatcher) {
        aimPointWatcher = requestAnimationFrame(checkAimPointChanges);
      }
      
      // Re-sync with aim point when mode changes to non-drag
      if (aimPoint.position.value.x && aimPoint.position.value.y) {
        setTarget(aimPoint.position.value.x, aimPoint.position.value.y, 'mode-change');
      }
      console.log('[useFocalPoint] Switched back to DOM-based mode');
    }
  });

  // Initialize cursor-based drag mode if starting in drag mode
  if (focalPointMode.value === FOCALPOINT_MODES.DRAGGING) {
    isDragModeActive = true;
    // Apply cursor styling immediately
    if (focalPointElement) {
      focalPointElement.style.display = 'none';
    }
    const sceneContainer = document.getElementById('scene-container');
    if (sceneContainer) {
      sceneContainer.style.cursor = 'crosshair';
    }
    document.body.style.cursor = 'crosshair';
    document.documentElement.style.cursor = 'crosshair';
  }

  // Watch for aim point position changes (only when not in drag mode)
  let lastAimX = aimPoint.x.value;
  let lastAimY = aimPoint.y.value;
  let aimPointWatcher = null;
  
  function checkAimPointChanges() {
    // Stop animation loop entirely in drag mode - no overhead at all
    if (focalPointMode.value === FOCALPOINT_MODES.DRAGGING) {
      if (aimPointWatcher) {
        cancelAnimationFrame(aimPointWatcher);
        aimPointWatcher = null;
      }
      return;
    }
    
    const currentAimX = aimPoint.x.value;
    const currentAimY = aimPoint.y.value;
    
    if (currentAimX !== lastAimX || currentAimY !== lastAimY) {
      // Use smooth easing in non-drag modes
      setTarget(currentAimX, currentAimY, 'aim-point-change');
      lastAimX = currentAimX;
      lastAimY = currentAimY;
    }
    
    // Continue watching only in non-drag modes
    aimPointWatcher = requestAnimationFrame(checkAimPointChanges);
  }
  
  // Start watching aim point changes only if not in drag mode initially
  if (focalPointMode.value !== FOCALPOINT_MODES.DRAGGING) {
    aimPointWatcher = requestAnimationFrame(checkAimPointChanges);
  }

  // Test function for cursor debugging
  function testCrosshairCursor() {
    console.log('[useFocalPoint] Testing crosshair cursor manually');
    document.body.style.cursor = 'crosshair';
    document.documentElement.style.cursor = 'crosshair';
    const sceneContainer = document.getElementById('scene-container');
    if (sceneContainer) {
      sceneContainer.style.cursor = 'crosshair';
    }
    console.log('[useFocalPoint] Applied crosshair cursor for testing');
  }

  // Make test function globally available for debugging
  if (typeof window !== 'undefined') {
    window.testCrosshairCursor = testCrosshairCursor;
  }

  // Create the instance
  const focalPointInstance = {
    // Reactive state
    position,
    x,
    y,
    focalPointMode,
    isLocked,
    isDragging,
    
    // Methods
    setFocalPoint,
    setFocalPointElement,
    setTarget,
    updatePosition,
    cleanup,
    testCrosshairCursor
  };

  _instance = focalPointInstance;
  return focalPointInstance;
}