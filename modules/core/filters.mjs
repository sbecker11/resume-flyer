// /modules/core/filters.mjs
// Every property has value at Z = linear interpolation between value at min Z and value at max Z.
// Min Z and max Z values are fixed or from app_state; only the result at Z is computed.

import { linearInterp } from '../utils/mathUtils.mjs';
import { getRendering } from './renderingConfig.mjs';

// Filter constants (resume-flyer–aligned: Z 1 = far, Z 14 = close)
export const MIN_BRIGHTNESS_PERCENT = 75; // Match resume-flyer
export const CARD_MIN_Z = 1;
export const CARD_MAX_Z = 14;

/**
 * Brightness at Z: linear interpolation (min Z = 100%, max Z = brightnessAtMaxZ from app_state).
 */
export function get_brightness_value_from_z(z) {
    const { brightnessAtMaxZ } = getRendering();
    const maxPct = (typeof brightnessAtMaxZ === 'number' && brightnessAtMaxZ >= 0) ? brightnessAtMaxZ / 100 : 1.0;
    const interp = linearInterp(z, CARD_MIN_Z, 1.0, CARD_MAX_Z, maxPct);
    return (z > 0) ? interp : 1.0;
}

/**
 * Brightness filter string from z. Integer percent.
 */
export function get_brightness_str_from_z(z) {
    const pct = Math.round(100 * get_brightness_value_from_z(z));
    return `brightness(${pct}%)`;
}

/**
 * Blur at Z: linear interpolation (min Z = 0 px, max Z = blurAtMaxZ from app_state).
 */
export function get_blur_str_from_z(z) {
    const { blurAtMaxZ } = getRendering();
    if (z <= 0 || blurAtMaxZ <= 0) return 'blur(0px)';
    const blur = linearInterp(z, CARD_MIN_Z, 0, CARD_MAX_Z, blurAtMaxZ);
    return `blur(${Math.max(0, blur)}px)`;
}

/**
 * Gets the contrast filter string from a z value
 * @param {number} z - The z value
 * @returns {string} The contrast filter string
 */
export function get_contrast_str_from_z(z) {
    var z_interp = linearInterp(
        z,
        CARD_MIN_Z, 1.0,
        CARD_MAX_Z, 1.0 // No contrast reduction at max Z so distant cards are not grey
    );
    var contrast = (z > 0) ? z_interp : 1.0;
    return `contrast(${contrast})`;
}

/**
 * Saturation at Z: linear interpolation (min Z = 100%, max Z = saturationAtMaxZ from app_state).
 */
export function get_saturation_str_from_z(z) {
    const { saturationAtMaxZ } = getRendering();
    const maxPct = (typeof saturationAtMaxZ === 'number' && saturationAtMaxZ >= 0) ? saturationAtMaxZ / 100 : 1.0;
    const interp = linearInterp(z, CARD_MIN_Z, 1.0, CARD_MAX_Z, maxPct);
    const saturation = (z > 0) ? interp : 1.0;
    return `saturate(${saturation})`;
}

/**
 * Combined filter string: brightness, blur, saturation at Z each from linear interpolation (value at min Z, value at max Z).
 */
export function get_filterStr_from_z(z) {
    var filterStr = "";
    filterStr += get_brightness_str_from_z(z) + " ";
    filterStr += get_blur_str_from_z(z) + " ";
    filterStr += get_saturation_str_from_z(z);
    return filterStr;
} 