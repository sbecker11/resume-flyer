<script setup>
import { ref, onMounted, onUnmounted, watch, computed, nextTick } from 'vue';
import { getGlobalJobsDependency } from '@/modules/composables/useJobsDependency.mjs';
import { selectionManager } from '@/modules/core/selectionManager.mjs';
import { useColorPalette } from '@/modules/composables/useColorPalette.mjs';
import { applyPaletteToElement } from '@/modules/composables/useColorPalette.mjs';
import { useResizeHandle } from '@/modules/composables/useResizeHandle.mjs';
import { useResumeListController } from '@/modules/core/globalServices';
import { parseFlexibleDateString } from '@/modules/utils/dateUtils.mjs';

// Define props
const props = defineProps({
  currentResumeId: { type: String, default: 'default' }
});

// Define emits for parent communication
const emit = defineEmits(['open-resume-manager']);

// Get the same percentage as the resize handle
const { scenePercentage } = useResizeHandle();
// Current resume metadata
const currentResumeMetadata = ref(null);
const availableResumeCount = ref(1);

// Fetch current resume displayName from API
async function fetchCurrentResumeMetadata() {
  let resumeId = props.currentResumeId;
  console.log('[ResumeContainer] 📋 fetchCurrentResumeMetadata called, resumeId:', resumeId);

  // Map 'default' to the actual default resume ID
  if (!resumeId || resumeId === 'default') {
    resumeId = 'resume-6';
    console.log('[ResumeContainer] Mapped to default resume-6');
  }

  try {
    const response = await fetch('/api/resumes');
    if (response.ok) {
      const resumes = await response.json();
      const resume = Array.isArray(resumes) ? resumes.find(r => r.id === resumeId) : null;
      if (resume) {
        currentResumeMetadata.value = resume.metadata || resume;
        console.log('[ResumeContainer] ✅ Updated currentResumeMetadata:', currentResumeMetadata.value.displayName);
      } else {
        // Fallback if resume not found in list
        currentResumeMetadata.value = { displayName: resumeId };
        console.warn('[ResumeContainer] ⚠️ Resume not found in API list, using ID as display name');
      }
    }
  } catch (error) {
    console.error('[ResumeContainer] Failed to fetch current resume metadata:', error);
    currentResumeMetadata.value = { displayName: resumeId || 'Unknown Resume' };
  }
}

// Computed property for display name
const currentResumeDisplay = computed(() => {
  return currentResumeMetadata.value?.displayName || 'Loading...';
});

// Watch for currentResumeId prop changes and update metadata
watch(
  () => props.currentResumeId,
  async (newId, oldId) => {
    console.log('[ResumeContainer] 👁️ Watcher triggered - oldId:', oldId, '-> newId:', newId);
    if (newId !== undefined) {
      await fetchCurrentResumeMetadata();
    }
  },
  { immediate: true }
);

// Fetch resume count and metadata on mount
onMounted(async () => {
  try {
    const response = await fetch('/api/resumes');
    if (response.ok) {
      const resumes = await response.json();
      availableResumeCount.value = Array.isArray(resumes) ? resumes.length : 1;
    }
    // Fetch current resume metadata
    await fetchCurrentResumeMetadata();
  } catch (error) {
    console.error('[ResumeContainer] Failed to fetch resume data:', error);
  }
});
const resumeContentWrapperRef = ref(null);
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

// Sort dropdown uses string keys because native <select> cannot bind object values reliably
const SORT_OPTIONS = [
  { key: 'startDate-desc', rule: { field: 'startDate', direction: 'desc' }, text: 'Start Date (Newest First)' },
  { key: 'startDate-asc', rule: { field: 'startDate', direction: 'asc' }, text: 'Start Date (Oldest First)' },
  { key: 'endDate-desc', rule: { field: 'endDate', direction: 'desc' }, text: 'End Date (Newest First)' },
  { key: 'endDate-asc', rule: { field: 'endDate', direction: 'asc' }, text: 'End Date (Oldest First)' },
  { key: 'employer-asc', rule: { field: 'employer', direction: 'asc' }, text: 'Employer (A-Z)' },
  { key: 'role-asc', rule: { field: 'role', direction: 'asc' }, text: 'Role (A-Z)' },
  { key: 'original-asc', rule: { field: 'original', direction: 'asc' }, text: 'Original order' },
];
const sortRuleKey = ref('startDate-desc');

