// modules/core/globalServices.ts
// Vue 3 provide/inject system to replace global window objects

import { provide, inject, ref, type InjectionKey, type Ref } from 'vue'

// Define injection keys with proper typing
const BULLS_EYE_KEY: InjectionKey<any> = Symbol('bullsEye')
const RESUME_LIST_CONTROLLER_KEY: InjectionKey<any> = Symbol('resumeListController')
const RESUME_ITEMS_CONTROLLER_KEY: InjectionKey<any> = Symbol('resumeItemsController')
const FOCAL_POINT_KEY: InjectionKey<any> = Symbol('focalPoint')
const APP_STATE_KEY: InjectionKey<any> = Symbol('appState')
const DEBUG_FUNCTIONS_KEY: InjectionKey<DebugFunctions> = Symbol('debugFunctions')

// Type definitions for better type safety
interface DebugFunctions {
  testResumeSystem: () => void
  checkResumeDivs: () => void
  testScrolling: () => void
  getBullsEyePosition: () => { x: number; y: number }
  getFocalPointPosition: () => { x: number; y: number }
  getViewportOrigin: () => { x: number; y: number }
  renderAllCDivs: () => void
}

interface GlobalServices {
  bullsEye: any
  resumeListController: any
  resumeItemsController: any
  focalPoint: any
  appState: any
  debugFunctions: DebugFunctions
}

// Provider composable for App.vue with reactive refs
export function provideGlobalServices(services: Partial<GlobalServices>) {
  // Create reactive refs for all services
  const bullsEyeRef = ref(services.bullsEye || null)
  const resumeListControllerRef = ref(services.resumeListController || null)
  const resumeItemsControllerRef = ref(services.resumeItemsController || null)
  const focalPointRef = ref(services.focalPoint || null)
  const appStateRef = ref(services.appState || null)
  const debugFunctionsRef = ref(services.debugFunctions || null)
  
  // Provide reactive refs
  provide(BULLS_EYE_KEY, bullsEyeRef)
  provide(RESUME_LIST_CONTROLLER_KEY, resumeListControllerRef)
  provide(RESUME_ITEMS_CONTROLLER_KEY, resumeItemsControllerRef)
  provide(FOCAL_POINT_KEY, focalPointRef)
  provide(APP_STATE_KEY, appStateRef)
  provide(DEBUG_FUNCTIONS_KEY, debugFunctionsRef)
  
  // Return updater function
  return {
    updateServices: (newServices: Partial<GlobalServices>) => {
      if (newServices.bullsEye !== undefined) bullsEyeRef.value = newServices.bullsEye
      if (newServices.resumeListController !== undefined) resumeListControllerRef.value = newServices.resumeListController
      if (newServices.resumeItemsController !== undefined) resumeItemsControllerRef.value = newServices.resumeItemsController
      if (newServices.focalPoint !== undefined) focalPointRef.value = newServices.focalPoint
      if (newServices.appState !== undefined) appStateRef.value = newServices.appState
      if (newServices.debugFunctions !== undefined) debugFunctionsRef.value = newServices.debugFunctions
    }
  }
}

// Injection composables for components (now returns reactive refs)
export function useBullsEyeService() {
  const bullsEyeRef = inject(BULLS_EYE_KEY)
  if (!bullsEyeRef) {
    console.warn('[GlobalServices] Bulls-eye service not available')
    return null
  }
  return bullsEyeRef.value
}

export function useResumeListController() {
  const controllerRef = inject(RESUME_LIST_CONTROLLER_KEY)
  if (!controllerRef) {
    console.warn('[GlobalServices] Resume list controller not available')
    return null
  }
  return controllerRef.value
}

function useResumeItemsController() {
  const controller = inject(RESUME_ITEMS_CONTROLLER_KEY)
  if (!controller) {
    console.warn('[GlobalServices] Resume items controller not available')
    return null
  }
  return controller
}

export function useFocalPointService() {
  const focalPoint = inject(FOCAL_POINT_KEY)
  if (!focalPoint) {
    console.warn('[GlobalServices] Focal point service not available')
    return null
  }
  return focalPoint
}

function useAppStateService() {
  const appState = inject(APP_STATE_KEY)
  if (!appState) {
    console.warn('[GlobalServices] App state service not available')
    return null
  }
  return appState
}

export function useDebugFunctions() {
  const debugFunctions = inject(DEBUG_FUNCTIONS_KEY)
  if (!debugFunctions) {
    console.warn('[GlobalServices] Debug functions not available')
    return null
  }
  return debugFunctions
}

// Utility to replace window object access with inject pattern
function useGlobalServices(): Partial<GlobalServices> {
  return {
    bullsEye: useBullsEyeService(),
    resumeListController: useResumeListController(),
    resumeItemsController: useResumeItemsController(),
    focalPoint: useFocalPointService(),
    appState: useAppStateService(),
    debugFunctions: useDebugFunctions()
  }
}