/**
 * color-palette-utils-ts
 *
 * TypeScript types and utilities for projects that consume Color Palette Maker
 * exported palette JSON files ({ name, colors }). Use for contrast text, highlight
 * colors, icon sets, and loading/validating palette JSON.
 */
export type { ContrastIconSet, ExportedPalette, GetContrastIconSetOptions, GetHighlightColorOptions, LAB, LCH, RGB, XYZ, } from './types.js';
export { formatHexDisplay, getContrastIconSet, getHighlightColor, getHighContrastMono, hexToRgb, rgbToHex, } from './colors.js';
export { isExportedPalette, normalizePaletteColors, parsePaletteJson, } from './palette.js';
//# sourceMappingURL=index.d.ts.map