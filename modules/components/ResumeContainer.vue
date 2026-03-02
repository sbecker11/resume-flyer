<script setup>
import { ref, onMounted, watch, computed } from 'vue';
import { jobs } from '@/modules/data/enrichedJobs.mjs';
import { selectionManager } from '@/modules/core/selectionManager.mjs';
import { useColorPalette } from '@/modules/composables/useColorPalette.mjs';
import { useResizeHandle } from '@/modules/composables/useResizeHandle.mjs';
import { useResumeListController } from '@/modules/core/globalServices';


// Get the same percentage as the resize handle
const { scenePercentage } = useResizeHandle();

// Use Vue 3 provide/inject instead of window.resumeListController
const resumeListController = useResumeListController();

// Debug injection
console.log('[ResumeContainer] Resume list controller injected:', !!resumeListController);
console.log('[ResumeContainer] Window fallback available:', !!window.resumeListController);

// Calculate resume percentage as 100 minus scene percentage
const resumePercentage = computed(() => {
  return 100 - Math.round(scenePercentage.value);
});

// Use the color palette composable
const {
  orderedPaletteNames,
  filenameToNameMap,
  currentPaletteFilename,
  setCurrentPalette
} = useColorPalette();

// Debug palette loading
watch(orderedPaletteNames, (names) => {
  console.log('[ResumeContainer] orderedPaletteNames changed:', names);
}, { immediate: true });

watch(currentPaletteFilename, (filename) => {
  console.log('[ResumeContainer] currentPaletteFilename changed:', filename);
}, { immediate: true });

const currentSortRule = ref({ field: 'startDate', direction: 'desc' });

// Watch for changes in the sort rule and apply them
watch(currentSortRule, (newSortRule) => {
  console.log('[ResumeContainer] Sort rule changed:', newSortRule);
  if (resumeListController) {
    resumeListController.applySortRule(newSortRule);
  }
}, { deep: true });

// Watch for changes in the color palette selection and save them
watch(currentPaletteFilename, async (newFilename) => {
  if (newFilename) {
    await setCurrentPalette(newFilename);
  }
});

const sortOptions = ref([
  { value: { field: 'startDate', direction: 'desc' }, text: 'Start Date (Newest First)' },
  { value: { field: 'startDate', direction: 'asc' }, text: 'Start Date (Oldest First)' },
  { value: { field: 'employer', direction: 'asc' }, text: 'Employer (A-Z)' },
  { value: { field: 'role', direction: 'asc' }, text: 'Role (A-Z)' },
]);

// Methods for buttons - these will now call the legacy controller via provide/inject
function selectFirst() {
  console.log("selectFirst button clicked");
  const controller = resumeListController || window.resumeListController;
  if (controller) {
    console.log('[ResumeContainer] Calling goToFirstResumeItem()');
    controller.goToFirstResumeItem();
  } else {
    console.error('[ResumeContainer] ResumeListController not available via provide/inject or window!');
  }
}
function selectLast() {
  console.log("selectLast button clicked");
  const controller = resumeListController || window.resumeListController;
  if (controller) {
    controller.goToLastResumeItem();
  } else {
    console.error('[ResumeContainer] ResumeListController not available for selectLast!');
  }
}
function selectNext() {
  console.log("selectNext button clicked");
  const controller = resumeListController || window.resumeListController;
  if (controller) {
    controller.goToNextResumeItem();
  } else {
    console.error('[ResumeContainer] ResumeListController not available for selectNext!');
  }
}
function selectPrevious() {
  console.log("selectPrevious button clicked");
  const controller = resumeListController || window.resumeListController;
  if (controller) {
    controller.goToPreviousResumeItem();
  } else {
    console.error('[ResumeContainer] ResumeListController not available for selectPrevious!');
  }
}

</script>

