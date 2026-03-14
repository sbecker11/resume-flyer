/**
 * Resume-flock-only helpers for palette/color logic that palette-utils-ts does not provide.
 * All color conversion and contrast logic comes from color-palette-utils-ts; this module
 * only adds luminance comparison, hex validation, and compatibility wrappers.
 */
import { formatHexDisplay, hexToRgb, rgbToHex } from 'color-palette-utils-ts';

/** sRGB channel to linear (same as palette-utils-ts internal). */
function srgbToLinear(c) {
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * Relative luminance 0–1 for a hex color (matches palette-utils-ts logic for ordering).
 * @param {string} hex
 * @returns {number}
 */
export function getLuminanceFromHex(hex) {
    const rgb = hexToRgb(hex);
    if (!rgb) return 0.5;
    const [rs, gs, bs] = [rgb.r, rgb.g, rgb.b].map((n) => srgbToLinear(n / 255));
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Perceived brightness 0–255 for "darkest" comparison (legacy-compatible).
 * @param {string} hex
 * @returns {number}
 */
export function getPerceivedBrightness(hex) {
    return getLuminanceFromHex(hex) * 255;
}

/**
 * True if string is a valid 6-digit hex color.
 * @param {string} hex
 * @returns {boolean}
 */
export function isHexColor(hex) {
    if (!hex || typeof hex !== 'string') return false;
    const normalized = formatHexDisplay(hex);
    return normalized !== '' && /^#[0-9a-f]{6}$/.test(normalized);
}

/** Alias for consumers that expect isHexColorString. */
export const isHexColorString = isHexColor;

/**
 * Throws if hex is not valid.
 * @param {string} hex
 * @param {string} [context='']
 */
export function validateHexColor(hex, context = '') {
    if (!isHexColor(hex)) {
        throw new Error(`Invalid hex color string: "${hex}"${context ? ` (${context})` : ''}`);
    }
}

/**
 * RGB object from hex; throws if invalid (for domUtils / legacy get_RGB_from_Hex).
 * @param {string} hex
 * @returns {{ r: number, g: number, b: number }}
 */
export function get_RGB_from_Hex(hex) {
    const rgb = hexToRgb(hex);
    if (!rgb) throw new Error(`Invalid hex color: "${hex}"`);
    return rgb;
}

/**
 * Set the data-color-index attribute on a card/resume element.
 * Single source of truth: always use the raw jobNumber so cDivs and rDivs
 * are guaranteed to receive the same index. Palette wrapping is applied later
 * by applyPaletteToElement() via (index % palette.length).
 * @param {HTMLElement} element
 * @param {number} jobNumber
 */
export function setJobColorIndex(element, jobNumber) {
    element.setAttribute('data-color-index', String(jobNumber));
}

/**
 * True if color is a shade of grey within tolerance.
 * @param {string} hex
 * @param {number} [tolerance=10]
 * @returns {boolean}
 */
export function isGrey(hex, tolerance = 10) {
    const rgb = hexToRgb(hex);
    if (!rgb) return false;
    const { r, g, b } = rgb;
    return Math.abs(r - g) <= tolerance && Math.abs(r - b) <= tolerance && Math.abs(g - b) <= tolerance;
}
