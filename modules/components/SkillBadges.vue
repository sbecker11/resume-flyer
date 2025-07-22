<template>
  <div 
    id="skill-badges-container"
    :style="containerStyle"
  >
    <div
      v-for="skill in skillBadges"
      :key="skill.id"
      :id="skill.id"
      class="skill-badge"
      :class="[...skill.classes, orientation === 'scene-left' ? 'position-right' : 'position-left']"
      :data-color-index="skill.colorIndex"
      :data-job-numbers="JSON.stringify(skill.jobNumbers)"
      :style="skill.style"
    >
      {{ skill.name }}
    </div>
  </div>
</template>

<script>
// SkillBadges script loading
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { useViewport } from '@/modules/composables/useViewport.mjs';
import { useColorPalette, applyPaletteToElement } from '@/modules/composables/useColorPalette.mjs';
import { useLayoutToggle } from '@/modules/composables/useLayoutToggle.mjs';
import { jobs as jobsData } from '@/static_content/jobs/jobs.mjs';
import { AppState } from '@/modules/core/stateManager.mjs';
import { selectionManager } from '@/modules/core/selectionManager.mjs';
import { badgeManager } from '@/modules/core/badgeManager.mjs';
import { badgePositioner } from '@/modules/utils/BadgePositioner.mjs';
import { eventBus } from '@/modules/utils/eventBus.mjs';
import { projectBizCardDivClone } from '@/modules/core/parallaxModule.mjs';
import { requireDependencies, waitForDependencies } from '@/modules/core/dependencyChecker.mjs';
import { BaseVueComponentMixin } from '@/modules/core/abstracts/BaseComponent.mjs';

