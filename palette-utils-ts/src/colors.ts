/**
 * Palette color utilities – TypeScript, no framework deps.
 * Use in Node, browser, or any TS/JS project that consumes exported palette JSON.
 */

import type {
  ContrastIconSet,
  GetContrastIconSetOptions,
  GetHighlightColorOptions,
  HighContrastForBackground,
  RGB,
} from './types.js';

const DEFAULT_HIGHLIGHT_PERCENT = 135;
const NEARLY_WHITE_L_THRESHOLD = 75;

/** Format hex for display: always 7 chars (#rrggbb), lowercase. Expands #rgb to #rrggbb. */
export function formatHexDisplay(hex: string | null | undefined): string {
  if (!hex || typeof hex !== 'string') return '';
  const h = hex.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(h)) return h;
  const m = h.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/);
  if (m) return `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`;
  return h.startsWith('#') ? h : `#${h}`;
}

export function rgbToHex(r: number, g: number, b: number): string {
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/** Parse hex color to { r, g, b } (0-255). Returns null if invalid. */
export function hexToRgb(hex: string): RGB | null {
  const h = formatHexDisplay(hex);
  if (!h || !/^#[0-9a-f]{6}$/.test(h)) return null;
  return {
    r: parseInt(h.slice(1, 3), 16),
    g: parseInt(h.slice(3, 5), 16),
    b: parseInt(h.slice(5, 7), 16),
  };
}

function getLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0.5;
  const { r, g, b } = rgb;
  const [rs, gs, bs] = [r, g, b].map((n) => {
    const x = n / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Perceptual lightness (LAB L*) in 0–100. Used for "is this background light?" so text/icon
 * contrast matches human perception. Replaces the previous rule (bright if HSV.V >= 0.5).
 */
function getLightnessLab(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 50;
  const lab = rgbToLab(rgb.r, rgb.g, rgb.b);
  return lab.L;
}

/**
 * Threshold for "bright background → use black text/icons": when LAB L* >= this, use black.
 * Rule changed from: bright if HSV.V >= 0.5 → bright if LAB L* >= this (perceptual).
 * 23 keeps very dark colors (L* < 23) with white text; everything else gets black.
 */
/** L* >= this → light (black text); L* < this → dark (white text). WCAG equal-contrast midpoint ≈ 49.3. */
const LAB_LIGHT_THRESHOLD = 50;

/** Returns black or white hex for best contrast on the given background: white on dark, black on light. Uses LAB L* (perceptual lightness); bright when L* >= LAB_LIGHT_THRESHOLD → black text/icons. */
export function getHighContrastMono(hex: string): '#000000' | '#ffffff' {
  const L = getLightnessLab(hex);
  return L >= LAB_LIGHT_THRESHOLD ? '#000000' : '#ffffff';
}

/**
 * Returns high-contrast text color and icon set for a given background in one call, so text and
 * icons always use the same light/dark decision. Prefer this over separate getHighContrastMono
 * and getIconSetForBackgroundColor to avoid mismatches.
 */
export function getHighContrastForBackground(
  backgroundColorHex: string,
  options: GetContrastIconSetOptions = {}
): HighContrastForBackground {
  const L = getLightnessLab(backgroundColorHex);
  const textColor: '#000000' | '#ffffff' = L >= LAB_LIGHT_THRESHOLD ? '#000000' : '#ffffff';
  const variant = textColor === '#000000' ? 'black' : 'white';
  const iconBase = options.iconBase ?? '/palette-utils/icons/anchors';
  const iconSet: ContrastIconSet = {
    url: `${iconBase}/icons8-url-16-black.png`,
    back: `${iconBase}/icons8-back-16-black.png`,
    img: `${iconBase}/icons8-img-16-black.png`,
    variant,
  };
  return { textColor, iconSet };
}

/**
 * Returns an icon set (url, back, img paths and variant) for a given background color.
 * Prefer getHighContrastForBackground when you need both text color and icons for the same background.
 */
export function getIconSetForBackgroundColor(
  backgroundColorHex: string,
  options: GetContrastIconSetOptions = {}
): ContrastIconSet {
  return getHighContrastForBackground(backgroundColorHex, options).iconSet;
}

/**
 * @deprecated Use getIconSetForBackgroundColor. Returns paths for url, back, and img icons (same behavior).
 */
export function getContrastIconSet(
  hex: string,
  options: GetContrastIconSetOptions = {}
): ContrastIconSet {
  return getIconSetForBackgroundColor(hex, options);
}

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function linearToSrgb(c: number): number {
  if (c <= 0.0031308) return 12.92 * c;
  return 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

function rgbToXyz(r: number, g: number, b: number): { x: number; y: number; z: number } {
  const R = srgbToLinear(r / 255);
  const G = srgbToLinear(g / 255);
  const B = srgbToLinear(b / 255);
  return {
    x: 0.4124564 * R + 0.3575761 * G + 0.1804375 * B,
    y: 0.2126729 * R + 0.7151522 * G + 0.072175 * B,
    z: 0.0193339 * R + 0.119192 * G + 0.9503041 * B,
  };
}
function xyzToRgb(x: number, y: number, z: number): RGB {
  const R = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z;
  const G = -0.969266 * x + 1.8760108 * y + 0.041556 * z;
  const B = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z;
  return {
    r: Math.round(Math.min(255, Math.max(0, linearToSrgb(R) * 255))),
    g: Math.round(Math.min(255, Math.max(0, linearToSrgb(G) * 255))),
    b: Math.round(Math.min(255, Math.max(0, linearToSrgb(B) * 255))),
  };
}

const LAB_D65 = { xn: 0.95047, yn: 1, zn: 1.08883 };
function f(t: number): number {
  const d = 6 / 29;
  return t > d * d * d ? Math.pow(t, 1 / 3) : t / (3 * d * d) + 4 / 29;
}
function invF(t: number): number {
  const d = 6 / 29;
  return t > d ? t * t * t : 3 * d * d * (t - 4 / 29);
}
function xyzToLab(x: number, y: number, z: number): { L: number; a: number; b: number } {
  const { xn, yn, zn } = LAB_D65;
  const fy = f(y / yn);
  return {
    L: 116 * fy - 16,
    a: 500 * (f(x / xn) - fy),
    b: 200 * (fy - f(z / zn)),
  };
}
function labToXyz(L: number, a: number, b: number): { x: number; y: number; z: number } {
  const { xn, yn, zn } = LAB_D65;
  const y = (L + 16) / 116;
  return {
    x: xn * invF(y + a / 500),
    y: yn * invF(y),
    z: zn * invF(y - b / 200),
  };
}
function rgbToLab(r: number, g: number, b: number): { L: number; a: number; b: number } {
  const { x, y, z } = rgbToXyz(r, g, b);
  return xyzToLab(x, y, z);
}
function labToRgb(L: number, a: number, b: number): RGB {
  const { x, y, z } = labToXyz(L, a, b);
  return xyzToRgb(x, y, z);
}

function labToLch(L: number, a: number, b: number): { L: number; C: number; H: number } {
  const C = Math.sqrt(a * a + b * b);
  const H = C < 1e-10 ? 0 : (Math.atan2(b, a) * 180) / Math.PI;
  return { L, C, H: H < 0 ? H + 360 : H };
}
function lchToLab(L: number, C: number, H: number): { L: number; a: number; b: number } {
  const rad = (H * Math.PI) / 180;
  return { L, a: C * Math.cos(rad), b: C * Math.sin(rad) };
}

/**
 * Perceptually distinct highlight. When L >= nearlyWhiteL (e.g. 85): darken (L2 = L / multiplier).
 * When L < nearlyWhiteL: brighten (L2 = L * multiplier, capped at 100).
 * E.g. highlightPercent 135 (1.35): L>=85 → L/1.35; L<85 → L*1.35.
 * Use with getHighContrastMono(highlightColor) for text on the highlight.
 */
export function getHighlightColor(
  hex: string,
  options: GetHighlightColorOptions = {}
): string {
  const highlightPercent = options.highlightPercent ?? DEFAULT_HIGHLIGHT_PERCENT;
  const nearlyWhiteL = options.nearlyWhiteL ?? NEARLY_WHITE_L_THRESHOLD;
  const multiplier = highlightPercent / 100;

  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const lab = rgbToLab(rgb.r, rgb.g, rgb.b);
  const lch = labToLch(lab.L, lab.a, lab.b);
  let L2: number;
  if (lch.L >= nearlyWhiteL) {
    L2 = lch.L / multiplier;
  } else {
    L2 = Math.min(100, lch.L * multiplier);
  }
  const lab2 = lchToLab(L2, lch.C, lch.H);
  const out = labToRgb(lab2.L, lab2.a, lab2.b);
  return rgbToHex(out.r, out.g, out.b);
}
