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
// @ts-ignore - Legacy module
import { reportError } from '../utils/errorReporting.mjs'
// @ts-ignore - Legacy module imports with type declarations
import type { AppState, UseAppStateReturn } from '../types/index'
// @ts-ignore - Legacy module
import { setFromAppState as setRenderingFromAppState, DEFAULT_RENDERING_LIMITS } from '../core/renderingConfig.mjs'
import { hasServer } from '../core/hasServer.mjs'

function getRuntimeBase(): string {
    const envBase = (import.meta as any)?.env?.BASE_URL || '/'
    let base = envBase

    if (typeof window !== 'undefined') {
        const path = window.location.pathname || '/'
        const parts = path.split('/').filter(Boolean)
        // When envBase is '/', path.startsWith('/') is always true so we never override.
        // If path has a first segment (e.g. /resume-flock/), use it as base so subpath hosting works.
        const useSubpath = parts.length > 0 && (envBase === '/' || !path.startsWith(envBase))
        if (useSubpath) {
            base = `/${parts[0]}/`
        }
    }

    return base.endsWith('/') ? base : `${base}/`
}

function basePathJoin(relPath: string): string {
    const b = getRuntimeBase()
    const p = relPath.startsWith('/') ? relPath.slice(1) : relPath
    return `${b}${p}`
}

// Singleton state - shared across all component instances
const appState: Ref<AppState | null> = ref(null)
const isLoading: Ref<boolean> = ref(false)
const isLoaded: Ref<boolean> = ref(false)
const loadError: Ref<Error | null> = ref(null)

/** When false, state API is unavailable (e.g. static hosting); save only to localStorage and skip POST to avoid 405 in console. */
let stateApiAvailable: boolean | null = null

