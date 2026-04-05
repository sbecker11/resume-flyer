<template>
  <div id="app-container" :class="appContainerClass">
    <!-- Scene Container -->
    <SceneContainer
      :sceneContainerStyle="sceneContainerStyle"
      :firstContainer="firstContainer"
      :secondContainer="secondContainer"
      :scenePercentage="scenePercentage"
      :timelineAlignment="timelineAlignment"
      ref="sceneContainerRef"
    />

    <!-- ResizeHandle - positioned between containers -->
    <ResizeHandle />

    <!-- Resume Container -->
    <div
      id="resume-container"
      :class="{ 'container-first': firstContainer === 'resume-container', 'container-second': secondContainer === 'resume-container' }"
    >
      <div class="resume-content">
        <div class="resume-wrapper">
          <ResumeContainer :currentResumeId="currentResumeId" :noJobsLoaded="noJobsLoaded" @resume-selected="handleResumeSelected" />
        </div>
      </div>
      <!-- Resume Viewer Label - positioned inside resume container like Scene Viewer -->
      <div id="resume-view-label">
        <span class="viewer-label">Resume Viewer ({{ roundedResumePercentage }}%)</span>
      </div>
    </div>

    <div id="bulls-eye" ref="bullsEyeRef" :style="{ opacity: bullsEyeUiOpacity }">+</div>
    <div
      id="focal-point"
      ref="focalPointRef"
      :style="focalPointStyle"
      :class="{ locked: focalPointIsLocked, dragging: focalPointIsDragging }"
      aria-hidden="true"
    >
      <!-- Smaller display: circles and lines (LOCKED / FOLLOWING) -->
      <svg v-show="!focalPointIsDragging" class="focal-point-reticle" viewBox="0 0 24 24" width="24" height="24">
        <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.5" />
        <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1" />
        <line x1="12" y1="2" x2="12" y2="6" stroke="currentColor" stroke-width="1" />
        <line x1="12" y1="18" x2="12" y2="22" stroke="currentColor" stroke-width="1" />
        <line x1="2" y1="12" x2="6" y2="12" stroke="currentColor" stroke-width="1" />
        <line x1="18" y1="12" x2="22" y2="12" stroke="currentColor" stroke-width="1" />
      </svg>
      <!-- DRAGGING: crosshair at saved position so it appears on load/refresh even when mouse is elsewhere -->
      <img
        v-show="focalPointIsDragging"
        class="focal-point-crosshair"
        :src="focalCrosshairSrc"
        width="32"
        height="32"
        alt=""
      />
    </div>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick, provide, inject } from 'vue'

// Vue components
import SceneContainer from './SceneContainer.vue'
import ResizeHandle from './ResizeHandle.vue'
import ResumeContainer from './ResumeContainer.vue'

// Global element registry now provided from main.ts - no need to provide again

// Vue 3 architecture - pure Vue patterns with critical systems preserved
import { useAppContext } from '../composables/useAppContext.mjs'
import { useAppStore } from '../stores/appStore.mjs'
import { useFocalPoint } from '../composables/useFocalPointVue3.mjs'
import { useBullsEye } from '../composables/useBullsEyeVue3.mjs'
import { useParallaxEnhanced } from '../composables/useParallaxVue3Enhanced.mjs'
import { useColorPalette } from '../composables/useColorPalette.mjs'
import { useLayoutToggle } from '../composables/useLayoutToggle.mjs'
import { useResizeHandle } from '../composables/useResizeHandle.mjs'
import { useAppState } from '../composables/useAppState.ts'
import { get_filterStr_from_z } from '../core/filters.mjs'
import { selectionManager } from '../core/selectionManager.mjs'
import { updateContrastForBrightness } from '../composables/useColorPalette.mjs'
import { reportError } from '../utils/errorReporting.mjs'
import { listVisibleSceneCardRoots } from '../utils/sceneCardVisibility.mjs'
import { installBizSelectionFocus } from '../utils/bizSelectionFocus.mjs'
import { listResumes } from '../api/resumeManagerApi.mjs'

/** Dev / ?debugSkillContrast=1 — teardown in onUnmounted */
let skillCardContrastGuardTeardown = null
/** Teardown for biz job selection → first tab stop inside rDiv/cDiv */
let teardownBizSelectionFocus = null

// Resume system initialization (to be migrated)
import { initializeResumeSystem, testResumeSystem, checkResumeDivs, testScrolling } from '../resume/resumeSystemInitializer.mjs'
import { registerResumeListReinit, reinitializeResumeSystem } from '../resume/resumeReinitializer.mjs'
import { buildResumeListFromCards } from '../resume/resumeSystemInitializer.mjs'
import { getGlobalJobsDependency } from '../composables/useJobsDependency.mjs'

