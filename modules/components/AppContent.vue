<template>
  <div id="app-container" :class="appContainerClass">
    <!-- Scene Container -->
    <div 
      id="scene-container" 
      :style="sceneContainerStyle" 
      @click="handleSceneContainerClick"
      :class="{ 'container-first': firstContainer === 'scene-container', 'container-second': secondContainer === 'scene-container' }"
    >
      <div id="scene-content">
        <div id="scene-plane-top-gradient"></div>
        <div id="scene-plane-btm-gradient"></div>
        <div id="scene-plane">
          <Timeline :alignment="timelineAlignment" />
          <!-- <SankeyConnections /> -->
          <SkillBadges />
          <ConnectionLines />
        </div>
      </div>
      <div id="scene-viewer-label">
        <span class="viewer-label">Scene Viewer ({{ Math.round(scenePercentage) }}%)</span>
      </div>
    </div>
    
    <!-- Resume Container -->
    <div 
      id="resume-container"
      :class="{ 'container-first': firstContainer === 'resume-container', 'container-second': secondContainer === 'resume-container' }"
    >
      <!-- ResizeHandle on left side when scene is on left -->
      <ResizeHandle v-if="appContainerClass === 'scene-left'" />
      
      <div class="resume-content">
        <div class="resume-wrapper">
          <ResumeContainer />
          <div id="resume-viewer-label">
            <span class="viewer-label">Resume Viewer ({{ resumePercentage }}%)</span>
          </div>
        </div>
      </div>
      
      <!-- ResizeHandle on right side when scene is on right -->
      <ResizeHandle v-if="appContainerClass === 'scene-right'" />
    </div>

    <div id="aim-point"></div>
    <div id="bulls-eye">+</div>
    <div 
      id="focal-point" 
      :style="focalPointStyle" 
      :class="{ locked: focalPoint.value?.isLocked, dragging: focalPoint.value?.isDragging }"
    >⦻</div>
    
    <!-- Viewport Rectangle Border -->
    <div 
      id="viewport-border" 
      :style="viewportBorderStyle"
    ></div>
    
    <!-- Scene Rectangle Border for Job 0 -->
    <div 
      id="scene-rect-border" 
      :style="sceneRectBorderStyle"
    ></div>
    
    <!-- Parallaxed Rectangle Border for Job 0 -->
    <div 
      id="parallax-rect-border" 
      :style="parallaxRectBorderStyle"
    ></div>
    
    <!-- Live Debug Display - Hidden when badge mode is no-badges OR no job selected -->
    <div 
      v-show="badgeMode !== 'no-badges' && debugValues['selectedJobNumber'] && debugValues['selectedJobNumber'] !== 'NONE'"
      id="live-debug-display"
      :style="debugPanelStyle"
      :class="{ 
        'debug-left': appContainerClass === 'scene-left',
        'debug-right': appContainerClass === 'scene-right'
      }"
    >
      <!-- Draggable header line -->
      <div 
        class="debug-line debug-drag-handle"
        @mousedown="handleDebugPanelDragStart"
      >#{{ debugValues['selectedJobNumber'] }}</div>
      <!-- Text-selectable content lines -->
      <div class="debug-content" @mousedown.stop>
        <div class="debug-line">{{ debugValues['cloneCenterY'] }}</div>
        <div class="debug-line">{{ debugValues['categorySummary'] }}</div>
        <!-- Related badges positioning -->
        <div v-for="badge in debugValues['relatedBadgeList']" :key="badge.id" class="debug-line" 
             :style="{ 
               fontSize: '12px',
               border: badge.category === 'LEVEL' ? '2px solid yellow' : 'none',
               padding: badge.category === 'LEVEL' ? '2px 4px' : '0',
               margin: badge.category === 'LEVEL' ? '2px 0' : '0'
             }">
          {{ badge.displayText }}
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted, onUnmounted, watchEffect } from 'vue';
import { useColorPalette } from '@/modules/composables/useColorPalette.mjs';
import { useViewport } from '@/modules/composables/useViewport.mjs';
import { useBullsEye } from '@/modules/composables/useBullsEye.mjs';
import { useAimPoint } from '@/modules/composables/useAimPoint.mjs';
import { useFocalPoint } from '@/modules/composables/useFocalPoint.mjs';
import { useResizeHandle } from '@/modules/composables/useResizeHandle.mjs';
import { useLayoutToggle } from '@/modules/composables/useLayoutToggle.mjs';
import { useTimeline, initialize as initializeTimeline } from '@/modules/composables/useTimeline.mjs';
import { BaseVueComponentMixin } from '@/modules/core/abstracts/BaseComponent.mjs';


