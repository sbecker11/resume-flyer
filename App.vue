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
import '@/modules/composables/useViewport.mjs'; // Import to register ViewportManager
import '@/modules/composables/useBullsEye.mjs'; // Import to register BullsEyeManager
import '@/modules/composables/useAimPoint.mjs'; // Import to register AimPointManager
import '@/modules/composables/useFocalPoint.mjs'; // Import to register FocalPointManager
import '@/modules/composables/useResizeHandle.mjs'; // Import to register ResizeHandleManager

export default {
  name: 'App',
  mixins: [BaseVueComponentMixin],
  components: {
    AppContent
  },
  
  methods: {
    getComponentDependencies() {
      return []; // App.vue doesn't need dependencies - just imports for registration
    },
    
    initialize(dependencies) {
      // App.vue doesn't need initialization - just a container for AppContent
      console.log('[App.vue] Container initialized');
    },
    
    cleanupDependencies() {
      // No dependencies to clean up
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