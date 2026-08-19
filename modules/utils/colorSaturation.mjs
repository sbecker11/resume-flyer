// modules/utils/colorSaturation.mjs
// Pure HSL-saturation adjustment for palette colors (color-map modal "Saturation" slider).
// No Vue/DOM dependency so it is directly unit-testable, same spirit as colorGridLayout.mjs.

import { hexToRgb, rgbToHex, formatHexDisplay } from './colorUtils.mjs';

/**
 * Convert sRGB (0-255 each) to HSL. Hue in degrees [0,360); saturation and lightness as
 * percentages [0,100].
 * @param {number} r @param {number} g @param {number} b
 * @returns {{ h: number, s: number, l: number }}
 */
export function rgbToHsl(r, g, b) {
    const rn = r / 255, gn = g / 255, bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const l = (max + min) / 2;
    const delta = max - min;
    let h = 0;
    let s = 0;
    if (delta !== 0) {
        s = delta / (1 - Math.abs(2 * l - 1));
        switch (max) {
            case rn:
                h = 60 * (((gn - bn) / delta) % 6);
                break;
            case gn:
                h = 60 * ((bn - rn) / delta + 2);
                break;
            default:
                h = 60 * ((rn - gn) / delta + 4);
        }
    }
    if (h < 0) h += 360;
    return { h, s: s * 100, l: l * 100 };
}

/**
 * Convert HSL (h in degrees [0,360); s and l as percentages [0,100]) to sRGB (0-255 each, rounded).
 * @param {number} h @param {number} s @param {number} l
 * @returns {{ r: number, g: number, b: number }}
 */
export function hslToRgb(h, s, l) {
    const sn = s / 100, ln = l / 100;
    const c = (1 - Math.abs(2 * ln - 1)) * sn;
    const hp = (((h % 360) + 360) % 360) / 60;
    const x = c * (1 - Math.abs((hp % 2) - 1));
    let r1 = 0, g1 = 0, b1 = 0;
    if (hp >= 0 && hp < 1) { r1 = c; g1 = x; b1 = 0; }
    else if (hp < 2) { r1 = x; g1 = c; b1 = 0; }
    else if (hp < 3) { r1 = 0; g1 = c; b1 = x; }
    else if (hp < 4) { r1 = 0; g1 = x; b1 = c; }
    else if (hp < 5) { r1 = x; g1 = 0; b1 = c; }
    else { r1 = c; g1 = 0; b1 = x; }
    const m = ln - c / 2;
    return {
        r: Math.round((r1 + m) * 255),
        g: Math.round((g1 + m) * 255),
        b: Math.round((b1 + m) * 255),
    };
}

/**
 * Adjust a hex color's HSL saturation by a floating-point multiplier, analogous to the CSS
 * filter function `saturate(x)`. 1.0 = no change (identity). 0.0 = fully desaturated
 * (grayscale, s = 0). Values > 1.0 increase saturation, clamped at s = 100.
 * newS = clamp(s * factor, 0, 100).
 * @param {string} hexColor - e.g. '#a1b2c3'
 * @param {number} factor - 0.0..3.0 (defensively clamped to that range)
 * @returns {string} adjusted hex color, or the normalized original if input is invalid or factor is 1.0
 */
export function applySaturationMultiplier(hexColor, factor) {
    const rgb = hexToRgb(hexColor);
    if (!rgb) return formatHexDisplay(hexColor);
    const f = Number.isFinite(factor) ? Math.max(0, Math.min(3, factor)) : 1.0;
    if (f === 1.0) return formatHexDisplay(hexColor);

    const { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b);
    const newS = Math.max(0, Math.min(100, s * f));

    const { r, g, b } = hslToRgb(h, newS, l);
    return rgbToHex(r, g, b);
}

/**
 * Map an array of hex colors through applySaturationMultiplier. Returns the same array reference
 * unchanged when factor is 1.0 (no-op fast path) so identity-sensitive callers (e.g. Vue reactivity,
 * cache keys) are not disturbed when the adjustment is neutral.
 * @param {string[]} colors
 * @param {number} factor
 * @returns {string[]}
 */
export function applySaturationMultiplierToPalette(colors, factor) {
    if (!Array.isArray(colors)) return colors;
    if (!Number.isFinite(factor) || factor === 1.0) return colors;
    return colors.map((c) => applySaturationMultiplier(c, factor));
}
