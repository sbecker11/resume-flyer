// modules/composables/useCardRegistry.mjs
// Optimized card element registry using Vue 3 reactivity APIs

import { 
  shallowRef, 
  readonly, 
  triggerRef, 
  computed,
  nextTick
} from 'vue'

/**
 * Optimized card registry that replaces document.getElementById() calls
 * with reactive template ref management using Vue 3 advanced reactivity APIs
 */
export function useCardRegistry() {
  // ==========================================
  // REACTIVE CARD REGISTRY
  // ==========================================
  
  // Use shallowRef for the card map - we don't need deep reactivity on DOM elements
  const cardElementsMap = shallowRef(new Map())
  const resumeElementsMap = shallowRef(new Map()) 
  
  // Element counts for performance monitoring
  const elementCounts = shallowRef({
    cards: 0,
    resumes: 0,
    total: 0
  })
  
  // ==========================================
  // REGISTRY MANAGEMENT FUNCTIONS
  // ==========================================
  
  /**
   * Register a card element (replaces DOM queries)
   */
  const registerCardElement = (jobNumber, element) => {
    if (!element) {
      console.warn(`[CardRegistry] Attempted to register null element for job ${jobNumber}`)
      return
    }
    
    const currentMap = cardElementsMap.value
    currentMap.set(jobNumber, element)
    
    // Manually trigger reactivity since we're using shallowRef
    triggerRef(cardElementsMap)
    
    // Update counts
    updateElementCounts()
    
    console.log(`[CardRegistry] Registered card element for job ${jobNumber}`)
  }
  
  /**
   * Register a resume element
   */
  const registerResumeElement = (jobNumber, element) => {
    if (!element) {
      console.warn(`[CardRegistry] Attempted to register null resume element for job ${jobNumber}`)
      return
    }
    
    const currentMap = resumeElementsMap.value
    currentMap.set(jobNumber, element)
    
    // Manually trigger reactivity
    triggerRef(resumeElementsMap)
    
    // Update counts
    updateElementCounts()
    
    console.log(`[CardRegistry] Registered resume element for job ${jobNumber}`)
  }
  
  /**
   * Get card element by job number (replaces document.getElementById)
   */
  const getCardElement = (jobNumber) => {
    const element = cardElementsMap.value.get(jobNumber)
    if (!element) {
      console.warn(`[CardRegistry] Card element not found for job ${jobNumber}`)
    }
    return element || null
  }
  
  /**
   * Get resume element by job number
   */
  const getResumeElement = (jobNumber) => {
    const element = resumeElementsMap.value.get(jobNumber)
    if (!element) {
      console.warn(`[CardRegistry] Resume element not found for job ${jobNumber}`)  
    }
    return element || null
  }
  
  /**
   * Unregister elements (for cleanup)
   */
  const unregisterCardElement = (jobNumber) => {
    const currentMap = cardElementsMap.value
    if (currentMap.delete(jobNumber)) {
      triggerRef(cardElementsMap)
      updateElementCounts()
      console.log(`[CardRegistry] Unregistered card element for job ${jobNumber}`)
    }
  }
  
  const unregisterResumeElement = (jobNumber) => {
    const currentMap = resumeElementsMap.value
    if (currentMap.delete(jobNumber)) {
      triggerRef(resumeElementsMap)
      updateElementCounts()
      console.log(`[CardRegistry] Unregistered resume element for job ${jobNumber}`)
    }
  }
  
  /**
   * Update element counts
   */
  const updateElementCounts = () => {
    elementCounts.value = {
      cards: cardElementsMap.value.size,
      resumes: resumeElementsMap.value.size,
      total: cardElementsMap.value.size + resumeElementsMap.value.size
    }
    
    triggerRef(elementCounts)
  }
  
  /**
   * Clear all registrations (for reset/cleanup)
   */
  const clearRegistry = () => {
    cardElementsMap.value.clear()
    resumeElementsMap.value.clear()
    
    triggerRef(cardElementsMap)
    triggerRef(resumeElementsMap)
    
    updateElementCounts()
    
    console.log('[CardRegistry] Cleared all element registrations')
  }
  
  // ==========================================
  // BATCH OPERATIONS
  // ==========================================
  
  /**
   * Register multiple card elements at once (performance optimization)
   */
  const batchRegisterCards = (cardMappings) => {
    const currentMap = cardElementsMap.value
    
    for (const [jobNumber, element] of cardMappings) {
      if (element) {
        currentMap.set(jobNumber, element)
      }
    }
    
    triggerRef(cardElementsMap)
    updateElementCounts()
    
    console.log(`[CardRegistry] Batch registered ${cardMappings.length} card elements`)
  }
  
  /**
   * Get all registered card elements
   */
  const getAllCardElements = () => {
    return Array.from(cardElementsMap.value.values())
  }
  
  /**
   * Get all registered resume elements
   */
  const getAllResumeElements = () => {
    return Array.from(resumeElementsMap.value.values())
  }
  
  // ==========================================
  // COMPUTED PROPERTIES
  // ==========================================
  
  // Readonly access to prevent accidental mutations
  const cardCount = readonly(computed(() => elementCounts.value.cards))
  const resumeCount = readonly(computed(() => elementCounts.value.resumes))
  const totalCount = readonly(computed(() => elementCounts.value.total))
  
  // Get all job numbers currently registered
  const registeredJobNumbers = readonly(computed(() => {
    const cardJobs = Array.from(cardElementsMap.value.keys())
    const resumeJobs = Array.from(resumeElementsMap.value.keys())
    return [...new Set([...cardJobs, ...resumeJobs])]
  }))
  
  // ==========================================
  // QUERY HELPERS (replacements for DOM queries)
  // ==========================================
  
  /**
   * Find card element with specific class (replaces querySelector)
   */
  const findCardWithClass = (className) => {
    for (const element of cardElementsMap.value.values()) {
      if (element.classList.contains(className)) {
        return element
      }
    }
    return null
  }
  
  /**
   * Find all cards with specific class (replaces querySelectorAll)
   */
  const findAllCardsWithClass = (className) => {
    const matches = []
    for (const element of cardElementsMap.value.values()) {
      if (element.classList.contains(className)) {
        matches.push(element)
      }
    }
    return matches
  }
  
  /**
   * Get color information for an element (optimized version)
   */
  const getElementColorInfo = (jobNumber, elementType = 'card') => {
    const element = elementType === 'card' 
      ? getCardElement(jobNumber) 
      : getResumeElement(jobNumber)
    
    if (!element) return null
    
    return {
      colorIndex: element.getAttribute('data-color-index'),
      backgroundColor: window.getComputedStyle(element).backgroundColor,
      element: element
    }
  }
  
  // ==========================================
  // DEBUGGING AND MONITORING
  // ==========================================
  
  const getRegistryStats = () => ({
    cardElements: cardElementsMap.value.size,
    resumeElements: resumeElementsMap.value.size,
    totalElements: elementCounts.value.total,
    registeredJobs: registeredJobNumbers.value.length
  })
  
  const logRegistryState = () => {
    console.log('[CardRegistry] Registry State:', getRegistryStats())
    console.log('  Registered job numbers:', registeredJobNumbers.value)
  }
  
  // ==========================================
  // PUBLIC API
  // ==========================================
  
  return {
    // Element registration
    registerCardElement,
    registerResumeElement,
    unregisterCardElement,
    unregisterResumeElement,
    clearRegistry,
    
    // Element retrieval (replaces getElementById)
    getCardElement,
    getResumeElement,
    getAllCardElements,
    getAllResumeElements,
    
    // Batch operations
    batchRegisterCards,
    
    // Query helpers (replace querySelector/querySelectorAll)
    findCardWithClass,
    findAllCardsWithClass,
    getElementColorInfo,
    
    // Reactive computed properties
    cardCount,
    resumeCount, 
    totalCount,
    registeredJobNumbers,
    
    // Debugging
    getRegistryStats,
    logRegistryState
  }
}