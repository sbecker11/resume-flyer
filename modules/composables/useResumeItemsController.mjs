// modules/composables/useResumeItemsController.mjs
// Vue 3 composable wrapper for legacy ResumeItemsController

import { useResumeItemsController as useResumeItemsService, useResumeListController } from '../core/globalServices'

// Composable wrapper to access the legacy controller via provide/inject
export function useResumeItemsController() {
  const resumeItemsController = useResumeItemsService()
  const resumeListController = useResumeListController()
  
  // Return wrapper functions that handle dependency injection
  return {
    // Core controller functions
    getInstance: () => resumeItemsController,
    
    // Height recalculation helper that uses the injected resume list controller
    recalculateHeights: () => {
      if (resumeListController?.infiniteScroller) {
        resumeListController.infiniteScroller.recalculateHeights()
        console.log('[useResumeItemsController] Triggered height recalculation via provide/inject')
      } else {
        console.warn('[useResumeItemsController] Resume list controller not available for height recalculation')
      }
    },
    
    // Direct access to controller methods
    createAllBizResumeDivs: (bizCardDivs) => {
      return resumeItemsController?.createAllBizResumeDivs?.(bizCardDivs)
    },
    
    handleSelectionChanged: (selectedJobNumber, caller) => {
      return resumeItemsController?.handleSelectionChanged?.(selectedJobNumber, caller)
    },
    
    handleSelectionCleared: (caller) => {
      return resumeItemsController?.handleSelectionCleared?.(caller)
    },
    
    },
    
    handleColorPaletteChanged: (filename, paletteName, previousFilename) => {
      return resumeItemsController?.handleColorPaletteChanged?.(filename, paletteName, previousFilename)
    },
    
    // Check if controller is available
    isAvailable: () => !!resumeItemsController
  }
}
