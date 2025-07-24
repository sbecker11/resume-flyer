// modules/core/viewPortModule.mjs

import { BaseComponent } from './abstracts/BaseComponent.mjs';
import * as utils from '../utils/utils.mjs';    
import * as domUtils from '../utils/domUtils.mjs';

// Constants
const VIEWPORT_PADDING = 0; // Padding around the viewPortProperties

class ViewPortModule extends BaseComponent {
    constructor() {
        super('ViewPortModule');
        
        // ViewPort state
        this.viewPortProperties = {
            padding: VIEWPORT_PADDING,
            top: null,
            left: null,
            right: null,
            bottom: null,
            centerX: null,
            centerY: null,
            width: null,
            height: null
        };

        this._sceneContainer = null;
        this._resumeContainer = document.getElementById("resume-container");
        this._resizeObserver = null;
    }


    /**
     * Initialize the viewport module with dependencies
     */
    async initialize(dependencies = {}) {
        // Get scene-container element directly - should be available since IM manages DOM lifecycle
        this._sceneContainer = document.getElementById('scene-container');
        if (!this._sceneContainer) {
            throw new Error('[VIEWPORT-INIT] scene-container element not found - IM should have ensured DOM readiness');
        }
        
        window.CONSOLE_LOG_IGNORE('[VIEWPORT-INIT] scene-container element found immediately (IM managed lifecycle)');
        
        // Log scene container height during viewport initialization
        const sceneHeight = this._sceneContainer.clientHeight;
        const sceneOffsetHeight = this._sceneContainer.offsetHeight;
        const sceneBoundingHeight = this._sceneContainer.getBoundingClientRect().height;
        window.CONSOLE_LOG_IGNORE(`[VIEWPORT-INIT] Scene container height during viewport setup:`, {
            clientHeight: sceneHeight,
            offsetHeight: sceneOffsetHeight,
            boundingHeight: sceneBoundingHeight,
            element: this._sceneContainer
        });
        
        // Bind methods
        this.boundCalculateViewPortProperties = this.calculateViewPortProperties.bind(this);
        this.boundUpdateViewPort = this.updateViewPort.bind(this);
        
        // Initial calculation
        this.calculateViewPortProperties();

        // Listen for resize events to recalculate properties
        window.addEventListener('resize', this.boundCalculateViewPortProperties);

        // Add ResizeObserver to detect scene container size changes
        if (typeof ResizeObserver !== 'undefined') {
            this._resizeObserver = new ResizeObserver(() => {
                this.updateViewPort();
            });
            this._resizeObserver.observe(this._sceneContainer);
        }

        window.CONSOLE_LOG_IGNORE('ViewPortModule initialized via IM');
    }

    destroy() {
        // Remove event listeners
        if (this.boundCalculateViewPortProperties) {
            window.removeEventListener('resize', this.boundCalculateViewPortProperties);
        }
        
        // Disconnect ResizeObserver
        if (this._resizeObserver) {
            this._resizeObserver.disconnect();
            this._resizeObserver = null;
        }
        
        this._sceneContainer = null;
        window.CONSOLE_LOG_IGNORE('ViewPortModule destroyed');
    }

