<script setup>
import { ref, onMounted, onUnmounted, watch, computed, nextTick } from 'vue';
import { jobs } from '@/modules/data/enrichedJobs.mjs';
import { selectionManager } from '@/modules/core/selectionManager.mjs';
import { useColorPalette } from '@/modules/composables/useColorPalette.mjs';
import { applyPaletteToElement } from '@/modules/composables/useColorPalette.mjs';
import { useResizeHandle } from '@/modules/composables/useResizeHandle.mjs';
import { useResumeListController } from '@/modules/core/globalServices';
import { parseFlexibleDateString } from '@/modules/utils/dateUtils.mjs';


// Get the same percentage as the resize handle
const { scenePercentage } = useResizeHandle();

// Use Vue 3 provide/inject instead of window.resumeListController
const resumeListController = useResumeListController();

// Console: filter by "ResumeContainer" or "SkillCard" to see skill-card + resume listing messages (verbose logs use console.debug)

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
watch(orderedPaletteNames, () => {}, { immediate: true });
watch(currentPaletteFilename, () => {}, { immediate: true });

const currentSortRule = ref({ field: 'startDate', direction: 'desc' });

// Watch for changes in the sort rule and apply them
watch(currentSortRule, (newSortRule) => {
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
  const controller = resumeListController || window.resumeListController;
  if (controller) {
    controller.goToFirstResumeItem();
  } else {
    console.error('[ResumeContainer] ResumeListController not available via provide/inject or window!');
  }
}
function selectLast() {
  const controller = resumeListController || window.resumeListController;
  if (controller) {
    controller.goToLastResumeItem();
  } else {
    console.error('[ResumeContainer] ResumeListController not available for selectLast!');
  }
}
function selectNext() {
  const controller = resumeListController || window.resumeListController;
  if (controller) {
    controller.goToNextResumeItem();
  } else {
    console.error('[ResumeContainer] ResumeListController not available for selectNext!');
  }
}
function selectPrevious() {
  const controller = resumeListController || window.resumeListController;
  if (controller) {
    controller.goToPreviousResumeItem();
  } else {
    console.error('[ResumeContainer] ResumeListController not available for selectPrevious!');
  }
}

// Hint: last-appended skill card id, label, position in central list (0-based index), and total list length
const skillCardHintInfo = ref({ id: null, label: null, position: null, total: null });

// Resume-view skill card (flock-of-postcards): one card with back links to referencing biz cards and total years (sum of months rounded up)
const selectedCardSnapshot = ref(null);
/** When true, the skill card is removed from the resume listing container (hidden) until selection changes. */
const resumeSkillCardDismissed = ref(false);
function updateSelectedCardSnapshot() {
  selectedCardSnapshot.value = selectionManager?.selectedCard ?? null;
  // Show the skill card again when user selects a (possibly different) skill
  resumeSkillCardDismissed.value = false;
}
/** Months of experience for one job (for summing). */
function getMonthsExperience(job) {
  if (!job?.start) return 0;
  try {
    const start = parseFlexibleDateString(job.start);
    const end = (job.end === 'CURRENT_DATE' || !job.end) ? new Date() : parseFlexibleDateString(job.end);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return 0;
    return (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  } catch {
    return 0;
  }
}
const selectedSkillCard = computed(() => {
  const card = selectedCardSnapshot.value;
  if (card?.type !== 'skill' || typeof card.skillCardId !== 'string') return null;
  const el = document.getElementById(card.skillCardId) || document.getElementById(`${card.skillCardId}-clone`);
  const skillName = el?.getAttribute('data-skill-name') ?? '';
  const idsStr = el?.getAttribute('data-referencing-biz-card-ids');
  if (!idsStr) return { skillName, referencingJobNumbers: [], totalYearsExperience: 0 };
  const bizCardIds = idsStr.split(',').map(s => s.trim()).filter(Boolean);
  const referencingJobNumbers = [];
  let totalMonths = 0;
  for (const bizCardId of bizCardIds) {
    const bizEl = document.getElementById(bizCardId);
    const jobNum = bizEl != null ? parseInt(bizEl.getAttribute('data-job-number'), 10) : NaN;
    if (Number.isNaN(jobNum) || jobNum < 0 || jobNum >= jobs.length) continue;
    referencingJobNumbers.push(jobNum);
    totalMonths += getMonthsExperience(jobs[jobNum]);
  }
  const totalYearsExperience = totalMonths <= 0 ? 0 : Math.ceil(totalMonths / 12);
  return { skillName, referencingJobNumbers, totalYearsExperience };
});
/** Red X: remove the skill card from the resume listing container (hide it); does not clear scene selection. */
function removeSkillCardFromResumeListing() {
  resumeSkillCardDismissed.value = true;
}
function goToJob(jobNumber) {
  selectionManager?.selectCard({ type: 'biz', jobNumber }, 'ResumeContainer.skillCardJobClick');
}

const resumeSkillCardRef = ref(null);
async function applyPaletteToResumeSkillCard() {
  await nextTick();
  const el = resumeSkillCardRef.value;
  if (el && selectedSkillCard.value?.referencingJobNumbers?.length) {
    try {
      await applyPaletteToElement(el);
    } catch (e) {
      console.warn('[ResumeContainer] applyPaletteToResumeSkillCard:', e);
    }
  }
}
watch([selectedSkillCard, resumeSkillCardDismissed, currentPaletteFilename], applyPaletteToResumeSkillCard);

function scrollResumeSkillCardIntoView() {
  nextTick(() => {
    const el = resumeSkillCardRef.value;
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  });
}

/** Get skill card data from the scene DOM element (by skillCardId). Tries getElementById, querySelector, and inside #scene-plane. */
function getSkillCardDataFromId(skillCardId) {
  let el = document.getElementById(skillCardId) || document.getElementById(`${skillCardId}-clone`);
  if (!el) {
    el = document.querySelector(`[id="${skillCardId}"], [id="${skillCardId}-clone"]`);
  }
  if (!el) {
    const scenePlane = document.getElementById('scene-plane');
    if (scenePlane) {
      el = scenePlane.querySelector(`[id="${skillCardId}"], [id="${skillCardId}-clone"]`) || scenePlane.querySelector(`.skill-card-div[id="${skillCardId}"], .skill-card-div[id="${skillCardId}-clone"]`);
    }
  }
  if (!el) return null;
  let skillName = el.getAttribute('data-skill-name') ?? '';
  if (!skillName && el.querySelector) {
    const label = el.querySelector('.skill-card-label');
    if (label) skillName = (label.textContent || '').trim();
  }
  const idsStr = el.getAttribute('data-referencing-biz-card-ids');
  if (!idsStr) return { skillName, referencingJobNumbers: [], totalYearsExperience: 0 };
  const bizCardIds = idsStr.split(',').map(s => s.trim()).filter(Boolean);
  const referencingJobNumbers = [];
  let totalMonths = 0;
  for (const bizCardId of bizCardIds) {
    const bizEl = document.getElementById(bizCardId) || document.querySelector(`[id="${bizCardId}"]`);
    const jobNum = bizEl != null ? parseInt(bizEl.getAttribute('data-job-number'), 10) : NaN;
    if (Number.isNaN(jobNum) || jobNum < 0 || jobNum >= jobs.length) continue;
    referencingJobNumbers.push(jobNum);
    totalMonths += getMonthsExperience(jobs[jobNum]);
  }
  const totalYearsExperience = totalMonths <= 0 ? 0 : Math.ceil(totalMonths / 12);
  return { skillName, referencingJobNumbers, totalYearsExperience };
}

// Dedupe: only append one copy per skill selection (multiple sources fire: event, watch, direct call)
let _lastAppendedSkillCardId = '';
let _lastAppendedAt = 0;
const APPEND_DEBOUNCE_MS = 500;

/** Append a copy of the selected skill card (skillDiv) to the end of the resume listing and scroll it into view. If a copy is already in the list, only scroll it into view. Returns true if a new copy was appended, false if only scrolled to existing. */
function appendSkillCardCopyToResumeListing(skillCardId, retryCount = 0) {
  const data = getSkillCardDataFromId(skillCardId);
  if (!data) {
    if (retryCount < 2) {
      setTimeout(() => appendSkillCardCopyToResumeListing(skillCardId, retryCount + 1), 80);
    }
    return false;
  }
  if (!data.skillName) {
    if (retryCount < 2) {
      setTimeout(() => appendSkillCardCopyToResumeListing(skillCardId, retryCount + 1), 80);
    } else {
      console.warn('[ResumeContainer] appendSkillCardCopyToResumeListing: no skill name for', skillCardId);
    }
    return false;
  }
  // Single ordered list = infinite scroller's contentHolder (#resume-content-div-list).
  const scroller = (resumeListController || window.resumeListController)?.infiniteScroller;
  const listEl = document.getElementById('resume-content-div-list');
  const appendTarget = listEl || document.getElementById('resume-content-div');
  if (!appendTarget) {
    console.warn('[ResumeContainer] appendSkillCardCopyToResumeListing: container not found');
    return false;
  }
  const list = (scroller && scroller.contentHolder) ? scroller.contentHolder : appendTarget;
  const existingCopy = list.querySelector(`.appended-skill-card-copy[data-skill-card-id="${skillCardId}"]`);
  if (existingCopy) {
    existingCopy.scrollIntoView({ behavior: 'smooth', block: 'end', inline: 'nearest' });
    nextTick(() => {
      const children = Array.from(list.children);
      const total = children.length;
      const idx = children.indexOf(existingCopy);
      const position = idx >= 0 ? idx : total - 1;
      skillCardHintInfo.value = { id: skillCardId, label: data.skillName ?? '', position, total };
    });
    return false;
  }
  const now = Date.now();
  if (skillCardId === _lastAppendedSkillCardId && now - _lastAppendedAt < APPEND_DEBOUNCE_MS) {
    return false; // already appended this card recently (same click)
  }
  _lastAppendedSkillCardId = skillCardId;
  _lastAppendedAt = now;

  const colorIndex = data.referencingJobNumbers?.[0] ?? 0;
  const backIconUrl = '/static_content/icons/anchors/icons8-back-16-black.png';

  const copy = document.createElement('div');
  copy.className = 'resume-skill-card appended-skill-card-copy';
  copy.setAttribute('data-color-index', String(colorIndex));
  if (skillCardId) copy.setAttribute('data-skill-card-id', skillCardId);
  copy.innerHTML = `
    <button type="button" class="resume-skill-card-close" aria-label="Remove skill card from resume listing">×</button>
    <span class="resume-skill-card-skill-name">${escapeHtml(data.skillName)}</span>
    <div class="resume-skill-card-back-links">
      ${(data.referencingJobNumbers || []).map(jobNum => `
        <button type="button" class="resume-skill-card-back-link" aria-label="Go to job" data-job-number="${jobNum}">
          <img class="back-icon" src="${escapeHtml(backIconUrl)}" alt="" width="16" height="16" aria-hidden="true" />
        </button>
      `).join('')}
    </div>
    ${data.totalYearsExperience > 0 ? `<span class="resume-skill-card-years">(${data.totalYearsExperience} year${data.totalYearsExperience !== 1 ? 's' : ''} experience)</span>` : ''}
  `;

  const closeBtn = copy.querySelector('.resume-skill-card-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      copy.remove();
    });
  }
  copy.querySelectorAll('.resume-skill-card-back-link').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const jobNum = parseInt(btn.getAttribute('data-job-number'), 10);
      if (!Number.isNaN(jobNum)) selectionManager?.selectCard({ type: 'biz', jobNumber: jobNum }, 'ResumeContainer.appendedCopyBackLink');
    });
  });
  copy.addEventListener('click', (e) => {
    if (e.target.closest('.resume-skill-card-close') || e.target.closest('.resume-skill-card-back-link')) return;
    if (skillCardId) {
      const sceneEl = document.getElementById(skillCardId);
      if (sceneEl) sceneEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    }
  });

  if (scroller && typeof scroller.appendFooterItem === 'function') {
    scroller.appendFooterItem(copy);
  } else {
    appendTarget.appendChild(copy);
  }

  applyPaletteToElement(copy).catch((e) => console.warn('[ResumeContainer] applyPaletteToElement for appended copy:', e));
  nextTick(() => {
    // Update hint after DOM has the new node: label, id, 0-based position, total length (so position 32 → length 33)
    const list = (scroller && scroller.contentHolder) ? scroller.contentHolder : appendTarget;
    const children = Array.from(list.children);
    const total = children.length;
    const idx = children.indexOf(copy);
    const position = idx >= 0 ? idx : total - 1;
    skillCardHintInfo.value = { id: skillCardId, label: data.skillName ?? '', position, total };

    const scrollport = document.getElementById('resume-content-div-wrapper');
    if (scrollport && copy.offsetParent) {
      const copyRect = copy.getBoundingClientRect();
      const portRect = scrollport.getBoundingClientRect();
      if (copyRect.bottom > portRect.bottom || copyRect.top < portRect.top) {
        copy.scrollIntoView({ behavior: 'smooth', block: 'end', inline: 'nearest' });
      }
    } else {
      copy.scrollIntoView({ behavior: 'smooth', block: 'end', inline: 'nearest' });
    }
  });
  return true;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function onResumeSkillCardScrollIntoView(event) {
  const skillCardId = event?.detail?.skillCardId;
  if (!skillCardId) return;
  appendSkillCardCopyToResumeListing(skillCardId);
}