import { initializeState, saveState } from '@/modules/core/stateManager.mjs';
// Remove direct jobs import - will use JobsDataManager
import * as keyDown from '@/modules/core/keyDownModule.mjs';
import { sceneContainer } from '@/modules/scene/sceneContainerModule.mjs';
import * as viewPort from '@/modules/core/viewPortModule.mjs';
import { cardsController } from '@/modules/scene/CardsController.mjs';
import '@/modules/core/aimPoint.mjs';
import '@/modules/core/bullsEye.mjs'; // Import to trigger BullsEye instance creation
import * as resizeHandle from '@/modules/resize/resizeHandler.mjs';
import { resumeListController } from '@/modules/resume/ResumeListController.mjs';
import { initializationManager } from '@/modules/core/initializationManager.mjs';
import { jobsDataManager } from '@/modules/core/jobsDataManager.mjs'; // Import to trigger registration
import { colorPaletteManager } from '@/modules/core/colorPaletteManager.mjs'; // Import to trigger registration
import { timelineManager } from '@/modules/core/timelineManager.mjs'; // Import to trigger registration
import { vueDomManager } from '@/modules/core/vueDomManager.mjs'; // Import to trigger registration
import * as scenePlane from '@/modules/scene/scenePlaneModule.mjs';
import * as parallax from '@/modules/core/parallaxModule.mjs';
import debugPanel from '@/modules/core/debugPanel.mjs';
import * as autoScroll from '@/modules/animation/autoScrollModule.mjs';
import { selectionManager } from '@/modules/core/selectionManager.mjs';
import { badgeManager } from '@/modules/core/badgeManager.mjs';
import '@/modules/core/badgeManager.mjs'; // Import to trigger BadgeManager instance creation
import { AppState } from '@/modules/core/stateManager.mjs';


import Timeline from '@/modules/components/Timeline.vue';
import ResizeHandle from '@/modules/components/ResizeHandle.vue';
import ResumeContainer from '@/modules/components/ResumeContainer.vue';
import SkillBadges from '@/modules/components/SkillBadges.vue';
import SankeyConnections from '@/modules/components/SankeyConnections.vue';
import BadgeToggle from '@/modules/components/BadgeToggle.vue';
import ConnectionLines from '@/modules/components/ConnectionLines.vue';


