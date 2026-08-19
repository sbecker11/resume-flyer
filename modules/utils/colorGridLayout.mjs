// modules/utils/colorGridLayout.mjs

/**
 * Computes a near-square grid layout for packing N color swatches into a square container,
 * minimizing leftover background cells while keeping each swatch as large as possible.
 * @param {number} n - Number of colors to place (each gets one square cell).
 * @param {number} containerSize - Width/height of the (square) available area, in px.
 * @param {number} gap - Gap between adjacent squares, in px.
 * @returns {{ cols: number, rows: number, squareSize: number }}
 */
export function computeColorGridLayout(n, containerSize, gap) {
    if (!Number.isFinite(n) || n <= 0) {
        return { cols: 0, rows: 0, squareSize: 0 };
    }
    const cols = Math.ceil(Math.sqrt(n));
    const rows = Math.ceil(n / cols);
    const squareSizeByCols = (containerSize - (cols - 1) * gap) / cols;
    const squareSizeByRows = (containerSize - (rows - 1) * gap) / rows;
    const squareSize = Math.max(0, Math.min(squareSizeByCols, squareSizeByRows));
    return { cols, rows, squareSize };
}
