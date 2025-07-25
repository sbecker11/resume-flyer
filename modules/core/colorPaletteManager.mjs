/**
 * ColorPaletteManager - IM Component wrapper around the useColorPalette composable
 * This ensures the color palette system is properly initialized before other components depend on it
 */

import { BaseComponent } from './abstracts/BaseComponent.mjs';
import { useColorPalette } from '../composables/useColorPalette.mjs';

class ColorPaletteManager extends BaseComponent {
    constructor() {
        super('ColorPaletteManager');
        this.composableInstance = null;
        this.readyPromise = null;
    }

    getPriority() {
        return 'critical'; // Must initialize before components that need color palettes
    }

    getDependencies() {
        return []; // ColorPaletteManager is a fundamental component with no IM dependencies
    }

    initialize(dependencies = {}) {
        window.CONSOLE_LOG_IGNORE('[ColorPaletteManager] Initializing color palette system...');
        
        try {
            // Import should be at top of file, not dynamic
            // Initialize the composable synchronously
            this.composableInstance = useColorPalette();
            
            window.CONSOLE_LOG_IGNORE('[ColorPaletteManager] Color palette system ready');
            
        } catch (error) {
            console.error('[ColorPaletteManager] Failed to initialize:', error);
            throw error;
        }
    }

    destroy() {
        this.composableInstance = null;
        this.readyPromise = null;
        // isInitialized is managed by BaseComponent automatically
    }

    // Public API - delegates to the composable
    
    /**
     * Get the composable instance (for components that need direct access)
     * @returns {Object} The useColorPalette composable instance
     */
    getComposable() {
        this.checkInitialized();
        return this.composableInstance;
    }

    /**
     * Apply palette to element (delegates to composable)
     * @param {HTMLElement} element - The element to apply palette to
     * @param {string} paletteName - Optional palette name
     */
    applyPaletteToElement(element, paletteName = null) {
        this.checkInitialized();
        
        // Call the standalone applyPaletteToElement function from the composable
        if (this.composableInstance && this.composableInstance.applyPaletteToElement) {
            return this.composableInstance.applyPaletteToElement(element, paletteName);
        } else {
            // Fallback - import the function directly
            import('../composables/useColorPalette.mjs').then(({ applyPaletteToElement }) => {
                applyPaletteToElement(element);
            });
        }
    }

    /**
     * Check if component is properly initialized
     * @throws {Error} If component is not initialized
     * @private
     */
    checkInitialized() {
        if (!this.isInitialized || !this.composableInstance) {
            throw new Error('[ColorPaletteManager] Component not initialized');
        }
    }
}

// Create and export singleton instance
export const colorPaletteManager = new ColorPaletteManager();

// Export for testing
export { ColorPaletteManager };