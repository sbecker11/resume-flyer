/**
 * Module: parallax
 * This module handles parallax effects for bizCardDivs based on the focal point position.
 */
import { watchEffect, ref } from 'vue';
import { BaseComponent } from './abstracts/BaseComponent.mjs';
import * as zUtils from '../utils/zUtils.mjs';
import * as mathUtils from '../utils/mathUtils.mjs';
import { selectionManager } from './selectionManager.mjs';
import { focalPointManager } from '../composables/useFocalPoint.mjs';

export const TEST_PARALLAX = false;
export const EPSILON = 0.01
// Parallax constants
export const PARALLAX_X_EXAGGERATION_FACTOR = 0.9;
export const PARALLAX_Y_EXAGGERATION_FACTOR = 1.0;

class ParallaxModule extends BaseComponent {
    constructor() {
        super('ParallaxModule');
        // Create a reactive reference to the scene container rect
        this.sceneContainerRect = ref({ left: 0, top: 0, width: 0, height: 0 });
        this.boundUpdateSceneContainerRect = this.updateSceneContainerRect.bind(this);
        this.boundHandleFocalPointChanged = this.handleFocalPointChanged.bind(this);
    }

    getDependencies() {
        return ['ViewportManager']; // Wait for ViewportManager to be ready
    }

    updateSceneContainerRect() {
        const sceneContainer = document.getElementById('scene-container');
        if (sceneContainer) {
            const rect = sceneContainer.getBoundingClientRect();
            this.sceneContainerRect.value = {
                left: rect.left,
                top: rect.top,
                width: rect.width,
                height: rect.height,
            };
            
            // Force refresh all parallax transforms when scene container changes size
            this.refreshAllParallaxTransforms();
        }
    }

    handleFocalPointChanged() {
        // IM framework guarantees dependencies are ready - no manual checks needed
        
        // use current focal point and viewPort center (bullsEye) 
        // to calculate the parallax displacements for all bizCardDivs
        const { dh, dv } = this.calculateParallaxDisplacements();
        
        const bizCardDivs = document.getElementsByClassName("biz-card-div");
        
        for (const bizCardDiv of bizCardDivs) {
            this.applyParallaxToBizCardDiv(bizCardDiv, dh, dv);
        }
    }

    initialize(dependencies = {}) {
        // ViewportManager dependency is guaranteed to be ready via IM injection
        this.viewportManager = dependencies.ViewportManager;

        // Listen for viewport-changed event to update the rect
        window.addEventListener('viewport-changed', this.boundUpdateSceneContainerRect);
        // Initial update
        this.updateSceneContainerRect();

        // Watch for focal point position changes and apply parallax
        window.addEventListener('focal-point-changed', this.boundHandleFocalPointChanged);

        // Initial application of parallax to all cards
        // This ensures cards are properly positioned even if focal point doesn't change
        const { dh, dv } = this.calculateParallaxDisplacements();
        const bizCardDivs = document.getElementsByClassName("biz-card-div");
        
        for (const bizCardDiv of bizCardDivs) {
            this.applyParallaxToBizCardDiv(bizCardDiv, dh, dv);
        }

        window.CONSOLE_LOG_IGNORE('ParallaxModule initialized via IM');
    }

    destroy() {
        // Remove event listeners
        if (this.boundUpdateSceneContainerRect) {
            window.removeEventListener('viewport-changed', this.boundUpdateSceneContainerRect);
        }
        if (this.boundHandleFocalPointChanged) {
            window.removeEventListener('focal-point-changed', this.boundHandleFocalPointChanged);
        }
        
        window.CONSOLE_LOG_IGNORE('ParallaxModule destroyed');
    }

    getSceneContainerWidth() {
        const sceneContainer = document.getElementById('scene-container');
        if (sceneContainer) {
            const rect = sceneContainer.getBoundingClientRect();
            return rect.width;
        }
        throw new Error('scene-container not found');
    }