export default {
  name: 'AppContent',
  components: {
    Timeline,
    ResizeHandle,
    ResumeContainer,
    SkillBadges,
    SankeyConnections,
    ConnectionLines,
    BadgeToggle,
  },
  mixins: [BaseVueComponentMixin],

  methods: {
    getComponentDependencies() {
      return [
        'SceneContainer', // Ensure DOM is ready before using viewport and composables
      ];
    },

    async initialize(dependencies) {
      // SceneContainer dependency ensures DOM is ready, now safe to initialize viewport
      window.CONSOLE_LOG_IGNORE('[AppContent] DOM ready, initializing viewport with dependencies:', Object.keys(dependencies));
      
      // Get viewport instance from setup and initialize it now that DOM is ready
      const viewport = this.getViewportInstance();
      if (viewport) {
        viewport.initialize();
        window.CONSOLE_LOG_IGNORE('[AppContent] Viewport initialized successfully');
      }
      
      onUnmounted(() => {
        this.cleanupDependencies();
      });
    },

    cleanupDependencies() {
      // Event listeners are cleaned up in the setup() onUnmounted hook
    },
    
    getViewportInstance() {
      // Access viewport instance returned from setup()
      return this.viewport;
    }
  },

  async setup() {

    // Declare variables that will be used throughout the component
    let debugInterval;
    const viewportBorderTrigger = ref(0);
    const badgeMode = ref('no-badges');

    // Simple debug update function - DebugPanel component handles its own state now
    const updateDebugValues = () => {
      // DebugPanel is now a Vue component that manages its own debug values
      // This function just triggers reactivity for viewport border updates
    };

    // Function to reinitialize scene components after layout changes
    const reinitializeSceneComponents = async () => {
      try {
        // PHASE 1: Wait for DOM and CSS transitions to stabilize
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // PHASE 2: Force layout recalculation and viewport update (CRITICAL FIRST STEP)
        const sceneContainerElement = document.getElementById('scene-container');
        if (sceneContainerElement && viewPort) {
          // Force layout recalculation
          void sceneContainerElement.offsetHeight;
          
          // Update viewport with new scene container position
          viewPort.updateViewPort();
          
          // Critical wait for viewport changes to propagate
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // PHASE 3: Container scroll reset (before repositioning)
        const sceneContent = document.getElementById('scene-content');
        if (sceneContent) {
          // Reset scroll to ensure correct positioning base
          sceneContent.scrollTop = 0;
          sceneContent.scrollLeft = 0;
        }
        
        // PHASE 4: Trigger parallax recalculation
        // Force parallax to recalculate by dispatching viewport changed event
        window.dispatchEvent(new CustomEvent('viewport-changed', {
          detail: { source: 'scene-reinitialization' }
        }));
        
        // PHASE 5: Wait for parallax calculations to complete
        await new Promise(resolve => setTimeout(resolve, 150));
        
        // PHASE 6: Timeline realignment (CRITICAL for cDiv positioning)
        // Timeline needs to be realigned after any container or viewport changes
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('timeline-realign-needed'));
        }, 50);
        
        // PHASE 7: Card repositioning moved to component-managed system
        
        // PHASE 8: Final scene refresh
        window.dispatchEvent(new CustomEvent('scene-refresh-needed'));
        
      } catch (error) {
        console.error('Error during scene reinitialization:', error);
      }
    };

    // Register lifecycle hooks immediately (before any await statements)
    let handleSceneWidthChanged = null;
    let handleBadgeModeChanged = null;
    onUnmounted(() => {
      if (handleSceneWidthChanged) {
        window.removeEventListener('scene-width-changed', handleSceneWidthChanged);
      }
      if (handleBadgeModeChanged) {
        badgeManager.removeEventListener('badgeModeChanged', handleBadgeModeChanged);
      }
      if (debugInterval) {
        clearInterval(debugInterval);
      }
      window.removeEventListener('viewport-changed', updateDebugValues);
      
      // Clean up debug panel drag listeners
      document.removeEventListener('mousemove', handleDebugPanelDrag);
      document.removeEventListener('mouseup', handleDebugPanelDragEnd);
    });
    
    // Initialize reactive composables immediately (before any await statements)
    // This ensures Vue lifecycle hooks are registered in the correct component context
    const viewport = useViewport('AppContent');
    const bullsEye = useBullsEye();
    const aimPoint = useAimPoint();
    const focalPoint = useFocalPoint();
    const resizeHandle = useResizeHandle();
    useTimeline();
    
    // Declare layoutToggle - will be initialized by InitializationManager
    let layoutToggle = null;
    
    // Initialize color palette composable immediately (before any await statements)
    const colorPalette = useColorPalette();
    
    // Register lifecycle hooks before any await statements
    onMounted(() => {
      // Component mounted - DOM elements are ready immediately
      window.CONSOLE_LOG_IGNORE('[AppContent] Vue mounted - DOM elements ready, dispatching dom-ready event');
      
      // Debug: Check DOM elements exist before dispatching event
      window.CONSOLE_LOG_IGNORE('[AppContent] DOM Check - scene-container:', !!document.getElementById('scene-container'));
      window.CONSOLE_LOG_IGNORE('[AppContent] DOM Check - scene-plane:', !!document.getElementById('scene-plane'));
      window.CONSOLE_LOG_IGNORE('[AppContent] DOM Check - bulls-eye:', !!document.getElementById('bulls-eye'));
      window.CONSOLE_LOG_IGNORE('[AppContent] DOM Check - aim-point:', !!document.getElementById('aim-point'));
      
      window.dispatchEvent(new CustomEvent('vue-dom-ready', { 
        detail: { timestamp: Date.now() } 
      }));
      
      window.CONSOLE_LOG_IGNORE('[AppContent] vue-dom-ready event dispatched');
      
      // Start async initialization without blocking onMounted
      initializeAsync();
    });

    // Separate async function to avoid lifecycle hook issues
    const initializeAsync = async () => {
      try {
        // Starting component initialization
        
        // Server-side dependency enforcement check
        
        try {
          // Call server endpoint to check dependencies
          const response = await fetch('http://localhost:3009/api/check-dependencies');
          
          // Parse JSON response even for 400+ status codes
          let result;
          try {
            result = await response.json();
          } catch (parseError) {
            console.error('❌ Failed to parse server response as JSON:', parseError);
            throw new Error(`Server returned status ${response.status} but no valid JSON`);
          }
          
          // Server dependency check response received
          
          if (!result.success || response.status === 400) {
            console.error('DEPENDENCY VIOLATIONS DETECTED - See http://localhost:3009/violations for details');
            
            if (result.violations && result.violations.length > 0) {
              console.error(`Found ${result.violationCount} violations in ${result.summary?.foundComponents || '?'} components`);
            }
            
            // Show detailed compliance report if available
            if (result.report) {
              console.error(result.report);
            }
            
            const errorMessage = `
❌❌❌ DEPENDENCY ENFORCEMENT FAILED ❌❌❌

The server detected ${result.violationCount || 'unknown'} components with dependency violations.

${result.violations ? result.violations.map(v => `• ${v.name} (${v.file}): ${v.violations?.join(', ')}`).join('\\n') : 'No violation details available'}

🔧 REQUIRED FIXES:
1. All components using managers MUST extend BaseComponent
2. Override getDependencies() method to declare dependencies  
3. Override initialize() method with setup logic
4. Override destroy() method with cleanup logic

📋 Check browser console above for detailed violation list.
📋 Check server console for full compliance report.

🚫 THE APPLICATION WILL NOT START until violations are fixed.
            `;
            
            console.error(errorMessage);
            
            // Also display as alert for visibility - split into multiple alerts if needed
            let alertMessage = `❌ DEPENDENCY VIOLATIONS DETECTED!\n\n`;
            alertMessage += `Found ${result.violationCount || 'unknown'} violation(s)\n\n`;
            
            if (result.violations && result.violations.length > 0) {
              // First alert: Show all violations summary
              alertMessage += `ALL VIOLATIONS:\n`;
              result.violations.forEach((violation, index) => {
                alertMessage += `${index + 1}. ${violation.name || 'Unknown'} (${violation.file || 'Unknown'})\n`;
                if (violation.violations && violation.violations.length > 0) {
                  alertMessage += `   - ${violation.violations[0]}${violation.violations.length > 1 ? ' (+more)' : ''}\n`;
                }
              });
              
              alertMessage += `\n🔧 GENERAL FIX FOR ALL:\n`;
              alertMessage += `1. Extend BaseComponent (for .mjs files)\n`;
              alertMessage += `2. Use BaseVueComponentMixin (for .vue files)\n`;
              alertMessage += `3. Define getDependencies() method\n`;
              alertMessage += `4. Define initialize() and destroy() methods\n\n`;
              
              alertMessage += `📋 DETAILED REPORT AVAILABLE AT:\n`;
              alertMessage += `🌐 http://localhost:3009/violations\n\n`;
              
              alertMessage += `This page shows all violations with step-by-step fix instructions.\n\n`;
              alertMessage += `🚫 APPLICATION TERMINATED`;
              
                // Redirecting to violations page
              console.error('Found violations:', result.violationCount);
              
              // Redirect to violations page automatically
              window.location.href = 'http://localhost:3009/violations';
              
              // Don't continue with normal app initialization
              return;
            } else {
              alertMessage += `No violation details available in response\n`;
            }
            
            // This code only runs if no violations found (fallback)
            alert(alertMessage);
            
            throw new Error('Server dependency enforcement failed - application terminated');
          }
          
          // Server compliance check passed
          
        } catch (error) {
          if (error.message.includes('dependency enforcement failed') || error.message.includes('application terminated')) {
            throw error;
          }
          
          // If server check fails, fall back to simple client check
          console.warn('Server dependency check failed, falling back to client check:', error.message);
          
          // Simple client-side check as fallback
          try {
            const { badgePositioner } = await import('@/modules/utils/BadgePositioner.mjs');
            
            // Check if BadgePositioner is registered
            const isRegistered = initializationManager.isComponentRegistered?.('BadgePositioner') || false;
            
            if (!isRegistered) {
              throw new Error('BadgePositioner not registered with InitializationManager');
            }
            
            // Client fallback check passed
            
          } catch (fallbackError) {
            console.error('DEPENDENCY VIOLATION DETECTED (Client Fallback): BadgePositioner not registered');
            throw new Error('Client dependency check failed - application terminated');
          }
        }
        
        // Initialize Vue composables and systems that need to be ready before IM startup
        
        // LayoutToggle is a Vue composable, not a component - initialize directly  
        layoutToggle = useLayoutToggle();
        
        // Viewport initialization moved to initialize() after DOM is ready
        // await viewPort.initialize(); // Legacy viewPort still needs initialization
        
        // Timeline is now managed by TimelineManager IM component - no manual initialization needed
        
        // Let InitializationManager handle all BaseComponent initialization
        window.CONSOLE_LOG_IGNORE('[AppContent] Starting application via InitializationManager...');
        const initStatus = await initializationManager.startApplication();
        window.CONSOLE_LOG_IGNORE('[AppContent] Application initialization complete:', initStatus);
        
        // Initialize coordination systems after BaseComponents are ready
        resizeHandle.initializeResizeHandleState(viewport, bullsEye);
        const { applyInitialLayout } = resizeHandle;
        applyInitialLayout();
        
        // Initialize scene systems
        autoScroll.initialize();
        await scenePlane.initialize();
        
        // Initialize reactive composables that depend on IM components
        bullsEye.initialize();
        aimPoint.initialize();
        focalPoint.initialize();
        
        // Dispatch events for Vue components that need to know IM components are ready
        window.dispatchEvent(new CustomEvent('skill-badges-init-ready'));
        window.dispatchEvent(new CustomEvent('connection-lines-init-ready'));
        
        // Manual initialization of coordination systems after BaseComponents are ready
        // (These are not BaseComponents, just coordination logic)
        
        // All components initialized successfully
        
        // Scene container post-initialization check complete
        
        // Auto-scroll functionality removed - now handled by DebugPanel or user interaction
        
        // Ensure scene components are properly initialized after initial load
        reinitializeSceneComponents();
        
        // Debug-related functionality moved to DebugPanel component
        // No debug interval, window properties, or debug event listeners needed
        
        // Listen for badges-positioned events to update debug display with real bucket info
        window.addEventListener('badges-positioned', (event) => {
          if (event.detail && event.detail.badgeOrder) {
            // Store the real badge order data for debug display
            debugValues.value['badgeOrderData'] = event.detail.badgeOrder;
            updateDebugValues();
          }
        });
        
        // Force viewport border to update on viewport changes
        window.addEventListener('viewport-changed', () => {
          // Force reactivity by updating the trigger
          viewportBorderTrigger.value++;
        });
        
        // Load debug panel position from saved state
        loadDebugPanelPosition();

        // Add global mouse event listeners for debug panel dragging
        document.addEventListener('mousemove', handleDebugPanelDrag);
        document.addEventListener('mouseup', handleDebugPanelDragEnd);

        // Add global functions for debugging initialization
        window.checkInitializationStatus = () => {
          console.table(initializationManager.getStatus());
        };
        
        window.showDependencyGraph = () => {
          window.CONSOLE_LOG_IGNORE(initializationManager.getDependencyGraph());
        };
        
        window.validateDependencies = () => {
          const result = initializationManager.validateDependencies();
          if (result.isValid) {
            window.CONSOLE_LOG_IGNORE('Dependency graph is valid');
          } else {
            console.error('Dependency graph has errors:', result.errors);
          }
          if (result.warnings.length > 0) {
            console.warn('Warnings:', result.warnings);
          }
          return result;
        };
        
        
        // Debug functions added to window object
        
        // Add scene reinitialization handler for layout changes
        window.addEventListener('scene-reinitialize-needed', (event) => {
          // Ensure we don't start reinitialization during transitions
          if (!window.isLayoutTransitioning) {
            reinitializeSceneComponents();
          } else {
            // Wait for transition to complete and then reinitialize
            setTimeout(() => {
              reinitializeSceneComponents();
            }, 200);
          }
        });
        
        // Add handler for forced scene updates to ensure everything is properly positioned
        window.addEventListener('scene-force-update', (event) => {
          setTimeout(() => {
            forceSceneUpdate();
          }, 100);
        });
        
        // Add handler for scene refresh events
        window.addEventListener('scene-refresh-needed', (event) => {
          // Trigger viewport update to ensure everything is properly positioned
          if (viewPort) {
            viewPort.updateViewPort();
          }
        });
        
        // Add handler for page refresh to ensure scene initialization
        window.addEventListener('load', () => {
          setTimeout(() => {
            reinitializeSceneComponents();
          }, 500);
        });
        
      } catch (error) {
        console.error("AppContent: Error in event-driven initialization:", error);
      }
    }; // End of initializeAsync function

    // Call the async initialization
    initializeAsync();

    // Load color palettes at setup level
    await colorPalette.loadPalettes();
    
    await initializeState();
    
    // Initialize core services (event system first)
    keyDown.initialize();
    
                  // Initialize data controllers (non-DOM dependent)
      
      // Initialize assembly (non-DOM dependent)
  
    // Initialize layout systems (will be done after viewport is ready)
    
    // Initialize final services (non-DOM dependent)
    // Note: autoScroll will be initialized in onMounted after DOM is available
    
    // Return the setup data - this allows Vue to render the template
    // DOM-dependent initialization will happen in onMounted
    
    // Computed properties
    const focalPointStyle = computed(() => {
      if (!focalPoint.value) return { left: '0px', top: '0px' };
      const style = {
        left: `${focalPoint.value.position.value.x}px`,
        top: `${focalPoint.value.position.value.y}px`,
      };

      return style;
    });

    // Computed property for viewport border positioning
    const viewportBorderStyle = computed(() => {
      // Force reactivity by accessing the trigger
      viewportBorderTrigger.value;
      
      if (!viewPort) {
        return { display: 'none' };
      }

      try {
        const vpRect = viewPort.getViewPortRect();
        
        // Get scene container position for absolute positioning
        const sceneContainer = document.getElementById('scene-container');
        if (!sceneContainer) {
          return { display: 'none' };
        }
        
        const sceneRect = sceneContainer.getBoundingClientRect();
        
        // Since viewport has no padding, it should be identical to scene container
        const style = {
          position: 'fixed',
          left: `${sceneRect.left}px`,
          top: `${sceneRect.top}px`,
          width: `${sceneRect.width}px`,
          height: `${sceneRect.height}px`,
          border: 'none',
          backgroundColor: 'transparent',
          pointerEvents: 'none',
          zIndex: '999'
        };
        
        return style;
      } catch (error) {
        return { display: 'none' };
      }
    });

    // Computed property for scene rectangle border (job 0)
    const sceneRectBorderStyle = computed(() => {
      // Force reactivity
      viewportBorderTrigger.value;
      
      try {
        // Find the card for job 0
        const cardElement = document.querySelector('[data-job-number="0"]');
        if (!cardElement) {
          return { display: 'none' };
        }
        
        // Get scene container position
        const sceneContainer = document.getElementById('scene-container');
        if (!sceneContainer) {
          return { display: 'none' };
        }
        
        const sceneRect = sceneContainer.getBoundingClientRect();
        
        // Get the scene-relative position from attributes
        const sceneLeft = parseFloat(cardElement.getAttribute('data-scene-left') || '0');
        const sceneTop = parseFloat(cardElement.getAttribute('data-scene-top') || '0');
        const sceneWidth = parseFloat(cardElement.getAttribute('data-scene-width') || '0');
        const sceneHeight = parseFloat(cardElement.getAttribute('data-scene-height') || '0');
        
        // Convert to absolute coordinates
        const absoluteLeft = sceneRect.left + sceneLeft;
        const absoluteTop = sceneRect.top + sceneTop;
        
        return {
          position: 'fixed',
          left: `${absoluteLeft}px`,
          top: `${absoluteTop}px`,
          width: `${sceneWidth}px`,
          height: `${sceneHeight}px`,
          border: '2px solid blue',
          backgroundColor: 'rgba(0, 0, 255, 0.1)',
          pointerEvents: 'none',
          zIndex: '998'
        };
      } catch (error) {
        return { display: 'none' };
      }
    });

    // Computed property for parallaxed rectangle border (job 0)
    const parallaxRectBorderStyle = computed(() => {
      // Force reactivity
      viewportBorderTrigger.value;
      
      try {
        // Find the card for job 0
        const cardElement = document.querySelector('[data-job-number="0"]');
        if (!cardElement) {
          return { display: 'none' };
        }
        
        // Get the actual transformed position
        const cardRect = cardElement.getBoundingClientRect();
        const computedStyle = window.getComputedStyle(cardElement);
        
        return {
          position: 'fixed',
          left: `${cardRect.left}px`,
          top: `${cardRect.top}px`,
          width: `${cardRect.width}px`,
          height: `${cardRect.height}px`,
          border: '2px solid green',
          backgroundColor: 'rgba(0, 255, 0, 0.1)',
          pointerEvents: 'none',
          zIndex: '997'
        };
      } catch (error) {
        return { display: 'none' };
      }
    });

    // Create a reactive reference to scene width that updates via events
    // Start with a reasonable default width (50% of window width)
    const sceneWidth = ref(viewport.value?.width.value || Math.round(window.innerWidth * 0.5));
    
    // Set up event listener for scene width changes immediately
    handleSceneWidthChanged = (event) => {
      sceneWidth.value = event.detail.width;
    };
    
    // Add event listener immediately (will be cleaned up in onUnmounted)
    window.addEventListener('scene-width-changed', handleSceneWidthChanged);
    
    const sceneContainerStyle = computed(() => {
      const width = `${sceneWidth.value}px`;
      return { width };
    });

    const totalWidth = computed(() => {
      return window.innerWidth;
    });

    const resumePercentage = computed(() => {
      return 100 - Math.round(resizeHandle.percentage.value);
    });

    // Computed properties for dynamic layout ordering
    const firstContainer = computed(() => {
      return layoutToggle?.isSceneLeft?.value ? 'scene-container' : 'resume-container';
    });

    const secondContainer = computed(() => {
      return layoutToggle?.isSceneLeft?.value ? 'resume-container' : 'scene-container';
    });

    const appContainerClass = computed(() => {
      const layout = useLayoutToggle();
      return layout.orientation.value || 'scene-left';
    });

    const resumeViewerLabel = computed(() => {
      return 'Resume Viewer'; // Always show Resume Viewer for resume container
    });

    // Get orientation from layout toggle
    const { orientation } = useLayoutToggle();
    
    const timelineAlignment = computed(() => {
      // Timeline always against window inner edge:
      // - scene-left: left window edge, so alignment = 'left' 
      // - scene-right: right window edge, so alignment = 'right'
      // Timeline follows scene position:
      // - scene-left: timeline on left
      // - scene-right: timeline on right
      const alignment = orientation.value === 'scene-left' ? 'left' : 'right';
      return alignment;
    });

    // Computed style for debug panel position based on current orientation
    const debugPanelStyle = computed(() => {
      const currentOrientation = appContainerClass.value;
      const position = debugPanelPosition.value[currentOrientation];
      
      if (currentOrientation === 'scene-left') {
        return {
          top: `${position.top}px`,
          left: `${position.left}px`
        };
      } else {
        return {
          top: `${position.top}px`,
          right: `${position.right}px`
        };
      }
    });

    // Debug values for live display - now using the debug panel component
    const debugValues = ref({
      'sp.job0': 'N/A',      // Job 0 scene coordinates relative to scene plane
      'sp.job0View': 'N/A'   // Job 0 view coordinates relative to scene plane
    });

    // Badge mode state for hiding debug panel when badges are disabled (moved to top of setup)

    // Force viewport border reactivity (moved to top of setup)

    // Debug panel position state - separate positions for each scene orientation
    const debugPanelPosition = ref({
      'scene-left': { top: 20, left: 200 },
      'scene-right': { top: 20, right: 200 }
    });

    // Load debug panel position from AppState
    const loadDebugPanelPosition = () => {
      if (AppState?.debugPanel?.position) {
        debugPanelPosition.value = {
          ...debugPanelPosition.value,
          ...AppState.debugPanel.position
        };
        // Debug panel position loaded from state
      }
    };

    // Save debug panel position to AppState
    const saveDebugPanelPosition = () => {
      if (!AppState.debugPanel) {
        AppState.debugPanel = {};
      }
      AppState.debugPanel.position = { ...debugPanelPosition.value };
      saveState(AppState);
      // Debug panel position saved to state
    };

    // Debug panel drag functionality
    let isDragging = false;
    let dragStartPoint = { x: 0, y: 0 };
    let initialPosition = { top: 0, left: 0, right: 0 };
    // Debug variables (unused, kept for future debugging)
    // let lastLoggedMouse = { x: 0, y: 0 };
    // const MOUSE_EPSILON = 5;

    const handleDebugPanelDragStart = (event) => {
      isDragging = true;
      
      // Save the start drag point position
      dragStartPoint.x = event.clientX;
      dragStartPoint.y = event.clientY;
      
      // Save the initial panel position
      const currentOrientation = appContainerClass.value;
      const currentPos = debugPanelPosition.value[currentOrientation];
      initialPosition = { ...currentPos };
      
      event.preventDefault();
      // window.CONSOLE_LOG_IGNORE('[Debug] Drag started at:', { x: event.clientX, y: event.clientY, dragStartPoint });
    };

    const handleDebugPanelDrag = (event) => {
      if (!isDragging) return;
      
      event.preventDefault();
      event.stopPropagation();

      // Calculate transform from current point position - start drag position
      const deltaX = event.clientX - dragStartPoint.x;
      const deltaY = event.clientY - dragStartPoint.y;
      
      // window.CONSOLE_LOG_IGNORE(`[Debug] Dragging:`, { currentMouse: { x: event.clientX, y: event.clientY }, dragStartPoint, deltaX, deltaY });
      
      const currentOrientation = appContainerClass.value;
      
      // Debug logging disabled - uncomment to enable
      // const mouseDeltaFromLastLog = Math.abs(event.clientX - lastLoggedMouse.x) + Math.abs(event.clientY - lastLoggedMouse.y);
      // if (mouseDeltaFromLastLog > MOUSE_EPSILON) {
      //   window.CONSOLE_LOG_IGNORE('[Debug] Drag delta:', { 
      //     deltaX, 
      //     deltaY, 
      //     initial: initialPosition,
      //     currentMouse: { x: event.clientX, y: event.clientY },
      //     startMouse: dragStartPoint,
      //     devicePixelRatio: window.devicePixelRatio
      //   });
      //   lastLoggedMouse.x = event.clientX;
      //   lastLoggedMouse.y = event.clientY;
      // }
      
      if (currentOrientation === 'scene-left') {
        const newLeft = initialPosition.left + deltaX;
        const newTop = initialPosition.top + deltaY;
        
        
        // Constrain to viewport bounds
        const constrainedLeft = Math.max(0, Math.min(newLeft, window.innerWidth - 250));
        const constrainedTop = Math.max(0, Math.min(newTop, window.innerHeight - 100));
        
        debugPanelPosition.value['scene-left'] = {
          top: constrainedTop,
          left: constrainedLeft
        };
        
        // Debug logging disabled
        // window.CONSOLE_LOG_IGNORE('[Debug] Final position applied:', { constrainedLeft, constrainedTop });
      } else {
        const newRight = initialPosition.right - deltaX; // Right moves opposite to mouse
        const newTop = initialPosition.top + deltaY;
        
        
        // Constrain to viewport bounds
        const constrainedRight = Math.max(0, Math.min(newRight, window.innerWidth - 250));
        const constrainedTop = Math.max(0, Math.min(newTop, window.innerHeight - 100));
        
        debugPanelPosition.value['scene-right'] = {
          top: constrainedTop,
          right: constrainedRight
        };
      }
    };

    const handleDebugPanelDragEnd = () => {
      if (isDragging) {
        // window.CONSOLE_LOG_IGNORE('[Debug] Drag ended');
        isDragging = false;
        saveDebugPanelPosition();
      }
    };

    // Helper function to set all debug values to a status message
    const setDebugValuesToStatus = (status) => {
      debugValues.value['selectedJobNumber'] = status;
      debugValues.value['lastVisitedJobNumber'] = status;
      debugValues.value['cloneCenterY'] = status;
      debugValues.value['categorySummary'] = status;
      debugValues.value['relatedBadgeList'] = [];
    };

    // Duplicate updateDebugValues function removed - using the one declared at top of setup()

    const handleSceneContainerClick = (event) => {
      // Only clear selection if clicking directly on the scene container or its immediate children
      // Don't clear if clicking on interactive elements like cards
      if (event.target.id === 'scene-container' || 
          event.target.id === 'scene-content' ||
          event.target.id === 'scene-plane' ||
          event.target.id === 'scene-plane-top-gradient' ||
          event.target.id === 'scene-plane-btm-gradient' ||
          event.target.id === 'scene-content-footer' ||
          event.target.closest('#scene-content-footer')) {
        selectionManager.clearSelection('AppContent.sceneContainerClick');
      }
    };
    
    // Duplicate function removed - using the one declared at top of setup()
    
    // Function to force scene update after layout changes are complete
    const forceSceneUpdate = async () => {
      try {
        // Force scene update started
        
        // Force viewport recalculation
        if (viewPort) {
          viewPort.updateViewPort();
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // Force bullsEye recentering with viewport awareness
        if (bullsEye) {
          bullsEye.recenterBullsEye();
          await new Promise(resolve => setTimeout(resolve, 100));
          
          // Force another recenter to ensure proper positioning after viewport changes
          setTimeout(() => {
            bullsEye.recenterBullsEye();
          }, 200);
        }
        
        // Force card geometry updates
        if (window.cardsController && window.cardsController.bizCardDivs) {
          window.cardsController.bizCardDivs.forEach(card => {
            const jobNumber = parseInt(card.getAttribute('data-job-number'));
            const job = window.cardsController.originalJobsData.find(j => j.jobNumber === jobNumber);
            if (job) {
              window.cardsController._setBizCardDivSceneGeometry(card, job);
            }
          });
        }
        
        // Force parallax update for all cards
        const allCards = document.querySelectorAll('.biz-card-div');
        allCards.forEach(card => {
          if (window.applyParallaxToBizCardDiv) {
            window.applyParallaxToBizCardDiv(card, 0, 0);
          }
        });
        
        // Trigger final scene refresh
        window.dispatchEvent(new CustomEvent('scene-refresh-needed'));
        
        // Force scene update completed
      } catch (error) {
        console.error('Error during force scene update:', error);
      }
    };
    

    
    return {
      focalPoint,
      viewport,
      focalPointStyle,
      viewportBorderStyle,
      sceneRectBorderStyle,
      parallaxRectBorderStyle,
      sceneContainerStyle,
      handleSceneContainerClick,
      totalWidth,
      sceneWidth,
      resumePercentage,
      firstContainer,
      secondContainer,
      appContainerClass,
      resumeViewerLabel,
      timelineAlignment,
      scenePercentage: resizeHandle.percentage,
      debugValues,
      badgeMode,
      debugPanelStyle,
      handleDebugPanelDragStart,
      handleDebugPanelDrag,
      handleDebugPanelDragEnd
    };
  }
};
</script>

