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
    
    <!-- Live Debug Display -->
    <div 
      id="live-debug-display"
      :class="{ 
        'debug-left': appContainerClass === 'scene-left',
        'debug-right': appContainerClass === 'scene-right'
      }"
    >
      <!-- App-container coordinates -->
      <div class="debug-line">scL: {{ debugValues['win.scL'] }}</div>
      <div class="debug-line">scW: {{ debugValues['win.scW'] }}</div>
      <div class="debug-line">rcL: {{ debugValues['win.rcL'] }}</div>
      <div class="debug-line">rcW: {{ debugValues['win.rcW'] }}</div>
      <div class="debug-line">beX: {{ debugValues['win.beX'] }}</div>
      <div class="debug-line">fpX: {{ debugValues['win.fpX'] }}</div>
      <!-- Scene container coordinates -->
      <div class="debug-line">scCx: {{ debugValues['app.scCx'] }}</div>
      <div class="debug-line">vpRect: {{ debugValues['app.vpRect'] }}</div>
      <!-- Scene-plane coordinates -->
      <div class="debug-line">sp.job0: {{ debugValues['sp.job0'] }}</div>
      <div class="debug-line">sp.job0View: {{ debugValues['sp.job0View'] }}</div>
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


import { initializeState } from '@/modules/core/stateManager.mjs';
import { jobs as jobsData } from '@/static_content/jobs/jobs.mjs';
import * as keyDown from '@/modules/core/keyDownModule.mjs';
import * as sceneContainer from '@/modules/scene/sceneContainerModule.mjs';
import * as viewPort from '@/modules/core/viewPortModule.mjs';
import { cardsController } from '@/modules/scene/CardsController.mjs';
import { resumeListController } from '@/modules/resume/ResumeListController.mjs';
import { initializationManager } from '@/modules/core/initializationManager.mjs';
import * as scenePlane from '@/modules/scene/scenePlaneModule.mjs';
import * as parallax from '@/modules/core/parallaxModule.mjs';
import debugPanel from '@/modules/core/debugPanel.mjs';
import * as autoScroll from '@/modules/animation/autoScrollModule.mjs';
import { selectionManager } from '@/modules/core/selectionManager.mjs';
import { badgeManager } from '@/modules/core/badgeManager.mjs';


import Timeline from '@/modules/components/Timeline.vue';
import ResizeHandle from '@/modules/components/ResizeHandle.vue';
import ResumeContainer from '@/modules/components/ResumeContainer.vue';
import SkillBadges from '@/modules/components/SkillBadges.vue';
import SankeyConnections from '@/modules/components/SankeyConnections.vue';
import BadgeToggle from '@/modules/components/BadgeToggle.vue';


