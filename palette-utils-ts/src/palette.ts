/**
 * Helpers for loading and validating exported palette JSON files.
 */

import type { ExportedPalette } from './types.js';
import { formatHexDisplay } from './colors.js';

/**
 * Type guard: true if value looks like an ExportedPalette (name + colors array).
 */
export function isExportedPalette(value: unknown): value is ExportedPalette {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  if (typeof o.name !== 'string') return false;
  if (!Array.isArray(o.colors)) return false;
  if (!o.colors.every((c) => typeof c === 'string')) return false;
  if (o.backgroundSwatchIndex !== undefined && (typeof o.backgroundSwatchIndex !== 'number' || o.backgroundSwatchIndex < 0)) return false;
  return true;
}

/**
 * Parse JSON string and validate as ExportedPalette. Returns null if invalid.
 */
export function parsePaletteJson(jsonString: string): ExportedPalette | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    return null;
  }
  if (!isExportedPalette(parsed)) return null;
  return parsed;
}

/**
 * Normalize palette colors to #rrggbb lowercase. Mutates and returns the same array.
 */
export function normalizePaletteColors(colors: string[]): string[] {
  for (let i = 0; i < colors.length; i++) {
    const normalized = formatHexDisplay(colors[i]);
    if (normalized) colors[i] = normalized;
  }
  return colors;
}
