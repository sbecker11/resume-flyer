<template>
  <Suspense>
    <template #default>
      <AppContent />
    </template>
    <template #fallback>
      <div class="loading-overlay">
        <div class="spinner"></div>
        <p>Loading Your Experience...</p>
      </div>
    </template>
  </Suspense>
</template>

<script>
import AppContent from '@/modules/components/AppContent.vue';
import { BaseVueComponentMixin } from '@/modules/core/abstracts/BaseComponent.mjs';

// Import core components to ensure they register with IM during module loading
import '@/modules/core/stateManager.mjs';
import '@/modules/core/vueDomManager.mjs';
import '@/modules/scene/sceneContainerModule.mjs';
import '@/modules/core/selectionManager.mjs';
import '@/modules/core/bullsEye.mjs';
import '@/modules/core/badgeManager.mjs';
import '@/modules/utils/BadgePositioner.mjs';
import '@/modules/scene/bizDetailsDivModule.mjs';
import '@/modules/scene/CardsController.mjs';

export default {
  name: 'App',
  mixins: [BaseVueComponentMixin],
  
  components: {
    AppContent
  },
  
  methods: {
    getComponentDependencies() {
      // App.vue is a root component that only imports modules for side-effects
      // It doesn't directly use any managers, but the imports trigger registration
      return [];
    },
    
    async initialize(dependencies) {
      // App.vue doesn't need initialization - it just loads modules
      // The actual component initialization happens in AppContent.vue
      window.CONSOLE_LOG_IGNORE('[App] Root component ready - modules imported for IM registration');
    },
    
    cleanupDependencies() {
      // App.vue doesn't have any cleanup since it doesn't use managers directly
      window.CONSOLE_LOG_IGNORE('[App] Root component cleanup - no managers to clean up');
    }
  }
};
</script>

<style>
.loading-overlay {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  height: 100vh;
  width: 100vw;
  background: #1a1a1a;
  color: white;
  font-family: Arial, sans-serif;
}

.spinner {
  width: 50px;
  height: 50px;
  border: 3px solid #333;
  border-top: 3px solid #fff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 20px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
</style>