// Vue 3 keyboard navigation (replaces legacy keyDownModule)
import { useKeyboardNavigation } from '../composables/useKeyboardNavigation.mjs'

// Vue 3 provide/inject: services provided at root in App.vue; we update refs here

// =============================================================================
// VUE 3 ARCHITECTURE - Dependency injection and stores
// =============================================================================

// Use app-wide context provided by App.vue
const { registerDependency, getDependency } = useAppContext()

// Use centralized app store
const { store, computed: storeComputed, actions: storeActions } = useAppStore()

// Layout management from store
const orientation = computed({
  get: () => store.orientation,
  set: (value) => storeActions.setOrientation(value)
})
const scenePercentage = computed({
  get: () => store.scenePercentage,
  set: (value) => storeActions.setScenePercentage(value)
})
const resumePercentage = storeComputed.resumePercentage
const appContainerClass = computed(() => store.orientation)
const firstContainer = computed(() => store.orientation === 'scene-left' ? 'scene-container' : 'resume-container')
const secondContainer = computed(() => store.orientation === 'scene-left' ? 'resume-container' : 'scene-container')

// Resize handle functionality
const { sceneContainerStyle } = useResizeHandle()

// Color palette management
const { loadPalettes, applyCurrentPaletteToAllElements } = useColorPalette()

// App state management
const { appState, updateAppState } = useAppState()

// Vue 3 bulls-eye system (must run before useFocalPoint so global ref can be set first)
const {
  setBullsEyeElement,
  setSceneContainerElement
} = useBullsEye()

// Update root-provided global service refs before useFocalPoint so inject() sees bullsEye
const serviceUpdater = inject('globalServiceUpdater')
const debugFunctions = {
  testResumeSystem: () => console.log('testResumeSystem placeholder'),
  checkResumeDivs: () => console.log('checkResumeDivs placeholder'),
  testScrolling: () => console.log('testScrolling placeholder'),
  getBullsEyePosition: () => window.getBullsEyePosition?.() || { x: 0, y: 0 },
  getFocalPointPosition: () => window.getFocalPointPosition?.() || { x: 0, y: 0 },
  getViewportOrigin: () => window.getViewportOrigin?.() || { x: 0, y: 0 },
  renderAllCDivs: () => window.renderAllCDivs?.()
}
if (serviceUpdater) {
  const bullsEyeForInject = {
    isReady: () => true,
    getPosition: () => ({ x: store.bullsEye.x, y: store.bullsEye.y }),
    setBullsEyeElement,
    setSceneContainerElement
  }
  serviceUpdater.updateServices({
    bullsEye: bullsEyeForInject,
    focalPoint: null,
    resumeListController: window.resumeFlyer?.resumeListController ?? null,
    resumeItemsController: window.resumeFlyer?.resumeItemsController ?? null,
    appState: window.resumeFlyer?.appState ?? null,
    debugFunctions
  })
}

// Vue 3 critical systems - useFocalPoint runs after refs are set so inject sees bullsEye
const {
  position: focalPointPosition,
  mode: focalPointMode,
  isLocked: focalPointIsLocked,
  isDragging: focalPointIsDragging,
  setFocalPointElement
} = useFocalPoint()

// Set focal point in global ref and on single app-state object
const focalPointApi = { isReady: () => true, getPosition: () => ({ x: store.focalPoint.x, y: store.focalPoint.y }), setFocalPointElement }
if (serviceUpdater) {
  serviceUpdater.updateServices({ focalPoint: focalPointApi })
}
if (typeof window !== 'undefined') {
  window.resumeFlyer = window.resumeFlyer || {}
  window.resumeFlyer.focalPoint = focalPointApi
  // Before SceneContainer/useCardsController setup runs — same singleton as initializeResumeSystem
  window.resumeFlyer.selectionManager = selectionManager
}

// Vue 3 enhanced parallax system (using provide/inject)
const {
  renderAllCDivs,
  stats: parallaxStats,
  checkServices
} = useParallaxEnhanced()

// Vue 3 keyboard navigation (replaces legacy keyDownModule)
const keyboardNavigation = useKeyboardNavigation()

// Global element registry already provided above

// Optimized card registry system (replaces DOM queries)
import { useCardRegistry } from '../composables/useCardRegistry.mjs'
const cardRegistry = useCardRegistry()

// CRITICAL: Provide Vue 3 services required by useCardsController reactive dependencies
console.log('[AppContent] 📦 Providing Vue 3 services for reactive dependencies...')

// Bulls-eye service for useCardsController (expects .isReady as ref)
const bullsEyeService = {
  isReady: computed(() => true),
  setBullsEyeElement,
  setSceneContainerElement
}
provide('bullsEyeService', bullsEyeService)

