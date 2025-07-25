import { ref, computed, onMounted, onUnmounted, watchEffect, getCurrentInstance } from 'vue';
import { useLayoutToggle } from './useLayoutToggle.mjs';
import { BaseComponent } from '@/modules/core/abstracts/BaseComponent.mjs';

// --- Constants ---
const VIEWPORT_PADDING = 100;

// --- Viewport Manager Component (IM-managed) ---
export class ViewportManager extends BaseComponent {
  constructor() {
    super('ViewportManager');
    this.sceneContainer = null;
    this.resizeObserver = null;
    
    // Reactive state
    this.viewportState = ref({
      padding: VIEWPORT_PADDING,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      centerX: 0,
      centerY: 0,
      width: 0,
      height: 0
    });
  }

  getDependencies() {
    return ['SceneContainer'];
  }

  initialize(dependencies) {
    this.sceneContainer = dependencies.SceneContainer;
    console.log('[ViewportManager] Initialized with SceneContainer dependency - DOM operations moved to setupDom()');
  }

  /**
   * DOM setup phase - called after Vue DOM is ready
   * Moved DOM operations from initialize() for proper DOM separation
   */
  async setupDom() {
    console.log('[ViewportManager] DOM setup phase - setting up viewport calculations...');
    
    // Initial calculation (DOM operations moved from initialize)
    this.updateViewportProperties();

    // Listen for window resize (DOM operations moved from initialize)
    window.addEventListener('resize', () => this.updateViewportProperties());

    // Add ResizeObserver for scene container (DOM operations moved from initialize)
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        window.CONSOLE_LOG_IGNORE('Scene container resized, updating viewport...');
        this.updateViewportProperties();
      });
      this.resizeObserver.observe(this.sceneContainer.getSceneContainer());
    }
    
    console.log('[ViewportManager] DOM setup complete');
  }

  updateViewportProperties() {
    if (!this.sceneContainer) return;

    const sceneElement = this.sceneContainer.getSceneContainer();
    const sceneContainerRect = sceneElement.getBoundingClientRect();
    const sceneWidth = sceneElement.offsetWidth;
    const viewPortWidth = sceneWidth;
    const viewPortLeft = 0;
    const viewPortHeight = sceneContainerRect.height;
    const viewPortTop = sceneContainerRect.top;

    const newCenterX = sceneContainerRect.left + sceneContainerRect.width / 2;
    const newCenterY = sceneContainerRect.top + sceneContainerRect.height / 2;
    
    window.CONSOLE_LOG_IGNORE('updateViewportProperties: viewPortWidth:', viewPortWidth, 'viewPortHeight:', viewPortHeight, 'centerX:', newCenterX, 'centerY:', newCenterY);
    
    this.viewportState.value = {
      padding: VIEWPORT_PADDING,
      top: viewPortTop - VIEWPORT_PADDING,
      left: viewPortLeft - VIEWPORT_PADDING,
      right: viewPortWidth + 2 * VIEWPORT_PADDING,
      bottom: viewPortHeight + 2 * VIEWPORT_PADDING,
      centerX: newCenterX,
      centerY: newCenterY,
      width: viewPortWidth,
      height: viewPortHeight
    };

    // Dispatch viewport-changed event for backward compatibility
    const event = new CustomEvent('viewport-changed', {
      detail: {
        centerX: this.viewportState.value.centerX,
        centerY: this.viewportState.value.centerY,
        width: viewPortWidth,
        height: viewPortHeight
      }
    });
    window.dispatchEvent(event);
  }

  setViewPortWidth(newWidth) {
    if (typeof newWidth !== 'number') {
      throw new Error(`Viewport.setViewPortWidth: ${newWidth} is not a Number`);
    }

    window.CONSOLE_LOG_IGNORE(`RESIZE: setViewPortWidth: ${newWidth}`);
    
    // Update the entire reactive state object to trigger reactivity
    this.viewportState.value = {
      ...this.viewportState.value,
      width: newWidth,
      right: newWidth + 2 * VIEWPORT_PADDING
    };

    // Dispatch viewport-changed event
    window.dispatchEvent(new CustomEvent('viewport-changed', {
      detail: {
        centerX: this.viewportState.value.centerX,
        centerY: this.viewportState.value.centerY,
        width: newWidth,
        height: this.viewportState.value.height
      }
    }));
  }

  getVisualRect() {
    if (!this.sceneContainer) {
      return { top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0 };
    }
    return this.sceneContainer.getSceneContainer().getBoundingClientRect();
  }

  getViewPortOrigin() {
    // API compatibility method for ParallaxModule
    return {
      x: this.viewportState.value.centerX,
      y: this.viewportState.value.centerY
    };
  }

  getViewPortRect() {
    // API compatibility method - returns the viewport rect
    return {
      top: this.viewportState.value.top,
      left: this.viewportState.value.left,
      right: this.viewportState.value.right,
      bottom: this.viewportState.value.bottom,
      width: this.viewportState.value.width,
      height: this.viewportState.value.height,
      centerX: this.viewportState.value.centerX,
      centerY: this.viewportState.value.centerY
    };
  }

  destroy() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    window.removeEventListener('resize', () => this.updateViewportProperties());
    this.sceneContainer = null;
  }
}

