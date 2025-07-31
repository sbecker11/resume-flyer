<template>
  <div 
    v-if="isVisible"
    id="new-connection-lines-container"
    class="new-connection-lines"
    style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; pointer-events: none; z-index: 95;"
  >
    <svg 
      id="new-connection-lines-svg"
      style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; pointer-events: none; overflow: visible;"
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
    </svg>
  </div>
</template>

<script>
import { BaseVueComponentMixin } from '@/modules/core/abstracts/BaseComponent.mjs';
import { badgeManager } from '@/modules/core/badgeManager.mjs';

export default {
  name: 'ConnectionLines',
  mixins: [BaseVueComponentMixin],
  
  data() {
    return {
      connections: [],
      isVisible: false,
      badgeManager: null
    };
  },
  
  methods: {
    getComponentDependencies() {
      return ['BadgeManager'];
    },
    
    initialize(dependencies) {
      console.log('[ConnectionLines] Initializing...');
      this.badgeManager = dependencies.BadgeManager;
      this.isVisible = this.badgeManager?.isConnectionLinesVisible() || false;
    },
    
    async setupDom() {
      // Set up event listeners
      if (this.badgeManager) {
        this.badgeManager.addEventListener('badgeModeChanged', this.handleBadgeModeChange);
      }
      
      window.addEventListener('badges-positioned', this.handleBadgesPositioned);
      window.addEventListener('card-select', this.drawConnections);
      window.addEventListener('card-deselect', this.drawConnections);
      window.addEventListener('viewport-changed', this.drawConnections);
      window.addEventListener('resize', this.drawConnections);
      
      console.log('[ConnectionLines] DOM setup complete');
    },
    
    handleBadgeModeChange(event) {
      this.isVisible = this.badgeManager?.isConnectionLinesVisible() || false;
      if (this.isVisible) {
        this.drawConnections();
      } else {
        this.connections = [];
      }
    },
    
    handleBadgesPositioned() {
      if (this.isVisible) {
        this.drawConnections();
      }
    },
    
    drawConnections() {
      // Simplified connection drawing - just clear for now
      // This can be enhanced later with actual connection logic
      if (!this.isVisible) {
        this.connections = [];
        return;
      }
      
      console.log('[ConnectionLines] Drawing connections...');
      // TODO: Implement actual connection drawing logic
      this.connections = [];
    },
    
    cleanupDependencies() {
      if (this.badgeManager) {
        this.badgeManager.removeEventListener('badgeModeChanged', this.handleBadgeModeChange);
      }
      
      window.removeEventListener('badges-positioned', this.handleBadgesPositioned);
      window.removeEventListener('card-select', this.drawConnections);
      window.removeEventListener('card-deselect', this.drawConnections);
      window.removeEventListener('viewport-changed', this.drawConnections);
      window.removeEventListener('resize', this.drawConnections);
    }
  },
  
  beforeUnmount() {
    this.cleanupDependencies();
  }
};
</script>

<style scoped>
.connection-line {
  transition: stroke-width 0.2s ease, stroke-opacity 0.2s ease;
}

.connection-line:hover {
  stroke-width: 4;
  stroke-opacity: 1;
}
</style>