    /**
     * called from sceneContainer.updateSceneContainer
     * viewPort updates internal properties and its children
     * using the current sceneContainer.offsetWidth and resumeContainer.offsetWidth
     * tells the bullsEye to update the position of its HTML element
     */
    updateViewPort() {
        // BaseComponent guarantees this is only called when initialized
        
        // Skip updates during layout transitions to prevent race conditions
        if (window.isLayoutTransitioning) {
            window.CONSOLE_LOG_IGNORE('[ViewPort] Skipping update during layout transition');
            return;
        }
        
        // Force a layout recalculation to get accurate measurements
        void this._sceneContainer.offsetHeight;
        void this._sceneContainer.offsetWidth;
        
        // Get a stable scene container rect - retry multiple times if needed
        let sceneContainerRect = this._sceneContainer.getBoundingClientRect();
        let retryCount = 0;
        
        // Retry if the rect seems unstable (width is 0 or very small) or if left position seems wrong
        while ((sceneContainerRect.width < 10 || sceneContainerRect.left < 0) && retryCount < 3) {
            // Force another layout recalculation
            void this._sceneContainer.offsetHeight;
            void this._sceneContainer.offsetWidth;
            void this._sceneContainer.getBoundingClientRect(); // Force a reflow
            sceneContainerRect = this._sceneContainer.getBoundingClientRect();
            retryCount++;
        }

        // Viewport properties are directly based on scene container properties
        this.viewPortProperties.padding = VIEWPORT_PADDING;
        this.viewPortProperties.top = sceneContainerRect.top - this.viewPortProperties.padding;
        this.viewPortProperties.left = sceneContainerRect.left - this.viewPortProperties.padding;
        this.viewPortProperties.right = sceneContainerRect.right + this.viewPortProperties.padding;
        this.viewPortProperties.bottom = sceneContainerRect.bottom + this.viewPortProperties.padding;
        // Viewport center is simply the center of the scene container in app-container coordinates
        this.viewPortProperties.centerX = sceneContainerRect.left + sceneContainerRect.width / 2;
        this.viewPortProperties.centerY = sceneContainerRect.top + sceneContainerRect.height / 2;
        this.viewPortProperties.width = sceneContainerRect.width;
        this.viewPortProperties.height = sceneContainerRect.height;
        
        // Log scene container height during viewport updates
        // window.CONSOLE_LOG_IGNORE(`[VIEWPORT-UPDATE] Scene container height:`, {
        //     clientHeight: this._sceneContainer.clientHeight,
        //     offsetHeight: this._sceneContainer.offsetHeight,
        //     boundingHeight: sceneContainerRect.height,
        //     viewportHeight: this.viewPortProperties.height,
        //     retries: retryCount
        // });
        
        // Viewport properties updated
        
        // Calculate bullsEye position as midpoint between window left edge (0) and resize handle center
        // If handle is at left edge (initial state), use window width / 2 as initial position
        // const handleLeft = resizeHandle.getResizeHandleRect.left || window.innerWidth / 2;

        // BullsEye positioning is now handled by the composable-based useBullsEye
        // which listens to viewport-changed events
        
        // Dispatch viewport-changed event for other components to listen to
        const event = new CustomEvent('viewport-changed', { 
            detail: { 
                centerX: this.viewPortProperties.centerX,
                centerY: this.viewPortProperties.centerY,
                width: this.viewPortProperties.width,
                height: this.viewPortProperties.height,
                sceneRect: sceneContainerRect
            } 
        });
        window.dispatchEvent(event);
    }

    /**
     * Returns the center/origin position of the viewport
     * @returns {Object} {x, y} coordinates relative to the scene container (scene-relative coordinates)
     */
    getViewPortOrigin() {
        // BaseComponent guarantees this is only called when initialized
        return { 
            x: this.viewPortProperties.centerX, 
            y: this.viewPortProperties.centerY 
        };
    }

    getViewPortRect() {
        // BaseComponent guarantees this is only called when initialized
        return {
            left: this.viewPortProperties.left,
            top: this.viewPortProperties.top,
            right: this.viewPortProperties.right,
            bottom: this.viewPortProperties.bottom,
            width: this.viewPortProperties.width,
            height: this.viewPortProperties.height
        };
    }

    getVisualRect() {
        if (!this._sceneContainer) {
            return { top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0 };
        }
        return this._sceneContainer.getBoundingClientRect();
    }

    /**
     * Checks if a card div is within the viewPortProperties
     * @param {HTMLElement} cardDiv - The card div to check
     * @returns {boolean} True if the card div is within the viewPortProperties
     */
    isBizCardDivWithinViewPort(bizCardDiv) {
        // BaseComponent guarantees this is only called when initialized
        const rect = bizCardDiv.getBoundingClientRect();
        return (
            rect.right >= this.viewPortProperties.left &&
            rect.left <= this.viewPortProperties.right &&
            rect.bottom >= this.viewPortProperties.top &&
            rect.top <= this.viewPortProperties.bottom
        );
    }

