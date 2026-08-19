import { describe, it, expect } from 'vitest';
import { computeColorGridLayout } from './colorGridLayout.mjs';

describe('computeColorGridLayout', () => {
  it('returns zeroed layout for n = 0', () => {
    expect(computeColorGridLayout(0, 300, 3)).toEqual({ cols: 0, rows: 0, squareSize: 0 });
  });

  it('returns zeroed layout for negative or non-finite n', () => {
    expect(computeColorGridLayout(-1, 300, 3)).toEqual({ cols: 0, rows: 0, squareSize: 0 });
    expect(computeColorGridLayout(NaN, 300, 3)).toEqual({ cols: 0, rows: 0, squareSize: 0 });
  });

  it('packs a perfect square number (9) into a 3x3 grid with no leftover cells', () => {
    const layout = computeColorGridLayout(9, 300, 3);
    expect(layout.cols).toBe(3);
    expect(layout.rows).toBe(3);
    expect(layout.cols * layout.rows).toBe(9);
    // 300 = 3 * squareSize + 2 * 3 (gaps) -> squareSize = 98
    expect(layout.squareSize).toBeCloseTo(98, 5);
  });

  it('packs a prime number (7) into a near-square 3x3 grid (2 leftover cells)', () => {
    const layout = computeColorGridLayout(7, 300, 3);
    expect(layout.cols).toBe(3);
    expect(layout.rows).toBe(3);
    expect(layout.cols * layout.rows - 7).toBe(2);
  });

  it('packs a small count (4) into a 2x2 grid', () => {
    const layout = computeColorGridLayout(4, 300, 3);
    expect(layout.cols).toBe(2);
    expect(layout.rows).toBe(2);
    // 300 = 2 * squareSize + 1 * 3 -> squareSize = 148.5
    expect(layout.squareSize).toBeCloseTo(148.5, 5);
  });

  it('handles n = 1 by filling the full container with a single square', () => {
    const layout = computeColorGridLayout(1, 300, 3);
    expect(layout.cols).toBe(1);
    expect(layout.rows).toBe(1);
    expect(layout.squareSize).toBe(300);
  });

  it('handles a non-square container/gap combination without negative sizes', () => {
    const layout = computeColorGridLayout(16, 50, 3);
    expect(layout.cols).toBe(4);
    expect(layout.rows).toBe(4);
    expect(layout.squareSize).toBeGreaterThanOrEqual(0);
  });

  it('chooses the limiting dimension when rows and cols differ (e.g. n = 10 -> 4x3)', () => {
    const layout = computeColorGridLayout(10, 300, 3);
    expect(layout.cols).toBe(4);
    expect(layout.rows).toBe(3);
    // limited by cols: (300 - 3*3)/4 = 72.75 vs rows: (300 - 2*3)/3 = 98 -> min is 72.75
    expect(layout.squareSize).toBeCloseTo(72.75, 5);
  });
});
