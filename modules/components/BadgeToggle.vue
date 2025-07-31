<template>
  <button 
    id="badge-toggle" 
    class="toggle-circle"
    :class="buttonClasses"
    :disabled="isDisabled"
    @click.stop="toggleBadges" 
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
    :title="tooltipText">
    <span class="icon-sign">{{ iconSign }}</span><span class="icon-letter">{{ iconLetter }}</span>
  </button>
</template>

<script>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useBadgeManager } from '@/modules/composables/useBadgeManager.mjs'

export default {
  name: 'BadgeToggle',
  setup() {
    console.log('[BadgeToggle] Setup function called')
    
    // Use the new badge manager composable
    const { isBadgesVisible, displayIcon, modeDescription } = useBadgeManager()
    
    // Local reactive state
    const selectedJobNumber = ref(null)
    const isHovering = ref(false)
    const hasJustClicked = ref(false)
    
    // Computed properties
    const buttonClasses = computed(() => [
      isBadgesVisible.value ? 'show-badges' : 'hide-badges',
      { hovering: isHovering.value }
    ])
    
    const isDisabled = computed(() => {
      return selectedJobNumber.value === null || selectedJobNumber.value === undefined
    })
    
    // Split the icon into sign and letter for different styling
    const iconSign = computed(() => {
      const icon = displayIcon.value
      return icon.charAt(0) // + or -
    })
    
    const iconLetter = computed(() => {
      const icon = displayIcon.value
      return icon.charAt(1) // B
    })
    
    const tooltipText = computed(() => {
      if (isDisabled.value) {
        return 'Select a job card to enable badge controls'
      }
      return `Current: ${modeDescription.value} (badges permanently enabled)`
    })
    
    // Event handlers
    const handleMouseEnter = () => {
      isHovering.value = true
      hasJustClicked.value = false
    }
    
    const handleMouseLeave = () => {
      isHovering.value = false
      hasJustClicked.value = false
    }
    
    const toggleBadges = (event) => {
      event.stopPropagation()
      console.log('[BadgeToggle] Toggle disabled - badges permanently enabled')
      // No toggle functionality - badges always visible
    }
    
    // Selection event handlers
    const handleSelectionChanged = (event) => {
      console.log('[BadgeToggle] Selection change event received:', event.detail)
      selectedJobNumber.value = event.detail.selectedJobNumber
      console.log(`[BadgeToggle] Selection changed to: ${selectedJobNumber.value}`)
    }
    
    const handleSelectionCleared = () => {
      selectedJobNumber.value = null
      console.log('[BadgeToggle] Selection cleared')
    }
    
    // Lifecycle
    onMounted(async () => {
      console.log('[BadgeToggle] Component mounted')
      
      try {
        // Set up selection manager event listeners
        const { selectionManager } = await import('@/modules/core/selectionManager.mjs')
        
        if (selectionManager) {
          selectionManager.addEventListener('selectionChanged', handleSelectionChanged)
          selectionManager.addEventListener('selectionCleared', handleSelectionCleared)
          
          // Get current selection
          selectedJobNumber.value = selectionManager.getSelectedJobNumber() || null
          console.log(`[BadgeToggle] Initial selectedJobNumber: ${selectedJobNumber.value}`)
        }
        
        console.log('[BadgeToggle] Initialization complete:', {
          isBadgesVisible: isBadgesVisible.value,
          displayIcon: displayIcon.value,
          selectedJobNumber: selectedJobNumber.value,
          isDisabled: isDisabled.value
        })
        
      } catch (error) {
        console.error('[BadgeToggle] Initialization failed:', error)
      }
    })
    
    onUnmounted(async () => {
      console.log('[BadgeToggle] Component unmounting')
      
      try {
        // Clean up event listeners
        const { selectionManager } = await import('@/modules/core/selectionManager.mjs')
        
        if (selectionManager) {
          selectionManager.removeEventListener('selectionChanged', handleSelectionChanged)
          selectionManager.removeEventListener('selectionCleared', handleSelectionCleared)
        }
      } catch (error) {
        console.error('[BadgeToggle] Cleanup failed:', error)
      }
    })
    
    return {
      // Reactive state
      selectedJobNumber,
      isHovering,
      hasJustClicked,
      
      // Computed properties
      buttonClasses,
      isDisabled,
      iconSign,
      iconLetter,
      tooltipText,
      
      // Event handlers
      handleMouseEnter,
      handleMouseLeave,
      toggleBadges,
      
      // Badge manager state
      isBadgesVisible,
      displayIcon,
      modeDescription
    }
  }
}
</script>

<style scoped>
#badge-toggle {
  /* Match other toggle-circle buttons */
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid white;
  background-color: var(--button-bg-color, #555);
  color: var(--button-text-color, white);
  cursor: pointer;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 14px;
  font-weight: bold;
  padding: 0;
  flex-shrink: 0;
  transition: all 0.2s ease;
}

/* Icon part styling - smaller overall font sizes */
.icon-sign {
  font-size: 12px;
  font-weight: bold;
}

.icon-letter {
  font-size: 11px;
  font-weight: bold;
}

/* Show badges mode: +B white on transparent */
#badge-toggle.show-badges {
  background-color: transparent;
  color: white;
  border-color: white;
}

/* Hide badges mode: -B default styling (already set in base) */
#badge-toggle.hide-badges {
  background-color: var(--button-bg-color, #555);
  color: white;
}

/* Hover state: show next mode - black on white */
#badge-toggle.hovering {
  background-color: white !important;
  color: black !important;
  border-color: black;
}

/* Disabled state styling */
#badge-toggle:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  background-color: #666 !important;
  color: #999 !important;
}
</style>