    // use current focalPoint and sceneContainer origin
    // to calculate the parallax displacements for all bizCardDivs
    // which is scaled according to the scene-Z of each bizCardDiv
    // this is called by the event listener in initialize()
    calculateParallaxDisplacements() {
        // Use ViewportManager dependency injected via IM framework
        const {x: vpX, y: vpY} = this.viewportManager.getViewPortOrigin();
        // Access current focal point position from reactive state
        const focalPosition = focalPointManager.focalPointState.value.current;
        const {x: fpX, y: fpY} = focalPosition;

        //const dh = (scX - fpX) * PARALLAX_X_EXAGGERATION_FACTOR;
        //const dv = (scY - fpY) * PARALLAX_Y_EXAGGERATION_FACTOR;
        const dh = (vpX - fpX) * PARALLAX_X_EXAGGERATION_FACTOR;
        const dv = (vpY - fpY) * PARALLAX_Y_EXAGGERATION_FACTOR;

        return { dh, dv };
    }

    projectAllBizCardDivs() {
        const { dh, dv } = this.calculateParallaxDisplacements();
        const bizCardDivs = document.getElementsByClassName("biz-card-div");
        for (const bizCardDiv of bizCardDivs) {
            this.applyParallaxToBizCardDiv(bizCardDiv, dh, dv);
        }
    }

    // Force refresh all parallax transforms - useful for initialization or when cards are added
    refreshAllParallaxTransforms() {
        // BaseComponent guarantees this is only called when initialized
        
        requestAnimationFrame(() => {
            const { dh, dv } = this.calculateParallaxDisplacements();
            const bizCardDivs = document.getElementsByClassName("biz-card-div");
            
            for (const bizCardDiv of bizCardDivs) {
                this.applyParallaxToBizCardDiv(bizCardDiv, dh, dv);
            }
        });
    }

    /**
     * Gets the clone element for the selected job number.
     * @returns {HTMLElement|null} The clone element or null if not found.
     */
    getCloneForSelectedJobNumber() {
        const selectedJobNumber = selectionManager.getSelectedJobNumber();
        if (!selectedJobNumber) {
            return null;
        }
        
        const cloneId = `biz-card-div-${selectedJobNumber}-clone`;
        return document.getElementById(cloneId);
    }

    /**
     * Projects any element to sceneContainer-relative coordinates without parallax.
     * Used for clones, badges, and connection lines which should not have parallax.
     * @param {HTMLElement} element - The element to project.
     * @returns {Object} The projected rect in sceneContainer-relative coordinates.
     */
    projectElementToSceneContainer(element) {
        if (!element) return null;
        
        const rect = element.getBoundingClientRect();
        const translateX = this.getSceneContainerWidth() / 2;
        
        return {
            left: rect.left + translateX,
            top: rect.top,
            right: rect.right + translateX,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
            x: rect.x + translateX,
            y: rect.y
        };
    }

    /**
     * Projects a bizCardDivClone to viewPort-relative coordinates 
     * without parallax effect, since clones are not subject to parallax.
     * @param {HTMLElement} bizCardDivClone - The bizCardDivClone to project.
     * @returns {Object} The projected rect in viewPort-relative coordinates.
     */
    projectBizCardDivClone(bizCardDivClone) {
        // BaseComponent guarantees this is only called when initialized
        if( !bizCardDivClone.classList.contains('hasClone') ) {
            throw new Error('projectBizCardDivClone: bizCardDivClone is not a clone');
        }
        
        const sceneLeft = parseFloat(bizCardDivClone.getAttribute("data-sceneLeft"));
        const sceneRight = parseFloat(bizCardDivClone.getAttribute("data-sceneRight"));
        const sceneWidth = parseFloat(bizCardDivClone.getAttribute("data-sceneWidth"));
        const sceneCenterX = parseFloat(bizCardDivClone.getAttribute("data-sceneCenterX"));

        const sceneTop = parseFloat(bizCardDivClone.getAttribute("data-sceneTop"));
        const sceneBottom = parseFloat(bizCardDivClone.getAttribute("data-sceneBottom"));
        const sceneHeight = parseFloat(bizCardDivClone.getAttribute("data-sceneHeight"));
        const sceneCenterY = parseFloat(bizCardDivClone.getAttribute("data-sceneCenterY"));
        
        // project the scene-relative coordinates to 
        // viewPort-relative coordinates with no parallax effect
        // by simply transforming x by + sceneContainerWidth/2
        const projectedRect = {
            left: (sceneLeft + this.getSceneContainerWidth()/2).toFixed(2),
            top: sceneTop.toFixed(2),
            right: ((sceneRight + this.getSceneContainerWidth()/2)*100)/100,
            bottom: (sceneBottom*100)/100,
            width: sceneWidth.toFixed(2),
            height: sceneHeight.toFixed(2),
            x: (sceneCenterX + this.getSceneContainerWidth()/2).toFixed(2),
            y: sceneCenterY.toFixed(2)
        };
        
        return projectedRect;
    }

