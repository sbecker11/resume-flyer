/**
 * Card geometry constants (ported from flock-of-postcards)
 * Used for bizcard and skill card layout in the scene.
 */

// Bizcard dimensions (px) - from flock-of-postcards constants.ts
export const BIZCARD_WIDTH = 200;
export const BIZCARD_INDENT = 29;
export const MIN_BIZCARD_HEIGHT = 200;
// Horizontal: max random offset from canvas center (px each side); actual range limited by canvas edges
export const BIZCARD_HZ_CENTER_OFFSET_MAX = 60;

// Skill card dimensions and positioning - from flock-of-postcards card.ts
export const MEAN_CARD_WIDTH = 100;
export const MEAN_CARD_HEIGHT = 75;
export const MAX_CARD_POSITION_OFFSET = 120;
export const CARD_BORDER_WIDTH = 3;

// Skill card one-time reposition (flock-of-postcards repositionAllCardsToWeightedAverages)
export const SKILL_REPOSITION_EDGE_VARIANCE = 60;
export const SKILL_REPOSITION_MIN_DISTANCE = 150;
export const SKILL_REPOSITION_STRENGTH = 0.5;
export const SKILL_REPOSITION_MAX_ITERATIONS = 20;
export const SKILL_UNIQUE_X_MIN_SEPARATION = 40;
export const SKILL_UNIQUE_X_JITTER = 10;