function sortRuleToKey(rule) {
  if (!rule || !rule.field) return 'startDate-desc';
  const key = `${rule.field}-${rule.direction || 'asc'}`;
  return SORT_OPTIONS.some((o) => o.key === key) ? key : 'startDate-desc';
}

// Watch for sort dropdown change and apply to controller (updates resume list and selection)
watch(sortRuleKey, (key) => {
  const option = SORT_OPTIONS.find((o) => o.key === key);
  if (option && resumeListController) {
    resumeListController.applySortRule(option.rule);
  }
}, { immediate: false });

// Watch for changes in the color palette selection and save them
watch(currentPaletteFilename, async (newFilename) => {
  if (newFilename) {
    await setCurrentPalette(newFilename);
  }
});

const sortOptions = SORT_OPTIONS;

// Methods for buttons - these will now call the legacy controller via provide/inject
function selectFirst() {
  const controller = resumeListController || window.resumeFlock?.resumeListController;
  if (controller) {
    controller.goToFirstResumeItem();
  } else {
    console.error('[ResumeContainer] ResumeListController not available via provide/inject or window!');
  }
}
function selectLast() {
  const controller = resumeListController || window.resumeFlock?.resumeListController;
  if (controller) {
    controller.goToLastResumeItem();
  } else {
    console.error('[ResumeContainer] ResumeListController not available for selectLast!');
  }
}
function clearAllResumeDivs() {
  const controller = resumeListController || window.resumeFlock?.resumeListController;
  if (controller && typeof controller.clearAllResumeDivsFromListing === 'function') {
    controller.clearAllResumeDivsFromListing();
  } else {
    console.error('[ResumeContainer] ResumeListController not available for clearAllResumeDivs!');
  }
}
function selectNext() {
  const controller = resumeListController || window.resumeFlock?.resumeListController;
  if (controller) {
    controller.goToNextResumeItem();
  } else {
    console.error('[ResumeContainer] ResumeListController not available for selectNext!');
  }
}
function selectPrevious() {
  const controller = resumeListController || window.resumeFlock?.resumeListController;
  if (controller) {
    controller.goToPreviousResumeItem();
  } else {
    console.error('[ResumeContainer] ResumeListController not available for selectPrevious!');
  }
}

// Resume-view skill card (flock-of-postcards): one card with back links to referencing biz cards and total years (sum of months rounded up)
const selectedCardSnapshot = ref(null);
/** When true, the skill card is removed from the resume listing container (hidden) until selection changes. */
const resumeSkillCardDismissed = ref(false);
function updateSelectedCardSnapshot() {
  selectedCardSnapshot.value = selectionManager?.selectedCard ?? null;
  resumeSkillCardDismissed.value = false;
  nextTick(syncSkillResumeDivSelection);
}

