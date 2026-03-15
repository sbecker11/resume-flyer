<template>
  <div class="rde-row">
    <input v-model="local.label" type="text" class="rde-input" placeholder="Label" />
    <input v-model="local.url" type="url" class="rde-input" placeholder="URL" />
    <input v-model="local.description" type="text" class="rde-input" placeholder="Description (optional)" />
    <button type="button" class="rde-btn-remove" title="Remove" @click="emit('remove')">×</button>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';

const props = defineProps({
  modelValue: { type: Object, default: () => ({ label: '', url: '', description: '' }) }
});

const emit = defineEmits(['update:modelValue', 'remove']);

const local = ref({ label: props.modelValue?.label ?? '', url: props.modelValue?.url ?? '', description: props.modelValue?.description ?? '' });

watch(() => props.modelValue, (v) => {
  local.value = { label: v?.label ?? '', url: v?.url ?? '', description: v?.description ?? '' };
}, { deep: true });

watch(local, (l) => {
  emit('update:modelValue', { ...l });
}, { deep: true });
</script>

<style scoped>
.rde-row { display: flex; gap: 8px; align-items: center; margin-bottom: 6px; }
.rde-row .rde-input { flex: 1; min-width: 80px; }
.rde-input { background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; padding: 4px 8px; color: #e0e0e0; font-size: 0.85rem; box-sizing: border-box; }
.rde-input:focus { outline: none; border-color: rgba(74,158,255,0.6); }
.rde-btn-remove { flex-shrink: 0; width: 28px; height: 28px; border: 1px solid rgba(255,255,255,0.2); background: transparent; color: rgba(255,255,255,0.6); border-radius: 4px; cursor: pointer; font-size: 1.2rem; line-height: 1; }
.rde-btn-remove:hover { background: rgba(255,80,80,0.2); color: #f88; }
</style>
