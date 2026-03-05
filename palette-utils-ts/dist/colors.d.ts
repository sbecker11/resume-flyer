/**
 * Palette color utilities – TypeScript, no framework deps.
 * Use in Node, browser, or any TS/JS project that consumes exported palette JSON.
 */
import type { ContrastIconSet, GetContrastIconSetOptions, GetHighlightColorOptions, RGB } from './types.js';
/** Format hex for display: always 7 chars (#rrggbb), lowercase. Expands #rgb to #rrggbb. */
export declare function formatHexDisplay(hex: string | null | undefined): string;
export declare function rgbToHex(r: number, g: number, b: number): string;
/** Parse hex color to { r, g, b } (0-255). Returns null if invalid. */
export declare function hexToRgb(hex: string): RGB | null;
/** Returns black or white hex for best contrast on the given background: white on dark, black on light. Uses LAB L* (perceptual lightness) so mid tones like #cb937f get black text. */
export declare function getHighContrastMono(hex: string): '#000000' | '#ffffff';
/**
 * Returns paths for url, back, and img icons. Uses black PNGs only.
 * variant is 'black' on light backgrounds, 'white' on dark; when variant is 'white',
 * apply CSS filter: invert(1) so icons render white on dark background.
 */
export declare function getContrastIconSet(hex: string, options?: GetContrastIconSetOptions): ContrastIconSet;
/**
 * Perceptually distinct highlight. When L >= nearlyWhiteL (e.g. 85): darken (L2 = L / multiplier).
 * When L < nearlyWhiteL: brighten (L2 = L * multiplier, capped at 100).
 * E.g. highlightPercent 135 (1.35): L>=85 → L/1.35; L<85 → L*1.35.
 * Use with getHighContrastMono(highlightColor) for text on the highlight.
 */
export declare function getHighlightColor(hex: string, options?: GetHighlightColorOptions): string;
//# sourceMappingURL=colors.d.ts.map