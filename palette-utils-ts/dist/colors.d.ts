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
/** Returns black or white hex for best contrast on the given background. */
export declare function getHighContrastMono(hex: string): '#000000' | '#ffffff';
/**
 * Returns paths for url, back, and img icons. Uses black PNGs only; when variant
 * is 'white', apply CSS filter: invert(1) to render white on dark backgrounds.
 */
export declare function getContrastIconSet(hex: string, options?: GetContrastIconSetOptions): ContrastIconSet;
/**
 * Perceptually distinct highlight: brighter for most colors; for nearly white,
 * darker. Use with getHighContrastMono(highlightColor) for text on the highlight.
 */
export declare function getHighlightColor(hex: string, options?: GetHighlightColorOptions): string;
//# sourceMappingURL=colors.d.ts.map