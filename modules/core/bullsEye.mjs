// modules/core/bullsEye.mjs
// BullsEye component with proper dependency management

import { BaseComponent } from './abstracts/BaseComponent.mjs';
import { initializationManager } from './initializationManager.mjs';

/**
 * BullsEye - Manages the bulls-eye crosshair element positioning
 * Depends on SceneContainer to ensure scene-container element is ready
 */
class BullsEye extends BaseComponent {
    constructor() {
        super('BullsEye');
        this._bullsEyeElement = null;
    }

    getDependencies() {
        return ['SceneContainer']; // Wait for SceneContainer to be ready
    }

    getPriority() {
        return 'medium'; // Initialize after SceneContainer but before other components
    }

    async initialize(dependencies = {}) {
        try {
            // window.CONSOLE_LOG_IGNORE('[BullsEye] Initializing with SceneContainer dependency...');
            
            // Get SceneContainer from service locator - guaranteed to be ready
            const sceneContainer = initializationManager.getComponent('SceneContainer');
            if (!sceneContainer) {
                throw new Error('[BullsEye] SceneContainer not available from service locator');
            }

            // Get the scene container element - guaranteed to exist
            const sceneContainerElement = sceneContainer.getSceneContainer();
            if (!sceneContainerElement) {
                throw new Error('[BullsEye] SceneContainer element not ready');
            }

            // Find the bulls-eye element
            this._bullsEyeElement = document.getElementById('bulls-eye');
            if (!this._bullsEyeElement) {
                throw new Error('[BullsEye] #bulls-eye element not found in DOM');
            }

            // window.CONSOLE_LOG_IGNORE('[BullsEye] Elements found, setting up centering...');
            // window.CONSOLE_LOG_IGNORE('[BullsEye] Scene container dimensions:', {
            //     width: sceneContainerElement.clientWidth,
            //     height: sceneContainerElement.clientHeight,
            //     rect: sceneContainerElement.getBoundingClientRect()
            // });

            // Clear any existing inline styles
            this._bullsEyeElement.style.removeProperty('top');
            this._bullsEyeElement.style.removeProperty('left');
            this._bullsEyeElement.style.removeProperty('transform');

            // Position at scene container center
            this._centerBullsEye(sceneContainerElement);

            // window.CONSOLE_LOG_IGNORE('[BullsEye] Initialization complete');
        } catch (error) {
            console.error('[BullsEye] Initialization failed:', error);
            throw error; // Re-throw so IM knows initialization failed
        }
    }

    _centerBullsEye(sceneContainerElement) {
        const sceneRect = sceneContainerElement.getBoundingClientRect();
        const centerX = sceneRect.left + sceneRect.width / 2;
        const centerY = sceneRect.top + sceneRect.height / 2;
        
        // window.CONSOLE_LOG_IGNORE('[BullsEye] Centering - sceneRect:', sceneRect);
        // window.CONSOLE_LOG_IGNORE('[BullsEye] Calculated center:', { centerX, centerY });
        
        this._bullsEyeElement.style.position = 'fixed';
        this._bullsEyeElement.style.left = `${centerX}px`;
        this._bullsEyeElement.style.top = `${centerY}px`;
        this._bullsEyeElement.style.transform = 'translate(-50%, -50%)';
        this._bullsEyeElement.style.zIndex = '1000';
        
        // window.CONSOLE_LOG_IGNORE('[BullsEye] Applied styles:', {
        //     position: this._bullsEyeElement.style.position,
        //     left: this._bullsEyeElement.style.left,
        //     top: this._bullsEyeElement.style.top,
        //     transform: this._bullsEyeElement.style.transform
        // });

        // Force a layout recalculation
        void this._bullsEyeElement.offsetHeight;

        // Verify the positioning worked
        const rect = this._bullsEyeElement.getBoundingClientRect();
        const referenceCenter = {
            x: sceneRect.left + sceneRect.width / 2,
            y: sceneRect.top + sceneRect.height / 2
        };
        
        const bullsEyeCenter = {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2
        };
        
        window.CONSOLE_LOG_IGNORE('[BullsEye] Scene center:', referenceCenter);
        window.CONSOLE_LOG_IGNORE('[BullsEye] BullsEye center:', bullsEyeCenter);
        const distance = Math.sqrt(
            Math.pow(bullsEyeCenter.x - referenceCenter.x, 2) + 
            Math.pow(bullsEyeCenter.y - referenceCenter.y, 2)
        );
        window.CONSOLE_LOG_IGNORE('[BullsEye] Distance from scene center:', distance.toFixed(2) + 'px');
    }

    destroy() {
        this._bullsEyeElement = null;
    }

    // Public API methods
    getBullsEyeElement() {
        return this._bullsEyeElement;
    }

    isReady() {
        return this._bullsEyeElement !== null;
    }

    recenter() {
        const sceneContainer = initializationManager.getComponent('SceneContainer');
        if (sceneContainer && this._bullsEyeElement) {
            const sceneContainerElement = sceneContainer.getSceneContainer();
            if (sceneContainerElement) {
                this._centerBullsEye(sceneContainerElement);
            }
        }
    }
}

// Create singleton instance - this will auto-register with InitializationManager
const bullsEye = new BullsEye();

// Export the instance for service locator access
export { bullsEye };
export default bullsEye;

// Backward compatibility functions for existing code
export function initialize() {
    // Components should now get BullsEye through service locator instead
    console.warn('[BullsEye] initialize() is deprecated. Use initializationManager.getComponent("BullsEye") instead');
    return Promise.resolve();
}

export function isInitialized() {
    return bullsEye.isReady();
}

export function getBullsEye() {
    return bullsEye.getBullsEyeElement();
}

export function getBullsEyeElement() {
    return bullsEye.getBullsEyeElement();
}

export function recenter() {
    return bullsEye.recenter();
}