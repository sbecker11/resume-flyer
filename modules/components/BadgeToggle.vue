<script>
import { BaseVueComponentMixin } from '@/modules/core/abstracts/BaseComponent.mjs';

export default {
  name: 'BadgeToggle',
  mixins: [BaseVueComponentMixin],
  
  data() {
    return {
      badgeMode: 'no-badges',
      selectedJobNumber: null,
      isHovering: false,
      hasJustClicked: false,
      // IM dependency injection properties
      badgeManager: null,
      selectionManager: null
      // isInitialized removed - managed by BaseComponent
    };
  },
  
  computed: {
    // Mode progression: none -> show -> none
    nextMode() {
      return this.badgeManager ? this.badgeManager.getNextMode() : 'no-badges';
    },
    
    // The mode whose icon we're currently displaying (for CSS class styling)
    displayedIconMode() {
      return this.isHovering ? this.nextMode : this.badgeMode;
    },
    
    // The actual icon to show with superscripts
    displayIcon() {
      return this.badgeManager ? this.badgeManager.getDisplayIcon(this.isHovering) : '○';
    },
    
    // CSS classes for the button
    buttonClasses() {
      return [
        this.displayedIconMode, // for mode-specific styling
        { hovering: this.isHovering } // for hover styling (colors)
      ];
    },
    
    // Disabled state - disable when no cDiv is selected or not initialized
    isDisabled() {
      return !this.isInitialized || this.selectedJobNumber === null;
    },
    
    // Tooltip text
    tooltipText() {
      if (this.isDisabled) {
        return 'Select a job card to enable badge controls';
      }
      return this.badgeManager ? this.badgeManager.getTooltipText(this.isHovering) : '';
    }
  },
  
  methods: {
    getComponentDependencies() {
      return ['BadgeManager', 'SelectionManager'];
    },
    
    initialize(dependencies) {
      console.log('[BadgeToggle] initializing with dependencies via IM:', Object.keys(dependencies));
      
      // Dependencies are guaranteed to be available - no null checks needed!
      this.badgeManager = dependencies.BadgeManager;
      this.selectionManager = dependencies.SelectionManager;
      
      // Event listeners moved to setupDom() method
      
      // Initialize with current values - dependencies guaranteed ready by IM
      this.badgeMode = this.badgeManager.getMode();
      this.selectedJobNumber = this.selectionManager.getSelectedJobNumber();
      
      console.log(`[BadgeToggle] Initialized - badgeMode=${this.badgeMode}, selectedJobNumber=${this.selectedJobNumber}, disabled=${this.isDisabled}`);
    },
    
    cleanupDependencies() {
      console.log('[BadgeToggle] cleanup');
      if (this.badgeManager) {
        this.badgeManager.removeEventListener('badgeModeChanged', this.handleBadgeModeChanged);
      }
      if (this.selectionManager) {
        this.selectionManager.removeEventListener('selectionChanged', this.handleSelectionChanged);
        this.selectionManager.removeEventListener('selectionCleared', this.handleSelectionCleared);
      }
    },
    
    // Event handlers
    handleBadgeModeChanged(event) {
      this.badgeMode = event.detail.mode;
    },
    
    handleSelectionChanged(event) {
      this.selectedJobNumber = event.detail.selectedJobNumber;
      this.$nextTick(() => {
        // window.CONSOLE_LOG_IGNORE(`[BadgeToggle] Selection changed to: ${this.selectedJobNumber}, disabled: ${this.isDisabled}`);
      });
    },
    
    handleSelectionCleared() {
      this.selectedJobNumber = null;
      this.$nextTick(() => {
        console.log(`[BadgeToggle] Selection cleared, disabled: ${this.isDisabled}`);
      });
    },
    
    // Component Methods
    toggleBadges(event) {
      event.stopPropagation();
      
      // Don't toggle if disabled
      if (this.isDisabled) {
        return;
      }
      
      if (this.badgeManager) {
        this.badgeManager.toggleMode('BadgeToggle');
      }
      // Mark that we just clicked (don't reset hover state yet)
      this.hasJustClicked = true;
      
      // Force a small delay to ensure the mode change has been processed
      setTimeout(() => {
        // This setTimeout ensures the DOM and computeds have updated
        // The isHovering state remains true, so we'll show the next mode of the NEW current mode
      }, 0);
    },
    
    handleMouseEnter() {
      this.isHovering = true;
      this.hasJustClicked = false;
    },
    
    handleMouseLeave() {
      this.isHovering = false;
      this.hasJustClicked = false;
    },

    /**
     * DOM setup phase - called after Vue DOM is ready
     * Moved from initialize() for proper DOM separation
     */
    async setupDom() {
      // DOM operations moved from initialize()
      // Set up event listeners that were moved from initialize()
      this.badgeManager.addEventListener('badgeModeChanged', this.handleBadgeModeChanged);
      this.selectionManager.addEventListener('selectionChanged', this.handleSelectionChanged);
      this.selectionManager.addEventListener('selectionCleared', this.handleSelectionCleared);
      
      console.log('[BadgeToggle.vue] DOM setup complete');
    }
  },
  
  beforeUnmount() {
    this.cleanupDependencies();
  }
};
</script>

<template>
  <button 
    id="badge-toggle" 
    class="toggle-circle"
    :class="buttonClasses"
    :disabled="isDisabled"
    @click.stop="toggleBadges" 
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
    :title="tooltipText">{{ displayIcon }}</button>
</template>

<style scoped>
#badge-toggle {
  font-size: 10px;
  font-weight: 100;
}

/* Hover state: next mode with black icon on white background */
#badge-toggle.hovering {
  background-color: white;
  color: black;
  border-color: black;
}

/* Additional visual feedback for active modes */
#badge-toggle.badges-only {
  background-color: rgba(0, 120, 0, 0.8); /* Green tint when badges showing */
}

/* Maintain hover effect precedence */
#badge-toggle.hovering {
  background-color: white !important;
}

/* Disabled state styling */
#badge-toggle:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  background-color: #666 !important;
  color: #999 !important;
}
</style>