// Timeline service from existing IM system
// Mark ready immediately; CardsController will initialize timeline if needed
const timelineService = {
  isReady: ref(true),
}
provide('timelineService', timelineService)

// Color palette service from Vue composable
const colorPaletteService = {
  isReady: computed(() => true), // Color palette composable is ready when loaded
}
provide('colorPaletteService', colorPaletteService)

// Scene container service - track when DOM element is available
// Mark ready immediately; CardsController retries if scene-plane isn't yet available
const sceneContainerService = {
  isReady: ref(true),
}
provide('sceneContainerService', sceneContainerService)

// Computed properties from store
const focalPointX = computed(() => store.focalPoint.x)
const focalPointY = computed(() => store.focalPoint.y)

// App-level focal point and aim point (positioned relative to entire app)

// =============================================================================
// COMPUTED PROPERTIES
// =============================================================================

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
const focalCrosshairSrc = basePathJoin('static_content/icons/x-hairs/32/dragging-32-white.png')

/** Opacity-only hide for scene UI: focal/bulls-eye stay in DOM and parallax still uses them (opacity 0).
 *  Respects 3D settings focalPoint visibility; no longer hides during autoscroll. */
const focalPointUiOpacity = computed(() => {
  return appState.value?.['system-constants']?.rendering?.focalPointUiVisible === false ? 0 : 1
})
const bullsEyeUiOpacity = computed(() =>
  appState.value?.['system-constants']?.rendering?.bullsEyeUiVisible === false ? 0 : 1
)

// Create dynamic focal point style from position
const focalPointStyle = computed(() => ({
  left: `${focalPointX.value}px`,
  top: `${focalPointY.value}px`,
  transform: 'translate(-50%, -50%)',
  position: 'fixed',
  visibility: (focalPointX.value > 0 && focalPointY.value > 0) ? 'visible' : 'hidden',
  opacity: focalPointUiOpacity.value
}))

// =============================================================================
// TEMPLATE REFS - App-level elements
// =============================================================================

// Template refs with reactive watchers
const sceneContainerRef = ref(null)  // Reference to SceneContainer component
const bullsEyeRef = ref(null)
const focalPointRef = ref(null)

// Resume Manager state — initialized from persisted app_state
const currentResumeId = computed(() => appState.value?.['user-settings']?.currentResumeId || 'default')
const noJobsLoaded = ref(false)

// Make template refs reactive - watch for changes and update systems
watch(focalPointRef, (newRef) => {
  if (newRef) {
    setFocalPointElement(newRef)
    window.globalElementRegistry.registerElement('focal-point', newRef)
  }
}, { immediate: true })

watch(bullsEyeRef, (newRef) => {
  if (newRef) {
    setBullsEyeElement(newRef)
    window.globalElementRegistry.registerElement('bulls-eye', newRef)
  }
}, { immediate: true })

watch(sceneContainerRef, (newRef) => {
  if (newRef) {
    const sceneContainerElement = newRef?.$refs?.sceneContainerRef
    if (sceneContainerElement) {
      setSceneContainerElement(sceneContainerElement)
    }
  }
}, { immediate: true })

// =============================================================================
// COMPUTED PROPERTIES
// =============================================================================

const timelineAlignment = computed(() => {
  return orientation.value === 'scene-left' ? 'right' : 'left'
})

// Use the reactive store values directly - no complex mapping needed
const roundedScenePercentage = computed(() => {
  const rawPercentage = scenePercentage.value;
  const result = Math.round(Math.max(0, Math.min(100, rawPercentage)));
  
  console.log(`[Scene %] Raw: ${rawPercentage}% -> Display: ${result}%`);
  return result;
});

const roundedResumePercentage = computed(() => {
  return 100 - roundedScenePercentage.value;
});

// Verification computed property to ensure percentages always add up to 100%
const percentageVerification = computed(() => {
  const scenePercent = roundedScenePercentage.value;
  const resumePercent = roundedResumePercentage.value;
  const total = scenePercent + resumePercent;
  
  if (total !== 100) {
    console.warn(`⚠️ Percentage mismatch! Scene: ${scenePercent}% + Resume: ${resumePercent}% = ${total}% (should be 100%)`);
  }
  
  return { scenePercent, resumePercent, total, isValid: total === 100 };
});

// Watch for percentage changes and log verification
watch(percentageVerification, (newVerification) => {
  if (!newVerification.isValid) {
    console.error(`🚨 PERCENTAGE MISMATCH: Scene ${newVerification.scenePercent}% + Resume ${newVerification.resumePercent}% = ${newVerification.total}%`);
  }
}, { immediate: true });

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Scroll scene-content so the first card in the current sort order is visible.
 * Falls back to the card with the lowest top px if sort info is unavailable.
 * Must be called after nextTick so cards are positioned in the DOM.
 */
