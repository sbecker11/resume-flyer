<template>
  <Teleport to="body">
    <div v-if="isOpen" class="rde-overlay" @click.self="cancel">
      <div
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
        </div>

        <div class="rde-footer">
          <button type="button" class="rde-btn cancel" @click="cancel">Cancel</button>
          <button type="button" class="rde-btn save" @click="save" :disabled="saving">
            {{ saving ? 'Saving…' : 'Save' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import MetaTab from './tabs/MetaTab.vue';
import OtherSectionsTab from './tabs/OtherSectionsTab.vue';
import * as api from './api.mjs';

const props = defineProps({
  isOpen: { type: Boolean, default: false },
  resumeId: { type: String, default: '' }
});

const emit = defineEmits(['close', 'saved']);

const tabs = [
  { id: 'meta', label: 'Meta' },
  { id: 'other-sections', label: 'Other sections' }
];

const activeTab = ref('meta');
const meta = ref({});
const otherSections = ref({});
const saving = ref(false);

// Pending edits (only save what changed)
const pendingMeta = ref(null);
const pendingOtherSections = ref(null);

// Draggable modal position (offset from center)
const dragOffset = ref({ x: 0, y: 0 });
const isDragging = ref(false);
let dragStart = { x: 0, y: 0, ox: 0, oy: 0 };

const modalStyle = computed(() => ({
  transform: `translate(calc(-50% + ${dragOffset.value.x}px), calc(-50% + ${dragOffset.value.y}px))`
}));

function startDrag(e) {
  if (e.button !== 0) return;
  isDragging.value = true;
  dragStart = { x: e.clientX, y: e.clientY, ox: dragOffset.value.x, oy: dragOffset.value.y };
  document.addEventListener('mousemove', onDragMove);
  document.addEventListener('mouseup', onDragEnd);
}

function onDragMove(e) {
  dragOffset.value = {
    x: dragStart.ox + (e.clientX - dragStart.x),
    y: dragStart.oy + (e.clientY - dragStart.y)
  };
}

function onDragEnd() {
  document.removeEventListener('mousemove', onDragMove);
  document.removeEventListener('mouseup', onDragEnd);
  isDragging.value = false;
}

watch(() => [props.isOpen, props.resumeId], async ([open, id]) => {
  if (!open || !id || id === 'default') return;
  activeTab.value = 'meta';
  dragOffset.value = { x: 0, y: 0 };
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
  position: absolute;
  left: 50%;
  top: 50%;
  background: #1e1e1e;
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 8px;
  width: min(720px, 92vw);
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: #e0e0e0;
  font-size: 0.85rem;
}
.rde-header {
  padding: 14px 16px 10px;
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
  padding: 8px 16px 0;
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
.rde-body { flex: 1; overflow-y: auto; min-height: 120px; }
.rde-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
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
