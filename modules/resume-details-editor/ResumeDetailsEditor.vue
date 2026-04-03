<template>
  <Teleport to="body">
    <div v-if="isOpen" class="rde-overlay" @click.self="onOverlayClick">
      <div
        ref="modalRef"
        class="rde-modal"
        :style="modalStyle"
        @keydown="onModalTabNavigate"
      >
        <div
          class="rde-header rde-drag-handle"
          @mousedown.prevent="startDrag"
        >
          <div class="rde-title">Resume Details</div>
          <div class="rde-subtitle">{{ resumeId }}</div>
        </div>

        <div class="rde-tabs" role="tablist" aria-label="Resume details sections">
          <button
            v-for="t in tabs"
            :key="t.id"
            type="button"
            class="rde-tab"
            role="tab"
            tabindex="-1"
            :aria-selected="activeTab === t.id"
            :data-rde-tab-id="t.id"
            :class="{ active: activeTab === t.id }"
            :disabled="saving || reparsing || otherSectionsAutosaving || fieldAutosaving"
            @click="selectTab(t.id)"
          >
            {{ t.label }}
          </button>
        </div>

        <div class="rde-body">
          <MetaTab
            v-if="activeTab === 'meta'"
            :meta="meta"
            @update:meta="onMetaUpdate"
            @autosave="onMetaAutosave"
          />
          <OtherSectionsTab
            v-if="activeTab === 'other-sections'"
            :data="otherSections"
            @update:data="onOtherSectionsUpdate"
            @autosave="onOtherSectionsAutosave"
          />
          <EducationTab
            v-if="activeTab === 'education'"
            :data="education"
            @update:data="onEducationUpdate"
            @autosave="onEducationAutosave"
          />
          <JobsTab
            v-if="activeTab === 'resume-jobs'"
            ref="jobsTabRef"
            :resume-id="resumeId"
            :reload-nonce="reloadNonce"
            :selected-job-index="sharedJobIndex"
            @update:selected-job-index="sharedJobIndex = $event"
            @saved="onJobsSaved"
            @open-skills-for-job="openSkillsForJob"
            @content-ready="onResumeJobsOrSkillsPanelReady"
          />
          <SkillsTab
            v-if="activeTab === 'job-skills'"
            ref="skillsTabRef"
            :resume-id="resumeId"
            :reload-nonce="reloadNonce"
            :selected-job-index="sharedJobIndex"
            @update:selected-job-index="sharedJobIndex = $event"
            @saved="onSkillsSaved"
            @content-ready="onResumeJobsOrSkillsPanelReady"
          />
        </div>

        <div v-if="reparsing || reparseOutput" class="rde-parser-output-wrap">
          <textarea
            class="rde-parser-output"
            v-model="reparseOutput"
            readonly
            rows="10"
            spellcheck="false"
            ref="reparseTextareaRef"
          ></textarea>
        </div>

        <div class="rde-footer">
          <button type="button" class="rde-btn cancel" @click="cancel">Cancel</button>
          <button
            type="button"
            class="rde-btn reparse"
            @click="reparse"
            :disabled="reparseButtonDisabled"
            :title="reparseButtonTitle"
          >
            {{ reparsing ? 'Reparsing…' : 'Reparse…' }}
          </button>
          <button
            type="button"
            class="rde-btn save"
            @click="save"
            :disabled="saveButtonDisabled"
            :title="saveButtonTitle"
          >
            {{ saving ? 'Saving…' : 'Save' }}
          </button>
        </div>

        <!-- Resize handles: edges and corner (no top to avoid conflicting with drag) -->
        <div class="rde-resize-handle rde-resize-left" @mousedown.prevent="startResize($event, 'w')" title="Resize from left" />
        <div class="rde-resize-handle rde-resize-right" @mousedown.prevent="startResize($event, 'e')" title="Resize from right" />
        <div class="rde-resize-handle rde-resize-bottom" @mousedown.prevent="startResize($event, 's')" title="Resize from bottom" />
        <div class="rde-resize-handle rde-resize-corner" @mousedown.prevent="startResize($event, 'se')" title="Resize" />
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, shallowRef, computed, watch, nextTick } from 'vue';
import { hasServer } from '@/modules/core/hasServer.mjs';
import MetaTab from './tabs/MetaTab.vue';
import OtherSectionsTab from './tabs/OtherSectionsTab.vue';
import EducationTab from './tabs/EducationTab.vue';
import JobsTab from './tabs/JobsTab.vue';
import SkillsTab from './tabs/SkillsTab.vue';
import * as api from './api.mjs';
import { reparseResumeWithParserStream } from '@/modules/api/resumeManagerApi.mjs';
import { reportError } from '@/modules/utils/errorReporting.mjs';

const MIN_WIDTH = 320;
const MIN_HEIGHT = 240;

