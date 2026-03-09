// modules/stores/appStore.mjs
// Vue 3 reactive store system to replace global singletons

import { reactive, ref, computed, watch } from 'vue'
import { useAppState } from '../composables/useAppState.ts'

// Get centralized app state
const { appState, updateAppState } = useAppState()

// Create reactive computed properties that track appState changes
const orientation = computed(() => appState.value?.["user-settings"]?.layout?.orientation || 'scene-left')
const scenePercentage = computed(() => appState.value?.["user-settings"]?.layout?.scenePercentage || 50)

// Global app store (replaces window globals and IM singletons)
export const appStore = reactive({
  // System state
  isInitialized: false,
  version: '2.1',
  
  // Layout state - now reads from centralized state via computed properties
  get orientation() {
    return orientation.value
  },
  get scenePercentage() {
    return scenePercentage.value
  },
  
  // Color palette state
  currentPalette: null,
  palettes: [],
  
  // Selection state
  selectedJobNumber: null,
  hoveredJobNumber: null,
  
  // Focal point state (FOLLOWING = mouse drives parallax by default)
  focalPoint: {
    x: 0,
    y: 0,
    mode: 'FOLLOWING', // LOCKED, FOLLOWING, DRAGGING
    isVisible: true
  },
  
  // Aim point state
  aimPoint: {
    x: 0,
    y: 0,
    isActive: false
  },
  
  // Bulls-eye state
  bullsEye: {
    x: 0,
    y: 0,
    isVisible: true
  },
  
  // Timeline state
  timeline: {
    startYear: 1986,
    endYear: 2027,
    currentScale: 1,
    scrollPosition: 0
  },
  
  // Resume system state
  resume: {
    items: [],
    scrollPosition: 0,
    visibleRange: { start: 0, end: 10 },
    isScrolling: false
  }
})

// Computed properties
export const appStoreComputed = {
  resumePercentage: computed(() => 100 - appStore.scenePercentage),
  
  focalPointPosition: computed(() => ({
    x: appStore.focalPoint.x,
    y: appStore.focalPoint.y
  })),
  
  isLayoutSceneLeft: computed(() => appStore.orientation === 'scene-left'),
  
  timelineAlignment: computed(() => 
    appStore.orientation === 'scene-left' ? 'right' : 'left'
  )
}

