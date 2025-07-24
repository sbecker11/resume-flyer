import { BaseComponent } from '../core/abstracts/BaseComponent.mjs';
import * as viewPort from '../core/viewPortModule.mjs';

/**
 * SceneContainer - Manages the scene container DOM element and provides it to other components
 * This component ensures the scene-container element is ready before other components try to access it
 */
class SceneContainer extends BaseComponent {
    constructor() {
        super('SceneContainer');
        this._sceneContainer = null;
    }

    getPriority() {
        return 'high'; // High priority since many components depend on this
    }

    async initialize({ VueDomManager }) {
        window.CONSOLE_LOG_IGNORE('[SceneContainer] Initializing with Vue DOM ready...');
        
        // VueDomManager dependency ensures Vue DOM is ready before we access DOM elements
        this._sceneContainer = document.getElementById('scene-container');
        
        if (!this._sceneContainer) {
            throw new Error('[SceneContainer] scene-container element not found - check Vue template');
        }
        
        // Log scene container dimensions once ready
        const sceneHeight = this._sceneContainer.clientHeight;
        const sceneOffsetHeight = this._sceneContainer.offsetHeight;
        const sceneBoundingHeight = this._sceneContainer.getBoundingClientRect().height;
        window.CONSOLE_LOG_IGNORE(`[SCENE-CONTAINER-INIT] Scene container ready:`, {
            clientHeight: sceneHeight,
            offsetHeight: sceneOffsetHeight,
            boundingHeight: sceneBoundingHeight,
            element: this._sceneContainer
        });
        
        // Flexbox layout is managed via CSS - Timeline has order: 0 to ensure it's first
        
        window.CONSOLE_LOG_IGNORE('[SceneContainer] Initialization complete');
    }

    destroy() {
        this._sceneContainer = null;
    }


    // Public API methods
    getSceneContainer() {
        return this._sceneContainer;
    }

    isReady() {
        return this._sceneContainer !== null;
    }
}

// Create singleton instance - this will auto-register with InitializationManager
const sceneContainer = new SceneContainer();

// Export the instance for service locator access
export { sceneContainer };
export default sceneContainer;

// Backward compatibility functions
export function isInitialized() {
    return sceneContainer.isReady();
}

// called from updateResumeContainer
export function updateSceneContainer() {
    // viewPort updates internal properties and its children
    // using the current sceneContainer.offsetWidth and resumeContainer.offset
    viewPort.updateViewPort();
}

/**
 * Ensure the scene container and its children have proper pointer events
 * This is especially important when the focal point is locked
 */
export function ensurePointerEvents() {
    const sceneContainerElement = sceneContainer.getSceneContainer();
    if (!sceneContainerElement) {
        window.CONSOLE_LOG_IGNORE("Scene container not ready");
        return;
    }
    
    // Ensure scene container has pointer events
    if (sceneContainerElement.style.pointerEvents !== 'auto') {
        window.CONSOLE_LOG_IGNORE("Fixing scene container pointer-events");
        sceneContainerElement.style.pointerEvents = 'auto';
    }
    
    // Ensure all bizCardDivs have pointer events
    const bizCardDivs = sceneContainerElement.querySelectorAll('.biz-card-div');
    bizCardDivs.forEach(div => {
        if (div.style.pointerEvents !== 'auto') {
            window.CONSOLE_LOG_IGNORE(`Fixing pointer-events for ${div.id}`);
            div.style.pointerEvents = 'auto';
        }
    });
    
    window.CONSOLE_LOG_IGNORE("Scene container and bizCardDivs pointer events fixed");
}

/**
 * Ensures the gradient overlays are properly positioned within the scene container
 */
export function setupGradientOverlays() {
    const scenePlaneEl = document.getElementById('scene-plane');
    if (!scenePlaneEl) {
        window.CONSOLE_LOG_IGNORE("setupGradientOverlays: scene-plane element not found");
        return;
    }

    let topGradient = document.getElementById('scene-plane-top-gradient');
    if (!topGradient) {
        topGradient = document.createElement('div');
        topGradient.id = 'scene-plane-top-gradient';
        scenePlaneEl.prepend(topGradient);
    }

    let btmGradient = document.getElementById('scene-plane-btm-gradient');
    if (!btmGradient) {
        btmGradient = document.createElement('div');
        btmGradient.id = 'scene-plane-btm-gradient';
        scenePlaneEl.prepend(btmGradient);
    }
}