<template>
    <div id="resume-content">
        <div id="resume-content-header">
            <p class="intro">Welcome to your resume-flock!</p>
            <div id="color-palette-container" tabindex="-1">
                <select 
                    id="color-palette-selector" 
                    v-model="currentPaletteFilename"
                    tabindex="0"
                >
                    <option v-for="name in orderedPaletteNames" :key="name" :value="Object.keys(filenameToNameMap).find(key => filenameToNameMap[key] === name)">
                        {{ name }}
                    </option>
                </select>
            </div>
            <div id="biz-card-sorting-container" tabindex="-1">
                <select id="biz-resume-div-sorting-selector" v-model="currentSortRule" tabindex="0">
                    <option v-for="option in sortOptions" :key="option.text" :value="option.value">
                        {{ option.text }}
                    </option>
                </select>
            </div>
            <div id="biz-card-controls">
                <button @click="selectFirst" class="biz-card-control-button">First</button>
                <button @click="selectPrevious" class="biz-card-control-button">Prev</button>
                <button @click="selectNext" class="biz-card-control-button">Next</button>
                <button @click="selectLast" class="biz-card-control-button">Last</button>
            </div>
        </div>
        <div id="resume-content-div-wrapper" class="scrollable-container">
            <!-- The content of this div is now entirely managed by the legacy InfiniteScrollingContainer -->
            <div id="resume-content-div"></div>
        </div>
    </div>
</template>


<style scoped>
#resume-content {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 5px;
    overflow: hidden;
    background-color: var(--grey-darkest);
    font-family: sans-serif;
}

#resume-content-header {
    background-color: var(--grey-dark);
    color: white;
    padding: 10px;
    flex-shrink: 0; /* Fits children */
}

#resume-content-div-wrapper {
    flex-grow: 1;
    /* overflow-y is now controlled by the InfiniteScrollingContainer */
    overflow-x: hidden; /* Remove horizontal scrollbar */
    background-color: var(--grey-medium);
    color: black;
    position: relative; /* Needed for the absolute positioning of items by the scroller */
    padding-left: 6px; /* Balance the scrollbar on the right */
    /* overflow is set by InfiniteScrollingContainer.setupContainer() to 'auto' */
}

#resume-content-div {
    background-color: var(--grey-dark-6);
    overflow-x: hidden; /* Remove horizontal scrollbar from content div */
}

/* Custom scrollbar to match the cDiv scrollbar */
#resume-content-div-wrapper::-webkit-scrollbar {
    width: 5px;
}

#resume-content-div-wrapper::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.1);
    border-radius: 4px;
    cursor: ns-resize;
}

#resume-content-div-wrapper::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.3);
    border-radius: 4px;
}

#resume-content-div-wrapper::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.5);
}

#resume-content-footer {
    background-color: var(--grey-medium);
    padding: 10px;
    flex-shrink: 0; /* Fits children */
}

#biz-card-controls {
    display: flex;
    gap: 5px;
    margin-top: 10px;
    width: 100%;
    position: relative; /* Needed for z-index to apply */
    z-index: 100; /* High z-index to ensure it's on top of other elements */
    flex-wrap: wrap; /* Allow wrapping for the 2x2 layout */
}
.biz-card-control-button {
    flex: 1 1 auto;
    min-width: 60px;
    padding: 8px 12px;
    background-color: var(--grey-dark-6);
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: bold;
    transition: background-color 0.2s;
    text-shadow: 1px 1px 1px rgba(0, 0, 0, 0.8);
}

/* 2x2 layout for medium widths */
@container (max-width: 320px) {
    #biz-card-controls .biz-card-control-button {
        flex-basis: calc(50% - 2.5px); /* 2 buttons per row, accounting for gap */
    }
}

/* 1x4 (single column) layout for narrow widths */
@container (max-width: 160px) {
    #biz-card-controls {
        flex-direction: column;
    }
}

.biz-card-control-button:hover {
    background-color: var(--grey-dark-7);
}
#color-palette-container,
#biz-card-sorting-container {
    position: relative;
    display: flex;
    padding: 5px 0;
    width: 100%;
}
#color-palette-selector,
#biz-resume-div-sorting-selector {
    flex: 1 1 auto;
    padding: 8px 12px;
    background-color: var(--grey-dark-6);
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: bold;
    text-shadow: 1px 1px 1px rgba(0, 0, 0, 0.8);
}
#color-palette-selector:hover,
#biz-resume-div-sorting-selector:hover {
    background-color: var(--grey-dark-7);
}
/* rDiv styles moved to global styles section below */