export default {
  name: 'AppContent',
  components: {
    Timeline,
    ResizeHandle,
    ResumeContainer,
    SkillBadges,
    SankeyConnections,
    BadgeToggle,
  },
  async setup() {

    
    // Register lifecycle hooks immediately (before any await statements)
    let handleSceneWidthChanged = null;
    onUnmounted(() => {
      if (handleSceneWidthChanged) {
        window.removeEventListener('scene-width-changed', handleSceneWidthChanged);
      }
      if (debugInterval) {
        clearInterval(debugInterval);
      }
      window.removeEventListener('viewport-changed', updateDebugValues);
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
    onMounted(async () => {
      try {
        window.CONSOLE_LOG_IGNORE('[INIT] AppContent: Starting event-driven initialization');
        
        // Register Timeline as the first component (no dependencies)
        initializationManager.register(
          'Timeline',
          async () => {
            window.CONSOLE_LOG_IGNORE('[INIT] Initializing Timeline');
            initializeTimeline(jobsData);
          },
          [], // No dependencies
          { priority: 'high' }
        );

        // Register StateManager as a component with no dependencies
        initializationManager.register(
          'StateManager',
          initializeState, // The function to run
          [], // No dependencies
          { priority: 'highest' } // Ensure state is loaded first
        );

        // Register BadgeManager with its dependency on StateManager
        initializationManager.register(
          'BadgeManager',
          () => badgeManager.initialize(), // The function to run
          ['StateManager'], // Depends on StateManager
          { priority: 'high' }
        );

        // Register LayoutToggle with its dependencies on StateManager
        initializationManager.register(
          'LayoutToggle',
          () => {
            window.CONSOLE_LOG_IGNORE('[INIT] Initializing LayoutToggle');
            layoutToggle = useLayoutToggle(); // Initialize and store the composable
            return layoutToggle;
          },
          ['StateManager'], // Depends on StateManager being ready first
          { priority: 'high' }
        );
        
        // Register all controllers with their dependencies
        cardsController.registerForInitialization();
        resumeListController.registerForInitialization();
        
        // Register DebugPanel with its dependencies
        debugPanel.registerForInitialization(initializationManager);
        
        
        // Register other components that depend on controllers
        initializationManager.register(
          'Viewport',
          async () => {
            window.CONSOLE_LOG_IGNORE('[INIT] Initializing Viewport systems');
            initializationManager.waitForComponents(['CardsController', 'ResumeListController']);
            viewport.initialize();
            await viewPort.initialize();
          },
          ['CardsController', 'ResumeListController'],
          { priority: 'medium' }
        );
        
        initializationManager.register(
          'Layout',
          async () => {
            window.CONSOLE_LOG_IGNORE('[INIT] Initializing Layout systems');
            initializationManager.waitForComponents(['Viewport', 'LayoutToggle']);
            resizeHandle.initializeResizeHandleState(viewport, bullsEye);
            const { applyInitialLayout } = resizeHandle;
            applyInitialLayout();
          },
          ['Viewport', 'LayoutToggle'],
          { priority: 'medium' }
        );
        
        initializationManager.register(
          'ReactiveSystems',
          async () => {
            window.CONSOLE_LOG_IGNORE('[INIT] Initializing Reactive systems');
            initializationManager.waitForComponent('Viewport');
            bullsEye.initialize();
            aimPoint.initialize();
            focalPoint.initialize();
          },
          ['Viewport'],
          { priority: 'medium' }
        );
        
        initializationManager.register(
          'SceneSystems',
          async () => {
            window.CONSOLE_LOG_IGNORE('[INIT] Initializing Scene systems');
            initializationManager.waitForComponents(['Viewport', 'Layout']);
            await sceneContainer.initialize();
            autoScroll.initialize();
            await scenePlane.initialize();
            parallax.initialize(focalPoint);
          },
          ['Viewport', 'Layout'],
          { priority: 'low' }
        );
        
        // Register SkillBadges component - needs CardsController and ColorPalette ready
        initializationManager.register(
          'SkillBadges',
          async () => {
            window.CONSOLE_LOG_IGNORE('[INIT] Initializing SkillBadges');
            // Wait for both CardsController and color palette to be ready
            initializationManager.waitForComponents(['CardsController']);
            colorPalette.readyPromise; // Wait for color palette to load
            
            // Dispatch event to trigger SkillBadges initialization
            window.dispatchEvent(new CustomEvent('skill-badges-init-ready'));
          },
          ['CardsController'],
          { priority: 'low' }
        );
        
        // Register ConnectionLines component - needs CardsController and SkillBadges
        initializationManager.register(
          'ConnectionLines',
          async () => {
            window.CONSOLE_LOG_IGNORE('[INIT] Initializing ConnectionLines');
            initializationManager.waitForComponents(['CardsController', 'SkillBadges']);
            
            // Dispatch event to trigger ConnectionLines initialization
            window.dispatchEvent(new CustomEvent('connection-lines-init-ready'));
          },
          ['CardsController', 'SkillBadges'],
          { priority: 'low' }
        );
        
        // Wait for all components to be ready
        initializationManager.waitForComponents([
          'StateManager',
          'BadgeManager',
          'LayoutToggle',
          'Timeline',
          'CardsController', 
          'ResumeItemsController', 
          'ResumeListController',
          'Viewport',
          'Layout',
          'ReactiveSystems',
          'SceneSystems',
          'SkillBadges',
          'ConnectionLines'
        ]);
        
        window.CONSOLE_LOG_IGNORE('[INIT] AppContent: All components initialized successfully');
        
        // Ensure scene components are properly initialized after initial load
        setTimeout(() => {
          window.CONSOLE_LOG_IGNORE('[INIT] Triggering post-init scene refresh');
          reinitializeSceneComponents();
        }, 200);
        
        // Expose controllers and modules for testing and inter-module communication
        window.cardsController = cardsController;
        window.resumeListController = resumeListController;
        window.viewPortModule = viewPort;
        
        // Expose reactive composables for debug panel
        window.bullsEye = bullsEye;
        window.focalPoint = focalPoint;
        window.aimPoint = aimPoint;
        
        // Add a listener to handle rDiv height changes when badge stats are toggled
        badgeManager.addEventListener('badgeModeChanged', () => {
          window.CONSOLE_LOG_IGNORE('[AppContent] Badge mode changed, triggering resume list height recalculation.');
          if (window.resumeListController && window.resumeListController.infiniteScroller) {
            // Use the existing handleResize logic as it's robust.
            // It debounces, recalculates all heights, and restores the scroll position.
            window.resumeListController.infiniteScroller.handleResize();
          }
        });

        // Set up debug interval after everything is initialized
        debugInterval = setInterval(() => {
          updateDebugValues();
          // Also trigger viewport border update
          viewportBorderTrigger.value++;
        }, 100);
        
        // Also update debug values when viewport changes
        window.addEventListener('viewport-changed', updateDebugValues);
        
        // Force viewport border to update on viewport changes
        window.addEventListener('viewport-changed', () => {
          // Force reactivity by updating the trigger
          viewportBorderTrigger.value++;
        });
        
        // Add global functions for debugging initialization
        window.checkInitializationStatus = () => {
          window.CONSOLE_LOG_IGNORE('[INIT] Current initialization status:');
          console.table(initializationManager.getStatus());
        };
        
        window.showDependencyGraph = () => {
          window.CONSOLE_LOG_IGNORE('[INIT] Dependency graph:');
          window.CONSOLE_LOG_IGNORE(initializationManager.getDependencyGraph());
        };
        
        window.validateDependencies = () => {
          const result = initializationManager.validateDependencies();
          window.CONSOLE_LOG_IGNORE('[INIT] Dependency validation:');
          if (result.isValid) {
            window.CONSOLE_LOG_IGNORE('✅ Dependency graph is valid');
          } else {
            console.error('❌ Dependency graph has errors:', result.errors);
          }
          if (result.warnings.length > 0) {
            console.warn('⚠️ Warnings:', result.warnings);
          }
          return result;
        };
        
        
        window.CONSOLE_LOG_IGNORE('[INIT] Added window.checkInitializationStatus(), window.showDependencyGraph(), and window.validateDependencies() for debugging');
        
        // Add scene reinitialization handler for layout changes
        window.addEventListener('scene-reinitialize-needed', (event) => {
          window.CONSOLE_LOG_IGNORE('[SCENE] Scene reinitialization requested:', event.detail);
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
          window.CONSOLE_LOG_IGNORE('[SCENE] Scene force update requested:', event.detail);
          setTimeout(() => {
            forceSceneUpdate();
          }, 100);
        });
        
        // Add handler for scene refresh events
        window.addEventListener('scene-refresh-needed', (event) => {
          window.CONSOLE_LOG_IGNORE('[SCENE] Scene refresh requested');
          // Trigger viewport update to ensure everything is properly positioned
          if (viewPort && viewPort.isInitialized()) {
            viewPort.updateViewPort();
          }
        });
        
        // Add handler for page refresh to ensure scene initialization
        window.addEventListener('load', () => {
          window.CONSOLE_LOG_IGNORE('[SCENE] Page loaded, ensuring scene initialization');
          setTimeout(() => {
            reinitializeSceneComponents();
          }, 500); // Give time for all components to mount
        });
        
      } catch (error) {
        console.error("AppContent: Error in event-driven initialization:", error);
      }
    });
    
    // Wait for everything to be ready before any initialization
    
    // Load color palettes
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
      
      if (!viewPort || !viewPort.isInitialized()) {
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

    // Debug values for live display - now using the debug panel component
    const debugValues = ref({
      'sp.job0': 'N/A',      // Job 0 scene coordinates relative to scene plane
      'sp.job0View': 'N/A'   // Job 0 view coordinates relative to scene plane
    });

    // Force viewport border reactivity
    const viewportBorderTrigger = ref(0);

    // Function to update debug values using the debug panel component
    const updateDebugValues = () => {
      try {
        if (debugPanel.isReady()) {
          // Get all values from the debug panel
          const values = debugPanel.getAllDebugValues();
          
          // Update the reactive debugValues with the panel values
          Object.assign(debugValues.value, values);
          
          // Update job 0 scene rectangle (keep existing logic for this)
          const cardElement = document.querySelector('[data-job-number="0"]');
          if (cardElement) {
            const sceneLeft = parseFloat(cardElement.getAttribute('data-sceneLeft') || '0');
            const sceneTop = parseFloat(cardElement.getAttribute('data-sceneTop') || '0');
            const sceneRight = parseFloat(cardElement.getAttribute('data-sceneRight') || '0');
            const sceneBottom = parseFloat(cardElement.getAttribute('data-sceneBottom') || '0');
            const sceneWidth = sceneRight - sceneLeft;
            const sceneCenterX = sceneLeft + (sceneWidth / 2);
            
            debugValues.value['sp.job0'] = `T:${sceneTop.toFixed(0)} L:${sceneLeft.toFixed(0)} R:${sceneRight.toFixed(0)} B:${sceneBottom.toFixed(0)} Cx:${sceneCenterX.toFixed(0)}`;
            
            // View rectangle - check if job 0 is selected and show clone position
            let targetElement = cardElement;
            let displayLabel = 'viewJob0';
            
            // Check if job 0 is selected (has a clone)
            if (cardElement.classList.contains('hasClone')) {
              // Find the clone element (has "clone" in its id)
              const cloneElement = document.querySelector(`[id*="clone"][data-job-number="0"]`);
              if (cloneElement) {
                targetElement = cloneElement;
                displayLabel = 'viewJob0-clone';
              }
            }
            
            const sceneContainer = document.getElementById('scene-container');
            if (sceneContainer) {
              const sceneRect = sceneContainer.getBoundingClientRect();
              const cardRect = targetElement.getBoundingClientRect();
              
              // Convert screen coordinates to scene-relative coordinates
              const viewLeft = cardRect.left - sceneRect.left;
              const viewTop = cardRect.top - sceneRect.top;
              const viewWidth = cardRect.width;
              const viewHeight = cardRect.height;
              
              const viewRight = viewLeft + viewWidth;
              const viewBottom = viewTop + viewHeight;
              const viewCenterX = viewLeft + (viewWidth / 2);
              
              debugValues.value['sp.job0View'] = `${displayLabel}: T:${viewTop.toFixed(0)} L:${viewLeft.toFixed(0)} R:${viewRight.toFixed(0)} B:${viewBottom.toFixed(0)} Cx:${viewCenterX.toFixed(0)}`;
            } else {
              debugValues.value['sp.job0'] = 'NoSC';
              debugValues.value['sp.job0View'] = 'NoSC';
            }
          } else {
            debugValues.value['sp.job0'] = 'NoJ0';
            debugValues.value['sp.job0View'] = 'NoJ0';
          }
        } else {
          // Debug panel not ready yet
          debugValues.value['sp.job0'] = 'LOADING';
          debugValues.value['sp.job0View'] = 'LOADING';
        }
      } catch (error) {
        // Set error values for all debug fields
        debugValues.value['sp.job0'] = 'ERR';
        debugValues.value['sp.job0View'] = 'ERR';
      }
    };

    // Update debug values reactively
    watchEffect(() => {
      updateDebugValues();
    });

    // Also update periodically - set up in onMounted callback within the main onMounted
    let debugInterval;

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
    
    // Function to reinitialize scene components after layout changes
    const reinitializeSceneComponents = async () => {
      try {
        // PHASE 1: Wait for DOM and CSS transitions to stabilize
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // PHASE 2: Force layout recalculation and viewport update (CRITICAL FIRST STEP)
        const sceneContainerElement = document.getElementById('scene-container');
        if (sceneContainerElement && viewPort.isInitialized()) {
          // Force layout recalculation
          void sceneContainerElement.offsetHeight;
          
          // Update viewport with new scene container position
          viewPort.updateViewPort();
          
          // Critical wait for viewport changes to propagate
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // PHASE 3: BullsEye recentering (depends on viewport)
        if (bullsEye.isInitialized()) {
          bullsEye.recenterBullsEye();
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // PHASE 4: AimPoint update (depends on BullsEye)
        if (aimPoint) {
          aimPoint.initialize();
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // PHASE 5: Focal Point animation (depends on AimPoint)
        if (focalPoint.value) {
          focalPoint.initialize();
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // PHASE 6: Scene container updates
        if (sceneContainer.isInitialized && sceneContainer.isInitialized()) {
          sceneContainer.updateSceneContainer();
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        
        // PHASE 7: Timeline realignment (depends on layout orientation)
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('timeline-realign-needed'));
        }, 50);
        
        // PHASE 8: Card repositioning (CRITICAL for layout changes)
        if (window.cardsController && window.cardsController.originalJobsData) {
          try {
            // Force recalculation of all card positions
            window.cardsController.bizCardDivs.forEach(card => {
              const jobNumber = card.getAttribute('data-job-number');
              const job = window.cardsController.originalJobsData.find(j => j.jobNumber === parseInt(jobNumber));
              if (job) {
                window.cardsController._setBizCardDivSceneGeometry(card, job);
              }
            });
          } catch (error) {
            console.error('[SCENE] Error repositioning cards:', error);
          }
        }
        
        // PHASE 9: Final scene refresh
        window.dispatchEvent(new CustomEvent('scene-refresh-needed'));
        
      } catch (error) {
        console.error('[SCENE] ❌ Error during scene reinitialization:', error);
      }
    };
    
    // Function to force scene update after layout changes are complete
    const forceSceneUpdate = async () => {
      try {
        window.CONSOLE_LOG_IGNORE('[SCENE] Force scene update started');
        
        // Force viewport recalculation
        if (viewPort && viewPort.isInitialized()) {
          viewPort.updateViewPort();
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // Force bullsEye recentering with viewport awareness
        if (bullsEye && bullsEye.isInitialized()) {
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
        
        window.CONSOLE_LOG_IGNORE('[SCENE] Force scene update completed');
      } catch (error) {
        console.error('[SCENE] ❌ Error during force scene update:', error);
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
      debugValues
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
  top: 20px;
  z-index: 1000;
  background-color: rgba(0, 0, 0, 0.8);
  color: #00ff00;
  font-family: 'Courier New', monospace;
  font-size: 12px;
  padding: 8px;
  border-radius: 4px;
  line-height: 1.2;
  pointer-events: none;
  user-select: none;
  white-space: nowrap;
}

/* Scene-left: debug display to the right of timeline */
#live-debug-display.debug-left {
  left: 200px;
}

/* Scene-right: debug display to the left of timeline */
#live-debug-display.debug-right {
  right: 200px;
}

.debug-line {
  margin: 2px 0;
}

</style> 