/**
 * Fetch and parse public palette catalog (NDJSON from S3).
 * Same line format as color_palettes.jsonl.
 */
/**
 * One color palette record (one line in the jsonl catalog).
 * Structure: paletteName, colorPalette, imagePublicUrl, backgroundSwatchIndex — see README-ts.md.
 */
export type ColorPaletteRecord = Record<string, unknown>;
/**
 * Parse newline-delimited JSON (one JSON object per line).
 */
export declare function parseColorPalette(jsonString: string | null | undefined): ColorPaletteRecord[];
/**
 * GET a URL and return parsed palette records.
 */
export declare function fetchColorPalettesJsonl(url: string, init?: RequestInit): Promise<ColorPaletteRecord[]>;
/**
 * Returns catalog URL from `import.meta.env.S3_COLOR_PALETTES_JSON_URL` (.env file).
 */
export declare function getColorPalettesS3Url(): string | null;
/**
 * Fetch catalog using {@link getColorPalettesS3Url}.
 */
export declare function fetchColorPalettesFromS3(): Promise<ColorPaletteRecord[]>;
//# sourceMappingURL=palettesCatalog.d.ts.map