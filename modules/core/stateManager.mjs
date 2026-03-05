import { deepMerge } from '../utils/utils.mjs';
import { reportError } from '../utils/errorReporting.mjs';

const STORAGE_KEY = 'flockOfPostcards_appState';

/**
 * Gets the default state for the application.
 * @returns {object} The default state object.
 */
export function getDefaultState() {
    return {
        version: "1.2", // Updated for constants system
        lastUpdated: new Date().toISOString(),
        layout: {
            orientation: 'scene-left', // Default to scene on left, resume on right
            scenePercentage: 50, // Scene takes 50% of window width
            resumePercentage: 50 // Resume takes 50% of window width
        },
        resizeHandle: {
            stepCount: 4
        },
        focalPoint: {
            mode: 'locked' // Default to locked mode
        },
        selectedJobNumber: null, // No default selection - only use saved state
        lastVisitedJobNumber: null, // Track the last job that was selected
        resume: {
            sortRule: { field: 'startDate', direction: 'asc' } // Default to oldest first
        },
        theme: {
            colorPalette: '50_Dark_Grey_Monotone.json', // Default palette
            brightnessFactorSelected: 2.0,  // Brightness factor for selected elements (scene cards)
            brightnessFactorHovered: 1.75,   // Brightness factor for hovered elements (scene cards)
            /* Padding and border width are identical across states so text does not shift on hover/select */
            borderSettings: {
                normal: {
                    padding: '8px',
                    innerBorderWidth: '1px',
                    innerBorderColor: 'white',
                    outerBorderWidth: '0px',
                    outerBorderColor: 'transparent',
                    borderRadius: '25px'
                },
                hovered: {
                    padding: '8px',
                    innerBorderWidth: '1px',
                    innerBorderColor: 'blue',
                    outerBorderWidth: '0px',
                    outerBorderColor: 'transparent',
                    borderRadius: '25px'
                },
                selected: {
                    padding: '8px',
                    innerBorderWidth: '1px',
                    innerBorderColor: 'purple',
                    outerBorderWidth: '0px',
                    outerBorderColor: 'transparent',
                    borderRadius: '25px'
                }
            },
            rDivBorderOverrideSettings: {
                normal: { padding: '15px', innerBorderWidth: '1px', marginTop: '11px' },
                hovered: { padding: '15px', innerBorderWidth: '1px', marginTop: '11px' },
                selected: { padding: '15px', innerBorderWidth: '1px', marginTop: '11px' }
            }
        },
        color: {
            palettes: {}
        },
        // NEW: Constants system for centralized configuration
        constants: {
            // Z-Index System
            zIndex: {
                root: 0,
                scene: 1,
                sceneGradients: 2,
                timeline: 3,
                backgroundMax: 6,
                cardsMin: 10,
                cardsMax: 19,
                bullsEye: 98,
                selectedCard: 99,
                focalPoint: 100,
                aimPoint: 101
            },
            // Card Layout
            cards: {
                meanWidth: 180,
                minHeight: 180,
                maxXOffset: 100,
                maxWidthOffset: 30,
                minZDiff: 2
            },
            // Timeline Configuration
            timeline: {
                pixelsPerYear: 200,
                paddingTop: 0,
                gradientLength: "50vh"
            },
            // Resize Handle
            resizeHandle: {
                width: 20,
                shadowWidth: 8,
                shadowBlur: 5,
                defaultWidthPercent: 50
            },
            // Animation & Timing
            animation: {
                durations: {
                    fast: "0.2s",
                    medium: "0.3s",
                    slow: "0.5s",
                    spinner: "1s"
                },
                autoScroll: {
                    repeatMillis: 10,
                    maxVelocity: 3.0,
                    minVelocity: 2.0,
                    changeThreshold: 2.0,
                    scrollZonePercentage: 0.20
                }
            },
            // Performance
            performance: {
                thresholds: {
                    resizeTime: 16,
                    scrollTime: 8,
                    memoryUsage: 52428800
                },
                debounceTimeout: 100
            },
            // Typography
            typography: {
                fontSizes: {
                    small: "10px",
                    medium: "12px",
                    large: "14px",
                    xlarge: "16px",
                    xxlarge: "20px",
                    timeline: "48px"
                },
                fontFamily: "'Inter', sans-serif"
            },
            // Visual Effects
            visualEffects: {
                parallax: {
                    xExaggerationFactor: 0.9,
                    yExaggerationFactor: 1.0
                },
                depthEffects: {
                    minBrightnessPercent: 15,
                    blurScaleFactor: 2.0,
                    filterMultipliers: {
                        brightness: { min: 0.4, factor: 0.10 },
                        blur: { min: 0, factor: 0.10 },
                        contrast: { min: 0.75, factor: 0.010 },
                        saturate: { min: 0.75, factor: 0.010 }
                    }
                }
            }
        }
    };
}

/**
 * Migrates old state versions to current version
 * @param {object} state The state to migrate
 * @returns {object} The migrated state
 */