<style>
#app-container {
  display: flex;
  flex-direction: row;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
}

/* Layout orientation classes */
#app-container.scene-left {
  flex-direction: row-reverse;
}

#app-container.scene-right {
  flex-direction: row;
}

/* Scene viewer label positioning based on layout */
#app-container.scene-left #scene-viewer-label {
  right: 20px;
  left: auto;
}

#app-container.scene-left #scene-viewer-label .viewer-label {
  right: 0;
  left: auto;
}

/* Resume viewer label positioning based on layout */
#app-container.scene-left #resume-viewer-label {
  left: 20px;
  right: auto;
}

/* Container ordering */
.container-first {
  order: 1;
}

.container-second {
  order: 2;
}

#scene-container {
  position: relative; 
  height: 100%;
  flex-shrink: 1; 
  flex-grow: 0;
  z-index: 1; 
  min-width: 0;
  max-width: none;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  /* width will be set by computed style */
}

#scene-content {
  flex-grow: 1;
  position: relative;
  overflow-y: scroll; 
  overscroll-behavior: contain;
  -ms-overflow-style: none; /* Hide scrollbar for IE and Edge */
  scrollbar-width: none; /* Hide scrollbar for Firefox */
  overflow-x: hidden; /* prevent horizontal scrolling */
  isolation: isolate;
  background-color: var(--background-dark);
  z-index: 0;
  margin: 0;
  padding: 0;
}