const props = defineProps({
  isOpen: { type: Boolean, default: false },
  resumeId: { type: String, default: '' },
  /** When opening, show this tab first (e.g. 'job-skills' when opened from edit icon). */
  initialTab: { type: String, default: 'meta' },
  /** When opening on Job skills tab, preselect this job index (0-based). */
  initialJobIndex: { type: Number, default: null },
});

const emit = defineEmits(['close', 'saved']);

const tabs = [
  { id: 'meta', label: 'Meta' },
  { id: 'other-sections', label: 'Other sections' },
  { id: 'resume-jobs', label: 'Resume jobs' },
  { id: 'job-skills', label: 'Job skills' },
  { id: 'education', label: 'Education' }
];

const activeTab = ref('meta');
/** Shared 0-based job index for Resume jobs + Job skills tabs (kept in sync when switching tabs). */
const sharedJobIndex = ref(null);
const meta = shallowRef({});
const otherSections = shallowRef({});
const education = shallowRef({});
const saving = ref(false);
const reparsing = ref(false);
const canEdit = hasServer();
const reloadNonce = ref(0);

const jobsTabRef = ref(null);
const skillsTabRef = ref(null);
const otherSectionsAutosaving = ref(false);
const fieldAutosaving = ref(false);
const reparseOutput = ref('');
const reparseTextareaRef = ref(null);
let reparseAbortController = null;

// Pending edits (only save what changed)
const pendingMeta = shallowRef(null);
const pendingOtherSections = shallowRef(null);
const pendingEducation = shallowRef(null);

// Modal dimensions and position (center-based with drag offset)
const modalRef = ref(null);
const modalWidth = ref(720);
const modalHeight = ref(560);
const dragOffset = ref({ x: 0, y: 0 });
const isDragging = ref(false);
const isResizing = ref(false);
/** Ignore next overlay click so resize/drag mouseup doesn't close modal */
const ignoreNextOverlayClick = ref(false);
let dragStart = { x: 0, y: 0, ox: 0, oy: 0 };
let resizeStart = { x: 0, y: 0, w: 0, h: 0, ox: 0, oy: 0 };
/** Corner resize: only apply after pointer moved this many px to reduce sensitivity */
const RESIZE_CORNER_THRESHOLD = 6;

function getViewportMaxSize() {
  return { w: window.innerWidth, h: window.innerHeight };
}

/** Clamp drag offset so modal stays fully inside viewport */
function clampDragOffset() {
  const v = getViewportMaxSize();
  const halfW = modalWidth.value / 2;
  const halfH = modalHeight.value / 2;
  const maxX = v.w / 2 - halfW;
  const maxY = v.h / 2 - halfH;
  dragOffset.value = {
    x: Math.max(-maxX, Math.min(maxX, dragOffset.value.x)),
    y: Math.max(-maxY, Math.min(maxY, dragOffset.value.y))
  };
}

/** Clamp size so modal fits in viewport and enforce min size */
function clampSize() {
  const v = getViewportMaxSize();
  const centerX = window.innerWidth / 2 + dragOffset.value.x;
  const centerY = window.innerHeight / 2 + dragOffset.value.y;
  const maxW = Math.min(v.w, Math.min(centerX * 2, (v.w - centerX) * 2));
  const maxH = Math.min(v.h, Math.min(centerY * 2, (v.h - centerY) * 2));
  modalWidth.value = Math.max(MIN_WIDTH, Math.min(modalWidth.value, maxW));
  modalHeight.value = Math.max(MIN_HEIGHT, Math.min(modalHeight.value, maxH));
  clampDragOffset();
}

const modalStyle = computed(() => ({
  width: `${modalWidth.value}px`,
  height: `${modalHeight.value}px`,
  transform: `translate(calc(-50% + ${dragOffset.value.x}px), calc(-50% + ${dragOffset.value.y}px))`
}));

