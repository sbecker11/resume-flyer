/**
 * Centralized AppState management using Vue composables
 * Replaces the complex IM framework with simple, Vue-native patterns
 * 
 * Usage:
 *   const { appState, isLoading, loadAppState } = useAppState()
 *   await loadAppState() // Call once in App.vue onMounted
 *   // appState.value is now available in all components
 */

import { ref, readonly, type Ref } from 'vue'
// @ts-ignore - Legacy module imports with type declarations
import { deepMerge } from '../utils/utils.mjs'
// @ts-ignore - Legacy module imports with type declarations
import type { AppState, UseAppStateReturn } from '../types/index'

// Singleton state - shared across all component instances
const appState: Ref<AppState | null> = ref(null)
const isLoading: Ref<boolean> = ref(false)
const isLoaded: Ref<boolean> = ref(false)
const loadError: Ref<Error | null> = ref(null)

// Single promise to prevent multiple simultaneous loads
let loadPromise: Promise<AppState> | null = null

// Scheduled auto-save system
let saveTimeoutId: NodeJS.Timeout | null = null
let hasPendingUpdates = false
let autoSaveIntervalId: NodeJS.Timeout | null = null
let isDragModeActive = false

// Configuration
const AUTO_SAVE_INTERVAL = 5000 // 5 seconds
const DEBOUNCE_TIMEOUT = 1000   // 1 second for immediate debouncing

/**
 * Gets the default state - preserving existing user/system separation
 */
function getDefaultState(): AppState {
    return {
        version: "1.3",
        lastUpdated: new Date().toISOString(),
        
        "user-settings": {
            layout: {
                orientation: 'scene-left',
                scenePercentage: 50,
                resumePercentage: 50
            },
            resizeHandle: {
                stepCount: 4
            },
            focalPointMode: 'locked',
            selectedJobNumber: null,
            lastVisitedJobNumber: null,
            resume: {
                sortRule: { field: 'startDate', direction: 'asc' }
            },
            theme: {
                colorPalette: 'sweeps.json'
            }
        },
        
        "system-constants": {
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
            cards: {
                meanWidth: 180,
                minHeight: 180,
                maxXOffset: 100,
                maxWidthOffset: 30,
                minZDiff: 2
            },
            timeline: {
                pixelsPerYear: 200,
                paddingTop: 0,
                gradientLength: "50vh"
            },
            resizeHandle: {
                width: 20,
                shadowWidth: 8,
                shadowBlur: 5,
                defaultWidthPercent: 50
            },
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
            performance: {
                thresholds: {
                    resizeTime: 16,
                    scrollTime: 8,
                    memoryUsage: 52428800
                },
                debounceTimeout: 100
            },
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
            },
            theme: {
                brightnessFactorSelected: 2.0,
                brightnessFactorHovered: 1.75,
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
                        padding: '7px',
                        innerBorderWidth: '2px',
                        innerBorderColor: 'blue',
                        outerBorderWidth: '0px',
                        outerBorderColor: 'transparent',
                        borderRadius: '25px'
                    },
                    selected: {
                        padding: '6px',
                        innerBorderWidth: '3px',
                        innerBorderColor: 'purple',
                        outerBorderWidth: '0px',
                        outerBorderColor: 'transparent',
                        borderRadius: '25px'
                    }
                },
                rDivBorderOverrideSettings: {
                    normal: {
                        padding: '15px',
                        innerBorderWidth: '1px',
                        marginTop: '11px'
                    },
                    hovered: {
                        padding: '14px',
                        innerBorderWidth: '2px',
                        marginTop: '11px'
                    },
                    selected: {
                        padding: '13px',
                        innerBorderWidth: '3px',
                        marginTop: '11px'
                    }
                }
            }
        }
    };
}

/**
 * Migrates old state versions to current version
 */
