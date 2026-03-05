import { ref, onMounted, onUnmounted, watch, inject, computed, watchEffect } from 'vue'
import { jobs } from '@/modules/data/enrichedJobs.mjs'
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
  MEAN_CARD_WIDTH,
  MEAN_CARD_HEIGHT,
  MAX_CARD_POSITION_OFFSET,
  CARD_BORDER_WIDTH,
  SKILL_REPOSITION_EDGE_VARIANCE,
  SKILL_REPOSITION_MIN_DISTANCE,
  SKILL_REPOSITION_STRENGTH,
  SKILL_REPOSITION_MAX_ITERATIONS,
  SKILL_UNIQUE_X_MIN_SEPARATION,
  SKILL_UNIQUE_X_JITTER
} from '@/modules/core/cardConstants.mjs'
import { useCardRegistry } from '@/modules/composables/useCardRegistry.mjs'
import { injectGlobalElementRegistry } from '@/modules/composables/useGlobalElementRegistry.mjs'

// Timeline constants (matching Timeline.vue)
const TIMELINE_PADDING_TOP = 0;

// Skill card ID counter (for unique IDs)
let skillCardIdCounter = 0;

// Vue 3 Reactive Dependencies pattern for CardsController
export function useCardsController() {
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

    // EVENT-DRIVEN: Auto-initialize when scene-plane is ready (proper dependency order)
    onMounted(() => {
        // Listen for scene-plane-ready event to initialize when ScenePlane dependency is satisfied
        const handleScenePlaneReady = () => {
            if (!isInitialized.value && allDependenciesReady.value) {
                console.debug('[CardsController] initializing cards')
                initializeCardsController()
            }
        }
        
        // Wait for scene-plane-ready event (proper dependency ordering)
        window.addEventListener('scene-plane-ready', handleScenePlaneReady)
        
        // Cleanup listener on unmount
        onUnmounted(() => {
            window.removeEventListener('scene-plane-ready', handleScenePlaneReady)
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

    async function initializeCardsController() {
        if (isInitialized.value) {
            console.debug('[CardsController] already initialized')
            return
        }

        try {
            console.debug('[CardsController] initializing')
            // Initialize timeline first
            if (!timelineInitialized.value) {
                console.debug('[CardsController] initializing timeline')
                initialize(jobs)
            }
            
            // Get the scene plane element via optimized registry
            let scenePlaneEl = scenePlaneElement || elementRegistry.getScenePlane()
            if (!scenePlaneEl) {
                console.error('[CardsController] Scene plane not available - this should not happen with event-driven initialization')
                return
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
            for (const skillName of allSkillNames) {
                const referencingBizCardIds = (skillToJobIndices[skillName] || []).map(i => createBizCardDivId(i))
                if (referencingBizCardIds.length === 0) continue
                const skillCard = createSkillCardDiv(skillName, scenePlaneEl, referencingBizCardIds)
                if (skillCard) {
                    scenePlaneEl.appendChild(skillCard)
                    try {
                        await applyPaletteToElement(skillCard)
                    } catch (e) {
                        console.error(`[CardsController] Palette for skill card:`, e)
                        throw e
                    }
                    skillCardIdsBySkillName[skillName] = skillCard.id
                }
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

            // One-time flock-of-postcards–style reposition: spread skill cards over timeline, cluster X at left/right edges, repulsion
            repositionSkillCardsToWeightedAverages(scenePlaneEl)

            // Yearly grid lines removed per user request
            
            isInitialized.value = true
            
            console.debug('[CardsController] init complete, cards:', cards.length)
            setTimeout(async () => {
                await preCreateAllClones()
                console.debug('[CardsController] pre-created clones')
            }, 100)
            
        } catch (error) {
            console.error('[CardsController] Initialization failed:', error)
            isInitialized.value = false
            throw error
        }
    }

    async function createBizCardDiv(job, jobNumber, scenePlane) {
        const cardId = createBizCardDivId(jobNumber)
        
        // Check if card already exists in registry (no fallback to DOM needed)
        let existingCard = cardRegistry.getCardElement(jobNumber)
        if (existingCard) {
            console.debug('[CardsController] card exists', cardId)
            return null
        }
        
        const card = document.createElement('div')
        card.className = 'biz-card-div'
        card.id = cardId
        card.setAttribute('data-job-number', jobNumber)
        card.setAttribute('data-biz-card-title', (job.employer || job.role || `Job ${jobNumber}`).trim())
        
        // Z from job "z-index" (1–3) for depth only; horizontal = random offset from canvas center
        const jobZIndex = (job['z-index'] != null && job['z-index'] !== '') ? parseInt(String(job['z-index']), 10) : (jobNumber % 3) + 1
        const zIndex = Math.min(3, Math.max(1, jobZIndex))
        const cardWidth = BIZCARD_WIDTH
        const sceneWidth = scenePlane.offsetWidth || (scenePlane.parentElement && scenePlane.parentElement.offsetWidth) || 600
        const centerX = sceneWidth / 2
        // Limit offset so card never overlaps canvas left/right: max offset = distance from center to edge of card
        const maxOffsetFromEdge = Math.max(0, sceneWidth / 2 - cardWidth / 2)
        const maxOffset = Math.min(BIZCARD_HZ_CENTER_OFFSET_MAX, maxOffsetFromEdge)
        const hzOffset = maxOffset > 0 ? mathUtils.getRandomInt(-maxOffset, maxOffset) : 0
        const x = Math.max(0, Math.min(sceneWidth - cardWidth, centerX - cardWidth / 2 + hzOffset))
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
        // Fixed 3D scene position (constant after init; parallax only applies transform at render time)
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
        const originalJobEndDate = (job.end === "CURRENT_DATE" || !job.end) ? new Date() : dateUtils.parseFlexibleDateString(job.end)
        
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
            <div class="biz-details-dates" style="font-weight: bold; padding: 2px;">${originalJobStartDate ? originalJobStartDate.toISOString().slice(0, 10) : 'N/A'} - ${originalJobEndDate ? originalJobEndDate.toISOString().slice(0, 10) : 'N/A'}</div>
            <div class="biz-details-debug-row"><span class="biz-details-id-and-hex"> #${jobNumber} z:${sceneZ} <span class="hex-normal"></span> <span class="hex-highlighted"></span></span> <img class="url-icon" src="/static_content/icons/anchors/icons8-url-16-black.png" alt="" width="16" height="16" aria-hidden="true"><img class="back-icon" src="/static_content/icons/anchors/icons8-back-16-black.png" alt="" width="16" height="16" aria-hidden="true"><img class="img-icon" src="/static_content/icons/anchors/icons8-img-16-black.png" alt="" width="16" height="16" aria-hidden="true"></div>
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
     * Position is set later by repositionSkillCardsToWeightedAverages (uniform over full timeline span).
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
        // Placeholder position; repositionSkillCardsToWeightedAverages sets Y uniformly over timeline span and X by cluster
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
            if (selectionManager) selectionManager.hoverJobNumber(firstJobIndex, 'CardsController.skillCardMouseenter')
        })
        skillCard.addEventListener('mouseleave', () => {
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

    /** Repulsion: push apart skill cards that are too close (flock-of-postcards applyRepulsionForces) */
    function applyRepulsionForces(cardPositions, minTop, maxBottom, minLeft, maxRight) {
        for (let iteration = 0; iteration < SKILL_REPOSITION_MAX_ITERATIONS; iteration++) {
            let moved = false
            for (let i = 0; i < cardPositions.length; i++) {
                let forceX = 0, forceY = 0
                for (let j = 0; j < cardPositions.length; j++) {
                    if (i === j) continue
                    const dx = cardPositions[i].x - cardPositions[j].x
                    const dy = cardPositions[i].y - cardPositions[j].y
                    const distance = Math.sqrt(dx * dx + dy * dy)
                    if (distance < SKILL_REPOSITION_MIN_DISTANCE && distance > 0) {
                        const force = ((SKILL_REPOSITION_MIN_DISTANCE - distance) / SKILL_REPOSITION_MIN_DISTANCE) * SKILL_REPOSITION_STRENGTH
                        forceX += (dx / distance) * force * SKILL_REPOSITION_MIN_DISTANCE
                        forceY += (dy / distance) * force * SKILL_REPOSITION_MIN_DISTANCE
                        moved = true
                    }
                }
                cardPositions[i].x += forceX
                cardPositions[i].y += forceY
                cardPositions[i].y = Math.max(minTop, Math.min(maxBottom - skillCardHeight, cardPositions[i].y))
                cardPositions[i].x = Math.max(minLeft, Math.min(maxRight - skillCardWidth, cardPositions[i].x))
            }
            if (!moved) break
        }
    }

    /** Add jitter so cards don't align in a column (flock-of-postcards ensureUniqueXPositions) */
    function ensureUniqueXPositions(cardPositions, maxRight) {
        for (let iter = 0; iter < 5; iter++) {
            let adjusted = 0
            for (let i = 0; i < cardPositions.length; i++) {
                for (let j = i + 1; j < cardPositions.length; j++) {
                    const centerA = cardPositions[i].x + skillCardWidth / 2
                    const centerB = cardPositions[j].x + skillCardWidth / 2
                    const separation = Math.abs(centerB - centerA)
                    if (separation < SKILL_UNIQUE_X_MIN_SEPARATION) {
                        const jitterA = (Math.random() - 0.5) * SKILL_UNIQUE_X_JITTER
                        const jitterB = (Math.random() - 0.5) * SKILL_UNIQUE_X_JITTER
                        const baseAdj = (SKILL_UNIQUE_X_MIN_SEPARATION - separation) / 2
                        if (centerA < centerB) {
                            cardPositions[i].x -= baseAdj + jitterA
                            cardPositions[j].x += baseAdj + jitterB
                        } else {
                            cardPositions[i].x += baseAdj + jitterA
                            cardPositions[j].x -= baseAdj + jitterB
                        }
                        adjusted++
                    }
                }
            }
            for (const p of cardPositions) {
                p.x = Math.max(0, Math.min(maxRight - skillCardWidth, p.x))
            }
            if (adjusted === 0) break
        }
    }

    /**
     * One-time reposition of skill cards (flock-of-postcards repositionAllCardsToWeightedAverages).
     * Fixed 3D scene positions: spread Y over timeline, cluster X around left/right bizcard edges, repulsion, then clamp.
     */
    function repositionSkillCardsToWeightedAverages(scenePlaneEl) {
        const bizcards = scenePlaneEl.querySelectorAll('.biz-card-div')
        const skillCards = scenePlaneEl.querySelectorAll('.skill-card-div')
        if (bizcards.length === 0 || skillCards.length === 0) return

        let minTop = Infinity, maxBottom = -Infinity, sumLeft = 0, sumRight = 0
        bizcards.forEach((el) => {
            const top = parseFloat(el.style.top) || 0
            const height = parseFloat(el.style.height) || 0
            const left = parseFloat(el.style.left) || 0
            minTop = Math.min(minTop, top)
            maxBottom = Math.max(maxBottom, top + height)
            sumLeft += left
            sumRight += left + BIZCARD_WIDTH
        })
        const avgLeftEdge = sumLeft / bizcards.length
        const avgRightEdge = sumRight / bizcards.length
        const sceneWidth = scenePlaneEl.offsetWidth || (scenePlaneEl.parentElement && scenePlaneEl.parentElement.offsetWidth) || 600
        const halfCardWidth = skillCardWidth / 2
        const maxRight = sceneWidth

        const cardPositions = []
        for (let i = 0; i < skillCards.length; i++) {
            const card = skillCards[i]
            const randomTop = mathUtils.getRandomInt(minTop, Math.max(minTop, maxBottom - skillCardHeight))
            const clusterLeft = Math.random() < 0.5
            const edgeVariance = SKILL_REPOSITION_EDGE_VARIANCE
            let visualCenterX = clusterLeft
                ? avgLeftEdge + (Math.random() - 0.5) * edgeVariance
                : avgRightEdge + (Math.random() - 0.5) * edgeVariance
            let left = visualCenterX - halfCardWidth
            left = Math.max(0, Math.min(maxRight - skillCardWidth, left))
            cardPositions.push({ card, x: left, y: randomTop })
        }

        applyRepulsionForces(cardPositions, minTop, maxBottom - skillCardHeight, 0, maxRight - skillCardWidth)
        ensureUniqueXPositions(cardPositions, maxRight)

        for (const p of cardPositions) {
            p.x = Math.max(0, Math.min(maxRight - skillCardWidth, p.x))
            p.y = Math.max(minTop, Math.min(maxBottom - skillCardHeight, p.y))
            p.card.style.left = `${p.x}px`
            p.card.style.top = `${p.y}px`
        }
        console.debug('[CardsController] skill cards repositioned', skillCards.length)
    }

    // Viewport change handler for repositioning selected clones
    function handleViewportChangedForClones() {
        // Find any existing clones and reposition them to scene center
        let scenePlaneEl = scenePlaneElement || elementRegistry.getScenePlane()
        if (!scenePlaneEl) return
        
        const clones = scenePlaneEl.querySelectorAll('[id$="-clone"]')
        clones.forEach(clone => {
            try {
                const sceneRect = scenePlaneEl.getBoundingClientRect()
                const centerX = sceneRect.width / 2
                const cloneWidth = parseFloat(clone.style.width) || 180
                
                // Reposition clone to scene center
                const newCloneLeft = centerX - cloneWidth / 2
                clone.style.left = `${newCloneLeft}px`
                
            } catch (error) {
                console.error('[handleViewportChangedForClones] Error repositioning clone:', error)
                throw error
            }
        })
        
        if (clones.length > 0) {
            console.debug('[CardsController] clones repositioned', clones.length)
        }
    }

    // Set up event listeners with retry mechanism
    const setupEventListeners = () => {
        console.debug('[CardsController] setting up event listeners')
        if (!selectionManager) {
            throw new Error('[useCardsController] selectionManager not available')
        }
        try {
            selectionManager.addEventListener('test-event', () => {})
            selectionManager.eventTarget.dispatchEvent(new CustomEvent('test-event'))
        } catch (error) {
            console.error('[CardsController] event system test failed:', error)
            throw error
        }
        try {
            selectionManager.addEventListener('job-selected', handleJobSelected)
            selectionManager.addEventListener('card-selected', handleCardSelected)
            selectionManager.addEventListener('selection-cleared', handleSelectionCleared)
            selectionManager.addEventListener('cards-unselect-skill', handleCardsUnselectSkill)
            selectionManager.addEventListener('cards-select', handleCardsSelect)
            selectionManager.addEventListener('cards-unselect', handleCardsUnselect)
            selectionManager.addEventListener('cards-scrollIntoView', handleCardsScrollIntoView)
            selectionManager.addEventListener('job-hovered', handleJobHovered)
            selectionManager.addEventListener('hoverCleared', handleHoverCleared)
            window.addEventListener('viewport-changed', handleViewportChangedForClones)
            window.addEventListener('resize', handleViewportChangedForClones)
            window._cardsControllerListenersReady = true
            window._cardsControllerSelectionManagerId = selectionManager.instanceId
            console.debug('[CardsController] event listeners ready')
            
            return true
        } catch (error) {
            console.error('[useCardsController] ❌ Failed to set up event listeners:', error)
            throw error
        }
    }
    
    // CRITICAL FIX: Use window.selectionManager instead of imported selectionManager
    // This ensures we use the same singleton instance that's available globally
    const setupEventListenersFixed = () => {
        console.debug('[CardsController] setting up event listeners (fixed)')
        const globalSelectionManager = window.selectionManager
        if (!globalSelectionManager) {
            console.error('[CardsController] window.selectionManager not available')
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
        
        if (window.selectionManager) {
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
        if (!window._cardsControllerListenersReady && window.selectionManager) {
            console.log('[useCardsController] Retrying event listener setup in onMounted...')
            setupEventListenersFixed()
        }
    })
    
    // Pre-create all clones at startup
    async function preCreateAllClones() {
        let scenePlaneEl = scenePlaneElement || elementRegistry.getScenePlane()
        if (!scenePlaneEl) return
        
        // // Add a debug element to verify this function ran
        // const debugEl = document.createElement('div')
        // debugEl.id = 'pre-creation-debug'
        // debugEl.textContent = 'Pre-creation ran'
        // document.body.appendChild(debugEl)
        
        // Pre-create clones for all jobs
        for (let jobNumber = 0; jobNumber < jobs.length; jobNumber++) {
            const originalCard = cardRegistry.getCardElement(jobNumber)
            if (!originalCard) {
                console.warn(`[preCreateAllClones] Original card not found for job ${jobNumber}`)
                continue
            }
            
            const cloneId = `${originalCard.id}-clone`
            
            // Create clone
            const clone = originalCard.cloneNode(true)
            clone.id = cloneId
            clone.classList.add('clone')
            clone.classList.add('selected') // Clones are always in selected state
            clone.classList.remove('hovered')
            clone.classList.remove('hasClone')
            clone.setAttribute('data-sceneZ', String(zUtils.FLOCK_SELECTED_CLONE_Z)) // Selected clone Z (flock: -10), not subject to motion parallax
            
            // CRITICAL: Copy original card's computed width to clone's style
            const originalRect = originalCard.getBoundingClientRect()
            clone.style.width = `${originalRect.width}px`
            
            // Set clone positioning
            const originalComputedStyle = window.getComputedStyle(originalCard)
            const cardWidth = parseFloat(originalComputedStyle.width) || 180
            const cardHeight = parseFloat(originalComputedStyle.height) || 100
            const originalTop = originalCard.style.top || originalComputedStyle.top || '0px'
            
            // CRITICAL: Position clone centerX = bullsEye centerX
            // cDiv-clone.left = bullsEye.center.x - cDiv.width/2
            let bullsEyeCenterX = 0
            if (bullsEyeService && bullsEyeService.getCenter) {
                const bullsEyeCenter = bullsEyeService.getCenter()
                bullsEyeCenterX = bullsEyeCenter ? bullsEyeCenter.x : 0
                console.log(`[preCreateAllClones] Got bullsEye center from service: ${bullsEyeCenterX}`)
            } else {
                // Fallback: assume scene center at viewport center
                const sceneContainer = elementRegistry.getSceneContainer()
                if (sceneContainer) {
                    const rect = sceneContainer.getBoundingClientRect()
                    bullsEyeCenterX = rect.width / 2
                } else {
                    console.warn(`[preCreateAllClones] No bullsEye service or scene container, using x=0`)
                }
            }
            const cloneLeft = bullsEyeCenterX - (cardWidth / 2)
            clone.style.setProperty('left', `${cloneLeft}px`, 'important')
            clone.style.setProperty('width', `${cardWidth}px`, 'important')
            clone.style.setProperty('height', `${cardHeight}px`, 'important')
            clone.style.setProperty('top', originalTop, 'important')
            clone.style.setProperty('position', 'absolute', 'important')
            clone.style.setProperty('z-index', '99', 'important')
            
            
            // CRITICAL: Ensure clone gets full selected styling
            // Remove any copied styling that interferes with selected state
            clone.style.removeProperty('border')
            clone.style.removeProperty('outline')
            clone.style.removeProperty('box-shadow')
            clone.style.removeProperty('filter')
            clone.style.removeProperty('background-color')
            clone.style.removeProperty('color')
            clone.style.removeProperty('padding')
            clone.style.removeProperty('border-radius')
            
            // CRITICAL: Force selected styling to override any CSS variables or inherited styles
            clone.style.setProperty('filter', 'none', 'important') // Override parallax filter
            clone.style.setProperty('border', '2px solid purple', 'important')
            clone.style.setProperty('outline', 'none', 'important')
            clone.style.setProperty('box-shadow', '0 0 0 3px white, 0 0 0 8px purple, 0 3px 12px rgba(128, 0, 128, 0.4)', 'important')
            
            // Initially hide the clone
            clone.style.setProperty('display', 'none', 'important')
            
            clone.title = `CLONE of Job ${jobNumber}`
            
            // Append as last child of container so clone displays over everything else
            scenePlaneEl.appendChild(clone)
            
            // CRITICAL: Apply color palette to clone for proper selected styling
            try {
                await applyPaletteToElement(clone)
                } catch (error) {
                console.error(`[preCreateAllClones] ❌ Failed to apply palette to clone ${jobNumber}:`, error)
                throw error
            }
            
            // Add click handler: deselect if this clone is selected, else select (unified selectedCard)
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

            // Removed debug output
        }
        
        // Clones pre-created
        
        // Clear element registry cache  
        elementRegistry.clearAllCache()
    }

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
                hideJobClone(previousCard.jobNumber)
                showJobOriginal(previousCard.jobNumber)
            } else {
                removeSkillCardClone(previousCard.skillCardId)
                showSkillCardOriginal(previousCard.skillCardId)
            }
        }

        if (card.type === 'biz') {
            hideJobOriginal(card.jobNumber)
            const cloneId = `biz-card-div-${card.jobNumber}-clone`
            if (!document.getElementById(cloneId)) {
                createSelectedClone(card.jobNumber).then(() => {
                    setTimeout(() => scrollCDivHeaderIntoView(card.jobNumber), 100)
                })
            } else {
                showJobClone(card.jobNumber)
                setTimeout(() => scrollCDivHeaderIntoView(card.jobNumber), 100)
            }
        } else {
            // Skill selected: show only in resume listing; do not show selected clone in scene (dual in scene stays unselected)
            if (previousCard?.type === 'skill' && previousCard.skillCardId !== card.skillCardId) {
                removeSkillCardClone(previousCard.skillCardId)
                showSkillCardOriginal(previousCard.skillCardId)
            }
            // Do not create skill card clone or hide original — scene keeps skill cards in place
        }
    }

    function handleCardsSelect() {}

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
        hideAllClones()
        showAllOriginals()
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
            // CRITICAL: Store original position before hiding
            if (!originalCard._originalLeft) {
                originalCard._originalLeft = originalCard.style.left || getComputedStyle(originalCard).left
                originalCard._originalTop = originalCard.style.top || getComputedStyle(originalCard).top
                originalCard._originalPosition = originalCard.style.position || getComputedStyle(originalCard).position
                console.log(`[hideJobOriginal] Stored original position: left=${originalCard._originalLeft}, top=${originalCard._originalTop}`)
            }
            
            // CRITICAL: Use multiple hiding methods to ensure original is completely hidden
            originalCard.style.setProperty('display', 'none', 'important')
            originalCard.style.setProperty('visibility', 'hidden', 'important')
            originalCard.style.setProperty('opacity', '0', 'important')
            originalCard.style.setProperty('z-index', '-9999', 'important')
            originalCard.style.setProperty('pointer-events', 'none', 'important')
            originalCard.classList.add('force-hidden-for-clone')
            console.log(`[hideJobOriginal] ✅ Aggressively hidden original card for job ${jobNumber}`)
            console.log(`[hideJobOriginal] Computed display after hiding:`, window.getComputedStyle(originalCard).display)
        } else {
            console.error(`[hideJobOriginal] ❌ Original card not found for job ${jobNumber}`)
        }
    }
    
    function showJobOriginal(jobNumber) {
        const originalCard = cardRegistry.getCardElement(jobNumber)
        if (originalCard) {
            // CRITICAL: Restore original position first, then visibility
            if (originalCard._originalLeft) {
                originalCard.style.setProperty('left', originalCard._originalLeft, 'important')
                originalCard.style.setProperty('top', originalCard._originalTop, 'important')
                originalCard.style.setProperty('position', originalCard._originalPosition, 'important')
                console.log(`[showJobOriginal] Restored original position: left=${originalCard._originalLeft}, top=${originalCard._originalTop}`)
            }
            
            // CRITICAL: Restore all hidden properties
            originalCard.style.removeProperty('display')
            originalCard.style.removeProperty('visibility')
            originalCard.style.removeProperty('opacity')
            originalCard.style.removeProperty('z-index')
            originalCard.style.removeProperty('pointer-events')
            originalCard.classList.remove('force-hidden-for-clone')
            console.log(`[showJobOriginal] ✅ Fully restored original card for job ${jobNumber}`)
        }
    }
    
    function hideJobClone(jobNumber) {
        const clone = document.getElementById(`biz-card-div-${jobNumber}-clone`)
        
        if (clone) {
            clone.style.setProperty('display', 'none', 'important')
        }
        
        console.log(`[hideJobClone] ✅ Hidden clone for job ${jobNumber}`)
    }
    
    function showJobClone(jobNumber) {
        const clone = document.getElementById(`biz-card-div-${jobNumber}-clone`)
        if (!clone) {
            console.log(`❌ Clone not found for job ${jobNumber}`)
            return
        }
        clone.style.removeProperty('display')
        clone.style.setProperty('display', 'block', 'important')
        // Re-append so clone is last child and displays over everything else
        const scenePlaneEl = scenePlaneElement || elementRegistry.getScenePlane()
        if (scenePlaneEl && clone.parentNode === scenePlaneEl) {
            scenePlaneEl.appendChild(clone)
        }
    }
    
    function hideAllClones() {
        for (let jobNumber = 0; jobNumber < jobs.length; jobNumber++) {
            hideJobClone(jobNumber)
        }
        console.log(`[hideAllClones] ✅ Hidden all clones`)
    }
    
    function showAllOriginals() {
        for (let jobNumber = 0; jobNumber < jobs.length; jobNumber++) {
            showJobOriginal(jobNumber)
        }
        console.log(`[showAllOriginals] ✅ Shown all original cards`)
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
                    block: 'center',  // Center header with space above/below
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
                block: 'center',  // Center header with space above/below
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
    
    async function createSelectedClone(jobNumber) {
        console.log(`[createSelectedClone] 🚀 Starting clone creation for job ${jobNumber}`)
        
        let scenePlaneEl = scenePlaneElement || elementRegistry.getScenePlane()
        if (!scenePlaneEl) {
            console.error('[createSelectedClone] scene-plane not found for clone creation')
            return
        }
        
        // Find the original card using registry first
        let originalCard = cardRegistry.getCardElement(jobNumber)
        if (!originalCard) {
            const originalCardId = createBizCardDivId(jobNumber)
            originalCard = document.getElementById(originalCardId)
        }
        if (!originalCard) {
            console.warn(`[useCardsController] Original card not found for job ${jobNumber}`)
            return
        }
        
        // Check if clone already exists
        const cloneId = `${originalCard.id}-clone`
        if (document.getElementById(cloneId)) {
            console.log(`[useCardsController] Clone already exists: ${cloneId}`)
            return
        }
        
        console.log(`[createSelectedClone] 🎯 About to hide original card: ${originalCard.id}`)
        
        // CRITICAL: Simply hide original card with display: none
        originalCard.classList.add('hasClone')
        
        // Store original display value
        originalCard._originalDisplay = originalCard.style.display || ''
        
        // Set display: none with maximum priority
        originalCard.style.display = 'none'
        originalCard.style.setProperty('display', 'none', 'important')
        
        // Immediate verification
        const computedStyle = window.getComputedStyle(originalCard)
        console.log(`[createSelectedClone] After hiding attempt:`)
        console.log(`  inline display: ${originalCard.style.display}`)
        console.log(`  computed display: ${computedStyle.display}`)
        
        // If it's still not hidden, use setAttribute to override everything
        if (computedStyle.display !== 'none') {
            console.error(`🚨 Display hiding failed! Computed display is still: ${computedStyle.display}`)
            console.log(`🚨 Using setAttribute to force hide...`)
            const currentStyle = originalCard.getAttribute('style') || ''
            originalCard.setAttribute('style', currentStyle + '; display: none !important;')
            
            // Check again
            const newComputedStyle = window.getComputedStyle(originalCard)
            console.log(`  After setAttribute - computed display: ${newComputedStyle.display}`)
        } else {
            console.log(`[createSelectedClone] ✅ Original card successfully hidden`)
        }
        
        // MutationObserver removed - it was interfering with simple display:none hiding
        
        console.log(`[useCardsController] ✅ Hidden original card ${originalCard.id} BEFORE clone creation:`, {
            display: originalCard.style.display,
            visibility: originalCard.style.visibility,
            opacity: originalCard.style.opacity,
            hasClone: originalCard.classList.contains('hasClone'),
            computedDisplay: window.getComputedStyle(originalCard).display
        })
        
        // Debug all jobs - original card analysis before hiding
        console.log(`[DEBUG] Job#${jobNumber} ANALYSIS - Original card element:`, originalCard)
        console.log(`[DEBUG] Job#${jobNumber} ANALYSIS - All styles:`, originalCard.style.cssText)
        console.log(`[DEBUG] Job#${jobNumber} ANALYSIS - All classes:`, originalCard.className)
        console.log(`[DEBUG] Job#${jobNumber} ANALYSIS - Parent element:`, originalCard.parentElement?.id)
        
        // Verify hiding worked immediately
        const hiddenStyle = window.getComputedStyle(originalCard)
        console.log(`[DEBUG] Job#${jobNumber} Original card hiding verification:`)
        console.log(`  inline display: ${originalCard.style.display}`)
        console.log(`  computed display: ${hiddenStyle.display}`)
        console.log(`  computed visibility: ${hiddenStyle.visibility}`)
        console.log(`  computed opacity: ${hiddenStyle.opacity}`)
        
        if (hiddenStyle.display !== 'none') {
            console.error(`🚨 HIDING FAILED! Original card still has computed display: ${hiddenStyle.display}`)
            // Force hide even more aggressively
            originalCard.setAttribute('style', 'display: none !important; visibility: hidden !important; opacity: 0 !important; position: absolute !important; left: -9999px !important; top: -9999px !important;')
            console.log(`[DEBUG] Applied aggressive style override - new computed display: ${window.getComputedStyle(originalCard).display}`)
        }
        
        // Create deep clone AFTER hiding original
        const clone = originalCard.cloneNode(true)
        clone.id = cloneId
        clone.classList.add('selected')
        clone.classList.add('clone') // CRITICAL: Add .clone class for validation selectors
        clone.classList.remove('hovered')
        clone.classList.remove('hasClone') // Remove hasClone class from clone
        clone.setAttribute('data-sceneZ', String(zUtils.FLOCK_SELECTED_CLONE_Z)) // Selected clone Z (flock: -10), not subject to motion parallax
        
        // CRITICAL: Copy original card's computed width to clone's style
        const originalRect = originalCard.getBoundingClientRect()
        clone.style.width = `${originalRect.width}px`
        
        // Ensure clone is visible (override any !important hiding styles that might have been copied)
        clone.style.removeProperty('display')
        clone.style.removeProperty('visibility') 
        clone.style.removeProperty('opacity')
        // Use !important to override any inherited !important hiding styles
        clone.style.setProperty('display', 'block', 'important')
        clone.style.setProperty('visibility', 'visible', 'important')
        clone.style.setProperty('opacity', '1', 'important')
        clone.style.setProperty('z-index', '99', 'important')
        clone.style.setProperty('position', 'absolute', 'important')
        clone.style.setProperty('filter', 'none', 'important') // No depth filter; clone not subject to parallax
        
        // Position clone at scene left edge (x = 0) with same vertical position as original
        const leftPos = '0px' // Position at left edge of scene
        
        // Get the original card's positioning - check multiple sources
        const originalComputedStyle = window.getComputedStyle(originalCard)
        const originalTop = originalCard.style.top || originalComputedStyle.top || originalCard.getAttribute('data-sceneTop') || '0px'
        const originalHeight = originalCard.style.height || originalComputedStyle.height || originalCard.getAttribute('data-sceneHeight') || 'auto'
        
        // Always explicitly set the positioning to match original
        clone.style.setProperty('left', leftPos, 'important')
        clone.style.setProperty('top', originalTop, 'important')
        clone.style.setProperty('height', originalHeight, 'important')
        
        console.log(`[useCardsController] Clone positioned: left=${leftPos}, top=${originalTop}, height=${originalHeight}`)
        console.log(`[DEBUG] Original card positioning: style.top=${originalCard.style.top}, computed.top=${originalComputedStyle.top}, data-sceneTop=${originalCard.getAttribute('data-sceneTop')}`)
        // z-index already set above with !important
        
        // Get sceneZ from clone to verify it was copied
        const cloneSceneZ = clone.getAttribute('data-sceneZ')
        console.log(`[useCardsController] Clone sceneZ value: ${cloneSceneZ}`)
        
        // Add visual indicator to distinguish clone from original
        clone.style.border = '3px solid #ff6b6b' // Red border for debugging
        clone.title = `CLONE of Job ${jobNumber} (sceneZ: ${cloneSceneZ})` // Tooltip to identify clone with sceneZ
        
        // Append as last child of container so clone displays over everything else
        scenePlaneEl.appendChild(clone)
        
        // CRITICAL: Clear element registry cache so color palette system can find the new clone
        elementRegistry.clearAllCache()
        
        // IMMEDIATE VERIFICATION: Check that clone is visible and original is hidden
        setTimeout(() => {
            const originalComputedStyle = window.getComputedStyle(originalCard)
            const cloneComputedStyle = window.getComputedStyle(clone)
            
            console.log(`[IMMEDIATE CHECK] Job ${jobNumber} - 10ms after clone creation:`)
            console.log(`  Original computed display: ${originalComputedStyle.display}`)
            console.log(`  Clone computed display: ${cloneComputedStyle.display}`)
            
            // If original is still visible, try to force hide it again
            if (originalComputedStyle.display !== 'none') {
                console.error(`🚨 Original card STILL VISIBLE after hiding! Forcing hide again...`)
                originalCard.style.cssText = 'display: none !important; visibility: hidden !important; opacity: 0 !important; position: absolute !important; left: -9999px !important; top: -9999px !important; z-index: -9999 !important; width: 0 !important; height: 0 !important;'
            }
        }, 10)
        
        // VERIFICATION: Check that clone is visible and original is hidden
        setTimeout(() => {
            const originalComputedStyle = window.getComputedStyle(originalCard)
            const cloneComputedStyle = window.getComputedStyle(clone)
            
            const originalVisible = originalComputedStyle.display !== 'none'
            const cloneVisible = cloneComputedStyle.display !== 'none'
            
            console.log(`[useCardsController] 🔍 Clone creation verification for job ${jobNumber}:`)
            console.log(`   Original visible: ${originalVisible} (should be false)`)
            console.log(`   Clone visible: ${cloneVisible} (should be true)`)
            console.log(`   Both visible: ${originalVisible && cloneVisible} ${originalVisible && cloneVisible ? '⚠️ ISSUE!' : '✅ OK'}`)
            
            // DEBUGGING: Check clone positioning to see if it's off-screen
            const cloneRect = clone.getBoundingClientRect()
            const sceneRect = scenePlaneEl ? scenePlaneEl.getBoundingClientRect() : null
            console.log(`[DEBUG] Clone positioning for job ${jobNumber}:`)
            console.log(`   Clone getBoundingClientRect:`, cloneRect)
            console.log(`   Clone computed left: ${cloneComputedStyle.left}`)
            console.log(`   Clone computed top: ${cloneComputedStyle.top}`)
            console.log(`   Clone inline left: ${clone.style.left}`)
            console.log(`   Clone inline top: ${clone.style.top}`)
            console.log(`   Scene getBoundingClientRect:`, sceneRect)
            console.log(`   Clone in viewport: x=${cloneRect.x >= 0 && cloneRect.x < window.innerWidth}, y=${cloneRect.y >= 0 && cloneRect.y < window.innerHeight}`)
            console.log(`   Clone dimensions: width=${cloneRect.width}, height=${cloneRect.height}`)
            
            // If clone is off-screen or has invalid positioning, force it to a visible location
            if (cloneRect.x < 0 || cloneRect.y < 0 || cloneRect.x > window.innerWidth || cloneRect.y > window.innerHeight || cloneRect.width === 0 || cloneRect.height === 0) {
                console.warn(`[DEBUG] Clone appears to be off-screen or invalid, forcing to visible position...`)
                clone.style.setProperty('left', '50px', 'important')
                clone.style.setProperty('top', '50px', 'important')
                clone.style.setProperty('width', '180px', 'important')
                clone.style.setProperty('height', '100px', 'important')
                console.log(`[DEBUG] Forced clone to position: left=50px, top=50px`)
            }
            
            if (originalVisible && cloneVisible) {
                console.error(`🚨 CRITICAL: Both original and clone are visible!`)
                console.log(`   Original computed display: ${originalComputedStyle.display}`)
                console.log(`   Original inline display: ${originalCard.style.display}`)
                console.log(`   Original style attribute: ${originalCard.getAttribute('style')}`)
                console.log(`   Original visibility: ${originalComputedStyle.visibility}`)
                console.log(`   Original opacity: ${originalComputedStyle.opacity}`)
                console.log(`   Clone computed display: ${cloneComputedStyle.display}`)
                console.log(`   Clone inline display: ${clone.style.display}`)
                
                // Additional CSS analysis
                console.log(`[DEBUG] Job#${jobNumber} DETAILED CSS ANALYSIS:`)
                console.log(`   Original getBoundingClientRect:`, originalCard.getBoundingClientRect())
                console.log(`   Clone getBoundingClientRect:`, clone.getBoundingClientRect())
                console.log(`   Original offsetParent:`, originalCard.offsetParent)
                console.log(`   Clone offsetParent:`, clone.offsetParent)
                console.log(`   Original classes:`, originalCard.className)
                console.log(`   Clone classes:`, clone.className)
                
                // Try to force hide again
                console.log(`[DEBUG] Job#${jobNumber} - Attempting FORCE HIDE again...`)
                originalCard.style.cssText += '; display: none !important; visibility: hidden !important; opacity: 0 !important; position: absolute; left: -9999px !important;'
                console.log(`[DEBUG] Job#${jobNumber} - After force hide, computed display:`, window.getComputedStyle(originalCard).display)
            } else if (!originalVisible && cloneVisible) {
                console.log(`✅ Clone creation successful - original hidden, clone visible`)
            }
        }, 10) // Small delay to ensure DOM updates are complete
        
        // Add click handler: deselect if this clone is selected, else select (unified selectedCard)
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
            console.error(`[useCardsController] Could not apply palette to clone:`, error)
            throw error
        }
        
        console.log(`[useCardsController] ✅ Created clone for job ${jobNumber}`)
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
            // Restore original display value
            const originalDisplay = card._originalDisplay
            if (originalDisplay !== undefined) {
                card.style.display = originalDisplay
                delete card._originalDisplay
            } else {
                card.style.removeProperty('display')
            }
            
            // Remove clone-related classes
            card.classList.remove('hasClone')
            card.classList.remove('force-hidden-for-clone')
            
            console.log(`[removeAllClones] ✅ Restored original card ${card.id} with display: ${card.style.display || 'default'}`)
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
            
            // MutationObserver cleanup removed - no longer using observers
            
            // Fully restore original card visibility (override !important declarations)
            originalCard.style.setProperty('display', 'block', 'important')
            originalCard.style.setProperty('visibility', 'visible', 'important')
            originalCard.style.setProperty('opacity', '1', 'important')
            originalCard.style.removeProperty('position')
            originalCard.style.removeProperty('left')
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
        clone.setAttribute('data-sceneZ', String(zUtils.FLOCK_SELECTED_CLONE_Z))
        clone.style.removeProperty('display')
        clone.style.setProperty('display', 'block', 'important')
        clone.style.setProperty('visibility', 'visible', 'important')
        clone.style.setProperty('opacity', '1', 'important')
        clone.style.setProperty('z-index', '99', 'important')
        clone.style.setProperty('position', 'absolute', 'important')
        clone.style.setProperty('filter', 'none', 'important')
        clone.style.setProperty('left', original.style.left || '0px', 'important')
        clone.style.setProperty('top', original.style.top || '0px', 'important')

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
            console.log('   - window.selectionManager exists:', !!window.selectionManager)
            console.log('   - window.selectionManager instanceId:', window.selectionManager?.instanceId)
            console.log('   - Same instance:', selectionManager === window.selectionManager)
            
            console.log('\n2. Checking event listener setup:')
            console.log('   - _cardsControllerListenersReady:', !!window._cardsControllerListenersReady)
            console.log('   - _cardsControllerSelectionManagerId:', window._cardsControllerSelectionManagerId)
            console.log('   - handleJobSelected type:', typeof handleJobSelected)
            
            console.log('\n3. Checking resume system:')
            console.log('   - window.resumeListController exists:', !!window.resumeListController)
            console.log('   - resumeListController.handleBizResumeDivClickEvent type:', typeof window.resumeListController?.handleBizResumeDivClickEvent)
            
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
                resumeControllerOk: !!window.resumeListController,
                resumeDivCount: resumeDivs.length,
                cardDivCount: cardDivs.length,
                handleJobSelectedType: typeof handleJobSelected,
                listenersReady: !!window._cardsControllerListenersReady,
                sameInstance: selectionManager === window.selectionManager
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
            if (window.selectionManager?.selectJobNumber) {
                window.selectionManager.selectJobNumber(8, 'quick-test')
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

    return {
        isInitialized,
        bizCardDivs,
        initializeCardsController,
        preCreateAllClones
    }
}