function isRdeModalFocusable(el) {
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
  if (el.hasAttribute('disabled')) return false;
  if (el.getAttribute('tabindex') === '-1') return false;
  const tag = el.tagName;
  if (tag === 'INPUT' && el.type === 'hidden') return false;
  if (!['BUTTON', 'INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return false;
  const s = getComputedStyle(el);
  if (s.visibility === 'hidden' || s.display === 'none') return false;
  const r = el.getBoundingClientRect();
  if (r.width <= 0 && r.height <= 0) return false;
  return true;
}

/**
 * Focusables in tree/document order under `root` (matches reading order when markup follows layout).
 */
function walkFocusablesInDocumentOrder(root) {
  if (!root) return [];
  const list = [];
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT,
    {
      acceptNode(node) {
        if (node.nodeType !== Node.ELEMENT_NODE) return NodeFilter.FILTER_SKIP;
        const tag = node.tagName;
        if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(tag)) {
          if (isRdeModalFocusable(node)) return NodeFilter.FILTER_ACCEPT;
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_SKIP;
      }
    }
  );
  let n = walker.nextNode();
  while (n) {
    list.push(n);
    n = walker.nextNode();
  }
  return list;
}

/**
 * Content + footer: DOM order in .rde-body, then parser output (if shown), then footer (through Save).
 * Section tab buttons use tabindex=-1. Tab from Save switches section and focuses the next panel’s first
 * field. Last panel’s Save wraps to Meta’s first field. See onModalTabNavigate.
 */
function collectContentFocusablesReadingOrder(modalEl) {
  const parts = [];
  const body = modalEl.querySelector('.rde-body');
  if (body) parts.push(...walkFocusablesInDocumentOrder(body));
  const parserWrap = modalEl.querySelector('.rde-parser-output-wrap');
  if (parserWrap) parts.push(...walkFocusablesInDocumentOrder(parserWrap));
  const footer = modalEl.querySelector('.rde-footer');
  if (footer) parts.push(...walkFocusablesInDocumentOrder(footer));
  return parts;
}

function isTabStripButton(el) {
  return Boolean(el?.classList?.contains('rde-tab') && el.closest?.('.rde-tabs'));
}

function isInsideRdeSkillGrid(el) {
  return Boolean(el?.closest?.('.rde-skill-grid'));
}

function focusLastContentFocusable(modalEl) {
  const list = collectContentFocusablesReadingOrder(modalEl);
  if (!list.length) return;
  const last = list[list.length - 1];
  try {
    last.focus({ preventScroll: false });
  } catch {
    last.focus();
  }
}

function onModalTabNavigate(e) {
  if (e.key !== 'Tab' || !props.isOpen) return;
  const modal = modalRef.value;
  if (!modal?.contains(document.activeElement)) return;

  const active = document.activeElement;
  // Job skills / skill grid: SkillsTab may handle Tab (letter-cycle). Otherwise native Tab within grid;
  // from the last grid focusable, forward Tab must reach footer (browser order can skip it).
  if (activeTab.value === 'job-skills' && isInsideRdeSkillGrid(active) && !isTabStripButton(active)) {
    const grid = active.closest('.rde-skill-grid');
    if (grid && modal.contains(grid)) {
      const gridFocusables = walkFocusablesInDocumentOrder(grid);
      if (gridFocusables.length) {
        if (e.shiftKey && gridFocusables[0] === active) {
          e.preventDefault();
          const fullList = collectContentFocusablesReadingOrder(modal);
          const gi = fullList.indexOf(active);
          if (gi > 0) {
            try {
              fullList[gi - 1].focus({ preventScroll: false });
            } catch {
              fullList[gi - 1].focus();
            }
          }
          return;
        }
        if (!e.shiftKey && gridFocusables[gridFocusables.length - 1] === active) {
          e.preventDefault();
          const footer = modal.querySelector('.rde-footer');
          const footerList = footer ? walkFocusablesInDocumentOrder(footer) : [];
          if (footerList.length) {
            try {
              footerList[0].focus({ preventScroll: false });
            } catch {
              footerList[0].focus();
            }
          }
          return;
        }
      }
    }
    return;
  }

  const contentList = collectContentFocusablesReadingOrder(modal);
  const onStrip = isTabStripButton(active);

  /**
   * Section tab buttons use tabindex=-1 and are not in the Tab cycle. Order is panel body → parser (if any)
   * → footer through Save; Tab from Save runs selectTab(next) and focuses that panel’s first field.
   */
  if (e.shiftKey) {
    if (onStrip) {
      const stripId = active.getAttribute('data-rde-tab-id');
      const curIdx = stripId ? tabs.findIndex((t) => t.id === stripId) : -1;
      if (curIdx < 0) return;
      e.preventDefault();
      if (curIdx > 0) {
        const prevId = tabs[curIdx - 1].id;
        void (async () => {
          await selectTab(prevId);
          if (!props.isOpen || activeTab.value !== prevId) return;
          await nextTick();
          await nextTick();
          const m = modalRef.value;
          if (m) focusLastContentFocusable(m);
        })();
        return;
      }
      const lastId = tabs[tabs.length - 1].id;
      void (async () => {
        await selectTab(lastId);
        if (!props.isOpen || activeTab.value !== lastId) return;
        await nextTick();
        await nextTick();
        const m = modalRef.value;
        if (m) focusLastContentFocusable(m);
      })();
      return;
    }

    const idx = contentList.indexOf(active);
    if (idx > 0) {
      e.preventDefault();
      contentList[idx - 1].focus();
      return;
    }
    if (idx === 0) {
      e.preventDefault();
      const curIdx = tabs.findIndex((t) => t.id === activeTab.value);
      if (curIdx <= 0) {
        const lastId = tabs[tabs.length - 1].id;
        void (async () => {
          await selectTab(lastId);
          if (!props.isOpen || activeTab.value !== lastId) return;
          await nextTick();
          await nextTick();
          const m = modalRef.value;
          if (m) focusLastContentFocusable(m);
        })();
        return;
      }
      const prevId = tabs[curIdx - 1].id;
      void (async () => {
        await selectTab(prevId);
        if (!props.isOpen || activeTab.value !== prevId) return;
        await nextTick();
        await nextTick();
        const m = modalRef.value;
        if (m) focusLastContentFocusable(m);
      })();
    }
    return;
  }

  // Forward Tab
  if (onStrip) {
    const stripId = active.getAttribute('data-rde-tab-id');
    if (!stripId) return;
    e.preventDefault();
    void (async () => {
      await selectTab(stripId);
      if (!props.isOpen || activeTab.value !== stripId) return;
      scheduleFocusTopLeftAfterTabChange();
    })();
    return;
  }

  const idx = contentList.indexOf(active);
  if (idx < 0) return;
  if (idx < contentList.length - 1) {
    e.preventDefault();
    contentList[idx + 1].focus();
    return;
  }

  const curIdx = tabs.findIndex((t) => t.id === activeTab.value);
  if (curIdx < 0) return;
  e.preventDefault();
  if (curIdx < tabs.length - 1) {
    const nextId = tabs[curIdx + 1].id;
    void (async () => {
      await selectTab(nextId);
      if (!props.isOpen || activeTab.value !== nextId) return;
      scheduleFocusTopLeftAfterTabChange();
    })();
    return;
  }

  void (async () => {
    await selectTab('meta');
    if (!props.isOpen || activeTab.value !== 'meta') return;
    scheduleFocusTopLeftAfterTabChange();
  })();
}

/** First focusable in .rde-body area (reading order), excluding the section tab strip. */
function focusTopLeftContentField() {
  if (!props.isOpen) return false;
  const modal = modalRef.value;
  if (!modal) return false;
  // Jobs / Job skills: job dropdown is always first (see JobsTab / SkillsTab DOM order).
  if (activeTab.value === 'resume-jobs') {
    const el = modal.querySelector('#rde-jobs-job-select');
    if (el && isRdeModalFocusable(el)) {
      try {
        el.focus({ preventScroll: false });
      } catch {
        el.focus();
      }
      return true;
    }
  }
  if (activeTab.value === 'job-skills') {
    const el = modal.querySelector('#rde-skills-job-select');
    if (el && isRdeModalFocusable(el)) {
      try {
        el.focus({ preventScroll: false });
      } catch {
        el.focus();
      }
      return true;
    }
  }
  const list = collectContentFocusablesReadingOrder(modal);
  if (!list.length) return false;
  const el = list[0];
  try {
    el.focus({ preventScroll: false });
  } catch {
    el.focus();
  }
  return true;
}

/**
 * After switching section tab or opening the modal, move focus to the panel's top-left field.
 * Deferred pass helps Jobs/Skills tabs that mount inputs after fetch.
 */
/** JobsTab / SkillsTab fetch finishes after mount; re-run focus so job selects exist and are enabled. */
function onResumeJobsOrSkillsPanelReady() {
  if (!props.isOpen) return;
  if (activeTab.value !== 'resume-jobs' && activeTab.value !== 'job-skills') return;
  scheduleFocusTopLeftAfterTabChange();
}

function scheduleFocusTopLeftAfterTabChange() {
  if (!props.isOpen) return;
  nextTick(() => {
    nextTick(() => {
      requestAnimationFrame(() => {
        if (!props.isOpen) return;
        focusTopLeftContentField();
        setTimeout(() => {
          if (!props.isOpen) return;
          const modal = modalRef.value;
          if (!modal) return;
          const list = collectContentFocusablesReadingOrder(modal);
          if (!list.length) return;
          const first = list[0];
          const ae = document.activeElement;
          if (isTabStripButton(ae)) {
            first.focus();
            return;
          }
          if (!list.includes(ae)) {
            first.focus();
          }
        }, 0);
      });
    });
  });
}

watch(
  () => [props.isOpen, activeTab.value],
  ([open]) => {
    if (!open) return;
    scheduleFocusTopLeftAfterTabChange();
  },
  { flush: 'post' }
);

function onOverlayClick() {
  if (ignoreNextOverlayClick.value || isDragging.value || isResizing.value) {
    if (ignoreNextOverlayClick.value) ignoreNextOverlayClick.value = false;
    return;
  }
  cancel();
}

function startDrag(e) {
  if (e.button !== 0) return;
  isDragging.value = true;
  dragStart = { x: e.clientX, y: e.clientY, ox: dragOffset.value.x, oy: dragOffset.value.y };
  document.addEventListener('mousemove', onDragMove);
  document.addEventListener('mouseup', onDragEnd);
}

function onDragMove(e) {
  const v = getViewportMaxSize();
  const halfW = modalWidth.value / 2;
  const halfH = modalHeight.value / 2;
  let x = dragStart.ox + (e.clientX - dragStart.x);
  let y = dragStart.oy + (e.clientY - dragStart.y);
  const maxX = v.w / 2 - halfW;
  const maxY = v.h / 2 - halfH;
  x = Math.max(-maxX, Math.min(maxX, x));
  y = Math.max(-maxY, Math.min(maxY, y));
  dragOffset.value = { x, y };
}

function onDragEnd() {
  document.removeEventListener('mousemove', onDragMove);
  document.removeEventListener('mouseup', onDragEnd);
  isDragging.value = false;
  ignoreNextOverlayClick.value = true;
  setTimeout(() => { ignoreNextOverlayClick.value = false; }, 0);
}

function startResize(e, direction) {
  if (e.button !== 0) return;
  isResizing.value = true;
  resizeStart = {
    x: e.clientX,
    y: e.clientY,
    w: modalWidth.value,
    h: modalHeight.value,
    ox: dragOffset.value.x,
    oy: dragOffset.value.y,
    direction,
    cornerActivated: false
  };
  document.addEventListener('mousemove', onResizeMove);
  document.addEventListener('mouseup', onResizeEnd);
}

function onResizeMove(e) {
  const v = getViewportMaxSize();
  const dx = e.clientX - resizeStart.x;
  const dy = e.clientY - resizeStart.y;
  const dir = resizeStart.direction;

  // For corner (se), require threshold before applying so it's less sensitive
  if (dir === 'se') {
    if (!resizeStart.cornerActivated) {
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < RESIZE_CORNER_THRESHOLD) return;
      resizeStart.cornerActivated = true;
    }
  }

  let w = resizeStart.w;
  let h = resizeStart.h;
  let ox = resizeStart.ox;
  let oy = resizeStart.oy;

  if (dir === 'e' || dir === 'se') {
    w = Math.max(MIN_WIDTH, Math.min(resizeStart.w + dx, v.w));
  }
  if (dir === 'w') {
    const newW = Math.max(MIN_WIDTH, Math.min(resizeStart.w - dx, v.w));
    const deltaW = newW - resizeStart.w;
    w = newW;
    ox = resizeStart.ox - deltaW / 2;
  }
  if (dir === 's' || dir === 'se') {
    h = Math.max(MIN_HEIGHT, Math.min(resizeStart.h + dy, v.h));
  }

  modalWidth.value = w;
  modalHeight.value = h;
  if (dir === 'w') dragOffset.value = { ...dragOffset.value, x: ox };
  clampSize();
}