function migrateState(state: any): AppState {
    if (!state.version) {
        state.version = "1.0"
    }

    // Migration from 1.0 to 1.1: Update marginTop values
    if (state.version === "1.0") {
        console.log('[AppState] Migrating state from v1.0 to v1.1: Updating marginTop values')
        
        if (!state.theme) state.theme = {}
        if (!state.theme.rDivBorderOverrideSettings) {
            state.theme.rDivBorderOverrideSettings = {
                normal: { padding: '15px', innerBorderWidth: '1px', marginTop: '11px' },
                hovered: { padding: '14px', innerBorderWidth: '2px', marginTop: '11px' },
                selected: { padding: '13px', innerBorderWidth: '3px', marginTop: '11px' }
            }
        } else {
            // Create new objects to avoid readonly proxy issues
            if (state.theme.rDivBorderOverrideSettings.normal) {
                state.theme.rDivBorderOverrideSettings.normal = {
                    ...state.theme.rDivBorderOverrideSettings.normal,
                    marginTop: '11px'
                }
            }
            if (state.theme.rDivBorderOverrideSettings.hovered) {
                state.theme.rDivBorderOverrideSettings.hovered = {
                    ...state.theme.rDivBorderOverrideSettings.hovered,
                    marginTop: '11px'
                }
            }
            if (state.theme.rDivBorderOverrideSettings.selected) {
                state.theme.rDivBorderOverrideSettings.selected = {
                    ...state.theme.rDivBorderOverrideSettings.selected,
                    marginTop: '11px'
                }
            }
        }
        
        state.version = "1.1"
        console.log('[AppState] Successfully migrated to v1.1')
    }

    // Migration from 1.1 to 1.2: Add constants system
    if (state.version === "1.1") {
        console.log('[AppState] Migrating state from v1.1 to v1.2: Adding constants system')
        
        if (!state.resizeHandle) {
            state.resizeHandle = {}
        }
        if (!state.resizeHandle.stepCount) {
            state.resizeHandle.stepCount = 4
        }
        
        if (!state.color) {
            state.color = { palettes: {} }
        }
        
        state.version = "1.2"
        console.log('[AppState] Successfully migrated to v1.2 - preserved user preferences')
    }

    // Migration from 1.2 to 1.3: Restructure to user-settings/system-constants
    if (state.version === "1.2") {
        console.log('[AppState] Migrating state from v1.2 to v1.3: Restructuring to user-settings/system-constants')
        
        // Create new structure
        const newState: any = {
            version: "1.3",
            lastUpdated: state.lastUpdated || new Date().toISOString(),
            "user-settings": {
                layout: state.layout || { orientation: 'scene-left', scenePercentage: 50, resumePercentage: 50 },
                resizeHandle: state.resizeHandle || { stepCount: 4 },
                focalPointMode: state.focalPoint?.mode || 'locked',
                selectedJobNumber: state.selectedJobNumber || null,
                lastVisitedJobNumber: state.lastVisitedJobNumber || null,
                resume: state.resume || { sortRule: { field: 'startDate', direction: 'asc' } },
                theme: {
                    colorPalette: state.theme?.colorPalette || 'sweeps.json'
                }
            },
            "system-constants": state.constants || getDefaultState()["system-constants"]
        }
        
        // Copy the new structure over
        Object.assign(state, newState)
        state.version = "1.3"
        console.log('[AppState] Successfully migrated to v1.3 - restructured to user-settings/system-constants')
    }

    return state
}

/**
 * Load application state from server
 */
async function loadStateFromServer(): Promise<AppState> {
    const maxRetries = 5;
    const retryDelay = 1000; // 1 second
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`[AppState] Loading state from server (attempt ${attempt}/${maxRetries})...`);
            const response = await fetch('/api/state')
            if (!response.ok) {
                if (response.status === 404) {
                    console.log("No saved state found on server, using default state.")
                    return getDefaultState()
                } else {
                    throw new Error(`Server responded with status: ${response.status}`)
                }
            }
        
            const rawState = await response.json()
            console.log("✅ Loaded raw state from server:", rawState)
            
            // Migrate the state to current version
            const migratedState = migrateState(rawState)
            
            // Merge with defaults to ensure all keys exist
            const finalState = deepMerge(getDefaultState(), migratedState)
            
            console.log("✅ Final state after migration and merge:", finalState)
            return finalState
            
        } catch (error: unknown) {
            console.log(`[AppState] Attempt ${attempt} failed:`, error instanceof Error ? error.message : String(error))
            
            if (attempt === maxRetries) {
                console.error('[AppState] All retry attempts failed, using default state')
                return getDefaultState()
            }
            
            console.log(`[AppState] Retrying in ${retryDelay}ms...`)
            await new Promise(resolve => setTimeout(resolve, retryDelay))
        }
    }
    
    // This should never be reached due to the loop logic above
    return getDefaultState()
}