/** Keep skill-resume-div .selected in sync with selection (scene and resume state identical). */
function syncSkillResumeDivSelection() {
  const sel = selectionManager?.selectedCard;
  const selectedSkillId = sel?.type === 'skill' ? sel?.skillCardId : null;
  const list = document.getElementById('resume-content-div-list') || document.getElementById('resume-content-div');
  if (!list) return;
  list.querySelectorAll('.skill-resume-div, .appended-skill-resume-div').forEach((el) => {
    const id = el.getAttribute('data-skill-card-id') ?? '';
    if (id === selectedSkillId) {
      el.classList.add('selected');
      el.classList.remove('hovered');
    } else {
      el.classList.remove('selected');
    }
  });
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
    const jobsList = getGlobalJobsDependency().getJobsData();
    if (Number.isNaN(jobNum) || jobNum < 0 || jobNum >= jobsList.length) continue;
    referencingJobNumbers.push(jobNum);
    totalMonths += getMonthsExperience(jobsList[jobNum]);
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
    const jobsList = getGlobalJobsDependency().getJobsData();
    if (Number.isNaN(jobNum) || jobNum < 0 || jobNum >= jobsList.length) continue;
    referencingJobNumbers.push(jobNum);
    totalMonths += getMonthsExperience(jobsList[jobNum]);
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
  // Single ordered list = scroll container's contentHolder (#resume-content-div-list).
  const scroller = (resumeListController || window.resumeFlock?.resumeListController)?.scrollContainer;
  const listEl = document.getElementById('resume-content-div-list');
  const appendTarget = listEl || document.getElementById('resume-content-div');
  if (!appendTarget) {
    console.warn('[ResumeContainer] appendSkillCardCopyToResumeListing: container not found');
    return false;
  }
  const list = (scroller && scroller.contentHolder) ? scroller.contentHolder : appendTarget;
  const existingCopy = list.querySelector(`.appended-skill-resume-div[data-skill-card-id="${skillCardId}"]`);
  if (existingCopy) {
    existingCopy.scrollIntoView({ behavior: 'smooth', block: 'end', inline: 'nearest' });
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
  copy.className = 'skill-resume-div appended-skill-resume-div';
  copy.setAttribute('data-color-index', String(colorIndex));
  if (skillCardId) copy.setAttribute('data-skill-card-id', skillCardId);
  copy.innerHTML = `
    <span class="skill-resume-div-skill-name">${escapeHtml(data.skillName)}</span>
    <div class="skill-resume-div-back-links">
      ${(data.referencingJobNumbers || []).map(jobNum => `
        <button type="button" class="skill-resume-div-back-link" aria-label="Go to job" data-job-number="${jobNum}">
          <img class="back-icon" src="${escapeHtml(backIconUrl)}" alt="" width="16" height="16" aria-hidden="true" />
        </button>
      `).join('')}
    </div>
    ${data.totalYearsExperience > 0 ? `<span class="skill-resume-div-years">(${data.totalYearsExperience} year${data.totalYearsExperience !== 1 ? 's' : ''} experience)</span>` : ''}
    <button type="button" class="skill-resume-div-close" aria-label="Remove skill card from resume listing">×</button>
  `;

  const closeBtn = copy.querySelector('.skill-resume-div-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const rlc = resumeListController || window.resumeFlock?.resumeListController;
      if (rlc && typeof rlc.removeSkillFromResumeListOrder === 'function') {
        rlc.removeSkillFromResumeListOrder(skillCardId);
      }
      const allDivs = window.resumeFlock?.allDivs;
      if (allDivs && Array.isArray(allDivs.skillResumeDivs)) {
        const i = allDivs.skillResumeDivs.indexOf(copy);
        if (i !== -1) allDivs.skillResumeDivs.splice(i, 1);
      }
      const nextSibling = copy.nextElementSibling;
      copy.remove();
      if (nextSibling) {
        nextTick(() => {
          const scrollport = document.getElementById('resume-content-div-wrapper');
          if (scrollport) {
            const elTop = nextSibling.getBoundingClientRect().top;
            const portTop = scrollport.getBoundingClientRect().top;
            scrollport.scrollTop += elTop - portTop - 5;
          }
        });
      }
    });
  }
  copy.querySelectorAll('.skill-resume-div-back-link').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const jobNum = parseInt(btn.getAttribute('data-job-number'), 10);
      if (!Number.isNaN(jobNum)) selectionManager?.selectCard({ type: 'biz', jobNumber: jobNum }, 'ResumeContainer.appendedCopyBackLink');
    });
  });
  // Hover: keep scene skill-card-div and resume skill-resume-div in sync (same as biz pair)
  copy.addEventListener('mouseenter', () => {
    const sel = selectionManager?.selectedCard;
    const isSelected = sel?.type === 'skill' && sel?.skillCardId === skillCardId;
    if (!isSelected) {
      copy.classList.add('hovered');
      const sceneCard = document.getElementById(skillCardId) || document.getElementById(`${skillCardId}-clone`);
      if (sceneCard?.classList.contains('skill-card-div')) sceneCard.classList.add('hovered');
    }
  });
  copy.addEventListener('mouseleave', () => {
    copy.classList.remove('hovered');
    const sceneCard = document.getElementById(skillCardId) || document.getElementById(`${skillCardId}-clone`);
    if (sceneCard?.classList.contains('skill-card-div')) sceneCard.classList.remove('hovered');
  });
  // Click: same as biz-resume-div — unselected → select; selected → unselect
  copy.addEventListener('click', (e) => {
    if (e.target.closest('.skill-resume-div-close') || e.target.closest('.skill-resume-div-back-link')) return;
    if (!skillCardId) return;
    const sel = selectionManager?.selectedCard;
    if (sel?.type === 'skill' && sel?.skillCardId === skillCardId) {
      selectionManager.clearSelection('ResumeContainer.skillResumeDivClick');
    } else {
      selectionManager.selectCard({ type: 'skill', skillCardId }, 'ResumeContainer.skillResumeDivClick');
      const sceneEl = document.getElementById(skillCardId);
      if (sceneEl) sceneEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    }
  });

  if (scroller && typeof scroller.appendFooterItem === 'function') {
    scroller.appendFooterItem(copy);
  } else {
    appendTarget.appendChild(copy);
  }
  const allDivs = window.resumeFlock?.allDivs;
  if (allDivs && Array.isArray(allDivs.skillResumeDivs)) allDivs.skillResumeDivs.push(copy);

  const rlc = resumeListController || window.resumeFlock?.resumeListController;
  if (rlc && typeof rlc.notifySkillAddedToResumeListing === 'function') {
    rlc.notifySkillAddedToResumeListing(skillCardId);
  }

  applyPaletteToElement(copy).catch((e) => console.warn('[ResumeContainer] applyPaletteToElement for appended copy:', e));
  nextTick(() => {
    syncSkillResumeDivSelection();
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

function onResumeContentWrapperScroll() {
  // Scroll position is content-dependent (geometry changes on each resume load) — not persisted.
}

watch(resumeContentWrapperRef, (_newRef) => {
  // No scroll restoration — scroll position is not persisted across loads.
}, { immediate: true });

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

function syncSortRuleKeyFromController() {
  const controller = resumeListController || window.resumeFlock?.resumeListController;
  if (controller && typeof controller.getCurrentSortRule === 'function') {
    const rule = controller.getCurrentSortRule();
    sortRuleKey.value = sortRuleToKey(rule);
  }
}
function onSortRuleChanged(e) {
  if (e.detail?.sortRule) sortRuleKey.value = sortRuleToKey(e.detail.sortRule);
}
function onAppStateLoadedForSort() {
  nextTick(syncSortRuleKeyFromController);
}

onMounted(() => {
  updateSelectedCardSnapshot();
  selectionManager?.eventTarget?.addEventListener('card-selected', updateSelectedCardSnapshot);
  selectionManager?.eventTarget?.addEventListener('selection-cleared', updateSelectedCardSnapshot);
  selectionManager?.eventTarget?.addEventListener('skill-resume-div-scrollIntoView', onResumeSkillCardScrollIntoView);
  window.addEventListener('skill-resume-div-scrollIntoView', onResumeSkillCardScrollIntoView);
  document.addEventListener('skill-resume-div-scrollIntoView', onResumeSkillCardScrollIntoView);
  window.addEventListener('sort-rule-changed', onSortRuleChanged);
  window.addEventListener('app-state-loaded', onAppStateLoadedForSort);
  nextTick(() => { setTimeout(syncSortRuleKeyFromController, 100); });
  window.__resumeAppendSkillCardCopy = appendSkillCardCopyToResumeListing;
});
onUnmounted(() => {
  if (resumeContentScrollTimeoutId) clearTimeout(resumeContentScrollTimeoutId);
  selectionManager?.eventTarget?.removeEventListener('card-selected', updateSelectedCardSnapshot);
  selectionManager?.eventTarget?.removeEventListener('selection-cleared', updateSelectedCardSnapshot);
  selectionManager?.eventTarget?.removeEventListener('skill-resume-div-scrollIntoView', onResumeSkillCardScrollIntoView);
  window.removeEventListener('skill-resume-div-scrollIntoView', onResumeSkillCardScrollIntoView);
  document.removeEventListener('skill-resume-div-scrollIntoView', onResumeSkillCardScrollIntoView);
  window.removeEventListener('sort-rule-changed', onSortRuleChanged);
  window.removeEventListener('app-state-loaded', onAppStateLoadedForSort);
  delete window.__resumeAppendSkillCardCopy;
});

function scrollSceneSkillCardIntoView() {
  const card = selectedCardSnapshot.value;
  if (card?.type !== 'skill' || !card.skillCardId) return;
  const sceneSkillCard = document.getElementById(card.skillCardId);
  if (sceneSkillCard) sceneSkillCard.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
}
function onResumeSkillCardClick(event) {
  if (event.target.closest('.skill-resume-div-close') || event.target.closest('.skill-resume-div-back-link')) return;
  scrollSceneSkillCardIntoView();
}

</script>

<template>
    <div id="resume-content">
        <div id="resume-content-header">
            <p class="intro">Welcome to your resume-flock!</p>
            <!-- Resume Manager Row -->
            <div class="resume-controls-row">
                <div class="current-resume-indicator" :title="`Currently viewing: ${currentResumeDisplay}`">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                    </svg>
                    <span>{{ currentResumeDisplay }}</span>
                </div>
                <button
                    @click="$emit('open-resume-manager')"
                    class="resume-manager-button"
                    title="Resume Manager - Upload, switch, and manage resumes"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="12" y1="11" x2="12" y2="17" />
                        <polyline points="9 14 12 11 15 14" />
                    </svg>
                    <span class="button-label">Manager</span>
                    <span class="button-count" v-if="availableResumeCount > 1">({{ availableResumeCount }})</span>
                </button>
            </div>
            <!-- Color Palette Row -->
            <div class="header-controls-row">
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
            </div>
            <div id="resume-divs-sorting-container" tabindex="-1">
                <select id="resume-divs-sorting-selector" v-model="sortRuleKey" tabindex="0">
                    <option v-for="option in sortOptions" :key="option.key" :value="option.key">
                        {{ option.text }}
                    </option>
                </select>
            </div>
            <div id="resume-divs-controls">
                <button @click="selectFirst" class="resume-divs-control-button">First</button>
                <button @click="selectPrevious" class="resume-divs-control-button">Prev</button>
                <button @click="selectNext" class="resume-divs-control-button">Next</button>
                <button @click="selectLast" class="resume-divs-control-button">Last</button>
                <button @click="clearAllResumeDivs" class="resume-divs-control-button">Clear</button>
            </div>
        </div>
        <div id="resume-content-div-wrapper" ref="resumeContentWrapperRef" class="scrollable-container" @scroll="onResumeContentWrapperScroll">
            <div id="resume-content-div" class="resume-content-div-container">
                <!-- Skill cards only appear as appended copies in the list below; top panel hidden to avoid duplicate. -->
                <div v-if="false" id="skill-resume-divs-panel" class="skill-resume-divs-panel">
                    <div ref="resumeSkillCardRef" class="skill-resume-div" :data-color-index="selectedSkillCard?.referencingJobNumbers?.[0] ?? 0" @click="onResumeSkillCardClick">
                        <span class="skill-resume-div-skill-name">{{ selectedSkillCard.skillName }}</span>
                        <div class="skill-resume-div-back-links">
                            <button
                                v-for="jobNum in selectedSkillCard.referencingJobNumbers"
                                :key="jobNum"
                                type="button"
                                class="skill-resume-div-back-link"
                                aria-label="Go to job"
                                @click="goToJob(jobNum)"
                            >
                                <img class="back-icon" src="/static_content/icons/anchors/icons8-back-16-black.png" alt="" width="16" height="16" aria-hidden="true" />
                            </button>
                        </div>
                        <span v-if="selectedSkillCard.totalYearsExperience > 0" class="skill-resume-div-years">({{ selectedSkillCard.totalYearsExperience }} year{{ selectedSkillCard.totalYearsExperience !== 1 ? 's' : '' }} experience)</span>
                        <button type="button" class="skill-resume-div-close" aria-label="Remove skill card from resume listing" @click.prevent="removeSkillCardFromResumeListing">×</button>
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
#resume-content-header > p {
    margin-block-start: 0.5em;
    margin-block-end: 0.5em;
}

#resume-content-div-wrapper {
    flex-grow: 1;
    /* overflow-y is now controlled by the ResumeListScrollContainer */
    overflow-x: visible; /* bizCardLineItems (rDivs) must never be clipped by their container */
    background-color: var(--grey-medium);
    color: black; /* default for empty area; .biz-resume-div and .skill-resume-div set their own color */
    position: relative; /* Needed for the absolute positioning of items by the scroller */
    /* 8px horizontal padding so selected rDiv box-shadow (8px ring) has room; matches cDiv selected border */
    padding-left: 8px;
    padding-right: 8px;
    /* overflow is set by ResumeListScrollContainer.setupContainer() to 'auto' */
    scroll-behavior: smooth; /* Enable smooth scrolling for all scrollIntoView and scrollTo operations */
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

#resume-divs-controls {
    display: flex;
    gap: 5px;
    margin-top: 10px;
    width: 100%;
    position: relative; /* Needed for z-index to apply */
    z-index: 100; /* High z-index to ensure it's on top of other elements */
    flex-wrap: wrap; /* Allow wrapping for the 2x2 layout */
}
.resume-divs-control-button {
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
    #resume-divs-controls .resume-divs-control-button {
        flex-basis: calc(50% - 2.5px); /* 2 buttons per row, accounting for gap */
    }
}

