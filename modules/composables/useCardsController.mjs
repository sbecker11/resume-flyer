import { ref, onMounted, onUnmounted } from 'vue'
import { jobs } from '@/static_content/jobs/jobs.mjs'
import { selectionManager } from '@/modules/core/selectionManager.mjs'
import { useTimeline, initialize } from '@/modules/composables/useTimeline.mjs'
import { useColorPalette, applyPaletteToElement, readyPromise } from '@/modules/composables/useColorPalette.mjs'
import * as dateUtils from '@/modules/utils/dateUtils.mjs'
import { createBizCardDivId } from '@/modules/utils/bizCardUtils.mjs'
import { linearInterp } from '@/modules/utils/mathUtils.mjs'
import * as mathUtils from '@/modules/utils/mathUtils.mjs'
import * as zUtils from '@/modules/utils/zUtils.mjs'
import * as filters from '@/modules/core/filters.mjs'

// Timeline constants (matching Timeline.vue)
const TIMELINE_PADDING_TOP = 0;

// Simple CardsController initialization for Vue setup
export function useCardsController() {
    const isInitialized = ref(false)
    const bizCardDivs = ref([])
    
    // Get timeline functions
    const { getPositionForDate, getDateForPosition, isInitialized: timelineInitialized } = useTimeline()
    
    // Get color palette functions
    const { colorPalettes, currentPaletteFilename } = useColorPalette()

    async function initializeCardsController() {
        console.log('[DEBUG] initializeCardsController called, isInitialized:', isInitialized.value)
        if (isInitialized.value) {
            console.log('[DEBUG] Already initialized, returning early')
            return
        }

        try {
            console.log('[CardsController] Initializing with Vue composable pattern...')
            
            // Initialize timeline first
            if (!timelineInitialized.value) {
                console.log('[CardsController] Initializing timeline...')
                initialize(jobs)
            }
            
            // Get the scene plane element
            const scenePlaneElement = document.getElementById('scene-plane')
            if (!scenePlaneElement) {
                console.warn('[CardsController] scene-plane element not found, retrying...')
                setTimeout(initializeCardsController, 500)
                return
            }

            // Clear any existing cards
            const existingCards = scenePlaneElement.querySelectorAll('.biz-card-div')
            console.log(`[DEBUG] Found ${existingCards.length} existing cards to remove`)
            existingCards.forEach(card => card.remove())

            // Wait for palettes to be ready before applying colors
            console.log('[CardsController] Waiting for palettes to be ready...')
            await readyPromise
            console.log('[CardsController] Palettes are ready, creating cards...')
            
            // Create business cards for each job
            const cards = []
            for (let index = 0; index < jobs.length; index++) {
                const job = jobs[index]
                const card = createBizCardDiv(job, index, scenePlaneElement)
                if (card) {
                    scenePlaneElement.appendChild(card)
                    cards.push(card)
                    
                    // Apply color palette to the card
                    try {
                        await applyPaletteToElement(card)
                        // console.log(`[CardsController] Applied palette to job ${index}`)
                    } catch (error) {
                        console.warn(`[CardsController] Could not apply palette to job ${index}:`, error)
                    }
                }
            }

            bizCardDivs.value = cards
            
            // Yearly grid lines removed per user request
            
            isInitialized.value = true
            
            console.log(`[CardsController] ✅ Created ${cards.length} business cards`)
            
        } catch (error) {
            console.error('[CardsController] Initialization failed:', error)
            // Retry after a delay
            setTimeout(initializeCardsController, 1000)
        }
    }

    function createBizCardDiv(job, jobNumber, scenePlane) {
        const cardId = createBizCardDivId(jobNumber)
        
        // Check if card already exists in DOM
        if (document.getElementById(cardId)) {
            console.log(`[DEBUG] Card ${cardId} already exists, skipping creation`)
            return null
        }
        
        const card = document.createElement('div')
        card.className = 'biz-card-div'
        card.id = cardId
        card.setAttribute('data-job-number', jobNumber)
        
        // Calculate position relative to scene-plane (absolute positioning)
        // Use fixed coordinates that can extend beyond scene container width
        const baseOffsetFromSceneLeft = 50  
        const cardSpacing = 120  
        let x = baseOffsetFromSceneLeft + (jobNumber % 3) * cardSpacing
        
        // Cards positioned at: 50px, 170px, 290px...
        // When scene container is narrow, cards at higher x values should overflow
        let y = 100 // Default fallback
        
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
        }
        
        // Store scene positions as data attributes (for original CardsController compatibility)
        card.setAttribute('data-sceneLeft', x)
        card.setAttribute('data-sceneTop', y)  // This will be updated later in height calculation
        card.setAttribute('scene-left', x)
        card.setAttribute('scene-top', y)
        
        // Add color index for palette application
        card.setAttribute('data-color-index', jobNumber) // Use jobNumber as color index
        
        // Add Z-depth for parallax effects (using original random approach)
        const sceneZ = mathUtils.getRandomInt(zUtils.ALL_CARDS_Z_MIN, zUtils.ALL_CARDS_Z_MAX);
        card.setAttribute('data-sceneZ', sceneZ)
        
        // Apply sceneZ-based depth filters (brightness, blur, contrast, saturation)
        card.style.filter = filters.get_filterStr_from_z(sceneZ)
        
        // Position only - styling is handled by CSS
        card.style.left = `${x}px`
        card.style.top = `${y}px`
        
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
                
                // Enforce minimum height (from archived CardsController)
                const MIN_HEIGHT = 180
                if (sceneHeight < MIN_HEIGHT) {
                    sceneHeight = MIN_HEIGHT
                }
                
                // Apply calculated height
                card.style.height = `${sceneHeight}px`
                card.setAttribute('data-sceneHeight', sceneHeight)
                card.setAttribute('data-sceneTop', sceneTop)
                card.setAttribute('data-sceneBottom', sceneBottom)
                
                console.log(`[CardsController] Job ${jobNumber} (${job.employer}): ${job.start} to ${job.end || 'Present'} = ${sceneHeight}px height`)
                console.log(`[CardsController] DEBUG - Parsed dates:`, {
                    jobStart: job.start,
                    jobEnd: job.end,
                    jobStartDate: jobStartDate.toISOString().slice(0, 10),
                    jobEndDate: jobEndDate.toISOString().slice(0, 10)
                })
                // Verify timeline calculations with reverse function
                const reversedStartDate = getDateForPosition(sceneBottom)
                const reversedEndDate = getDateForPosition(sceneTop)
                
                console.log(`[CardsController] DEBUG - Timeline positions:`, {
                    sceneTop: sceneTop,
                    sceneBottom: sceneBottom,
                    sceneHeight: sceneHeight,
                    startDateAsYear: jobStartDate.getFullYear() + jobStartDate.getMonth()/12 + jobStartDate.getDate()/365.25/12,
                    endDateAsYear: jobEndDate.getFullYear() + jobEndDate.getMonth()/12 + jobEndDate.getDate()/365.25/12
                })
                console.log(`[CardsController] DEBUG - Reverse calculation verification:`, {
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
        }

        // Add comprehensive content including job number and description
        const description = job.Description ? job.Description.substring(0, 200) + '...' : '';
        const skillCount = job['job-skills'] ? Object.keys(job['job-skills']).length : 0;
        
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
            console.warn(`[CardsController] Could not calculate reverse dates for job ${jobNumber}:`, error)
        }
        
        card.innerHTML = `
            <div class="biz-details-employer" style="font-weight: bold; padding: 2px;">
                ${job.employer || 'Unknown Employer'}
            </div>
            <div class="biz-details-role" style="font-weight: bold; padding: 2px;">
                ${job.role || 'Unknown Role'}
            </div>
            <div class="biz-details-dates" style="font-weight: bold; padding: 2px; display: flex; justify-content: space-between;">
                <span>${originalJobStartDate ? originalJobStartDate.toISOString().slice(0, 10) : 'N/A'} - ${originalJobEndDate ? originalJobEndDate.toISOString().slice(0, 10) : 'N/A'}</span>
                <span> #${jobNumber} z:${sceneZ}</span>
            </div>
            <div class="job-stats" style="font-size: 10px; color: #666; margin-top: 4px;">
                Skills: ${skillCount} | References: ${job.references ? job.references.length : 0}
            </div>
        `
        
        // Red debug lines commented out
        // if (sceneTopValue !== 'N/A' && sceneBottomValue !== 'N/A') {
        //     // Get the scene plane element
        //     const scenePlane = document.getElementById('scene-plane');
        //     if (scenePlane) {
        //         // Get viewport width for line end
        //         const lineWidth = window.innerWidth;
        //         
        //         // Create red line for job END date
        //         const topLine = document.createElement('div');
        //         topLine.className = `debug-line-top-job-${jobNumber}`;
        //         topLine.style.cssText = `
        //             position: absolute;
        //             left: 0px;
        //             top: ${sceneTopValue}px;
        //             width: ${lineWidth}px;
        //             height: 2px;
        //             background-color: red;
        //             z-index: 998;
        //             pointer-events: none;
        //         `;
        //         scenePlane.appendChild(topLine);
        //         
        //         // Add job number and end date label 10px above end date line
        //         const endDateStr = (job.end === "CURRENT_DATE" || !job.end) ? "CURRENT" : job.end;
        //         const topLabel = document.createElement('div');
        //         topLabel.className = `debug-label-top-job-${jobNumber}`;
        //         topLabel.textContent = `#${jobNumber} ${endDateStr}`;
        //         topLabel.style.cssText = `
        //             position: absolute;
        //             left: 30px;
        //             top: ${sceneTopValue - 20}px;
        //             font-size: 16px;
        //             font-weight: bold;
        //             color: red;
        //             z-index: 999;
        //             pointer-events: none;
        //         `;
        //         scenePlane.appendChild(topLabel);
                
                // Bottom lines (start dates) commented out - showing only end date lines
                // const bottomLine = document.createElement('div');
                // bottomLine.className = `debug-line-bottom-job-${jobNumber}`;
                // bottomLine.style.cssText = `
                //     position: absolute;
                //     left: 0px;
                //     top: ${sceneBottomValue}px;
                //     width: ${lineWidth}px;
                //     height: 3px;
                //     background-color: red;
                //     z-index: 999;
                //     pointer-events: none;
                // `;
                // scenePlane.appendChild(bottomLine);
                
                // Bottom labels (start dates) commented out - showing only end date labels
                // const bottomLabel = document.createElement('div');
                // bottomLabel.className = `debug-label-bottom-job-${jobNumber}`;
                // bottomLabel.textContent = `#${jobNumber}`;
                // bottomLabel.style.cssText = `
                //     position: absolute;
                //     left: 30px;
                //     top: ${sceneBottomValue - 15}px;
                //     font-size: 10px;
                //     font-weight: bold;
                //     color: red;
                //     z-index: 1000;
                //     pointer-events: none;
                // `;
        //         // scenePlane.appendChild(bottomLabel);
        //     }
        // }

        // Add click handler
        card.addEventListener('click', () => {
            console.log(`[CardsController] Card clicked: Job ${jobNumber}`)
            if (selectionManager) {
                selectionManager.selectJobNumber(jobNumber, 'CardsController.click')
            }
        })
        
        // Add hover handlers for synchronization with rDivs
        card.addEventListener('mouseenter', () => {
            console.log(`[CardsController] Card hover: Job ${jobNumber}`)
            if (selectionManager) {
                selectionManager.hoverJobNumber(jobNumber, 'CardsController.mouseenter')
            }
        })
        
        card.addEventListener('mouseleave', () => {
            console.log(`[CardsController] Card hover end: Job ${jobNumber}`)
            if (selectionManager) {
                selectionManager.clearHover('CardsController.mouseleave')
            }
        })
        
        return card
    }

    // Viewport change handler for repositioning selected clones
    function handleViewportChangedForClones() {
        // Find any existing clones and reposition them to scene center
        const scenePlaneElement = document.getElementById('scene-plane')
        if (!scenePlaneElement) return
        
        const clones = scenePlaneElement.querySelectorAll('[id$="-clone"]')
        clones.forEach(clone => {
            const sceneRect = scenePlaneElement.getBoundingClientRect()
            const centerX = sceneRect.width / 2
            clone.style.left = `${centerX - (parseFloat(clone.style.width) || 180) / 2}px`
        })
        
        if (clones.length > 0) {
            console.log(`[useCardsController] Repositioned ${clones.length} clones to scene center after viewport change`)
        }
    }

    // Set up selection event listeners for clone management
    onMounted(() => {
        // Delay to ensure DOM is ready
        setTimeout(initializeCardsController, 100)
        
        // Listen for selection events to handle clone creation
        selectionManager.addEventListener('job-selected', handleJobSelected)
        selectionManager.addEventListener('selection-cleared', handleSelectionCleared)
        
        // Listen for hover events to handle cDiv visual feedback
        selectionManager.addEventListener('job-hovered', handleJobHovered)
        selectionManager.addEventListener('hoverCleared', handleHoverCleared)
        
        // Listen for viewport changes to reposition selected clones
        window.addEventListener('viewport-changed', handleViewportChangedForClones)
        window.addEventListener('resize-handle-changed', handleViewportChangedForClones)
        window.addEventListener('resize', handleViewportChangedForClones)
    })
    
    // Clone management functions
    function handleJobSelected(event) {
        const { jobNumber, previousSelection, source } = event.detail
        console.log(`[useCardsController] Job selected: ${jobNumber}, previous: ${previousSelection}, source: ${source}`)
        
        // Clear any existing clones first (handles previous selection)
        if (previousSelection !== null && previousSelection !== jobNumber) {
            console.log(`[useCardsController] Clearing previous selection: ${previousSelection}`)
            removeAllClones()
        }
        
        // Create clone for new selection
        createSelectedClone(jobNumber)
        
        // Implement bidirectional scrolling
        console.log(`[useCardsController] DEBUGGING: Checking bidirectional scroll - source: "${source}", CardsController comparison: ${source !== 'CardsController'}`)
        if (source !== 'CardsController') {
            // If selection came from rDiv side, scroll cDiv into view
            console.log(`[useCardsController] DEBUGGING: Selection from rDiv side, will scroll cDiv into view in 100ms`)
            setTimeout(() => {
                console.log(`[useCardsController] DEBUGGING: Executing delayed cDiv scroll now`)
                scrollCDivIntoView(jobNumber)
            }, 100) // Small delay for DOM updates
        } else {
            console.log(`[useCardsController] DEBUGGING: Selection from cDiv side, skipping cDiv scroll to prevent loop`)
        }
        
        // Always scroll rDiv into view (ResumeListController handles this via its own event listener)
        // This ensures both panels scroll regardless of which side initiated the selection
    }
    
    function handleSelectionCleared(event) {
        console.log('[useCardsController] Selection cleared, removing clones...')
        removeAllClones()
    }
    
    function handleJobHovered(event) {
        const { jobNumber } = event.detail
        console.log(`[useCardsController] Job hovered: ${jobNumber}`)
        
        // Clear previous hover states
        clearAllCardHovers()
        
        // Apply hover class to the corresponding cDiv
        const cardId = createBizCardDivId(jobNumber)
        const card = document.getElementById(cardId)
        if (card && !card.classList.contains('selected')) {
            card.classList.add('hovered')
            console.log(`[useCardsController] Applied hover to card: ${cardId}`)
        }
    }
    
    function handleHoverCleared(event) {
        console.log('[useCardsController] Hover cleared, removing hover from all cards...')
        clearAllCardHovers()
    }
    
    function clearAllCardHovers() {
        const scenePlaneElement = document.getElementById('scene-plane')
        if (!scenePlaneElement) return
        
        // Remove hover class from all cards
        const allCards = scenePlaneElement.querySelectorAll('.biz-card-div')
        allCards.forEach(card => {
            card.classList.remove('hovered')
        })
    }
    
    function scrollCDivIntoView(jobNumber) {
        console.log(`[useCardsController] DEBUGGING: Scrolling to original cDiv timeline position for job ${jobNumber}`)
        
        const cardId = createBizCardDivId(jobNumber)
        console.log(`[useCardsController] DEBUGGING: Looking for original card position: ${cardId}`)
        
        // Always scroll to the original card's timeline position, not the clone
        // The clone is just a visual indicator at scene center, but we want to show
        // where this job sits chronologically in the timeline
        const card = document.getElementById(cardId)
        console.log(`[useCardsController] DEBUGGING: Original card found:`, !!card)
        
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
                        card.style.display = originalDisplay
                        console.log(`[useCardsController] DEBUGGING: Re-hidden card after scroll`)
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
        const cardRect = card.getBoundingClientRect()
        console.log(`[useCardsController] DEBUGGING: Card position:`, {
            top: cardRect.top,
            left: cardRect.left,
            width: cardRect.width,
            height: cardRect.height
        })
        
        // Check if card is already visible
        const sceneContainer = document.getElementById('scene-container')
        if (sceneContainer) {
            const containerRect = sceneContainer.getBoundingClientRect()
            const isVisible = cardRect.top >= containerRect.top && 
                             cardRect.bottom <= containerRect.bottom
            console.log(`[useCardsController] DEBUGGING: Card visible before scroll:`, isVisible)
        }
        
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
            return false
        }
        
        console.log(`[useCardsController] Scrolled cDiv ${cardId} into view`)
        return true
    }
    
    function createSelectedClone(jobNumber) {
        const scenePlaneElement = document.getElementById('scene-plane')
        if (!scenePlaneElement) {
            console.warn('[useCardsController] scene-plane not found for clone creation')
            return
        }
        
        // Find the original card
        const originalCardId = createBizCardDivId(jobNumber)
        const originalCard = document.getElementById(originalCardId)
        if (!originalCard) {
            console.warn(`[useCardsController] Original card not found for job ${jobNumber}`)
            return
        }
        
        // Check if clone already exists
        const cloneId = `${originalCardId}-clone`
        if (document.getElementById(cloneId)) {
            console.log(`[useCardsController] Clone already exists: ${cloneId}`)
            return
        }
        
        // Create deep clone
        const clone = originalCard.cloneNode(true)
        clone.id = cloneId
        clone.classList.add('selected')
        clone.classList.remove('hovered')
        
        // Mark original as having a clone and hide it (keep position unchanged)
        originalCard.classList.add('hasClone')
        originalCard.style.display = 'none'
        
        console.log(`[useCardsController] Hidden original card ${originalCard.id}:`, {
            display: originalCard.style.display,
            hasClone: originalCard.classList.contains('hasClone')
        })
        
        // Position clone at scene center (different from original position)
        const sceneRect = scenePlaneElement.getBoundingClientRect()
        const centerX = sceneRect.width / 2
        clone.style.left = `${centerX - (parseFloat(clone.style.width) || 180) / 2}px`
        clone.style.zIndex = '99' // Above other cards
        
        // Get sceneZ from clone to verify it was copied
        const cloneSceneZ = clone.getAttribute('data-sceneZ')
        console.log(`[useCardsController] Clone sceneZ value: ${cloneSceneZ}`)
        
        // Add visual indicator to distinguish clone from original
        clone.style.border = '3px solid #ff6b6b' // Red border for debugging
        clone.title = `CLONE of Job ${jobNumber} (sceneZ: ${cloneSceneZ})` // Tooltip to identify clone with sceneZ
        
        // Add clone to DOM
        scenePlaneElement.appendChild(clone)
        
        // Add click handler to clone for deselection
        clone.addEventListener('click', () => {
            console.log(`[useCardsController] Clone clicked: clearing selection`)
            if (selectionManager) {
                selectionManager.clearSelection()
            }
        })
        
        // Apply color palette to clone
        try {
            applyPaletteToElement(clone)
        } catch (error) {
            console.warn(`[useCardsController] Could not apply palette to clone:`, error)
        }
        
        console.log(`[useCardsController] ✅ Created clone for job ${jobNumber}`)
    }
    
    function removeAllClones() {
        const scenePlaneElement = document.getElementById('scene-plane')
        if (!scenePlaneElement) return
        
        // Find all clones and remove them
        const clones = scenePlaneElement.querySelectorAll('[id$="-clone"]')
        clones.forEach(clone => {
            clone.remove()
        })
        
        // Restore original cards (find by hasClone class)
        const cardsWithClones = scenePlaneElement.querySelectorAll('.hasClone')
        cardsWithClones.forEach(card => {
            card.classList.remove('hasClone')
            card.style.display = 'block'
            console.log(`[useCardsController] Restored original card ${card.id}`)
        })
        
        console.log(`[useCardsController] ✅ Removed ${clones.length} clones`)
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
        window.removeEventListener('resize-handle-changed', handleViewportChangedForClones)
        window.removeEventListener('resize', handleViewportChangedForClones)
    })

    return {
        isInitialized,
        bizCardDivs,
        initializeCardsController
    }
}