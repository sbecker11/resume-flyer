// modules/composables/useJobsDependency.mjs
// Vue 3 dependency management for jobs data loading

import { ref, computed, readonly } from 'vue'

// Global state for jobs dependency
const jobsState = ref({
  data: null,
  isLoading: false,
  error: null,
  isInitialized: false
})

// Controllers that depend on jobs data
const dependentControllers = ref(new Set())

/**
 * Composable for managing jobs data dependency
 * Replaces the IM pattern with Vue 3 reactive dependency management
 */
export function useJobsDependency() {
  
  /**
   * Load jobs data asynchronously
   */
  const loadJobs = async () => {
    if (jobsState.value.isLoading || jobsState.value.data) {
      console.log('[useJobsDependency] Jobs already loading or loaded, returning existing data')
      return jobsState.value.data // Already loading or loaded
    }
    
    console.log('[useJobsDependency] 🔄 Loading jobs data...')
    jobsState.value.isLoading = true
    jobsState.value.error = null
    
    try {
      // Import jobs data
      const jobsModule = await import('../data/enrichedJobs.mjs')
      const jobs = jobsModule.default || jobsModule.jobs || jobsModule
      
      if (!Array.isArray(jobs)) {
        throw new Error('Jobs data is not an array')
      }
      
      jobsState.value.data = jobs
      jobsState.value.isInitialized = true
      
      console.log(`[useJobsDependency] ✅ Jobs loaded successfully: ${jobs.length} jobs`)
      
      // Notify all dependent controllers that jobs are ready
      console.log(`[useJobsDependency] 📢 Notifying ${dependentControllers.value.size} dependent controllers...`)
      await notifyDependentControllers()
      
      return jobs
    } catch (error) {
      console.error('[useJobsDependency] ❌ Failed to load jobs:', error)
      jobsState.value.error = error
      throw error
    } finally {
      jobsState.value.isLoading = false
    }
  }
  
  /**
   * Register a controller as dependent on jobs data
   */
  const registerController = (controllerName, initializeFn) => {
    console.log(`[useJobsDependency] 📝 Registering controller: ${controllerName}`)
    
    dependentControllers.value.add({
      name: controllerName,
      initialize: initializeFn,
      isReady: false
    })
    
    // If jobs are already loaded, initialize immediately
    if (isReady.value) {
      console.log(`[useJobsDependency] ⚡ Jobs already ready, initializing ${controllerName} immediately`)
      setTimeout(() => initializeFn(jobsState.value.data), 0)
    }
  }
  
  /**
   * Notify all registered controllers that jobs are ready
   */
  const notifyDependentControllers = async () => {
    console.log(`[useJobsDependency] Notifying ${dependentControllers.value.size} dependent controllers`)
    
    for (const controller of dependentControllers.value) {
      if (!controller.isReady) {
        try {
          console.log(`[useJobsDependency] Initializing controller: ${controller.name}`)
          await controller.initialize(jobsState.value.data)
          controller.isReady = true
          console.log(`[useJobsDependency] ✅ Controller ${controller.name} initialized`)
        } catch (error) {
          console.error(`[useJobsDependency] ❌ Failed to initialize controller ${controller.name}:`, error)
        }
      }
    }
  }
  
  /**
   * Wait for jobs to be loaded
   */
  const waitForJobs = () => {
    return new Promise((resolve, reject) => {
      if (isReady.value) {
        resolve(jobsState.value.data)
        return
      }
      
      if (jobsState.value.error) {
        reject(jobsState.value.error)
        return
      }
      
      // Poll for jobs to be ready
      const checkReady = () => {
        if (isReady.value) {
          resolve(jobsState.value.data)
        } else if (jobsState.value.error) {
          reject(jobsState.value.error)
        } else {
          setTimeout(checkReady, 10)
        }
      }
      
      checkReady()
    })
  }
  
  // Computed properties
  const isReady = computed(() => 
    jobsState.value.isInitialized && 
    jobsState.value.data && 
    !jobsState.value.isLoading && 
    !jobsState.value.error
  )
  
  const hasError = computed(() => !!jobsState.value.error)
  
  const jobsCount = computed(() => 
    jobsState.value.data ? jobsState.value.data.length : 0
  )
  
  return {
    // Reactive state (readonly)
    jobsData: readonly(computed(() => jobsState.value.data)),
    isLoading: readonly(computed(() => jobsState.value.isLoading)),
    error: readonly(computed(() => jobsState.value.error)),
    isReady,
    hasError,
    jobsCount,
    
    // Methods
    loadJobs,
    registerController,
    waitForJobs
  }
}

// Export singleton instance for global use
let globalJobsDependency = null

export function getGlobalJobsDependency() {
  if (!globalJobsDependency) {
    globalJobsDependency = useJobsDependency()
  }
  return globalJobsDependency
}