import { BaseComponent } from '../core/abstracts/BaseComponent.mjs';
import { initializationManager } from '../core/initializationManager.mjs';

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
        // Get ViewportManager from IM service locator
        this.viewportManager = initializationManager.getComponent('ViewportManager');
        window.CONSOLE_LOG_IGNORE('[SceneContainer] Functional initialization complete');
    }

    async setupDom() {
        window.CONSOLE_LOG_IGNORE('[SceneContainer] Setting up DOM access with Vue DOM ready...');
        
        // 🛡️ CRITICAL: Check for duplicate #scene-container elements immediately
        const sceneContainers = document.querySelectorAll('#scene-container');
        if (sceneContainers.length > 1) {
            throw new Error(`DUPLICATE #scene-container elements detected during DOM setup! Found ${sceneContainers.length} elements. Fix DOM duplication before SceneContainer can setup DOM.`);
        }
        
        // Look for the DOM element
        this._sceneContainer = document.getElementById('scene-container');
        
        if (!this._sceneContainer) {
            throw new Error('[SceneContainer] scene-container element not found - check Vue template');
        }
        
        // 🛡️ CRITICAL: Validate scene container geometry immediately - no retries
        this._validateGeometry();
        
        window.CONSOLE_LOG_IGNORE('[SceneContainer] DOM setup complete with valid geometry');
    }

    _validateGeometry() {
        // Force layout recalculation once
        void this._sceneContainer.offsetHeight;
        void this._sceneContainer.offsetWidth;
        
        const rect = this._sceneContainer.getBoundingClientRect();
        
        // Fail immediately on any invalid geometry
        if (rect.width <= 0 || rect.height <= 0) {
            throw new Error(`[SceneContainer] Invalid dimensions at initialization - fix CSS/layout timing: width=${rect.width}, height=${rect.height}`);
        }
        
        if (isNaN(rect.left) || isNaN(rect.top) || isNaN(rect.width) || isNaN(rect.height)) {
            throw new Error(`[SceneContainer] NaN geometry at initialization - fix DOM/CSS timing: ${JSON.stringify(rect)}`);
        }
        
        console.log('[SceneContainer] Geometry validated:', {
            width: rect.width,
            height: rect.height,
            left: rect.left,
            top: rect.top
        });
    }

    destroy() {
        this._sceneContainer = null;
    }


    // Public API methods
    getSceneContainer() {
        if (!this._sceneContainer) {
            // DOM setup hasn't happened yet - this is expected during functional initialization phase
            return null;
        }
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
    // ViewportManager updates internal properties via IM dependency injection
    if (sceneContainer.viewportManager) {
        sceneContainer.viewportManager.updateViewportProperties();
    } else {
        console.warn('[SceneContainer] ViewportManager not available for updateSceneContainer');
    }
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