/**
 * Recenter bullsEye, then wait for the parallax loop to settle before
 * selecting the first card in sorted order.  One nextTick + rAF is not
 * enough because the parallax loop needs at least one frame after the
 * bullsEye recenter to apply transforms.  250 ms is a safe settle window.
 */
/**
 * Wait until the ResumeListController scroll container has items loaded,
 * then click the First button.  Polls every 50ms up to 3s.
 */
async function selectFirstCardWhenReady() {
  await nextTick()
  window.bullsEye?.recenter?.()

  // Poll until both rDivs (scrollContainer.originalItems) AND cDivs exist.
  // On first-load via initializeResumeSystem, CardsController creates cDivs asynchronously
  // via a Vue watcher, so rDivs may be ready before cDivs are in the DOM.
  const deadline = Date.now() + 3000
  while (Date.now() < deadline) {
    const rlc = window.resumeFlyer?.resumeListController
    const items = rlc?.scrollContainer?.originalItems
    const plane = document.getElementById('scene-plane')
    const cDivCount = plane ? listVisibleSceneCardRoots(plane).length : 0
    if (Array.isArray(items) && items.length > 0 && cDivCount > 0) break
    await new Promise(resolve => setTimeout(resolve, 50))
  }

  // Scale settle time by resume size: 50ms per job, min 500ms, max 2000ms
  const rlcForCount = window.resumeFlyer?.resumeListController
  const jobCount = rlcForCount?.scrollContainer?.originalItems?.length ?? 0
  const settleMs = Math.min(2000, Math.max(500, jobCount * 50))
  await new Promise(resolve => setTimeout(resolve, settleMs))

  const firstBtn = document.getElementById('resume-divs-first-btn')
  if (firstBtn) {
    firstBtn.click()
  } else {
    console.warn('[AppContent] resume-divs-first-btn not found')
  }
}

async function scrollSceneToLatestCard() {
  await nextTick()
  const sceneContentEl = document.getElementById('scene-content')
  const scenePlaneEl = document.getElementById('scene-plane')
  if (!sceneContentEl || !scenePlaneEl) return
  const bizCards = listVisibleSceneCardRoots(scenePlaneEl).filter((el) => el.classList.contains('biz-card-div'))
  if (bizCards.length === 0) return

  // Use first card in sorted order if available (visible root only — not hidden original when clone is shown)
  const rlc = window.resumeFlyer?.resumeListController
  const firstJobIndex = rlc?.sortedIndices?.[0] ?? null
  let targetCard = null
  if (firstJobIndex !== null) {
    targetCard =
      document.getElementById(`biz-card-div-${firstJobIndex}`) ||
      document.getElementById(`biz-card-div-${firstJobIndex}-clone`)
    if (targetCard && !bizCards.includes(targetCard)) targetCard = null
  }

  // Fallback: visible card with lowest top px
  if (!targetCard) {
    targetCard = bizCards.reduce((best, card) =>
      parseInt(card.style.top || '0', 10) < parseInt(best.style.top || '0', 10) ? card : best
    )
  }

  const SCROLL_TOP_GAP = 8
  const cardTop = parseInt(targetCard.style.top || '0')
  sceneContentEl.scrollTop = Math.max(0, cardTop - SCROLL_TOP_GAP)
}

// =============================================================================
// EVENT HANDLERS
// =============================================================================

const handleSceneContainerClick = (event) => {
  // Handle scene container clicks
  console.log('Scene container clicked:', event)
}

