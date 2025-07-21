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
        'useColorPalette',
        'useViewport',
        'useBullsEye',
        'useAimPoint',
        'useFocalPoint',
        'useResizeHandle',
        'useLayoutToggle',
        'useTimeline',
        'useStateManager',
        'useBadgeManager',
        'useCardsController',
        'useResumeListController',
        'useSceneContainer',
        'useScenePlane',
        'useSceneViewer',
        'useResumeViewer',
        'useViewport',
      ];
    },

    async initializeWithDependencies() {
      // Initialize with dependencies
      onUnmounted(() => {
        this.cleanupDependencies();
      });
    },

    cleanupDependencies() {
      // Event listeners are cleaned up in the setup() onUnmounted hook
    }
  },

  async setup() {


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
    onMounted(async () => {
      // Component mounted
      
      // Scene container initialization
      
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
        
        // Register Timeline as the first component (no dependencies)
        initializationManager.register(
          'Timeline',
          async () => {
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
            layoutToggle = useLayoutToggle();
            return layoutToggle;
          },
          ['StateManager'],
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
            // Wait for both CardsController and color palette to be ready
            initializationManager.waitForComponents(['CardsController']);
            colorPalette.readyPromise;
            
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
            console.log('[INIT] Initializing ConnectionLines');
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
        
        // All components initialized successfully
        
        // Scene container post-initialization check complete
        
        // Ensure scene components are properly initialized after initial load
        setTimeout(() => {
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
        

        // Set up debug interval after everything is initialized
        debugInterval = setInterval(() => {
          updateDebugValues();
          // Also trigger viewport border update
          viewportBorderTrigger.value++;
        }, 100);
        
        // Also update debug values when viewport changes
        window.addEventListener('viewport-changed', updateDebugValues);
        
        // Listen for badge mode changes to control debug panel visibility
        handleBadgeModeChanged = (event) => {
          badgeMode.value = event.detail.mode;
          // Badge mode changed
        };
        badgeManager.addEventListener('badgeModeChanged', handleBadgeModeChanged);
        
        // Initialize badge mode with current state
        badgeMode.value = badgeManager.getMode();
        
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
          console.log(initializationManager.getDependencyGraph());
        };
        
        window.validateDependencies = () => {
          const result = initializationManager.validateDependencies();
          if (result.isValid) {
            console.log('Dependency graph is valid');
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
          if (viewPort && viewPort.isInitialized()) {
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

    // Badge mode state for hiding debug panel when badges are disabled
    const badgeMode = ref('no-badges');

    // Force viewport border reactivity
    const viewportBorderTrigger = ref(0);

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
      // console.log('[Debug] Drag started at:', { x: event.clientX, y: event.clientY, dragStartPoint });
    };

    const handleDebugPanelDrag = (event) => {
      if (!isDragging) return;
      
      event.preventDefault();
      event.stopPropagation();

      // Calculate transform from current point position - start drag position
      const deltaX = event.clientX - dragStartPoint.x;
      const deltaY = event.clientY - dragStartPoint.y;
      
      // console.log(`[Debug] Dragging:`, { currentMouse: { x: event.clientX, y: event.clientY }, dragStartPoint, deltaX, deltaY });
      
      const currentOrientation = appContainerClass.value;
      
      // Debug logging disabled - uncomment to enable
      // const mouseDeltaFromLastLog = Math.abs(event.clientX - lastLoggedMouse.x) + Math.abs(event.clientY - lastLoggedMouse.y);
      // if (mouseDeltaFromLastLog > MOUSE_EPSILON) {
      //   console.log('[Debug] Drag delta:', { 
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
        // console.log('[Debug] Final position applied:', { constrainedLeft, constrainedTop });
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
        // console.log('[Debug] Drag ended');
        isDragging = false;
        saveDebugPanelPosition();
      }
    };

    // Helper function to set all debug values to a status message
    const setDebugValuesToStatus = (status) => {
      debugValues.value['selectedJobNumber'] = status;
      debugValues.value['cloneCenterY'] = status;
      debugValues.value['categorySummary'] = status;
      debugValues.value['relatedBadgeList'] = [];
    };

    // Function to update debug values using the debug panel component
    const updateDebugValues = () => {
      try {
        // Check all required dependencies before proceeding
        
        // 1. Check if viewport is initialized
        if (!viewPort || !viewPort.isInitialized()) {
          setDebugValuesToStatus('VIEWPORT_NOT_READY');
          return;
        }
        
        // 2. Check if CardsController is ready and has cDivs
        if (!window.cardsController || !window.cardsController.bizCardDivs || window.cardsController.bizCardDivs.length === 0) {
          setDebugValuesToStatus('CARDS_NOT_READY');
          return;
        }
        
        // 3. Check if SelectionManager is ready
        if (!selectionManager) {
          setDebugValuesToStatus('SELECTION_NOT_READY');
          return;
        }
        
        // 4. Check if DebugPanel component is ready
        if (!debugPanel.isReady()) {
          setDebugValuesToStatus('DEBUG_PANEL_NOT_READY');
          return;
        }
        
        // All dependencies ready - proceed with normal update
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
        
        // Update selected job and badge clustering info
        try {
          const selectedJobNumber = selectionManager.getSelectedJobNumber();
          
          if (selectedJobNumber !== null && selectedJobNumber !== undefined) {
            debugValues.value['selectedJobNumber'] = selectedJobNumber;
            
            const selectedCDivClone = document.getElementById(`biz-card-div-${selectedJobNumber}-clone`);
            
            if (selectedCDivClone) {
              // Get clone position using data attributes (more reliable than parallax function) - using camelCase
              const sceneTop = parseFloat(selectedCDivClone.getAttribute('data-sceneTop') || '0');
              const sceneBottom = parseFloat(selectedCDivClone.getAttribute('data-sceneBottom') || '0');
              
              // Debug: log all available data attributes on the clone (disabled to prevent loop)
              // console.log('[Debug] cDiv clone attributes for job', selectedJobNumber, ':', {
              //   id: selectedCDivClone.id,
              //   attributes: Array.from(selectedCDivClone.attributes).filter(attr => attr.name.startsWith('data-')).map(attr => ({ name: attr.name, value: attr.value }))
              // });
              
              if (isNaN(sceneTop) || isNaN(sceneBottom) || sceneTop === sceneBottom) {
                debugValues.value['cloneCenterY'] = `NO_SCENE_DATA (top=${sceneTop}, bottom=${sceneBottom})`;
                return;
              }
              
              const cloneCenterY = (sceneTop + sceneBottom) / 2;
              
              // Calculate clone's bucket number using BadgePositioner's exact calculation
              const badgeHeight = 30; // Match BadgePositioner constructor default  
              const badgeMargin = 10; // Match BadgePositioner constructor default
              const bucketSpacing = badgeHeight + badgeMargin; // Should be 40px
              
              // Use the same bucket calculation as BadgePositioner: ci = floor((centerY-0)/40) 
              const SCENE_START = 0; // Current buckets start at 0, not 50
              const bucketIndex = Math.floor((cloneCenterY - SCENE_START) / bucketSpacing);
              
              debugValues.value['cloneCenterY'] = `cDiv.centerY:${cloneCenterY.toFixed(1)} at bucket:${bucketIndex}`;
              
              // Find selected badges (badges that match this job)
              const allBadges = document.querySelectorAll('.skill-badge');
              const selectedBadges = Array.from(allBadges).filter(badge => {
                const jobNumbers = badge.getAttribute('data-job-numbers');
                if (jobNumbers) {
                  try {
                    const jobNumbersArray = JSON.parse(jobNumbers);
                    return jobNumbersArray.includes(selectedJobNumber);
                  } catch (e) {
                    return false;
                  }
                }
                return false;
              });
              
              // Create focused list for related badges only with ABOVE/LEVEL/BELOW categorization  
              const cloneTop = sceneTop;
              const cloneBottom = sceneBottom;
              
              // Check if we have real badge order data from BadgePositioner
              const badgeOrderData = debugValues.value['badgeOrderData'];
              
              const relatedBadgeList = selectedBadges.map(badge => {
                // Use scene coordinate from badge's positioned style.top, not viewport coordinates
                const badgeTop = parseFloat(badge.style.top || '0');
                const badgeHeight = 30; // Match BadgePositioner badge height
                const centerY = badgeTop + (badgeHeight / 2);
                
                let category;
                if (centerY < cloneTop) {
                  category = 'ABOVE';
                } else if (centerY > cloneBottom) {
                  category = 'BELOW';
                } else {
                  category = 'LEVEL';
                }
                
                // Try to get real bucket number from BadgePositioner data
                let bucketNumber = 0;
                if (badgeOrderData && Array.isArray(badgeOrderData)) {
                  const badgeData = badgeOrderData.find(b => b.id === badge.id);
                  if (badgeData && badgeData.bucketNumber !== undefined) {
                    bucketNumber = badgeData.bucketNumber;
                  } else {
                    // Fallback: calculate from position (shouldn't happen with new system)
                    const badgeSpacing = 40; // Badge height + margin
                    bucketNumber = Math.round((centerY - cloneCenterY) / badgeSpacing);
                  }
                } else {
                  // Fallback: calculate from position
                  const badgeSpacing = 40; // Badge height + margin  
                  bucketNumber = Math.round((centerY - cloneCenterY) / badgeSpacing);
                }
                
                return {
                  id: badge.id,
                  y: centerY.toFixed(1),
                  category: category,
                  centerY: centerY,
                  distanceToClone: Math.abs(centerY - cloneCenterY),
                  bucketNumber: bucketNumber
                };
              });
              
              // Find the closest badge to clone center
              const closestBadge = relatedBadgeList.length > 0 ? relatedBadgeList.reduce((closest, badge) => 
                badge.distanceToClone < closest.distanceToClone ? badge : closest
              ) : null;
              
              // Add bracket formatting with bucket numbers and skill names
              relatedBadgeList.forEach(badge => {
                // Get the skill name from the DOM element
                const badgeElement = document.getElementById(badge.id);
                const skillName = badgeElement ? badgeElement.textContent : 'unknown';
                
                if (closestBadge && badge.id === closestBadge.id) {
                  // Double brackets for closest: [[35] skill text centerY:123.5
                  badge.displayText = `[[${badge.bucketNumber}] ${skillName} centerY:${badge.centerY.toFixed(1)}`;
                } else {
                  // Single brackets for selected: [LEVEL 36] skill text centerY:123.5
                  badge.displayText = `[${badge.category} ${badge.bucketNumber}] ${skillName} centerY:${badge.centerY.toFixed(1)}`;
                }
              });
              
              debugValues.value['relatedBadgeList'] = relatedBadgeList;
              
              // Calculate category summary
              const aboveCount = relatedBadgeList.filter(b => b.category === 'ABOVE').length;
              const levelCount = relatedBadgeList.filter(b => b.category === 'LEVEL').length;
              const belowCount = relatedBadgeList.filter(b => b.category === 'BELOW').length;
              debugValues.value['categorySummary'] = `ABOVE: ${aboveCount}  LEVEL: ${levelCount}  BELOW: ${belowCount}`;
              
              if (selectedBadges.length > 0) {
                const badgeCenterYs = selectedBadges.map(badge => {
                  const rect = badge.getBoundingClientRect();
                  return rect.top + rect.height / 2;
                });
                const avgBadgeY = badgeCenterYs.reduce((sum, y) => sum + y, 0) / badgeCenterYs.length;
                const offset = avgBadgeY - cloneCenterY; // Positive = below clone, Negative = above clone
                const distance = Math.abs(offset);
                
                debugValues.value['badgeOffset'] = (offset >= 0 ? '+' : '') + offset.toFixed(1) + 'px';
                debugValues.value['clusterDistance'] = distance.toFixed(1) + 'px';
              } else {
                debugValues.value['badgeOffset'] = 'N/A';
                debugValues.value['clusterDistance'] = 'N/A';
              }
            } else {
              debugValues.value['cloneCenterY'] = 'NO CLONE';
              debugValues.value['categorySummary'] = 'NO CLONE';
              debugValues.value['relatedBadgeList'] = [];
            }
          } else {
            debugValues.value['selectedJobNumber'] = 'NONE';
            debugValues.value['cloneCenterY'] = 'NONE';
            debugValues.value['categorySummary'] = 'NONE';
            debugValues.value['relatedBadgeList'] = [];
          }
        } catch (error) {
          debugValues.value['selectedJobNumber'] = 'ERR';
          debugValues.value['cloneCenterY'] = 'ERR';
          debugValues.value['categorySummary'] = 'ERR';
          debugValues.value['relatedBadgeList'] = [];
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
        console.error('Error during scene reinitialization:', error);
      }
    };
    
    // Function to force scene update after layout changes are complete
    const forceSceneUpdate = async () => {
      try {
        // Force scene update started
        
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
  /* Position set by debugPanelStyle computed property */
}

#live-debug-display.debug-right {
  /* Position set by debugPanelStyle computed property */
}

.debug-line {
  margin: 2px 0;
}

</style> 