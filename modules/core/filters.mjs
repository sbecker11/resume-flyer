// /modules/core/filters.mjs

import { linearInterp } from '../utils/mathUtils.mjs';
import { getRendering } from './renderingConfig.mjs';

// Filter constants (flock-of-postcards–aligned: Z 1 = far, Z 14 = close)
export const MIN_BRIGHTNESS_PERCENT = 75; // Match flock-of-postcards
export const CARD_MIN_Z = 1;
export const CARD_MAX_Z = 14;

/**
 * Gets the brightness value from a z value
 * @param {number} z - The z value
 * @returns {number} The brightness value
 */
export function get_brightness_value_from_z(z) {
    const { brightnessAtMaxZ } = getRendering();
    const brightnessFactorAtMaxZ = (typeof brightnessAtMaxZ === 'number' && brightnessAtMaxZ >= 0) ? brightnessAtMaxZ / 100 : 1.0;
    var z_interp = linearInterp(
        z,
        CARD_MIN_Z, 1.0,
        CARD_MAX_Z, brightnessFactorAtMaxZ
    );
    var z_brightness_value = (z > 0) ? z_interp : 1.0;
    return z_brightness_value;
}

/**
 * Gets the brightness filter string from a z value
 * @param {number} z - The z value
 * @returns {string} The brightness filter string
 */
export function get_brightness_str_from_z(z) {
    return `brightness(${100 * get_brightness_value_from_z(z)}%)`;
}

/**
 * Gets the blur filter string from a z value.
 * Z = distance from viewer: higher Z = farther = more blur; lower Z = closer = less blur.
 * Linear interpolation from 0 at CARD_MIN_Z to blurAtMaxZ at CARD_MAX_Z (from app_state system-constants.rendering).
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
 * Gets the saturation filter string from a z value
 * @param {number} z - The z value
 * @returns {string} The saturation filter string
 */
export function get_saturation_str_from_z(z) {
    const { saturationAtMaxZ } = getRendering();
    const saturationFactorAtMaxZ = (typeof saturationAtMaxZ === 'number' && saturationAtMaxZ >= 0) ? saturationAtMaxZ / 100 : 1.0;
    var z_interp = linearInterp(
        z,
        CARD_MIN_Z, 1.0,
        CARD_MAX_Z, saturationFactorAtMaxZ
    );
    var saturation = (z > 0) ? z_interp : 1.0;
    return `saturate(${saturation})`;
}

/**
 * Gets the combined filter string from a z value.
 * Contrast omitted; saturation (and brightness/blur) are sufficient.
 * Values from app_state.json system-constants.rendering (brightnessAtMaxZ, saturationAtMaxZ, blurAtMaxZ).
 */
export function get_filterStr_from_z(z) {
    var filterStr = "";
    filterStr += get_brightness_str_from_z(z) + " ";
    filterStr += get_blur_str_from_z(z) + " ";
    filterStr += get_saturation_str_from_z(z);
    return filterStr;
} 