/* .viewer-label styling consolidated in AppContent.vue */
</style>

<style>
/* Global styles for rDivs - not scoped to ensure they apply to dynamically created elements */

/* Base rDiv styling with proper flexbox auto-sizing */
.biz-resume-div {
    /* Flexbox container that sizes to fit content */
    display: flex !important;
    flex-direction: column;
    align-items: stretch; /* Fill width of container */
    justify-content: flex-start; /* Start from top */
    
    /* Auto-sizing properties */
    width: 100%;
    height: auto !important; /* Allow height to grow with content */
    min-height: fit-content;
    max-height: none; /* No height restrictions */
    
    /* Flexbox child behavior */
    flex-shrink: 0; /* Don't shrink smaller than content */
    flex-grow: 0; /* Don't grow beyond content */
    flex-basis: auto; /* Use content size as basis */
    
    /* Layout properties */
    position: relative !important;
    box-sizing: border-box;
    border-bottom: 1px solid #eee;
    overflow-x: hidden; /* Prevent horizontal scrolling on individual rDivs */
    
    /* Default state styling using CSS variables */
    background-color: var(--data-background-color) !important;
    color: var(--data-foreground-color) !important;
    padding: var(--data-normal-padding);
    border: var(--data-normal-inner-border-width) solid var(--data-normal-inner-border-color);
    outline: var(--data-normal-outer-border-width) solid var(--data-normal-outer-border-color);
    border-radius: var(--data-normal-border-radius) !important;
    margin-top: var(--data-normal-margin-top);
    
    /* Smooth transitions */
    transition: background-color 0.2s, color 0.2s, border 0.2s, outline 0.2s, height 0.2s;
    
    /* Override any filter interference */
    filter: none !important;
}

/* 
  Content container that flexes to fit all children
*/
.biz-resume-div .biz-resume-details-div {
    /* Flexbox container for content sections */
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: flex-start;
    
    /* Auto-sizing */
    width: 100%;
    height: auto;
    min-height: fit-content;
    
    /* Flex child behavior */
    flex-shrink: 0;
    flex-grow: 1; /* Grow to fill parent rDiv */
    flex-basis: auto;
    
    /* Styling */
    background-color: transparent !important;
    border-radius: 25px !important;
    gap: 0; /* Controlled spacing in child sections */
}

/* Force all nested children to have transparent backgrounds */
.biz-resume-div .biz-resume-details-div * {
    background-color: transparent !important;
}

.job-description-item {
    margin: 0;
    padding: 0;
}

.biz-resume-div h4, .biz-resume-div p {
    /* Let text wrap naturally */
    margin: 0;
    padding: 2px 0;
    white-space: normal; /* Allow wrapping */
    overflow: visible; /* Show all content */
}

/* Hovered state */
.biz-resume-div.hovered {
    background-color: var(--data-background-color-hovered) !important;
    color: var(--data-foreground-color-hovered) !important;
    padding: var(--data-hovered-padding);
    border: var(--data-hovered-inner-border-width) solid var(--data-hovered-inner-border-color);
    outline: var(--data-hovered-outer-border-width) solid var(--data-hovered-outer-border-color);
    border-radius: var(--data-hovered-border-radius) !important;
    margin-top: var(--data-hovered-margin-top);
    filter: none !important;
}

/* Selected state with layered purple-white-purple borders using box-shadow */
.biz-resume-div.selected {
    background-color: var(--data-background-color-selected) !important;
    color: var(--data-foreground-color-selected) !important;
    padding: var(--data-selected-padding);
    
    /* Reduce width by 16px to prevent border clipping (8px each side for 8px box-shadow + margins) */
    width: calc(100% - 16px) !important;
    margin-left: 8px; /* Center the narrower selected rDiv */
    margin-right: 8px;
    
    /* Layered border effect using box-shadow: 2px purple + 1px white + 5px purple */
    border: 2px solid purple !important;
    outline: none !important;
    box-shadow: 
        0 0 0 3px white,                           /* 1px white ring (2px border + 1px white = 3px total) */
        0 0 0 8px purple,                          /* 5px purple outer (3px + 5px = 8px total) */
        0 3px 12px rgba(128, 0, 128, 0.4) !important; /* Drop shadow for depth */
    
    border-radius: var(--data-selected-border-radius) !important;
    margin-top: var(--data-selected-margin-top);
    filter: none !important;
}

