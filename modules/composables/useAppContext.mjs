// modules/composables/useAppContext.mjs
// Vue 3 dependency injection system to replace IM framework

import { provide, inject, ref, reactive, computed } from 'vue'

// Dependency injection keys
export const APP_CONTEXT_KEY = Symbol('AppContext')
export const FOCAL_POINT_KEY = Symbol('FocalPoint')
const AIM_POINT_KEY = Symbol('AimPoint')
export const BULLS_EYE_KEY = Symbol('BullsEye')
const SCENE_CONTAINER_KEY = Symbol('SceneContainer')
const SELECTION_MANAGER_KEY = Symbol('SelectionManager')
const COLOR_PALETTE_KEY = Symbol('ColorPalette')
const TIMELINE_KEY = Symbol('Timeline')

// App-wide context provider (replaces IM initialization)
export function provideAppContext() {
  const appContext = reactive({
    // System state
    isInitialized: false,
    currentPalette: null,
    
    // Layout state
    orientation: ref('scene-left'),
    scenePercentage: ref(50),
    
    // Dependencies registry
    dependencies: new Map(),
    
    // Event bus for cross-component communication
    eventBus: reactive({
      listeners: new Map(),
      emit(event, data) {
        const listeners = this.listeners.get(event) || []
        listeners.forEach(callback => callback(data))
      },
      on(event, callback) {
        if (!this.listeners.has(event)) {
          this.listeners.set(event, [])
        }
        this.listeners.get(event).push(callback)
      },
      off(event, callback) {
        const listeners = this.listeners.get(event) || []
        const index = listeners.indexOf(callback)
        if (index > -1) {
          listeners.splice(index, 1)
        }
      }
    })
  })
  
  // Register a dependency (replaces IM component registration)
  function registerDependency(key, instance) {
    appContext.dependencies.set(key, instance)
    console.log(`[AppContext] Registered dependency: ${key.description}`)
  }
  
  // Get a dependency (replaces IM getComponent)
  function getDependency(key) {
    const dependency = appContext.dependencies.get(key)
    if (!dependency) {
      throw new Error(`[AppContext] Dependency not found: ${key.description}`)
    }
    return dependency
  }
  
  // Initialize app context
  function initialize() {
    console.log('[AppContext] Initializing Vue 3 app context...')
    appContext.isInitialized = true
  }
  
  const contextMethods = {
    registerDependency,
    getDependency,
    initialize,
  }
  
  // Provide the context and methods
  provide(APP_CONTEXT_KEY, { ...appContext, ...contextMethods })
  
  return { appContext, ...contextMethods }
}

// Use app context (replaces IM dependency injection)
export function useAppContext() {
  const context = inject(APP_CONTEXT_KEY)
  
  if (!context) {
    throw new Error('useAppContext must be used within a component that provides AppContext')
  }
  
  return context
}

// Individual dependency injection composables
export function useFocalPointDI() {
  return inject(FOCAL_POINT_KEY, null)
}

export function useAimPointDI() {
  return inject(AIM_POINT_KEY, null)
}

export function useBullsEyeDI() {
  return inject(BULLS_EYE_KEY, null)
}

export function useSceneContainerDI() {
  return inject(SCENE_CONTAINER_KEY, null)
}

export function useSelectionManagerDI() {
  return inject(SELECTION_MANAGER_KEY, null)
}

export function useColorPaletteDI() {
  return inject(COLOR_PALETTE_KEY, null)
}

export function useTimelineDI() {
  return inject(TIMELINE_KEY, null)
}

// Helper to provide a dependency
export function provideDependency(key, instance) {
  provide(key, instance)
  console.log(`[DI] Provided dependency: ${key.description}`)
}

// Helper to inject multiple dependencies
export function injectDependencies(keys) {
  const dependencies = {}
  keys.forEach(key => {
    dependencies[key.description] = inject(key, null)
  })
  return dependencies
}