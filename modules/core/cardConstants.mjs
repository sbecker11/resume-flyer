/**
 * Card geometry constants (ported from resume-flyer)
 * Used for bizcard and skill card layout in the scene.
 */

// Bizcard dimensions (px) - from resume-flyer constants.ts
export const BIZCARD_WIDTH = 200;
export const BIZCARD_INDENT = 29;
export const MIN_BIZCARD_HEIGHT = 200;
/** Max random offset of biz card center X from scene center (px each side). Uniform in [-this, +this] so average centerX = 0. */
export const BIZCARD_HZ_CENTER_OFFSET_MAX = 60;
/** Random variation in biz card width (px). Width = BIZCARD_WIDTH + uniform(-this, +this), clamped to [BIZCARD_WIDTH - this, BIZCARD_WIDTH + this]. */
export const BIZCARD_WIDTH_VARIANCE = 24;

// Skill card dimensions and positioning - from resume-flyer card.ts
export const MEAN_CARD_WIDTH = 100;
export const MEAN_CARD_HEIGHT = 75;
export const MAX_CARD_POSITION_OFFSET = 120;
export const CARD_BORDER_WIDTH = 3;

// Skill card one-time reposition (resume-flyer repositionAllCardsToWeightedAverages)
export const SKILL_REPOSITION_EDGE_VARIANCE = 60;
export const SKILL_REPOSITION_MIN_DISTANCE = 150;
export const SKILL_REPOSITION_STRENGTH = 0.5;
export const SKILL_REPOSITION_MAX_ITERATIONS = 20;
export const SKILL_UNIQUE_X_MIN_SEPARATION = 40;
/** Minimum separation between skill card centers on both axes (px). Must be >= card height (~81px) to avoid vertical overlap. */
export const SKILL_MIN_SEPARATION = 90;
/** Minimum vertical gap between top edges so skill cards (and skill vs biz) don't align on the same row. */
export const SKILL_MIN_TOP_EDGE_SEPARATION = 55;

/** Max trial-rejections per skill card during placement; exceed → use random fallback (no grid). */
export const MAX_SKILL_PLACEMENT_TRIAL_REJECTIONS = 5000;
/** Stddev (px) for normal distribution of skill card X around biz card left/right edges. */
export const SKILL_PLACEMENT_X_STDDEV = 100;
