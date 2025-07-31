/**
 * Badge Manager Vue Composable
 * Replaces the legacy BadgeManager class with Vue-native reactivity
 * 
 * Manages:
 * - Badge visibility modes: 'hide-badges' | 'show-badges'
 * - Statistics visibility for selected job elements
 * - Connection lines visibility
 * - State persistence through AppState
 * 
 * Usage:
 *   const { isBadgesVisible, isConnectionLinesVisible, badgeMode } = useBadgeManager()
 */

import { ref, computed, watch, readonly, onMounted } from 'vue'
import { useAppState } from './useAppState.mjs'
import { BadgeMode, isValidBadgeMode, getBadgeModeIcon, getBadgeModeDescription } from '../core/BadgeMode.mjs'

// Singleton state - shared across all component instances
const badgeMode = ref(BadgeMode.SHOW_BADGES) // Force permanent visibility
const isInitialized = ref(false)

/**
 * Badge Manager Composable
 * @returns {Object} Badge management functions and reactive state
 */
export function useBadgeManager() {
    const { appState, updateAppState } = useAppState()

    // --- Computed Properties ---
    
    /**
     * Check if badges should be visible
     * @returns {boolean} True if badges should be shown
     */
    const isBadgesVisible = computed(() => {
        return badgeMode.value === BadgeMode.SHOW_BADGES
    })
    
    /**
     * Check if connection lines should be visible
     * @returns {boolean} True if connection lines should be shown
     */
    const isConnectionLinesVisible = computed(() => {
        return badgeMode.value === BadgeMode.SHOW_BADGES
    })
    
    /**
     * Check if statistics should be visible
     * @returns {boolean} Always false since stats mode was removed
     */
    const isStatsVisible = computed(() => {
        return false // Stats mode removed from simplified badge system
    })
    
    /**
     * Get display icon for current mode
     * @returns {string} Display icon
     */
    const displayIcon = computed(() => {
        return getBadgeModeIcon(badgeMode.value)
    })
    
    /**
     * Get description for current mode
     * @returns {string} Human-readable description
     */
    const modeDescription = computed(() => {
        return getBadgeModeDescription(badgeMode.value)
    })

    // --- Methods ---
    
    /**
     * Initialize badge manager with app state
     * Called automatically on first use
     */
    async function initialize() {
        if (isInitialized.value) return
        
        // Initialize with show badges mode
        
        // Force badges to always be visible - ignore AppState
        badgeMode.value = BadgeMode.SHOW_BADGES
        // Mode set to show badges
        
        // Update AppState to reflect forced mode
        if (appState.value) {
            await updateAppState('badgeToggle.mode', BadgeMode.SHOW_BADGES)
        }
        
        // Update all badge visibility in DOM
        updateBadgeVisibility()
        
        isInitialized.value = true
        // Initialization complete
    }
    
    /**
     * Set badge mode (disabled - badges permanently visible)
     * @param {string} mode - New mode from BadgeMode enumeration
     * @param {string} caller - Optional caller identification for debugging
     */
    function setMode(mode, caller = '') {
        // Mode change ignored - badges permanently visible
        // Always keep badges visible - ignore mode changes
        return
    }
    
    /**
     * Toggle badge mode (disabled - badges permanently visible)
     * @param {string} caller - Optional caller identification for debugging
     */
    function toggleMode(caller = 'toggleMode') {
        // Toggle request ignored - badges permanently visible
        // No toggle functionality - badges always visible
        return
    }
    
    /**
     * Force refresh of all badge-related visibility
     * Useful when DOM structure changes or elements are added/removed
     */
    function refreshVisibility() {
        // Force refreshing visibility
        updateBadgeVisibility()
    }
    
    /**
     * Check if connection line updates should be allowed
     * @returns {boolean} True if connection updates are allowed
     */
    function allowConnectionUpdates() {
        return isConnectionLinesVisible.value
    }
    
    /**
     * Clear connections if they shouldn't be visible
     * @param {Array} connectionsRef - Vue ref to the connections array
     */
    function clearConnectionsIfNeeded(connectionsRef) {
        if (!isConnectionLinesVisible.value && connectionsRef.value.length > 0) {
            // Clearing connections - not visible
            connectionsRef.value = []
        }
    }

    // --- DOM Manipulation (Legacy Support) ---
    
    /**
     * Update badge container visibility based on current mode
     * @private
     */
    function updateBadgeVisibility() {
        const shouldShowBadges = isBadgesVisible.value
        
        // Find skill badge containers
        const badgeContainers = document.querySelectorAll('#skill-badges-container, .skill-badges-container')
        
        badgeContainers.forEach(container => {
            if (shouldShowBadges) {
                container.style.display = 'block'
            } else {
                container.style.display = 'none'
            }
        })
        
        // Updated badge containers
    }
    
    /**
     * Update statistics visibility based on current mode
     * @private
     */
    function updateStatsVisibility() {
        const shouldShowStats = isStatsVisible.value
        
        // Find all skill badge stats elements
        const allStatsElements = document.querySelectorAll('.skill-badge-stats, .skill-badge-stats.resume-stats, .biz-card-stats-div .skill-badge-stats, .biz-card-stats-div')
        
        allStatsElements.forEach(statsEl => {
            if (shouldShowStats) {
                statsEl.classList.remove('hidden-by-mode')
            } else {
                statsEl.classList.add('hidden-by-mode')
            }
        })
        
        // Handle biz-card-stats-div containers specifically
        const bizCardStatsDivs = document.querySelectorAll('.biz-card-stats-div')
        bizCardStatsDivs.forEach(statsDiv => {
            if (shouldShowStats) {
                statsDiv.style.display = 'block'
                statsDiv.classList.remove('hidden-by-mode')
            } else {
                statsDiv.style.display = 'none'
                statsDiv.classList.add('hidden-by-mode')
            }
        })
        
        // Updated stats elements
    }

    // --- Watchers ---
    
    // Watch for badge mode changes and update DOM
    watch(badgeMode, (newMode) => {
        // Badge mode changed
        updateBadgeVisibility()
        updateStatsVisibility()
        
        // Update AppState
        if (appState.value) {
            updateAppState('badgeToggle.mode', newMode)
        }
    }, { immediate: true })

    // --- Auto-Initialize ---
    
    // Initialize automatically when composable is first used
    onMounted(() => {
        initialize()
    })

    // --- Public API ---
    
    return {
        // Reactive state (readonly)
        badgeMode: readonly(badgeMode),
        isBadgesVisible,
        isConnectionLinesVisible,
        isStatsVisible,
        displayIcon,
        modeDescription,
        isInitialized: readonly(isInitialized),
        
        // Methods
        initialize,
        setMode,
        toggleMode,
        refreshVisibility,
        allowConnectionUpdates,
        clearConnectionsIfNeeded,
        
        // Legacy compatibility (for components that need direct DOM access)
        updateBadgeVisibility,
        updateStatsVisibility
    }
}

// For backward compatibility - create a singleton instance
let _singletonInstance = null

/**
 * Get singleton instance for backward compatibility with legacy code
 * @returns {Object} Singleton badge manager instance
 */
export function getBadgeManagerInstance() {
    if (!_singletonInstance) {
        _singletonInstance = useBadgeManager()
        
        // Add backward compatibility methods for legacy components
        _singletonInstance.addEventListener = () => {
            // addEventListener called - using Vue reactivity
        }
        
        _singletonInstance.removeEventListener = () => {
            // removeEventListener called - using Vue reactivity
        }
        
        _singletonInstance.dispatchEvent = () => {
            // dispatchEvent called - using Vue reactivity
        }
        
        // Legacy methods that might be called
        _singletonInstance.getMode = () => badgeMode.value
        _singletonInstance._mode = badgeMode.value
        
        // Added backward compatibility methods
    }
    return _singletonInstance
}