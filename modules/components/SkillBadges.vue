<template>
  <div 
    id="skill-badges-container"
    :style="containerStyle"
  >
    <div
      v-for="skill in skillBadges"
      v-show="skill.visible"
      :key="skill.id"
      :id="skill.id"
      class="skill-badge"
      :class="skill.classes"
      :data-color-index="skill.colorIndex"
      :style="skill.style"
      :data-visible="skill.visible"
    >
      {{ skill.name }}
    </div>
  </div>
</template>

<script>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { useViewport } from '@/modules/composables/useViewport.mjs'
import { useColorPalette, applyPaletteToElement } from '@/modules/composables/useColorPalette.mjs'
import { useBadgeManager } from '@/modules/composables/useBadgeManager.mjs'
import { jobs as jobsData } from '@/static_content/jobs/jobs.mjs'
import { AppState } from '@/modules/core/stateManager.mjs'

export default {
  name: 'SkillBadges',
  setup() {
    // SkillBadges component setup
    
    // Use composables
    const viewport = useViewport('SkillBadges')
    const { applyPaletteColors } = useColorPalette()
    const { isBadgesVisible, displayIcon, refreshVisibility } = useBadgeManager()
    
    // Composables loaded
    
    const skillBadges = ref([])
    const hoveredJobNumber = ref(null)
    const selectedJobNumber = ref(null)
    
    // Create badges for unique skills across all jobs
    const createSkillBadges = () => {
      // Creating skill badges
      const skillMap = new Map()
      const badges = []
      let badgeIndex = 0
      
      // Processing jobs for skill extraction
      
      // Collect all unique skills across all jobs
      jobsData.forEach((job, jobIndex) => {
        // Processing job skills
        const jobSkills = job['job-skills'] || {}
        const skillEntries = Object.entries(jobSkills)
        
        skillEntries.forEach(([skillId, skillName]) => {
          const skillTextNoSpaces = skillName.replace(/\s+/g, '')
          
          if (!skillMap.has(skillName)) {
            skillMap.set(skillName, {
              id: `badge-${badgeIndex}-${skillTextNoSpaces}`,
              name: skillName,
              jobNumbers: [jobIndex],
              primaryJobNumber: jobIndex,
              skillId: `skill-${skillName}-${badgeIndex}`,
              colorIndex: jobIndex,
              classes: [],
              visible: false, // Initialize as hidden
              style: {
                top: '0px'
              }
            })
            badgeIndex++
          } else {
            // Add this job to the existing skill's job numbers
            const existingSkill = skillMap.get(skillName)
            if (!existingSkill.jobNumbers.includes(jobIndex)) {
              existingSkill.jobNumbers.push(jobIndex)
            }
          }
        })
      })
      
      // Convert map to array and make each badge reactive
      skillMap.forEach((skill) => {
        badges.push(reactive(skill)) // Make each badge reactive
      })
      
      // Created skill badges
      
      // Apply vertical distribution to the badges
      distributeVertically(badges)
      
      // Initially mark all badges as hidden until a cDiv is selected
      badges.forEach(badge => {
        badge.visible = false // Use visible flag instead of direct style manipulation
      })
      
      skillBadges.value = badges
      // Updated skillBadges array
    }
    
    // Initial distribution (badges will be repositioned when selected)
    const distributeVertically = (badges) => {
      // Initial distribution
      const badgeHeight = 30
      const badgeSpacing = 10
      const totalSpacing = badgeHeight + badgeSpacing
      const startY = 100
      
      badges.forEach((badge, index) => {
        const yPos = startY + (index * totalSpacing)
        badge.style.top = `${yPos}px`
        badge.style.left = '0px'
        badge.style.position = 'absolute'
        // Initial position set
      })
    }
    
    // Get selected cDiv center Y position for clustering
    const getCDivCenterY = (jobNumber) => {
      const selectedCDiv = document.querySelector('.biz-card-div.selected') || 
                          document.querySelector(`[data-job-number="${jobNumber}"]`)
      if (!selectedCDiv) {
        // No cDiv found, using default
        return 1000 // Default to scene center if cDiv not found
      }

      const sceneContent = document.getElementById('scene-content')
      if (!sceneContent) {
        // Scene content not found
        return 1000
      }

      const sceneRect = sceneContent.getBoundingClientRect()
      const cardRect = selectedCDiv.getBoundingClientRect()
      const scrollTop = sceneContent.scrollTop

      // Calculate card center Y relative to scene-content
      const cardCenterY = (cardRect.top - sceneRect.top) + scrollTop + (cardRect.height / 2)
      
      // cDiv center Y calculated
      return cardCenterY
    }
    
    // Cluster badges around selected cDiv with proper spacing
    const clusterBadgesAroundCDiv = (relatedBadges, jobNumber) => {
      if (relatedBadges.length === 0) return
      
      const cDivCenterY = getCDivCenterY(jobNumber)
      const badgeHeight = 30 // Actual badge height
      const badgeSpacing = 10 // Space between badges
      const totalSpacing = badgeHeight + badgeSpacing
      const totalHeight = relatedBadges.length * totalSpacing - badgeSpacing // Remove spacing after last badge
      const startY = Math.max(50, cDivCenterY - (totalHeight / 2)) // Ensure badges don't go above viewport
      
      const orientation = AppState?.layout?.orientation || 'scene-left'
      
      relatedBadges.forEach((badge, index) => {
        const yPos = startY + (index * totalSpacing)
        badge.style.top = `${yPos}px`
        
        // Keep badges left-aligned within their container for both layouts
        // The container positioning handles the overall placement
        badge.style.left = '0px'
        badge.style.right = 'auto'
        
        // Badge clustered
      })
    }
    
    // Handle job selection
    const handleCardSelect = (event) => {
      console.log('🟢 handleCardSelect called:', event.detail)
      selectedJobNumber.value = event.detail.selectedJobNumber
      filterBadgesForJob(selectedJobNumber.value)
    }
    
    const handleCardDeselect = () => {
      // Card deselected
      selectedJobNumber.value = null
      // HIDE all badges when no job is selected
      skillBadges.value.forEach(badge => {
        badge.visible = false
      })
      // All badges hidden
    }
    
    // Filter badges for selected job
    const filterBadgesForJob = (jobNumber) => {
      console.log('🟡 filterBadgesForJob called for job:', jobNumber)
      
      if (jobNumber === null || jobNumber === undefined) {
        // Hide all badges when no job is selected
        skillBadges.value.forEach(badge => {
          badge.visible = false
        })
        return
      }
      
      // Hide all badges first
      skillBadges.value.forEach(badge => {
        badge.visible = false
      })
      
      // Show only related badges
      const relatedBadges = skillBadges.value.filter(badge => 
        badge.jobNumbers.includes(jobNumber)
      )
      
      // Found related badges
      
      // Cluster related badges around the selected cDiv
      clusterBadgesAroundCDiv(relatedBadges, jobNumber)
      
      // Apply color palette to related badges and show them
      relatedBadges.forEach((badge, index) => {
        badge.visible = true
        applyBadgeColors(badge, jobNumber)
      })
      
      // Debug: Log visible status of all badges
      const visibleCount = skillBadges.value.filter(b => b.visible).length
      const hiddenCount = skillBadges.value.filter(b => !b.visible).length
      console.log(`🔍 Badge visibility: ${visibleCount} visible, ${hiddenCount} hidden`)
    }
    
    // Apply cDiv background color to badge
    const applyBadgeColors = (badge, jobNumber) => {
      try {
        const selectedCDiv = document.querySelector('.biz-card-div.selected') || 
                            document.querySelector(`[data-job-number="${jobNumber}"]`)
        
        if (selectedCDiv) {
          const computedStyle = getComputedStyle(selectedCDiv)
          let backgroundColor = computedStyle.backgroundColor
          let textColor = computedStyle.color
          
          // If background is transparent or white, use a darker shade
          if (backgroundColor === 'rgba(0, 0, 0, 0)' || backgroundColor === 'transparent' || 
              backgroundColor === 'rgb(255, 255, 255)' || backgroundColor === 'white') {
            backgroundColor = '#2563eb' // Default blue if no color found
            textColor = 'white'
          }
          
          // Ensure good contrast - use white text for dark backgrounds
          const rgb = backgroundColor.match(/\d+/g)
          if (rgb && rgb.length >= 3) {
            const brightness = (parseInt(rgb[0]) * 299 + parseInt(rgb[1]) * 587 + parseInt(rgb[2]) * 114) / 1000
            textColor = brightness < 128 ? 'white' : '#1a1a1a'
          }
          
          // Apply colors to badge in the data
          badge.style = {
            ...badge.style,
            backgroundColor: backgroundColor,
            color: textColor,
            border: `1px solid ${textColor === 'white' ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.2)'}`
          }
        }
      } catch (error) {
        // Error applying badge colors - use default
        badge.style = {
          ...badge.style,
          backgroundColor: '#333333',
          color: 'white',
          border: '1px solid rgba(255,255,255,0.2)'
        }
      }
    }
    
    // Container style - positioned based on layout orientation
    const containerStyle = computed(() => {
      const skillBadgesZIndex = AppState?.constants?.zIndex?.badges ?? 95
      const orientation = AppState?.layout?.orientation || 'scene-left'
      
      // Computing container style
      
      if (orientation === 'scene-right') {
        // In scene-right layout, badges should be affixed to right inner edge of scene container
        return {
          position: 'absolute',
          right: '8px', // Right inner edge with small margin
          top: '0px',
          bottom: '0px',
          width: '120px',
          pointerEvents: 'none',
          zIndex: skillBadgesZIndex,
          overflow: 'visible'
        }
      } else {
        // In scene-left layout, badges extend outside scene container to the right
        return {
          position: 'absolute',
          left: '100%', // Start at right edge of scene container
          marginLeft: '8px', // Small gap from scene container
          top: '0px',
          bottom: '0px',
          width: '120px',
          pointerEvents: 'none',
          zIndex: skillBadgesZIndex,
          overflow: 'visible'
        }
      }
    })
    
    // Lifecycle
    onMounted(() => {
      // Component mounted - initializing
      
      // Initialize badges
      createSkillBadges()
      // Created badges
      
      // Listen for selection manager events
      if (window.selectionManager) {
        window.selectionManager.addEventListener('selectionChanged', handleCardSelect)
        window.selectionManager.addEventListener('selectionCleared', handleCardDeselect)
        // Added selection event listeners
        
        // Check current selection state multiple ways
        const currentSelection = window.selectionManager.getSelectedJobNumber()
        console.log('🟢 Current selection from selectionManager:', currentSelection)
        
        // Also check for selected cDiv in DOM
        const selectedCDiv = document.querySelector('.biz-card-div.selected')
        if (selectedCDiv) {
          const jobNumber = selectedCDiv.getAttribute('data-job-number')
          console.log('🟢 Found selected cDiv in DOM: job', jobNumber)
          if (jobNumber !== null) {
            filterBadgesForJob(parseInt(jobNumber))
          }
        } else {
          console.log('🟢 No selected cDiv found in DOM')
        }
        
        if (currentSelection !== null) {
          console.log('🟢 Filtering badges for existing selection:', currentSelection)
          filterBadgesForJob(currentSelection)
        } else {
          console.log('🟢 No current selection - badges will remain hidden')
        }
      } else {
        // selectionManager not available
      }
      
      // Debug: Show all created badges
      // All badges created
      
      // TEMPORARY: Show first 3 badges for testing if selection isn't working
      if (!currentSelection && !selectedCDiv) {
        console.log('🔧 TEMP: No selection found, showing first 3 badges for testing')
        skillBadges.value.slice(0, 3).forEach(badge => {
          badge.visible = true
        })
      }
      
      // Badges should now be visible based on selection
    })
    
    onUnmounted(() => {
      // Component unmounting
      
      // Clean up event listeners
      if (window.selectionManager) {
        window.selectionManager.removeEventListener('selectionChanged', handleCardSelect)
        window.selectionManager.removeEventListener('selectionCleared', handleCardDeselect)
      }
    })
    
    return {
      skillBadges,
      containerStyle
    }
  }
}
</script>

<style scoped>
#skill-badges-container {
  /* Container styles */
}

#skill-badges-container::-webkit-scrollbar {
  display: none;
}

.skill-badge {
  position: absolute;
  height: 28px;
  min-width: 40px;
  padding: 0 12px;
  border-radius: 14px;
  line-height: 28px;
  background-color: #333333;
  color: white;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
  font-size: 11px;
  font-weight: 400;
  border: 1px solid rgba(255, 255, 255, 0.2);
  cursor: pointer;
  transition: all 0.15s ease;
  pointer-events: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  white-space: nowrap;
  box-sizing: border-box;
  z-index: 100;
}

.skill-badge:hover {
  transform: scale(1.05);
  border-width: 2px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
}

.skill-badge.selected {
  transform: scale(1.08);
  border-width: 2px;
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.25);
}
</style>