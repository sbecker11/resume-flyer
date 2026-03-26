<template>
  <div
    ref="rootRef"
    class="rde-row"
    @focusout="onFocusOut"
  >
    <input
      ref="nameInputRef"
      v-model="local.name"
      type="text"
      name="certName"
      class="rde-input"
      placeholder="Name"
      aria-label="Certification name"
    />
    <input v-model="local.url" type="url" name="certUrl" class="rde-input" placeholder="Link (optional)" aria-label="Certification link" />
    <input v-model="local.description" type="text" name="certDescription" class="rde-input" placeholder="Description (optional)" aria-label="Certification description" />
    <button type="button" class="rde-btn-remove" title="Remove" aria-label="Remove certification" @click="emit('remove')">×</button>
  </div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue';

const props = defineProps({
  modelValue: { type: Object, default: () => ({ name: '', url: '', description: '' }) },
  /** Incremented when a new entry is added; used to focus the newest entry exactly once. */
  focusToken: { type: Number, default: 0 },
  /** True only for the row that should be focused for the current focusToken. */
  shouldFocus: { type: Boolean, default: false }
});

const emit = defineEmits(['update:modelValue', 'remove', 'entry-blur']);

const local = ref({ name: props.modelValue?.name ?? '', url: props.modelValue?.url ?? '', description: props.modelValue?.description ?? '' });

const rootRef = ref(null);
const nameInputRef = ref(null);

watch(() => props.modelValue, (v) => {
  local.value = { name: v?.name ?? '', url: v?.url ?? '', description: v?.description ?? '' };
}, { deep: true });

watch(local, (l) => {
  emit('update:modelValue', { ...l });
}, { deep: true });

watch(
  () => props.focusToken,
  async (t) => {
    if (!t || !props.shouldFocus) return;
    await nextTick();
    const el = nameInputRef.value;
    if (el && typeof el.focus === 'function') el.focus();
  }
);

function onFocusOut(e) {
  // Autosave whenever any field in the row loses focus (even if focus moves to another field in the same row).
  if (!rootRef.value) return;
  emit('entry-blur');
}
</script>

<style scoped>
.rde-row { display: flex; gap: 8px; align-items: center; margin-bottom: 6px; }
.rde-row .rde-input { flex: 1; min-width: 80px; }
.rde-input { background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; padding: 4px 8px; color: #e0e0e0; font-size: 0.85rem; box-sizing: border-box; }
.rde-input:focus { outline: none; border-color: rgba(74,158,255,0.6); }
.rde-btn-remove { flex-shrink: 0; width: 28px; height: 28px; border: 1px solid rgba(255,255,255,0.2); background: transparent; color: rgba(255,255,255,0.6); border-radius: 4px; cursor: pointer; font-size: 1.2rem; line-height: 1; }
.rde-btn-remove:hover { background: rgba(255,80,80,0.2); color: #f88; }
</style>
