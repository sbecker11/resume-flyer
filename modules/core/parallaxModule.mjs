/**
 * Module: parallax
 * This module handles parallax effects for bizCardDivs based on the focal point position.
 */
import { watchEffect, ref } from 'vue';
import * as viewPort from './viewPortModule.mjs';
import * as zUtils from '../utils/zUtils.mjs';
import * as mathUtils from '../utils/mathUtils.mjs';

export const TEST_PARALLAX = false;
export const EPSILON = 0.01
// Parallax constants
export const PARALLAX_X_EXAGGERATION_FACTOR = 0.9;
export const PARALLAX_Y_EXAGGERATION_FACTOR = 1.0;

let _isInitialized = false;
let _focalPoint = null;

// Create a reactive reference to the scene container rect
const sceneContainerRect = ref({ left: 0, top: 0, width: 0, height: 0 });

function updateSceneContainerRect() {
  const sceneContainer = document.getElementById('scene-container');
  if (sceneContainer) {
    const rect = sceneContainer.getBoundingClientRect();
    sceneContainerRect.value = {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    };
    
    // Force refresh all parallax transforms when scene container changes size
    refreshAllParallaxTransforms();
  }
}

/**
 * Initializes the parallax effect.
 * @param {Object} focalPoint - The focalPoint composable instance
 */
export function initialize(focalPoint = null) {
    if (_isInitialized) {
        return;
    }

    if (!viewPort.isInitialized()) {
        return;
    }

    // Store the focal point reference
    _focalPoint = focalPoint;

    // Listen for viewport-changed event to update the rect
    window.addEventListener('viewport-changed', updateSceneContainerRect);
    // Initial update
    updateSceneContainerRect();

    // Watch for focal point position changes and apply parallax
    watchEffect(() => {
        if (!_focalPoint || !_focalPoint.position) {
            return;
        }

        // use current focal point and viewPort center (bullsEye) 
        // to calculate the parallax displacements for all bizCardDivs
        const { dh, dv } = calculateParallaxDisplacements();
        
        const bizCardDivs = document.getElementsByClassName("biz-card-div");
        
        for (const bizCardDiv of bizCardDivs) {
            applyParallaxToBizCardDiv(bizCardDiv, dh, dv);
        }
    });

    // Initial application of parallax to all cards
    // This ensures cards are properly positioned even if focal point doesn't change
    if (_focalPoint && _focalPoint.position) {
        const { dh, dv } = calculateParallaxDisplacements();
        const bizCardDivs = document.getElementsByClassName("biz-card-div");
        
        for (const bizCardDiv of bizCardDivs) {
            applyParallaxToBizCardDiv(bizCardDiv, dh, dv);
        }
    }

    _isInitialized = true;
}

export function isInitialized() {
    return _isInitialized;
}

export function getSceneContainerWidth() {
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
// this is called by the watchEffect in initialie()
export function calculateParallaxDisplacements() {

    const {x: vpX, y: vpY} = viewPort.getViewPortOrigin();
    const {x: fpX, y: fpY} = _focalPoint.position.value;

    //const dh = (scX - fpX) * PARALLAX_X_EXAGGERATION_FACTOR;
    //const dv = (scY - fpY) * PARALLAX_Y_EXAGGERATION_FACTOR;
    const dh = (vpX - fpX) * PARALLAX_X_EXAGGERATION_FACTOR;
    const dv = (vpY - fpY) * PARALLAX_Y_EXAGGERATION_FACTOR;

    return { dh, dv };
}

export function projectAllBizCardDivs() {
    const { dh, dv } = calculateParallaxDisplacements();
    const bizCardDivs = document.getElementsByClassName("biz-card-div");
    for (const bizCardDiv of bizCardDivs) {
        applyParallaxToBizCardDiv(bizCardDiv, dh, dv);
    }
}

// Force refresh all parallax transforms - useful for initialization or when cards are added
export function refreshAllParallaxTransforms() {
    if (!isInitialized()) {
        return;
    }
    
    requestAnimationFrame(() => {
        const { dh, dv } = calculateParallaxDisplacements();
        const bizCardDivs = document.getElementsByClassName("biz-card-div");
        
        for (const bizCardDiv of bizCardDivs) {
            applyParallaxToBizCardDiv(bizCardDiv, dh, dv);
        }
    });
}

/**
 * Applies the parallax transform to a point in scene-relative coordinates.
 * @param {number} sceneX - The original scene X coordinate
 * @param {number} sceneY - The original scene Y coordinate  
 * @param {number} sceneZ - The original scene Z coordinate
 * @returns {Object} The transformed position in viewPort-relative coordinates{x, y}
 */
export function applyParallaxToScenePoint(sceneX, sceneY, sceneZ = 0) {
    if ( !isInitialized() ) {
        return null;
    }
    if (sceneZ < 0) {
        throw new Error('sceneZ must be greater than 0');
    }

    // use current focal point and viewPort center (bullsEye) 
    // to calculate the parallax displacements for all bizCardDivs
    const { dh, dv } = calculateParallaxDisplacements();

    let zScale = 0;
    if (sceneZ > 0) 
        zScale = (0.9 - ((sceneZ - zUtils.ALL_CARDS_Z_MIN - 1) / (zUtils.ALL_CARDS_Z_MAX - zUtils.ALL_CARDS_Z_MIN)));

    // uncomment to skip z-depth the parallax effect
    // zScale = 1;

    let translateX = dh * zScale;
    let translateY = dv * zScale;

    // scene to view transformation
    translateX += getSceneContainerWidth()/2;

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
export function applyParallaxToBizCardDiv(bizCardDiv, dh, dv) {
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
    
    // scene to view transformation
    translateX += getSceneContainerWidth()/2;

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
    if ( TEST_PARALLAX && isInitialized() ) {
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
        const testViewPos = applyParallaxToScenePoint(
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

// Expose functions globally for components to use
if (typeof window !== 'undefined') {
    window.applyParallaxToScenePoint = applyParallaxToScenePoint;
    window.refreshAllParallaxTransforms = refreshAllParallaxTransforms;
    window.projectAllBizCardDivs = projectAllBizCardDivs;
}