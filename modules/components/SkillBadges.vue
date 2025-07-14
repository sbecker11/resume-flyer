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
      :style="skill.style"
    >
      {{ skill.name }}
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { useViewport } from '@/modules/composables/useViewport.mjs';
import { useColorPalette, applyPaletteToElement } from '@/modules/composables/useColorPalette.mjs';
import { useLayoutToggle } from '@/modules/composables/useLayoutToggle.mjs';
import { jobs as jobsData } from '@/static_content/jobs/jobs.mjs';
import { AppState } from '@/modules/core/stateManager.mjs';
import { selectionManager } from '@/modules/core/selectionManager.mjs';
import { badgeManager } from '@/modules/core/badgeManager.mjs';
import { badgePositioner } from '@/modules/utils/BadgePositioner.mjs';

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
    
    // Create badges for unique skills across all jobs
    const createSkillBadges = () => {
      const skillMap = new Map();
      const badges = [];
      let badgeIndex = 0;
      
      // Collect all unique skills across all jobs
      jobsData.forEach((job, jobIndex) => {
        const jobSkills = job['job-skills'] || {};
        const skillEntries = Object.entries(jobSkills);
        
        skillEntries.forEach(([skillKey, skillName]) => {
          if (!skillMap.has(skillName)) {
            skillMap.set(skillName, {
              name: skillName,
              jobNumbers: [jobIndex],
              primaryJobNumber: jobIndex,
              id: `skill-badge-${badgeIndex}`,
              colorIndex: badgeIndex % 7
            });
            badgeIndex++;
          } else {
            const existingSkill = skillMap.get(skillName);
            if (!existingSkill.jobNumbers.includes(jobIndex)) {
              existingSkill.jobNumbers.push(jobIndex);
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
      window.CONSOLE_LOG_IGNORE(`[SkillBadges] Created ${badges.length} skill badges`);
    };
    
    // Position badges based on selection state
    const positionBadges = () => {
      if (!badgeManager.isBadgesVisible()) {
        window.CONSOLE_LOG_IGNORE('[SkillBadges] Skipping positioning - badges not visible');
        return;
      }
      
      const selectedCDiv = document.querySelector('.biz-card-div.selected');
      const badges = document.querySelectorAll('.skill-badge');
      
      window.CONSOLE_LOG_IGNORE(`[SkillBadges] positionBadges called - found ${badges.length} badge elements, selectedCDiv:`, selectedCDiv);
      
      if (selectedCDiv && selectedJobNumber.value !== null) {
        // Position around selected cDiv
        const relatedBadges = [];
        const unrelatedBadges = [];
        
        badges.forEach(badge => {
          const badgeElement = skillBadges.value.find(sb => sb.id === badge.id);
          if (badgeElement && badgeElement.jobNumbers.includes(selectedJobNumber.value)) {
            relatedBadges.push(badge);
          } else {
            unrelatedBadges.push(badge);
          }
        });
        
        const cDivRect = selectedCDiv.getBoundingClientRect();
        const containerRect = document.getElementById('scene-content').getBoundingClientRect();
        const scrollTop = document.getElementById('scene-content').scrollTop;
        
        const cDivBounds = {
          top: cDivRect.top - containerRect.top + scrollTop,
          bottom: cDivRect.bottom - containerRect.top + scrollTop,
          centerY: (cDivRect.top + cDivRect.bottom) / 2 - containerRect.top + scrollTop
        };
        
        // Debug the cDiv bounds calculation
        window.CONSOLE_LOG_IGNORE(`[SkillBadges] cDiv positioning debug:`, {
          cDivRect: { top: cDivRect.top, bottom: cDivRect.bottom, height: cDivRect.height },
          containerRect: { top: containerRect.top, bottom: containerRect.bottom },
          scrollTop,
          calculatedBounds: cDivBounds
        });
        
        // Create callback to update Vue reactive data
        const updatePositions = (positionData) => {
          window.CONSOLE_LOG_IGNORE(`[SkillBadges] Updating ${positionData.length} badge positions in reactive data`);
          positionData.forEach(({ element, position }, index) => {
            const skillBadgeData = skillBadges.value.find(sb => sb.id === element.id);
            if (skillBadgeData) {
              skillBadgeData.style.top = `${position}px`;
              if (index < 3) {
                window.CONSOLE_LOG_IGNORE(`[SkillBadges] Updated reactive data for ${skillBadgeData.name}: top=${skillBadgeData.style.top}`);
              }
            }
          });
        };
        
        const stats = badgePositioner.positionBadges([...badges], relatedBadges, unrelatedBadges, cDivBounds, updatePositions);
      } else {
        // No selection - hide all badges by moving them off-screen
        window.CONSOLE_LOG_IGNORE('[SkillBadges] No selection - hiding all badges');
        skillBadges.value.forEach(skillBadge => {
          skillBadge.style.top = '-1000px'; // Move off-screen
        });
      }
      
      updateBadgeStyles();

      // After all potential position updates, wait for the DOM to update
      // and then emit an event. This provides a reliable signal for other
      // components (like SankeyConnections) to know when to draw.
      nextTick(() => {
        emit('badges-positioned');
      });
    };
    
    // Update badge visual styles based on state
    const updateBadgeStyles = () => {
      skillBadges.value.forEach(skill => {
        const classes = ['skill-badge'];
        let filter = '';
        
        if (selectedJobNumber.value !== null) {
          if (skill.jobNumbers.includes(selectedJobNumber.value)) {
            classes.push('selected');
          } else {
            filter = 'brightness(0.5)';
          }
        }
        
        if (hoveredJobNumber.value !== null && skill.jobNumbers.includes(hoveredJobNumber.value)) {
          classes.push('hovered');
        }
        
        skill.classes = classes;
        skill.style.filter = filter;
      });
    };
    
    // Event handlers
    const handleCardSelect = (event) => {
      selectedJobNumber.value = parseInt(event.detail.jobNumber);
      setTimeout(positionBadges, 50);
    };
    
    const handleCardDeselect = () => {
      window.CONSOLE_LOG_IGNORE('[SkillBadges] Card deselected - hiding badges');
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
      const skillBadgesZIndex = AppState.constants.zIndex.badges;
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
      
      // Apply initial colors
      setTimeout(() => {
        document.querySelectorAll('.skill-badge').forEach(applyPaletteToElement);
        positionBadges();
      }, 200);
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
    });
    
    return {
      skillBadges,
      containerStyle,
      orientation
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