<template>
  <div 
    id="new-connection-lines-container"
    :style="containerStyle"
    class="new-connection-lines"
  >
    <svg 
      id="new-connection-lines-svg"
      :style="svgStyle"
    >
      <path
        v-for="connection in connections"
        :key="connection.id"
        :d="connection.path"
        :stroke="connection.strokeColor"
        :stroke-width="connection.strokeWidth"
        stroke-opacity="0.8"
        fill="none"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="connection-line"
      />
      <text
        v-for="connection in connections"
        :key="`text-${connection.id}`"
        :x="connection.textX"
        :y="connection.textY"
        :fill="connection.strokeColor"
        font-family="Arial, sans-serif"
        font-size="12"
        font-weight="bold"
        text-anchor="middle"
        class="connection-number"
      >
        {{ connection.lineNumber }}
      </text>
    </svg>
    
    <!-- Debug info -->
    <div 
      v-if="showDebugInfo"
      :style="debugStyle"
      class="debug-info"
    >
      <div><strong>New Connection Lines ({{ connections.length }})</strong></div>
      <div v-for="(conn, index) in connections" :key="conn.id">
        <div>Badge {{ index + 1 }}: {{ conn.case }} - {{ conn.skillText }}</div>
        <div style="font-size: 10px; color: #ccc;">{{ conn.path }}</div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted, onUnmounted, nextTick, getCurrentInstance } from 'vue';
import { badgeManager } from '@/modules/core/badgeManager.mjs';
import { applyPaletteToElement } from '../composables/useColorPalette.mjs';
import { eventBus } from '@/modules/utils/eventBus.mjs';
import { AppState } from '@/modules/core/stateManager.mjs';
import { BaseVueComponentMixin } from '@/modules/core/abstracts/BaseComponent.mjs';
import { initializationManager } from '@/modules/core/initializationManager.mjs';