async function handleResumeSelected(resumeId) {
  console.log('[AppContent] 🔄 Switching to resume:', resumeId)

  try {
    // STEP 1: Clear all existing scene and resume elements FIRST
    console.log('[AppContent] 🧹 Clearing all scene and resume elements...')

    // Clear scene cards (both originals and clones)
    const scenePlane = document.getElementById('scene-plane')
    if (scenePlane) {
      // Count before clearing
      const bizCardsCount = scenePlane.querySelectorAll('.biz-card-div').length
      const clonesCount = scenePlane.querySelectorAll('[id$="-clone"]').length
      const skillCardsCount = scenePlane.querySelectorAll('.skill-card-div').length

      // Remove all biz-card-div elements (originals)
      scenePlane.querySelectorAll('.biz-card-div').forEach(el => el.remove())
      // Remove all clones (any element with id ending in "-clone")
      scenePlane.querySelectorAll('[id$="-clone"]').forEach(el => el.remove())
      // Remove all skill-card-div elements
      scenePlane.querySelectorAll('.skill-card-div').forEach(el => el.remove())

      console.log(`[AppContent] ✅ Cleared ${bizCardsCount} biz-cards, ${clonesCount} clones, ${skillCardsCount} skill-cards`)

      // Verify clearing worked
      const remainingBizCards = scenePlane.querySelectorAll('.biz-card-div').length
      const remainingClones = scenePlane.querySelectorAll('[id$="-clone"]').length
      if (remainingBizCards > 0 || remainingClones > 0) {
        console.error(`🚨 CLEARING FAILED: ${remainingBizCards} biz-cards and ${remainingClones} clones still remain!`)
      }
    }

    // Clear resume list items
    const resumeList = document.getElementById('resume-content-div-list')
    if (resumeList) {
      while (resumeList.firstChild) {
        resumeList.firstChild.remove()
      }
      console.log('[AppContent] ✅ Cleared resume list items')
    }

    // Clear card registry (single app-state object)
    if (window.resumeFlyer?.cardRegistry) {
      window.resumeFlyer.cardRegistry.clearRegistry?.()
      console.log('[AppContent] ✅ Cleared card registry')
    }

    // STEP 2: Clear selection state (prevents restoring old resume's selections)
    if (window.resumeFlyer?.selectionManager) {
      window.resumeFlyer.selectionManager.clearSelection?.()
      console.log('[AppContent] ✅ Cleared selection state')
    }

    // STEP 3: Persist the selected resume ID to app_state and clear no-jobs flag
    noJobsLoaded.value = false
    await updateAppState({ 'user-settings': { currentResumeId: resumeId || 'default' } }, true)
    console.log('[AppContent] ✅ currentResumeId persisted:', resumeId || 'default')

    // STEP 4: Initialize or reinitialize the resume system with the new resume
    const effectiveResumeId = resumeId === 'default' ? null : resumeId
    const controllersReady = !!(window.resumeFlyer?.resumeListController && window.resumeFlyer?.resumeItemsController)
    if (!controllersReady) {
      // First resume load after fresh start — controllers not yet on window.resumeFlyer
      console.log('[AppContent] Controllers not ready, calling initializeResumeSystem with:', effectiveResumeId)
      await initializeResumeSystem(effectiveResumeId)
      registerResumeListReinit(async (bizCardDivs) => {
        await buildResumeListFromCards(bizCardDivs ?? [])
      })
    } else {
      console.log('[AppContent] Calling reinitializeResumeSystem with:', effectiveResumeId)
      await reinitializeResumeSystem(effectiveResumeId)
    }
    console.log('[AppContent] ✅ Resume system initialized/reinitialized')

    // If no jobs loaded (e.g. switched to default after deleting current resume), show upload modal
    const loadedJobs = getGlobalJobsDependency().getJobsData()
    if (!Array.isArray(loadedJobs) || loadedJobs.length === 0) {
      noJobsLoaded.value = true
      return
    }

    // STEP 5: Auto-select the first card once layout has settled
    await selectFirstCardWhenReady()

    // STEP 6: Scroll scene to show the most recent job card
    await scrollSceneToLatestCard()

    console.log('[AppContent] ✅ Successfully switched to resume:', resumeId)
  } catch (error) {
    console.error('[AppContent] ❌ Failed to switch resume:', error)
    console.error('[AppContent] Error stack:', error.stack)
    // Modal stays open so user can see the error or try again
  }
}

async function resolveStartupResumeId(persistedResumeId) {
  if (!persistedResumeId || persistedResumeId === 'default') return null
  try {
    const resumes = await listResumes()
    if (!Array.isArray(resumes) || resumes.length === 0) return null

    const exact = resumes.find(r => r?.id === persistedResumeId)
    if (exact?.id) return exact.id

    const fallback = resumes[0]?.id ?? null
    const err = new Error(`[AppContent] Persisted resume "${persistedResumeId}" is unavailable in this environment`)
    reportError(
      err,
      '[AppContent] Startup resume validation failed',
      fallback
        ? `Using first available resume "${fallback}" and updating user-settings.currentResumeId`
        : 'Clearing currentResumeId to default because no resumes are available'
    )
    return fallback
  } catch (e) {
    reportError(e, '[AppContent] Failed to validate startup resume id', 'Proceeding with persisted value and relying on startup fallback handling')
    return persistedResumeId
  }
}

// Re-apply depth filters to scene cards when 3D Settings change (rendering-changed)
function handleRenderingChanged() {
  const plane = document.getElementById('scene-plane')
  if (!plane) return
  // Only visible cDiv or its clone (tab order and filters should match user-visible cards)
  const cards = listVisibleSceneCardRoots(plane)
  cards.forEach((card) => {
    const z = parseFloat(card.getAttribute('data-sceneZ'))
    if (!Number.isNaN(z)) {
      card.style.filter = get_filterStr_from_z(z)
      // Recompute icon/text contrast whenever effective background changes via 3D filters.
      updateContrastForBrightness(card)
    }
  })
}