function migrateState(state) {
    if (!state.version) {
        state.version = "1.0"; // Assume version 1.0 if no version present
    }

    // Migration from 1.0 to 1.1: Update marginTop values
    if (state.version === "1.0") {
        window.CONSOLE_LOG_IGNORE('[MIGRATION] Migrating state from v1.0 to v1.1: Updating marginTop values');
        
        // Ensure rDivBorderOverrideSettings exists
        if (!state.theme) state.theme = {};
        if (!state.theme.rDivBorderOverrideSettings) {
            state.theme.rDivBorderOverrideSettings = {
                normal: { padding: '15px', innerBorderWidth: '1px', marginTop: '11px' },
                hovered: { padding: '15px', innerBorderWidth: '1px', marginTop: '11px' },
                selected: { padding: '15px', innerBorderWidth: '1px', marginTop: '11px' }
            };
        } else {
            // Create new objects to avoid readonly proxy issues
            if (state.theme.rDivBorderOverrideSettings.normal) {
                state.theme.rDivBorderOverrideSettings.normal = {
                    ...state.theme.rDivBorderOverrideSettings.normal,
                    marginTop: '11px'
                };
            }
            if (state.theme.rDivBorderOverrideSettings.hovered) {
                state.theme.rDivBorderOverrideSettings.hovered = {
                    ...state.theme.rDivBorderOverrideSettings.hovered,
                    marginTop: '11px'
                };
            }
            if (state.theme.rDivBorderOverrideSettings.selected) {
                state.theme.rDivBorderOverrideSettings.selected = {
                    ...state.theme.rDivBorderOverrideSettings.selected,
                    marginTop: '11px'
                };
            }
        }
        
        state.version = "1.1";
        window.CONSOLE_LOG_IGNORE('[MIGRATION] Successfully migrated to v1.1');
    }

    // Migration from 1.1 to 1.2: Add constants system while preserving user preferences
    if (state.version === "1.1") {
        window.CONSOLE_LOG_IGNORE('[MIGRATION] Migrating state from v1.1 to v1.2: Adding constants system');
        
        // Preserve existing focal point mode (don't reset to locked)
        // The user's saved preference should be maintained
        
        // Ensure resizeHandle has stepCount
        if (!state.resizeHandle) {
            state.resizeHandle = {};
        }
        if (!state.resizeHandle.stepCount) {
            state.resizeHandle.stepCount = 4;
        }
        
        // Ensure color section exists
        if (!state.color) {
            state.color = { palettes: {} };
        }
        
        // Constants will be added via deepMerge with default state
        
        state.version = "1.2";
        window.CONSOLE_LOG_IGNORE('[MIGRATION] Successfully migrated to v1.2 - preserved user preferences');
    }

    // Migration from 1.2 to 1.3: Normalize border/padding so hovered and selected match normal (no text shift)
    if (state.version === "1.2") {
        window.CONSOLE_LOG_IGNORE('[MIGRATION] Migrating state from v1.2 to v1.3: consistent border/padding');
        if (state.theme?.borderSettings) {
            const n = state.theme.borderSettings.normal;
            if (n) {
                state.theme.borderSettings.hovered = { ...state.theme.borderSettings.hovered, padding: n.padding, innerBorderWidth: n.innerBorderWidth, outerBorderWidth: n.outerBorderWidth ?? '0px', borderRadius: n.borderRadius };
                state.theme.borderSettings.selected = { ...state.theme.borderSettings.selected, padding: n.padding, innerBorderWidth: n.innerBorderWidth, outerBorderWidth: n.outerBorderWidth ?? '0px', borderRadius: n.borderRadius };
            }
        }
        if (state.theme?.rDivBorderOverrideSettings) {
            const n = state.theme.rDivBorderOverrideSettings.normal;
            if (n) {
                state.theme.rDivBorderOverrideSettings.hovered = { ...state.theme.rDivBorderOverrideSettings.hovered, padding: n.padding, innerBorderWidth: n.innerBorderWidth };
                state.theme.rDivBorderOverrideSettings.selected = { ...state.theme.rDivBorderOverrideSettings.selected, padding: n.padding, innerBorderWidth: n.innerBorderWidth };
            }
        }
        state.version = "1.3";
        window.CONSOLE_LOG_IGNORE('[MIGRATION] Successfully migrated to v1.3');
    }

    return state;
}

/**
 * Loads the application state from the server.
 * If no state is found, it returns the default state.
 * @returns {Promise<object>} A promise that resolves to the application state.
 */
export async function loadState() {
    try {
        const response = await fetch('/api/state');
        if (!response.ok) {
            if (response.status === 404) {
                window.CONSOLE_LOG_IGNORE("No saved state found on server, using default state.");
            } else {
                window.CONSOLE_LOG_IGNORE(`Failed to load state, server responded with status: ${response.status}`);
            }
            return getDefaultState();
        }
        const rawState = await response.json();
        window.CONSOLE_LOG_IGNORE("Loaded raw state from server:", rawState);
        
        // Migrate the state to current version
        const migratedState = migrateState(rawState);
        
        // Merge the migrated state into default state to ensure all keys exist
        // This way, saved values take precedence over defaults
        const finalState = deepMerge(getDefaultState(), migratedState);
        
        window.CONSOLE_LOG_IGNORE("Final state after migration and merge:", finalState);
        return finalState;
    } catch (e) {
        reportError(e, '[stateManager] Error fetching state from server', '');
        throw e;
    }
}

/**
 * Saves the provided state object to the server.
 * @param {object} state The application state to save.
 */
export async function saveState(state) {
    try {
        state.lastUpdated = new Date().toISOString();
        await fetch('/api/state', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(state),
        });
        window.CONSOLE_LOG_IGNORE("Saved state to server:", state); // This can be noisy
    } catch (e) {
        reportError(e, '[stateManager] Failed to save state to server', '');
        throw e;
    }
}

/**
 * A global state object to hold the current application state.
 * This will be populated by initialization.
 */
export let AppState = null;

let initStatePromise = null;

/**
 * Initializes the global AppState by loading it from the server.
 * This must be called before any other module tries to access AppState.
 * This function is now idempotent: it will only load state once.
 */
export function initializeState() {
    if (!initStatePromise) {
        initStatePromise = loadState().then(state => {
            AppState = state;
            // Dispatch event to notify components that state is loaded
            window.dispatchEvent(new CustomEvent('app-state-loaded', {
                detail: { state: AppState }
            }));
            return state;
        });
    }
    return initStatePromise;
} 
