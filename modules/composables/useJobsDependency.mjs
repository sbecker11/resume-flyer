// modules/composables/useJobsDependency.mjs
// Vue 3 dependency management for jobs data loading (from resume API)

import { ref, computed, readonly } from 'vue'
import { enrichJobsWithSkills } from '../data/enrichedJobs.mjs'

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
 * Loads jobs/skills from resume API (default or parsed resume id), enriches, and notifies controllers.
 */
export function useJobsDependency() {

  /**
   * Load jobs data from resume API (default or currentResumeId from app state).
   * @param {object} [options] - { forceResumeId?: string | null, force?: boolean }
   * @returns {Promise<Array>} Enriched jobs array
   */
  const loadJobs = async (options = {}) => {
    const { forceResumeId, force = false } = options
    if (!force && (jobsState.value.isLoading || jobsState.value.data)) {
      console.log('[useJobsDependency] Jobs already loading or loaded, returning existing data')
      return jobsState.value.data
    }

    // Always load the default resume unless an explicit forceResumeId is provided.
    // currentResumeId is not persisted in app_state (content-scoped, not app shell state).
    const resumeId = forceResumeId ?? null

    const url = resumeId
      ? `/api/resumes/${encodeURIComponent(resumeId)}/data`
      : '/api/resumes/default/data'
    console.log('[useJobsDependency] 🔄 Loading jobs from resume API:', url)
    jobsState.value.isLoading = true
    jobsState.value.error = null

    try {
      const res = await fetch(url)
      if (!res.ok) {
        const errBody = await res.text()
        throw new Error(res.status === 404 ? `Resume data not found: ${url}` : `Resume API ${res.status}: ${errBody}`)
      }
      const { jobs: rawJobs, skills } = await res.json()
      if (!Array.isArray(rawJobs)) {
        throw new Error('API returned jobs that are not an array')
      }
      const jobs = enrichJobsWithSkills(rawJobs, skills || {})
      jobsState.value.data = jobs
      jobsState.value.isInitialized = true

      console.log(`[useJobsDependency] ✅ Jobs loaded successfully: ${jobs.length} jobs`)

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
          throw error
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
  
  /** Sync getter for code that expects getJobsData() (returns current jobs array or empty array). */
  const getJobsData = () => jobsState.value.data ?? []

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
    getJobsData,
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