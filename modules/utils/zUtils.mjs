// modules/utils/zUtils.mjs

import * as utils from './utils.mjs';

// Z-index constants and utility functions
export const ROOT_Z_INDEX = 0;             // no parallax 
export const SCENE_Z_INDEX = 1;           // no parallax
export const SCENE_GRADIENTS_Z_INDEX = 2; // no parallax
export const TIMELINE_Z_INDEX = 3;         // no parallax
export const CONNECTION_LINES_Z_INDEX = 4; // no parallax
export const BACKGROUND_ELEMENTS_MAX_Z_INDEX = 6;

export const ALL_CARDS_Z_INDEX_MIN = 10;

// biz card z-index range 5 to 10
export const BIZCARD_Z_INDEX_MIN = 10;
export const BIZCARD_Z_INDEX_MAX = 20-1; // 10; = Z_INDEX_MIN + numLevels - 10

// // Skill card z-index range 20 to 30
// export const SKILLCARD_Z_INDEX_MIN = 20;
// export const SKILLCARD_Z_INDEX_MAX = 30;

export const ALL_CARDS_Z_INDEX_MAX = 20-1;
export const ALL_CARDS_Z_MAX = 20-1;

// biz card Z value range 35 to 30
export const BIZCARD_Z_MAX = 20-1;
export const BIZCARD_Z_MIN = 10; // 30; == Z_MAX .. Z_MAX-numLevels = 25

// // skill card Z value range 20 to 10
// export const SKILLCARD_Z_MAX = 20;
// export const SKILLCARD_Z_MIN = 10;

export const ALL_CARDS_Z_MIN = 10;

// resume-flyer (see sibling repo resume-flyer/main.mjs):
//   "z is distance to viewer" → z = MAX_Z - zindex, zindex = MAX_Z - z.
// Here: Z = distance from viewer; Z = FLYER_Z_MAX - z_index (higher z_index = closer = lower Z).
//
// Coordinate correspondence:
//   At view plane (closest to viewer): z-index has MAX values, Z has MIN values.
//   At scene origin (farthest):       z-index has MIN values, Z has MAX values.
//
// - z_index: CSS stacking order (1–3 biz, 4–13 skill); higher = in front.
// - scene Z (stored on cards): Z = FLYER_Z_MAX - z_index; range 1–14. No scene div should ever have negative scene Z.
export const FLYER_Z_MAX = 14;                    // far plane; Z = FLYER_Z_MAX - z_index (original used 15)
export const FLYER_BIZCARD_Z_INDEX_MIN = 1;       // biz cards z_index 1–3 (back)
export const FLYER_BIZCARD_Z_INDEX_MAX = 3;
export const FLYER_SKILL_Z_INDEX_MIN = 4;         // skill cards z_index 4–13 (front)
export const FLYER_SKILL_Z_INDEX_MAX = 13;
export const FLYER_PARALLAX_Z_MIN = 1;
export const FLYER_PARALLAX_Z_MAX = 14;
export const FLYER_PARALLAX_Z_RANGE = FLYER_PARALLAX_Z_MAX - FLYER_PARALLAX_Z_MIN;

/** Z (distance from viewer) from CSS z_index. Higher z_index = closer = lower Z. */
export function Z_from_z_index(z_index) {
  return FLYER_Z_MAX - z_index;
}

/** z_index from Z (distance). Used when we have Z and need stacking. */
export function z_index_from_Z(Z) {
  return FLYER_Z_MAX - Z;
}

// Invariant: biz z_index (1–3) < skill z_index (4–13) so skill cards render above biz cards
if (FLYER_BIZCARD_Z_INDEX_MAX >= FLYER_SKILL_Z_INDEX_MIN) {
  throw new Error(`zUtils: biz z_index must be < skill z_index`);
}
// Selected clone scene Z: large positive = “closest to viewer” (same range as cards, 1–14). Clones are not subject to motion parallax; they keep the same transform as at creation.
// Invariant: all scene clones (biz-card and skill-card) use this as their data-sceneZ.
export const FLYER_SELECTED_CLONE_Z = FLYER_PARALLAX_Z_MAX; // 14
export const SELECTED_CLONE_SCENE_Z = FLYER_SELECTED_CLONE_Z;

