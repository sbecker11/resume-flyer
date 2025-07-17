import { ref, computed } from 'vue';
import { AppState, saveState } from '../core/stateManager.mjs';

/**
 * Programmatic soft refresh - mimics what Cmd+R does
 * This reinitializes all the core components from scratch
 */
function programmaticSoftRefresh() {
  window.CONSOLE_LOG_IGNORE('[LayoutToggle] Starting programmatic soft refresh');
  
  // Step 1: Clear all existing state and positions
  if (window.bullsEye) {
    window.bullsEye.cleanup?.();
  }
  if (window.focalPoint) {
    window.focalPoint.cleanup?.();
  }
  if (window.aimPoint) {
    window.aimPoint.cleanup?.();
  }
  
  // Step 2: Force complete viewport reinitialization
  if (window.viewPortModule) {
    // Force viewport to recalculate everything from scratch
    window.viewPortModule.updateViewPort();
  }
  
  // Step 3: Reinitialize all positioning systems in the correct order
  setTimeout(() => {
    // Reinitialize viewport first
    if (window.viewPortModule) {
      window.viewPortModule.updateViewPort();
    }
    
    // Then reinitialize bullsEye
    if (window.bullsEye) {
      window.bullsEye.initialize?.();
    }
    
    // Then aimPoint 
    if (window.aimPoint) {
      window.aimPoint.initialize?.();
    }
    
    // Finally focal point
    if (window.focalPoint) {
      window.focalPoint.initialize?.();
    }
    
    window.CONSOLE_LOG_IGNORE('[LayoutToggle] Programmatic soft refresh completed');
    
    // Emit a completion event to signal that all systems are ready
    window.dispatchEvent(new CustomEvent('programmatic-soft-refresh-complete', {
      detail: { timestamp: Date.now() }
    }));
  }, 100);
}

// Singleton state for layout orientation
let _instance = null;

export function useLayoutToggle() {
  if (_instance) {
    return _instance;
  }

  // Reactive state - safely access AppState with fallback
  const storedOrientation = AppState?.layout?.orientation;
  
  const orientation = ref(storedOrientation || 'scene-left');

  // Computed properties
  const isSceneLeft = computed(() => orientation.value === 'scene-left');
  const isSceneRight = computed(() => orientation.value === 'scene-right');

  // Toggle function
  const toggleOrientation = () => {
    const oldOrientation = orientation.value;
    const newOrientation = orientation.value === 'scene-left' ? 'scene-right' : 'scene-left';
    
    // Set transitioning state to prevent scene operations during layout change
    window.isLayoutTransitioning = true;
    
    orientation.value = newOrientation;
    
    // Update global state safely
    if (AppState?.layout) {
      AppState.layout.orientation = newOrientation;
      saveState(AppState);
    }
    
    // Dispatch event for other components to react
    window.dispatchEvent(new CustomEvent('layout-orientation-changed', {
      detail: { orientation: newOrientation, oldOrientation }
    }));
    
    // Wait for DOM and CSS transitions to complete, then reinitialize
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('scene-reinitialize-needed', {
        detail: { reason: 'layout-change', orientation: newOrientation, oldOrientation }
      }));
    }, 400); // Increased back to allow proper CSS transitions
    
    // Also trigger a forced scene update after a longer delay
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('scene-force-update', {
        detail: { reason: 'layout-finalization', orientation: newOrientation, oldOrientation }
      }));
    }, 800); // Back to 800ms to ensure DOM is stable
    
    // Clear transitioning state after everything is complete (after scene-force-update)
    setTimeout(() => {
      window.isLayoutTransitioning = false;
      
      // Instead of trying to patch individual components, trigger a complete reinitialization
      // This mimics what Cmd+R does - rebuild everything from scratch
      programmaticSoftRefresh();
      
    }, 1000); // Back to 1000ms - happens after scene-force-update at 800ms
  };

  // Listen for state initialization and update orientation if needed
  window.addEventListener('app-state-loaded', () => {
    const storedOrientation = AppState?.layout?.orientation;
    
    if (storedOrientation && storedOrientation !== orientation.value) {
      orientation.value = storedOrientation;
    }
  });

  // Get orientation label for UI
  const getOrientationLabel = () => {
    return orientation.value === 'scene-left' ? 'Scene | Resume' : 'Resume | Scene';
  };

  // Get toggle button text
  const getToggleButtonText = () => {
    return '⇆'; // Swap symbol
  };

  _instance = {
    orientation,
    isSceneLeft,
    isSceneRight,
    toggleOrientation,
    getOrientationLabel,
    getToggleButtonText
  };

  return _instance;
}