// When selection becomes a skill card, append copy and scroll (primary path; event is fallback)
watch(
  selectedCardSnapshot,
  (newCard, oldCard) => {
    if (newCard?.type !== 'skill' || !newCard?.skillCardId) return;
    if (oldCard?.skillCardId === newCard.skillCardId) return; // same card, avoid duplicate append
    nextTick(() => {
      appendSkillCardCopyToResumeListing(newCard.skillCardId);
    });
  },
  { flush: 'post' }
);

onMounted(() => {
  updateSelectedCardSnapshot();
  selectionManager?.eventTarget?.addEventListener('card-selected', updateSelectedCardSnapshot);
  selectionManager?.eventTarget?.addEventListener('selection-cleared', updateSelectedCardSnapshot);
  selectionManager?.eventTarget?.addEventListener('resume-skill-card-scrollIntoView', onResumeSkillCardScrollIntoView);
  window.addEventListener('resume-skill-card-scrollIntoView', onResumeSkillCardScrollIntoView);
  document.addEventListener('resume-skill-card-scrollIntoView', onResumeSkillCardScrollIntoView);
  // Global hook so selection manager can trigger append even if events don't reach this component
  window.__resumeAppendSkillCardCopy = appendSkillCardCopyToResumeListing;
});
onUnmounted(() => {
  selectionManager?.eventTarget?.removeEventListener('card-selected', updateSelectedCardSnapshot);
  selectionManager?.eventTarget?.removeEventListener('selection-cleared', updateSelectedCardSnapshot);
  selectionManager?.eventTarget?.removeEventListener('resume-skill-card-scrollIntoView', onResumeSkillCardScrollIntoView);
  window.removeEventListener('resume-skill-card-scrollIntoView', onResumeSkillCardScrollIntoView);
  document.removeEventListener('resume-skill-card-scrollIntoView', onResumeSkillCardScrollIntoView);
  delete window.__resumeAppendSkillCardCopy;
});