function onResizeEnd() {
  document.removeEventListener('mousemove', onResizeMove);
  document.removeEventListener('mouseup', onResizeEnd);
  isResizing.value = false;
  ignoreNextOverlayClick.value = true;
  setTimeout(() => { ignoreNextOverlayClick.value = false; }, 0);
}

watch(() => [props.isOpen, props.resumeId], ([open, id]) => {
  if (!open || !id || id === 'default') return;
  const tab = props.initialTab && tabs.some(t => t.id === props.initialTab) ? props.initialTab : 'meta';
  activeTab.value = tab;
  sharedJobIndex.value = props.initialJobIndex != null && props.initialJobIndex >= 0
    ? Number(props.initialJobIndex)
    : null;
  dragOffset.value = { x: 0, y: 0 };
  const v = getViewportMaxSize();
  modalWidth.value = Math.max(MIN_WIDTH, Math.min(720, Math.floor(v.w * 0.92)));
  modalHeight.value = Math.max(MIN_HEIGHT, Math.min(Math.floor(v.h * 0.8), 720));
  clampDragOffset();
  pendingMeta.value = null;
  pendingOtherSections.value = null;
  pendingEducation.value = null;
  reparseOutput.value = '';
  reloadNonce.value++;
  setTimeout(async () => {
    try {
      const [metaRes, otherRes, educationRes] = await Promise.all([
        api.getResumeMeta(id).catch(() => ({})),
        api.getResumeOtherSections(id).catch(() => ({})),
        api.getResumeEducation(id).catch(() => ({}))
      ]);
      meta.value = typeof metaRes === 'object' && metaRes !== null ? { ...metaRes } : metaRes;
      otherSections.value = typeof otherRes === 'object' && otherRes !== null ? { ...otherRes } : otherRes;
      education.value = typeof educationRes === 'object' && educationRes !== null ? { ...educationRes } : {};
    } catch (err) {
      console.error('[ResumeDetailsEditor] load failed:', err);
    }
  }, 0);
}, { immediate: true });

