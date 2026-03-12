import { ref, computed, watch } from 'vue';
import { useAppState } from './useAppState.ts';
import { useAppStore } from '../stores/appStore.mjs';

/**
 * Programmatic soft refresh - mimics what Cmd+R does
 * This reinitializes all the core components from scratch
 */
function programmaticSoftRefresh() {
  window.CONSOLE_LOG_IGNORE('[LayoutToggle] Starting programmatic soft refresh');
  
  // Step 1: Clear all existing state and positions
  const app = window.resumeFlock;
  if (app?.bullsEye) {
    app.bullsEye.cleanup?.();
  }
  if (app?.focalPoint) {
    app.focalPoint.cleanup?.();
  }
  if (window.aimPoint) {
    window.aimPoint.cleanup?.();
  }
  
  // Step 2: Force complete viewport reinitialization - skipped for now
  
  // Step 3: Reinitialize all positioning systems in the correct order
  setTimeout(() => {
    // TODO: Replace with Vue composable pattern - skipped for now
    
    // Then reinitialize bullsEye
    if (app?.bullsEye) {
      app.bullsEye.initialize?.();
    }
    
    // Then aimPoint 
    if (window.aimPoint) {
      window.aimPoint.initialize?.();
    }
    
    // Finally focal point
    if (app?.focalPoint) {
      app.focalPoint.initialize?.();
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
  console.log('[useLayoutToggle] *** COMPOSABLE CALLED ***');
  if (_instance) {
    console.log('[useLayoutToggle] *** RETURNING EXISTING INSTANCE ***');
    return _instance;
  }

  console.log('[useLayoutToggle] *** CREATING NEW INSTANCE ***');
  // Access centralized app state and Vue store
  const { appState, updateAppState } = useAppState();
  const { store, actions: storeActions } = useAppStore();

  // Add watcher to log when appState changes
  watch(() => appState.value?.layout?.scenePercentage, (newValue, oldValue) => {
    console.log(`[useLayoutToggle] *** appState.layout.scenePercentage changed: ${oldValue} -> ${newValue} ***`);
  }, { immediate: true });

  // Get orientation from Vue store (this is what AppContent uses for rendering)
  const orientation = computed({
    get: () => store.orientation,
    set: (value) => storeActions.setOrientation(value)
  });

  // Computed properties
  const isSceneLeft = computed(() => orientation.value === 'scene-left');
  const isSceneRight = computed(() => orientation.value === 'scene-right');
  
  // Layout percentages from appState
  const scenePercentage = computed(() => {
    const appStateValue = appState.value?.layout?.scenePercentage;
    const value = appStateValue !== undefined ? appStateValue : 50;
    console.log(`[useLayoutToggle] *** CHECKING appState.value?.layout?.scenePercentage: ${appStateValue} -> returning: ${value} ***`);
    console.log(`[useLayoutToggle] Full appState.value?.layout:`, appState.value?.layout);
    return value;
  });
  const resumePercentage = computed(() => {
    const calculated = 100 - scenePercentage.value;
    console.log(`[useLayoutToggle] resumePercentage calculated as 100 - ${scenePercentage.value} = ${calculated}`);
    return calculated;
  });
  
  // Container class for styling
  const appContainerClass = computed(() => orientation.value);
  const firstContainer = computed(() => orientation.value === 'scene-left' ? 'scene-container' : 'resume-container');
  const secondContainer = computed(() => orientation.value === 'scene-left' ? 'resume-container' : 'scene-container');

  // Toggle function
  const toggleOrientation = async () => {
    const oldOrientation = orientation.value;
    const newOrientation = orientation.value === 'scene-left' ? 'scene-right' : 'scene-left';
    
    console.log(`[useLayoutToggle] Toggling orientation: ${oldOrientation} -> ${newOrientation}`);
    
    // Set transitioning state to prevent scene operations during layout change
    window.isLayoutTransitioning = true;
    
    // Update Vue store (this will trigger AppContent re-render)
    orientation.value = newOrientation;
    
    // Also update persistent AppState
    await updateAppState({
      layout: {
        orientation: newOrientation
      }
    });
    
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

  // Listen for state initialization and apply stored orientation (path: user-settings.layout.orientation)
  window.addEventListener('app-state-loaded', () => {
    const storedOrientation = appState.value?.["user-settings"]?.layout?.orientation;
    if (storedOrientation && storedOrientation !== orientation.value) {
      orientation.value = storedOrientation;
    }
  });

  // Get orientation label for UI
  const getOrientationLabel = () => {
    return orientation.value === 'scene-left' ? 'Scene | Resume' : 'Resume | Scene';
  };

  // Get toggle button text that points to the scene view
  const getToggleButtonText = () => {
    // Arrow points toward where the scene is located
    return orientation.value === 'scene-left' ? '←' : '→';
  };

  _instance = {
    orientation,
    isSceneLeft,
    isSceneRight,
    scenePercentage,
    resumePercentage,
    appContainerClass,
    firstContainer,
    secondContainer,
    toggleOrientation,
    getOrientationLabel,
    getToggleButtonText
  };

  return _instance;
}