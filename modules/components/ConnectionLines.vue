<template>
  <div 
    id="new-connection-lines-container"
    :style="containerStyle"
    class="new-connection-lines"
  >
    <div id="connection-lines-debug-marker">[ConnectionLines] TEMPLATE RENDERED</div>
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
console.log('[ConnectionLines] SCRIPT LOADED');
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { badgeManager } from '@/modules/core/badgeManager.mjs';
import { applyPaletteToElement } from '../composables/useColorPalette.mjs';
import { eventBus } from '@/modules/utils/eventBus.mjs';
import { AppState } from '@/modules/core/stateManager.mjs';

export default {
  name: 'ConnectionLines',
  setup() {
    console.log('[ConnectionLines] setup() called');
    const connections = ref([]);
    const showDebugInfo = ref(false);
    const isConnectionLinesVisible = ref(badgeManager.isConnectionLinesVisible());

    const shouldShowContainer = computed(() => connections.value.length > 0 && isConnectionLinesVisible.value);

    const containerStyle = computed(() => ({
      position: 'absolute',
      top: '0', left: '0', right: '0', bottom: '0',
      pointerEvents: 'none',
      zIndex: AppState.constants.zIndex.bullsEye
    }));
    const svgStyle = computed(() => ({
      position: 'absolute',
      top: '0', left: '0', right: '0', bottom: '0',
      pointerEvents: 'none',
      overflow: 'visible',
      zIndex: AppState.constants.zIndex.bullsEye
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
      const sceneContent = document.getElementById('scene-content');
      if (!sceneContent) throw new Error('[ConnectionLines] scene-content element not found');
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
      console.log('[ConnectionLines] badges-positioned event received, badgeOrder:', event.detail.badgeOrder);
      if (event.detail && event.detail.badgeOrder) {
        badgeOrder.value = [...event.detail.badgeOrder];
        console.log('[ConnectionLines] Waiting for nextTick before updating connections...');
        nextTick(() => {
          setTimeout(() => {
            console.log('[ConnectionLines] Now updating connections after badges positioned');
            updateConnections();
          }, 50);
        });
      }
    }

    onMounted(() => {
      console.log('[ConnectionLines] onMounted - setting up event listeners');
      eventBus.on('badges-positioned', handleBadgesPositioned);
      window.addEventListener('card-select', handleCardSelect);
      window.addEventListener('card-deselect', handleCardDeselect);
      window.addEventListener('viewport-changed', handleViewportResize);
      window.addEventListener('resize', handleViewportResize);
      badgeManager.addEventListener('badgeModeChanged', handleBadgeModeChange);
      
      console.log('[ConnectionLines] Requesting initial badges data');
      eventBus.emit('request-badges');
      
      // Add fallback attempts to ensure connections are drawn after initialization
      setTimeout(() => {
        updateConnections();
      }, 500);
      
      setTimeout(() => {
        updateConnections();
      }, 1000);
      
      setTimeout(() => {
        updateConnections();
      }, 2000);
    });
    onUnmounted(() => {
      eventBus.off('badges-positioned', handleBadgesPositioned);
      window.removeEventListener('card-select', handleCardSelect);
      window.removeEventListener('card-deselect', handleCardDeselect);
      window.removeEventListener('viewport-changed', handleViewportResize);
      window.removeEventListener('resize', handleViewportResize);
      badgeManager.removeEventListener('badgeModeChanged', handleBadgeModeChange);
    });

    // Refactor updateConnections to use badgeOrder
    function updateConnections() {
      connections.value = [];
      if (!badgeManager.isConnectionLinesVisible()) {
        return;
      }
      
      let selectedJobNumber = null;
      let selectedCDiv = document.querySelector('.biz-card-div.selected');
      if (selectedCDiv) {
        selectedJobNumber = parseInt(selectedCDiv.getAttribute('data-job-number'));
      }
      if (selectedJobNumber === null || isNaN(selectedJobNumber)) {
        return;
      }
      
      if (selectedJobNumber !== 21) return;
      // Use the job number to get the cDiv clone
      const cDivCloneId = `biz-card-div-${selectedJobNumber}-clone`;
      console.log('[ConnectionLines] ** cDivCloneId:', cDivCloneId);
      console.log('[ConnectionLines] ** cDivCloneId:', 'biz-card-div-9-clone');
      selectedCDiv = document.getElementById(cDivCloneId);
      if (!selectedCDiv) {
        throw new Error(`[ConnectionLines] No cDiv clone found for cDivCloneId:${cDivCloneId}`);
      }
      const cDivPos = getElementPosition(selectedCDiv);
      if (!cDivPos) {
        throw new Error('[ConnectionLines] Could not get cDiv position');
      }
      const cDivTop = cDivPos.y;
      const cDivBottom = cDivPos.y + cDivPos.height;
      const cDivLeft = cDivPos.x;
      const cDivRight = cDivPos.x + cDivPos.width;
      const cDivCenterY = cDivPos.y + cDivPos.height / 2;
      const cDivWidth = cDivPos.width;
      const cDivHeight = cDivPos.height;
      const padding = 10;
      const arcRadius = 20;
      // Build associatedBadges directly from DOM
      const allBadges = Array.from(document.querySelectorAll('.skill-badge'));
      console.log('[ConnectionLines] ** allBadges.length:', allBadges.length);
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
          
          if (selectedJobNumber === 21 && isAssociated) {
            console.log("[ConnectionLines] Badge", name, "IS associated with job 21");
          }
          
          if (!isAssociated) return null;
          
          const rect = el.getBoundingClientRect();
          const sceneContent = document.getElementById('scene-content');
          const sceneRect = sceneContent ? sceneContent.getBoundingClientRect() : { top: 0 };
          const centerY = rect.top + rect.height / 2 - sceneRect.top + (sceneContent ? sceneContent.scrollTop : 0);
          
          // Determine category based on badge position relative to cDiv
          let category;
          if (centerY < cDivTop) {
            category = 'ABOVE';
          } else if (centerY > cDivBottom) {
            category = 'BELOW';
          } else {
            category = 'LEVEL';
          }
          
          return { id, name, jobNumbers, category, centerY };
        })
        .filter(Boolean);
      if (associatedBadges.length === 0) {
        throw new Error('[ConnectionLines] No associated badges found for selected job number ' + selectedJobNumber);
      }
      // Use associatedBadges for non-intersecting line rendering
      const above = associatedBadges.filter(b => b.category === 'ABOVE');
      const below = associatedBadges.filter(b => b.category === 'BELOW');
      const level = associatedBadges.filter(b => b.category === 'LEVEL');
      
      // Array to collect all connections
      const connectionsArr = [];
      // ABOVE: terminate at top edge, spaced horizontally
      const aboveX = distributeHorizontally(above.length, cDivLeft + padding, cDivRight - padding);
      // BELOW: terminate at bottom edge, spaced horizontally
      const belowX = distributeHorizontally(below.length, cDivLeft + padding, cDivRight - padding);
      // LEVEL: terminate at vertical center, spaced vertically
      const levelY = distributeVertically(level.length, cDivTop + padding, cDivBottom - padding);
      // Find the badge with the longest string length
      let maxBadgeStringLength = 0;
      let maxBadgeX = 0;
      let maxBadgeWidth = 0;
      let maxBadgeId = null;
      associatedBadges.forEach(badge => {
        const stringLength = badge.name.length;
        if (stringLength > maxBadgeStringLength) {
          const el = document.getElementById(badge.id);
          if (el) {
            maxBadgeStringLength = stringLength;
            maxBadgeWidth = el.offsetWidth;
            maxBadgeX = el.getBoundingClientRect().left;
            maxBadgeId = badge.id;
          }
        }
      });
      // Calculate the edge of the longest badge facing the cDiv
      let sceneContent = document.getElementById('scene-content');
      let sceneRect = sceneContent ? sceneContent.getBoundingClientRect() : { left: 0 };
      
      // Determine layout orientation to get the correct edge
      const appContainer = document.getElementById('app-container');
      const isSceneLeft = appContainer ? appContainer.classList.contains('scene-left') : false;
      
      let badgeEdgeFacingCDiv;
      if (isSceneLeft) {
        // Scene-left: badge left edge faces cDiv
        badgeEdgeFacingCDiv = maxBadgeX - sceneRect.left;
      } else {
        // Scene-right: badge right edge faces cDiv
        badgeEdgeFacingCDiv = maxBadgeX + maxBadgeWidth - sceneRect.left;
      }
      // The edge of the cDiv facing the badges
      let cDivFacingX;
      if (isSceneLeft) {
        // Scene-left: cDiv right edge faces badges
        cDivFacingX = cDivRight;
      } else {
        // Scene-right: cDiv left edge faces badges
        cDivFacingX = cDivLeft;
      }
      
      // The common x midpoint for all line numbers
      const commonTextX = (badgeEdgeFacingCDiv + cDivFacingX) / 2;
      // Sort ABOVE by startY (top to bottom), assign termination points in reverse order
      const sortedAbove = above.sort((a, b) => a.centerY - b.centerY).map((info, i) => {
        // Determine layout orientation to get correct starting edge
        const appContainer = document.getElementById('app-container');
        const isSceneLeft = appContainer ? appContainer.classList.contains('scene-left') : false;
        
        let startX;
        if (isSceneLeft) {
          // Scene-left: start from badge left edge
          startX = getBadgeX(info.id);
        } else {
          // Scene-right: start from badge right edge
          startX = getBadgeX(info.id) + getBadgeWidth(info.id);
        }
        const startY = info.centerY;
        // Reverse the termination assignment for ABOVE: furthest badge gets furthest termination
        const termX = aboveX[aboveX.length - 1 - i];
        const termY = cDivTop;
        const cornerX = termX;
        const pointA = { x: startX, y: startY };
        const pointB = { x: cornerX, y: startY };
        const pointC = { x: cornerX, y: termY };
        const path = createLShapedCurve(pointA, pointB, pointC, arcRadius);
        return {
          id: `connection-above-${i}`,
          path,
          case: 'ABOVE',
          skillText: info.name?.trim() || '',
          strokeWidth: 2,
          strokeColor: 'red',
          lineNumber: i + 1, // Set line number directly
          textX: commonTextX,
          textY: startY - 5
        };
      });
      sortedAbove.forEach((conn) => {
        connectionsArr.push(conn);
      });
      // Sort BELOW by startY (top to bottom), assign termination points in same order
      const sortedBelow = below.sort((a, b) => a.centerY - b.centerY).map((info, i) => {
        // Determine layout orientation to get correct starting edge
        const appContainer = document.getElementById('app-container');
        const isSceneLeft = appContainer ? appContainer.classList.contains('scene-left') : false;
        
        let startX;
        if (isSceneLeft) {
          // Scene-left: start from badge left edge
          startX = getBadgeX(info.id);
        } else {
          // Scene-right: start from badge right edge
          startX = getBadgeX(info.id) + getBadgeWidth(info.id);
        }
        const startY = info.centerY;
        // Same order for BELOW: closest badge to bottom gets nearest termination
        const termX = belowX[i];
        const termY = cDivBottom;
        const cornerX = termX;
        const pointA = { x: startX, y: startY };
        const pointB = { x: cornerX, y: startY };
        const pointC = { x: cornerX, y: termY };
        const path = createLShapedCurve(pointA, pointB, pointC, arcRadius);
        return {
          id: `connection-below-${i}`,
          path,
          case: 'BELOW',
          skillText: info.name?.trim() || '',
          strokeWidth: 2,
          strokeColor: 'yellow',
          lineNumber: i + 1, // Set line number directly
          textX: commonTextX,
          textY: startY - 5
        };
      });
      sortedBelow.forEach((conn) => {
        connectionsArr.push(conn);
      });
      // Sort LEVEL by startY (top to bottom), assign termination points in same order
      const sortedLevel = level.sort((a, b) => a.centerY - b.centerY).map((info, i) => {
        // Determine layout orientation
        const appContainer = document.getElementById('app-container');
        const isSceneLeft = appContainer ? appContainer.classList.contains('scene-left') : false;
        
        // Start and end points depend on layout
        let startX, termX;
        if (isSceneLeft) {
          // Scene-left: badges on right, cDiv on left
          // Start from badge left edge, terminate at cDiv right edge
          startX = getBadgeX(info.id);
          termX = cDivRight;
        } else {
          // Scene-right: badges on right, cDiv on left  
          // Start from badge right edge, terminate at cDiv left edge
          startX = getBadgeX(info.id) + getBadgeWidth(info.id);
          termX = cDivLeft;
        }
        
        const startY = info.centerY;
        const termY = levelY[i];
        const path = `M ${startX} ${startY} H ${termX}`;
        return {
          id: `connection-level-${i}`,
          path,
          case: 'LEVEL',
          skillText: info.name?.trim() || '',
          strokeWidth: 2,
          strokeColor: 'orange',
          lineNumber: i + 1, // Set line number directly
          textX: commonTextX,
          textY: startY - 5
        };
      });
      sortedLevel.forEach((conn) => {
        connectionsArr.push(conn);
      });
      console.log('Generated connections:', connectionsArr);
      connections.value = connectionsArr;
      // Log shouldShowContainer
      setTimeout(() => {
        console.log('shouldShowContainer:', shouldShowContainer.value);
      }, 0);
    }

    // Helper functions to get badge X and width by id
    function getBadgeX(badgeId) {
      const el = document.getElementById(badgeId);
      if (!el) throw new Error(`[ConnectionLines] Badge with ID ${badgeId} not found`);
      const sceneContent = document.getElementById('scene-content');
      if (!sceneContent) throw new Error('[ConnectionLines] scene-content element not found');
      const rect = el.getBoundingClientRect();
      const sceneRect = sceneContent.getBoundingClientRect();
      const scrollLeft = sceneContent.scrollLeft;
      return rect.left - sceneRect.left + scrollLeft;
    }
    function getBadgeWidth(badgeId) {
      const el = document.getElementById(badgeId);
      if (!el) throw new Error(`[ConnectionLines] Badge with ID ${badgeId} not found`);
      return el.offsetWidth;
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
      // Don't update immediately - wait for badges-positioned event
    }
    function handleCardDeselect() { 
      connections.value = []; 
    }
    function handleViewportResize() { updateConnections(); }
    function handleBadgesPositioned() { updateConnections(); }

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