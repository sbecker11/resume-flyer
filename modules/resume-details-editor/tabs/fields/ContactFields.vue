<template>
  <div class="rde-grid">
    <div class="rde-field"><label class="rde-label">Name</label><input v-model="local.name" type="text" class="rde-input" /></div>
    <div class="rde-field"><label class="rde-label">Email</label><input v-model="local.email" type="email" class="rde-input" /></div>
    <div class="rde-field"><label class="rde-label">Phone</label><input v-model="local.phone" type="text" class="rde-input" /></div>
    <div class="rde-field"><label class="rde-label">Location</label><input v-model="local.location" type="text" class="rde-input" /></div>
    <div class="rde-field"><label class="rde-label">LinkedIn</label><input v-model="local.linkedin" type="url" class="rde-input" /></div>
    <div class="rde-field"><label class="rde-label">Website</label><input v-model="local.website" type="url" class="rde-input" /></div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';

const props = defineProps({
  modelValue: { type: Object, default: () => ({}) }
});

const emit = defineEmits(['update:modelValue']);

const defaults = { name: '', email: '', phone: '', location: '', linkedin: '', website: '' };
const local = ref({ ...defaults, ...props.modelValue });

watch(() => props.modelValue, (v) => {
  local.value = { ...defaults, ...(v || {}) };
}, { deep: true });

watch(local, (l) => {
  emit('update:modelValue', { ...l });
}, { deep: true });
</script>

<style scoped>
.rde-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 12px; }
.rde-field { }
.rde-label { display: block; font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.05em; color: rgba(255,255,255,0.5); margin-bottom: 2px; }
.rde-input { width: 100%; background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; padding: 6px 10px; color: #e0e0e0; font-size: 0.9rem; box-sizing: border-box; }
.rde-input:focus { outline: none; border-color: rgba(74,158,255,0.6); }
</style>
