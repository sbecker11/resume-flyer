/**
 * Enumeration for badge display modes
 * Defines the three badge modalities for the application
 */
export const BadgeMode = Object.freeze({
    /** No badges or connection lines are displayed */
    NONE: 'no-badges',
    
    /** Badges and connection lines are visible, but no statistics */
    BADGES_ONLY: 'badges-only',
    
});

/**
 * Array of all valid badge modes for validation
 */
export const VALID_BADGE_MODES = Object.values(BadgeMode);

/**
 * Validates if a given mode is a valid badge mode
 * @param {string} mode - The mode to validate
 * @returns {boolean} True if mode is valid
 */
export function isValidBadgeMode(mode) {
    return VALID_BADGE_MODES.includes(mode);
}

/**
 * Gets the next mode in the cycle
 * @param {string} currentMode - Current badge mode
 * @returns {string} Next mode in cycle
 */
export function getNextBadgeMode(currentMode) {
    switch (currentMode) {
        case BadgeMode.NONE:
            return BadgeMode.BADGES_ONLY;
        case BadgeMode.BADGES_ONLY:
            return BadgeMode.NONE;
        default:
            return BadgeMode.NONE;
    }
}

/**
 * Gets display icon for a badge mode
 * @param {string} mode - Badge mode
 * @returns {string} Display icon
 */
export function getBadgeModeIcon(mode) {
    switch (mode) {
        case BadgeMode.NONE:
            return '-B'; // minus B for no badges
        case BadgeMode.BADGES_ONLY:
            return '+B'; // plus B for badges only
        default:
            return '-B';
    }
}

/**
 * Gets human-readable description for a badge mode
 * @param {string} mode - Badge mode
 * @returns {string} Human-readable description
 */
export function getBadgeModeDescription(mode) {
    switch (mode) {
        case BadgeMode.NONE:
            return 'No badges or lines shown';
        case BadgeMode.BADGES_ONLY:
            return 'Badges and lines visible';
        default:
            return 'Unknown mode';
    }
}

/**
 * Gets action description for switching to a badge mode
 * @param {string} mode - Badge mode
 * @returns {string} Action description
 */
export function getBadgeModeAction(mode) {
    switch (mode) {
        case BadgeMode.NONE:
            return 'Hide badges and lines';
        case BadgeMode.BADGES_ONLY:
            return 'Show badges and lines only';
        default:
            return 'Unknown action';
    }
}