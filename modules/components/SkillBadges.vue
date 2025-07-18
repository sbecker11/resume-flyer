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

export default {
  name: 'SkillBadges',
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
        
        if (jobNumber === 21) {
          console.log('[SkillBadges] Processing job 21 skills:', Object.keys(jobSkills).length, 'skills');
          console.log('[SkillBadges] Job 21 skill names:', Object.values(jobSkills));
        }
        
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
      console.log(`[SkillBadges] Created ${badges.length} skill badges`);
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
      if ( selectedJobNumber ) {
        const cDivClone = document.querySelector(`#biz-card-div-${selectedJobNumber}-clone`);
        if ( !cDivClone ) {
          throw new Error(`[SkillBadges] cDivClone for selected jobNumber:${selectedJobNumber} not found`);
        }
        return cDivClone;
      }
      return null;
    };

    // Position badges based on selected job number
    const positionBadges = () => {
      if (!badgeManager.isBadgesVisible()) {
        return;
      }

      const selectedCDiv = getSelectedCDiv();
      if ( selectedCDiv == null ) {
        return;
      }
      
      if (selectedJobNumber.value !== 21) return;
      
      // query the DOM to find the selected jobNumber
      const currentSelectedJobNumber = getSelectedJobNumber();
      if ( currentSelectedJobNumber == null ) {
        console.log("[SkillBadges] no selected job number found - positionBadges skipped");
        return;
      }
      
      // query the DOM to find all badges
      const badgeElements = document.querySelectorAll('.skill-badge');
      if ( badgeElements.length === 0 ) {
        console.log("[SkillBadges] no badges found");
        return;
      }

      if ( currentSelectedJobNumber !== null) {
        const selectedBadges = getBadgesForJobNumber(currentSelectedJobNumber);
        
        // find the related and unrelated badges
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

      //   // find the related and unrelated badges
      //   const relatedBadges = [];
      //   const unrelatedBadges = [];
      //   badges.forEach(badge => {
      //     const badgeElement = skillBadges.value.find(sb => sb.id === badge.id);
      //     if (badgeElement && badgeElement.jobNumbers.includes(selectedJobNumber)) {
      //       relatedBadges.push(badge);
      //     } else {
      //       unrelatedBadges.push(badge);
      //     }
      //   });
        
        // find the vertical bounds of the selected cDiv
        const cDivRect = selectedCDiv.getBoundingClientRect();
        const containerRect = document.getElementById('scene-content').getBoundingClientRect();
        const scrollTop = document.getElementById('scene-content').scrollTop;
        
        const cDivBounds = {
          top: cDivRect.top - containerRect.top + scrollTop,
          bottom: cDivRect.bottom - containerRect.top + scrollTop,
          centerY: (cDivRect.top + cDivRect.bottom) / 2 - containerRect.top + scrollTop
        };
                
        // Create callback to update Vue reactive data
        // this is called by BadgePositioner.positionBadges
        // after the badges have been positioned??
        const updatePositions = (positionData) => {
          console.log(`[SkillBadges] Updating ${positionData.length} badge positions in reactive data`);
          positionData.forEach(({ element, position }, index) => {
            const skillBadgeData = skillBadges.value.find(sb => sb.id === element.id);
            if (skillBadgeData) {
              skillBadgeData.style.top = `${position}px`;
              if (index < 3) {
                console.log(`[SkillBadges] Updated reactive data for ${skillBadgeData.name}: top=${skillBadgeData.style.top}`);
              }
            }
          });
        };
        
        // categorize and position selected badges
        const stats = badgePositioner.positionBadges([...badgeElements], relatedBadges, unrelatedBadges, cDivBounds, updatePositions);
        
        // Add debug log before emitting
        console.log('[SkillBadges] EMITTING badgeOrder:', badgeOrder.value);
        nextTick(() => {
          console.log('[SkillBadges] Emitting badges-positioned event with badgeOrder length:', badgeOrder.value.length);
          emit('badges-positioned', { badgeOrder: [...badgeOrder.value] });
          eventBus.emit('badges-positioned', { badgeOrder: [...badgeOrder.value] });
        });
      } else {
        // No selection - hide all badges by moving them off-screen
        window.CONSOLE_LOG_IGNORE('[SkillBadges] No selection - hiding all badges');
        skillBadges.value.forEach(skillBadge => {
          skillBadge.style.top = '-1000px'; // Move off-screen
        });
        badgeOrder.value = [];
        // console.log('[SkillBadges] badgeOrder to emit:', badgeOrder.value);
        emit('badges-positioned', { badgeOrder: [] });
      }
      
      updateBadgeStyles();

      // After all potential position updates, wait for the DOM to update
      // and then emit an event. This provides a reliable signal for other
      // components (like SankeyConnections) to know when to draw.
      nextTick(() => {
        // emit('badges-positioned'); // This line is now handled by the new_code
      });
    };
    
    // Update badge visual styles based on state
    const updateBadgeStyles = () => {
      // Log only the badges associated with the current selectedJobNumber
      if (selectedJobNumber.value !== null) {
        const associated = skillBadges.value.filter(skill => Array.isArray(skill.jobNumbers) && skill.jobNumbers.map(Number).includes(Number(selectedJobNumber.value)));
        console.log(`[SkillBadges] Badges associated with selectedJobNumber ${selectedJobNumber.value}:`, associated.map(b => ({ id: b.id, name: b.name, jobNumbers: b.jobNumbers })));
      }
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
      const newJobNumber = parseInt(event.detail.jobNumber);
      console.log('[SkillBadges] handleCardSelect called with job number:', newJobNumber);
      selectedJobNumber.value = newJobNumber;
      setTimeout(positionBadges, 50);
      // Log and emit after selection
      console.log('[SkillBadges] handleCardSelect, emitting badges-positioned for job', selectedJobNumber.value);
      emit('badges-positioned', { badgeOrder: [...badgeOrder.value] });
      eventBus.emit('badges-positioned', { badgeOrder: [...badgeOrder.value] });
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
      window.CONSOLE_LOG_IGNORE('[SkillBadges] Component mounted');
      
      createSkillBadges();
      
      // Set up event listeners
      selectionManager.addEventListener('hoverChanged', handleCardHover);
      selectionManager.addEventListener('hoverCleared', handleCardUnhover);
      window.addEventListener('card-select', handleCardSelect);
      window.addEventListener('card-deselect', handleCardDeselect);
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
      window.removeEventListener('card-select', handleCardSelect);
      window.removeEventListener('card-deselect', handleCardDeselect);
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
      console.log('[SkillBadges] selectedJobNumber changed:', oldVal, '→', newVal);
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