const canReparse = computed(() => {
  return Boolean(props.resumeId && props.resumeId !== 'default');
});

const saveButtonDisabled = computed(() => saving.value || !canEdit);
const saveButtonTitle = computed(() => {
  if (!canEdit) return 'Save requires a server with the resume API (not available on static hosting).';
  if (saving.value) return 'Saving in progress…';
  return 'Save pending changes and close';
});

const reparseButtonDisabled = computed(
  () => saving.value || reparsing.value || !canEdit || !canReparse.value
);
const reparseButtonTitle = computed(() => {
  if (!canEdit) return 'Reparse requires a server with the resume API.';
  if (saving.value) return 'Wait until save finishes.';
  if (reparsing.value) return 'Reparsing in progress…';
  if (!canReparse.value) return 'Select a saved resume (not the default placeholder) to reparse.';
  return 'Delete derived files in this resume folder and re-run the parser (keeps only the original .docx/.pdf)';
});

/** Clear stale async flags when the modal opens or closes so footer actions are not stuck disabled. */
watch(
  () => props.isOpen,
  (open) => {
    saving.value = false;
    reparsing.value = false;
    fieldAutosaving.value = false;
    otherSectionsAutosaving.value = false;
    if (!open) return;
    if (!canEdit) {
      console.warn(
        '[ResumeDetailsEditor] Save and Reparse are disabled: no API server (e.g. static / GitHub Pages hosting).'
      );
    } else if (!props.resumeId || props.resumeId === 'default') {
      console.warn(
        '[ResumeDetailsEditor] Reparse is disabled: resumeId is missing or "default". Save may still run for in-memory edits.'
      );
    }
  }
);

