// /modules/core/filters.mjs

import { linearInterp } from '../utils/mathUtils.mjs';

// Filter constants (flock-of-postcards–aligned: Z 1 = far, Z 14 = close)
export const MIN_BRIGHTNESS_PERCENT = 75; // Match flock-of-postcards
export const BLUR_Z_SCALE_FACTOR = 4;     // Match flock-of-postcards
export const CARD_MIN_Z = 1;
export const CARD_MAX_Z = 14;

// Env is baked in at build time: restart dev server or rebuild after changing .env
const raw = import.meta.env.VITE_SATURATION_AT_MAX_Z;
const _saturationAtMaxZ = Number(raw);
export const SATURATION_AT_MAX_Z = (raw !== undefined && raw !== '' && !Number.isNaN(_saturationAtMaxZ)) ? _saturationAtMaxZ : 0.6;

const rawBrightness = import.meta.env.VITE_BRIGHTNESS_AT_MAX_Z;
export const BRIGHTNESS_AT_MAX_Z = rawBrightness !== undefined && rawBrightness !== '' ? Number(rawBrightness) : 0.75;

/**
 * Gets the brightness value from a z value
 * @param {number} z - The z value
 * @returns {number} The brightness value
 */
export function get_brightness_value_from_z(z) {
    var z_interp = linearInterp(
        z,
        CARD_MIN_Z, 1.0,
        CARD_MAX_Z, BRIGHTNESS_AT_MAX_Z
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
 */
export function get_blur_str_from_z(z) {
    if (z <= 0) return 'blur(0px)';
    const blur = Math.max(0, (z - CARD_MIN_Z) / BLUR_Z_SCALE_FACTOR);
    return `blur(${blur}px)`;
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
    var z_interp = linearInterp(
        z,
        CARD_MIN_Z, 1.0,
        CARD_MAX_Z, SATURATION_AT_MAX_Z
    );
    var saturation = (z > 0) ? z_interp : 1.0;
    return `saturate(${saturation})`;
}

/**
 * Gets the combined filter string from a z value
 * @param {number} z - The z value
 * @returns {string} The combined filter string
 */
export function get_filterStr_from_z(z) {
    var filterStr = "";
    filterStr += get_brightness_str_from_z(z) + " ";
    filterStr += get_blur_str_from_z(z) + " ";
    filterStr += get_contrast_str_from_z(z) + " ";
    filterStr += get_saturation_str_from_z(z);
    return filterStr;
} 