#scene-content::-webkit-scrollbar {
  display: none; /* Hide scrollbar for Chrome, Safari, and Opera */
}

#resume-container {
  height: 100%;
  flex-grow: 1; /* Take up remaining space after scene container */
  z-index: 10;
  display: flex;
  flex-direction: row; /* Horizontal layout for handle + content */
}

.resume-content {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.resume-wrapper {
  flex: 1;
  min-width: 0;
  position: relative;
}

#scene-viewer-label {
  position: absolute;
  bottom: 10px;
  left: 20px;
  right: undefined;
  background-color: rgba(0, 0, 0, 0.5);
  padding: 10px;
  z-index: 100;
  pointer-events: none;
  height: 40px;
  display: flex;
  align-items: center;
}

#scene-viewer-label .viewer-label {
  font-family: sans-serif;
  font-size: 14px;
  font-weight: 100;
  color: white;
  user-select: none;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.7);
  white-space: nowrap;
  pointer-events: auto;
}

#resume-viewer-label {
  position: absolute;
  bottom: 10px;
  right: 20px;
  left: undefined;
  background-color: rgba(255, 255, 255, 0.2);
  padding: 10px;
  z-index: 100;
  pointer-events: none;
  height: 40px;
  display: flex;
  align-items: center;
}

#resume-viewer-label .viewer-label {
  font-family: sans-serif;
  font-size: 14px;
  font-weight: 700;
  color: black;
  user-select: none;
  text-shadow: 1px 1px 2px rgba(255, 255, 255, 0.5);
  white-space: nowrap;
  pointer-events: auto;
}