const STATE_API_UNAVAILABLE_KEY = 'resume-flock/state_api_unavailable'

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
        version: "1.4",
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
            focalPoint: { x: 0, y: 0, mode: 'locked' as const },
            currentResumeId: 'default',
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
                minZDiff: 2,
                skillMinDistance: 150,
                concurrentJobsOffsetX: 35,
                concurrentJobsOffsetY: 22
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
                    xExaggeration: 0.9,
                    yExaggeration: 1.0
                }
            },
            theme: {
                brightnessBoostSelected: 2.0,
                brightnessBoostHovered: 1.75,
                /* Padding and border width identical across states so text does not shift */
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
            rendering: {
                parallaxScaleAtMinZ: 1.0,
                parallaxScaleAtMaxZ: 1.0,
                saturationAtMaxZ: 100,
                brightnessAtMaxZ: 100,
                blurAtMaxZ: 0
            },
            /** Min/max/step for 3D Settings sliders; single place to edit is app_state.json */
            renderingLimits: {
                blurAtMaxZ: { ...DEFAULT_RENDERING_LIMITS.blurAtMaxZ },
                saturationAtMaxZ: { ...DEFAULT_RENDERING_LIMITS.saturationAtMaxZ },
                brightnessAtMaxZ: { ...DEFAULT_RENDERING_LIMITS.brightnessAtMaxZ },
                parallaxScaleAtMinZ: { ...DEFAULT_RENDERING_LIMITS.parallaxScaleAtMinZ },
                parallaxScaleAtMaxZ: { ...DEFAULT_RENDERING_LIMITS.parallaxScaleAtMaxZ }
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
                hovered: { padding: '15px', innerBorderWidth: '1px', marginTop: '11px' },
                selected: { padding: '15px', innerBorderWidth: '1px', marginTop: '11px' }
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
                focalPoint: {
                    x: state.focalPoint?.x ?? 0,
                    y: state.focalPoint?.y ?? 0,
                    mode: (state.focalPoint?.mode || 'locked').toString().toLowerCase()
                },
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

    // Migration from 1.3 to 1.4: Remove content-scoped fields from user-settings
    if (state.version === "1.3") {
        console.log('[AppState] Migrating state from v1.3 to v1.4: Removing content-scoped fields')
        const us = state['user-settings']
        if (us) {
            delete us.selectedJobNumber
            delete us.lastVisitedJobNumber
            delete us.selectedElementId
            delete us.selectedDualElementId
            delete us.currentResumeId
            delete us.scrollPositions
        }
        state.version = "1.4"
        console.log('[AppState] Successfully migrated to v1.4')
    }

    // Ensure user-settings.focalPoint exists (position + mode persistence)
    const us = state['user-settings']
    if (us) {
        if (!us.focalPoint) {
            us.focalPoint = { x: 0, y: 0, mode: (us.focalPointMode || 'locked').toString().toLowerCase() as 'locked' | 'following' | 'dragging' }
        } else {
            if (us.focalPoint.mode == null && us.focalPointMode) us.focalPoint.mode = (us.focalPointMode as string).toLowerCase() as 'locked' | 'following' | 'dragging'
        }
    }

    // Ensure system-constants.rendering exists (parallax/depth constants; not user-editable)
    const sc = state['system-constants']
    const renderingDefaults = { parallaxScaleAtMinZ: 1.0, parallaxScaleAtMaxZ: 1.0, saturationAtMaxZ: 100, brightnessAtMaxZ: 100, blurAtMaxZ: 0 }
    const fromUserSettings = state['user-settings']?.rendering
    if (sc) {
        if (!sc.rendering) {
            sc.rendering = fromUserSettings ? { ...renderingDefaults, ...fromUserSettings } : { ...renderingDefaults }
            console.log('[AppState] Added missing system-constants.rendering (camelCase)')
        } else {
            const r = sc.rendering
            if (r.parallaxScaleAtMinZ === undefined && r.parallaxScaleAtMaxZ !== undefined) {
                r.parallaxScaleAtMinZ = renderingDefaults.parallaxScaleAtMinZ
                r.parallaxScaleAtMaxZ = Math.max(renderingDefaults.parallaxScaleAtMaxZ, Number(r.parallaxScaleAtMaxZ))
            }
            if (r.parallaxScaleAtMinZ === undefined) r.parallaxScaleAtMinZ = renderingDefaults.parallaxScaleAtMinZ
            if (r.parallaxScaleAtMaxZ === undefined) r.parallaxScaleAtMaxZ = renderingDefaults.parallaxScaleAtMaxZ
            if (r.saturationAtMaxZ === undefined) r.saturationAtMaxZ = renderingDefaults.saturationAtMaxZ
            else if (r.saturationAtMaxZ >= 0 && r.saturationAtMaxZ <= 1) r.saturationAtMaxZ = Math.round(r.saturationAtMaxZ * 100)
            if (r.brightnessAtMaxZ === undefined) r.brightnessAtMaxZ = renderingDefaults.brightnessAtMaxZ
            else if (r.brightnessAtMaxZ <= 1 && r.brightnessAtMaxZ > 0) r.brightnessAtMaxZ = Math.round(r.brightnessAtMaxZ * 100)
            if (r.blurAtMaxZ === undefined) r.blurAtMaxZ = renderingDefaults.blurAtMaxZ
            if (r.displacementAtMaxZ !== undefined) delete r.displacementAtMaxZ
            if (r.displacementAtMinZ !== undefined) delete r.displacementAtMinZ
        }
        if (state['user-settings']?.rendering) delete state['user-settings'].rendering
        if (!sc.renderingLimits) {
            sc.renderingLimits = {
                blurAtMaxZ: { ...DEFAULT_RENDERING_LIMITS.blurAtMaxZ },
                saturationAtMaxZ: { ...DEFAULT_RENDERING_LIMITS.saturationAtMaxZ },
                brightnessAtMaxZ: { ...DEFAULT_RENDERING_LIMITS.brightnessAtMaxZ },
                parallaxScaleAtMinZ: { ...DEFAULT_RENDERING_LIMITS.parallaxScaleAtMinZ },
                parallaxScaleAtMaxZ: { ...DEFAULT_RENDERING_LIMITS.parallaxScaleAtMaxZ }
            }
            console.log('[AppState] Added missing system-constants.renderingLimits')
        }
        // Single system for depth: only system-constants.rendering (max Z). Strip removed depthEffects.
        if (sc.visualEffects?.depthEffects !== undefined) {
            delete sc.visualEffects.depthEffects
            console.log('[AppState] Removed deprecated system-constants.visualEffects.depthEffects (use rendering + renderingLimits)')
        }
        // Rename Factor → non-Factor keys (computed, not manually adjustable)
        const par = sc.visualEffects?.parallax
        if (par) {
            if (par.xExaggerationFactor !== undefined) { par.xExaggeration = par.xExaggerationFactor; delete par.xExaggerationFactor }
            if (par.yExaggerationFactor !== undefined) { par.yExaggeration = par.yExaggerationFactor; delete par.yExaggerationFactor }
        }
        const theme = sc.theme
        if (theme) {
            if (theme.brightnessFactorSelected !== undefined) { theme.brightnessBoostSelected = theme.brightnessFactorSelected; delete theme.brightnessFactorSelected }
            if (theme.brightnessFactorHovered !== undefined) { theme.brightnessBoostHovered = theme.brightnessFactorHovered; delete theme.brightnessFactorHovered }
        }
    }

    return state
}

/**
 * Load application state from server
 */
async function loadStateFromServer(): Promise<AppState> {
    const maxRetries = 5;
    const retryDelay = 1000; // 1 second

    const skipServer = typeof localStorage !== 'undefined' && localStorage.getItem(STATE_API_UNAVAILABLE_KEY)
    if (hasServer() && !skipServer) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`[AppState] Loading state from server (attempt ${attempt}/${maxRetries})...`);
            const apiUrl = basePathJoin('api/state')
            const response = await fetch(apiUrl)
            if (!response.ok) {
                if (response.status === 404) {
                    stateApiAvailable = false
                    try {
                        localStorage.setItem(STATE_API_UNAVAILABLE_KEY, '1')
                    } catch (_) {}
                    console.log("No saved state found on server, using default state.")
                    // GitHub Pages / static hosting: fall back to localStorage if present
                    try {
                        const raw = localStorage.getItem('resume-flock/app_state')
                        if (raw) return deepMerge(getDefaultState(), migrateState(JSON.parse(raw)))
                    } catch (e) {
                        reportError(e, '[AppState] Failed to load localStorage state', 'Remedy: Using default state')
                    }
                    return getDefaultState()
                } else {
                    throw new Error(`Server responded with status: ${response.status}`)
                }
            }
        
            stateApiAvailable = true
            const rawState = await response.json()
            console.log("✅ Loaded raw state from server:", rawState)
            
            // Migrate the state to current version
            const migratedState = migrateState(rawState)
            
            // Merge with defaults to ensure all keys exist
            const finalState = deepMerge(getDefaultState(), migratedState)
            
            // If saved state was missing system-constants.rendering or renderingLimits, persist merged state so app_state.json gets the new keys
            const scRaw = rawState['system-constants']
            const r = scRaw?.rendering
            const renderingKeys = ['parallaxScaleAtMinZ', 'parallaxScaleAtMaxZ', 'saturationAtMaxZ', 'brightnessAtMaxZ', 'blurAtMaxZ'] as const
            const hadMissingRendering = !r || renderingKeys.some(k => r[k] === undefined)
            const hadMissingRenderingLimits = !scRaw?.renderingLimits
            if (hadMissingRendering || hadMissingRenderingLimits) {
                try {
                    await saveStateToServer(finalState)
                    console.log('[AppState] Persisted state so app_state.json includes system-constants.rendering / renderingLimits')
                } catch (e) {
                    reportError(e, '[AppState] Failed to persist state after adding rendering defaults', 'app_state.json will update on next normal save')
                }
            }

            console.log("✅ Final state after migration and merge:", finalState)
            return finalState
            
        } catch (error: unknown) {
            const remedy = attempt < maxRetries
                ? `Retrying in ${retryDelay}ms (attempt ${attempt + 1}/${maxRetries})`
                : ''
            reportError(error, `[AppState] Load attempt ${attempt} failed`, remedy)
            if (attempt === maxRetries) throw error
            await new Promise(resolve => setTimeout(resolve, retryDelay))
        }
        }
        // This should never be reached due to the loop logic above
        throw new Error('[AppState] loadStateFromServer: unreachable')
    } else {
        stateApiAvailable = false
        if (typeof localStorage !== 'undefined') {
          try {
            localStorage.setItem(STATE_API_UNAVAILABLE_KEY, '1')
          } catch (_) {}
        }
        try {
            const raw = localStorage.getItem('resume-flock/app_state')
            if (raw) return deepMerge(getDefaultState(), migrateState(JSON.parse(raw)))
        } catch (e) {
            reportError(e, '[AppState] Failed to load localStorage state', 'Remedy: Using default state')
        }
        return getDefaultState()
    }
}

