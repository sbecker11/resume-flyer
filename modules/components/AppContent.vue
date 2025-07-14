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
  </div>
</template>

<script>
import { ref, computed, onMounted, onUnmounted } from 'vue';
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
import { resumeItemsController } from '@/modules/scene/ResumeItemsController.mjs';
import { resumeListController } from '@/modules/resume/ResumeListController.mjs';
import { initializationManager } from '@/modules/core/initializationManager.mjs';
import * as scenePlane from '@/modules/scene/scenePlaneModule.mjs';
import * as parallax from '@/modules/core/parallaxModule.mjs';
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
    });
    
    // Initialize reactive composables immediately (before any await statements)
    // This ensures Vue lifecycle hooks are registered in the correct component context
    const viewport = useViewport('AppContent');
    const bullsEye = useBullsEye(viewport);
    const aimPoint = useAimPoint(viewport);
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
        resumeItemsController.registerForInitialization();
        resumeListController.registerForInitialization();
        
        // Register other components that depend on controllers
        initializationManager.register(
          'Viewport',
          async () => {
            window.CONSOLE_LOG_IGNORE('[INIT] Initializing Viewport systems');
            initializationManager.waitForComponents(['CardsController', 'ResumeListController']);
            viewport.initialize();
            viewPort.initialize();
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
            sceneContainer.initialize();
            autoScroll.initialize();
            scenePlane.initialize();
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
        
        // Expose controllers for testing
        window.cardsController = cardsController;
        window.resumeListController = resumeListController;
        
        // Add a listener to handle rDiv height changes when badge stats are toggled
        badgeManager.addEventListener('badgeModeChanged', () => {
          window.CONSOLE_LOG_IGNORE('[AppContent] Badge mode changed, triggering resume list height recalculation.');
          if (window.resumeListController && window.resumeListController.infiniteScroller) {
            // Use the existing handleResize logic as it's robust.
            // It debounces, recalculates all heights, and restores the scroll position.
            window.resumeListController.infiniteScroller.handleResize();
          }
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
      console.log(`ACTUAL orientation.value: "${orientation.value}"`);
      console.log(`layout: ${orientation.value}`);
      console.log(`timeline: move to ${alignment}`);
      return alignment;
    });

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
    

    
    return {
      focalPoint,
      viewport,
      focalPointStyle,
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
      scenePercentage: resizeHandle.percentage
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
</style> 