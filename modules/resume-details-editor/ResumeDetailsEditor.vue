<template>
  <Teleport to="body">
    <div v-if="isOpen" class="rde-overlay" @click.self="onOverlayClick">
      <div
        ref="modalRef"
        class="rde-modal"
        :style="modalStyle"
      >
        <div
          class="rde-header rde-drag-handle"
          @mousedown.prevent="startDrag"
        >
          <div class="rde-title">Resume Details</div>
          <div class="rde-subtitle">{{ resumeId }}</div>
        </div>

        <div class="rde-tabs">
          <button
            v-for="t in tabs"
            :key="t.id"
            type="button"
            class="rde-tab"
            :class="{ active: activeTab === t.id }"
            @click="activeTab = t.id"
          >
            {{ t.label }}
          </button>
        </div>

        <div class="rde-body">
          <MetaTab
            v-show="activeTab === 'meta'"
            :meta="meta"
            @update:meta="onMetaUpdate"
          />
          <OtherSectionsTab
            v-show="activeTab === 'other-sections'"
            :data="otherSections"
            @update:data="onOtherSectionsUpdate"
          />
          <JobsTab
            v-show="activeTab === 'resume-jobs'"
            :resume-id="resumeId"
            :initial-job-index="initialJobIndex ?? null"
            :initial-focus-field="initialFocusField"
            @saved="onJobsSaved"
            @open-skills-for-job="openSkillsForJob"
          />
          <SkillsTab
            v-show="activeTab === 'job-skills'"
            :resume-id="resumeId"
            :initial-job-index="skillsPreselectJobIndex !== null ? skillsPreselectJobIndex : (initialJobIndex ?? null)"
            @saved="onSkillsSaved"
          />
        </div>

        <div class="rde-footer">
          <button type="button" class="rde-btn cancel" @click="cancel">Cancel</button>
          <button type="button" class="rde-btn save" @click="save" :disabled="saving">
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
import { ref, computed, watch } from 'vue';
import MetaTab from './tabs/MetaTab.vue';
import OtherSectionsTab from './tabs/OtherSectionsTab.vue';
import JobsTab from './tabs/JobsTab.vue';
import SkillsTab from './tabs/SkillsTab.vue';
import * as api from './api.mjs';

const MIN_WIDTH = 320;
const MIN_HEIGHT = 240;

const props = defineProps({
  isOpen: { type: Boolean, default: false },
  resumeId: { type: String, default: '' },
  /** When opening, show this tab first (e.g. 'job-skills' when opened from edit icon). */
  initialTab: { type: String, default: 'meta' },
  /** When opening on Job skills tab, preselect this job index (0-based). */
  initialJobIndex: { type: Number, default: null },
  /** When opening on Resume jobs tab, focus this field after selecting the job ('employer' | 'description'). */
  initialFocusField: { type: String, default: null }
});

const emit = defineEmits(['close', 'saved']);

const tabs = [
  { id: 'meta', label: 'Meta' },
  { id: 'other-sections', label: 'Other sections' },
  { id: 'resume-jobs', label: 'Resume jobs' },
  { id: 'job-skills', label: 'Job skills' }
];

const activeTab = ref('meta');
/** When user clicks "Skills" in Jobs tab, we switch to Skills tab with this job index. */
const skillsPreselectJobIndex = ref(null);
const meta = ref({});
const otherSections = ref({});
const saving = ref(false);

// Pending edits (only save what changed)
const pendingMeta = ref(null);
const pendingOtherSections = ref(null);

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

watch(() => [props.isOpen, props.resumeId], async ([open, id]) => {
  if (!open || !id || id === 'default') return;
  const tab = props.initialTab && tabs.some(t => t.id === props.initialTab) ? props.initialTab : 'meta';
  activeTab.value = tab;
  skillsPreselectJobIndex.value = null;
  dragOffset.value = { x: 0, y: 0 };
  const v = getViewportMaxSize();
  modalWidth.value = Math.max(MIN_WIDTH, Math.min(720, Math.floor(v.w * 0.92)));
  modalHeight.value = Math.max(MIN_HEIGHT, Math.min(Math.floor(v.h * 0.8), 720));
  clampDragOffset();
  pendingMeta.value = null;
  pendingOtherSections.value = null;
  try {
    const [metaRes, otherRes] = await Promise.all([
      api.getResumeMeta(id).catch(() => ({})),
      api.getResumeOtherSections(id).catch(() => ({}))
    ]);
    meta.value = metaRes;
    otherSections.value = otherRes;
  } catch (err) {
    console.error('[ResumeDetailsEditor] load failed:', err);
  }
}, { immediate: true });

function onMetaUpdate(updates) {
  pendingMeta.value = updates;
}
function onOtherSectionsUpdate(data) {
  pendingOtherSections.value = data;
}

function onJobsSaved() {
  emit('saved');
}

function openSkillsForJob(jobIndex) {
  skillsPreselectJobIndex.value = jobIndex;
  activeTab.value = 'job-skills';
}

function onSkillsSaved(payload) {
  emit('saved', payload);
}

function cancel() {
  emit('close');
}

async function save() {
  if (!props.resumeId || props.resumeId === 'default') return;
  saving.value = true;
  try {
    const id = props.resumeId;
    if (pendingMeta.value) {
      await api.updateResumeMeta(id, pendingMeta.value);
    }
    if (pendingOtherSections.value !== null) {
      await api.updateResumeOtherSections(id, pendingOtherSections.value);
    }
    emit('saved');
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
  font-family: var(--scene-font-family, 'Inter'), sans-serif;
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
.rde-btn.save { background: #4a9eff; color: #fff; }
.rde-btn.save:hover:not(:disabled) { background: #6ab0ff; }
.rde-btn.save:disabled { opacity: 0.5; cursor: default; }
</style>
