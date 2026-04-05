// modules/composables/useJobsDependency.mjs
// Vue 3 dependency management for jobs data loading (from resume API)

import { ref, computed, readonly } from 'vue'
import { enrichJobsWithSkills } from '../data/enrichedJobs.mjs'
import { mergeJobsWithEducation, toJobsArray as rawJobsToArray } from '../data/mergeEducationIntoJobs.mjs'
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
  return rawJobsToArray(value)
}

// Global state for jobs dependency
const jobsState = ref({
  data: null,
  isLoading: false,
  error: null,
  isInitialized: false
})

// Skills map: slug → { name, ... } — stored alongside jobs so display names are always available
const skillsState = ref({})

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
    const indexPath = basePathJoin('parsed_resumes/non-local-resumes.json')
    const getStaticUrls = (id) => ({
      jobs: basePathJoin(`parsed_resumes/${encodeURIComponent(id)}/jobs.json`),
      skills: basePathJoin(`parsed_resumes/${encodeURIComponent(id)}/skills.json`),
      education: basePathJoin(`parsed_resumes/${encodeURIComponent(id)}/education.json`),
    })
    let effectiveResumeId = resumeId
    const resolveDefaultFromIndex = async () => {
      const idxRes = await fetch(indexPath)
      if (!idxRes.ok) throw new Error(`Resume index not found: ${indexPath}`)
      const index = await idxRes.json()
      const id = index.defaultResumeId
      if (!id) throw new Error('No default resume in parsed_resumes (non-local-resumes.json has no defaultResumeId).')
      return id
    }
    const getStaticPayload = async (id) => {
      const effectiveId = id === 'default' ? await resolveDefaultFromIndex() : id
      const { jobs: u1, skills: u2, education: uEdu } = getStaticUrls(effectiveId)
      const [jobsRes, skillsRes, educationRes] = await Promise.all([
        fetch(u1),
        fetch(u2).catch(() => null),
        fetch(uEdu).catch(() => null),
      ])
      if (!jobsRes.ok) {
        const errBody = await jobsRes.text().catch(() => '')
        throw new Error(`Static resume jobs not found: ${u1}${errBody ? ` — ${errBody}` : ''}`)
      }
      const jobsRaw = await jobsRes.json()
      const skills = (skillsRes && skillsRes.ok) ? await skillsRes.json() : {}
      const education = (educationRes && educationRes.ok) ? await educationRes.json() : {}
      const jobs = mergeJobsWithEducation(toJobsArray(jobsRaw), education)
      return { jobs, skills }
    }

    const logStaticUrl = resumeId === 'default' ? basePathJoin('parsed_resumes/[default]/jobs.json') : getStaticUrls(resumeId).jobs
    console.log('[useJobsDependency] 🔄 Loading jobs', hasServer() ? 'from API:' : '(static host)', hasServer() ? apiUrl : logStaticUrl)
    jobsState.value.isLoading = true
    jobsState.value.error = null

    try {
      let payload = null
      const educationUrl = basePathJoin(`api/resumes/${encodeURIComponent(resumeId)}/education`)
      if (hasServer()) {
        try {
          const [res, educationRes] = await Promise.all([
            fetch(apiUrl),
            fetch(educationUrl).catch(() => null),
          ])
          if (!res.ok) {
            const errBody = await res.text().catch(() => '')
            throw new Error(res.status === 404 ? `Resume data not found: ${apiUrl}` : `Resume API ${res.status}: ${errBody}`)
          }
          payload = await res.json()
          const education = (educationRes && educationRes.ok) ? await educationRes.json() : {}
          const rawJobs = mergeJobsWithEducation(toJobsArray(payload?.jobs ?? payload), education)
          const skills = payload?.skills ?? {}
          const jobs = enrichJobsWithSkills(rawJobs, skills || {})
          jobsState.value.data = jobs
          jobsState.value.isInitialized = true
          skillsState.value = skills || {}

          console.log(`[useJobsDependency] ✅ Jobs loaded successfully: ${jobs.length} jobs`)

          await notifyDependentControllers()
          return jobs
        } catch (e) {
          const is404OrNotFound = e?.message?.includes('404') || e?.message?.includes('Resume data not found')
          if (!is404OrNotFound) {
            reportError(e, '[useJobsDependency] Failed to fetch resume data from API', 'Attempting static /parsed_resumes fallback')
          }
          payload = await getStaticPayload(resumeId)
        }
      } else {
        payload = await getStaticPayload(resumeId)
      }

      const rawJobs = toJobsArray(payload?.jobs ?? payload)
      const skills = payload?.skills ?? {}
      const jobs = enrichJobsWithSkills(rawJobs, skills || {})
      jobsState.value.data = jobs
      jobsState.value.isInitialized = true
      skillsState.value = skills || {}

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

  /** Sync getter for the skills map (slug → { name, ... }). Returns {} before load. */
  const getSkillsData = () => skillsState.value ?? {}

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
    getSkillsData,
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