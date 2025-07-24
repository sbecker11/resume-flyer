import { ref, computed, onMounted, onUnmounted, watchEffect, getCurrentInstance } from 'vue';
import * as bullsEyeModule from '../core/bullsEye.mjs';
import { useLayoutToggle } from './useLayoutToggle.mjs';

// --- Constants ---
export const MODES = {
  LOCKED: 'locked',
  FOLLOWING: 'following',
  DRAGGING: 'dragging'
};

// --- Private State ---
let _mode = MODES.LOCKED;
let _mousePosition = { x: 0, y: 0 };
let _updateTimeout = null;

// --- Reactive State ---
const bullsEyeState = ref({
  x: 0,
  y: 0
});

// --- Private Functions ---
function updateBullsEyePosition() {
  if (bullsEyeModule.isInitialized()) {
    const position = bullsEyeModule.getBullsEye();
    bullsEyeState.value.x = position.x;
    bullsEyeState.value.y = position.y;
  }
}

// Immediate update to prevent flickering
function immediateBullsEyeUpdate(x, y, source = 'unknown') {
  // window.CONSOLE_LOG_IGNORE(`BullsEye: Immediate update from ${source}:`, { x, y });
  
  // If module isn't initialized, try to initialize it first
  if (!bullsEyeModule.isInitialized()) {
    console.warn('BullsEye: BullsEye module not initialized yet, attempting to initialize');
    try {
      bullsEyeModule.initialize();
      // window.CONSOLE_LOG_IGNORE('BullsEye: Module initialized successfully');
    } catch (error) {
      console.error('BullsEye: Failed to initialize module:', error);
      // Schedule for later with multiple retries
      let retryCount = 0;
      const maxRetries = 10;
      
      function retry() {
        if (retryCount >= maxRetries) {
          console.error('BullsEye: Max retries exceeded, giving up');
          return;
        }
        
        retryCount++;
        // window.CONSOLE_LOG_IGNORE(`BullsEye: Retry ${retryCount}/${maxRetries} - attempting to initialize and update`);
        
        setTimeout(() => {
          if (bullsEyeModule.isInitialized()) {
            immediateBullsEyeUpdate(x, y, source + `-deferred-retry-${retryCount}`);
          } else {
            try {
              bullsEyeModule.initialize();
              immediateBullsEyeUpdate(x, y, source + `-deferred-retry-${retryCount}`);
            } catch (error) {
              console.warn(`BullsEye: Retry ${retryCount} failed:`, error);
              retry();
            }
          }
        }, 100 * retryCount); // Exponential backoff
      }
      
      retry();
      return;
    }
  }
  
  const bullsEyeElement = bullsEyeModule.getBullsEyeElement();
  if (!bullsEyeElement) {
    console.error('BullsEye: BullsEye element not found - cannot update position');
    return;
  }
  
  // Set positioning styles directly (no CSS conflicts now)
  bullsEyeElement.style.position = 'fixed';
  bullsEyeElement.style.left = `${x}px`;
  bullsEyeElement.style.top = `${y}px`;
  bullsEyeElement.style.transform = 'translate(-50%, -50%)';
  bullsEyeElement.style.zIndex = '1000';
  
  // Update the reactive state
  bullsEyeState.value.x = x;
  bullsEyeState.value.y = y;
  
  // window.CONSOLE_LOG_IGNORE('BullsEye: Updated element position and state:', { 
  //   elementLeft: bullsEyeElement.style.left,
  //   elementTop: bullsEyeElement.style.top,
  //   stateX: bullsEyeState.value.x,
  //   stateY: bullsEyeState.value.y
  // });
}

// Debounced update to prevent flickering (kept for backward compatibility)
function debouncedUpdateBullsEye(x, y, source = 'unknown') {
  if (_updateTimeout) {
    clearTimeout(_updateTimeout);
  }
  
  _updateTimeout = setTimeout(() => {
    immediateBullsEyeUpdate(x, y, source);
    _updateTimeout = null;
  }, 50); // 50ms debounce
}