export const SUM_Z = ALL_CARDS_Z_INDEX_MAX + ALL_CARDS_Z_MIN;
export const Z_SUM = ALL_CARDS_Z_MAX + ALL_CARDS_Z_INDEX_MIN;
utils.validateNumber(SUM_Z);
utils.validateNumber(Z_SUM);
if (SUM_Z != Z_SUM) throw new Error("Z_SUM failure");
export const z_from_z_index = (z_index) => { return SUM_Z - z_index; }
export const z_index_from_z = (z) => { return SUM_Z - z; }


// Special case Z-indices
export const BULLSEYE_Z_INDEX = 98;            // no parallax
export const FOCAL_POINT_Z_INDEX = 99;         // no parallax
export const AIM_POINT_Z_INDEX = 100;          // no parallax
export const SELECTED_CARD_Z_INDEX = 102;      // no parallax, higher than bulls-eye
export const SELECTED_CARD_Z_VALUE = 0;        // Special value for selected cards, not used for normal parallax

export function get_z_index_from_z(z) {
    if ( (z < ALL_CARDS_Z_MIN) || (z > ALL_CARDS_Z_MAX) ) {
        window.CONSOLE_LOG_IGNORE(`WARNING: z:${z} is out of range of ${ALL_CARDS_Z_MIN}..${ALL_CARDS_Z_MAX}`);
    }
    return z_index_from_z(z);
}

/**
 * throws an Error if zIndexStr is not valie
 * @param {*} zIndexStr 
 */
export function validate_zIndexStr(zIndexStr) {
    utils.validateString(zIndexStr);
    const zIndex = parseInt(zIndexStr,10);
    validate_zIndex(zIndex);
}

/**
 * throws an error if zIndex is not valid
 * @param zIndex {number}
 */
export function validate_z_index(z_index) {
    validate_zIndex(z_index);
}
export function validate_zIndex(zIndex) {
    utils.validateNumberInRange(zIndex, ALL_CARDS_Z_INDEX_MIN, ALL_CARDS_Z_INDEX_MAX);
}
/**
 * throws an error if z is not valid
 * @param z {number}
 */
export function validate_z(z) {
    utils.validateNumberInRange(z, ALL_CARDS_Z_MIN, ALL_CARDS_Z_MAX);
}

/**
 * Converts a z-index string to a z value
 * @param {string} zIndexStr - The z-index string to convert
 * @returns {number|null} The corresponding z value or null if invalid
 */
export function get_z_from_zIndexStr(zIndexStr) {
    validate_zIndexStr(zIndexStr);
    const zIndex = parseInt(zIndexStr, 10);
    validate_zIndex(zIndex);
    const z = z_from_z_index(zIndex);
    validate_z(z);
    return z;
}

/**
 * Converts a z value to a z-index string
 * @param {number} z - The z value to convert
 * @param {optional string} cardDivId used to check z ranges
 * @returns {string} The corresponding z-index string
 */
export function get_zIndexStr_from_z(z) {
    validate_z(z);
    const zIndex = z_index_from_z(z);
    validate_z_index(zIndex);
    const zIndexStr = `${zIndex}`;
    validate_zIndexStr(zIndexStr);
    return zIndexStr;
}

/**
 * Tests the z-index conversion functions
 */
export function test_zUtils() {
    // Test bizCard z-index to z conversion
    window.CONSOLE_LOG_IGNORE("Testing bizCard z-index to z conversion...");
    for (let z_index = ALL_CARDS_Z_INDEX_MIN; z_index <= ALL_CARDS_Z_INDEX_MAX; z_index++) {
        const z = z_from_z_index(z_index);
        validate_z(z);
        const zIndexStr = get_zIndexStr_from_z(z);
        const check_z = get_z_from_zIndexStr(zIndexStr);
        if (z != check_z) {
            window.CONSOLE_LOG_IGNORE(`WARNING: z:${z} != check_z:${check_z} for z_index:${z_index}`);
        }
    }
    for ( let z=ALL_CARDS_Z_MIN; z <= ALL_CARDS_Z_MAX; z++ ) {
        const z_index = z_index_from_z(z);
        window.CONSOLE_LOG_IGNORE("Z:", z, "z_index:", z_index, "z-z_index:", z-z_index);
    }
    for ( let z_index=ALL_CARDS_Z_INDEX_MIN; z_index <= ALL_CARDS_Z_INDEX_MAX; z_index++ ) {
        const z = z_from_z_index(z_index);
        window.CONSOLE_LOG_IGNORE("z_index:", z_index, "z:", z, "z-z_index:", z-z_index);
    }
} 