// =============================================================================
// LIFECYCLE - Vue's standard pattern
// =============================================================================

onMounted(async () => {
  console.log('🚀 [AppContent] Vue 3 App Initialization Started')
  
  try {
    // PHASE 0: Register app container in global element registry
    await nextTick() // Wait for DOM to be ready
    const appContainer = document.getElementById('app-container')
    if (appContainer) {
      window.globalElementRegistry.registerElement('app-container', appContainer)
      console.log('[AppContent] 📋 Registered app-container in global element registry')
    }
    
    // PHASE 1: Load AppState from server FIRST
    console.log('[AppContent] 📊 Loading AppState from server...')
    const { loadAppState } = useAppState()
    await loadAppState()
    console.log('[AppContent] ✅ AppState loaded successfully')

    // PHASE 2: Initialize app store
    console.log('[AppContent] 📊 Initializing app store...')
    storeActions.initialize()
    
    // Wait for DOM to be ready
    await nextTick()
    
    // PHASE 3: Initialize color palette system (now AppState is available)
    console.log('[AppContent] 🎨 Loading color palettes...')
    try {
      await loadPalettes()
      console.log('[AppContent] ✅ Color palettes loaded successfully')
    } catch (error) {
      console.error('[AppContent] ❌ Color palette loading failed:', error)
      throw error
    }
    
    // PHASE 4: Critical positioning systems now handled by reactive watchers
    console.log('[AppContent] 🎯 Critical positioning systems handled by reactive watchers')
    
    // PHASE 4.5: Check parallax system services
    console.log('[AppContent] 🔧 Checking parallax system services...')
    checkServices()
    console.log('[AppContent] 📊 Parallax stats:', parallaxStats.value)
    
    // PHASE 5: Resume system — load persisted resume, or show upload modal if none
    const persistedResumeId = appState.value?.['user-settings']?.currentResumeId
    const startupResumeId = await resolveStartupResumeId(persistedResumeId)
    if ((startupResumeId || 'default') !== (persistedResumeId || 'default')) {
      try {
        await updateAppState({ 'user-settings': { currentResumeId: startupResumeId || 'default' } }, true)
      } catch (e) {
        reportError(e, '[AppContent] Failed to persist startup resume fallback', 'Continuing with in-memory fallback selection')
      }
    }
    if (!startupResumeId) {
      console.log('[AppContent] 📋 No persisted resume — showing upload modal')
      noJobsLoaded.value = true
    } else {
      console.log('[AppContent] 📋 Initializing resume system with:', startupResumeId)
      try {
        await initializeResumeSystem(startupResumeId)
        console.log('[AppContent] ✅ Resume system initialized')
        const startupJobs = getGlobalJobsDependency().getJobsData()
        noJobsLoaded.value = !Array.isArray(startupJobs) || startupJobs.length === 0
        if (!noJobsLoaded.value) {
          await selectFirstCardWhenReady()
          await scrollSceneToLatestCard()
          // Apply palette to all elements after DOM is built (fixes palette not applied on initial load)
          await nextTick()
          requestAnimationFrame(async () => {
            try {
              await applyCurrentPaletteToAllElements()
            } catch (e) {
              console.warn('[AppContent] Initial palette apply:', e)
            }
          })
        }
      } catch (err) {
        const isNotFound = err?.message?.includes('404') ||
          err?.message?.includes('not found') ||
          err?.message?.includes('unavailable')
        if (isNotFound) {
          // Resume folder was deleted — clear the stale ID and show the upload modal
          console.warn(`[AppContent] ⚠️ Resume "${startupResumeId}" not found, clearing persisted ID:`, err.message)
          noJobsLoaded.value = true
          try {
            await updateAppState({ 'user-settings': { currentResumeId: 'default' } }, true)
          } catch (saveErr) {
            console.warn('[AppContent] Could not persist cleared resume ID (server may be unavailable):', saveErr.message)
          }
        } else {
          // Data or code error — keep the persisted resume ID, surface the error
          reportError(err, `[AppContent] ❌ Failed to initialize resume "${startupResumeId}"`, 'Resume ID preserved — fix the data error and reload')
          noJobsLoaded.value = true
        }
      }
    }

    // Register resume list reinit: same process as initial load (buildResumeListFromCards)
    registerResumeListReinit(async (bizCardDivs) => {
      await buildResumeListFromCards(bizCardDivs ?? [])
    })

    // PHASE 6: Service readiness logs (now ready from start)
    console.log('[AppContent] 🔧 Service readiness (pre-marked ready) ...')
    console.log('  - timelineService.isReady:', timelineService.isReady.value)
    console.log('  - sceneContainerService.isReady:', sceneContainerService.isReady.value)
    
    // Bulls-eye and color palette are already ready (Vue composables)
    console.log('  - bullsEyeService.isReady:', bullsEyeService.isReady.value)
    console.log('  - colorPaletteService.isReady:', colorPaletteService.isReady.value)
    
    // Update debug functions with real implementations
    debugFunctions.testResumeSystem = testResumeSystem
    debugFunctions.checkResumeDivs = checkResumeDivs
    debugFunctions.testScrolling = testScrolling
    
    // Update services from single app-state object (window.resumeFlyer)
    const app = window.resumeFlyer || {}
    if (serviceUpdater) {
      serviceUpdater.updateServices({
        bullsEye: app.bullsEye || bullsEyeService,
        resumeListController: app.resumeListController ?? null,
        resumeItemsController: app.resumeItemsController ?? null,
        focalPoint: app.focalPoint || { isReady: () => true, getPosition: () => ({ x: store.focalPoint.x, y: store.focalPoint.y }), setFocalPointElement },
        appState: app.appState ?? null,
        debugFunctions
      })
    }
    window.testResumeSystem = testResumeSystem
    window.checkResumeDivs = checkResumeDivs
    window.testScrolling = testScrolling
    // Attach to single app-state object so replacing window.resumeFlyer replaces all state
    window.resumeFlyer = window.resumeFlyer || {}
    window.resumeFlyer.cardRegistry = cardRegistry
    console.log('[AppContent] 📋 Card registry made globally available for DOM query optimization')
    
    // PHASE 7: Global event handlers (now handled by Vue 3 composables)
    console.log('[AppContent] 🎹 Keyboard navigation handled by Vue 3 composable')
    
    // PHASE 8: Render scene view on initial load / hard refresh (parallax and layout).
    // Second rAF: biz-cards often receive data-sceneZ after first frame; without it parallax can skip as “no change” until focal moves.
    requestAnimationFrame(() => {
      renderAllCDivs()
      requestAnimationFrame(() => {
        renderAllCDivs()
        console.log('[AppContent] 🖼️ Scene view render triggered (initial load / refresh)')
      })
    })

    window.addEventListener('rendering-changed', handleRenderingChanged)

    if (import.meta.env.DEV || new URLSearchParams(window.location.search).get('debugSkillContrast') === '1') {
      try {
        const { installSkillCardContrastGuard } = await import('../debug/skillCardContrastGuard.mjs')
        skillCardContrastGuardTeardown = installSkillCardContrastGuard()
        console.log('[AppContent] 🎯 Skill card contrast guard active (DEV or ?debugSkillContrast=1)')
      } catch (e) {
        reportError(e, '[AppContent] Skill card contrast guard failed to install', null)
      }
    }

    teardownBizSelectionFocus = installBizSelectionFocus(selectionManager)

    console.log('[AppContent] ✅ Vue 3 app initialization complete!')
    
  } catch (error) {
    console.error('[AppContent] ❌ App initialization failed:', error)
    // Don't re-throw — ensure noJobsLoaded is set so the modal appears
    noJobsLoaded.value = true
  }
})