/**
 * Save application state to server (or localStorage when no server)
 */
async function saveStateToServer(state: AppState): Promise<void> {
    try {
        state.lastUpdated = new Date().toISOString()
        if (hasServer() && stateApiAvailable !== false) {
        console.log('[AppState] 💾 Saving state to server - currentResumeId:', state['user-settings']?.currentResumeId)
        const apiUrl = basePathJoin('api/state')
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(state),
        })
        if (!response.ok) {
            if (response.status === 404 || response.status === 405) {
                stateApiAvailable = false
                try {
                    localStorage.setItem(STATE_API_UNAVAILABLE_KEY, '1')
                } catch (_) {}
            }
            // GitHub Pages / static hosting: no API (404/405). Persist to localStorage and continue without logging an error.
            const isStaticHosting = response.status === 404 || response.status === 405
            try {
                localStorage.setItem('resume-flock/app_state', JSON.stringify(state))
                if (isStaticHosting) {
                    console.log('[AppState] State saved to localStorage (no server API on static hosting)')
                } else {
                    reportError(new Error(`Server returned ${response.status}: ${response.statusText}`), '[AppState] Failed to save state to server', 'Remedy: Saved AppState to localStorage instead')
                }
                return
            } catch (e) {
                reportError(e, '[AppState] Failed to save AppState to localStorage', 'Remedy: Disabling auto-save to avoid spam')
            }
            throw new Error(`Server returned ${response.status}: ${response.statusText}`)
        }
        console.log('[AppState] ✅ State saved to server successfully')
        } else {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem('resume-flock/app_state', JSON.stringify(state))
                if (!hasServer()) console.log('[AppState] State saved to localStorage (static host, no server)')
            }
            return
        }
    } catch (error) {
        reportError(error, '[AppState] Failed to save state to server', 'Remedy: Auto-save will be disabled for this session')
        // For static hosting, do not rethrow here; callers (auto-save) should not crash the app.
        return
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
                setRenderingFromAppState(state['system-constants']?.rendering, state['system-constants']?.renderingLimits)
                
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
                    reportError(error, '[AppState] Auto-save failed', 'Remedy: Stopping auto-save to avoid repeated errors')
                    stopAutoSave()
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

        console.log('[AppState] 🔄 updateAppState called with updates:', JSON.stringify(updates, null, 2))
        console.log('[AppState] 🔄 Before merge - currentResumeId:', appState.value['user-settings']?.currentResumeId)

        // Deep merge updates immediately (UI updates are instant)
        appState.value = deepMerge(appState.value as AppState, updates)

        console.log('[AppState] 🔄 After merge - currentResumeId:', appState.value['user-settings']?.currentResumeId)
        
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