    /**
     * Applies the parallax transform to a point in scene-relative coordinates.
     * @param {number} sceneX - The original scene X coordinate
     * @param {number} sceneY - The original scene Y coordinate  
     * @param {number} sceneZ - The original scene Z coordinate
     * @returns {Object} The transformed position in viewPort-relative coordinates{x, y}
     */
    applyParallaxToScenePoint(sceneX, sceneY, sceneZ = 0) {
        // BaseComponent guarantees this is only called when initialized
        if (sceneZ < 0) {
            throw new Error('sceneZ must be greater than 0');
        }

        // use current focal point and viewPort center (bullsEye) 
        // to calculate the parallax displacements for all bizCardDivs
        const { dh, dv } = this.calculateParallaxDisplacements();

        let zScale = 0;
        if (sceneZ > 0) 
            zScale = (0.9 - ((sceneZ - zUtils.ALL_CARDS_Z_MIN - 1) / (zUtils.ALL_CARDS_Z_MAX - zUtils.ALL_CARDS_Z_MIN)));

        // uncomment to skip z-depth the parallax effect
        // zScale = 1;

        let translateX = dh * zScale;
        let translateY = dv * zScale;

        // scene to view transformation
        translateX += this.getSceneContainerWidth()/2;

        const viewPortPos = { 
            x:  sceneX + translateX,
            y:  sceneY + translateY
        }
        return viewPortPos;
    }