onUnmounted(() => {
  console.log('[AppContent] 🧹 Cleaning up...')
  window.removeEventListener('rendering-changed', handleRenderingChanged)
  if (typeof skillCardContrastGuardTeardown === 'function') {
    skillCardContrastGuardTeardown()
    skillCardContrastGuardTeardown = null
  }
  if (typeof teardownBizSelectionFocus === 'function') {
    teardownBizSelectionFocus()
    teardownBizSelectionFocus = null
  }
  console.log('[AppContent] ✅ Cleanup complete')
})

// =============================================================================
// REACTIVE UPDATES - Vue's native reactivity
// =============================================================================

// Watch for layout changes via store
watch(orientation, (newOrientation) => {
  // Layout change handling without excessive logging
}, { immediate: true })

</script>

<style scoped>
/* =============================================================================
   LAYOUT STYLES - Scoped to this component
   ============================================================================= */

#app-container {
  display: flex !important;
  height: 100vh;
  width: 100vw;
  overflow: visible;
  position: relative;
}

/* =============================================================================
   APP CONTAINER LAYOUT VARIATIONS
   ============================================================================= */

/* Common app-container styling regardless of orientation */
#app-container {
  flex-direction: row !important;
  /* Both scene-left and scene-right use same flex direction */
}

/* =============================================================================
   CLONE VISIBILITY MANAGEMENT - Force hiding for cards with clones
   ============================================================================= */