function onMetaUpdate(updates) {
  pendingMeta.value = updates;
}

async function onMetaAutosave() {
  if (!canEdit) return;
  if (!props.resumeId || props.resumeId === 'default') return;
  if (fieldAutosaving.value) return;
  if (!pendingMeta.value) return;

  fieldAutosaving.value = true;
  try {
    const id = props.resumeId;
    const u = pendingMeta.value;
    await api.updateResumeMeta(id, u);
    meta.value = { ...meta.value, ...u };
    pendingMeta.value = null;
    emit('saved', { metaSaved: true });
  } catch (err) {
    reportError(err, '[ResumeDetailsEditor] autosave meta failed', '');
    alert('Failed to autosave meta: ' + (err instanceof Error ? err.message : String(err)));
  } finally {
    fieldAutosaving.value = false;
  }
}

function onOtherSectionsUpdate(data) {
  if (otherSectionsAutosaving.value) return;
  pendingOtherSections.value = data;
}

async function onOtherSectionsAutosave(snapshot) {
  if (!canEdit) return;
  if (!props.resumeId || props.resumeId === 'default') return;
  if (otherSectionsAutosaving.value) return;
  if (!snapshot || typeof snapshot !== 'object') return;

  otherSectionsAutosaving.value = true;
  try {
    const id = props.resumeId;
    await api.updateResumeOtherSections(id, snapshot);
    otherSections.value = snapshot;
    pendingOtherSections.value = null;
    // Do not use `metaSaved` so the resume list doesn't unnecessarily refetch.
    emit('saved', { otherSectionsSaved: true });
  } catch (err) {
    reportError(err, '[ResumeDetailsEditor] autosave other sections failed', '');
    alert('Failed to autosave other sections: ' + (err instanceof Error ? err.message : String(err)));
  } finally {
    otherSectionsAutosaving.value = false;
  }
}
function onEducationUpdate(data) {
  pendingEducation.value = data;
}

async function onEducationAutosave() {
  if (!canEdit) return;
  if (!props.resumeId || props.resumeId === 'default') return;
  if (fieldAutosaving.value) return;
  if (pendingEducation.value === null) return;

  fieldAutosaving.value = true;
  try {
    const id = props.resumeId;
    const data = pendingEducation.value;
    await api.updateResumeEducation(id, data);
    education.value = typeof data === 'object' && data !== null ? { ...data } : data;
    pendingEducation.value = null;
    emit('saved', { educationSaved: true });
  } catch (err) {
    reportError(err, '[ResumeDetailsEditor] autosave education failed', '');
    alert('Failed to autosave education: ' + (err instanceof Error ? err.message : String(err)));
  } finally {
    fieldAutosaving.value = false;
  }
}

/**
 * Persist edits for the tab that is currently visible before switching away.
 * @returns {Promise<boolean>} false if a job/skills save failed (caller should not change tab)
 */
async function flushCurrentTabBeforeLeave() {
  const id = props.resumeId;
  if (!id || id === 'default') return true;
  const tab = activeTab.value;

  if (tab === 'meta' && pendingMeta.value) {
    const u = pendingMeta.value;
    await api.updateResumeMeta(id, u);
    pendingMeta.value = null;
    meta.value = { ...meta.value, ...u };
    emit('saved', { metaSaved: true });
  }
  if (tab === 'other-sections' && pendingOtherSections.value !== null) {
    const data = pendingOtherSections.value;
    await api.updateResumeOtherSections(id, data);
    pendingOtherSections.value = null;
    otherSections.value = typeof data === 'object' && data !== null ? { ...data } : data;
    emit('saved', { metaSaved: true });
  }
  if (tab === 'education' && pendingEducation.value !== null) {
    const data = pendingEducation.value;
    await api.updateResumeEducation(id, data);
    pendingEducation.value = null;
    education.value = typeof data === 'object' && data !== null ? { ...data } : data;
    emit('saved', { metaSaved: true });
  }
  if (tab === 'resume-jobs' && jobsTabRef.value?.saveCurrentJob) {
    const ok = await jobsTabRef.value.saveCurrentJob();
    if (ok === false) return false;
  }
  if (tab === 'job-skills' && skillsTabRef.value?.saveForCurrentJob) {
    const ok = await skillsTabRef.value.saveForCurrentJob();
    if (ok === false) return false;
  }
  return true;
}

