/**
 * Local hex / LAB-LCH / contrast / exported-palette JSON helpers for resume-flyer.
 * Kept here so the readonly vendor package in `color-palette-utils-ts/` stays catalog-only (S3 NDJSON).
 */

const DEFAULT_HIGHLIGHT_PERCENT = 135;
const NEARLY_WHITE_L_THRESHOLD = 75;
/** L* >= this → black text/icons; below → white */
const LAB_LIGHT_THRESHOLD = 50;

/** @param {string | null | undefined} hex */
export function formatHexDisplay(hex) {
    if (!hex || typeof hex !== 'string') return '';
    const h = hex.trim().toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(h)) return h;
    const m = h.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/);
    if (m) return `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`;
    return h.startsWith('#') ? h : `#${h}`;
}

/** @param {number} r @param {number} g @param {number} b */
export function rgbToHex(r, g, b) {
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/** @param {string} hex @returns {{ r: number, g: number, b: number } | null} */
export function hexToRgb(hex) {
    const h = formatHexDisplay(hex);
    if (!h || !/^#[0-9a-f]{6}$/.test(h)) return null;
    return {
        r: parseInt(h.slice(1, 3), 16),
        g: parseInt(h.slice(3, 5), 16),
        b: parseInt(h.slice(5, 7), 16)
    };
}

function srgbToLinear(c) {
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function linearToSrgb(c) {
    if (c <= 0.0031308) return 12.92 * c;
    return 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

function rgbToXyz(r, g, b) {
    const R = srgbToLinear(r / 255);
    const G = srgbToLinear(g / 255);
    const B = srgbToLinear(b / 255);
    return {
        x: 0.4124564 * R + 0.3575761 * G + 0.1804375 * B,
        y: 0.2126729 * R + 0.7151522 * G + 0.072175 * B,
        z: 0.0193339 * R + 0.119192 * G + 0.9503041 * B
    };
}
function xyzToRgb(x, y, z) {
    const R = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z;
    const G = -0.969266 * x + 1.8760108 * y + 0.041556 * z;
    const B = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z;
    return {
        r: Math.round(Math.min(255, Math.max(0, linearToSrgb(R) * 255))),
        g: Math.round(Math.min(255, Math.max(0, linearToSrgb(G) * 255))),
        b: Math.round(Math.min(255, Math.max(0, linearToSrgb(B) * 255)))
    };
}

const LAB_D65 = { xn: 0.95047, yn: 1, zn: 1.08883 };
function f(t) {
    const d = 6 / 29;
    return t > d * d * d ? Math.pow(t, 1 / 3) : t / (3 * d * d) + 4 / 29;
}
function invF(t) {
    const d = 6 / 29;
    return t > d ? t * t * t : 3 * d * d * (t - 4 / 29);
}
function xyzToLab(x, y, z) {
    const { xn, yn, zn } = LAB_D65;
    const fy = f(y / yn);
    return {
        L: 116 * fy - 16,
        a: 500 * (f(x / xn) - fy),
        b: 200 * (fy - f(z / zn))
    };
}
function labToXyz(L, a, b) {
    const { xn, yn, zn } = LAB_D65;
    const y = (L + 16) / 116;
    return {
        x: xn * invF(y + a / 500),
        y: yn * invF(y),
        z: zn * invF(y - b / 200)
    };
}
function rgbToLab(r, g, b) {
    const { x, y, z } = rgbToXyz(r, g, b);
    return xyzToLab(x, y, z);
}
function labToRgb(L, a, b) {
    const { x, y, z } = labToXyz(L, a, b);
    return xyzToRgb(x, y, z);
}

function labToLch(L, a, b) {
    const C = Math.sqrt(a * a + b * b);
    const H = C < 1e-10 ? 0 : (Math.atan2(b, a) * 180) / Math.PI;
    return { L, C, H: H < 0 ? H + 360 : H };
}
function lchToLab(L, C, H) {
    const rad = (H * Math.PI) / 180;
    return { L, a: C * Math.cos(rad), b: C * Math.sin(rad) };
}

function getLightnessLab(hex) {
    const rgb = hexToRgb(hex);
    if (!rgb) return 50;
    const lab = rgbToLab(rgb.r, rgb.g, rgb.b);
    return lab.L;
}

/** @param {string} hex */
export function getHighContrastMono(hex) {
    const L = getLightnessLab(hex);
    return L >= LAB_LIGHT_THRESHOLD ? '#000000' : '#ffffff';
}

/**
 * @param {string} backgroundColorHex
 * @param {{ iconBase?: string }} [options]
 */
export function getHighContrastForBackground(backgroundColorHex, options = {}) {
    const L = getLightnessLab(backgroundColorHex);
    const textColor = L >= LAB_LIGHT_THRESHOLD ? '#000000' : '#ffffff';
    const variant = textColor === '#000000' ? 'black' : 'white';
    const iconBase = options.iconBase ?? '/palette-utils/icons/anchors';
    const iconSet = {
        url: `${iconBase}/icons8-url-16-black.png`,
        back: `${iconBase}/icons8-back-16-black.png`,
        img: `${iconBase}/icons8-img-16-black.png`,
        variant
    };
    return { textColor, iconSet };
}

export function getIconSetForBackgroundColor(backgroundColorHex, options = {}) {
    return getHighContrastForBackground(backgroundColorHex, options).iconSet;
}

export function getContrastIconSet(hex, options = {}) {
    return getIconSetForBackgroundColor(hex, options);
}

/**
 * @param {string} hex
 * @param {{ highlightPercent?: number, nearlyWhiteL?: number }} [options]
 */
export function getHighlightColor(hex, options = {}) {
    const highlightPercent = options.highlightPercent ?? DEFAULT_HIGHLIGHT_PERCENT;
    const nearlyWhiteL = options.nearlyWhiteL ?? NEARLY_WHITE_L_THRESHOLD;
    const multiplier = highlightPercent / 100;

    const rgb = hexToRgb(hex);
    if (!rgb) return hex;
    const lab = rgbToLab(rgb.r, rgb.g, rgb.b);
    const lch = labToLch(lab.L, lab.a, lab.b);
    let L2;
    if (lch.L >= nearlyWhiteL) {
        L2 = lch.L / multiplier;
    } else {
        L2 = Math.min(100, lch.L * multiplier);
    }
    const lab2 = lchToLab(L2, lch.C, lch.H);
    const out = labToRgb(lab2.L, lab2.a, lab2.b);
    return rgbToHex(out.r, out.g, out.b);
}

/** @param {unknown} value */
export function isExportedPalette(value) {
    if (!value || typeof value !== 'object') return false;
    const o = value;
    if (typeof o.name !== 'string') return false;
    if (!Array.isArray(o.colors)) return false;
    if (!o.colors.every((c) => typeof c === 'string')) return false;
    if (o.backgroundSwatchIndex !== undefined && (typeof o.backgroundSwatchIndex !== 'number' || o.backgroundSwatchIndex < 0)) {
        return false;
    }
    return true;
}

/** @param {string} jsonString */
export function parsePaletteJson(jsonString) {
    let parsed;
    try {
        parsed = JSON.parse(jsonString);
    } catch {
        return null;
    }
    if (!isExportedPalette(parsed)) return null;
    return parsed;
}

/** @param {string[]} colors */
export function normalizePaletteColors(colors) {
    for (let i = 0; i < colors.length; i++) {
        const normalized = formatHexDisplay(colors[i]);
        if (normalized) colors[i] = normalized;
    }
    return colors;
}