/* MAXIMUM specificity to override all other rules */
:deep(html body #scene-container #scene-plane .biz-card-div.force-hidden-for-clone.hasClone),
:deep(html body #scene-container .biz-card-div.force-hidden-for-clone.hasClone),
:deep(html body .biz-card-div.force-hidden-for-clone.hasClone),
:deep(.biz-card-div.force-hidden-for-clone.hasClone) {
    display: none !important;
    visibility: hidden !important;
    opacity: 0 !important;
    pointer-events: none !important;
}

/* Orientation-specific container ordering is handled by individual components */

/* Debug borders removed per user request */

/* Debug background gradients also removed */

/* Scene-specific styles moved to SceneContainer.vue */

/* =============================================================================
   RESUME CONTAINER STYLES
   ============================================================================= */

#resume-container {
  display: flex;
  flex: 1;
  background: var(--background-dark, #1a1a1a);
  position: relative;
}

#resume-container {
  flex: 1;
}

#resume-container.container-first {
  order: 1 !important;
}

#resume-container.container-second {
  order: 3 !important;
}

/* ResizeHandle always stays between scene and resume; always visible even when scene width is 0 */
.resize-handle {
  order: 2 !important;
  flex-shrink: 0 !important;
  min-width: 20px !important;
  visibility: visible !important;
  z-index: 10000;
  pointer-events: auto;
  overflow: visible !important; /* focal-mode tooltip extends past 20px strip */
}

.resume-content {
  flex: 1;
  overflow: hidden;
}

.resume-wrapper {
  height: 100%;
  position: relative;
}

/* =============================================================================
   CONTROL ELEMENTS STYLES
   ============================================================================= */


#bulls-eye {
  position: absolute;
  font-size: 20px;
  color: rgba(0, 255, 255, 0.8);
  pointer-events: none;
  z-index: var(--z-bulls-eye, 98);
  transform: translate(-50%, -50%);
  user-select: none;
}


#focal-point {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  cursor: pointer;
  z-index: var(--z-focal-point, 100);
  transform: translate(-50%, -50%);
  user-select: none;
  transition: color 0.2s ease, opacity 0.2s ease;
  pointer-events: none; /* let clicks pass through to scene cards; mode cycle is on ResizeHandle */
}

#focal-point .focal-point-reticle {
  display: block;
  pointer-events: none;
}

#focal-point.locked {
  color: #666666;
}

/* DRAGGING: show crosshair image at focal position (saved location on load); cursor also crosshair over viewport */
#focal-point.dragging .focal-point-crosshair {
  display: block;
  pointer-events: none;
}

/* =============================================================================
   VIEWER LABELS
   ============================================================================= */


.viewer-label-div {
  top: 461px;
  position: absolute;
  bottom: 9px;
  background: transparent;
  padding: 6px 10px;
  font-family: Arial, sans-serif;
  font-size: 14px;
  font-weight: 600;
  pointer-events: none;
  z-index: 1000;
}

/* =============================================================================
   VIEWER LABEL CONSOLIDATED STYLING
   ============================================================================= */

/* Common base styling for all viewer labels */
.viewer-label,
.resume-viewer-label,
.scene-viewer-label {
  font-family: Arial, sans-serif;
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  pointer-events: none;
  user-select: none;
}

/* Resume viewer label (dark text for light backgrounds) */
.resume-viewer-label,
.viewer-label.resume-viewer-label {
  color: black !important;
}

/* Scene viewer label (light text with dark shadow for dark backgrounds) */
.scene-viewer-label,
.viewer-label.scene-viewer-label {
  color: white !important;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.7);
}

/* Resume viewer label positioning - matches Scene viewer exactly */
#resume-view-label {
  position: absolute;
  bottom: 5px;
  background: transparent;
  padding: 6px 10px;
  border-radius: 6px;
  font-family: Arial, sans-serif;
  font-size: 14px;
  font-weight: 600;
  pointer-events: none;
  z-index: 1000;
  color: black;
}

/* Position mirrored based on layout - opposite sides */
.container-first #resume-view-label {
  right: 10px; /* Resume on left, label on right side */
}

.container-second #resume-view-label {
  left: 10px; /* Resume on right, label on left side */
}

/* =============================================================================
   RESPONSIVE DESIGN
   ============================================================================= */

@media (max-width: 768px) {
  #app-container {
    flex-direction: column;
  }
  
  #scene-container,
  #resume-container {
    min-height: 50vh;
  }
  
  #scene-view-label,
  #resume-view-label {
    font-size: 10px;
    padding: 2px 6px;
  }
}

/* =============================================================================
   ACCESSIBILITY
   ============================================================================= */

@media (prefers-reduced-motion: reduce) {
  #focal-point,
  #scene-plane-top-gradient,
  #scene-plane-btm-gradient {
    transition: none;
  }
}

/* =============================================================================
   HIGH CONTRAST MODE
   ============================================================================= */

@media (prefers-contrast: high) {
  #scene-container {
    border-right-color: #fff;
  }
  
  #scene-container.container-second {
    border-left-color: #fff;
  }
  
  
  #bulls-eye {
    color: #00ffff;
  }
}
</style>