/**
 * Save application state to server
 */
async function saveStateToServer(state: AppState): Promise<void> {
    try {
        state.lastUpdated = new Date().toISOString()
        await fetch('/api/state', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(state),
        })
        // console.log("Saved state to server:", state)
    } catch (error) {
        console.log('Failed to save state to server.', error)
    }
}

/**
 * Vue composable for centralized AppState management
 * Call loadAppState() once in App.vue, then use appState anywhere
 */
export function useAppState(): UseAppStateReturn {
    
    /**
     * Load AppState from server (idempotent - safe to call multiple times)
     */
    const loadAppState = async (): Promise<AppState> => {
        // Return existing promise if already loading
        if (loadPromise) {
            return loadPromise
        }
        
        // Return existing state if already loaded
        if (isLoaded.value && appState.value) {
            return appState.value
        }
        
        // Start loading
        isLoading.value = true
        loadError.value = null
        
        loadPromise = loadStateFromServer()
            .then(state => {
                appState.value = state
                isLoaded.value = true
                isLoading.value = false
                
                // Dispatch event for backward compatibility
                window.dispatchEvent(new CustomEvent('app-state-loaded', {
                    detail: { state: state }
                }))
                
                console.log('[AppState] ✅ AppState loaded and available globally')
                return state
            })
            .catch(error => {
                isLoading.value = false
                loadError.value = error
                console.error('[AppState] ❌ Failed to load AppState:', error)
                throw error
            })
            .finally(() => {
                loadPromise = null
            })
        
        return loadPromise
    }
    
    /**
     * Save current AppState to server
     */
    const saveAppState = async (): Promise<AppState> => {
        if (!appState.value) {
            throw new Error('Cannot save AppState - not loaded yet')
        }
        
        await saveStateToServer(appState.value)
        return appState.value
    }
    
    /**
     * Start scheduled auto-save system
     */
    const startAutoSave = () => {
        if (autoSaveIntervalId) return // Already running
        
        console.log('[AppState] Starting auto-save system (every', AUTO_SAVE_INTERVAL / 1000, 'seconds)')
        
        autoSaveIntervalId = setInterval(async () => {
            if (hasPendingUpdates && !isDragModeActive) {
                try {
                    // console.log('[AppState] Auto-save triggered')
                    await saveAppState()
                    hasPendingUpdates = false
                } catch (error) {
                    console.error('[AppState] Auto-save failed:', error)
                }
            }
        }, AUTO_SAVE_INTERVAL)
    }
    
    /**
     * Stop scheduled auto-save system
     */
    const stopAutoSave = () => {
        if (autoSaveIntervalId) {
            clearInterval(autoSaveIntervalId)
            autoSaveIntervalId = null
            // console.log('[AppState] Auto-save system stopped')
        }
    }
    
    /**
     * Set drag mode status (prevents auto-save during dragging)
     */
    const setDragMode = (active: boolean) => {
        isDragModeActive = active
        // console.log('[AppState] Drag mode:', active ? 'ACTIVE' : 'INACTIVE')
    }
    
    /**
     * Update AppState with smart saving strategy
     */
    const updateAppState = async (updates: Partial<AppState>, immediate = false): Promise<AppState> => {
        if (!appState.value) {
            throw new Error('Cannot update AppState - not loaded yet')
        }
        
        // Deep merge updates immediately (UI updates are instant)
        appState.value = deepMerge(appState.value as AppState, updates)
        
        if (immediate) {
            // Save immediately for critical updates (step operations, final drag position)
            if (saveTimeoutId) {
                clearTimeout(saveTimeoutId)
                saveTimeoutId = null
            }
            await saveAppState()
            hasPendingUpdates = false
            // console.log('[AppState] Immediate save completed')
        } else {
            // Mark as having pending updates - let auto-save handle it
            hasPendingUpdates = true
            // console.log('[AppState] Updates queued for auto-save')
        }
        
        return appState.value as AppState
    }
    
    return {
        // Read-only reactive state
        appState: readonly(appState),
        isLoading: readonly(isLoading),
        isLoaded: readonly(isLoaded),
        loadError: readonly(loadError),
        
        // Actions
        loadAppState,
        saveAppState,
        updateAppState,
        
        // Auto-save system
        startAutoSave,
        stopAutoSave,
        setDragMode
    }
}

// Export for backward compatibility
export { appState as AppState }
