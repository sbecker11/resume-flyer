<template>
  <div class="rde-tab-content rde-other-sections">
    <!-- 1. Summary -->
    <section class="rde-section">
      <h3 class="rde-section-title">Summary</h3>
      <textarea v-model="local.summary" class="rde-textarea" rows="4" placeholder="Professional summary…"></textarea>
    </section>

    <!-- 2. Title -->
    <section class="rde-section">
      <h3 class="rde-section-title">Title</h3>
      <input v-model="local.title" type="text" class="rde-input" placeholder="e.g. Senior Software Engineer" />
    </section>

    <!-- 3. Contact -->
    <section class="rde-section">
      <h3 class="rde-section-title">Contact</h3>
      <ContactFields v-model="local.contact" />
    </section>

    <!-- 4. Certifications -->
    <section class="rde-section">
      <h3 class="rde-section-title">Certifications</h3>
      <p class="rde-hint">Name, optional hyperlink, optional description</p>
      <CertificationItem
        v-for="(cert, i) in local.certifications"
        :key="i"
        :model-value="cert"
        @update:model-value="(v) => updateCert(i, v)"
        @remove="removeCert(i)"
      />
      <button type="button" class="rde-btn-add" @click="addCert">+ Add certification</button>
    </section>

    <!-- 5. Websites -->
    <section class="rde-section">
      <h3 class="rde-section-title">Websites</h3>
      <p class="rde-hint">Label, hyperlink, optional description</p>
      <WebsiteItem
        v-for="(web, i) in local.websites"
        :key="i"
        :model-value="web"
        @update:model-value="(v) => updateWebsite(i, v)"
        @remove="removeWebsite(i)"
      />
      <button type="button" class="rde-btn-add" @click="addWebsite">+ Add website</button>
    </section>

    <!-- 6. Other sections -->
    <section class="rde-section">
      <h3 class="rde-section-title">Other sections</h3>
      <p class="rde-hint">Title, optional subtitle, optional description</p>
      <OtherSectionItem
        v-for="(sec, i) in local.custom_sections"
        :key="i"
        :model-value="sec"
        @update:model-value="(v) => updateOtherSection(i, v)"
        @remove="removeOtherSection(i)"
      />
      <button type="button" class="rde-btn-add" @click="addOtherSection">+ Add section</button>
    </section>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import { DEFAULT_OTHER_SECTIONS } from '../constants.mjs';
import ContactFields from './fields/ContactFields.vue';
import CertificationItem from './fields/CertificationItem.vue';
import WebsiteItem from './fields/WebsiteItem.vue';
import OtherSectionItem from './fields/OtherSectionItem.vue';

const props = defineProps({
  data: { type: Object, default: () => ({}) }
});

const emit = defineEmits(['update:data']);

function mergeDefaults(data) {
  const d = { ...DEFAULT_OTHER_SECTIONS };
  if (data) {
    d.summary = data.summary ?? d.summary;
    d.title = data.title ?? d.title;
    d.contact = { ...d.contact, ...(data.contact || {}) };
    d.certifications = Array.isArray(data.certifications) ? data.certifications.map(c => ({ name: c.name ?? '', url: c.url ?? '', description: c.description ?? '' })) : [];
    d.websites = Array.isArray(data.websites) ? data.websites.map(w => ({ label: w.label ?? '', url: w.url ?? '', description: w.description ?? '' })) : [];
    const sections = data.custom_sections ?? data.other_sections;
    d.custom_sections = Array.isArray(sections) ? sections.map(s => ({ title: s.title ?? '', subtitle: s.subtitle ?? '', description: s.description ?? '' })) : [];
  }
  return d;
}

const local = ref(mergeDefaults(props.data));

watch(() => props.data, (d) => {
  local.value = mergeDefaults(d);
}, { immediate: true });

watch(local, (l) => {
  emit('update:data', { ...l });
}, { deep: true });

function updateCert(i, v) {
  local.value.certifications[i] = v;
}
function addCert() {
  local.value.certifications.push({ name: '', url: '', description: '' });
}
function removeCert(i) {
  local.value.certifications.splice(i, 1);
}
function updateWebsite(i, v) {
  local.value.websites[i] = v;
}
function addWebsite() {
  local.value.websites.push({ label: '', url: '', description: '' });
}
function removeWebsite(i) {
  local.value.websites.splice(i, 1);
}
function updateOtherSection(i, v) {
  local.value.custom_sections[i] = v;
}
function addOtherSection() {
  local.value.custom_sections.push({ title: '', subtitle: '', description: '' });
}
function removeOtherSection(i) {
  local.value.custom_sections.splice(i, 1);
}
</script>

<style scoped>
.rde-tab-content { padding: 12px 16px; max-height: 60vh; overflow-y: auto; }
.rde-section { margin-bottom: 20px; }
.rde-section-title { font-size: 0.8rem; font-weight: 600; color: #fff; margin: 0 0 8px; }
.rde-hint { font-size: 0.7rem; color: rgba(255,255,255,0.4); margin: -4px 0 8px; }
.rde-input { width: 100%; background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; padding: 6px 10px; color: #e0e0e0; font-size: 0.9rem; box-sizing: border-box; }
.rde-input:focus { outline: none; border-color: rgba(74,158,255,0.6); }
.rde-textarea { width: 100%; background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; padding: 6px 10px; color: #e0e0e0; font-size: 0.9rem; resize: vertical; box-sizing: border-box; font-family: inherit; }
.rde-btn-add { margin-top: 4px; padding: 6px 12px; background: transparent; border: 1px dashed rgba(255,255,255,0.3); color: rgba(255,255,255,0.6); border-radius: 4px; cursor: pointer; font-size: 0.8rem; }
.rde-btn-add:hover { border-color: rgba(74,158,255,0.6); color: #7ac; }
</style>
