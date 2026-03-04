/**
 * Helpers for loading and validating exported palette JSON files.
 */
import type { ExportedPalette } from './types.js';
/**
 * Type guard: true if value looks like an ExportedPalette (name + colors array).
 */
export declare function isExportedPalette(value: unknown): value is ExportedPalette;
/**
 * Parse JSON string and validate as ExportedPalette. Returns null if invalid.
 */
export declare function parsePaletteJson(jsonString: string): ExportedPalette | null;
/**
 * Normalize palette colors to #rrggbb lowercase. Mutates and returns the same array.
 */
export declare function normalizePaletteColors(colors: string[]): string[];
//# sourceMappingURL=palette.d.ts.map