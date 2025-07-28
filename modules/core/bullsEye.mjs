// modules/core/bullsEye.mjs
// Simple BullsEye positioning without IM framework

/**
 * Simple BullsEye positioning system
 */
class BullsEye {
    constructor() {
        this._bullsEyeElement = null;
        this._sceneContainer = null;
    }

    /**
     * Initialize with DOM elements
     */
    initialize(bullsEyeElement, sceneContainer) {
        this._bullsEyeElement = bullsEyeElement;
        this._sceneContainer = sceneContainer;
        
        // Position bulls-eye at center of scene container
        this._centerBullsEye();
        
        // Listen for viewport resize events
        window.addEventListener('resize', () => {
            this._centerBullsEye();
        });
        
        // Listen for resize handle changes
        window.addEventListener('resize-handle-changed', () => {
            this._centerBullsEye();
        });

        console.log('[BullsEye] Simple initialization complete');
    }

    _centerBullsEye() {
        if (!this._bullsEyeElement || !this._sceneContainer) return;

        const rect = this._sceneContainer.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        this._bullsEyeElement.style.position = 'fixed';
        this._bullsEyeElement.style.left = `${centerX}px`;
        this._bullsEyeElement.style.top = `${centerY}px`;
        this._bullsEyeElement.style.transform = 'translate(-50%, -50%)';
        this._bullsEyeElement.style.zIndex = '98';
        this._bullsEyeElement.style.pointerEvents = 'none';

        // Dispatch event for other components
        window.dispatchEvent(new CustomEvent('bulls-eye-moved', {
            detail: { position: { x: centerX, y: centerY } }
        }));
    }

    getPosition() {
        if (!this._bullsEyeElement) return { x: 0, y: 0 };
        
        // Return the same coordinate system used for positioning
        // Parse the left/top values that were set during _centerBullsEye()
        const left = parseFloat(this._bullsEyeElement.style.left) || 0;
        const top = parseFloat(this._bullsEyeElement.style.top) || 0;
        
        return {
            x: left,
            y: top
        };
    }

    recenter() {
        this._centerBullsEye();
    }

    isReady() {
        return this._bullsEyeElement !== null && this._sceneContainer !== null;
    }

    getBullsEyeElement() {
        return this._bullsEyeElement;
    }
}

// Create and export singleton
export const bullsEye = new BullsEye();
export default bullsEye;

// Make available globally for backwards compatibility
if (typeof window !== 'undefined') {
    window.bullsEye = bullsEye;
}