// modules/composables/useGlobalElementRegistry.mjs
// Enhanced global element registry to replace all document.getElementById() calls

import { ref, shallowRef, readonly, computed, triggerRef, provide, inject } from 'vue'

// Registry keys for provide/inject
const GLOBAL_ELEMENT_REGISTRY_KEY = Symbol('GlobalElementRegistry')

// Global state for element registry
const elementRegistry = shallowRef(new Map())
const queryCache = shallowRef(new Map())
const lastUpdateTime = ref(0)

// Performance tracking
const stats = ref({
  registeredElements: 0,
  cacheHits: 0,
  cacheMisses: 0,
  queryCount: 0
})

export function useGlobalElementRegistry() {
  // Core registry functions
  function registerElement(key, element) {
    if (!element) {
      console.warn(`[GlobalElementRegistry] Attempted to register null element for key: ${key}`)
      return
    }
    
    const currentRegistry = elementRegistry.value
    currentRegistry.set(key, element)
    
    // Clear related cache entries
    clearCacheForKey(key)
    
    // Update stats and trigger reactivity
    stats.value.registeredElements = currentRegistry.size
    triggerRef(elementRegistry)
    lastUpdateTime.value = Date.now()
    
    console.log(`[GlobalElementRegistry] ✅ Registered element: ${key}`)
  }
  
  function unregisterElement(key) {
    const currentRegistry = elementRegistry.value
    const existed = currentRegistry.delete(key)
    
    if (existed) {
      clearCacheForKey(key)
      stats.value.registeredElements = currentRegistry.size
      triggerRef(elementRegistry)
      lastUpdateTime.value = Date.now()
      console.log(`[GlobalElementRegistry] ❌ Unregistered element: ${key}`)
    }
    
    return existed
  }
  
  function getElement(key, fallbackQuery = null) {
    stats.value.queryCount++
    
    // First check registry
    const element = elementRegistry.value.get(key)
    if (element) {
      stats.value.cacheHits++
      return element
    }
    
    // Check query cache if we have a fallback
    if (fallbackQuery) {
      const cacheKey = `query:${fallbackQuery}`
      const cachedElement = queryCache.value.get(cacheKey)
      if (cachedElement) {
        stats.value.cacheHits++
        return cachedElement
      }
      
      // Perform DOM query as last resort (debug only - expected before mount)
      console.debug(`[GlobalElementRegistry] 🔍 Falling back to DOM query for: ${key} (${fallbackQuery})`)
      const queriedElement = document.getElementById(fallbackQuery) || document.querySelector(fallbackQuery)
      if (queriedElement) {
        queryCache.value.set(cacheKey, queriedElement)
        stats.value.cacheMisses++
        return queriedElement
      }
    }
    
    stats.value.cacheMisses++
    console.debug(`[GlobalElementRegistry] Element not in DOM yet: ${key}`)
    return null
  }
  
  function clearCacheForKey(key) {
    const currentCache = queryCache.value
    const keysToDelete = []
    
    for (const cacheKey of currentCache.keys()) {
      if (cacheKey.includes(key)) {
        keysToDelete.push(cacheKey)
      }
    }
    
    keysToDelete.forEach(cacheKey => currentCache.delete(cacheKey))
    if (keysToDelete.length > 0) {
      triggerRef(queryCache)
    }
  }
  
  function clearAllCache() {
    queryCache.value.clear()
    triggerRef(queryCache)
    console.log('[GlobalElementRegistry] 🧹 Cleared all query cache')
  }
  
  // Optimized element queries for common patterns
  function getSceneContainer() {
    return getElement('scene-container', 'scene-container')
  }
  
  function getScenePlane() {
    return getElement('scene-plane', 'scene-plane')
  }
  
  function getSceneContent() {
    return getElement('scene-content', 'scene-content')
  }
  
  function getAppContainer() {
    return getElement('app-container', 'app-container')
  }
  
  function getResizeHandle() {
    return getElement('resize-handle', 'resize-handle')
  }
  
  // Specialized query functions with caching
  function getAllElementsWithColorIndex() {
    const cacheKey = 'query:elements-with-color-index'
    const cached = queryCache.value.get(cacheKey)
    if (cached && cached.timestamp > lastUpdateTime.value - 1000) { // 1 second cache
      stats.value.cacheHits++
      return cached.elements
    }
    
    // Perform fresh query
    const elements = document.querySelectorAll('[data-color-index]')
    queryCache.value.set(cacheKey, { 
      elements: Array.from(elements), 
      timestamp: Date.now() 
    })
    stats.value.cacheMisses++
    
    console.log(`[GlobalElementRegistry] 🎨 Found ${elements.length} elements with color index`)
    return Array.from(elements)
  }
  
  function getAllBizCardDivs() {
    const cacheKey = 'query:all-biz-card-divs'
    const cached = queryCache.value.get(cacheKey)
    if (cached && cached.timestamp > lastUpdateTime.value - 500) { // 500ms cache for dynamic elements
      stats.value.cacheHits++
      return cached.elements
    }
    
    const elements = document.getElementsByClassName('biz-card-div')
    queryCache.value.set(cacheKey, { 
      elements: Array.from(elements), 
      timestamp: Date.now() 
    })
    stats.value.cacheMisses++
    
    return Array.from(elements)
  }
  
  function getAllBizResumeDivs() {
    const cacheKey = 'query:all-biz-resume-divs'
    const cached = queryCache.value.get(cacheKey)
    if (cached && cached.timestamp > lastUpdateTime.value - 500) { // 500ms cache
      stats.value.cacheHits++
      return cached.elements
    }
    
    const elements = document.querySelectorAll('.biz-resume-div')
    queryCache.value.set(cacheKey, { 
      elements: Array.from(elements), 
      timestamp: Date.now() 
    })
    stats.value.cacheMisses++
    
    return Array.from(elements)
  }
  
  // Layout helper function
  function getCurrentLayout() {
    const appContainer = getAppContainer()
    return appContainer ? appContainer.className : 'unknown'
  }
  
  // Registry statistics and debugging
  const registryStats = computed(() => ({
    registeredElements: stats.value.registeredElements,
    cacheHits: stats.value.cacheHits,
    cacheMisses: stats.value.cacheMisses,
    queryCount: stats.value.queryCount,
    hitRate: stats.value.queryCount > 0 ? 
      ((stats.value.cacheHits / stats.value.queryCount) * 100).toFixed(1) + '%' : '0%',
    lastUpdate: lastUpdateTime.value
  }))
  
  // Debug functions
  function printRegistryStats() {
    console.log('[GlobalElementRegistry] 📊 Registry Statistics:', registryStats.value)
    console.log('[GlobalElementRegistry] 📋 Registered Elements:', Array.from(elementRegistry.value.keys()))
  }
  
  function resetStats() {
    stats.value = {
      registeredElements: elementRegistry.value.size,
      cacheHits: 0,
      cacheMisses: 0,
      queryCount: 0
    }
    console.log('[GlobalElementRegistry] 🔄 Reset statistics')
  }
  
  // Make debug functions globally available
  if (typeof window !== 'undefined') {
    window.printRegistryStats = printRegistryStats
    window.resetRegistryStats = resetStats
    window.clearElementRegistryCache = clearAllCache
  }
  
  return {
    // Core functions
    registerElement,
    unregisterElement,
    getElement,
    clearAllCache,
    
    // Common element getters
    getSceneContainer,
    getScenePlane,
    getSceneContent,
    getAppContainer,
    getResizeHandle,
    
    // Specialized queries
    getAllElementsWithColorIndex,
    getAllBizCardDivs,
    getAllBizResumeDivs,
    getCurrentLayout,
    
    // Statistics and debugging
    registryStats: readonly(registryStats),
    printRegistryStats,
    resetStats,
    
    // Direct registry access (readonly)
    elementRegistry: readonly(elementRegistry)
  }
}

// Create global registry instance (called from main.ts)
export function createGlobalElementRegistry() {
  return useGlobalElementRegistry()
}

// Provider function for dependency injection (now uses global instance)
export function provideGlobalElementRegistry() {
  // Check if global registry exists first
  if (typeof window !== 'undefined' && window.globalElementRegistry) {
    provide(GLOBAL_ELEMENT_REGISTRY_KEY, window.globalElementRegistry)
    return window.globalElementRegistry
  }
  
  // Fallback: create new instance (shouldn't happen after main.ts setup)
  const registry = useGlobalElementRegistry()
  provide(GLOBAL_ELEMENT_REGISTRY_KEY, registry)
  return registry
}

// Injector function for dependency injection (now uses global instance as fallback)
export function injectGlobalElementRegistry() {
  // First try Vue's inject system
  const registry = inject(GLOBAL_ELEMENT_REGISTRY_KEY, null)
  if (registry) {
    return registry
  }
  
  // Fallback to global window instance (eliminates timing issues)
  if (typeof window !== 'undefined' && window.globalElementRegistry) {
    return window.globalElementRegistry
  }
  
  throw new Error('[GlobalElementRegistry] Registry not available! Ensure main.ts creates global registry.')
}
