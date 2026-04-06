<template>
  <div class="rde-grid">
    <div class="rde-field"><label class="rde-label" for="rde-contact-name">Name</label><input id="rde-contact-name" name="name" v-model="local.name" type="text" class="rde-input" autocomplete="name" :disabled="disabled" /></div>
    <div class="rde-field"><label class="rde-label" for="rde-contact-email">Email</label><input id="rde-contact-email" name="email" v-model="local.email" type="email" class="rde-input" autocomplete="email" :disabled="disabled" /></div>
    <div class="rde-field"><label class="rde-label" for="rde-contact-phone">Phone</label><input id="rde-contact-phone" name="phone" v-model="local.phone" type="tel" class="rde-input" autocomplete="tel" :disabled="disabled" /></div>
    <div class="rde-field"><label class="rde-label" for="rde-contact-location">Location</label><input id="rde-contact-location" name="location" v-model="local.location" type="text" class="rde-input" autocomplete="address-level2" :disabled="disabled" /></div>
    <div class="rde-field"><label class="rde-label" for="rde-contact-linkedin">LinkedIn</label><input id="rde-contact-linkedin" name="linkedin" v-model="local.linkedin" type="url" class="rde-input" :disabled="disabled" /></div>
    <div class="rde-field"><label class="rde-label" for="rde-contact-website">Portfolio</label><input id="rde-contact-website" name="website" v-model="local.website" type="url" class="rde-input" :disabled="disabled" /></div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';

const props = defineProps({
  modelValue: { type: Object, default: () => ({}) },
  disabled: { type: Boolean, default: false }
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
.rde-label { display: block; font-size: 0.7rem; text-transform: none; letter-spacing: 0.05em; color: rgba(255,255,255,0.5); margin-bottom: 4px; }
.rde-input { width: 100%; background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; padding: 6px 10px; color: #e0e0e0; font-size: 0.9rem; box-sizing: border-box; }
</style>
