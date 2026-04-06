<template>
  <div class="rde-tab-content">
    <div class="rde-field">
      <label class="rde-top-label" for="rde-meta-display-name">Resume Display name</label>
      <input
        id="rde-meta-display-name"
        name="displayName"
        v-model="local.displayName"
        type="text"
        class="rde-input"
        placeholder="e.g. Shawn Becker 2025"
        autocomplete="name"
        :disabled="!canEdit"
        @blur="requestAutosave"
      />
    </div>
    <div class="rde-field">
      <label class="rde-top-label" for="rde-meta-file-name">Resume File name</label>
      <input
        id="rde-meta-file-name"
        name="fileName"
        v-model="local.fileName"
        type="text"
        class="rde-input"
        placeholder="e.g. resume.docx"
        :disabled="!canEdit"
        @blur="requestAutosave"
      />
    </div>
    <div v-if="meta.id" class="rde-readonly">
      <span class="rde-top-label">Resume ID</span>
      <span class="rde-value">{{ meta.id }}</span>
    </div>
    <div v-if="meta.createdAt" class="rde-readonly">
      <span class="rde-top-label">Resume Created</span>
      <span class="rde-value">{{ formatDate(meta.createdAt) }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import { hasServer } from '@/modules/core/hasServer.mjs';

const props = defineProps({
  meta: { type: Object, default: () => ({}) }
});

const canEdit = hasServer();

const emit = defineEmits(['update:meta', 'autosave']);

const local = ref({
  displayName: props.meta.displayName ?? '',
  fileName: props.meta.fileName ?? ''
});

watch(() => props.meta, (m) => {
  local.value.displayName = m?.displayName ?? '';
  local.value.fileName = m?.fileName ?? '';
}, { immediate: true });

watch(local, (l) => {
  emit('update:meta', { displayName: l.displayName, fileName: l.fileName });
}, { deep: true });

function requestAutosave() {
  emit('autosave');
}

function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}
</script>

<style scoped>
.rde-tab-content { padding: 12px 16px; }
.rde-field { margin-bottom: 12px; }
.rde-label { display: block; font-size: 0.7rem; text-transform: none; letter-spacing: 0.05em; color: rgba(255,255,255,0.5); margin-bottom: 4px; }
.rde-input { width: 100%; background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; padding: 6px 10px; color: #e0e0e0; font-size: 0.9rem; box-sizing: border-box; }
.rde-input:disabled { opacity: 0.4; cursor: default; }
.rde-readonly { margin-top: 10px; font-size: 0.8rem; color: rgba(255,255,255,0.4); }
.rde-value { margin-left: 6px; }
</style>
