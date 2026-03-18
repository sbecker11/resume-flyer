// modules/composables/useJobsDependency.mjs
// Vue 3 dependency management for jobs data loading (from resume API)

import { ref, computed, readonly } from 'vue'
import { enrichJobsWithSkills } from '../data/enrichedJobs.mjs'
import { reportError } from '@/modules/utils/errorReporting.mjs'
import { hasServer } from '@/modules/core/hasServer.mjs'

function getRuntimeBase() {
  const envBase = (import.meta?.env?.BASE_URL || '/')
  let base = envBase
  if (typeof window !== 'undefined') {
    const path = window.location.pathname || '/'
    const parts = path.split('/').filter(Boolean)
    const useSubpath = parts.length > 0 && (envBase === '/' || !path.startsWith(envBase))
    if (useSubpath) base = `/${parts[0]}/`
  }
  return base.endsWith('/') ? base : `${base}/`
}

function basePathJoin(relPath) {
  const b = getRuntimeBase()
  const p = relPath.startsWith('/') ? relPath.slice(1) : relPath
  return `${b}${p}`
}

/** Normalize API/static jobs value to an array (accepts array, { jobs: [...] }, or object keyed by id). */
function toJobsArray(value) {
  if (Array.isArray(value)) return value
  if (value && typeof value === 'object' && Array.isArray(value.jobs)) return value.jobs
  if (value && typeof value === 'object') return Object.values(value)
  return []
}

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

    const resumeId = forceResumeId ?? null
    if (!resumeId) {
      console.warn('[useJobsDependency] loadJobs called with no resumeId — clearing jobs and returning []')
      jobsState.value.data = []
      jobsState.value.isInitialized = false
      return []
    }

    const apiUrl = basePathJoin(`api/resumes/${encodeURIComponent(resumeId)}/data`)
    const staticJobsUrl = basePathJoin(`parsed_resumes/${encodeURIComponent(resumeId)}/jobs.json`)
    const staticSkillsUrl = basePathJoin(`parsed_resumes/${encodeURIComponent(resumeId)}/skills.json`)
    console.log('[useJobsDependency] 🔄 Loading jobs', hasServer() ? 'from API:' : '(static host)', hasServer() ? apiUrl : staticJobsUrl)
    jobsState.value.isLoading = true
    jobsState.value.error = null

    try {
      let payload = null
      if (hasServer()) {
        try {
          const res = await fetch(apiUrl)
          if (!res.ok) {
            const errBody = await res.text().catch(() => '')
            throw new Error(res.status === 404 ? `Resume data not found: ${apiUrl}` : `Resume API ${res.status}: ${errBody}`)
          }
          payload = await res.json()
        } catch (e) {
          const is404OrNotFound = e?.message?.includes('404') || e?.message?.includes('Resume data not found')
          if (!is404OrNotFound) {
            reportError(e, '[useJobsDependency] Failed to fetch resume data from API', 'Attempting static /parsed_resumes fallback')
          }
          const [jobsRes, skillsRes] = await Promise.all([
            fetch(staticJobsUrl),
            fetch(staticSkillsUrl).catch(() => null),
          ])
          if (!jobsRes.ok) {
            const errBody = await jobsRes.text().catch(() => '')
            throw new Error(`Static resume jobs not found: ${staticJobsUrl}${errBody ? ` — ${errBody}` : ''}`)
          }
          const jobs = await jobsRes.json()
          const skills = (skillsRes && skillsRes.ok) ? await skillsRes.json() : {}
          payload = { jobs, skills }
        }
      } else {
        const [jobsRes, skillsRes] = await Promise.all([
          fetch(staticJobsUrl),
          fetch(staticSkillsUrl).catch(() => null),
        ])
        if (!jobsRes.ok) {
          const errBody = await jobsRes.text().catch(() => '')
          throw new Error(`Static resume jobs not found: ${staticJobsUrl}${errBody ? ` — ${errBody}` : ''}`)
        }
        const jobs = await jobsRes.json()
        const skills = (skillsRes && skillsRes.ok) ? await skillsRes.json() : {}
        payload = { jobs, skills }
      }

      const rawJobs = toJobsArray(payload?.jobs ?? payload)
      const skills = payload?.skills ?? {}
      const jobs = enrichJobsWithSkills(rawJobs, skills || {})
      jobsState.value.data = jobs
      jobsState.value.isInitialized = true

      console.log(`[useJobsDependency] ✅ Jobs loaded successfully: ${jobs.length} jobs`)

      await notifyDependentControllers()
      return jobs
    } catch (error) {
      reportError(error, '[useJobsDependency] ❌ Failed to load jobs')
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