function scrollSceneSkillCardIntoView() {
  const card = selectedCardSnapshot.value;
  if (card?.type !== 'skill' || !card.skillCardId) return;
  const sceneSkillCard = document.getElementById(card.skillCardId);
  if (sceneSkillCard) sceneSkillCard.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
}
function onResumeSkillCardClick(event) {
  if (event.target.closest('.resume-skill-card-close') || event.target.closest('.resume-skill-card-back-link')) return;
  scrollSceneSkillCardIntoView();
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
        <p id="resume-skill-hint" class="resume-skill-hint" aria-live="polite">
            Click a skill in the <strong>Scene</strong> viewer → a copy is added at the <strong>bottom</strong> of the list below and scrolled into view.
            <template v-if="skillCardHintInfo.id">
                <br>Skill card: <strong>{{ skillCardHintInfo.label || skillCardHintInfo.id }}</strong> (id: <strong>{{ skillCardHintInfo.id }}</strong>), position: <strong>{{ skillCardHintInfo.position }}</strong>, list length: <strong>{{ skillCardHintInfo.total }}</strong>.
            </template>
        </p>
        <div id="resume-content-div-wrapper" class="scrollable-container">
            <div id="resume-content-div" class="resume-content-div-container">
                <!-- Single selected-skill panel (stays at top of resume content). -->
                <div v-if="selectedSkillCard && !resumeSkillCardDismissed" id="resume-skill-cards-panel" class="resume-skill-cards-panel">
                    <div ref="resumeSkillCardRef" class="resume-skill-card" :data-color-index="selectedSkillCard?.referencingJobNumbers?.[0] ?? 0" @click="onResumeSkillCardClick">
                        <button type="button" class="resume-skill-card-close" aria-label="Remove skill card from resume listing" @click.prevent="removeSkillCardFromResumeListing">×</button>
                        <span class="resume-skill-card-skill-name">{{ selectedSkillCard.skillName }}</span>
                        <div class="resume-skill-card-back-links">
                            <button
                                v-for="jobNum in selectedSkillCard.referencingJobNumbers"
                                :key="jobNum"
                                type="button"
                                class="resume-skill-card-back-link"
                                aria-label="Go to job"
                                @click="goToJob(jobNum)"
                            >
                                <img class="back-icon" src="/static_content/icons/anchors/icons8-back-16-black.png" alt="" width="16" height="16" aria-hidden="true" />
                            </button>
                        </div>
                        <span v-if="selectedSkillCard.totalYearsExperience > 0" class="resume-skill-card-years">({{ selectedSkillCard.totalYearsExperience }} year{{ selectedSkillCard.totalYearsExperience !== 1 ? 's' : '' }} experience)</span>
                    </div>
                </div>
                <!-- Resume listing: rDivs are injected here; appended skill-card copies are also added here. -->
                <div id="resume-content-div-list"></div>
            </div>
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

.resume-skill-hint {
    flex-shrink: 0;
    margin: 0;
    padding: 6px 10px 8px;
    font-size: 12px;
    line-height: 1.35;
    color: var(--grey-dark-7, #888);
    background-color: var(--grey-darkest, #1a1a1a);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.resume-skill-hint strong {
    color: var(--grey-dark-5, #aaa);
}

#resume-content-div-wrapper {
    flex-grow: 1;
    /* overflow-y is now controlled by the InfiniteScrollingContainer */
    overflow-x: visible; /* bizCardLineItems (rDivs) must never be clipped by their container */
    background-color: var(--grey-medium);
    color: black;
    position: relative; /* Needed for the absolute positioning of items by the scroller */
    /* 8px horizontal padding so selected rDiv box-shadow (8px ring) has room; matches cDiv selected border */
    padding-left: 8px;
    padding-right: 8px;
    /* overflow is set by InfiniteScrollingContainer.setupContainer() to 'auto' */
}

/* Shared container for skill cards and rDiv list; same width/spacing for both */
#resume-content-div.resume-content-div-container {
    display: flex;
    flex-direction: column;
    gap: 10px;
    background-color: var(--grey-dark-6);
    overflow-x: visible;
    padding-left: 8px;
    padding-right: 8px;
}
#resume-content-div-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 0;
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

/* Resume-view skill card – same width and spacing as rDivs (same container, gap 10px). */
.resume-skill-cards-panel {
    flex-shrink: 0;
    padding: 8px 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
    background-color: var(--grey-dark-6);
    border-bottom: 1px solid rgba(255, 255, 255, 0.15);
}
.resume-skill-card {
    position: relative;
    width: 100%;
    padding: 8px 36px 8px 12px;
    cursor: pointer;
    font-family: "Roboto", sans-serif;
    font-size: 14px;
    background-color: var(--data-background-color, #e6c229);
    color: var(--data-foreground-color, #000);
    border-width: var(--data-normal-inner-border-width, 3px);
    border-style: solid;
    border-color: var(--data-normal-inner-border-color, rgba(255, 255, 255, 0.9));
    border-radius: calc(var(--data-normal-border-radius, 25px) / 2);
    min-height: 44px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    gap: 4px;
    box-sizing: border-box;
}
.resume-skill-card-close {
    position: absolute;
    top: 6px;
    right: 8px;
    width: 22px;
    height: 22px;
    padding: 0;
    font-size: 18px;
    line-height: 1;
    color: #c00;
    background: #fff;
    border: 1px solid #c00;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
}
.resume-skill-card-close:hover {
    color: #f00;
    border-color: #f00;
    background: rgba(255, 255, 255, 0.9);
}
.resume-skill-card-skill-name {
    font-weight: 900;
    text-decoration: underline;
    text-align: left;
}
.resume-skill-card-back-links {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    align-items: center;
}
.resume-skill-card-back-link {
    padding: 0 2px;
    line-height: 0;
    background: transparent;
    border: none;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
}
.resume-skill-card-back-link .back-icon {
    display: block;
}
.resume-skill-card-back-link:hover {
    opacity: 0.8;
}
.resume-skill-card-years {
    font-size: 14px;
    text-decoration: underline;
}
/* Appended copies at end of resume listing (sibling of list, not inside infinite scroll) */
.appended-skill-card-copy {
    flex-shrink: 0;
}
/* rDiv styles moved to global styles section below */

/* .viewer-label styling consolidated in AppContent.vue */
</style>

<style>
/* Global styles for rDivs - not scoped to ensure they apply to dynamically created elements */
/* Normal border/padding/outline/radius come from scene.css (shared .biz-card-div, .biz-resume-div rule). */

/* rDiv removed from resume listing (red X) - same behavior as skill card red X */
.biz-resume-div.r-div-removed-from-listing {
    display: none !important;
}

/* Red X button on rDiv - remove from resume listing only */
.biz-resume-div .r-div-close {
    position: absolute;
    top: 6px;
    right: 8px;
    width: 22px;
    height: 22px;
    padding: 0;
    font-size: 18px;
    line-height: 1;
    color: #c00;
    background: #fff;
    border: 1px solid #c00;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1;
}
.biz-resume-div .r-div-close:hover {
    color: #f00;
    border-color: #f00;
    background: rgba(255, 255, 255, 0.9);
}

/* Base rDiv layout and sizing only. Spacing between items from flex container gap (infiniteScrollingContainer contentHolder). */
.biz-resume-div {
    display: flex !important;
    flex-direction: column;
    align-items: stretch;
    justify-content: flex-start;
    width: 100%;
    height: auto !important;
    min-height: fit-content;
    max-height: none;
    flex-shrink: 0;
    flex-grow: 0;
    flex-basis: auto;
    position: relative !important;
    overflow-x: hidden;
    background-color: var(--data-background-color) !important;
    color: var(--data-foreground-color) !important;
    filter: none !important;
    transition: height 0.2s;
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

/* Hovered state - same padding/border as normal (margin from container) */
.biz-resume-div.hovered {
    background-color: var(--data-background-color-hovered) !important;
    color: var(--data-foreground-color-hovered) !important;
    padding: var(--data-normal-padding);
    border: var(--data-normal-inner-border-width) solid var(--data-hovered-inner-border-color);
    outline: var(--data-normal-outer-border-width) solid var(--data-hovered-outer-border-color);
    border-radius: var(--data-normal-border-radius) !important;
    filter: none !important;
}

/* Selected state - same padding/border/width as normal (margin from container) */
.biz-resume-div.selected {
    background-color: var(--data-background-color-selected) !important;
    color: var(--data-foreground-color-selected) !important;
    padding: var(--data-normal-padding);
    border: var(--data-normal-inner-border-width) solid #801a81 !important;
    outline: none !important;
    box-shadow:
        0 0 0 3px #ffffff,
        0 0 0 8px #801a81,
        0 3px 12px rgba(128, 0, 128, 0.4) !important;
    border-radius: var(--data-normal-border-radius) !important;
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
}

.resume-header .biz-details-debug-row {
    font-size: 10px;
    opacity: 0.85;
    flex-shrink: 0;
}

.resume-header .biz-details-debug-row .job-number {
    font-size: 11px;
    font-weight: bold;
    color: inherit;
    opacity: 0.8;
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