/* Enhanced rDiv content styling with flexbox auto-sizing */

/* Header section - flexbox container */
.resume-header {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: flex-start;
    
    /* Auto-sizing */
    width: 100%;
    height: auto;
    min-height: fit-content;
    flex-shrink: 0;
    
    /* Visual styling */
    border-bottom: 1px solid rgba(255, 255, 255, 0.2);
    padding-bottom: 8px;
    margin-bottom: 12px;
}

.resume-header .biz-details-employer {
    font-weight: bold;
    font-size: 16px;
    margin-bottom: 4px;
    color: inherit;
    flex-shrink: 0;
}

.resume-header .biz-details-role {
    font-size: 14px;
    font-style: italic;
    margin-bottom: 4px;
    color: inherit;
    opacity: 0.9;
    flex-shrink: 0;
}

.resume-header .biz-details-dates {
    font-size: 12px;
    font-weight: normal;
    color: inherit;
    opacity: 0.8;
    flex-shrink: 0;
    
    /* Flex container for dates and job number */
    display: flex !important;
    justify-content: space-between !important;
    align-items: center !important;
}

.resume-header .biz-details-dates .job-number {
    font-size: 11px;
    font-weight: bold;
    color: inherit;
    opacity: 0.7;
    text-align: right;
    flex-shrink: 0;
}

/* Description section - flexbox container */
.resume-description {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: flex-start;
    
    /* Auto-sizing */
    width: 100%;
    height: auto;
    min-height: fit-content;
    flex-shrink: 0;
    
    /* Spacing */
    margin-bottom: 12px;
}

.resume-description h4 {
    font-size: 13px;
    font-weight: bold;
    margin: 0 0 6px 0;
    color: inherit;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    opacity: 0.9;
    flex-shrink: 0;
}

.description-content {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    
    font-size: 12px;
    line-height: 1.4;
    width: 100%;
    height: auto;
    flex-shrink: 0;
}

/* Bulleted description items */
.description-content .job-description-item {
    display: flex;
    align-items: flex-start;
    margin: 0 0 4px 0;
    padding: 0;
    color: inherit;
    opacity: 0.85;
    flex-shrink: 0;
    width: 100%;
}

.description-content .job-description-item .bullet {
    flex-shrink: 0;
    margin-right: 6px;
    color: inherit;
    font-weight: bold;
}

.description-content .job-description-item .bullet-text {
    flex: 1;
    color: inherit;
    line-height: 1.4;
}

/* Skills section - flexbox container */
.resume-skills {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: flex-start;
    
    /* Auto-sizing */
    width: 100%;
    height: auto;
    min-height: fit-content;
    flex-shrink: 0;
    
    /* Spacing */
    margin-top: 12px;
}

.resume-skills h4 {
    font-size: 13px;
    font-weight: bold;
    margin: 0 0 6px 0;
    color: inherit;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    opacity: 0.9;
    flex-shrink: 0;
}

/* Single-line bulleted skills */
.skills-list {
    display: flex;
    align-items: flex-start;
    justify-content: flex-start;
    
    /* Auto-sizing */
    width: 100%;
    height: auto;
    min-height: fit-content;
    flex-shrink: 0;
}

.skills-list .bullet {
    flex-shrink: 0;
    margin-right: 6px;
    color: inherit;
    font-weight: bold;
    font-size: 12px;
}

.skills-list .skills-text {
    flex: 1;
    color: inherit;
    font-size: 12px;
    line-height: 1.4;
    opacity: 0.85;
    word-wrap: break-word;
    overflow-wrap: break-word;
}
</style> 