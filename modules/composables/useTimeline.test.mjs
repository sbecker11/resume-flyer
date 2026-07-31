import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  computeBoundsFromJobs,
  initialize,
  useTimeline,
  YEAR_HEIGHT,
  FALLBACK_YEAR_SPAN,
} from './useTimeline.mjs';

beforeEach(() => {
  if (globalThis.window) {
    globalThis.window.CONSOLE_LOG_IGNORE = () => {};
  }
});

describe('computeBoundsFromJobs', () => {
  it('returns fallback window when jobs are empty', () => {
    const bounds = computeBoundsFromJobs([]);
    expect(bounds.source).toBe('fallback');
    expect(bounds.end - bounds.start).toBeCloseTo(FALLBACK_YEAR_SPAN, 5);
    expect(bounds.height).toBeCloseTo(FALLBACK_YEAR_SPAN * YEAR_HEIGHT + 50, 5);
  });

  it('returns fallback when all dates are redacted', () => {
    const bounds = computeBoundsFromJobs([
      { start: '9/XX', end: '4/XX' },
      { start: '3/XX', end: '6/XX' },
    ]);
    expect(bounds.source).toBe('fallback');
    expect(bounds.height).toBeGreaterThan(0);
  });

  it('uses CURRENT_DATE as open-ended max even when starts are redacted', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 31));
    const bounds = computeBoundsFromJobs([
      { start: '9/XX', end: 'CURRENT_DATE' },
    ]);
    // Open-ended end → today; no start → FALLBACK span before that end
    expect(bounds.source).toBe('jobs');
    expect(bounds.end).toBeCloseTo(2026 + 6 / 12 + 31 / 365.25 / 12, 2);
    expect(bounds.end - bounds.start).toBeCloseTo(FALLBACK_YEAR_SPAN, 2);
    vi.useRealTimers();
  });

  it('computes height from parseable min/max job dates', () => {
    const bounds = computeBoundsFromJobs([
      { start: '2020-01', end: '2022-06' },
      { start: '2018-06', end: '2019-12' },
    ]);
    expect(bounds.source).toBe('jobs');
    // earliest 2018-06 → −1y +6mo ≈ 2018.0; latest 2022-06 → +1y −12mo ≈ 2022.5
    expect(bounds.start).toBeLessThan(2019);
    expect(bounds.end).toBeGreaterThan(2022);
    expect(bounds.height).toBeCloseTo((bounds.end - bounds.start) * YEAR_HEIGHT + 50, 5);
  });
});

describe('useTimeline reinitialize', () => {
  it('updates startYear/endYear/timelineHeight from jobs on reinitialize', () => {
    const { reinitialize, startYear, endYear, timelineHeight, isInitialized } = useTimeline();
    reinitialize([
      { start: '2015-01', end: '2020-01' },
    ]);
    expect(isInitialized.value).toBe(true);
    expect(startYear.value).toBeLessThan(2016);
    expect(endYear.value).toBeGreaterThan(2019);
    expect(timelineHeight.value).toBeCloseTo((endYear.value - startYear.value) * YEAR_HEIGHT + 50, 5);

    // Switching resumes recomputes dimensions from the new jobs
    reinitialize([
      { start: '2022-01', end: '2024-01' },
    ]);
    expect(startYear.value).toBeGreaterThan(2020);
    expect(timelineHeight.value).toBeCloseTo((endYear.value - startYear.value) * YEAR_HEIGHT + 50, 5);
  });

  it('initialize delegates to the same bounds path', () => {
    initialize([{ start: '2010-01', end: '2012-01' }]);
    const { startYear, timelineHeight } = useTimeline();
    expect(startYear.value).toBeLessThan(2011);
    expect(timelineHeight.value).toBeGreaterThan(0);
  });

  it('extendToCoverSceneBottom grows height to cover card bottoms', () => {
    const { reinitialize, extendToCoverSceneBottom, timelineHeight, startYear, endYear } =
      useTimeline();
    reinitialize([{ start: '2022-01', end: '2024-01' }]);
    const before = timelineHeight.value;
    const endBefore = endYear.value;
    extendToCoverSceneBottom(before + 500, { padding: 40 });
    expect(timelineHeight.value).toBe(Math.ceil(before + 500) + 40);
    expect(endYear.value).toBe(endBefore);
    expect(startYear.value).toBeLessThan(endBefore);
  });
});
