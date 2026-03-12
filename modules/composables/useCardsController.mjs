import { ref, onMounted, onUnmounted, watch, inject, computed, watchEffect } from 'vue'
import { getGlobalJobsDependency } from '@/modules/composables/useJobsDependency.mjs'
import { selectionManager } from '@/modules/core/selectionManager.mjs'
import { useTimeline, initialize } from '@/modules/composables/useTimeline.mjs'
import { useColorPalette, applyPaletteToElement, readyPromise } from '@/modules/composables/useColorPalette.mjs'
import * as dateUtils from '@/modules/utils/dateUtils.mjs'
import { createBizCardDivId } from '@/modules/utils/bizCardUtils.mjs'
import { linearInterp } from '@/modules/utils/mathUtils.mjs'
import * as mathUtils from '@/modules/utils/mathUtils.mjs'
import * as zUtils from '@/modules/utils/zUtils.mjs'
import * as filters from '@/modules/core/filters.mjs'
import {
  BIZCARD_WIDTH,
  MIN_BIZCARD_HEIGHT,
  BIZCARD_HZ_CENTER_OFFSET_MAX,
  BIZCARD_WIDTH_VARIANCE,
  MEAN_CARD_WIDTH,
  MEAN_CARD_HEIGHT,
  MAX_CARD_POSITION_OFFSET,
  CARD_BORDER_WIDTH,
  SKILL_REPOSITION_MIN_DISTANCE,
  MAX_SKILL_PLACEMENT_TRIAL_REJECTIONS,
  SKILL_PLACEMENT_X_STDDEV
} from '@/modules/core/cardConstants.mjs'
import { useCardRegistry } from '@/modules/composables/useCardRegistry.mjs'
import { injectGlobalElementRegistry } from '@/modules/composables/useGlobalElementRegistry.mjs'
import { reportError } from '@/modules/utils/errorReporting.mjs'

// Timeline constants (matching Timeline.vue)
const TIMELINE_PADDING_TOP = 0;

// Skill card ID counter (for unique IDs)
let skillCardIdCounter = 0;

// Instance counter to detect multiple instances
let instanceCounter = 0;

