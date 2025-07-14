import { ref, computed } from 'vue';
import { AppState, saveState } from '../core/stateManager.mjs';

// Singleton state for layout orientation
let _instance = null;

export function useLayoutToggle() {
  if (_instance) {
    return _instance;
  }

  // Reactive state - safely access AppState with fallback
  const storedOrientation = AppState?.layout?.orientation;
  console.log('useLayoutToggle: AppState.layout.orientation:', storedOrientation);
  console.log('useLayoutToggle: AppState object:', AppState);
  
  const orientation = ref(storedOrientation || 'scene-left');
  console.log('useLayoutToggle initialized with orientation:', orientation.value);

  // Computed properties
  const isSceneLeft = computed(() => orientation.value === 'scene-left');
  const isSceneRight = computed(() => orientation.value === 'scene-right');

  // Toggle function
  const toggleOrientation = () => {
    const newOrientation = orientation.value === 'scene-left' ? 'scene-right' : 'scene-left';
    orientation.value = newOrientation;
    
    // Update global state safely
    if (AppState?.layout) {
      AppState.layout.orientation = newOrientation;
      saveState(AppState);
    }
    
    // Dispatch event for other components to react
    window.dispatchEvent(new CustomEvent('layout-orientation-changed', {
      detail: { orientation: newOrientation }
    }));
  };

  // Listen for state initialization and update orientation if needed
  window.addEventListener('app-state-loaded', () => {
    console.log('App state loaded, checking orientation...');
    const storedOrientation = AppState?.layout?.orientation;
    console.log('Stored orientation after app-state-loaded:', storedOrientation);
    
    if (storedOrientation && storedOrientation !== orientation.value) {
      console.log('Updating orientation from', orientation.value, 'to', storedOrientation);
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