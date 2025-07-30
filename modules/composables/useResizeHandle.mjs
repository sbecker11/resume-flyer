import { ref, computed, nextTick, watch } from 'vue';
import { useLayoutToggle } from './useLayoutToggle.mjs';
import { useAppState } from './useAppState.mjs';
import { performanceMonitor } from '@/modules/utils/performanceMonitor.mjs';

const HANDLE_WIDTH = 20;
const DEFAULT_WIDTH_PERCENT = 50;

// Global singleton state for resize handle
let _resizeHandleState = null;

function createResizeHandleState() {
  const { appState, updateAppState } = useAppState();
  
  // Reactive state
  const uiPercentage = ref(DEFAULT_WIDTH_PERCENT);
  const sceneWidthInPixels = ref(0);
  const isDragging = ref(false);
  const stepCount = ref(1);
  let _resizeTimeoutId = null;

  function initializeState() {
    // Use stored scene percentage directly as UI percentage
    const storedScenePercentage = appState.value?.layout?.scenePercentage;
    let initialPercentage = DEFAULT_WIDTH_PERCENT;
    
    if (storedScenePercentage !== undefined) {
      // Use the stored percentage directly - no complex conversion needed
      initialPercentage = storedScenePercentage;
      
      // console.log('[ResizeHandle] RESTORE DEBUG:');
      // console.log('  storedScenePercentage:', storedScenePercentage + '%');
      // console.log('  Using directly as initialPercentage:', initialPercentage + '%');
    }
    stepCount.value = appState.value?.resizeHandle?.stepCount || 1;
    // console.log('[ResizeHandle] DEBUG: appState.resizeHandle:', appState.value?.resizeHandle);
    // console.log('[ResizeHandle] DEBUG: stepCount loaded:', stepCount.value);
    
    // Use the stored percentage directly
    // console.log('[ResizeHandle] Initialization - using stored percentage:', initialPercentage);
    
    uiPercentage.value = initialPercentage;
  }

  function initialize() {
    // Initialize state from appState
    initializeState();
    
    // Apply initial layout to set sceneWidthInPixels correctly
    updateLayout(uiPercentage.value, false);
    
    // Listen for app state loaded event to update from saved state
    window.addEventListener('app-state-loaded', () => {
      console.log('[ResizeHandle] App state loaded, re-initializing from saved state');
      initializeState();
      updateLayout(uiPercentage.value, false);
    });
    
    // Watch AppState for stepCount changes
    watch(() => appState.value?.resizeHandle?.stepCount, (newStepCount) => {
      if (newStepCount !== undefined && stepCount.value !== newStepCount) {
        console.log('[ResizeHandle] Step count updated from AppState watcher:', stepCount.value, '->', newStepCount);
        stepCount.value = newStepCount;
      }
    }, { immediate: false });
    
    // Add debounced window resize listener
    window.addEventListener('resize', debouncedResizeHandler);
    
    // Add drag event listeners
    setupDragHandlers();
  }
  
  function setupDragHandlers() {
    // Get layout orientation
    const { orientation } = useLayoutToggle();
    
    // Mouse move handler for dragging
    const handleMouseMove = (event) => {
      if (isDragging.value) {
        const windowWidth = window.innerWidth;
        
        // Calculate available width (excluding ResizeHandle)
        const handleWidth = 20;
        const availableWidth = windowWidth - handleWidth;
        
        // Mouse coordinate handling depends on layout orientation
        let effectiveClientX = event.clientX;
        let newSceneWidth;
        
        if (orientation.value === 'scene-right') {
          // In scene-right: scene is on right, so dragging right expands scene
          // Convert mouse position to scene width (scene grows from right edge)
          newSceneWidth = Math.max(0, Math.min(availableWidth, windowWidth - effectiveClientX));
        } else {
          // In scene-left: scene is on left, so dragging right expands scene
          newSceneWidth = Math.max(0, Math.min(availableWidth, effectiveClientX));
        }
        
        const newPercentage = Math.max(0, Math.min(100, (newSceneWidth / availableWidth) * 100));
        
        uiPercentage.value = newPercentage;
        updateLayout(newPercentage);
        
        console.log(`[ResizeHandle] Dragging (${orientation.value}) - mouse X: ${event.clientX}, scene width: ${newSceneWidth}px, percentage: ${newPercentage.toFixed(1)}%`);
      }
    };
    
    // Mouse up handler to end dragging
    const handleMouseUp = (event) => {
      if (isDragging.value) {
        isDragging.value = false;
        console.log('[ResizeHandle] Drag ended');
        
        // Save state when drag ends
        updateLayout(uiPercentage.value, true); // shouldSave = true
        
        // Ensure bulls-eye is recentered after drag operation
        if (window.bullsEye) {
          console.log('[ResizeHandle] Recentering bulls-eye after drag');
          setTimeout(() => {
            window.bullsEye.recenter();
          }, 50); // Small delay to allow layout to settle
        }
      }
    };
    
    // Add global event listeners
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    // Store for cleanup
    return { handleMouseMove, handleMouseUp };
  }

  function clampToRange(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  function handleViewportResize() {
    // Components should handle their own updates
    console.log('[ResizeHandle] Viewport resize handled - letting components handle their own updates');
  }

  async function updateLayout(newUiPercentage, shouldSave = true, isStepOperation = false) {
    console.log('[ResizeHandle] updateLayout() called with:', newUiPercentage);
    
    // Performance monitoring
    const perfId = performanceMonitor.startTiming('resize_layout');
    
    try {
        const windowWidth = window.innerWidth;
        const resumeContainerWidth = 20;
        const maxSceneWidth = windowWidth - resumeContainerWidth;
        
        console.log('[ResizeHandleManager] Window width:', windowWidth, 'Max scene width:', maxSceneWidth);
        
        let actualPercentage = clampToRange(newUiPercentage, 0, 100);
        let finalSceneWidth = Math.floor((actualPercentage / 100) * maxSceneWidth);
        
        console.log('[ResizeHandleManager] Actual percentage:', actualPercentage, 'Final scene width:', finalSceneWidth);
        
        // Capture old width BEFORE updating
        const oldSceneWidth = sceneWidthInPixels.value;
        console.log('[ResizeHandle] OLD sceneWidthInPixels:', oldSceneWidth);
        
        // Store the values
        sceneWidthInPixels.value = finalSceneWidth;
        
        // Only snap during drag operations, not during step operations or initialization
        if (stepCount.value > 1 && shouldSave && !isStepOperation) {
            // Only snap when shouldSave=true AND not a step operation (during drag)
            const increment = 100 / stepCount.value;
            const nearestStep = Math.round(actualPercentage / increment);
            uiPercentage.value = nearestStep * increment;
            console.log('[ResizeHandle] Snapped uiPercentage to step:', uiPercentage.value, '(was', actualPercentage, ')');
        } else if (!isStepOperation) {
            uiPercentage.value = actualPercentage;
        }
        // For step operations, uiPercentage is already set correctly, don't modify it
        
        // Only dispatch event and save if scene width actually changed
        if (finalSceneWidth !== oldSceneWidth) {
            console.log('[ResizeHandleManager] Scene width changed:', oldSceneWidth, '->', finalSceneWidth);
            
            // Dispatch event so other components can react to resize handle changes
            window.dispatchEvent(new CustomEvent('resize-handle-changed', {
                detail: { sceneWidth: finalSceneWidth }
            }));
            
            // Also dispatch scene-width-changed for AppContent CSS reactivity
            window.dispatchEvent(new CustomEvent('scene-width-changed', {
                detail: { width: finalSceneWidth }
            }));
        }
        // Skip logging when no change detected
        
        if (appState.value?.layout && (finalSceneWidth !== oldSceneWidth || shouldSave)) {
            if (isStepOperation) {
                // For step operations, save the clean percentage values directly
                console.log('[ResizeHandle] Step operation - saving clean percentages:', uiPercentage.value);
                await updateAppState({
                    layout: {
                        scenePercentage: uiPercentage.value,
                        resumePercentage: 100 - uiPercentage.value
                    }
                });
            } else {
                // For drag operations, save the UI percentage directly (consistent with step operations)
                const currentUIPercentage = uiPercentage.value;
                const resumeUIPercentage = 100 - currentUIPercentage;
                
                console.log('[ResizeHandle] Drag operation - saving UI percentages:', currentUIPercentage, 'resume:', resumeUIPercentage);
                
                if (shouldSave && finalSceneWidth !== oldSceneWidth) {
                    await updateAppState({
                        layout: {
                            scenePercentage: currentUIPercentage,
                            resumePercentage: resumeUIPercentage
                        }
                    });
                }
            }
        }
        
        // Log completion - no logAndReset method exists
    } catch (error) {
        console.error('ResizeHandle updateLayout error:', error);
    } finally {
        performanceMonitor.endTiming(perfId);
    }
  }

  function debouncedResizeHandler() {
    if (_resizeTimeoutId) {
        clearTimeout(_resizeTimeoutId);
    }
    _resizeTimeoutId = setTimeout(() => {
        handleViewportResize();
        _resizeTimeoutId = null;
    }, 100);
  }

  // Stepping functionality
  async function collapseLeft() {
    console.log('[ResizeHandle] collapseLeft() called');
    console.log('[ResizeHandle] Current uiPercentage:', uiPercentage.value);
    console.log('[ResizeHandle] Step count:', stepCount.value);
    
    let newPercentage;
    if (stepCount.value === 1) {
        newPercentage = 0;
    } else {
        // Clean integer math - force values to be exact multiples
        const increment = 100 / stepCount.value; // e.g., 33.33 for 3 steps
        
        // Round current percentage to nearest step to handle floating point precision
        const currentRounded = Math.round(uiPercentage.value / increment) * increment;
        const currentBlock = Math.round(currentRounded / increment);
        
        newPercentage = Math.max(0, currentBlock - 1) * increment;
        
        // Ensure result is clean (handle floating point precision)
        newPercentage = Math.round(newPercentage * 100) / 100;
        
        console.log('[ResizeHandle] collapseLeft - increment:', increment, 'currentBlock:', currentBlock);
        console.log('[ResizeHandle] collapseLeft - from', uiPercentage.value, '-> newPercentage:', newPercentage);
    }
    
    console.log('[ResizeHandle] Updating layout to:', newPercentage);
    // Force the exact percentage without any snapping or processing
    uiPercentage.value = newPercentage;
    await updateLayout(newPercentage, true, true); // shouldSave=true, isStepOperation=true
    await nextTick();
  }

  async function collapseRight() {
    console.log('[ResizeHandle] collapseRight() called');
    console.log('[ResizeHandle] Current uiPercentage:', uiPercentage.value);
    console.log('[ResizeHandle] Step count:', stepCount.value);
    
    let newPercentage;
    if (stepCount.value === 1) {
        newPercentage = 100;
    } else {
        // Clean integer math - force values to be exact multiples
        const increment = 100 / stepCount.value; // e.g., 33.33 for 3 steps
        
        // Round current percentage to nearest step to handle floating point precision
        const currentRounded = Math.round(uiPercentage.value / increment) * increment;
        const currentBlock = Math.round(currentRounded / increment);
        
        newPercentage = Math.min(100, (currentBlock + 1) * increment);
        
        // Ensure result is clean (handle floating point precision)
        newPercentage = Math.round(newPercentage * 100) / 100;
        
        console.log('[ResizeHandle] collapseRight - increment:', increment, 'currentBlock:', currentBlock);
        console.log('[ResizeHandle] collapseRight - from', uiPercentage.value, '-> newPercentage:', newPercentage);
    }
    
    console.log('[ResizeHandle] Updating layout to:', newPercentage);
    // Force the exact percentage without any snapping or processing
    uiPercentage.value = newPercentage;
    await updateLayout(newPercentage, true, true); // shouldSave=true, isStepOperation=true
    await nextTick();
  }

  function applyInitialLayout() {
    updateLayout(uiPercentage.value, false);
  }

  function destroy() {
    if (_resizeTimeoutId) {
        clearTimeout(_resizeTimeoutId);
        _resizeTimeoutId = null;
    }
    // removeEventListener calls would need the exact same function references
    // This cleanup is handled by the Vue component lifecycle instead
  }

  // Initialize the state
  const dragHandlers = setupDragHandlers();
  
  return {
    // Reactive state
    uiPercentage,
    sceneWidthInPixels,
    isDragging,
    stepCount,
    
    // Methods
    initialize,
    updateLayout,
    collapseLeft,
    collapseRight,
    applyInitialLayout,
    destroy,
    
    // For cleanup
    dragHandlers
  };
}

// --- Composable Wrapper (for Vue components) ---
let _instance = null;

export function useResizeHandle() {
  // Singleton check
  if (!_resizeHandleState) {
    _resizeHandleState = createResizeHandleState();
    _resizeHandleState.initialize();
  }

  // Get layout orientation
  const { orientation } = useLayoutToggle();

  // Create computed properties that reference the singleton state
  const uiPercentage = computed(() => _resizeHandleState.uiPercentage.value);
  const sceneWidthInPixels = computed(() => _resizeHandleState.sceneWidthInPixels.value);
  const isDragging = computed(() => _resizeHandleState.isDragging.value);
  const stepCount = computed(() => _resizeHandleState.stepCount.value);

  const scenePercentage = computed(() => {
    // Calculate percentage based on available space (windowWidth - 20px resize handle)
    const windowWidth = window.innerWidth;
    const availableWidth = windowWidth - 20; // Subtract resize handle width
    const sceneWidth = sceneWidthInPixels.value;
    const rawPercentage = availableWidth > 0 ? (sceneWidth / availableWidth) * 100 : 0;
    const finalPercentage = Math.max(0, Math.min(100, rawPercentage));
    
    console.log('[DEBUG scenePercentage] windowWidth:', windowWidth, 'availableWidth:', availableWidth, 'sceneWidth:', sceneWidth, 'rawPercentage:', rawPercentage, 'finalPercentage:', finalPercentage);
    
    // Clamp between 0 and 100
    return finalPercentage;
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

  // Wrapper functions that delegate to the singleton state
  function updateLayoutFromPercentage(newPercentage) {
    return _resizeHandleState.updateLayout(newPercentage);
  }

  function applyInitialLayout() {
    return _resizeHandleState.applyInitialLayout();
  }

  function collapseLeft() {
    return _resizeHandleState.collapseLeft();
  }

  function collapseRight() {
    return _resizeHandleState.collapseRight();
  }

  function startDrag(event) {
    if (_resizeHandleState) {
      _resizeHandleState.isDragging.value = true;
      console.log('[ResizeHandle] Drag started');
      event.preventDefault(); // Prevent text selection while dragging
    }
  }

  function toggleStepping() {
    // This function is no longer needed since stepping is controlled by stepCount
    console.warn('[ResizeHandle] toggleStepping() is deprecated - use stepCount cycling instead');
  }

  // Legacy compatibility method (will be removed after migration)
  function initializeResizeHandleState(viewport = null, bullsEyeInstance = null) {
    console.warn('[ResizeHandle] initializeResizeHandleState is deprecated - ResizeHandleManager handles initialization via IM');
    // No-op - IM handles initialization
  }

  // Reactive window width for resize calculations
  const windowWidth = ref(window.innerWidth);
  
  // Update window width on resize
  const updateWindowWidth = () => {
    windowWidth.value = window.innerWidth;
  };
  window.addEventListener('resize', updateWindowWidth);
  
  // Scene container style - account for ResizeHandle width
  const sceneContainerStyle = computed(() => {
    const handleWidth = 20; // ResizeHandle width from AppState
    const availableWidth = windowWidth.value - handleWidth;
    const sceneWidthPixels = (scenePercentage.value / 100) * availableWidth;
    
    return {
      width: `${sceneWidthPixels}px`,
      flexShrink: 0,
      flexGrow: 0,
      flexBasis: `${sceneWidthPixels}px`
    };
  });

  // Create the instance
  const resizeHandleInstance = {
    // Reactive state
    uiPercentage,
    sceneWidthInPixels,
    isDragging,
    stepCount,
    scenePercentage,
    resumePercentage,
    sceneContainerStyle,
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