/**
 * Types for Color Palette Maker exported palette JSON and color utilities.
 * Use these when loading and consuming .json files exported from the app.
 */

/**
 * Externally created color palette (e.g. from Color Palette Maker Export Palette).
 * Shape: { name, colors } plus optional attributes.
 */
export interface ExportedPalette {
  name: string;
  colors: string[];
  /**
   * Optional attribute of the externally created palette.
   * Index of the swatch to use as this palette’s default background (--background-light/dark).
   * Each palette may specify a different index. If omitted, app may derive (e.g. darkest).
   */
  backgroundSwatchIndex?: number;
}

/** RGB channels 0–255. */
export interface RGB {
  r: number;
  g: number;
  b: number;
}

/** XYZ (D65). */
export interface XYZ {
  x: number;
  y: number;
  z: number;
}

/** LAB (L in [0,100], a/b unbounded). */
export interface LAB {
  L: number;
  a: number;
  b: number;
}

/** LCH (lightness, chroma, hue in degrees). */
export interface LCH {
  L: number;
  C: number;
  H: number;
}

/** Contrast icon set: paths and variant for CSS (e.g. filter: invert(1)). */
export interface ContrastIconSet {
  url: string;
  back: string;
  img: string;
  variant: 'black' | 'white';
}

/** Options for getHighlightColor. */
export interface GetHighlightColorOptions {
  highlightPercent?: number;
  nearlyWhiteL?: number;
}

/** Options for getContrastIconSet. */
export interface GetContrastIconSetOptions {
  iconBase?: string;
}