#scene-plane {
    position: relative;
}

/* Live Debug Display */
#live-debug-display {
  position: fixed;
  z-index: 9999;
  background-color: rgba(0, 0, 0, 0.9);
  color: #00ff00;
  font-family: 'Courier New', monospace;
  font-size: 14px;
  padding: 0;
  border-radius: 6px;
  border: 2px solid yellow;
  line-height: 1.4;
  pointer-events: auto;
  white-space: nowrap;
  min-width: 250px;
  max-width: 400px;
  max-height: 80vh;
  overflow-y: auto;
  resize: both;
}

/* Draggable header - only first line handles drag events */
.debug-drag-handle {
  cursor: move;
  user-select: none;
  background-color: rgba(255, 255, 0, 0.1);
  padding: 12px;
  border-bottom: 1px solid rgba(255, 255, 0, 0.3);
  font-weight: bold;
}

.debug-drag-handle:hover {
  background-color: rgba(255, 255, 0, 0.2);
}

/* Content area - text selectable, no drag */
.debug-content {
  padding: 12px;
  user-select: text;
  cursor: text;
}

/* Scene orientation classes - positioning now handled by computed style */
#live-debug-display.debug-left {
  margin-right: 20px; /* plaeholder */
}

#live-debug-display.debug-right {
  margin-left: 20px;  /* placeholder */
}

.debug-line {
  margin: 2px 0;
}

</style> 