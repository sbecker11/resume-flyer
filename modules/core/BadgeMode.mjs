/**
 * Enumeration for badge display modes
 * Simplified to just two modes: hide or show badges with connection lines
 */
export const BadgeMode = Object.freeze({
    /** No badges or connection lines are displayed (default) */
    HIDE_BADGES: 'hide-badges',
    
    /** Badges and connection lines are visible */
    SHOW_BADGES: 'show-badges',
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
        case BadgeMode.HIDE_BADGES:
            return BadgeMode.SHOW_BADGES;
        case BadgeMode.SHOW_BADGES:
            return BadgeMode.HIDE_BADGES;
        default:
            return BadgeMode.HIDE_BADGES;
    }
}

/**
 * Gets display icon for a badge mode
 * @param {string} mode - Badge mode
 * @returns {string} Display icon
 */
export function getBadgeModeIcon(mode) {
    switch (mode) {
        case BadgeMode.HIDE_BADGES:
            return '-B'; // minus B for hidden badges
        case BadgeMode.SHOW_BADGES:
            return '+B'; // plus B for visible badges
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
        case BadgeMode.HIDE_BADGES:
            return 'Badges hidden';
        case BadgeMode.SHOW_BADGES:
            return 'Badges visible';
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
        case BadgeMode.HIDE_BADGES:
            return 'Hide badges';
        case BadgeMode.SHOW_BADGES:
            return 'Show badges';
        default:
            return 'Unknown action';
    }
}