// Create singleton instance
export const viewportManager = new ViewportManager();

// --- Composable Wrapper (for Vue components) ---
let _instance = null;
let _instanceCount = 0;
let _instanceLabels = new Map();

export function useViewport(label = 'unnamed') {
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

  // Watch for layout changes and update viewport reactively
  const layoutToggle = useLayoutToggle();
  watchEffect(() => {
    // Re-run when layout orientation changes
    const orientation = layoutToggle.orientation.value;
    window.CONSOLE_LOG_IGNORE(`[${label}] Layout orientation changed to:`, orientation);
    
    // Trigger viewport recalculation after layout change
    if (viewportManager.sceneContainer) {
      setTimeout(() => {
        // Wait for CSS transitions to complete before updating viewport properties
        viewportManager.updateViewportProperties();
      }, 350); // Increased delay to match CSS transition duration
    }
  });

  // Create computed properties that reference the IM-managed viewport state
  const padding = computed(() => viewportManager.viewportState.value.padding);
  const top = computed(() => viewportManager.viewportState.value.top);
  const left = computed(() => viewportManager.viewportState.value.left);
  const right = computed(() => viewportManager.viewportState.value.right);
  const bottom = computed(() => viewportManager.viewportState.value.bottom);
  const centerX = computed(() => viewportManager.viewportState.value.centerX);
  const centerY = computed(() => viewportManager.viewportState.value.centerY);
  const width = computed(() => viewportManager.viewportState.value.width);
  const height = computed(() => viewportManager.viewportState.value.height);

  const visualRect = computed(() => {
    return viewportManager.getVisualRect();
  });

  // Wrapper functions that delegate to the IM-managed instance
  function initialize() {
    // This is now handled by IM - kept for backward compatibility
    window.CONSOLE_LOG_IGNORE('useViewport.initialize() called - now handled by ViewportManager via IM');
  }

  function isInitialized() {
    return viewportManager.sceneContainer !== null;
  }

  function setViewPortWidth(newWidth) {
    return viewportManager.setViewPortWidth(newWidth);
  }

  function updateViewPort() {
    return viewportManager.updateViewportProperties();
  }

  function getViewPortRect() {
    return viewportManager.getViewPortRect();
  }

  function cleanup() {
    // Cleanup handled by IM lifecycle
    window.CONSOLE_LOG_IGNORE(`[${label}] Viewport cleanup called`);
    _instanceCount--;
    _instanceLabels.delete(label);
    
    if (_instanceCount === 0) {
      _instance = null;
    }
  }

  // Create the instance
  _instanceCount++;
  _instanceLabels.set(label, true);
  
  const viewportInstance = {
    // Reactive state
    padding,
    top,
    left,
    right,
    bottom,
    centerX,
    centerY,
    width,
    height,
    visualRect,
    
    // Methods
    initialize,
    isInitialized,
    setViewPortWidth,
    updateViewPort,
    getViewPortRect,
    cleanup
  };

  _instance = viewportInstance;
  return viewportInstance;
}