    /**
     * Applies the calculated parallax transform to a single business card div.
     * @param {HTMLElement} bizCardDiv The element to apply the transform to.
     * @param {number} dh The horizontal displacement.
     * @param {number} dv The vertical displacement.
     */
    applyParallaxToBizCardDiv(bizCardDiv, dh, dv) {
        if (bizCardDiv.classList.contains('hasClone')) {
            return; // Do not apply parallax to the original card if it's selected (has a clone).
        }
        const sceneZ = parseFloat(bizCardDiv.getAttribute('data-sceneZ'));
        if (isNaN(sceneZ)) {
            return; // Element doesn't have a valid Z position.
        }

        // The parallax effect is scaled by the card's Z position.
        // A higher z- means the card is further away, so it should move less.
        let zScale = 0;
        if (sceneZ > 0) 
            zScale = (0.9 - ((sceneZ - zUtils.ALL_CARDS_Z_MIN - 1) / (zUtils.ALL_CARDS_Z_MAX - zUtils.ALL_CARDS_Z_MIN)));

        // uncomment to skip z-depth the parallax effect
        // zScale = 1;

        // default before parallax
        let translateX = 0;
        let translateY = 0;
        
        // scene to view transformation - account for scene container position
        const sceneContainer = document.getElementById('scene-container');
        if (sceneContainer) {
            const sceneRect = sceneContainer.getBoundingClientRect();
            translateX += sceneRect.left + sceneRect.width / 2;
        } else {
            translateX += this.getSceneContainerWidth()/2; // fallback
        }
        
        // Apply scene Y position (timeline position) directly - no viewport offset needed
        const sceneTop = parseFloat(bizCardDiv.getAttribute('data-sceneTop'));
        if (!isNaN(sceneTop)) {
            translateY = sceneTop; // Direct mapping: viewY = sceneY
        }

        // only original cDivs with zScale > 0 are subject to parallax
        if (zScale > 0) {
            translateX += dh * zScale;
            translateY += dv * zScale;
        }
        
        const transformString = `translateX(${translateX}px) translateY(${translateY}px)`;
        bizCardDiv.style.transform = transformString;

        // verify that test_applyParallaxToScenePoint to the 
        // scene-relative (top-left corner) of the 
        // bizCardDiv at sceneZ == 0 matches the actual 
        // transformed bizCardDiv in viewPort-relative 
        // coordinates (top-left corner)
        if ( TEST_PARALLAX && this.isInitialized ) {
            // the actual transformed top-left corner
            // of the bizCardDiv in viewPort-relative coordinates
            // from the above transform
            const viewPos = {
                x: bizCardDiv.getBoundingClientRect().left,
                y: bizCardDiv.getBoundingClientRect().top
            }

            // the cooresponding top-left corner
            // in scene-relative coordinates
            const scenePoint = {
                x: parseFloat(bizCardDiv.getAttribute('scene-left')),
                y: parseFloat(bizCardDiv.getAttribute('scene-top')),
                z: parseFloat(bizCardDiv.getAttribute('sceneZ'))
            };

            // the test-computed viewPort-relative coordinates of the transformed scenePos
            const testViewPos = this.applyParallaxToScenePoint(
                scenePoint.x, scenePoint.y, scenePoint.z);

            // verify that the transformed scenePoint matches the expected viewPos
            const diffX = Math.abs(viewPos.x - testViewPos.x);
            const diffY = Math.abs(viewPos.y - testViewPos.y);
            if ((diffX > EPSILON) || (diffY > EPSILON)) {
                const errMsg = `TEST_PARALLAX failed diffY:${diffY} diffX:${diffX}`;
                console.error(errMsg); 
            }
        }
    }
}

// Create singleton instance
const parallaxModule = new ParallaxModule();

// Export the singleton instance and backward compatibility functions
export { parallaxModule };
export default parallaxModule;

// Backward compatibility exports
export function initialize() {
    console.warn('[ParallaxModule] initialize() is deprecated. Use initializationManager instead');
    return Promise.resolve();
}

export function isInitialized() {
    return parallaxModule.isInitialized;
}

export function calculateParallaxDisplacements() {
    return parallaxModule.calculateParallaxDisplacements();
}

export function projectAllBizCardDivs() {
    return parallaxModule.projectAllBizCardDivs();
}

export function refreshAllParallaxTransforms() {
    return parallaxModule.refreshAllParallaxTransforms();
}

export function getCloneForSelectedJobNumber() {
    return parallaxModule.getCloneForSelectedJobNumber();
}

export function projectElementToSceneContainer(element) {
    return parallaxModule.projectElementToSceneContainer(element);
}

export function projectBizCardDivClone(bizCardDivClone) {
    return parallaxModule.projectBizCardDivClone(bizCardDivClone);
}

export function applyParallaxToScenePoint(sceneX, sceneY, sceneZ = 0) {
    return parallaxModule.applyParallaxToScenePoint(sceneX, sceneY, sceneZ);
}

export function applyParallaxToBizCardDiv(bizCardDiv, dh, dv) {
    return parallaxModule.applyParallaxToBizCardDiv(bizCardDiv, dh, dv);
}

export function getSceneContainerWidth() {
    return parallaxModule.getSceneContainerWidth();
}

// Expose functions globally for components to use
if (typeof window !== 'undefined') {
    window.applyParallaxToScenePoint = applyParallaxToScenePoint;
    window.refreshAllParallaxTransforms = refreshAllParallaxTransforms;
    window.projectAllBizCardDivs = projectAllBizCardDivs;
}