export default {
  name: 'ConnectionLines',
  mixins: [BaseVueComponentMixin],
  methods: {
    getComponentDependencies() {
      console.log('[ConnectionLines] getComponentDependencies() called');
      return ['BadgeManager', 'SceneContainer', 'StateManager'];
    },
    initialize(dependencies) {
      console.log('ConnectionLines: Initialized with dependencies:', Object.keys(dependencies));
      console.log('ConnectionLines: SceneContainer dependency:', dependencies.SceneContainer);
      this.badgeManager = dependencies.BadgeManager;
      this.sceneContainer = dependencies.SceneContainer;
      this.stateManager = dependencies.StateManager;
      // StateManager dependency ensures AppState is ready before component initialization
      // Bridge to composition API - store dependency for later use
      this._sceneContainerDependency = dependencies.SceneContainer;
      
      // Note: Service registry approach is used instead of direct bridge
      
      if (!dependencies.SceneContainer) {
        console.error('ConnectionLines: SceneContainer dependency is null/undefined!');
      } else {
        console.log('ConnectionLines: SceneContainer dependency successfully set!');
      }
    },

    /**
     * Template ref injection for app-container element
     * Replaces getElementById('app-container') calls
     * @param {HTMLElement} element - The DOM element from template ref
     */
    setAppContainerElement(element) {
      this.appcontainerElement = element;
      console.log('[ConnectionLines.vue] app-container element set via template ref');
      
      // Apply any setup that was waiting for this element
      if (this.appcontainerElement) {
        this._setupAppContainer();
      }
    },

    /**
     * Setup logic for app-container element
     * Called when element becomes available
     */
    _setupAppContainer() {
      // Add any element-specific setup logic here
      // This replaces the immediate DOM access from initialize()
    },

    /**
     * DOM setup phase - called after Vue DOM is ready
     * Moved DOM event listeners from onMounted for proper DOM separation
     */
    async setupDom() {
      // DOM event listeners moved from onMounted hook
      window.addEventListener('badges-positioned', this.handleBadgesPositioned);
      window.addEventListener('card-select', this.handleCardSelect);
      window.addEventListener('card-deselect', this.handleCardDeselect);
      window.addEventListener('viewport-changed', this.handleViewportResize);
      window.addEventListener('resize', this.handleViewportResize);
      
      // Badge manager event listeners
      if (this.badgeManager) {
        this.badgeManager.addEventListener('badgeModeChanged', this.handleBadgeModeChange);
      }
      
      console.log('[ConnectionLines.vue] DOM setup complete');
    },

    // Bridge methods to connect options API to composition API event handlers
    handleBadgesPositioned(event) {
      if (this.setupHandlers && this.setupHandlers.handleBadgesPositioned) {
        this.setupHandlers.handleBadgesPositioned(event);
      }
    },
    
    handleCardSelect(event) {
      if (this.setupHandlers && this.setupHandlers.handleCardSelect) {
        this.setupHandlers.handleCardSelect(event);
      }
    },
    
    handleCardDeselect(event) {
      if (this.setupHandlers && this.setupHandlers.handleCardDeselect) {
        this.setupHandlers.handleCardDeselect(event);
      }
    },
    
    handleViewportResize(event) {
      if (this.setupHandlers && this.setupHandlers.handleViewportResize) {
        this.setupHandlers.handleViewportResize(event);
      }
    },
    
    handleBadgeModeChange(event) {
      if (this.setupHandlers && this.setupHandlers.handleBadgeModeChange) {
        this.setupHandlers.handleBadgeModeChange(event);
      }
    },

    cleanupDependencies() {
      console.log('ConnectionLines: Cleaning up dependencies');
      
      // Clean up DOM event listeners
      window.removeEventListener('badges-positioned', this.handleBadgesPositioned);
      window.removeEventListener('card-select', this.handleCardSelect);
      window.removeEventListener('card-deselect', this.handleCardDeselect);
      window.removeEventListener('viewport-changed', this.handleViewportResize);
      window.removeEventListener('resize', this.handleViewportResize);
      
      if (this.badgeManager) {
        this.badgeManager.removeEventListener('badgeModeChanged', this.handleBadgeModeChange);
      }
    }
  },
  setup(props, { expose }) {
    const connections = ref([]);
    const showDebugInfo = ref(false);
    const isConnectionLinesVisible = ref(badgeManager.isConnectionLinesVisible());
    const sceneContainerRef = ref(null); // Will be set by IM dependency injection
    
    // Get current component instance to access _sceneContainerDependency
    const instance = getCurrentInstance();
    
    // Note: Using service registry approach instead of Options API bridge
    
    onMounted(() => {
      // Vue components mount before IM system initializes them
      // Dependencies will be set later when IM calls initialize()
      console.log('[ConnectionLines] Vue component mounted, waiting for IM initialization');
    });
    
    // Watch for when IM system sets the dependency
    const checkForDependency = () => {
      if (instance?.ctx?._sceneContainerDependency && !sceneContainerRef.value) {
        sceneContainerRef.value = instance.ctx._sceneContainerDependency;
        console.log('[ConnectionLines] SceneContainer retrieved from IM dependency injection');
      }
    };
    
    // Check periodically until dependency is available
    const dependencyChecker = setInterval(checkForDependency, 100);
    
    // Clean up interval when component unmounts
    onUnmounted(() => {
      clearInterval(dependencyChecker);
    });

    const shouldShowContainer = computed(() => connections.value.length > 0 && isConnectionLinesVisible.value);

    const containerStyle = computed(() => ({
      position: 'absolute',
      top: '0', left: '0', right: '0', bottom: '0',
      pointerEvents: 'none',
      zIndex: AppState?.constants?.zIndex?.bullsEye ?? 95
    }));
    const svgStyle = computed(() => ({
      position: 'absolute',
      top: '0', left: '0', right: '0', bottom: '0',
      pointerEvents: 'none',
      overflow: 'visible',
      zIndex: AppState?.constants?.zIndex?.bullsEye ?? 95
    }));
    const debugStyle = computed(() => ({
      position: 'absolute',
      top: '10px', right: '10px',
      background: 'rgba(0, 0, 0, 0.8)',
      color: 'white',
      padding: '10px',
      borderRadius: '5px',
      fontSize: '12px',
      fontFamily: 'monospace',
      pointerEvents: 'auto',
      zIndex: '101',
      minWidth: '200px'
    }));

    function getElementPosition(element) {
      if (!element) throw new Error('[ConnectionLines] Element is null or undefined');
      // Use SceneContainer dependency - get the actual DOM element
      let sceneContent;
      if (sceneContainerRef.value?.getSceneContainer) {
        sceneContent = sceneContainerRef.value.getSceneContainer();
      } else if (sceneContainerRef.value?.$el) {
        sceneContent = sceneContainerRef.value.$el;
      } else {
        sceneContent = sceneContainerRef.value;
      }
      if (!sceneContent) {
        throw new Error('[ConnectionLines] CRITICAL: scene-content element not found via dependency - IM system failure');
      }
      const elementRect = element.getBoundingClientRect();
      const sceneRect = sceneContent.getBoundingClientRect();
      const scrollTop = sceneContent.scrollTop;
      const scrollLeft = sceneContent.scrollLeft;
      return {
        x: elementRect.left - sceneRect.left + scrollLeft,
        y: elementRect.top - sceneRect.top + scrollTop,
        width: elementRect.width,
        height: elementRect.height
      };
    }

    function getViewportRelativeCDivPosition(cDivClone) {
      if (!cDivClone) throw new Error('[ConnectionLines] cDivClone is null or undefined');
      
      // Use SceneContainer dependency - get the actual DOM element
      let sceneContainer;
      if (sceneContainerRef.value?.getSceneContainer) {
        sceneContainer = sceneContainerRef.value.getSceneContainer();
      } else if (sceneContainerRef.value?.$el) {
        sceneContainer = sceneContainerRef.value.$el;
      } else {
        sceneContainer = sceneContainerRef.value;
      }
      
      if (!sceneContainer) {
        console.error('[ConnectionLines] scene-container not found. sceneContainerRef.value:', sceneContainerRef.value);
        console.error('[ConnectionLines] IM system failure - SceneContainer dependency not available');
        throw new Error('[ConnectionLines] CRITICAL: scene-container not found via dependency - IM system failure');
      }
      
      // Get scene-relative coordinates from data attributes (using camelCase)
      const sceneLeft = parseFloat(cDivClone.getAttribute('data-sceneLeft') || '0');
      const sceneTop = parseFloat(cDivClone.getAttribute('data-sceneTop') || '0');
      const sceneWidth = parseFloat(cDivClone.getAttribute('data-sceneWidth') || '0');
      const sceneHeight = parseFloat(cDivClone.getAttribute('data-sceneHeight') || '0');
      
      
      // Calculate viewport-relative position: viewX = sceneX + translateX
      // where translateX = sceneContainer.width / 2 (parallax transform)
      const translateX = sceneContainer.clientWidth / 2;
      const viewLeft = sceneLeft + translateX;
      const viewTop = sceneTop; // Y coordinate doesn't change with parallax
      const viewRight = viewLeft + sceneWidth;
      const viewBottom = viewTop + sceneHeight;
      const viewCenterY = viewTop + (sceneHeight / 2);
      
      
      return {
        x: viewLeft,
        y: viewTop,
        width: sceneWidth,
        height: sceneHeight,
        right: viewRight,
        bottom: viewBottom,
        centerY: viewCenterY
      };
    }

    function getBadgeViewportPosition(badgeElement) {
      if (!badgeElement) throw new Error('[ConnectionLines] badgeElement is null or undefined');
      
      // Get badge position from style.top (scene coordinate)
      const sceneY = parseFloat(badgeElement.style.top || '0');
      const badgeHeight = 30; // Standard badge height
      const centerY = sceneY + (badgeHeight / 2);
      
      // Calculate badge width from text content (approximation)
      const text = badgeElement.textContent || '';
      const estimatedWidth = Math.max(60, text.length * 8 + 20); // 8px per char + 20px padding
      
      // Badge X position depends on layout orientation
      const appContainer = this.appcontainerElement;
      const isSceneLeft = appContainer ? appContainer.classList.contains('scene-left') : false;
      
      let centerX;
      if (isSceneLeft) {
        // Scene-left: badges on left side of scene
        centerX = estimatedWidth / 2;
      } else {
        // Scene-right: badges on right side of scene
        // Use SceneContainer dependency - get the actual DOM element
        let sceneContainer;
        if (sceneContainerRef.value?.getSceneContainer) {
          sceneContainer = sceneContainerRef.value.getSceneContainer();
        } else if (sceneContainerRef.value?.$el) {
          sceneContainer = sceneContainerRef.value.$el;
        } else {
          sceneContainer = sceneContainerRef.value;
        }
        const sceneWidth = sceneContainer ? sceneContainer.clientWidth : 800;
        centerX = sceneWidth - (estimatedWidth / 2);
      }
      
      
      return {
        centerX: centerX,
        centerY: centerY,
        width: estimatedWidth,
        height: badgeHeight
      };
    }

    function getComponentDependencies() {
      return [
        'badgeManager',
        'useColorPalette',
        'useResizeHandle'
      ];
    }
    
    function initializeWithDependencies() {
      console.log('[ConnectionLines] initialized with dependencies');
    }


    function createLShapedCurve(pointA, pointB, pointC, radius = 20) {
      const isMovingRight = pointB.x > pointA.x;
      const isMovingDown = pointC.y > pointB.y;
      const arcStartX = isMovingRight ? pointB.x - radius : pointB.x + radius;
      const arcStartY = pointB.y;
      const arcEndX = pointB.x;
      const arcEndY = isMovingDown ? pointB.y + radius : pointB.y - radius;
      return [
        `M ${pointA.x} ${pointA.y}`,
        `H ${arcStartX}`,
        `A ${radius} ${radius} 0 0 ${(isMovingRight && isMovingDown) || (!isMovingRight && !isMovingDown) ? 1 : 0} ${arcEndX} ${arcEndY}`,
        `V ${pointC.y}`
      ].join(' ');
    }

    const badgeOrder = ref([]);

    function handleBadgesPositioned(event) {
      // Only process badge positioning if badges are actually visible
      if (!badgeManager.isBadgesVisible()) {
        return;
      }
      
      console.log('[ConnectionLines] badges-positioned event received!', event.detail);
      if (event.detail && event.detail.badgeOrder) {
        badgeOrder.value = [...event.detail.badgeOrder];
        console.log('[ConnectionLines] Updating connections for', event.detail.badgeOrder.length, 'badges');
        nextTick(() => {
          setTimeout(() => {
            updateConnections();
          }, 50);
        });
      }
    }

    onMounted(() => {
      eventBus.on('badges-positioned', handleBadgesPositioned);
      window.addEventListener('badges-positioned', handleBadgesPositioned);
      window.addEventListener('card-select', handleCardSelect);
      window.addEventListener('card-deselect', handleCardDeselect);
      window.addEventListener('viewport-changed', handleViewportResize);
      window.addEventListener('resize', handleViewportResize);
      badgeManager.addEventListener('badgeModeChanged', handleBadgeModeChange);
      
      // Only request badges if they might be visible
      if (badgeManager.isBadgesVisible()) {
        eventBus.emit('request-badges');
      }
      
      // Fallback attempts to ensure connections are drawn (only if badges are visible)
      if (badgeManager.isBadgesVisible()) {
        setTimeout(() => {
          const selectedCDiv = document.querySelector('.biz-card-div.selected');
          const badgesExist = document.querySelectorAll('.skill-badge').length > 0;
          if (selectedCDiv && badgeManager.isBadgesVisible() && badgesExist) {
            console.log('[ConnectionLines] Fallback: Drawing connections with badges ready');
            updateConnections();
          }
        }, 500);
      }
    });
    onUnmounted(() => {
      eventBus.off('badges-positioned', handleBadgesPositioned);
      window.removeEventListener('badges-positioned', handleBadgesPositioned);
      window.removeEventListener('card-select', handleCardSelect);
      window.removeEventListener('card-deselect', handleCardDeselect);
      window.removeEventListener('viewport-changed', handleViewportResize);
      window.removeEventListener('resize', handleViewportResize);
      badgeManager.removeEventListener('badgeModeChanged', handleBadgeModeChange);
    });

    // Refactor updateConnections to use badgeOrder
    function updateConnections() {
      // Early return if connection lines are not enabled - avoid all logging
      if (!badgeManager.isConnectionLinesVisible()) {
        connections.value = [];
        return;
      }
      
      console.log('🔴🔴🔴 [ConnectionLines] updateConnections() CALLED! 🔴🔴🔴');
      connections.value = [];
      
      // Second check: Are badges visible? (No connection lines without badges)  
      const badgesVisible = badgeManager.isBadgesVisible();
      console.log(`[ConnectionLines] Badge manager state: isBadgesVisible()=${badgesVisible}`);
      
      if (!badgesVisible) {
        console.log(`[ConnectionLines] Badge mode is -B (OFF) - clearing connections and returning`);
        connections.value = [];
        return;
      }
      
      console.log(`[ConnectionLines] Badge mode is ON (+B) - proceeding with connections`);
      
      // Third check: Is a cDiv selected?
      let selectedJobNumber = null;
      let selectedCDiv = document.querySelector('.biz-card-div.selected');
      if (selectedCDiv) {
        selectedJobNumber = parseInt(selectedCDiv.getAttribute('data-job-number'));
      }
      if (selectedJobNumber === null || isNaN(selectedJobNumber)) {
        // No cDiv selected - clear any existing connections
        // console.log(`[DEBUG] No cDiv selected - clearing connections`);
        return;
      }
      // Use the job number to get the cDiv clone
      const cDivCloneId = `biz-card-div-${selectedJobNumber}-clone`;
      selectedCDiv = document.getElementById(cDivCloneId);
      if (!selectedCDiv) {
        throw new Error(`[ConnectionLines] No cDiv clone found for cDivCloneId:${cDivCloneId}`);
      }
      let cDivPos;
      try {
        // Use the new viewport-relative coordinate calculation
        cDivPos = getViewportRelativeCDivPosition(selectedCDiv);
        
        // Validate cDiv position
        if (!cDivPos || cDivPos.width === 0 || cDivPos.height === 0) {
          return;
        }
      } catch (error) {
        return;
      }
      
      // Get DOM rects and scene transform early
      const cDivRect = selectedCDiv.getBoundingClientRect();
      // Use SceneContainer dependency - get the actual DOM element
      let sceneContainer;
      if (sceneContainerRef.value?.getSceneContainer) {
        sceneContainer = sceneContainerRef.value.getSceneContainer();
      } else if (sceneContainerRef.value?.$el) {
        sceneContainer = sceneContainerRef.value.$el;
      } else {
        sceneContainer = sceneContainerRef.value;
      }
      const sceneRect = sceneContainer?.getBoundingClientRect();
      const xTransform = sceneRect ? sceneRect.width / 2 : 0;
      
      console.log(`[ConnectionLines] Scene dimensions: container width=${sceneRect?.width}, xTransform=${xTransform}`);
      
      // Get cDiv scene coordinates from data attributes + X-transform
      const cDivLeft = parseFloat(selectedCDiv.getAttribute("data-sceneLeft") || "0") + xTransform;
      const cDivRight = parseFloat(selectedCDiv.getAttribute("data-sceneRight") || "0") + xTransform;
      const cDivTop = parseFloat(selectedCDiv.getAttribute("data-sceneTop") || "0");
      const cDivBottom = parseFloat(selectedCDiv.getAttribute("data-sceneBottom") || "0");
      const cDivCenterY = parseFloat(selectedCDiv.getAttribute("data-sceneCenterY") || "0");
      const cDivWidth = cDivRight - cDivLeft;
      // console.log(`[DEBUG] cDiv scene coords from data attrs: top=${cDivTop}, center=${cDivCenterY}, bottom=${cDivBottom}`);
      const padding = 10;
      const arcRadius = 20;
      // Build associatedBadges directly from DOM
      const allBadges = Array.from(document.querySelectorAll('.skill-badge'));
      console.log(`[ConnectionLines] Found ${allBadges.length} badge elements in DOM`);
      
      if (allBadges.length === 0) {
        console.log(`[ConnectionLines] No badge elements found - not drawing connections`);
        return;
      }
      
      const associatedBadges = allBadges
        .map(el => {
          const id = el.id;
          const name = el.textContent.trim();
          
          const jobNumbersAttr = el.getAttribute('data-job-numbers');
          
          let jobNumbers = [];
          try {
            jobNumbers = JSON.parse(jobNumbersAttr || '[]');
          } catch (e) {
            console.error('[ConnectionLines] Error parsing jobNumbers for badge', id, ':', e);
            return null;
          }
          
          const isAssociated = jobNumbers.map(Number).includes(Number(selectedJobNumber));
          
          
          if (!isAssociated) return null;
          
          // Use the new viewport-relative badge position calculation
          const badgePos = getBadgeViewportPosition(el);
          
          // Determine category based on badge position relative to cDiv
          let category;
          if (badgePos.centerY < cDivTop) {
            category = 'ABOVE';
          } else if (badgePos.centerY > cDivBottom) {
            category = 'BELOW';
          } else {
            category = 'LEVEL';
          }
          
          return { 
            id, 
            name, 
            jobNumbers, 
            category, 
            centerY: badgePos.centerY,
            centerX: badgePos.centerX,
            width: badgePos.width 
          };
        })
        .filter(Boolean);
      if (associatedBadges.length === 0) {
        throw new Error('[ConnectionLines] No associated badges found for selected job number ' + selectedJobNumber);
      }
      // Use associatedBadges for non-intersecting line rendering
      const above = associatedBadges.filter(b => b.category === 'ABOVE');
      const below = associatedBadges.filter(b => b.category === 'BELOW');
      const level = associatedBadges.filter(b => b.category === 'LEVEL');
      
      
      // Array to collect all connections - ALL LEVEL badges
      const connectionsArr = [];
      
      // Get LEVEL and ABOVE badges for connections, sorted by Y position (top to bottom)
      const levelBadges = associatedBadges
        .filter(badge => badge.category === 'LEVEL')
        .sort((a, b) => a.centerY - b.centerY); // Sort by Y position: top to bottom
        
      const aboveBadges = associatedBadges
        .filter(badge => badge.category === 'ABOVE')
        .sort((a, b) => a.centerY - b.centerY); // Sort by Y position: top to bottom
      
      if (levelBadges.length === 0 && aboveBadges.length === 0) {
        connections.value = [];
        return;
      }
      
      // Determine layout orientation to get the correct edge
      const appContainer = this.appcontainerElement;
      const isSceneLeft = appContainer ? appContainer.classList.contains('scene-left') : false;
      // console.log(`[DEBUG] Layout orientation: isSceneLeft=${isSceneLeft}, appContainer classes:`, appContainer?.classList.toString());
      
      // Calculate common X position for all line numbers
      // Find left-most edge of all badges
      let leftmostBadgeX = Infinity;
      levelBadges.forEach(levelBadge => {
        const badgeRect = document.getElementById(levelBadge.id)?.getBoundingClientRect();
        if (badgeRect) {
          const badgeLeftX = isSceneLeft ? badgeRect.x : badgeRect.x - sceneRect.left;
          leftmostBadgeX = Math.min(leftmostBadgeX, badgeLeftX);
        }
      });
      
      // Handle case where no badges were found
      if (leftmostBadgeX === Infinity) {
        leftmostBadgeX = isSceneLeft ? cDivLeft - 100 : cDivRight + 100; // Default fallback position
      }
      
      // Calculate common text X position: midpoint between leftmost badge and cDiv right edge
      const commonTextX = (leftmostBadgeX + cDivRight) / 2;
      
      // Create connections for all LEVEL badges
      levelBadges.forEach((levelBadge, index) => {
        // Get badge rect for width calculation
        const badgeRect = document.getElementById(levelBadge.id)?.getBoundingClientRect();
        if (!badgeRect) return;
        
        // Calculate connection points using scene-container coordinates  
        // LEVEL badges: LEFT edge for scene-left, RIGHT edge for scene-right
        const badgeStartX = isSceneLeft ? 
          (badgeRect.x - sceneRect.left) : // LEFT edge for scene-left
          (badgeRect.x - sceneRect.left + badgeRect.width); // RIGHT edge for scene-right
        const badgeStartY = levelBadge.centerY; // Use scene-container Y coordinate
        
        // LEVEL: Direct horizontal connection to cDiv side
        let termX, termY, path, strokeColor;
        if (isSceneLeft) {
          termX = cDivRight; // Connect to cDiv RIGHT edge
        } else {
          termX = cDivLeft; // Connect to cDiv LEFT edge
        }
        termY = badgeStartY; // Use badge Y coordinate for horizontal line
        path = `M ${badgeStartX} ${badgeStartY} H ${termX}`;
        strokeColor = 'orange';
        
        console.log(`[DEBUG] LEVEL badge ${index + 1}: ${levelBadge.id} (${badgeStartX}, ${badgeStartY}) → (${termX}, ${termY})`);
      
        // Create the connection for this LEVEL badge
        const connection = {
          id: `connection-level-${index}`,
          path,
          case: 'LEVEL',
          skillText: levelBadge.name?.trim() || '',
          strokeWidth: 2,
          strokeColor,
          lineNumber: index + 1,
          textX: commonTextX, // Common X position for all line numbers
          textY: badgeStartY - 5
        };
        
        connectionsArr.push(connection);
      });
      
      // Create connections for all ABOVE badges with L-shaped paths
      if (aboveBadges.length > 0) {
        // Calculate evenly distributed termination points along cDiv top edge
        const topEdgePoints = distributeHorizontally(aboveBadges.length, cDivLeft, cDivRight);
        
        // For non-intersecting curves: lowest badge (maxY) gets rightmost termination point (maxX)
        // Sort badges by Y position (highest Y = lowest on screen = first)
        const sortedAboveBadges = [...aboveBadges].sort((a, b) => b.centerY - a.centerY);
        
        // For line numbering: sort by Y position (lowest Y = top of screen = line 1)
        const numberedAboveBadges = [...aboveBadges].sort((a, b) => a.centerY - b.centerY);
        
        sortedAboveBadges.forEach((aboveBadge, index) => {
          // Get badge rect for width calculation
          const badgeRect = document.getElementById(aboveBadge.id)?.getBoundingClientRect();
          if (!badgeRect) return;
          
          // Calculate connection points using scene-container coordinates  
          // ABOVE badges start from LEFT edge in scene-left, RIGHT edge in scene-right
          const badgeStartX = isSceneLeft ? 
            (badgeRect.x - sceneRect.left) : // LEFT edge for scene-left
            (badgeRect.x - sceneRect.left + badgeRect.width); // RIGHT edge for scene-right
          const badgeStartY = aboveBadge.centerY; // Use scene-container Y coordinate
          
          // ABOVE: L-shaped connection - non-intersecting termination points
          // Scene-left: Lowest badge (highest Y) gets rightmost point (highest X) to avoid intersections
          // Scene-right: Lowest badge (highest Y) gets leftmost point (lowest X) to avoid intersections
          const termX = isSceneLeft ? 
            topEdgePoints[topEdgePoints.length - 1 - index] : // Scene-left: reverse order
            topEdgePoints[index]; // Scene-right: normal order
          const termY = cDivTop; // Connect to cDiv top edge
          
          // Create L-shaped path: horizontal towards distributed point, then vertical to top edge
          let path, strokeColor;
          path = createLShapedCurve(
            { x: badgeStartX, y: badgeStartY },
            { x: termX, y: badgeStartY },
            { x: termX, y: termY }
          );
          strokeColor = 'red';
          
          console.log(`[DEBUG] ABOVE badge ${index + 1}: ${aboveBadge.id} (${badgeStartX}, ${badgeStartY}) → (${termX}, ${termY}) L-shaped non-intersecting`);
        
          // Find this badge's line number (1 = topmost, increasing downward)
          const lineNumber = numberedAboveBadges.findIndex(b => b.id === aboveBadge.id) + 1;
          
          // Create the connection for this ABOVE badge
          const connection = {
            id: `connection-above-${index}`,
            path,
            case: 'ABOVE',
            skillText: aboveBadge.name?.trim() || '',
            strokeWidth: 2,
            strokeColor,
            lineNumber: lineNumber, // Line numbering: 1 at top, increasing downward
            textX: commonTextX, // Common X position for all line numbers
            textY: badgeStartY - 5
          };
          
          connectionsArr.push(connection);
        });
      }
      
      // Create connections for all BELOW badges with L-shaped paths
      const belowBadges = associatedBadges
        .filter(badge => badge.category === 'BELOW')
        .sort((a, b) => a.centerY - b.centerY); // Sort by Y position: top to bottom
      
      if (belowBadges.length > 0) {
        // Calculate evenly distributed termination points along cDiv bottom edge
        const bottomEdgePoints = distributeHorizontally(belowBadges.length, cDivLeft, cDivRight);
        
        // For non-intersecting curves: highest badge (minY) gets rightmost termination point (maxX)
        // Sort badges by Y position (lowest Y = highest on screen = first)
        const sortedBelowBadges = [...belowBadges].sort((a, b) => a.centerY - b.centerY);
        
        // For line numbering: sort by Y position (lowest Y = top of BELOW section = line 1)
        const numberedBelowBadges = [...belowBadges].sort((a, b) => a.centerY - b.centerY);
        
        sortedBelowBadges.forEach((belowBadge, index) => {
          // Get badge rect for width calculation
          const badgeRect = document.getElementById(belowBadge.id)?.getBoundingClientRect();
          if (!badgeRect) return;
          
          // Calculate connection points using scene-container coordinates  
          // BELOW badges start from LEFT edge in scene-left, RIGHT edge in scene-right
          const badgeStartX = isSceneLeft ? 
            (badgeRect.x - sceneRect.left) : // LEFT edge for scene-left
            (badgeRect.x - sceneRect.left + badgeRect.width); // RIGHT edge for scene-right
          const badgeStartY = belowBadge.centerY; // Use scene-container Y coordinate
          
          // BELOW: L-shaped connection - non-intersecting termination points
          // Scene-left: Highest badge (lowest Y) gets rightmost point (highest X) to avoid intersections
          // Scene-right: Highest badge (lowest Y) gets leftmost point (lowest X) to avoid intersections
          const termX = isSceneLeft ? 
            bottomEdgePoints[bottomEdgePoints.length - 1 - index] : // Scene-left: reverse order
            bottomEdgePoints[index]; // Scene-right: normal order
          const termY = cDivBottom; // Connect to cDiv bottom edge
          
          // Create L-shaped path: horizontal towards distributed point, then vertical to bottom edge
          let path, strokeColor;
          path = createLShapedCurve(
            { x: badgeStartX, y: badgeStartY },
            { x: termX, y: badgeStartY },
            { x: termX, y: termY }
          );
          strokeColor = 'yellow';
          
          console.log(`[DEBUG] BELOW badge ${index + 1}: ${belowBadge.id} (${badgeStartX}, ${badgeStartY}) → (${termX}, ${termY}) L-shaped non-intersecting`);
        
          // Find this badge's line number (1 = topmost BELOW badge, increasing downward)
          const lineNumber = numberedBelowBadges.findIndex(b => b.id === belowBadge.id) + 1;
          
          // Create the connection for this BELOW badge
          const connection = {
            id: `connection-below-${index}`,
            path,
            case: 'BELOW',
            skillText: belowBadge.name?.trim() || '',
            strokeWidth: 2,
            strokeColor,
            lineNumber: lineNumber, // Line numbering: 1 at top, increasing downward
            textX: commonTextX, // Common X position for all line numbers
            textY: badgeStartY - 5
          };
          
          connectionsArr.push(connection);
        });
      }
      
      connections.value = connectionsArr;
      console.log(`[DEBUG] ${connectionsArr.length} total connections added to DOM (${levelBadges.length} LEVEL + ${aboveBadges.length} ABOVE + ${belowBadges.length} BELOW)`);
    }

    // Helper function to get badge start position based on scene orientation
    function getBadgeStartX(badge, isSceneLeft) {
      const startX = isSceneLeft ? badge.centerX - (badge.width / 2) : badge.centerX + (badge.width / 2);
      console.log(`[DEBUG] getBadgeStartX: isSceneLeft=${isSceneLeft}, badge.centerX=${badge.centerX}, width=${badge.width}, startX=${startX}`);
      
      if (isSceneLeft) {
        // Scene-left: badges on right → start from badge LEFT edge (facing cDiv)
        return badge.centerX - (badge.width / 2);
      } else {
        // Scene-right: badges on left → start from badge RIGHT edge (facing cDiv)
        return badge.centerX + (badge.width / 2);
      }
    }

    // Helper functions to distribute points
    function distributeHorizontally(count, left, right) {
      const points = [];
      if (count === 1) {
        // Single connection: center of edge
        points.push((left + right) / 2);
      } else {
        // Multiple connections: padded distribution
        const padding = Math.min(20, (right - left) * 0.1);
        const availableWidth = (right - left) - (2 * padding);
        const step = availableWidth / (count - 1);
        for (let i = 0; i < count; i++) {
          points.push(left + padding + step * i);
        }
      }
      return points;
    }
    function distributeVertically(count, top, bottom) {
      const points = [];
      const step = count > 1 ? (bottom - top) / (count - 1) : 0;
      for (let i = 0; i < count; i++) {
        points.push(top + step * i);
      }
      return points;
    }

    // Event handlers
    function handleBadgeModeChange() {
      isConnectionLinesVisible.value = badgeManager.isConnectionLinesVisible();
      updateConnections();
    }
    function handleCardSelect() {
      // Only respond to card selection if badges are visible
      if (!badgeManager.isBadgesVisible()) {
        return;
      }
      // Don't update immediately - wait for badges-positioned event
    }
    function handleCardDeselect() { 
      connections.value = []; 
    }
    // Debounced resize handler to wait for resize completion
    let resizeTimeout = null;
    function handleViewportResize(event) {
      // Only handle resize events if badges are visible
      if (!badgeManager.isBadgesVisible()) {
        return;
      }
      
      const eventType = event?.type || 'unknown';
      console.log(`[ConnectionLines] ${eventType} event detected`);
      
      // Clear any existing timeout
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
      
      // Set a new timeout to update connections after resize finishes
      resizeTimeout = setTimeout(() => {
        console.log(`[ConnectionLines] Updating connections after ${eventType} completion`);
        updateConnections();
        resizeTimeout = null;
      }, 150); // Wait 150ms after last resize event
    }
    function handleBadgesPositioned() { 
      // Only update connections if badges are visible
      if (badgeManager.isBadgesVisible()) {
        updateConnections(); 
      }
    }

    return {
      connections,
      showDebugInfo,
      isConnectionLinesVisible,
      shouldShowContainer,
      containerStyle,
      svgStyle,
      debugStyle
    };
  }
};
</script>

<style scoped>
.new-connection-lines {
  pointer-events: none;
}

.connection-line {
  transition: stroke-width 0.2s ease, stroke-opacity 0.2s ease;
}

.connection-line:hover {
  stroke-width: 4;
  stroke-opacity: 1;
}

.debug-info {
  font-size: 12px;
  line-height: 1.4;
}

.debug-info div {
  margin-bottom: 2px;
}
</style> 