export default {
  name: 'SkillBadges',
  mixins: [BaseVueComponentMixin],
  created() {
    // SkillBadges component created
  },
  emits: ['badges-positioned'],
  setup(props, { emit }) {
    const viewport = useViewport('SkillBadges');
    const colorPalette = useColorPalette();
    const { orientation } = useLayoutToggle();
    
    const skillBadges = ref([]);
    const hoveredJobNumber = ref(null);
    const selectedJobNumber = ref(null);
    const badgeVisibility = ref(badgeManager.isBadgesVisible());
    
    // Add a ref to store the ordered/categorized badge data
    const badgeOrder = ref([]);
    
    // Create badges for unique skills across all jobs
    const createSkillBadges = () => {
      const skillMap = new Map();
      const badges = [];
      let badgeIndex = 0;
      
      // Collect all unique skills across all jobs
      jobsData.forEach((job, jobNumber) => {
        const jobSkills = job['job-skills'] || {};
        const skillEntries = Object.entries(jobSkills);
        
        // Job skills logging removed
        
        skillEntries.forEach(([skillKey, skillName]) => {
          if (!skillMap.has(skillName)) {
            skillMap.set(skillName, {
              name: skillName,
              jobNumbers: [jobNumber],
              primaryJobNumber: jobNumber,
              id: `skill-badge-${badgeIndex}`,
              colorIndex: badgeIndex % 7
            });
            badgeIndex++;
          } else {
            const existingSkill = skillMap.get(skillName);
            if (!existingSkill.jobNumbers.includes(jobNumber)) {
              existingSkill.jobNumbers.push(jobNumber);
            }
          }
        });
      });
      
      // Convert to array and create badge objects
      skillMap.forEach(skill => {
        const isSceneLeft = orientation.value === 'scene-left';
        badges.push({
          id: skill.id,
          name: skill.name,
          jobNumbers: skill.jobNumbers,
          primaryJobNumber: skill.primaryJobNumber,
          colorIndex: skill.colorIndex,
          classes: ['skill-badge'],
          style: {
            position: 'absolute',
            top: '0px',
            right: isSceneLeft ? '0px' : 'auto',
            left: isSceneLeft ? 'auto' : '0px'
          }
        });
      });
      
      skillBadges.value = badges;
      // console.log(`[SkillBadges] Created ${badges.length} skill badges`);
    };

    // return the badges for a given job number
    const getBadgesForJobNumber = (jobNumber) => {
      return skillBadges.value.filter(badge => badge.jobNumbers.includes(jobNumber));
    };

    // return the selected cDiv or null
    const getSelectedCDiv = () => {
      return document.querySelector('.biz-card-div.selected');
    };  
    
    // if a cDiv is not selected, return null.
    // otherwise, return the jobNumberof the selected biz-card-div
    const getSelectedJobNumber = () => {
      const selectedCDiv = getSelectedCDiv();
      if ( selectedCDiv ) {
        return parseInt(selectedCDiv.getAttribute("data-job-number"),10);
      }
      return null;
    };

    // if a cDiv is not selected, return null.
    // otherwie, return the clone of the selected cDiv
    const getSelectedCDivClone = () => {
      const selectedJobNumber = getSelectedJobNumber();
      if ( selectedJobNumber !== null ) {
        const cloneId = `biz-card-div-${selectedJobNumber}-clone`;
        const cDivClone = document.querySelector(`#${cloneId}`);
        console.log(`[SkillBadges] Looking for clone: ${cloneId}, found:`, !!cDivClone);
        if ( !cDivClone ) {
          // List all available clones for debugging
          const allClones = Array.from(document.querySelectorAll('[id*="clone"]'));
          console.log(`[SkillBadges] Available clones:`, allClones.map(c => c.id));
          throw new Error(`[SkillBadges] cDivClone for selected jobNumber:${selectedJobNumber} not found`);
        }
        return cDivClone;
      }
      return null;
    };

    // Position badges based on selected job number - CLEAN COORDINATOR VERSION
    const positionBadges = () => {
      try {
        // Positioning badges for selected job
      const currentSelectedJobNumber = getSelectedJobNumber();
      if (currentSelectedJobNumber == null) {
        // Hide all badges when no job is selected
        const badgeElements = document.querySelectorAll('.skill-badge');
        badgeElements.forEach(badge => badge.style.display = 'none');
        emit('badges-positioned', { badgeOrder: [] });
        eventBus.emit('badges-positioned', { badgeOrder: [] });
        return;
      }
      
      if (!badgeManager.isBadgesVisible()) {
        console.log('[SkillBadges] Badges not visible - skipping positioning');
        return;
      }
      
      // Get all badge elements
      const badgeElements = document.querySelectorAll('.skill-badge');
      if (badgeElements.length === 0) {
        console.log('[SkillBadges] No badge elements found');
        return;
      }
      
      // Show badges again (remove any display:none from previous hiding)
      badgeElements.forEach(badge => badge.style.display = 'block');
      
      // Find related and unrelated badges
      const relatedBadges = [];
      const unrelatedBadges = [];
      badgeElements.forEach(badge => {
        const badgeElement = skillBadges.value.find(sb => sb.id === badge.id);
        if (badgeElement && badgeElement.jobNumbers.includes(currentSelectedJobNumber)) {
          relatedBadges.push(badge);
        } else {
          unrelatedBadges.push(badge);
        }
      });
      
      // Get the cDiv clone bounds - with retry logic for timing issues
      const selectedCDivClone = getSelectedCDivClone();
      if (!selectedCDivClone) {
        console.warn('[SkillBadges] No clone found for selected cDiv - retrying in 100ms');
        // Retry once after a short delay to handle timing issues
        setTimeout(() => {
          const retryClone = getSelectedCDivClone();
          if (retryClone) {
            console.log('[SkillBadges] Clone found on retry - positioning badges');
            positionBadges(); // Recursive call with clone now available
          } else {
            console.warn('[SkillBadges] Clone still not found after retry - skipping badge positioning');
          }
        }, 100);
        return;
      }
      
      // Use actual DOM bounds instead of stored scene attributes to avoid NaN issues
      const cloneBounds = selectedCDivClone.getBoundingClientRect();
      const sceneContent = document.getElementById('scene-content');
      if (!sceneContent) {
        console.error('[SkillBadges] scene-content not found');
        return;
      }
      const sceneRect = sceneContent.getBoundingClientRect();
      const scrollTop = sceneContent.scrollTop;
      
      const cDivBounds = {
        top: cloneBounds.top - sceneRect.top + scrollTop,
        bottom: cloneBounds.bottom - sceneRect.top + scrollTop,
        centerY: null // Will be calculated below
      };
      
      // Calculate centerY directly from actual DOM bounds
      cDivBounds.centerY = (cDivBounds.top + cDivBounds.bottom) / 2;
      
      
      // Create callback to update Vue reactive data
      const updatePositions = (positionData) => {
        positionData.forEach(({ element, position }) => {
          const skillBadgeData = skillBadges.value.find(sb => sb.id === element.id);
          if (skillBadgeData) {
            skillBadgeData.style.top = `${position}px`;
          }
        });
      };
      
      // DELEGATE ALL POSITIONING LOGIC TO BadgePositioner
      // console.log('[SkillBadges] Delegating positioning to BadgePositioner...');
      // console.log('[SkillBadges] badgePositioner object:', badgePositioner);
      // console.log('[SkillBadges] Calling with:', { relatedBadges: relatedBadges.length, unrelatedBadges: unrelatedBadges.length, cDivBounds });
      
      try {
        const stats = badgePositioner.positionBadges(relatedBadges, unrelatedBadges, cDivBounds, updatePositions);
        // console.log('[SkillBadges] BadgePositioner returned stats:', stats);
      } catch (error) {
        console.error('[SkillBadges] BadgePositioner error:', error);
      }
      
      // Update badge styles and emit events
      updateBadgeStyles();
      
      nextTick(() => {
        emit('badges-positioned', { badgeOrder: [...badgeOrder.value] });
        eventBus.emit('badges-positioned', { badgeOrder: [...badgeOrder.value] });
      });
      } catch (error) {
        console.error('[SkillBadges] positionBadges error:', error);
      }
    };
    
    // Update badge visual styles based on state
    const updateBadgeStyles = () => {
      skillBadges.value.forEach(skill => {
        if (!Array.isArray(skill.jobNumbers) || skill.jobNumbers.length === 0) {
          throw new Error(`[SkillBadges] Badge ${skill.id} (${skill.name}) has invalid or empty jobNumbers: ${JSON.stringify(skill.jobNumbers)}`);
        }
        const classes = ['skill-badge'];
        let filter = '';
        
        if (selectedJobNumber.value !== null) {
          if (Array.isArray(skill.jobNumbers) && skill.jobNumbers.map(Number).includes(Number(selectedJobNumber.value))) {
            classes.push('selected');
          } else {
            filter = 'brightness(0.5)';
          }
        }
        
        if (hoveredJobNumber.value !== null && Array.isArray(skill.jobNumbers) && skill.jobNumbers.map(Number).includes(Number(hoveredJobNumber.value))) {
          classes.push('hovered');
        }
        
        skill.classes = classes;
        skill.style.filter = filter;
      });
    };
    
    // Event handlers
    const handleCardSelect = (event) => {
      // Handle card selection event
      // console.log('SkillBadges.handleCardSelect called with event:', event.detail);
      const newJobNumber = parseInt(event.detail.selectedJobNumber);
      selectedJobNumber.value = newJobNumber;
      
      // console.log(`[SkillBadges] Calling positionBadges() for job ${newJobNumber} in 150ms...`);
      setTimeout(() => {
        // Positioning badges for newly selected job
        positionBadges();
      }, 150);
    };
    
    const handleCardDeselect = () => {
      console.log('[SkillBadges] handleCardDeselect called - was:', selectedJobNumber.value);
      selectedJobNumber.value = null;
      setTimeout(positionBadges, 50);
    };
    
    const handleCardHover = (event) => {
      hoveredJobNumber.value = event.detail.hoveredJobNumber;
      updateBadgeStyles();
    };
    
    const handleCardUnhover = () => {
      hoveredJobNumber.value = null;
      updateBadgeStyles();
    };
    
    const handleBadgeModeChange = () => {
      badgeVisibility.value = badgeManager.isBadgesVisible();
      if (badgeVisibility.value) {
        setTimeout(positionBadges, 100);
      }
    };
    
    const handleViewportResize = () => {
      if (badgeManager.isBadgesVisible()) {
        setTimeout(positionBadges, 150);
      }
    };
    
    const handlePaletteChange = () => {
      setTimeout(() => {
        document.querySelectorAll('.skill-badge').forEach(applyPaletteToElement);
      }, 100);
    };
    
    // Container positioning within scene-content
    const containerStyle = computed(() => {
      const skillBadgesZIndex = AppState.constants.zIndex.bullsEye; // Just below selectedCard (99)
      const isSceneLeft = orientation.value === 'scene-left';
      
      console.log(`layout: ${orientation.value}`);
      console.log(`badges: move to ${isSceneLeft ? 'right' : 'left'}`);
      
      return {
        position: 'absolute',
        right: isSceneLeft ? '10px' : 'auto',
        left: isSceneLeft ? 'auto' : '10px',
        top: '0px',
        width: 'auto',
        height: '100%',
        pointerEvents: 'none',
        zIndex: skillBadgesZIndex,
        overflow: 'visible',
        display: badgeVisibility.value ? 'block' : 'none'
      };
    });
    
    onMounted(() => {
      // SkillBadges component mounted
      window.CONSOLE_LOG_IGNORE('[SkillBadges] Component mounted - waiting for initialization...');
      
      // Wait for the InitializationManager to signal that SkillBadges should initialize
      const handleInitReady = async () => {
        console.log('[SkillBadges] Initializing component...');
        
        try {
          // Validate dependencies before proceeding
          await requireDependencies(['selectionManager', 'badgeManager'], 'SkillBadges');
          
          createSkillBadges();
        
        // Set up event listeners
        // Registering SkillBadges event listeners
        selectionManager.addEventListener('hoverChanged', handleCardHover);
        selectionManager.addEventListener('hoverCleared', handleCardUnhover);
        selectionManager.addEventListener('selectionChanged', handleCardSelect);
        selectionManager.addEventListener('selectionCleared', handleCardDeselect);
        // Event listeners registered
        
        // Test if selectionManager is working
        // Selection manager initialized
        window.addEventListener('viewport-changed', handleViewportResize);
        window.addEventListener('resize', handleViewportResize);
        window.addEventListener('color-palette-changed', handlePaletteChange);
        badgeManager.addEventListener('badgeModeChanged', handleBadgeModeChange);
      
        // Apply initial colors and position badges
        setTimeout(() => {
          document.querySelectorAll('.skill-badge').forEach(applyPaletteToElement);
          
          // Check if there's a pre-selected cDiv and position badges accordingly
          const preSelectedCDiv = document.querySelector('.biz-card-div.selected');
          console.log('[SkillBadges] Looking for pre-selected cDiv...', preSelectedCDiv);
          
          if (preSelectedCDiv) {
            const preSelectedJobNumber = parseInt(preSelectedCDiv.getAttribute('data-job-number'));
            console.log('[SkillBadges] Found pre-selected cDiv with job number:', preSelectedJobNumber);
            console.log('[SkillBadges] Setting selectedJobNumber from', selectedJobNumber.value, 'to', preSelectedJobNumber);
            selectedJobNumber.value = preSelectedJobNumber;
            
            // SkillBadges are now ready with known selectedJobId - trigger repositioning
            console.log('[SkillBadges] SkillBadges ready with selectedJobId:', preSelectedJobNumber, '- triggering repositioning');
            positionBadges();
          } else {
            // No pre-selected job, just position badges in default state
            console.log('[SkillBadges] No pre-selected cDiv found - positioning badges in default state');
            positionBadges();
          }
        }, 200);
        
        } catch (error) {
          console.error('[SkillBadges] Initialization failed:', error);
          // Retry after a delay
          setTimeout(() => {
            console.log('[SkillBadges] Retrying initialization...');
            handleInitReady();
          }, 1000);
        }
      };
      
      // Listen for initialization signal from InitializationManager
      window.addEventListener('skill-badges-init-ready', handleInitReady);
      
      // Also initialize immediately if we're already past the initialization phase
      // (this handles cases where the event was already fired)
      setTimeout(() => {
        console.log('[SkillBadges] Fallback initialization after 500ms');
        handleInitReady();
      }, 500);
      // Listen for request-badges event and emit current badgeOrder
      eventBus.on('request-badges', () => {
        console.log('[SkillBadges] Received request-badges event, emitting current badgeOrder:', badgeOrder.value);
        eventBus.emit('badges-positioned', { badgeOrder: [...badgeOrder.value] });
      });
      
      // Listen for requests for job data
      eventBus.on('request-selected-job-number', () => {
        const selectedJobNum = getSelectedJobNumber();
        eventBus.emit('selected-job-number-response', { selectedJobNumber: selectedJobNum });
      });
      
      eventBus.on('request-badges-for-job', (data) => {
        const badges = getBadgesForJobNumber(data.jobNumber);
        eventBus.emit('badges-for-job-response', { jobNumber: data.jobNumber, badges });
      });
    });
    
    onUnmounted(() => {
      selectionManager.removeEventListener('hoverChanged', handleCardHover);
      selectionManager.removeEventListener('hoverCleared', handleCardUnhover);
      selectionManager.removeEventListener('selectionChanged', handleCardSelect);
      selectionManager.removeEventListener('selectionCleared', handleCardDeselect);
      window.removeEventListener('viewport-changed', handleViewportResize);
      window.removeEventListener('resize', handleViewportResize);
      window.removeEventListener('color-palette-changed', handlePaletteChange);
      badgeManager.removeEventListener('badgeModeChanged', handleBadgeModeChange);
      
      // Clean up eventBus listeners
      eventBus.off('request-badges');
      eventBus.off('request-selected-job-number');
      eventBus.off('request-badges-for-job');
    });
    
    // Watch for changes to selectedJobNumber
    watch(selectedJobNumber, (newVal, oldVal) => {
      // console.log('[SkillBadges] selectedJobNumber changed:', oldVal, '→', newVal);
      try {
        positionBadges();
      } catch (error) {
        console.error('[SkillBadges] Error in positionBadges():', error);
      }
    });

    return {
      skillBadges,
      containerStyle,
      orientation,
      badgeOrder,
      getSelectedJobNumber,
      getBadgesForJobNumber,
      getSelectedCDiv,
      getSelectedCDivClone
    };
  },
  
  methods: {
    // Required by BaseVueComponentMixin
    getComponentDependencies() {
      return ['selectionManager', 'badgeManager', 'DOM'];
    },
    
    async initializeWithDependencies() {
      console.log('SkillBadges: Initializing with validated dependencies');
      // Initialization logic moved to setup() function
    },
    
    cleanupDependencies() {
      console.log('SkillBadges: Cleaning up dependencies');
      // Cleanup logic if needed
    }
  }
};
</script>

