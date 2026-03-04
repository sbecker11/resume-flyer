import { describe, it, expect } from 'vitest';
import {
  BIZCARD_WIDTH,
  BIZCARD_INDENT,
  MIN_BIZCARD_HEIGHT,
  BIZCARD_HZ_CENTER_OFFSET_MAX,
  MEAN_CARD_WIDTH,
  MEAN_CARD_HEIGHT,
  MAX_CARD_POSITION_OFFSET,
  CARD_BORDER_WIDTH,
  SKILL_REPOSITION_EDGE_VARIANCE,
  SKILL_REPOSITION_MIN_DISTANCE,
  SKILL_REPOSITION_STRENGTH,
  SKILL_REPOSITION_MAX_ITERATIONS,
  SKILL_UNIQUE_X_MIN_SEPARATION,
  SKILL_UNIQUE_X_JITTER,
} from './cardConstants.mjs';

describe('core/cardConstants', () => {
  it('exports bizcard constants', () => {
    expect(BIZCARD_WIDTH).toBe(200);
    expect(BIZCARD_INDENT).toBe(29);
    expect(MIN_BIZCARD_HEIGHT).toBe(200);
    expect(BIZCARD_HZ_CENTER_OFFSET_MAX).toBe(60);
  });
  it('exports skill card constants', () => {
    expect(MEAN_CARD_WIDTH).toBe(100);
    expect(MEAN_CARD_HEIGHT).toBe(75);
    expect(MAX_CARD_POSITION_OFFSET).toBe(120);
    expect(CARD_BORDER_WIDTH).toBe(3);
  });
  it('exports skill reposition constants', () => {
    expect(SKILL_REPOSITION_EDGE_VARIANCE).toBe(60);
    expect(SKILL_REPOSITION_MIN_DISTANCE).toBe(150);
    expect(SKILL_REPOSITION_STRENGTH).toBe(0.5);
    expect(SKILL_REPOSITION_MAX_ITERATIONS).toBe(20);
    expect(SKILL_UNIQUE_X_MIN_SEPARATION).toBe(40);
    expect(SKILL_UNIQUE_X_JITTER).toBe(10);
  });
});