// Vue 3 Reactive Dependencies pattern for CardsController
export function useCardsController() {
    const instanceId = ++instanceCounter;
    console.log(`🔧 [CardsController] Creating instance #${instanceId}`)

    const isInitialized = ref(false)
    const bizCardDivs = ref([])
    // Declare early to avoid TDZ when effects call functions that reference this variable
    let scenePlaneElement = null

    // CRITICAL: Inject services - throw error if not provided (no fallbacks)
    const bullsEyeService = inject('bullsEyeService')
    const timelineService = inject('timelineService')  
    const colorPaletteService = inject('colorPaletteService')
    const sceneContainerService = inject('sceneContainerService')
    
    // Fail fast - no fallbacks allowed per user requirement
    if (!bullsEyeService) throw new Error('[useCardsController] bullsEyeService not provided')
    if (!timelineService) throw new Error('[useCardsController] timelineService not provided')
    if (!colorPaletteService) throw new Error('[useCardsController] colorPaletteService not provided')
    if (!sceneContainerService) throw new Error('[useCardsController] sceneContainerService not provided')
    
    // CRITICAL: Reactive computed that tracks when dependencies are ready
    const allDependenciesReady = computed(() => {
        const ready = bullsEyeService.isReady?.value && 
                     timelineService.isReady?.value && 
                     colorPaletteService.isReady?.value &&
                     sceneContainerService.isReady?.value
        
        console.debug('[CardsController] dependencies ready:', ready)
        return ready
    })
    
    // Get timeline functions EARLY to avoid TDZ errors in init calls triggered by watchers
    const timelineComposable = useTimeline()
    const { getPositionForDate, getDateForPosition, isInitialized: timelineInitialized } = timelineComposable

    // Jobs dependency: init when jobs become available (handles race where scene-plane-ready fires before loadJobs())
    const jobsDependency = getGlobalJobsDependency()

    // EVENT-DRIVEN: Auto-initialize when scene-plane is ready (proper dependency order)
    onMounted(() => {
        // Listen for scene-plane-ready event to initialize when ScenePlane dependency is satisfied
        const handleScenePlaneReady = () => {
            if (!isInitialized.value && allDependenciesReady.value) {
                console.debug('[CardsController] initializing cards (scene-plane-ready)')
                initializeCardsController()
            }
        }

        // Also run when jobs become ready (in case scene-plane-ready fired before loadJobs() completed)
        const stop = watch(
            () => jobsDependency.isReady?.value && jobsDependency.getJobsData?.()?.length > 0,
            (jobsReady) => {
                if (!jobsReady || isInitialized.value || !allDependenciesReady.value) return
                console.debug('[CardsController] initializing cards (jobs now ready)')
                initializeCardsController()
            },
            { immediate: true }
        )

        // Wait for scene-plane-ready event (proper dependency ordering)
        window.addEventListener('scene-plane-ready', handleScenePlaneReady)

        // Cleanup listener on unmount
        onUnmounted(() => {
            window.removeEventListener('scene-plane-ready', handleScenePlaneReady)
            stop()
        })
    })
    
    // Get color palette functions
    const { colorPalettes, currentPaletteFilename } = useColorPalette()
    
    // Optimized card registry (replaces document.getElementById calls)
    const cardRegistry = useCardRegistry()
    
    // Element registry - now globally available from main.ts
    const elementRegistry = injectGlobalElementRegistry();
    
    // Try to get scene-plane element via provide/inject or template refs
    scenePlaneElement = inject('scenePlaneElement', null)

    // Mutex lock to prevent concurrent initialization
    let isInitializing = false

    async function initializeCardsController() {
        if (isInitialized.value) {
            console.debug(`[CardsController #${instanceId}] already initialized`)
            return
        }

        // CRITICAL: Check mutex lock to prevent race conditions
        if (isInitializing) {
            console.warn(`[CardsController #${instanceId}] ⚠️ Initialization already in progress, skipping duplicate call`)
            return
        }

        const jobs = getGlobalJobsDependency().getJobsData()
        if (!Array.isArray(jobs) || jobs.length === 0) {
            console.warn(`[CardsController #${instanceId}] No jobs data yet, skipping init`)
            return
        }

        try {
            isInitializing = true
            console.log(`🔧 [CardsController #${instanceId}] 🚀 STARTING INITIALIZATION with ${jobs.length} jobs`)
            // Initialize timeline first
            if (!timelineInitialized.value) {
                console.debug('[CardsController] initializing timeline')
                initialize(jobs)
            }
            
            // Get the scene plane element via optimized registry. Fail-fast: no fallbacks.
            let scenePlaneEl = scenePlaneElement ?? elementRegistry.getScenePlane()
            if (!scenePlaneEl) {
                const err = new Error('[CardsController] Scene plane not available')
                reportError(err, '[CardsController] Scene plane not available', '')
                throw err
            }

            // Clear any existing cards (bizcards and skill cards)
            const existingCards = scenePlaneEl.querySelectorAll('.biz-card-div')
            existingCards.forEach(card => card.remove())
            const existingSkillCards = scenePlaneEl.querySelectorAll('.skill-card-div')
            existingSkillCards.forEach(card => card.remove())

            await readyPromise
            const cards = []
            for (let index = 0; index < jobs.length; index++) {
                const job = jobs[index]
                const card = await createBizCardDiv(job, index, scenePlaneEl)
                if (card) {
                    scenePlaneEl.appendChild(card)
                    cards.push(card)
                    cardRegistry.registerCardElement(index, card)
                    try {
                        await applyPaletteToElement(card)
                    } catch (error) {
                        console.error(`[CardsController] ❌ Could not apply palette to job ${index}:`, error)
                        throw error
                    }
                } else {
                    console.warn('[CardsController] Card creation failed for job', index)
                }
            }
            console.debug('[CardsController] business cards created:', cards.length)

            bizCardDivs.value = cards
            const allDivs = window.resumeFlock?.allDivs
            if (allDivs) allDivs.bizCardDivs = [...cards]

            // Build unique skills and which jobs reference each (one skill card per skill, shared by multiple biz cards)
            const allSkillNames = new Set()
            const skillToJobIndices = Object.create(null)
            for (let i = 0; i < jobs.length; i++) {
                const job = jobs[i]
                if (!job || !job['job-skills']) continue
                for (const skillName of Object.keys(job['job-skills'])) {
                    allSkillNames.add(skillName)
                    if (!skillToJobIndices[skillName]) skillToJobIndices[skillName] = []
                    skillToJobIndices[skillName].push(i)
                }
            }
            const skillCardIdsBySkillName = Object.create(null)
            const bizcards = scenePlaneEl.querySelectorAll('.biz-card-div')
            const placementParams = getSkillCardPlacementParams(scenePlaneEl, bizcards)
            const placedCenters = []
            const skillCardsCreated = []
            try {
                for (const skillName of allSkillNames) {
                    const referencingBizCardIds = (skillToJobIndices[skillName] || []).map(i => createBizCardDivId(i))
                    if (referencingBizCardIds.length === 0) continue
                    const skillCard = createSkillCardDiv(skillName, scenePlaneEl, referencingBizCardIds)
                    if (!skillCard) continue
                    const { left, top } = placeOneSkillCard(placementParams, placedCenters, skillCardWidth, skillCardHeight, SKILL_REPOSITION_MIN_DISTANCE, skillCardsCreated.length, skillCard.id)
                    skillCard.style.left = `${left}px`
                    skillCard.style.top = `${Math.max(0, top)}px`
                    placedCenters.push({ cx: left + skillCardWidth / 2, cy: top + skillCardHeight / 2 })
                    scenePlaneEl.appendChild(skillCard)
                    try {
                        await applyPaletteToElement(skillCard)
                    } catch (e) {
                        console.error(`[CardsController] Palette for skill card:`, e)
                        throw e
                    }
                    skillCardIdsBySkillName[skillName] = skillCard.id
                    skillCardsCreated.push(skillCard)
                }
                if (skillCardsCreated.length === 0) {
                    const err = new Error('[CardsController] Skill cards list is empty after creation loop')
                    reportError(err, '[CardsController] No skill cards created', '')
                    throw err
                }
                // Each biz card: only list of skill card element ids; titles come from those elements
                for (let index = 0; index < cards.length; index++) {
                    const card = cards[index]
                    const job = jobs[index]
                    if (!card || !job || !job['job-skills']) continue
                    const skillIds = Object.keys(job['job-skills'])
                        .map(name => skillCardIdsBySkillName[name])
                        .filter(Boolean)
                    if (skillIds.length) {
                        card.dataset.skillCardIds = skillIds.join(',')
                        card.setAttribute('data-skill-card-ids', skillIds.join(','))
                        const container = card.querySelector('.biz-card-skill-titles')
                        if (container) {
                            container.innerHTML = skillIds.map(skillCardId => {
                                const el = document.getElementById(skillCardId)
                                const title = el ? (el.getAttribute('data-skill-name') || skillCardId) : skillCardId
                                return `<span class="biz-card-skill-title" data-skill-card-id="${escapeHtml(skillCardId)}" style="cursor: pointer; text-decoration: underline;">${escapeHtml(title)}</span>`
                            }).join(', ')
                        }
                    }
                }
                console.log('[SkillCard] Created', Object.keys(skillCardIdsBySkillName).length, 'skill cards')
                if (window.resumeFlock?.allDivs) window.resumeFlock.allDivs.skillCardDivs = [...skillCardsCreated]

                // Yearly grid lines removed per user request

                isInitialized.value = true
            } finally {
                // Always log averages after geometry is set (biz + any skill cards created), even if init threw
                console.log('** AVERAGE **')
                logAverageBizCardCenterX(bizcards)
                logAverageSkillCardCenterX(skillCardsCreated)
            }
            
            console.debug('[CardsController] init complete, cards:', cards.length)

        } catch (error) {
            console.error('[CardsController] Initialization failed:', error)
            isInitialized.value = false
            throw error
        } finally {
            // CRITICAL: Release mutex lock
            isInitializing = false
            console.debug('[CardsController] Released initialization mutex')
        }
    }

    async function createBizCardDiv(job, jobNumber, scenePlane) {
        const cardId = createBizCardDivId(jobNumber)

        // CRITICAL: Check both registry AND DOM for existing cards
        let existingCard = cardRegistry.getCardElement(jobNumber)
        if (existingCard) {
            console.warn(`⚠️ [CardsController #${instanceId}] Card exists in registry: ${cardId}`)
            return null
        }

        // Also check DOM directly in case registry is out of sync
        const existingInDOM = document.getElementById(cardId)
        if (existingInDOM) {
            console.error(`🚨 [CardsController #${instanceId}] DUPLICATE CARD IN DOM: ${cardId} exists but not in registry!`)
            console.trace('Stack trace for duplicate detection:')
            return null
        }

        console.log(`✅ [CardsController #${instanceId}] Creating new card: ${cardId}`)
        
        const card = document.createElement('div')
        card.className = 'biz-card-div'
        card.id = cardId
        card.setAttribute('data-job-number', jobNumber)
        card.setAttribute('data-biz-card-title', (job.employer || job.role || `Job ${jobNumber}`).trim())
        card.setAttribute('data-role', job.role || 'Unknown Role')
        card.setAttribute('data-employer', job.employer || 'Unknown Employer')
        
        // Z from job "z-index" (1–3) for depth only
        const jobZIndex = (job['z-index'] != null && job['z-index'] !== '') ? parseInt(String(job['z-index']), 10) : (jobNumber % 3) + 1
        const zIndex = Math.min(3, Math.max(1, jobZIndex))
        // Random width variation around BIZCARD_WIDTH (average centerX stays 0)
        const widthDelta = mathUtils.getRandomInt(-BIZCARD_WIDTH_VARIANCE, BIZCARD_WIDTH_VARIANCE)
        const cardWidth = Math.max(BIZCARD_WIDTH - BIZCARD_WIDTH_VARIANCE, Math.min(BIZCARD_WIDTH + BIZCARD_WIDTH_VARIANCE, BIZCARD_WIDTH + widthDelta))
        // Uniform random offset of center X from scene center (~half average biz card width each side) so average centerX = 0
        const centerXOffset = (Math.random() * 2 - 1) * (BIZCARD_WIDTH / 2)
        const x = centerXOffset - cardWidth / 2
        let y = 100 // Default fallback (set from timeline below)
        
        try {
            // Parse job END date and get timeline position using corrected Timeline formula
            const endDate = (job.end === "CURRENT_DATE" || !job.end) ? new Date() : dateUtils.parseFlexibleDateString(job.end)
            if (endDate && timelineInitialized.value) {
                // Use Timeline's exact positioning logic like red lines - position at END date (top of cDiv)
                const { years } = useTimeline()
                const endYear = endDate.getFullYear()
                const endMonth = endDate.getMonth() // 0-11 range
                const endYearEntry = years.value.find(yearEntry => yearEntry.year === endYear)
                
                if (endYearEntry) {
                    // Use corrected formula: y - (month+1)*16.67 + 2
                    y = endYearEntry.y - ((endMonth + 1) * 16.67) + 2
                    // console.log(`[CardsController] Job ${jobNumber} (${job.employer}): ${job.end} → Y position: ${y}`)
                } else {
                    console.warn(`[CardsController] Could not find year entry for job ${jobNumber} year ${endYear}`)
                }
            } else {
                console.warn(`[CardsController] Could not position job ${jobNumber}: missing end date or timeline not ready`)
            }
        } catch (error) {
            console.error(`[CardsController] Error positioning job ${jobNumber}:`, error)
            throw error
        }
        
        // Store scene positions as data attributes (for original CardsController compatibility)
        card.setAttribute('data-sceneLeft', x)
        card.setAttribute('data-sceneTop', y)  // This will be updated later in height calculation
        card.setAttribute('scene-left', x)
        card.setAttribute('scene-top', y)
        
        // Add color index for palette application
        card.setAttribute('data-color-index', jobNumber) // Use jobNumber as color index
        
        // Debug card creation attributes for all jobs (to identify patterns)
        console.debug('[CardsController] card attributes Job#' + jobNumber, {
            id: card.id,
            dataJobNumber: card.getAttribute('data-job-number'),
            dataColorIndex: card.getAttribute('data-color-index'),
            className: card.className,
            style: card.style.cssText,
            position: `${card.style.left}, ${card.style.top}`,
            jobData: {
                employer: job.employer,
                role: job.role,
                start: job.start,
                end: job.end,
                skillCount: job['job-skills'] ? Object.keys(job['job-skills']).length : 0
            }
        })
        
        // Z = distance from viewer = maxZ - z_index (biz z_index 1–3 → Z 13, 12, 11)
        const sceneZ = zUtils.Z_from_z_index(zIndex)
        card.setAttribute('data-sceneZ', sceneZ)
        card.style.zIndex = String(zIndex) // CSS stacking: 1–3 so biz cards sit behind skill cards
        // Apply Z-based depth filters (brightness, blur, etc.)
        card.style.filter = filters.get_filterStr_from_z(sceneZ)
        // Scene is STATIC: position is set once and never changed; parallax handles projection only.
        card.style.left = `${x}px`
        card.style.top = `${y}px`
        card.style.width = `${cardWidth}px`
        console.debug('[CardsController] card positioned', jobNumber, { x, y })
        
        // Calculate duration-based height (equivalent to setGeometry)
        try {
            // Re-parse the dates for height calculation (need both start and end)
            const jobStartDate = dateUtils.parseFlexibleDateString(job.start || job.startDate)
            const jobEndDate = (job.end === "CURRENT_DATE" || !job.end) ? new Date() : dateUtils.parseFlexibleDateString(job.end)
            
            // Initialize scene position variables
            let sceneTop = 0;
            let sceneBottom = 0;
            
            if (jobStartDate && jobEndDate && timelineInitialized.value) {
                // Use Timeline's exact positioning logic for height calculation
                const { years } = useTimeline()
                
                // Calculate end date position
                const endYear = jobEndDate.getFullYear()
                const endMonth = jobEndDate.getMonth() // 0-11 range
                const endYearEntry = years.value.find(yearEntry => yearEntry.year === endYear)
                sceneTop = endYearEntry ? endYearEntry.y - ((endMonth + 1) * 16.67) + 2 : getPositionForDate(jobEndDate)
                
                // Calculate start date position  
                const startYear = jobStartDate.getFullYear()
                const startMonth = jobStartDate.getMonth() // 0-11 range
                const startYearEntry = years.value.find(yearEntry => yearEntry.year === startYear)
                sceneBottom = startYearEntry ? startYearEntry.y - ((startMonth + 1) * 16.67) + 2 : getPositionForDate(jobStartDate)
                
                let sceneHeight = sceneBottom - sceneTop
                
                // Enforce minimum height (from flock-of-postcards MIN_BIZCARD_HEIGHT)
                if (sceneHeight < MIN_BIZCARD_HEIGHT) {
                    sceneHeight = MIN_BIZCARD_HEIGHT
                }
                
                // Apply calculated height
                card.style.height = `${sceneHeight}px`
                card.setAttribute('data-sceneHeight', sceneHeight)
                card.setAttribute('data-sceneTop', sceneTop)
                card.setAttribute('data-sceneBottom', sceneBottom)
                if (jobNumber === 0) {
                    console.log('[CardsController] first bizCard scene-relative centerX:', centerXOffset.toFixed(1))
                }
                console.debug('[CardsController] job height', jobNumber, sceneHeight)
                console.debug('[CardsController] parsed dates', {
                    jobStart: job.start,
                    jobEnd: job.end,
                    jobStartDate: jobStartDate.toISOString().slice(0, 10),
                    jobEndDate: jobEndDate.toISOString().slice(0, 10)
                })
                // Verify timeline calculations with reverse function
                const reversedStartDate = getDateForPosition(sceneBottom)
                const reversedEndDate = getDateForPosition(sceneTop)
                
                console.debug('[CardsController] timeline positions', {
                    sceneTop: sceneTop,
                    sceneBottom: sceneBottom,
                    sceneHeight: sceneHeight,
                    startDateAsYear: jobStartDate.getFullYear() + jobStartDate.getMonth()/12 + jobStartDate.getDate()/365.25/12,
                    endDateAsYear: jobEndDate.getFullYear() + jobEndDate.getMonth()/12 + jobEndDate.getDate()/365.25/12
                })
                console.debug('[CardsController] reverse calc', {
                    originalStart: jobStartDate.toISOString().slice(0, 10),
                    reversedStart: reversedStartDate.toISOString().slice(0, 10),
                    originalEnd: jobEndDate.toISOString().slice(0, 10),
                    reversedEnd: reversedEndDate.toISOString().slice(0, 10),
                    startDiff: Math.abs(jobStartDate.getTime() - reversedStartDate.getTime()) / (1000 * 60 * 60 * 24), // days
                    endDiff: Math.abs(jobEndDate.getTime() - reversedEndDate.getTime()) / (1000 * 60 * 60 * 24) // days
                })
            } else {
                console.warn(`[CardsController] Could not calculate height for job ${jobNumber}: missing dates or timeline not ready`)
            }
        } catch (error) {
            console.error(`[CardsController] Error calculating height for job ${jobNumber}:`, error)
            throw error
        }

        // Add comprehensive content including job number and description
        const description = job.Description ? job.Description.substring(0, 200) + '...' : '';
        const skillCount = job['job-skills'] ? Object.keys(job['job-skills']).length : 0;
        const hasSkills = job['job-skills'] && Object.keys(job['job-skills']).length > 0;
        
        // Parse dates once at the top level for use throughout the function
        const originalJobStartDate = dateUtils.parseFlexibleDateString(job.start || job.startDate)
        const originalJobEndDate = (job.end === "CURRENT_DATE" || (job.end && String(job.end).toLowerCase().includes('present')) || !job.end) ? new Date() : dateUtils.parseFlexibleDateString(job.end)
        const isEndPresent = !job.end || job.end === 'CURRENT_DATE' || (typeof job.end === 'string' && job.end.toLowerCase().includes('present'))
        
        // Create separate copies for positioning calculations (will be forced to day 1)
        const jobStartDate = originalJobStartDate ? new Date(originalJobStartDate) : null
        const jobEndDate = originalJobEndDate ? new Date(originalJobEndDate) : null
        
        // Calculate reverse dates for debugging (outside the height calculation block)
        let reversedStartDate = null;
        let reversedEndDate = null;
        let startDiffDays = null;
        let endDiffDays = null;
        let sceneTopValue = 'N/A';
        let sceneBottomValue = 'N/A';
        try {
            
            // Force day to 01 for red line positioning test
            if (jobEndDate) {
                jobEndDate.setDate(1);
            }
            if (jobStartDate) {
                jobStartDate.setDate(1);
            }
            
            // Initialize variables for red line calculations
            let redLineSceneTop = 0;
            let redLineSceneBottom = 0;
            
            if (jobStartDate && jobEndDate && timelineInitialized.value) {
                // Use Timeline's exact positioning logic from Timeline.vue
                const { years } = useTimeline()
                
                // Find the year entry for end date
                const endYear = jobEndDate.getFullYear()
                const endMonth = jobEndDate.getMonth() // Use 0-11 range directly
                const yearEntry = years.value.find(y => y.year === endYear)
                
                if (yearEntry) {
                    // Add 1 month to compensate for 1-month early offset, push red line down 2px: y - (month+1)*16.67 + 2
                    redLineSceneTop = yearEntry.y - ((endMonth + 1) * 16.67) + 2
                    sceneTopValue = Math.round(redLineSceneTop);
                }
                
                // Find the year entry for start date
                const startYear = jobStartDate.getFullYear()
                const startMonth = jobStartDate.getMonth() // Use 0-11 range directly
                const startYearEntry = years.value.find(y => y.year === startYear)
                
                if (startYearEntry) {
                    // Add 1 month to compensate for 1-month early offset, push red line down 2px: y - (month+1)*16.67 + 2
                    redLineSceneBottom = startYearEntry.y - ((startMonth + 1) * 16.67) + 2
                    sceneBottomValue = Math.round(redLineSceneBottom);
                }
                // Calculate reverse dates using Timeline's logic (reverse of: y - (month+1)*16.67 + 2)
                // Using the same 'years' variable already declared above
                
                // Proper reverse calculation for verification
                function reverseTimelinePosition(pixelPosition) {
                    // Find the two year entries that bracket this position
                    let lowerYear = null;
                    let upperYear = null;
                    
                    for (const yearEntry of years.value.sort((a, b) => b.y - a.y)) { // Sort by y descending
                        if (yearEntry.y >= pixelPosition) {
                            upperYear = yearEntry;
                        } else if (!lowerYear) {
                            lowerYear = yearEntry;
                            break;
                        }
                    }
                    
                    // Use the year entry that this position would belong to
                    const targetYear = upperYear || lowerYear;
                    if (!targetYear) return null;
                    
                    // Reverse the formula: pixelPosition = yearEntry.y - ((month + 1) * 16.67) + 2
                    // So: (month + 1) * 16.67 = yearEntry.y - pixelPosition + 2
                    // So: month + 1 = (yearEntry.y - pixelPosition + 2) / 16.67
                    // So: month = ((yearEntry.y - pixelPosition + 2) / 16.67) - 1
                    const monthPlus1 = (targetYear.y - pixelPosition + 2) / 16.67;
                    const month = monthPlus1 - 1;
                    
                    // Clamp month to valid range and round, then add 1 to compensate for consistent 1-month early error
                    const clampedMonth = Math.max(0, Math.min(11, Math.round(month) + 1));
                    
                    return new Date(targetYear.year, clampedMonth, 1);
                }
                
                reversedStartDate = reverseTimelinePosition(redLineSceneBottom);
                reversedEndDate = reverseTimelinePosition(redLineSceneTop);
                
                // Calculate differences in days - compare reversed dates against original dates  
                if (reversedStartDate && reversedEndDate && originalJobStartDate && originalJobEndDate) {
                    // Compare reversed dates (day 1) against original dates (any day)
                    startDiffDays = Math.round((reversedStartDate.getTime() - originalJobStartDate.getTime()) / (1000 * 60 * 60 * 24))
                    endDiffDays = Math.round((reversedEndDate.getTime() - originalJobEndDate.getTime()) / (1000 * 60 * 60 * 24))
                }
            }
        } catch (error) {
            console.error(`[CardsController] Could not calculate reverse dates for job ${jobNumber}:`, error)
            throw error
        }
        
        card.innerHTML = `
            <div class="biz-details-employer" style="font-weight: bold; padding: 2px;">
                ${job.employer || 'Unknown Employer'}
            </div>
            <div class="biz-details-role" style="font-weight: bold; padding: 2px;">
                ${job.role || 'Unknown Role'}
            </div>
            <div class="biz-details-dates" style="font-weight: bold; padding: 2px;">${originalJobStartDate ? originalJobStartDate.toISOString().slice(0, 10) : 'N/A'} - ${isEndPresent ? 'Present' : (originalJobEndDate ? originalJobEndDate.toISOString().slice(0, 10) : 'N/A')}</div>
            <div class="biz-details-debug-row"><span class="biz-details-id-and-hex">#${jobNumber} z:${sceneZ} <span class="hex-normal"></span> <span class="hex-highlighted"></span></span></div>
            <div class="job-stats" style="font-size: 10px; color: #666; margin-top: 4px;">
                Skills: ${skillCount} | References: ${job.references ? job.references.length : 0}
            </div>
            ${hasSkills ? '<div class="biz-card-skill-titles" style="font-size: 9px; color: #555; margin-top: 2px; line-height: 1.2;"></div>' : ''}
        `

        // Add click handler: select this card or deselect if it is the selected card (one at a time). Clicking a skill title (by element id) selects that skill card.
        card.addEventListener('click', (event) => {
            event.stopPropagation()
            const skillTitleEl = event.target.closest('.biz-card-skill-title')
            if (skillTitleEl && selectionManager) {
                const skillCardId = skillTitleEl.getAttribute('data-skill-card-id')
                if (skillCardId) {
                    selectionManager.selectCard({ type: 'skill', skillCardId }, 'CardsController.bizCardSkillTitleClick')
                }
                return
            }
            if (!selectionManager) return
            const sel = selectionManager.selectedCard
            if (sel?.type === 'biz' && sel.jobNumber === jobNumber) {
                selectionManager.clearSelection('CardsController.cardClick')
                return
            }
            selectionManager.selectCard({ type: 'biz', jobNumber }, 'CardsController.cardClick')
        })
        
        // Add hover handlers for synchronization with rDivs
        card.addEventListener('mouseenter', () => {
            console.debug('[CardsController] card hover', jobNumber)
            if (selectionManager) {
                selectionManager.hoverJobNumber(jobNumber, 'CardsController.mouseenter')
            }
        })
        
        card.addEventListener('mouseleave', () => {
            console.debug('[CardsController] card hover end', jobNumber)
            if (selectionManager) {
                selectionManager.clearHover('CardsController.mouseleave')
            }
        })
        
        // No additional elements created for cards
        
        return card
    }

    /**
     * Create a single skill card div for a skill name (one card per skill, referenced by multiple biz cards).
     * Position is set at creation by placeOneSkillCard (uniform Y over timeline span, X clustered at biz edges).
     * Only stores list of biz card element ids; titles are read from those elements via data-biz-card-title.
     * @param {string} skillName
     * @param {HTMLElement} scenePlane
     * @param {string[]} referencingBizCardIds - element ids of biz cards that reference this skill
     */
    function createSkillCardDiv(skillName, scenePlane, referencingBizCardIds) {
        if (!skillName || !referencingBizCardIds?.length) return null
        const id = `skill-card-div-${skillCardIdCounter++}`
        const skillCard = document.createElement('div')
        skillCard.className = 'skill-card-div'
        skillCard.id = id
        skillCard.setAttribute('data-skill-name', skillName)
        skillCard.setAttribute('data-referencing-biz-card-ids', referencingBizCardIds.join(','))
        // Use the first referencing job’s job ID for palette: same job ID → same swatch index as biz cards.
        const firstBiz = document.getElementById(referencingBizCardIds[0])
        const firstJobIndex = firstBiz != null ? parseInt(firstBiz.getAttribute('data-job-number'), 10) : 0
        if (!Number.isNaN(firstJobIndex)) {
            skillCard.setAttribute('data-job-number', firstJobIndex)
            skillCard.setAttribute('data-color-index', firstJobIndex)
        }
        // Z = distance from viewer = maxZ - z_index; skill z_index 4–13 so they stack above biz (1–3)
        const skillZIndex = mathUtils.getRandomInt(zUtils.FLOCK_SKILL_Z_INDEX_MIN, zUtils.FLOCK_SKILL_Z_INDEX_MAX)
        const sceneZ = zUtils.Z_from_z_index(skillZIndex)
        skillCard.setAttribute('data-sceneZ', sceneZ)
        skillCard.style.zIndex = String(skillZIndex)

        const width = MEAN_CARD_WIDTH + 2 * CARD_BORDER_WIDTH
        const height = MEAN_CARD_HEIGHT + 2 * CARD_BORDER_WIDTH
        // Position set immediately below via placeOneSkillCard (Y uniformly over timeline span, X by cluster)
        skillCard.style.position = 'absolute'
        skillCard.style.top = '0px'
        skillCard.style.left = '0px'
        skillCard.style.width = `${width}px`
        skillCard.style.height = `${height}px`
        skillCard.style.borderWidth = `${CARD_BORDER_WIDTH}px`
        skillCard.style.borderStyle = 'solid'
        skillCard.style.boxSizing = 'border-box'
        skillCard.style.pointerEvents = 'auto'
        skillCard.style.cursor = 'pointer'
        skillCard.style.display = 'flex'
        skillCard.style.alignItems = 'center'
        skillCard.style.justifyContent = 'center'
        skillCard.style.textAlign = 'left'
        skillCard.style.wordBreak = 'break-word'
        skillCard.style.filter = filters.get_filterStr_from_z(sceneZ)
        const backIconUrl = '/static_content/icons/anchors/icons8-back-16-black.png'
        const backIconsHtml = referencingBizCardIds.map(bizCardId => {
            return `<span class="skill-card-biz-title skill-card-back-icon" data-biz-card-id="${escapeHtml(bizCardId)}" style="cursor: pointer; display: inline-flex;"><img class="back-icon" src="${backIconUrl}" alt="" width="16" height="16" aria-hidden="true"></span>`
        }).join('')
        skillCard.innerHTML = `
            <div class="skill-card-content" style="display: flex; flex-direction: column; align-items: flex-start; gap: 2px; width: 100%;">
                <span class="skill-card-label">${escapeHtml(skillName)}</span>
                ${backIconsHtml ? `<div class="skill-card-back-icons" style="display: flex; flex-wrap: wrap; gap: 2px; justify-content: flex-start; align-items: center;">${backIconsHtml}</div>` : ''}
                <span class="skill-card-z" style="opacity: 0.8;">z:${sceneZ}</span>
            </div>`

        skillCard.addEventListener('click', (e) => {
            e.stopPropagation()
            const bizTitleEl = e.target.closest('.skill-card-biz-title')
            if (bizTitleEl && selectionManager) {
                const bizCardId = bizTitleEl.getAttribute('data-biz-card-id')
                if (bizCardId) {
                    const bizEl = document.getElementById(bizCardId)
                    const jobNum = bizEl != null ? parseInt(bizEl.getAttribute('data-job-number'), 10) : NaN
                    if (!Number.isNaN(jobNum)) {
                        selectionManager.selectCard({ type: 'biz', jobNumber: jobNum }, 'CardsController.skillCardBizTitleClick')
                    }
                }
                return
            }
            if (!selectionManager) return
            const card = selectionManager.selectedCard
            if (card?.type === 'skill' && card.skillCardId === skillCard.id) {
                selectionManager.clearSelection('CardsController.skillCardClick')
                return
            }
            selectionManager.selectCard({ type: 'skill', skillCardId: skillCard.id }, 'CardsController.skillCardClick')
        })
        skillCard.addEventListener('mouseenter', () => {
            if (!selectionManager) return
            const isSelected = selectionManager.selectedCard?.type === 'skill' && selectionManager.selectedCard?.skillCardId === skillCard.id
            if (!isSelected) {
                skillCard.classList.add('hovered')
                const list = document.getElementById('resume-content-div-list') || document.getElementById('resume-content-div')
                if (list) {
                    list.querySelectorAll('.skill-resume-div, .appended-skill-resume-div').forEach((el) => {
                        if ((el.getAttribute('data-skill-card-id') || '') === skillCard.id) el.classList.add('hovered')
                    })
                }
            }
        })
        skillCard.addEventListener('mouseleave', () => {
            skillCard.classList.remove('hovered')
            const list = document.getElementById('resume-content-div-list') || document.getElementById('resume-content-div')
            if (list) {
                list.querySelectorAll('.skill-resume-div, .appended-skill-resume-div').forEach((el) => {
                    if ((el.getAttribute('data-skill-card-id') || '') === skillCard.id) el.classList.remove('hovered')
                })
            }
            if (selectionManager) selectionManager.clearHover('CardsController.skillCardMouseleave')
        })

        return skillCard
    }

    function escapeHtml(text) {
        const div = document.createElement('div')
        div.textContent = text
        return div.innerHTML
    }

    const skillCardWidth = MEAN_CARD_WIDTH + 2 * CARD_BORDER_WIDTH
    const skillCardHeight = MEAN_CARD_HEIGHT + 2 * CARD_BORDER_WIDTH

    /** Box-Muller: one sample from N(0,1). */
    function normalSample() {
        const u1 = Math.random()
        const u2 = Math.random()
        if (u1 <= 0) return 0
        return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
    }

    /** Sample from N(mean, stddev), then clamp to [minVal, maxVal]. */
    function clampedNormal(mean, stddev, minVal, maxVal) {
        const x = mean + normalSample() * stddev
        return Math.max(minVal, Math.min(maxVal, x))
    }

    /** Compute placement params from biz cards and scene (for skill card positioning at creation). */
    function getSkillCardPlacementParams(scenePlaneEl, bizcards) {
        let minTop = Infinity, maxBottom = -Infinity
        let sumLeft = 0, sumRight = 0
        bizcards.forEach((el) => {
            const top = parseFloat(el.style.top) || 0
            const height = parseFloat(el.style.height) || 0
            const left = parseFloat(el.style.left) || 0
            const w = parseFloat(el.style.width) || BIZCARD_WIDTH
            minTop = Math.min(minTop, top)
            maxBottom = Math.max(maxBottom, top + height)
            sumLeft += left
            sumRight += left + w
        })
        const sceneWidth = scenePlaneEl.offsetWidth || (scenePlaneEl.parentElement && scenePlaneEl.parentElement.offsetWidth) || 600
        const sceneHeight = scenePlaneEl.offsetHeight || (scenePlaneEl.parentElement && scenePlaneEl.parentElement.offsetHeight) || 800
        const halfCardWidth = skillCardWidth / 2
        const halfCardHeight = skillCardHeight / 2
        const avgLeftEdge = bizcards.length > 0 ? sumLeft / bizcards.length : sceneWidth * 0.25
        const avgRightEdge = bizcards.length > 0 ? sumRight / bizcards.length : sceneWidth * 0.75
        const meanLeftCenterX = avgLeftEdge + halfCardWidth
        const meanRightCenterX = avgRightEdge - halfCardWidth
        // Ensure range spans scene center (0) so skill cards can be placed on both sides.
        let minCenterX = Math.min(avgLeftEdge, 0)
        let maxCenterX = Math.max(avgRightEdge, 0)
        // Ensure left cluster is left of center and right cluster is right of center.
        const safeMeanLeft = meanLeftCenterX <= 0 ? meanLeftCenterX : minCenterX
        const safeMeanRight = meanRightCenterX >= 0 ? meanRightCenterX : maxCenterX
        let minCenterY = minTop + halfCardHeight
        let maxCenterY = Math.max(minCenterY, maxBottom - halfCardHeight)
        if (maxCenterY <= minCenterY || !Number.isFinite(minCenterY) || !Number.isFinite(maxCenterY)) {
            minCenterY = halfCardHeight
            maxCenterY = Math.max(minCenterY, sceneHeight - halfCardHeight)
        }
        return { minCenterY, maxCenterY, meanLeftCenterX: safeMeanLeft, meanRightCenterX: safeMeanRight, minCenterX, maxCenterX }
    }

    /**
     * Place one skill card by trial-and-rejection. center.x is 3D scene-relative (can be negative or positive).
     * FAIL FAST: if rejections exceed threshold, error is logged and app exits.
     * @returns {{ left: number, top: number }}
     */
    function placeOneSkillCard(params, placedCenters, cardWidth, cardHeight, minDistance, cardIndex, cardId) {
        const halfCardWidth = cardWidth / 2
        const halfCardHeight = cardHeight / 2
        const { minCenterY, maxCenterY, meanLeftCenterX, meanRightCenterX, minCenterX, maxCenterX } = params
        let rejections = 0
        while (true) {
            const cy = minCenterY + Math.random() * (maxCenterY - minCenterY)
            const useLeft = Math.random() < 0.5
            const cx = clampedNormal(
                useLeft ? meanLeftCenterX : meanRightCenterX,
                SKILL_PLACEMENT_X_STDDEV,
                minCenterX,
                maxCenterX
            )
            let tooClose = false
            for (const p of placedCenters) {
                const dx = cx - p.cx
                const dy = cy - p.cy
                if (Math.sqrt(dx * dx + dy * dy) < minDistance) {
                    tooClose = true
                    rejections++
                    if (rejections > MAX_SKILL_PLACEMENT_TRIAL_REJECTIONS) {
                        // FALLBACK: When threshold exceeded, accept the position with overlap
                        console.warn(
                            `⚠️ [CardsController] Skill card placement exceeded ${MAX_SKILL_PLACEMENT_TRIAL_REJECTIONS} attempts for card index ${cardIndex}, id=${cardId ?? 'unknown'}. Using fallback position (may overlap).`
                        )
                        const left = cx - halfCardWidth
                        const top = cy - halfCardHeight
                        return { left, top }  // Accept position despite overlap
                    }
                    break
                }
            }
            if (!tooClose) {
                const left = cx - halfCardWidth
                const top = cy - halfCardHeight
                return { left, top }
            }
        }
    }

    /** Log average 3D scene-relative center.x of biz-card-divs (should be 0). Only call once after scene geometry is set; 3D scene elements are static. */
    function logAverageBizCardCenterX(bizcards) {
        const n = bizcards?.length ?? 0
        if (n === 0) {
            console.log('** AVERAGE ** biz 3D scene center.x: n=0')
            return
        }
        let sumCenterX = 0
        for (const card of bizcards) {
            const left = parseFloat(card.style.left) || 0
            const w = parseFloat(card.style.width) || BIZCARD_WIDTH
            sumCenterX += left + w / 2
        }
        const avgCenterX = sumCenterX / n
        console.log('** AVERAGE ** biz 3D scene center.x:', avgCenterX.toFixed(1), 'n=', n)
    }

    /** Log average 3D scene-relative center.x of skill-card-divs (should be 0 if unbiased). Only call once after reposition: 3D scene elements are static once positioned. */
    function logAverageSkillCardCenterX(skillCards) {
        const n = skillCards?.length ?? 0
        if (n === 0) {
            console.log('** AVERAGE ** skill 3D scene center.x: n=0')
            return
        }
        let sumCenterX = 0
        for (const card of skillCards) {
            const left = parseFloat(card.style.left) || 0
            const w = parseFloat(card.style.width) || 0
            sumCenterX += left + w / 2
        }
        const avgCenterX = sumCenterX / n
        console.log('** AVERAGE ** skill 3D scene center.x:', avgCenterX.toFixed(1), 'n=', n)
    }

    // Viewport change handler: do not change any card clone geometry. Biz-card and skill-card clones keep same 3D scene geometry as originals — only visibility toggles.
    // All scene clones always use SELECTED_CLONE_SCENE_Z for data-sceneZ (enforced here).
    function handleViewportChangedForClones() {
        let scenePlaneEl = scenePlaneElement || elementRegistry.getScenePlane()
        if (!scenePlaneEl) return
        const clones = scenePlaneEl.querySelectorAll('[id$="-clone"]')
        const isCardClone = (el) =>
            el.classList.contains('biz-card-div') || (el.id && el.id.startsWith('biz-card-div-')) ||
            el.classList.contains('skill-card-div') || (el.id && el.id.startsWith('skill-card-div-'))
        clones.forEach(clone => {
            if (isCardClone(clone)) {
                clone.setAttribute('data-sceneZ', String(zUtils.SELECTED_CLONE_SCENE_Z))
                return
            }
            try {
                const sceneRect = scenePlaneEl.getBoundingClientRect()
                const centerX = sceneRect.width / 2
                const cloneWidth = parseFloat(clone.style.width) || 180
                const newCloneLeft = centerX - cloneWidth / 2
                clone.style.left = `${newCloneLeft}px`
            } catch (error) {
                console.error('[handleViewportChangedForClones] Error repositioning clone:', error)
                throw error
            }
        })
        if (clones.length > 0) {
            console.debug('[CardsController] clones processed', clones.length)
        }
    }

    // Use single app-state object: window.resumeFlock
    const setupEventListenersFixed = () => {
        console.debug('[CardsController] setting up event listeners (fixed)')
        const globalSelectionManager = window.resumeFlock?.selectionManager
        if (!globalSelectionManager) {
            console.error('[CardsController] window.resumeFlock.selectionManager not available')
            return false
        }
        try {
            globalSelectionManager.addEventListener('test-event-fixed', () => {})
            globalSelectionManager.eventTarget.dispatchEvent(new CustomEvent('test-event-fixed'))
        } catch (error) {
            console.error('[CardsController] global event test failed:', error)
            throw error
        }
        try {
            globalSelectionManager.addEventListener('job-selected', handleJobSelected)
            globalSelectionManager.addEventListener('card-selected', handleCardSelected)
            globalSelectionManager.addEventListener('selection-cleared', handleSelectionCleared)
            globalSelectionManager.addEventListener('cards-unselect-skill', handleCardsUnselectSkill)
            globalSelectionManager.addEventListener('job-hovered', handleJobHovered)
            globalSelectionManager.addEventListener('hoverCleared', handleHoverCleared)
            
            // Listen for viewport changes to reposition selected clones
            window.addEventListener('viewport-changed', handleViewportChangedForClones)
            window.addEventListener('resize', handleViewportChangedForClones)

            // Set a flag to indicate listeners are set up
            window._cardsControllerListenersReady = true
            window._cardsControllerSelectionManagerId = globalSelectionManager.instanceId
            console.log('[useCardsController] 🚀 All event listeners set up and ready (FIXED)!')
            
            return true
        } catch (error) {
            console.error('[useCardsController] ❌ Failed to set up event listeners (FIXED):', error)
            return false
        }
    }
    
    // Try to set up event listeners with retry mechanism
    let setupAttempts = 0
    const maxSetupAttempts = 5
    
    const attemptSetup = () => {
        setupAttempts++
        console.log(`[useCardsController] Setup attempt ${setupAttempts}/${maxSetupAttempts}`)
        
        if (window.resumeFlock?.selectionManager) {
            const success = setupEventListenersFixed()
            if (success) {
                console.log('[useCardsController] ✅ Event listener setup successful!')
                return
            }
        }
        
        if (setupAttempts < maxSetupAttempts) {
            console.log('[useCardsController] ⏰ Retrying setup in 1 second...')
            setTimeout(attemptSetup, 1000)
        } else {
            console.error('[useCardsController] ❌ Failed to set up event listeners after', maxSetupAttempts, 'attempts')
        }
    }
    
    // Start setup attempts immediately
    attemptSetup()
    
    // Also try in onMounted as backup
    onMounted(() => {
        console.log('[useCardsController] onMounted called, listeners ready:', !!window._cardsControllerListenersReady)
        if (!window._cardsControllerListenersReady && window.resumeFlock?.selectionManager) {
            console.log('[useCardsController] Retrying event listener setup in onMounted...')
            setupEventListenersFixed()
        }
    })
    
    // Clone management: one selected card at a time
    /** job-selected: resume list sync; scroll cDiv into view. Clone display is in handleCardSelected. */
    function handleJobSelected(event) {
        const { jobNumber } = event.detail || {}
        if (jobNumber == null) return
        setTimeout(() => scrollCDivHeaderIntoView(jobNumber), 100)
    }

    /** One selected card at a time; show its clone (biz or skill) */
    function handleCardSelected(event) {
        const { card, previousCard } = event.detail || {}
        if (!card) return

        if (previousCard) {
            if (previousCard.type === 'biz') {
                removeSpecificClone(previousCard.jobNumber)
            } else {
                removeSkillCardClone(previousCard.skillCardId)
                showSkillCardOriginal(previousCard.skillCardId)
            }
        }

        if (card.type === 'biz') {
            hideJobOriginal(card.jobNumber)
            createSelectedClone(card.jobNumber)
            scrollCDivHeaderIntoViewAfterCloneVisible(card.jobNumber)
        } else {
            // Skill selected: show as selected in both scene (clone) and resume (paired skill-resume-div)
            if (previousCard?.type === 'skill' && previousCard.skillCardId !== card.skillCardId) {
                removeSkillCardClone(previousCard.skillCardId)
                showSkillCardOriginal(previousCard.skillCardId)
            }
            hideSkillCardOriginal(card.skillCardId)
            const cloneId = `${card.skillCardId}-clone`
            if (!document.getElementById(cloneId)) {
                createSkillCardClone(card.skillCardId)
            }
            const cloneEl = document.getElementById(cloneId)
            if (cloneEl) {
                cloneEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
            }
        }
    }

    /** When the selected card is unselected (e.g. before selecting another), remove its clone and show original */
    function handleCardsUnselect(event) {
        const { jobNumber } = event.detail || {}
        if (jobNumber != null) {
            removeSpecificClone(jobNumber)
        }
    }

    function handleCardsUnselectSkill(event) {
        const { skillCardId } = event.detail || {}
        if (skillCardId) removeSkillCardClone(skillCardId)
    }

    function handleSelectionCleared(event) {
        console.log('[useCardsController] Selection cleared, hiding all clones and showing originals...')
        const previousCard = event.detail?.previousCard
        if (previousCard?.type === 'skill') {
            removeSkillCardClone(previousCard.skillCardId)
            showSkillCardOriginal(previousCard.skillCardId)
        }
        removeAllClones()
        clearAllSelected()
    }
    
    function handleJobHovered(event) {
        const { jobNumber } = event.detail
        console.log(`🖱️ [useCardsController] Job hovered: ${jobNumber}`)
        
        // Clear previous hover states
        clearAllCardHovers()
        
        // Keep selected cDiv in selected color (match rDiv: no hover styling when selected)
        if (selectionManager.getSelectedJobNumber() === jobNumber) {
            return
        }
        
        // Apply hover styles to the corresponding cDiv using card registry
        let card = cardRegistry.getCardElement(jobNumber)
        if (!card) {
            // Fallback to DOM query during migration period
            const cardId = createBizCardDivId(jobNumber)
            card = document.getElementById(cardId)
        }
        if (card && !card.classList.contains('clone')) {
            applyHoverStylesToCard(card)
            console.log(`🖱️ [useCardsController] Applied hover styles to card: ${card.id}`)
        }
    }
    
    function applyHoverStylesToCard(card) {
        // Apply hover styles using CSS custom properties (same approach as rDiv)
        const hoveredBgColor = card.getAttribute('data-background-color-hovered');
        const hoveredFgColor = card.getAttribute('data-foreground-color-hovered');
        const hoveredPadding = card.getAttribute('data-hovered-padding');
        const hoveredInnerBorderWidth = card.getAttribute('data-hovered-inner-border-width');
        const hoveredInnerBorderColor = card.getAttribute('data-hovered-inner-border-color');
        const hoveredOuterBorderWidth = card.getAttribute('data-hovered-outer-border-width');
        const hoveredOuterBorderColor = card.getAttribute('data-hovered-outer-border-color');
        const hoveredBorderRadius = card.getAttribute('data-hovered-border-radius');
        
        if (hoveredBgColor) {
            card.style.setProperty('--data-background-color-hovered', hoveredBgColor);
        }
        if (hoveredFgColor) {
            card.style.setProperty('--data-foreground-color-hovered', hoveredFgColor);
        }
        if (hoveredPadding) {
            card.style.setProperty('--data-hovered-padding', hoveredPadding);
        }
        if (hoveredInnerBorderWidth) {
            card.style.setProperty('--data-hovered-inner-border-width', hoveredInnerBorderWidth);
        }
        if (hoveredInnerBorderColor) {
            card.style.setProperty('--data-hovered-inner-border-color', hoveredInnerBorderColor);
        }
        if (hoveredOuterBorderWidth) {
            card.style.setProperty('--data-hovered-outer-border-width', hoveredOuterBorderWidth);
        }
        if (hoveredOuterBorderColor) {
            card.style.setProperty('--data-hovered-outer-border-color', hoveredOuterBorderColor);
        }
        if (hoveredBorderRadius) {
            card.style.setProperty('--data-hovered-border-radius', hoveredBorderRadius);
        }
        
        // Remove Z-based filter so hovered background matches rDiv (no darkening)
        card.style.setProperty('filter', 'none', 'important');
        // Add hovered class for CSS rule to apply
        card.classList.add('hovered');
    }
    
    function clearHoverStylesFromCard(card) {
        // Restore normal styles using CSS custom properties
        const normalBgColor = card.getAttribute('data-background-color');
        const normalFgColor = card.getAttribute('data-foreground-color');
        const normalPadding = card.getAttribute('data-normal-padding');
        const normalInnerBorderWidth = card.getAttribute('data-normal-inner-border-width');
        const normalInnerBorderColor = card.getAttribute('data-normal-inner-border-color');
        const normalOuterBorderWidth = card.getAttribute('data-normal-outer-border-width');
        const normalOuterBorderColor = card.getAttribute('data-normal-outer-border-color');
        const normalBorderRadius = card.getAttribute('data-normal-border-radius');
        
        if (normalBgColor) {
            card.style.setProperty('--data-background-color', normalBgColor);
        }
        if (normalFgColor) {
            card.style.setProperty('--data-foreground-color', normalFgColor);
        }
        if (normalPadding) {
            card.style.setProperty('--data-normal-padding', normalPadding);
        }
        if (normalInnerBorderWidth) {
            card.style.setProperty('--data-normal-inner-border-width', normalInnerBorderWidth);
        }
        if (normalInnerBorderColor) {
            card.style.setProperty('--data-normal-inner-border-color', normalInnerBorderColor);
        }
        if (normalOuterBorderWidth) {
            card.style.setProperty('--data-normal-outer-border-width', normalOuterBorderWidth);
        }
        if (normalOuterBorderColor) {
            card.style.setProperty('--data-normal-outer-border-color', normalOuterBorderColor);
        }
        if (normalBorderRadius) {
            card.style.setProperty('--data-normal-border-radius', normalBorderRadius);
        }
        
        // Restore Z-based filter for normal (non-hovered) state
        const sceneZ = card.getAttribute('data-sceneZ');
        if (sceneZ !== null && sceneZ !== '') {
            const z = parseInt(sceneZ, 10);
            if (!Number.isNaN(z)) {
                card.style.setProperty('filter', filters.get_filterStr_from_z(z));
            }
        }
        // Remove hovered class
        card.classList.remove('hovered');
    }
    
    function handleHoverCleared(event) {
        // console.log('[useCardsController] Hover cleared, removing hover from all cards...')
        clearAllCardHovers()
    }
    
    function clearAllCardHovers() {
        let scenePlaneEl = scenePlaneElement || elementRegistry.getScenePlane()
        if (!scenePlaneEl) return
        
        // Clear hover styles from all cards
        const allCards = scenePlaneEl.querySelectorAll('.biz-card-div')
        allCards.forEach(card => {
            clearHoverStylesFromCard(card)
        })
    }
    
    function clearAllSelected() {
        let scenePlaneEl = scenePlaneElement || elementRegistry.getScenePlane()
        if (!scenePlaneEl) return
        
        // Remove selected class from all cards (both original and clones)
        const allCards = scenePlaneEl.querySelectorAll('.biz-card-div')
        allCards.forEach(card => {
            card.classList.remove('selected')
        })
        
        console.log(`[useCardsController] ✅ Cleared selected class from all cards`)
    }

    // Simple display toggle functions for pre-creation architecture
    function hideJobOriginal(jobNumber) {
        const originalCard = cardRegistry.getCardElement(jobNumber)
        console.log(`[hideJobOriginal] Called for job ${jobNumber}, found card:`, !!originalCard)
        if (originalCard) {
            originalCard.classList.add('hasClone')
            originalCard.style.setProperty('display', 'none', 'important')
            originalCard.style.setProperty('visibility', 'hidden', 'important')
            originalCard.style.setProperty('opacity', '0', 'important')
            originalCard.style.setProperty('pointer-events', 'none', 'important')
            originalCard.classList.add('force-hidden-for-clone')
            console.log(`[hideJobOriginal] ✅ Hidden original card for job ${jobNumber}`)
            console.log(`[hideJobOriginal] Computed display after hiding:`, window.getComputedStyle(originalCard).display)
        } else {
            console.error(`[hideJobOriginal] ❌ Original card not found for job ${jobNumber}`)
        }
    }
    
    function showJobOriginal(jobNumber) {
        const originalCard = cardRegistry.getCardElement(jobNumber)
        if (originalCard) {
            // Restore visibility only — geometry was never changed
            originalCard.style.removeProperty('display')
            originalCard.style.removeProperty('visibility')
            originalCard.style.removeProperty('opacity')
            originalCard.style.removeProperty('z-index')
            originalCard.style.removeProperty('pointer-events')
            originalCard.classList.remove('force-hidden-for-clone')
            originalCard.classList.remove('hasClone')
            // Parallax can now update this original so it doesn’t appear at a stale position (no drift).
            console.log(`[showJobOriginal] ✅ Restored original card visibility for job ${jobNumber}`)
        }
    }
    
    /** Run scroll only after the biz-card clone is in DOM and verified visible (avoids scene jump down-then-up). */
    function scrollCDivHeaderIntoViewAfterCloneVisible(jobNumber) {
        const cloneId = `biz-card-div-${jobNumber}-clone`
        const maxAttempts = 20
        let attempts = 0
        function check() {
            const clone = document.getElementById(cloneId)
            if (!clone) {
                if (++attempts < maxAttempts) requestAnimationFrame(check)
                return
            }
            const cs = window.getComputedStyle(clone)
            const display = cs.display
            const visibility = cs.visibility
            const rect = clone.getBoundingClientRect()
            const visible = display !== 'none' && visibility !== 'hidden' && rect.height > 0
            if (visible) {
                scrollCDivHeaderIntoView(jobNumber)
                return
            }
            if (++attempts < maxAttempts) requestAnimationFrame(check)
        }
        requestAnimationFrame(check)
    }

    // Enhanced cDiv header scroll function
    function scrollCDivHeaderIntoView(jobNumber) {
        console.log(`[useCardsController] 📜 SCROLL: Attempting to scroll cDiv HEADER into view for job ${jobNumber}`)
        
        const cardId = createBizCardDivId(jobNumber)
        console.log(`[useCardsController] SCROLL: Looking for card with ID: ${cardId}`)
        
        // Check if there's a selected clone first, otherwise use original
        const cloneId = `${cardId}-clone`
        let card = document.getElementById(cloneId)
        
        if (card) {
            console.log(`[useCardsController] SCROLL: Found CLONE for scrolling:`, cloneId)
        } else {
            // No clone, use original card
            card = cardRegistry.getCardElement(jobNumber)
            if (!card) {
                card = document.getElementById(cardId)
                console.log(`[useCardsController] SCROLL: No clone, using original via getElementById:`, !!card)
            } else {
                console.log(`[useCardsController] SCROLL: No clone, using original from registry:`, !!card)
            }
        }
        
        if (!card) {
            console.error(`[useCardsController] ❌ SCROLL FAILED: Card not found for job ${jobNumber}`)
            const allCards = document.querySelectorAll('.biz-card-div')
            console.log(`[useCardsController] SCROLL: Total cards in DOM: ${allCards.length}`)
            return
        }
        
        scrollCardHeaderIntoView(card, jobNumber, 'cDiv')
    }
    
    // Legacy function for backward compatibility
    function scrollCDivIntoView(jobNumber) {
        console.log(`[useCardsController] 🔄 Legacy scroll call - redirecting to header scroll`)
        scrollCDivHeaderIntoView(jobNumber)
    }
    
    // New rDiv header scroll function
    function scrollRDivHeaderIntoView(jobNumber) {
        console.log(`[useCardsController] 📜 SCROLL: Attempting to scroll rDiv HEADER into view for job ${jobNumber}`)
        
        const resumeDiv = document.querySelector(`[data-job-number="${jobNumber}"].biz-resume-div`)
        if (!resumeDiv) {
            console.error(`[useCardsController] ❌ SCROLL FAILED: Resume div not found for job ${jobNumber}`)
            const allResumeDivs = document.querySelectorAll('.biz-resume-div')
            console.log(`[useCardsController] SCROLL: Total resume divs in DOM: ${allResumeDivs.length}`)
            return
        }
        
        scrollResumeHeaderIntoView(resumeDiv, jobNumber)
    }
    
    // Generic card header scroll function
    function scrollCardHeaderIntoView(card, jobNumber, type = 'cDiv') {
        console.log(`[useCardsController] 📜 Scrolling ${type} header for job ${jobNumber}`)
        
        // Find the header element - employer name is typically the main header
        const headerSelectors = [
            '.biz-details-employer',
            '.biz-card-header', 
            '.job-title',
            '.company-name',
            '.biz-details-role'
        ]
        
        let headerElement = null
        for (const selector of headerSelectors) {
            headerElement = card.querySelector(selector)
            if (headerElement) {
                console.log(`[useCardsController] 📜 Found ${type} header element: ${selector}`)
                break
            }
        }
        
        // If no specific header found, use the card itself
        if (!headerElement) {
            headerElement = card
            console.log(`[useCardsController] 📜 No specific header found, using ${type} element itself`)
        }

        // Biz card: scroll so entire header section is at top of scene view. Skill card: center in view.
        const scrollBlock = type === 'cDiv' ? 'start' : 'center'

        // Check if the card is hidden (has a clone)
        const isHidden = card.style.display === 'none' || card.classList.contains('hasClone')
        console.log(`[useCardsController] 📜 ${type} is hidden: ${isHidden}`)
        
        if (isHidden) {
            // Temporarily show the card for scrolling, then hide it again
            const originalDisplay = card.style.display
            card.style.display = 'block'
            console.log(`[useCardsController] 📜 Temporarily showing hidden ${type} for header scroll`)
            
            setTimeout(() => {
                headerElement.scrollIntoView({ 
                    behavior: 'smooth', 
                    block: scrollBlock,
                    inline: 'nearest'
                })
                console.log(`[useCardsController] ✅ ${type} header scrolled into view`)
                
                // Hide it again after scrolling
                setTimeout(() => {
                    card.style.display = 'none'
                    card.style.setProperty('display', 'none', 'important')
                    console.log(`[useCardsController] 📜 Re-hidden ${type} after header scroll`)
                }, 50)
            }, 10)
            
        } else {
            // Card is visible, scroll to header directly
            console.log(`[useCardsController] 📜 Scrolling to visible ${type} header`)
            headerElement.scrollIntoView({ 
                behavior: 'smooth', 
                block: scrollBlock,
                inline: 'nearest'
            })
            console.log(`[useCardsController] ✅ ${type} header scrolled into view`)
        }
    }
    
    // Resume header scroll function
    function scrollResumeHeaderIntoView(resumeDiv, jobNumber) {
        console.log(`[useCardsController] 📜 Scrolling rDiv header for job ${jobNumber}`)
        
        // Find the header element in the resume div
        const headerSelectors = [
            '.biz-resume-details-div',
            '.resume-header',
            '.job-title',
            '.company-name'
        ]
        
        let headerElement = null
        for (const selector of headerSelectors) {
            headerElement = resumeDiv.querySelector(selector)
            if (headerElement) {
                console.log(`[useCardsController] 📜 Found rDiv header element: ${selector}`)
                break
            }
        }
        
        // If no specific header found, use the resume div itself
        if (!headerElement) {
            headerElement = resumeDiv
            console.log(`[useCardsController] 📜 No specific rDiv header found, using resume div itself`)
        }
        
        // Scroll the header into view
        headerElement.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'center',  // Center header with space above/below
            inline: 'nearest'
        })
        console.log(`[useCardsController] ✅ rDiv header scrolled into view for job ${jobNumber}`)
    }
    
    // Continue with the rest of the existing function...
    function continueOriginalScrollLogic(card, jobNumber) {
        if (card) {
            // Check if the original card is hidden (has a clone)
            const isHidden = card.style.display === 'none' || card.classList.contains('hasClone')
            console.log(`[useCardsController] DEBUGGING: Original card is hidden:`, isHidden)
            
            if (isHidden) {
                // Temporarily show the card for scrolling, then hide it again
                const originalDisplay = card.style.display
                card.style.display = 'block'
                console.log(`[useCardsController] DEBUGGING: Temporarily showing hidden card for scroll`)
                
                setTimeout(() => {
                    // Scroll to show the header elements at the top of the card
                    // This ensures employer, role, dates are prominently visible
                    const headerElement = card.querySelector('.biz-details-employer') || card
                    console.log(`[useCardsController] DEBUGGING: Scrolling to header element:`, !!headerElement)
                    
                    headerElement.scrollIntoView({ 
                        behavior: 'smooth', 
                        block: 'center',  // Center header with space above/below
                        inline: 'nearest'
                    })
                    
                    // Hide it again after scrolling
                    setTimeout(() => {
                        card.style.display = 'none'
                        card.style.setProperty('display', 'none', 'important')
                        console.log(`[useCardsController] DEBUGGING: Re-hidden card after scroll with display: none !important`)
                    }, 50)
                }, 10)
                
            } else {
                // Card is visible, scroll to show header elements
                console.log(`[useCardsController] DEBUGGING: Scrolling to visible original card header`)
                const headerElement = card.querySelector('.biz-details-employer') || card
                console.log(`[useCardsController] DEBUGGING: Header element found:`, !!headerElement)
                
                headerElement.scrollIntoView({ 
                    behavior: 'smooth', 
                    block: 'center',  // Center header with space above/below
                    inline: 'nearest'
                })
            }
        }
        
        if (!card) {
            console.warn(`[useCardsController] Cannot scroll - card not found: ${cardId}`)
            // Let's see what cards do exist
            const allCards = document.querySelectorAll('.biz-card-div')
            console.log(`[useCardsController] DEBUGGING: Found ${allCards.length} total cards in DOM`)
            allCards.forEach((c, i) => {
                if (i < 5) { // Show first 5 for debugging
                    console.log(`  Card ${i}: id=${c.id}, jobNumber=${c.getAttribute('data-job-number')}`)
                }
            })
            return false
        }
        
        // Get card position info for debugging
        let cardRect = null
        try {
            cardRect = card.getBoundingClientRect()
            console.log(`[useCardsController] DEBUGGING: Card position:`, {
                top: cardRect.top,
                left: cardRect.left,
                width: cardRect.width,
                height: cardRect.height
            })
        } catch (error) {
            console.error(`[useCardsController] Error getting card position for job ${jobNumber}:`, error)
            throw error
        }
        
        // Check if card is already visible
        const sceneContainer = elementRegistry.getSceneContainer()
        if (sceneContainer && cardRect) {
            try {
                const containerRect = sceneContainer.getBoundingClientRect()
                const isVisible = cardRect.top >= containerRect.top && 
                                 cardRect.bottom <= containerRect.bottom
                console.log(`[useCardsController] DEBUGGING: Card visible before scroll:`, isVisible)
            } catch (error) {
                console.error(`[useCardsController] Error checking card visibility for job ${jobNumber}:`, error)
                throw error
            }
        }
        
        // TEMPORARILY DISABLED: Auto-scroll for testing
        console.log(`[useCardsController] DEBUGGING: Auto-scroll DISABLED for testing`)
        /*
        // Use native scrollIntoView for simple, reliable scrolling
        try {
            card.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'center',  // Center the card vertically in the view
                inline: 'nearest' // Keep horizontal position as-is
            })
            console.log(`[useCardsController] DEBUGGING: scrollIntoView called successfully`)
        } catch (error) {
            console.error(`[useCardsController] DEBUGGING: scrollIntoView failed:`, error)
            throw error
        }
        */
        
        console.log(`[useCardsController] Scrolled cDiv ${cardId} into view`)
        return true
    }

    /** Update biz-resume-div scene Z debug text for a job (cZ from original, cloneZ when clone exists). */
    function updateResumeDivSceneZForJob(jobNumber) {
        const cDiv = document.getElementById(`biz-card-div-${jobNumber}`)
        const clone = document.getElementById(`biz-card-div-${jobNumber}-clone`)
        const cZ = cDiv ? (cDiv.getAttribute('data-sceneZ') ?? '?') : '?'
        const cloneZ = clone ? clone.getAttribute('data-sceneZ') : null
        const text = ` cZ:${cZ}` + (cloneZ != null ? ` cloneZ:${cloneZ}` : '')
        document.querySelectorAll(`.biz-resume-div[data-job-number="${jobNumber}"] .r-div-scene-z`).forEach(el => { el.textContent = text })
    }

    /** Biz-card clone: same flow as createSkillCardClone — hide original, clone, show clone. */
    function createSelectedClone(jobNumber) {
        const scenePlaneEl = scenePlaneElement || elementRegistry.getScenePlane()
        if (!scenePlaneEl) return
        
        let originalCard = cardRegistry.getCardElement(jobNumber) || document.getElementById(createBizCardDivId(jobNumber))
        if (!originalCard) return
        const cloneId = `${originalCard.id}-clone`
        if (document.getElementById(cloneId)) return

        // Capture geometry from original BEFORE hiding (so computed/rect are correct)
        const origStyle = originalCard.style
        const origComputed = typeof window.getComputedStyle === 'function' ? window.getComputedStyle(originalCard) : null
        const left = origStyle.left || (origComputed && origComputed.left) || '0px'
        const top = origStyle.top || (origComputed && origComputed.top) || '0px'
        const width = origStyle.width || (origComputed && origComputed.width) || '180px'
        const height = origStyle.height || (origComputed && origComputed.height) || '180px'
        const transform = origStyle.transform || (origComputed && origComputed.transform) || 'none'

        originalCard.classList.add('hasClone')
        originalCard.style.setProperty('display', 'none', 'important')

        const clone = originalCard.cloneNode(true)
        clone.id = cloneId
        clone.classList.add('selected', 'clone')
        clone.classList.remove('hovered', 'hasClone')
        clone.setAttribute('data-sceneZ', String(zUtils.SELECTED_CLONE_SCENE_Z))
        clone.style.removeProperty('display')
        clone.style.removeProperty('visibility')
        clone.style.removeProperty('opacity')
        clone.style.removeProperty('pointer-events')
        clone.style.setProperty('display', 'block', 'important')
        clone.style.setProperty('visibility', 'visible', 'important')
        clone.style.setProperty('opacity', '1', 'important')
        clone.style.setProperty('z-index', '99', 'important')
        clone.style.setProperty('position', 'absolute', 'important')
        clone.style.setProperty('filter', 'none', 'important')
        // Explicit geometry so clone is visible in same place as original
        clone.style.setProperty('left', left, 'important')
        clone.style.setProperty('top', top, 'important')
        clone.style.setProperty('width', width, 'important')
        clone.style.setProperty('height', height, 'important')
        if (transform && transform !== 'none') clone.style.setProperty('transform', transform, 'important')

        scenePlaneEl.appendChild(clone)
        
        updateResumeDivSceneZForJob(jobNumber)

        elementRegistry.clearAllCache()

        clone.addEventListener('click', (event) => {
            event.stopPropagation()
            if (!selectionManager) return
            const sel = selectionManager.selectedCard
            if (sel?.type === 'biz' && sel.jobNumber === jobNumber) {
                selectionManager.clearSelection('CardsController.cloneClick')
                return
            }
            selectionManager.selectCard({ type: 'biz', jobNumber }, 'CardsController.cloneClick')
        })

        // Apply color palette to clone
        try {
            applyPaletteToElement(clone)
        } catch (error) {
            console.error('[useCardsController] Could not apply palette to clone:', error)
            throw error
        }
        // Re-assert visibility after palette (ensures clone stays visible)
        clone.style.setProperty('display', 'block', 'important')
        clone.style.setProperty('visibility', 'visible', 'important')
        clone.style.setProperty('opacity', '1', 'important')
    }
    
    function removeAllClones() {
        let scenePlaneEl = scenePlaneElement || elementRegistry.getScenePlane()
        if (!scenePlaneEl) return
        
        // Find and remove all clones
        const clones = scenePlaneEl.querySelectorAll('[id$="-clone"]')
        clones.forEach(clone => {
            clone.remove()
        })
        
        // Restore original cards that were hidden (find by hasClone class)
        const cardsWithClones = scenePlaneEl.querySelectorAll('.hasClone')
        cardsWithClones.forEach(card => {
            if (card.id && card.id.startsWith('biz-card-div-') && !card.id.includes('-clone')) {
                const jobNum = card.id.replace('biz-card-div-', '')
                updateResumeDivSceneZForJob(parseInt(jobNum, 10))
            }
            card.style.setProperty('display', 'block', 'important')
            card.style.setProperty('visibility', 'visible', 'important')
            card.style.setProperty('opacity', '1', 'important')
            card.style.removeProperty('pointer-events')
            card.style.removeProperty('z-index')
            // Remove clone-related classes
            card.classList.remove('hasClone')
            card.classList.remove('force-hidden-for-clone')
        })
        
        // CRITICAL: Clear element registry cache after removing clones
        elementRegistry.clearAllCache()
        
        console.log(`[useCardsController] ✅ Removed ${clones.length} clones and restored ${cardsWithClones.length} original cards`)
    }
    
    function removeSpecificClone(jobNumber) {
        let scenePlaneEl = scenePlaneElement || elementRegistry.getScenePlane()
        if (!scenePlaneEl) return
        
        // Find and remove the specific clone
        const cloneId = `biz-card-div-${jobNumber}-clone`
        const clone = scenePlaneEl.querySelector(`#${cloneId}`)
        if (clone) {
            clone.remove()
            console.log(`[useCardsController] ✅ Removed clone: ${cloneId}`)
        }
        
        // Find and restore the specific original card
        const originalId = `biz-card-div-${jobNumber}`
        const originalCard = scenePlaneEl.querySelector(`#${originalId}`)
        if (originalCard && originalCard.classList.contains('hasClone')) {
            originalCard.classList.remove('hasClone')
            originalCard.classList.remove('force-hidden-for-clone')
            updateResumeDivSceneZForJob(jobNumber)
            // Fully restore original card visibility (override !important declarations)
            originalCard.style.setProperty('display', 'block', 'important')
            originalCard.style.setProperty('visibility', 'visible', 'important')
            originalCard.style.setProperty('opacity', '1', 'important')
            originalCard.style.removeProperty('pointer-events')
            originalCard.style.removeProperty('z-index')
            console.log(`[useCardsController] ✅ Restored original card: ${originalId}`)
        }
        
        // CRITICAL: Clear element registry cache after removing clone
        elementRegistry.clearAllCache()
    }

    /** Skill card clone: same behavior as biz card (hide original, show clone at front, no parallax) */
    function hideSkillCardOriginal(skillCardId) {
        const el = document.getElementById(skillCardId)
        if (!el || !el.classList.contains('skill-card-div')) return
        el.classList.add('hasClone')
        el.style.setProperty('display', 'none', 'important')
    }

    function showSkillCardOriginal(skillCardId) {
        const el = document.getElementById(skillCardId)
        if (!el) return
        el.classList.remove('hasClone')
        el.style.removeProperty('display')
    }

    function createSkillCardClone(skillCardId) {
        const scenePlaneEl = scenePlaneElement || elementRegistry.getScenePlane()
        if (!scenePlaneEl) return
        const original = document.getElementById(skillCardId)
        if (!original || !original.classList.contains('skill-card-div')) return
        const cloneId = `${skillCardId}-clone`
        if (document.getElementById(cloneId)) return

        original.classList.add('hasClone')
        original.style.setProperty('display', 'none', 'important')

        const clone = original.cloneNode(true)
        clone.id = cloneId
        clone.classList.add('selected', 'clone')
        clone.classList.remove('hovered', 'hasClone')
        clone.setAttribute('data-sceneZ', String(zUtils.SELECTED_CLONE_SCENE_Z))
        clone.style.removeProperty('display')
        clone.style.setProperty('display', 'block', 'important')
        clone.style.setProperty('visibility', 'visible', 'important')
        clone.style.setProperty('opacity', '1', 'important')
        clone.style.setProperty('z-index', '99', 'important')
        clone.style.setProperty('position', 'absolute', 'important')
        clone.style.setProperty('filter', 'none', 'important')
        // Geometry (left, top, width, height) copied from original by cloneNode — do not change

        clone.addEventListener('click', (e) => {
            e.stopPropagation()
            if (!selectionManager) return
            if (selectionManager.selectedCard?.type === 'skill' && selectionManager.selectedCard.skillCardId === skillCardId) {
                selectionManager.clearSelection('CardsController.skillCardCloneClick')
                return
            }
            selectionManager.selectCard({ type: 'skill', skillCardId }, 'CardsController.skillCardCloneClick')
        })

        // Append as last child of container so clone displays over everything else
        scenePlaneEl.appendChild(clone)
        elementRegistry.clearAllCache()
    }

    function removeSkillCardClone(skillCardId) {
        const scenePlaneEl = scenePlaneElement || elementRegistry.getScenePlane()
        if (!scenePlaneEl) return
        const clone = document.getElementById(`${skillCardId}-clone`)
        if (clone) clone.remove()
        showSkillCardOriginal(skillCardId)
        elementRegistry.clearAllCache()
    }
    
    function createYearlyGridLines(scenePlane) {
        if (!scenePlane || !timelineInitialized.value) {
            console.warn('[CardsController] Cannot create yearly grid lines: missing scenePlane or timeline not initialized')
            return
        }
        
        // Remove any existing grid lines
        const existingLines = scenePlane.querySelectorAll('.yearly-grid-line, .yearly-grid-label')
        existingLines.forEach(line => line.remove())
        
        const lineWidth = window.innerWidth
        
        // Use Timeline's exact calculation with NO changes
        const { startYear, endYear, timelineHeight } = useTimeline()
        
        for (let year = 1986; year <= 2026; year++) {
            // Use exact same calculation as Timeline.vue - integer year directly (matches 12/01 positioning)
            const yPosition = linearInterp(year, startYear.value, timelineHeight.value, endYear.value, TIMELINE_PADDING_TOP + 50)
            
            // Create horizontal line
            const gridLine = document.createElement('div')
            gridLine.className = 'yearly-grid-line'
            gridLine.style.cssText = `
                position: absolute;
                left: 0px;
                top: ${yPosition}px;
                width: ${lineWidth}px;
                height: 2px;
                background-color: green;
                z-index: 998;
                pointer-events: none;
            `
            scenePlane.appendChild(gridLine)
            
            // Create year label
            const yearLabel = document.createElement('div')
            yearLabel.className = 'yearly-grid-label'
            yearLabel.textContent = year.toString()
            yearLabel.style.cssText = `
                position: absolute;
                left: 30px;
                top: ${yPosition - 15}px;
                font-size: 14px;
                font-weight: bold;
                color: green;
                z-index: 999;
                pointer-events: none;
            `
            scenePlane.appendChild(yearLabel)
        }
        
        console.log('[CardsController] ✅ Created yearly grid lines from 1986 to 2026')
    }
    
    // Cleanup event listeners on unmount
    onUnmounted(() => {
        selectionManager.removeEventListener('job-selected', handleJobSelected)
        selectionManager.removeEventListener('selection-cleared', handleSelectionCleared)
        selectionManager.removeEventListener('job-hovered', handleJobHovered)
        selectionManager.removeEventListener('hoverCleared', handleHoverCleared)
        
        // Remove viewport change listeners
        window.removeEventListener('viewport-changed', handleViewportChangedForClones)
        window.removeEventListener('resize', handleViewportChangedForClones)
    })

    // Make test function globally available for debugging
    if (typeof window !== 'undefined') {
        
        // Add rDiv to cDiv sync test functions
        window.testRDivToCDivSync = (jobNumber) => {
            console.log(`🧪 Testing rDiv to cDiv sync for job ${jobNumber}...`)
            if (selectionManager) {
                selectionManager.selectJobNumber(jobNumber, 'ResumeListController.handleBizResumeDivClickEvent')
            } else {
                console.error('❌ selectionManager not available')
            }
        }
        
        window.testScrollCDiv = (jobNumber) => {
            console.log(`🧪 Testing cDiv scroll for job ${jobNumber}...`)
            scrollCDivIntoView(jobNumber)
        }
        
        window.debugSelectionSync = () => {
            console.log('\n🔍 === SELECTION SYNC DEBUG ===')
            console.log('1. Checking selectionManager instances:')
            console.log('   - useCardsController selectionManager exists:', !!selectionManager)
            console.log('   - useCardsController selectionManager instanceId:', selectionManager?.instanceId)
            const sm = window.resumeFlock?.selectionManager
            console.log('   - window.resumeFlock.selectionManager exists:', !!sm)
            console.log('   - selectionManager instanceId:', sm?.instanceId)
            console.log('   - Same instance:', selectionManager === sm)
            
            console.log('\n2. Checking event listener setup:')
            console.log('   - _cardsControllerListenersReady:', !!window._cardsControllerListenersReady)
            console.log('   - _cardsControllerSelectionManagerId:', window._cardsControllerSelectionManagerId)
            console.log('   - handleJobSelected type:', typeof handleJobSelected)
            
            console.log('\n3. Checking resume system:')
            const rlc = window.resumeFlock?.resumeListController
            console.log('   - window.resumeFlock.resumeListController exists:', !!rlc)
            console.log('   - resumeListController.handleBizResumeDivClickEvent type:', typeof rlc?.handleBizResumeDivClickEvent)
            
            console.log('\n4. Checking DOM elements:')
            const resumeDivs = document.querySelectorAll('.biz-resume-div')
            const cardDivs = document.querySelectorAll('.biz-card-div')
            console.log('   - Resume divs found:', resumeDivs.length)
            console.log('   - Card divs found:', cardDivs.length)
            
            // Test event listener count
            if (selectionManager?.eventTarget) {
                console.log('\n5. Checking event listeners on selectionManager:')
                // Try to access event listeners (may not work in all browsers)
                try {
                    console.log('   - EventTarget type:', selectionManager.eventTarget.constructor.name)
                } catch (e) {
                    console.log('   - Cannot inspect event listeners directly')
                }
            }
            
            return {
                selectionManagerOk: !!selectionManager,
                resumeControllerOk: !!window.resumeFlock?.resumeListController,
                resumeDivCount: resumeDivs.length,
                cardDivCount: cardDivs.length,
                handleJobSelectedType: typeof handleJobSelected,
                listenersReady: !!window._cardsControllerListenersReady,
                sameInstance: selectionManager === window.resumeFlock?.selectionManager
            }
        }
        
        // Add automated test runner
        window.runQuickTest = () => {
            console.log('🧪 === QUICK SELECTION SYNC TEST ===\n')
            
            // Test 1: System availability
            const hasDebugFunctions = typeof window.debugSelectionSync === 'function'
            const hasTestFunctions = typeof window.testRDivToCDivSync === 'function'
            console.log('✅ Debug functions available:', hasDebugFunctions)
            console.log('✅ Test functions available:', hasTestFunctions)
            
            // Test 2: Run system debug
            if (hasDebugFunctions) {
                const status = window.debugSelectionSync()
                console.log('\n📊 System Status:', {
                    selectionManager: status.selectionManagerOk ? '✅' : '❌',
                    resumeController: status.resumeControllerOk ? '✅' : '❌',
                    resumeDivs: status.resumeDivCount > 0 ? '✅' : '❌',
                    cardDivs: status.cardDivCount > 0 ? '✅' : '❌'
                })
            }
            
            // Test 3: Try resume click simulation
            console.log('\n🖱️ Testing resume click simulation...')
            if (typeof window.testResumeClick === 'function') {
                window.testResumeClick(5)
                setTimeout(() => {
                    console.log('⏱️ Resume click test completed (check logs above)')
                }, 1000)
            } else {
                console.log('❌ testResumeClick not available')
            }
            
            // Test 4: Try direct selection
            console.log('\n🎯 Testing direct selection...')
            if (window.resumeFlock?.selectionManager?.selectJobNumber) {
                window.resumeFlock.selectionManager.selectJobNumber(8, 'quick-test')
                setTimeout(() => {
                    console.log('⏱️ Direct selection test completed (check logs above)')
                }, 1500)
            } else {
                console.log('❌ Direct selection not available')
            }
            
            console.log('\n🏁 Quick test completed! Check console output above for detailed results.')
        }
        
        // Add generic job selection test function
        window.testJobSelection = (jobNumber) => {
            console.log(`🧪 Testing Job#${jobNumber} selection manually...`)
            if (selectionManager) {
                selectionManager.selectJobNumber(jobNumber, 'manual-test')
                
                // Additional check after 100ms
                setTimeout(() => {
                    const original = document.getElementById(`biz-card-div-${jobNumber}`)
                    const clone = document.getElementById(`biz-card-div-${jobNumber}-clone`)
                    
                    console.log(`🧪 Job#${jobNumber} Test Results:`)
                    console.log(`  Original exists: ${!!original}`)
                    console.log(`  Clone exists: ${!!clone}`)
                    
                    if (original) {
                        const originalStyle = window.getComputedStyle(original)
                        console.log(`  Original display: ${originalStyle.display}`)
                        console.log(`  Original visibility: ${originalStyle.visibility}`)
                        console.log(`  Original opacity: ${originalStyle.opacity}`)
                        console.log(`  Original hasClone class: ${original.classList.contains('hasClone')}`)
                        console.log(`  Original rect:`, original.getBoundingClientRect())
                    }
                    
                    if (clone) {
                        const cloneStyle = window.getComputedStyle(clone)
                        console.log(`  Clone display: ${cloneStyle.display}`)
                        console.log(`  Clone visibility: ${cloneStyle.visibility}`)
                        console.log(`  Clone opacity: ${cloneStyle.opacity}`)
                        console.log(`  Clone rect:`, clone.getBoundingClientRect())
                    }
                    
                    console.log(`  Both visible: ${!!(original && clone && 
                        window.getComputedStyle(original).display !== 'none' && 
                        window.getComputedStyle(clone).display !== 'none')} ${
                        original && clone && 
                        window.getComputedStyle(original).display !== 'none' && 
                        window.getComputedStyle(clone).display !== 'none' ? '⚠️ ISSUE!' : '✅ OK'
                    }`)
                }, 100)
            } else {
                console.error(`❌ selectionManager not available`)
            }
        }
    }

    /**
     * Clear scene cards and registry, then re-run init from current jobs data.
     * Call after loadJobs({ force: true, forceResumeId }) so getJobsData() returns new data.
     */
    async function reinitializeResumeData() {
        console.log('[CardsController] 🔄 reinitializeResumeData called')

        const scenePlaneEl = scenePlaneElement ?? elementRegistry.getScenePlane()
        if (scenePlaneEl) {
            // Count before clearing
            const bizCardsCount = scenePlaneEl.querySelectorAll('.biz-card-div').length
            const skillCardsCount = scenePlaneEl.querySelectorAll('.skill-card-div').length
            const clonesCount = scenePlaneEl.querySelectorAll('[id$="-clone"]').length

            console.log(`[CardsController] Clearing ${bizCardsCount} biz-cards, ${skillCardsCount} skill-cards, ${clonesCount} clones`)

            // Clear originals
            scenePlaneEl.querySelectorAll('.biz-card-div').forEach((el) => el.remove())
            scenePlaneEl.querySelectorAll('.skill-card-div').forEach((el) => el.remove())
            // Clear ALL clones (critical - prevents duplicates)
            scenePlaneEl.querySelectorAll('[id$="-clone"]').forEach((el) => el.remove())

            // Verify clearing worked
            const remainingBizCards = scenePlaneEl.querySelectorAll('.biz-card-div').length
            const remainingClones = scenePlaneEl.querySelectorAll('[id$="-clone"]').length
            if (remainingBizCards > 0 || remainingClones > 0) {
                console.error(`🚨 [CardsController] CLEARING FAILED: ${remainingBizCards} biz-cards and ${remainingClones} clones still remain!`)
            } else {
                console.log('[CardsController] ✅ All cards cleared successfully')
            }
        }

        cardRegistry.clearRegistry?.()
        elementRegistry?.clearAllCache?.()
        isInitialized.value = false
        isInitializing = false  // CRITICAL: Reset mutex to allow reinit
        bizCardDivs.value = []
        const allDivs = window.resumeFlock?.allDivs
        if (allDivs) {
            allDivs.bizCardDivs = []
            allDivs.skillCardDivs = []
        }

        console.log('[CardsController] 🔄 Calling initializeCardsController...')
        await initializeCardsController()
        console.log('[CardsController] ✅ reinitializeResumeData complete')
    }

    return {
        isInitialized,
        bizCardDivs,
        initializeCardsController,
        reinitializeResumeData
    }
}