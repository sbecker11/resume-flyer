/**
 * Helpers for loading and validating exported palette JSON files.
 */
import { formatHexDisplay } from './colors.js';
/**
 * Type guard: true if value looks like an ExportedPalette (name + colors array).
 */
export function isExportedPalette(value) {
    if (!value || typeof value !== 'object')
        return false;
    const o = value;
    if (typeof o.name !== 'string')
        return false;
    if (!Array.isArray(o.colors))
        return false;
    if (!o.colors.every((c) => typeof c === 'string'))
        return false;
    if (o.backgroundSwatchIndex !== undefined && (typeof o.backgroundSwatchIndex !== 'number' || o.backgroundSwatchIndex < 0))
        return false;
    return true;
}
/**
 * Parse JSON string and validate as ExportedPalette. Returns null if invalid.
 */
export function parsePaletteJson(jsonString) {
    let parsed;
    try {
        parsed = JSON.parse(jsonString);
    }
    catch {
        return null;
    }
    if (!isExportedPalette(parsed))
        return null;
    return parsed;
}
/**
 * Normalize palette colors to #rrggbb lowercase. Mutates and returns the same array.
 */
export function normalizePaletteColors(colors) {
    for (let i = 0; i < colors.length; i++) {
        const normalized = formatHexDisplay(colors[i]);
        if (normalized)
            colors[i] = normalized;
    }
    return colors;
}
