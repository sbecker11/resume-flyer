import { ref, computed, nextTick, watch } from 'vue';
import { useLayoutToggle } from './useLayoutToggle.mjs';
import { useAppState } from './useAppState.ts';
import { useAppStore } from '../stores/appStore.mjs';
import { dragStateManager } from '../core/dragStateManager.mjs';

const HANDLE_WIDTH = 20;
const DEFAULT_WIDTH_PERCENT = 50;

// Global singleton state for resize handle
let _resizeHandleState = null;

function createResizeHandleState() {
  const { appState, updateAppState, setDragMode, startAutoSave } = useAppState();
  const { store: appStore, actions: storeActions } = useAppStore();
  
  // Reactive state; sceneWidth can be 0 (resize handle must remain visible via layout/CSS)
  const uiPercentage = ref(DEFAULT_WIDTH_PERCENT);
  const sceneWidthInPixels = ref(0);
  const isDragging = ref(false);
  const stepCount = ref(1);
  let _resizeTimeoutId = null;
  let _eventDebounceTimeoutId = null;
  let _pendingSceneWidth = null;
  let _resizeRafId = null; // rAF throttle: dispatch scene resize events once per frame during drag
  let _lastMouseMoveTime = 0;
  let _timingData = [];

  function initializeState() {
    // Use stored scene percentage directly as UI percentage
    const storedScenePercentage = appState.value?.["user-settings"]?.layout?.scenePercentage;
    let initialPercentage = DEFAULT_WIDTH_PERCENT;
    
    if (storedScenePercentage !== undefined) {
      // Use the stored percentage directly - no complex conversion needed
      initialPercentage = storedScenePercentage;
      
      // console.log('[ResizeHandle] RESTORE DEBUG:');
      // console.log('  storedScenePercentage:', storedScenePercentage + '%');
      // console.log('  Using directly as initialPercentage:', initialPercentage + '%');
    }
    stepCount.value = appState.value?.["user-settings"]?.resizeHandle?.stepCount || 1;
    // console.log('[ResizeHandle] DEBUG: appState.resizeHandle:', appState.value?.resizeHandle);
    // console.log('[ResizeHandle] DEBUG: stepCount loaded:', stepCount.value);
    
    // Use the stored percentage directly
    // console.log('[ResizeHandle] Initialization - using stored percentage:', initialPercentage);
    
    uiPercentage.value = initialPercentage;
    
    // AppStore now reads from centralized state - no need for separate initialization
  }

  function initialize() {
    // Initialize state from appState
    initializeState();
    
    // Apply initial layout to set sceneWidthInPixels correctly
    updateLayout(uiPercentage.value, false);
    
    // Start the auto-save system
    startAutoSave();
    // console.log('[ResizeHandle] Auto-save system started');
    
    // Listen for app state loaded event to update from saved state; apply in nextTick so app-container children have stable geometry after first paint
    window.addEventListener('app-state-loaded', () => {
      initializeState();
      nextTick(() => {
        updateLayout(uiPercentage.value, false);
      });
    });
    
    // Watch AppState for stepCount changes
    watch(() => appState.value?.["user-settings"]?.resizeHandle?.stepCount, (newStepCount) => {
      if (newStepCount !== undefined && stepCount.value !== newStepCount) {
        // console.log('[ResizeHandle] Step count updated from AppState watcher:', stepCount.value, '->', newStepCount);
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
        const currentTime = performance.now();
        const timeSinceLastMove = _lastMouseMoveTime === 0 ? 0 : (currentTime - _lastMouseMoveTime);
        _lastMouseMoveTime = currentTime;
        
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
        
        const beforeUpdate = performance.now();
        uiPercentage.value = newPercentage;
        updateLayout(newPercentage);
        const afterUpdate = performance.now();
        
        const updateDuration = afterUpdate - beforeUpdate;
        
        // Collect timing data for end-of-drag report
        _timingData.push({
          gap: timeSinceLastMove,
          update: updateDuration,
          percentage: newPercentage,
          timestamp: currentTime
        });
      }
    };
    
    // Mouse up handler to end dragging
    const handleMouseUp = (event) => {
      if (isDragging.value) {
        isDragging.value = false;
        // console.log('[ResizeHandle] Drag ended');
        
        // Flush any pending debounced events immediately and cancel pending rAF
        if (_resizeRafId != null) {
          cancelAnimationFrame(_resizeRafId);
          _resizeRafId = null;
        }
        if (_eventDebounceTimeoutId && _pendingSceneWidth !== null) {
          clearTimeout(_eventDebounceTimeoutId);
          _eventDebounceTimeoutId = null;
          dispatchResizeEvents(_pendingSceneWidth, true); // immediate = true
        }
        
        // Re-enable auto-save and notify systems
        setDragMode(false); // Re-enable auto-save
        dragStateManager.endDrag('ResizeHandle');
        
        // Generate timing report
        if (_timingData.length > 0) {
          const totalSamples = _timingData.length;
          const avgGap = _timingData.reduce((sum, d) => sum + d.gap, 0) / totalSamples;
          const avgUpdate = _timingData.reduce((sum, d) => sum + d.update, 0) / totalSamples;
          const maxGap = Math.max(..._timingData.map(d => d.gap));
          const maxUpdate = Math.max(..._timingData.map(d => d.update));
          const slowSamples = _timingData.filter(d => d.gap > 20 || d.update > 10).length;
          const totalDuration = _timingData[_timingData.length - 1].timestamp - _timingData[0].timestamp;
          
          console.log(`🕐 [ResizeHandle] Drag Performance Report:`);
          console.log(`   📊 Samples: ${totalSamples} over ${totalDuration.toFixed(0)}ms`);
          console.log(`   ⏱️  Avg Gap: ${avgGap.toFixed(1)}ms, Max Gap: ${maxGap.toFixed(1)}ms`);
          console.log(`   🔧 Avg Update: ${avgUpdate.toFixed(1)}ms, Max Update: ${maxUpdate.toFixed(1)}ms`);
          console.log(`   ⚠️  Slow Samples: ${slowSamples}/${totalSamples} (${(slowSamples/totalSamples*100).toFixed(1)}%)`);
          
          if (slowSamples > 0) {
            console.log(`   🐌 Worst samples:`);
            _timingData
              .filter(d => d.gap > 25 || d.update > 15)
              .slice(0, 5)
              .forEach((d, i) => {
                console.log(`      ${i+1}. Gap: ${d.gap.toFixed(1)}ms, Update: ${d.update.toFixed(1)}ms @ ${d.percentage.toFixed(1)}%`);
              });
          }
          
          // Clear timing data for next drag
          _timingData = [];
        }
        
        // Save state when drag ends
        updateLayout(uiPercentage.value, true); // shouldSave = true
        
        // Note: Bulls-eye recentering is now handled by individual components using provide/inject
        // Each component that needs bulls-eye access should use useBullsEyeService()
        
        setTimeout(() => {
          // Bulls-eye recentering handled by individual components
        }, 150); // Longer delay to allow all layout changes and bulls-eye recentering to complete
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

  function dispatchResizeEvents(sceneWidth, immediate = false) {
    if (immediate || !isDragging.value) {
      // Dispatch immediately if not dragging or explicitly requested
      // console.log('[ResizeHandle] Dispatching resize events immediately for scene width:', sceneWidth);
      window.dispatchEvent(new CustomEvent('resize-handle-changed', {
        detail: { sceneWidth }
      }));
      window.dispatchEvent(new CustomEvent('scene-width-changed', {
        detail: { width: sceneWidth }
      }));
    } else {
      // During drag: keep debounce for final save, but dispatch at rAF rate so scene re-renders every frame
      _pendingSceneWidth = sceneWidth;

      if (_resizeRafId == null) {
        _resizeRafId = requestAnimationFrame(() => {
          _resizeRafId = null;
          const w = _pendingSceneWidth;
          if (w == null) return;
          window.dispatchEvent(new CustomEvent('resize-handle-changed', { detail: { sceneWidth: w } }));
          window.dispatchEvent(new CustomEvent('scene-width-changed', { detail: { width: w } }));
        });
      }

      if (_eventDebounceTimeoutId) {
        clearTimeout(_eventDebounceTimeoutId);
      }
      _eventDebounceTimeoutId = setTimeout(() => {
        window.dispatchEvent(new CustomEvent('resize-handle-changed', {
          detail: { sceneWidth: _pendingSceneWidth }
        }));
        window.dispatchEvent(new CustomEvent('scene-width-changed', {
          detail: { width: _pendingSceneWidth }
        }));
        _pendingSceneWidth = null;
        _eventDebounceTimeoutId = null;
      }, 150); // 150ms debounce for final event after drag
    }
  }

  function handleViewportResize() {
    // Components should handle their own updates
    // console.log('[ResizeHandle] Viewport resize handled - letting components handle their own updates');
  }

  async function updateLayout(newUiPercentage, shouldSave = true, isStepOperation = false) {
    // console.log('[ResizeHandle] updateLayout() called with:', newUiPercentage);
        
    try {
        const windowWidth = window.innerWidth;
        const availableWidth = windowWidth - HANDLE_WIDTH; // Total space for both containers
        const maxSceneWidth = availableWidth; // Scene can use up to the full available width
        
        // console.log('[ResizeHandleManager] Window width:', windowWidth, 'Max scene width:', maxSceneWidth);
        
        let actualPercentage = clampToRange(newUiPercentage, 0, 100);
        let finalSceneWidth = Math.floor((actualPercentage / 100) * maxSceneWidth);
        
        // console.log('[ResizeHandleManager] Actual percentage:', actualPercentage, 'Final scene width:', finalSceneWidth);
        
        // Capture old width BEFORE updating
        const oldSceneWidth = sceneWidthInPixels.value;
        // console.log('[ResizeHandle] OLD sceneWidthInPixels:', oldSceneWidth);
        
        // Store the values
        sceneWidthInPixels.value = finalSceneWidth;
        
        // Only snap during drag operations, not during step operations or initialization
        if (stepCount.value > 1 && shouldSave && !isStepOperation) {
            // Only snap when shouldSave=true AND not a step operation (during drag)
            const increment = 100 / stepCount.value;
            const nearestStep = Math.round(actualPercentage / increment);
            uiPercentage.value = nearestStep * increment;
            // console.log('[ResizeHandle] Snapped uiPercentage to step:', uiPercentage.value, '(was', actualPercentage, ')');
        } else if (!isStepOperation) {
            uiPercentage.value = actualPercentage;
        }
        // For step operations, uiPercentage is already set correctly, don't modify it
        
        // Only dispatch event and save if scene width actually changed
        if (finalSceneWidth !== oldSceneWidth) {
            // console.log('[ResizeHandleManager] Scene width changed:', oldSceneWidth, '->', finalSceneWidth);
            
            // Use debounced event dispatcher to prevent cascade during dragging
            dispatchResizeEvents(finalSceneWidth, isStepOperation);
        }
        // Skip logging when no change detected
        
        // Smart saving strategy with scheduled auto-save
        if (appState.value?.["user-settings"]?.layout && (finalSceneWidth !== oldSceneWidth || shouldSave)) {
            if (isStepOperation) {
                // Step operations: save immediately for instant feedback
                // console.log('[ResizeHandle] Step operation - immediate save:', uiPercentage.value);
                
                // Update both appState and appStore
                await updateAppState({
                    "user-settings": {
                        layout: {
                            scenePercentage: uiPercentage.value,
                            resumePercentage: 100 - uiPercentage.value
                        }
                    }
                }, true); // immediate = true
                
                // AppStore now reads from centralized state - no need for separate update
            } else if (shouldSave && !isDragging.value) {
                // Drag end: save final position immediately
                const currentUIPercentage = uiPercentage.value;
                const resumeUIPercentage = 100 - currentUIPercentage;
                
                // console.log('[ResizeHandle] Drag ended - final save:', currentUIPercentage);
                await updateAppState({
                    "user-settings": {
                        layout: {
                            scenePercentage: currentUIPercentage,
                            resumePercentage: resumeUIPercentage
                        }
                    }
                }, true); // immediate = true
                
                // AppStore now reads from centralized state - no need for separate update
            } else if (isDragging.value) {
                // During dragging: queue for auto-save (no API calls) but update appStore for reactive UI
                await updateAppState({
                    "user-settings": {
                        layout: {
                            scenePercentage: uiPercentage.value,
                            resumePercentage: 100 - uiPercentage.value
                        }
                    }
                }, false); // Queue for auto-save system
                
                // AppStore now reads from centralized state - no need for separate update
                // console.log('[ResizeHandle] Dragging - queued for auto-save:', uiPercentage.value);
            }
        }
        
        // Log completion - no logAndReset method exists
    } catch (error) {
        console.error('ResizeHandle updateLayout error:', error);
        throw error;
    } finally {
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
    // console.log('[ResizeHandle] collapseLeft() called');
    // console.log('[ResizeHandle] Current uiPercentage:', uiPercentage.value);
    // console.log('[ResizeHandle] Step count:', stepCount.value);
    
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
        
        // console.log('[ResizeHandle] collapseLeft - increment:', increment, 'currentBlock:', currentBlock);
        // console.log('[ResizeHandle] collapseLeft - from', uiPercentage.value, '-> newPercentage:', newPercentage);
    }
    
    // console.log('[ResizeHandle] Updating layout to:', newPercentage);
    // Force the exact percentage without any snapping or processing
    uiPercentage.value = newPercentage;
    await updateLayout(newPercentage, true, true); // shouldSave=true, isStepOperation=true
    await nextTick();
  }

  async function collapseRight() {
    // console.log('[ResizeHandle] collapseRight() called');
    // console.log('[ResizeHandle] Current uiPercentage:', uiPercentage.value);
    // console.log('[ResizeHandle] Step count:', stepCount.value);
    
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
        
        // console.log('[ResizeHandle] collapseRight - increment:', increment, 'currentBlock:', currentBlock);
        // console.log('[ResizeHandle] collapseRight - from', uiPercentage.value, '-> newPercentage:', newPercentage);
    }
    
    // console.log('[ResizeHandle] Updating layout to:', newPercentage);
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
    setDragMode,
    
    // For cleanup and timing
    dragHandlers,
    _lastMouseMoveTime,
    _timingData
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
      _resizeHandleState._lastMouseMoveTime = 0; // Reset timing
      _resizeHandleState._timingData = []; // Clear previous timing data
      // console.log('[ResizeHandle] Drag started - timing collection active');
      
      // Notify systems about drag mode
      dragStateManager.startDrag('ResizeHandle');
      _resizeHandleState.setDragMode(true); // Prevent auto-save during dragging
      
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