async function selectTab(nextId) {
  if (nextId === activeTab.value) return;
  if (!tabs.some(t => t.id === nextId)) return;
  if (!props.isOpen || !props.resumeId || props.resumeId === 'default') {
    activeTab.value = nextId;
    return;
  }
  if (!canEdit) {
    activeTab.value = nextId;
    return;
  }
  saving.value = true;
  try {
    const ok = await flushCurrentTabBeforeLeave();
    if (!ok) return;
    activeTab.value = nextId;
  } catch (err) {
    reportError(err, '[ResumeDetailsEditor] flush before tab switch', '');
    alert('Failed to save: ' + (err instanceof Error ? err.message : String(err)));
  } finally {
    saving.value = false;
  }
}

function onJobsSaved() {
  emit('saved');
}

function openSkillsForJob(jobIndex) {
  sharedJobIndex.value = jobIndex;
  activeTab.value = 'job-skills';
}

function onSkillsSaved(payload) {
  emit('saved', payload);
}

function cancel() {
  if (reparseAbortController) {
    try { reparseAbortController.abort(); } catch {}
  }
  reparseAbortController = null;
  emit('close');
}

async function reparse() {
  if (!canEdit) {
    console.warn('[ResumeDetailsEditor] reparse: ignored (no API server).');
    return;
  }
  if (!props.resumeId || props.resumeId === 'default') {
    console.warn('[ResumeDetailsEditor] reparse: ignored (invalid resumeId).');
    return;
  }
  reparsing.value = true;
  reparseOutput.value = '';
  let reparseSucceeded = false;
  try {
    const controller = new AbortController();
    reparseAbortController = controller;

    await reparseResumeWithParserStream(props.resumeId, {
      signal: controller.signal,
      onStatus: (status) => {
        reparseOutput.value += `${status}\n`;
        nextTick(() => {
          const el = reparseTextareaRef.value;
          if (el) el.scrollTop = el.scrollHeight;
        });
      },
      onOutput: (line) => {
        reparseOutput.value += `${line}\n`;
        nextTick(() => {
          const el = reparseTextareaRef.value;
          if (el) el.scrollTop = el.scrollHeight;
        });
      }
    });

    reparseOutput.value += 'Resume parsed successfully!\n';
    // Reload data in this modal so user sees the new parsed outputs.
    const id = props.resumeId;
    const [metaRes, otherRes, educationRes] = await Promise.all([
      api.getResumeMeta(id).catch(() => ({})),
      api.getResumeOtherSections(id).catch(() => ({})),
      api.getResumeEducation(id).catch(() => ({}))
    ]);
    meta.value = typeof metaRes === 'object' && metaRes !== null ? { ...metaRes } : metaRes;
    otherSections.value = typeof otherRes === 'object' && otherRes !== null ? { ...otherRes } : otherRes;
    education.value = typeof educationRes === 'object' && educationRes !== null ? { ...educationRes } : {};
    pendingMeta.value = null;
    pendingOtherSections.value = null;
    pendingEducation.value = null;
    reloadNonce.value++;
    emit('saved', { reparsed: true });
    reparseSucceeded = true;
  } catch (err) {
    if (err?.name === 'AbortError') {
      reparseOutput.value = '';
      return;
    }
    console.error('[ResumeDetailsEditor] reparse failed:', err);
    alert('Failed to reparse: ' + err.message);
  } finally {
    reparsing.value = false;
    reparseAbortController = null;
    if (reparseSucceeded) reparseOutput.value = '';
  }
}