function handleMouseMove(event) {
  _mousePosition.x = event.clientX;
  _mousePosition.y = event.clientY;
  
  if (_mode === MODES.FOLLOWING || _mode === MODES.DRAGGING) {
    bullsEyeState.value.x = _mousePosition.x;
    bullsEyeState.value.y = _mousePosition.y;
  }
}

// --- Composable ---
export function useBullsEye() {
  // Check if we're inside a Vue component instance
  const instance = getCurrentInstance();
  
  // Register cleanup on component unmount (only if inside a Vue component)
  if (instance) {
    onUnmounted(() => {
      cleanup();
    });
  }

  // Function to update bullsEye to scene container center
  function updateToSceneCenter() {
    // window.CONSOLE_LOG_IGNORE('BullsEye: updateToSceneCenter called, mode:', _mode);
    
    // Don't try to access InitializationManager until we're ready
    if (!isComponentReady) {
      window.CONSOLE_LOG_IGNORE('BullsEye: Not ready yet, skipping updateToSceneCenter');
      return;
    }
    
    if (_mode === MODES.LOCKED) {
      // The bullsEye module handles its own SceneContainer dependency through IM
      // Just call recenter - it will handle the dependency internally
      if (bullsEyeModule.isInitialized()) {
        bullsEyeModule.recenter();
        // Update our reactive state to match
        updateBullsEyePosition();
      }
    } else {
      // window.CONSOLE_LOG_IGNORE('BullsEye: Not in locked mode, skipping update');
    }
  }

  // Watch for layout changes and update bullsEye position reactively
  const layoutToggle = useLayoutToggle();
  let isComponentActive = true;
  let isComponentReady = false;
  
  // Wait for Vue to mount and the IM-managed BullsEye component to be ready
  // Only use onMounted if we're inside a Vue component
  if (instance) {
    onMounted(() => {
      // The bullsEyeModule has its own IM dependency management
      // Just wait for it to be initialized through normal IM flow
      const checkBullsEyeReady = () => {
        if (bullsEyeModule.isInitialized()) {
          isComponentReady = true;
          // window.CONSOLE_LOG_IGNORE('[BullsEye] Composable is now ready - BullsEye component initialized');
          updateToSceneCenter();
        } else {
          // Check again in a short while
          setTimeout(checkBullsEyeReady, 50);
        }
      };
      
      checkBullsEyeReady();
    });
  } else {
    // If not in a Vue component, set up immediately
    const checkBullsEyeReady = () => {
      if (bullsEyeModule.isInitialized()) {
        isComponentReady = true;
        // window.CONSOLE_LOG_IGNORE('[BullsEye] Composable is now ready - BullsEye component initialized (non-Vue context)');
        updateToSceneCenter();
      } else {
        // Check again in a short while
        setTimeout(checkBullsEyeReady, 50);
      }
    };
    
    checkBullsEyeReady();
  }
  
  watchEffect(() => {
    if (!isComponentActive || !isComponentReady) return;
    
    const orientation = layoutToggle.orientation.value;
    // window.CONSOLE_LOG_IGNORE('BullsEye: Layout orientation changed to:', orientation);
    
    // Add a small delay to ensure DOM has updated after layout change
    setTimeout(() => {
      if (!isComponentActive) return;
      try {
        updateToSceneCenter();
      } catch (error) {
        console.error('BullsEye: Error updating to scene center:', error);
        // Don't re-throw to prevent breaking Vue lifecycle
      }
    }, 100); // Small delay to ensure DOM is updated
  });

  // Listen for window resize events
  const handleResize = () => {
    if (!isComponentActive || !isComponentReady) return;
    // window.CONSOLE_LOG_IGNORE('BullsEye: Window resize event received');
    try {
      updateToSceneCenter();
    } catch (error) {
      console.error('BullsEye: Error handling resize:', error);
      // Don't re-throw for resize events to avoid breaking the page
    }
  };
  window.addEventListener('resize', handleResize);
  
  // Listen for scene container resize events using ResizeObserver
  let sceneContainerObserver = null;
  const handleSceneContainerResize = () => {
    if (!isComponentActive || !isComponentReady) return;
    // window.CONSOLE_LOG_IGNORE('BullsEye: Scene container resize detected');
    try {
      updateToSceneCenter();
    } catch (error) {
      console.error('BullsEye: Error handling scene container resize:', error);
    }
  };
  
  // Set up ResizeObserver for scene container
  const setupSceneContainerObserver = () => {
    // Let the bullsEye module handle its own scene container access
    // The composable shouldn't directly access DOM elements
    if (bullsEyeModule.isInitialized()) {
      const sceneContainer = document.getElementById('scene-container');
      if (sceneContainer && window.ResizeObserver) {
        sceneContainerObserver = new ResizeObserver(handleSceneContainerResize);
        sceneContainerObserver.observe(sceneContainer);
        // window.CONSOLE_LOG_IGNORE('BullsEye: Scene container observer established');
      }
    } else {
      // Try again later if bullsEye module not ready
      setTimeout(setupSceneContainerObserver, 100);
    }
  };
  
  // Try to set up observer immediately, or retry after DOM is ready
  setTimeout(() => {
    if (!isComponentActive) return;
    setupSceneContainerObserver();
  }, 100);

  // Listen for layout change events - update immediately and then again after transition
  const handleLayoutChange = (event) => {
    if (!isComponentActive) return;
    window.CONSOLE_LOG_IGNORE('BullsEye: Layout change event received:', event.detail);
    
    // Update immediately
    try {
      updateToSceneCenter();
    } catch (error) {
      console.error('BullsEye: Error handling immediate layout change:', error);
    }
    
    // Also update after transition to ensure accuracy
    setTimeout(() => {
      if (!isComponentActive) return;
      try {
        updateToSceneCenter();
      } catch (error) {
        console.error('BullsEye: Error handling delayed layout change:', error);
      }
    }, 400); // Match layout transition timing
  };
  window.addEventListener('layout-orientation-changed', handleLayoutChange);
  
  // Listen for layout toggle button clicks directly
  const handleLayoutToggle = () => {
    if (!isComponentActive) return;
    window.CONSOLE_LOG_IGNORE('BullsEye: Layout toggle detected');
    
    // Update immediately when toggle is clicked
    try {
      updateToSceneCenter();
    } catch (error) {
      console.error('BullsEye: Error handling layout toggle:', error);
    }
    
    // Also update after CSS transitions complete
    setTimeout(() => {
      if (!isComponentActive) return;
      try {
        updateToSceneCenter();
      } catch (error) {
        console.error('BullsEye: Error handling delayed layout toggle:', error);
      }
    }, 500); // Allow time for CSS transitions
  };
  
  // Set up layout toggle listener
  const setupLayoutToggleListener = () => {
    const layoutToggleButton = document.querySelector('[data-layout-toggle]') || 
                              document.querySelector('.layout-toggle') ||
                              document.querySelector('#layout-toggle');
    
    if (layoutToggleButton) {
      layoutToggleButton.addEventListener('click', handleLayoutToggle);
      // window.CONSOLE_LOG_IGNORE('BullsEye: Layout toggle button listener established');
    } else {
      // window.CONSOLE_LOG_IGNORE('BullsEye: Layout toggle button not found, will retry');
      // Retry after DOM is ready
      setTimeout(() => {
        if (!isComponentActive) return;
        setupLayoutToggleListener();
      }, 500);
    }
  };
  
  // Try to set up toggle listener
  setTimeout(() => {
    if (!isComponentActive) return;
    setupLayoutToggleListener();
  }, 200);
  
  // Listen for scene reinitialize events
  const handleSceneReinitialize = (event) => {
    if (!isComponentActive) return;
    window.CONSOLE_LOG_IGNORE('BullsEye: Scene reinitialize event received:', event.detail);
    
    setTimeout(() => {
      if (!isComponentActive) return;
      try {
        updateToSceneCenter();
      } catch (error) {
        console.error('BullsEye: Error handling scene reinitialize:', error);
      }
    }, 100);
  };
  window.addEventListener('scene-reinitialize-needed', handleSceneReinitialize);
  
  // Listen for programmatic soft refresh completion
  const handleSoftRefreshComplete = (event) => {
    if (!isComponentActive) return;
    window.CONSOLE_LOG_IGNORE('BullsEye: Programmatic soft refresh complete event received:', event.detail);
    
    setTimeout(() => {
      if (!isComponentActive) return;
      try {
        updateToSceneCenter();
      } catch (error) {
        console.error('BullsEye: Error handling soft refresh complete:', error);
      }
    }, 50);
  };
  window.addEventListener('programmatic-soft-refresh-complete', handleSoftRefreshComplete);

  // Reactive properties
  const position = computed(() => bullsEyeState.value);
  const x = computed(() => bullsEyeState.value.x);
  const y = computed(() => bullsEyeState.value.y);

  // Mode management
  const mode = computed(() => _mode);

  function getBullsEyePosition() {
    if (_mode === MODES.LOCKED) {
      return bullsEyeModule.getBullsEye();
    } else {
      return bullsEyeState.value;
    }
  }

  function getBullsEyeElement() {
    return bullsEyeModule.getBullsEyeElement();
  }

  // Backward compatibility
  function getBullsEye() {
    return getBullsEyePosition();
  }

  function setMode(newMode) {
    window.CONSOLE_LOG_IGNORE('bullsEye.setMode called with:', newMode, 'current mode was:', _mode);
    _mode = newMode;
    
    // Update position based on new mode
    if (_mode === MODES.LOCKED) {
      updateBullsEyePosition();
    } else if (_mode === MODES.FOLLOWING || _mode === MODES.DRAGGING) {
      // Use current mouse position
      bullsEyeState.value.x = _mousePosition.x;
      bullsEyeState.value.y = _mousePosition.y;
    }
  }

  function cycleMode() {
    const modes = Object.values(MODES);
    const currentIndex = modes.indexOf(_mode);
    const nextIndex = (currentIndex + 1) % modes.length;
    setMode(modes[nextIndex]);
  }

  async function initialize() {
    window.CONSOLE_LOG_IGNORE('bullsEye.initialize() called');
    
    // The centralized bullsEye module initializes automatically via IM
    // Just wait for it to be ready
    const checkBullsEyeReady = () => {
      if (bullsEyeModule.isInitialized()) {
        // Set up mouse move listener
        window.addEventListener('mousemove', handleMouseMove);
        window.CONSOLE_LOG_IGNORE("bullsEye composable initialized successfully");
        
        // Initial position update - center at scene container
        updateToSceneCenter();
      } else {
        // Check again if module not ready yet
        setTimeout(checkBullsEyeReady, 50);
      }
    };
    
    checkBullsEyeReady();
  }

  function isInitialized() {
    return bullsEyeModule.isInitialized();
  }

  function recenterBullsEye() {
    // BullsEye should ALWAYS be at scene container center
    updateToSceneCenter();
  }

  function cleanup() {
    isComponentActive = false;
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('resize', handleResize);
    window.removeEventListener('layout-orientation-changed', handleLayoutChange);
    window.removeEventListener('scene-reinitialize-needed', handleSceneReinitialize);
    window.removeEventListener('programmatic-soft-refresh-complete', handleSoftRefreshComplete);
    
    // Remove layout toggle button listener
    const layoutToggleButton = document.querySelector('[data-layout-toggle]') || 
                              document.querySelector('.layout-toggle') ||
                              document.querySelector('#layout-toggle');
    if (layoutToggleButton) {
      layoutToggleButton.removeEventListener('click', handleLayoutToggle);
      window.CONSOLE_LOG_IGNORE('BullsEye: Layout toggle button listener removed');
    }
    
    // Disconnect ResizeObserver
    if (sceneContainerObserver) {
      sceneContainerObserver.disconnect();
      sceneContainerObserver = null;
      window.CONSOLE_LOG_IGNORE('BullsEye: Scene container observer disconnected');
    }
    
    if (_updateTimeout) {
      clearTimeout(_updateTimeout);
      _updateTimeout = null;
    }
    // Note: bullsEyeModule doesn't have a cleanup function - it's managed by IM
  }

  return {
    // Reactive properties
    position,
    x,
    y,
    mode,
    
    // Functions
    initialize,
    setMode,
    cycleMode,
    isInitialized,
    getBullsEye, // backward compatibility
    getBullsEyePosition,
    getBullsEyeElement,
    recenterBullsEye
  };
} 