// Store actions (replaces singleton methods)
export const appStoreActions = {
  // Layout actions
  async setOrientation(orientation) {
    await updateAppState({
      "user-settings": {
        layout: {
          orientation: orientation
        }
      }
    }, true)
    console.log(`[AppStore] Orientation changed to: ${orientation} (saved)`)
  },
  
  async setScenePercentage(percentage) {
    const resumePercentage = 100 - percentage
    await updateAppState({
      "user-settings": {
        layout: {
          scenePercentage: Math.round(percentage),
          resumePercentage: Math.round(resumePercentage)
        }
      }
    })
    console.log(`[AppStore] Scene percentage: ${Math.round(percentage)}%, Resume: ${Math.round(resumePercentage)}%`)
  },
  
  toggleOrientation() {
    const newOrientation = appStore.orientation === 'scene-left' ? 'scene-right' : 'scene-left'
    this.setOrientation(newOrientation)
  },
  
  // Selection actions
  setSelectedJob(jobNumber) {
    appStore.selectedJobNumber = jobNumber
    console.log(`[AppStore] Selected job: ${jobNumber}`)
  },
  
  setHoveredJob(jobNumber) {
    appStore.hoveredJobNumber = jobNumber
  },
  
  clearSelection() {
    appStore.selectedJobNumber = null
    appStore.hoveredJobNumber = null
  },
  
  // Focal point actions
  setFocalPoint(x, y) {
    appStore.focalPoint.x = x
    appStore.focalPoint.y = y
    schedulePersistFocalPoint()
  },
  
  setFocalPointMode(mode) {
    appStore.focalPoint.mode = mode
    console.log(`[AppStore] Focal point mode: ${mode}`)
    persistFocalPoint(true) // persist mode immediately
  },
  
  // Aim point actions
  setAimPoint(x, y) {
    appStore.aimPoint.x = x
    appStore.aimPoint.y = y
  },
  
  // Bulls-eye actions
  setBullsEye(x, y) {
    appStore.bullsEye.x = x
    appStore.bullsEye.y = y
  },
  
  // Color palette actions
  setCurrentPalette(palette) {
    appStore.currentPalette = palette
    console.log(`[AppStore] Palette changed to: ${palette?.name}`)
  },
  
  setPalettes(palettes) {
    appStore.palettes = palettes
    console.log(`[AppStore] Loaded ${palettes.length} palettes`)
  },
  
  // Timeline actions
  setTimelineRange(startYear, endYear) {
    appStore.timeline.startYear = startYear
    appStore.timeline.endYear = endYear
  },
  
  setTimelineScale(scale) {
    appStore.timeline.currentScale = scale
  },
  
  // Resume actions
  setResumeItems(items) {
    appStore.resume.items = items
    console.log(`[AppStore] Loaded ${items.length} resume items`)
  },
  
  setResumeScrollPosition(position) {
    appStore.resume.scrollPosition = position
  },
  
  setResumeVisibleRange(start, end) {
    appStore.resume.visibleRange = { start, end }
  },
  
  // System actions
  initialize() {
    console.log('[AppStore] Initializing app store...')
    appStore.isInitialized = true

    // Restore focal point from persisted state if present
    const saved = appState.value?.['user-settings']?.focalPoint
    if (saved) {
      if (typeof saved.x === 'number' && typeof saved.y === 'number' && (saved.x !== 0 || saved.y !== 0)) {
        appStore.focalPoint.x = saved.x
        appStore.focalPoint.y = saved.y
      }
      if (saved.mode) {
        const modeUpper = String(saved.mode).toUpperCase()
        appStore.focalPoint.mode = modeUpper === 'LOCKED' ? 'LOCKED' : modeUpper === 'DRAGGING' ? 'DRAGGING' : 'FOLLOWING'
      }
    }
    if (appStore.focalPoint.x === 0 && appStore.focalPoint.y === 0) {
      appStore.focalPoint.x = window.innerWidth / 2
      appStore.focalPoint.y = window.innerHeight / 2
    }
    console.log('[AppStore] Focal point initialized:', appStore.focalPoint.x, appStore.focalPoint.y, appStore.focalPoint.mode)
  }
}

// Debounced persist for focal point position (avoid saving on every mousemove)
let focalPointPersistTimeoutId = null
function schedulePersistFocalPoint() {
  if (focalPointPersistTimeoutId) clearTimeout(focalPointPersistTimeoutId)
  focalPointPersistTimeoutId = setTimeout(() => {
    focalPointPersistTimeoutId = null
    persistFocalPoint(false)
  }, 1500)
}

function persistFocalPoint(immediate = false) {
  const mode = appStore.focalPoint.mode
  const modeLower = mode === 'LOCKED' ? 'locked' : mode === 'DRAGGING' ? 'dragging' : 'following'
  updateAppState({
    'user-settings': {
      focalPoint: {
        x: appStore.focalPoint.x,
        y: appStore.focalPoint.y,
        mode: modeLower
      }
    }
  }, immediate)
}

// Watchers for cross-system coordination
watch(() => appStore.focalPoint, (newFocalPoint) => {
  // Emit custom event for systems that still need it during migration
  window.dispatchEvent(new CustomEvent('focal-point-changed', {
    detail: { x: newFocalPoint.x, y: newFocalPoint.y }
  }))
}, { deep: true })

watch(() => appStore.orientation, (newOrientation) => {
  window.dispatchEvent(new CustomEvent('layout-changed', {
    detail: { orientation: newOrientation }
  }))
})

// Store composable
export function useAppStore() {
  return {
    store: appStore,
    computed: appStoreComputed,
    actions: appStoreActions
  }
}