/* 1x4 (single column) layout for narrow widths */
@container (max-width: 160px) {
    #resume-divs-controls {
        flex-direction: column;
    }
}

.resume-divs-control-button:hover {
    background-color: var(--grey-dark-7);
}

/* Resume controls row - current resume indicator and resume manager button */
.resume-controls-row {
    display: flex;
    gap: 8px;
    align-items: center;
    padding: 5px 0;
    width: 100%;
    justify-content: space-between;
}

/* Header controls row - color palette selector */
.header-controls-row {
    display: flex;
    gap: 8px;
    align-items: center;
    padding: 5px 0;
    width: 100%;
}

#color-palette-container {
    position: relative;
    display: flex;
    flex: 1 1 auto;
}

#resume-divs-sorting-container {
    position: relative;
    display: flex;
    padding: 5px 0;
    width: 100%;
}

/* Resume Manager button - matches other control styling */
.current-resume-indicator {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    background: linear-gradient(135deg, #2a5298 0%, #1e3a70 100%);
    color: white;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 4px;
    font-weight: bold;
    font-size: 13px;
    text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8);
    white-space: nowrap;
    flex-shrink: 0;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
    cursor: help;
}

.current-resume-indicator svg {
    flex-shrink: 0;
    opacity: 0.9;
}