async function save() {
  if (!canEdit) {
    console.warn('[ResumeDetailsEditor] save: ignored (no API server).');
    return;
  }
  if (!props.resumeId || props.resumeId === 'default') {
    console.warn('[ResumeDetailsEditor] save: ignored (invalid resumeId).');
    return;
  }
  saving.value = true;
  try {
    const id = props.resumeId;

    // Autosave tab-specific changes (no per-tab save buttons).
    if (activeTab.value === 'resume-jobs' && jobsTabRef.value?.saveCurrentJob) {
      await jobsTabRef.value.saveCurrentJob();
    }
    if (activeTab.value === 'job-skills' && skillsTabRef.value?.saveForCurrentJob) {
      await skillsTabRef.value.saveForCurrentJob();
    }

    if (pendingMeta.value) {
      await api.updateResumeMeta(id, pendingMeta.value);
    }
    if (pendingOtherSections.value !== null) {
      await api.updateResumeOtherSections(id, pendingOtherSections.value);
    }
    if (pendingEducation.value !== null) {
      await api.updateResumeEducation(id, pendingEducation.value);
    }
    emit('saved', { metaSaved: true });
    emit('close');
  } catch (err) {
    console.error('[ResumeDetailsEditor] save failed:', err);
    alert('Failed to save: ' + err.message);
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.rde-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 20000;
  overflow: hidden;
}
.rde-modal {
  --rde-inner-padding-x: 20px;
  position: absolute;
  left: 50%;
  top: 50%;
  background: #1e1e1e;
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 8px;
  min-width: 320px;
  min-height: 240px;
  display: flex;
  flex-direction: column;
  overflow: auto;
  color: #e0e0e0;
  font-size: 0.85rem;
  font-family: Arial, sans-serif;
  box-sizing: border-box;
}

/* Resize handles: edges and bottom-right corner */
.rde-resize-handle {
  position: absolute;
  z-index: 1;
  background: transparent;
}
.rde-resize-left {
  left: 0;
  top: 0;
  bottom: 0;
  width: 6px;
  cursor: ew-resize;
}
.rde-resize-right {
  right: 0;
  top: 0;
  bottom: 0;
  width: 6px;
  cursor: ew-resize;
}
.rde-resize-bottom {
  left: 0;
  right: 0;
  bottom: 0;
  height: 6px;
  cursor: ns-resize;
}
.rde-resize-corner {
  right: 0;
  bottom: 0;
  width: 20px;
  height: 20px;
  cursor: nwse-resize;
}
.rde-header {
  padding: 14px var(--rde-inner-padding-x) 10px;
  border-bottom: 1px solid rgba(255,255,255,0.1);
}
.rde-drag-handle {
  cursor: move;
  user-select: none;
}
.rde-title {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(255,255,255,0.45);
  margin-bottom: 4px;
}
.rde-subtitle { font-size: 1rem; font-weight: 600; color: #fff; }
.rde-tabs {
  display: flex;
  gap: 4px;
  padding: 8px var(--rde-inner-padding-x) 0;
  border-bottom: 1px solid rgba(255,255,255,0.1);
}
.rde-tab {
  padding: 8px 14px;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: rgba(255,255,255,0.5);
  cursor: pointer;
  font-size: 0.85rem;
}
.rde-tab:hover { color: rgba(255,255,255,0.8); }
.rde-tab.active { color: #4a9eff; border-bottom-color: #4a9eff; }
.rde-body {
  flex: 1;
  overflow-y: auto;
  min-height: 120px;
  padding: 16px var(--rde-inner-padding-x);
  box-sizing: border-box;
}
.rde-parser-output-wrap {
  padding: 0 var(--rde-inner-padding-x) 10px;
}
.rde-parser-output {
  width: 100%;
  box-sizing: border-box;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 12px;
  color: #ddd;
  background: #121212;
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 8px;
  padding: 10px 12px;
  resize: none;
  overflow-y: auto;
  overflow-x: hidden;
  line-height: 1.1;
  min-height: 11em;
  max-height: 220px;
}
.rde-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px var(--rde-inner-padding-x);
  border-top: 1px solid rgba(255,255,255,0.1);
}
.rde-btn {
  padding: 6px 18px;
  border-radius: 4px;
  font-size: 0.85rem;
  cursor: pointer;
  border: 1px solid transparent;
}
.rde-btn.cancel {
  background: transparent;
  border-color: rgba(255,255,255,0.2);
  color: rgba(255,255,255,0.6);
}
.rde-btn.cancel:hover { border-color: rgba(255,255,255,0.4); color: #fff; }
.rde-btn.reparse {
  background: transparent;
  border-color: rgba(46, 204, 113, 0.45);
  color: rgba(46, 204, 113, 0.9);
}
.rde-btn.reparse:hover:not(:disabled) {
  border-color: rgba(46, 204, 113, 0.75);
  color: #2ecc71;
}
.rde-btn.reparse:disabled { opacity: 0.5; cursor: default; }
.rde-btn.save { background: #4a9eff; color: #fff; }
.rde-btn.save:hover:not(:disabled) { background: #6ab0ff; }
.rde-btn.save:disabled { opacity: 0.5; cursor: default; }
</style>

<style>
.rde-top-label {
  display: block;
  font-size: 0.7rem;
  text-transform: none;
  letter-spacing: 0.05em;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 4px;
}

/* One focus treatment for all modal fields (matches Education textarea prominence: border + ring). */
.rde-modal .rde-input:focus,
.rde-modal .rde-textarea:focus,
.rde-modal .rde-select:focus,
.rde-modal .rde-parser-output:focus,
.rde-skill-edit-modal .rde-input:focus {
  outline: none;
  border-color: rgba(74, 158, 255, 0.85);
  box-shadow: 0 0 0 2px rgba(74, 158, 255, 0.35);
}
</style>