<style scoped>
#skill-badges-container {
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

#skill-badges-container::-webkit-scrollbar {
  display: none;
}

.skill-badge {
  position: absolute;
  height: 2.5em;
  min-width: 2.5em;
  padding: 0.5em 0.75em;
  margin-bottom: 0.1em;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.5em;
  white-space: nowrap;
  cursor: default;
  transition: all 0.2s ease;
  border: 1px solid transparent;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  background-color: var(--data-background-color, #ffffff);
  color: var(--data-foreground-color, #000000);
  border-color: var(--data-foreground-color, #000000);
}

/* Right-positioned badges (scene on left) */
.skill-badge.position-right {
  border-radius: 1.25em 0 0 1.25em;
  border-right: none;
  text-align: right;
  right: 0 !important;
  left: auto !important;
  justify-content: flex-end;
  width: auto !important;
  min-width: fit-content;
}

/* Left-positioned badges (scene on right) */
.skill-badge.position-left {
  border-radius: 0 1.25em 1.25em 0;
  border-left: none;
  text-align: left;
  left: 0 !important;
  justify-content: flex-start;
  width: auto !important;
  min-width: fit-content;
}

.skill-badge.hovered {
  background-color: var(--data-background-color-hovered, #f0f0f0);
  color: var(--data-foreground-color-hovered, #000000);
  border-color: white;
  border-width: 2px;
  transform: scale(1.05);
}

.skill-badge.selected {
  background-color: var(--data-background-color-selected, #e0e0e0);
  color: var(--data-foreground-color-selected, #000000);
  border-color: white;
  border-width: 2px;
  transform: scale(1.1);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}
</style>