.resume-manager-button {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    background: linear-gradient(135deg, #28a745 0%, #20803a 100%);
    color: white;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 4px;
    cursor: pointer;
    font-weight: bold;
    text-shadow: 1px 1px 1px rgba(0, 0, 0, 0.8);
    white-space: nowrap;
    transition: all 0.2s ease;
    flex-shrink: 0;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}

.resume-manager-button:hover {
    background: linear-gradient(135deg, #32c252 0%, #28a745 100%);
    box-shadow: 0 3px 6px rgba(0, 0, 0, 0.4);
    transform: translateY(-1px);
}

.resume-manager-button:active {
    transform: translateY(0);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

.resume-manager-button svg {
    flex-shrink: 0;
}

.resume-manager-button .button-label {
    font-size: 14px;
}

.resume-manager-button .button-count {
    font-size: 12px;
    opacity: 0.9;
    font-weight: normal;
}

/* Hide button label and resume indicator on very small containers */
@container (max-width: 300px) {
    .resume-manager-button .button-label,
    .resume-manager-button .button-count {
        display: none;
    }
    .current-resume-indicator {
        font-size: 11px;
        padding: 6px 10px;
    }
    .current-resume-indicator svg {
        width: 12px;
        height: 12px;
    }
}
#color-palette-selector,
#resume-divs-sorting-selector {
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
#resume-divs-sorting-selector:hover {
    background-color: var(--grey-dark-7);
}

/* Style dropdown options for better visibility */
#color-palette-selector option,
#resume-divs-sorting-selector option {
    background-color: #2a2a2a;
    color: white;
    padding: 8px;
    font-weight: normal;
}

/* Resume-view skill card panel (v-if=false; appended copies use global block + scene.css). */
.skill-resume-divs-panel {
    flex-shrink: 0;
    padding: 8px 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
    background-color: var(--grey-dark-6);
    border-bottom: 1px solid rgba(255, 255, 255, 0.15);
}
/* rDiv styles in global block below */

/* .viewer-label styling consolidated in AppContent.vue */
</style>

<style>
/* Global styles for rDivs and skill-resume-div - not scoped to ensure they apply to dynamically created elements */
/* Normal border/padding/outline/radius come from scene.css (shared .biz-card-div, .biz-resume-div rule). */

/* skill-resume-div: layout only; padding/border/background from scene.css shared rule (synced with skill-card-div) */
.skill-resume-div {
    position: relative;
    width: 100%;
    padding: var(--data-normal-padding);
    padding-right: 36px; /* room for close button */
    min-height: 44px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    gap: 4px;
    box-sizing: border-box;
    cursor: pointer;
}
/* Close button: match r-div-close (circular, white bg, red border) */
.skill-resume-div-close {
    position: absolute;
    top: 6px;
    right: 8px;
    left: auto;
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
.skill-resume-div-close:hover {
    color: #f00;
    border-color: #f00;
    background: rgba(255, 255, 255, 0.9);
}
.skill-resume-div-skill-name {
    text-align: left;
}
.skill-resume-div-back-links {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
}
.skill-resume-div-back-link {
    padding: 0 2px;
    line-height: 0;
    border: none;
    box-shadow: none;
    background: transparent !important;
    background-color: transparent !important;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
}
.skill-resume-div-back-link .back-icon {
    display: block;
    background: transparent !important;
    background-color: transparent !important;
}
.skill-resume-div-back-link:hover {
    opacity: 0.8;
}
.skill-resume-div-years {
    font-size: 14px;
    text-decoration: underline;
}
.appended-skill-resume-div {
    flex-shrink: 0;
}

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

/* Base rDiv layout and sizing only. Spacing between items from flex container gap (ResumeListScrollContainer contentHolder). */
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

    /* Positioning context for close button */
    position: relative;

    /* Styling */
    background-color: transparent !important;
    border-radius: 25px !important;
    gap: 0; /* Controlled spacing in child sections */
}

/* Force all nested children to have transparent backgrounds */
.biz-resume-div .biz-resume-details-div * {
    background-color: transparent !important;
}

/* Close button styling - positioned at top right */
/* IMPORTANT: Must be more specific than .biz-resume-div .biz-resume-details-div * to override transparent */
.biz-resume-div .biz-resume-details-div .biz-resume-close-btn {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 24px !important;
    height: 24px !important;
    min-width: 24px !important;
    min-height: 24px !important;
    background: rgba(0, 0, 0, 0.8) !important; /* Override transparent - darker for better contrast */
    border: 2px solid rgba(255, 255, 255, 0.5) !important; /* Thicker border */
    border-radius: 4px;
    padding: 0 !important; /* Remove padding so SVG fills button */
    margin: 0 !important;
    cursor: pointer;
    color: #fff !important;
    transition: all 0.2s;
    opacity: 1 !important; /* Full opacity */
    z-index: 1000;
    display: flex !important;
    align-items: center;
    justify-content: center;
    pointer-events: auto !important;
    overflow: visible !important;
}

.biz-resume-div .biz-resume-details-div .biz-resume-close-btn:hover {
    background: rgba(255, 0, 0, 0.9) !important; /* Bright red */
    border-color: rgba(255, 255, 255, 0.8) !important;
    transform: scale(1.1); /* Slight zoom on hover */
}

.biz-resume-div .biz-resume-details-div .biz-resume-close-btn svg {
    display: block !important;
    width: 16px !important;
    height: 16px !important;
    pointer-events: none;
    flex-shrink: 0;
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

/* Hovered state – 2px #929292 outer, 1px #0028fb inner (match scene.css biz/skill unselected hover) */
.biz-resume-div:not(.selected).hovered {
    background-color: var(--data-background-color-hovered) !important;
    color: var(--data-foreground-color-hovered) !important;
    padding: var(--data-normal-padding);
    border: 1px solid #0028fb !important;
    outline: 2px solid #929292 !important;
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

/* Skill rDiv normal/hovered/selected: defined in scene.css (same as biz, half border-radius). */

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