    setViewPortWidth(width) {
        // BaseComponent guarantees this is only called when initialized
        if ( !utils.isNumber(width) ) {
            throw new Error("viewPort.setViewPortWidth:", width, "is not a Number");
        }
        this.viewPortProperties.width = width;
        this.viewPortProperties.centerX = width/2;
        this.updateViewPort();
    }

// /**
//  * Applies view-relative styling for a bizCardDiv 
//  * with scene-plane relative coordinates
//  * @param {HTMLElement} bizCardDiv - The card div
//  */
// export function applyViewRelativeStyling(bizCardDiv) {
//     if ( !isInitialized() ) {
//         throw new Error("viewPortProperties is not initialized");
//     }
//     if ( !isHTMLElement(bizCardDiv) ) {
//         throw new Error(`bizCardDiv is not an HTMLElement: ${bizCardDiv}`);
//     }


//     // extract the static scene-relative geometry
//     const sceneTop = parseInt(bizCardDiv.getAttribute("data-sceneTop"));
//     const sceneLeft = parseInt(bizCardDiv.getAttribute("data-sceneLeft"));
//     const sceneWidth = parseInt(bizCardDiv.getAttribute("data-sceneWidth"));
//     const sceneHeight = parseInt(bizCardDiv.getAttribute("data-sceneHeight"));
//     const sceneZ = parseInt(bizCardDiv.getAttribute("data-sceneZ"));
    

//     // transform scene-relative attributes to get view-relative styling
//     const viewTop = sceneTop;
//     const viewLeft = sceneLeft + bullsEyeX;
//     const viewWidth = sceneWidth;
//     const viewHeight = sceneHeight;
//     const viewZIndexStr = zUtils.get_zIndexStr_from_z(sceneZ, bizCardDiv.id);

//     window.CONSOLE_LOG_IGNORE(`sceneLeft:${sceneLeft} + bullsEyeX:${bullsEyeX} viewLeft:${viewLeft}`);

//     // apply view-relative styling
//     bizCardDiv.style.top =     `${viewTop}px`;
//     bizCardDiv.style.left =    `${viewLeft}px`;
//     bizCardDiv.style.width =   `${viewWidth}px`;
//     bizCardDiv.style.height =  `${viewHeight}px`;
//     bizCardDiv.style.zIndex =   viewZIndexStr;

//     // window.CONSOLE_LOG_IGNORE(`bizCardDiv view-relativestyling for ${bizCardDiv.id}:`, {
//     //     styleLeft: bizCardDiv.style.left,
//     //     offsetLeft: bizCardDiv.offsetLeft,
//     //     boundingLeft: bizCardDiv.getBoundingClientRect().left,
//     //     viewLeft,
//     //     bullsEyeX,
//     //     sceneLeft,
//     //     parsedSceneLeft: parseFloat(sceneLeft)
//     // });
// }

    calculateViewPortProperties() {
        // BaseComponent guarantees this is only called when initialized
        
        // Call updateViewPort to recalculate all properties and dispatch viewport-changed event
        this.updateViewPort();
    }
}

// Create singleton instance
const viewPortModule = new ViewPortModule();

// Register on window for backward compatibility with useLayoutToggle.mjs
window.viewPortModule = viewPortModule;

// Export the singleton instance and backward compatibility functions
export { viewPortModule };
export default viewPortModule;

// Backward compatibility exports
export function initialize() {
    console.warn('[ViewPortModule] initialize() is deprecated. Use initializationManager instead');
    return Promise.resolve();
}

export function isInitialized() {
    return viewPortModule.isInitialized;
}

export function updateViewPort() {
    return viewPortModule.updateViewPort();
}

export function getViewPortOrigin() {
    return viewPortModule.getViewPortOrigin();
}

export function getViewPortRect() {
    return viewPortModule.getViewPortRect();
}

export function getVisualRect() {
    return viewPortModule.getVisualRect();
}

export function isBizCardDivWithinViewPort(bizCardDiv) {
    return viewPortModule.isBizCardDivWithinViewPort(bizCardDiv);
}

export function setViewPortWidth(width) {
    return viewPortModule.setViewPortWidth(width);
}
