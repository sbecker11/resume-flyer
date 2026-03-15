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
      <div class="rde-grid">
        <div class="rde-field"><label class="rde-label">Name</label><input v-model="local.contact.name" type="text" class="rde-input" /></div>
        <div class="rde-field"><label class="rde-label">Email</label><input v-model="local.contact.email" type="email" class="rde-input" /></div>
        <div class="rde-field"><label class="rde-label">Phone</label><input v-model="local.contact.phone" type="text" class="rde-input" /></div>
        <div class="rde-field"><label class="rde-label">Location</label><input v-model="local.contact.location" type="text" class="rde-input" /></div>
        <div class="rde-field"><label class="rde-label">LinkedIn</label><input v-model="local.contact.linkedin" type="url" class="rde-input" /></div>
        <div class="rde-field"><label class="rde-label">Website</label><input v-model="local.contact.website" type="url" class="rde-input" /></div>
      </div>
    </section>

    <!-- 4. Certifications -->
    <section class="rde-section">
      <h3 class="rde-section-title">Certifications</h3>
      <p class="rde-hint">Name, optional hyperlink, optional description</p>
      <div v-for="(cert, i) in local.certifications" :key="i" class="rde-repeat-row">
        <input v-model="cert.name" type="text" class="rde-input rde-input-sm" placeholder="Name" />
        <input v-model="cert.url" type="url" class="rde-input rde-input-sm" placeholder="Link (optional)" />
        <input v-model="cert.description" type="text" class="rde-input rde-input-sm" placeholder="Description (optional)" />
        <button type="button" class="rde-btn-remove" @click="removeCert(i)">×</button>
      </div>
      <button type="button" class="rde-btn-add" @click="addCert">+ Add certification</button>
    </section>

    <!-- 5. Websites -->
    <section class="rde-section">
      <h3 class="rde-section-title">Websites</h3>
      <p class="rde-hint">Label, hyperlink, optional description</p>
      <div v-for="(web, i) in local.websites" :key="i" class="rde-repeat-row">
        <input v-model="web.label" type="text" class="rde-input rde-input-sm" placeholder="Label" />
        <input v-model="web.url" type="url" class="rde-input rde-input-sm" placeholder="URL" />
        <input v-model="web.description" type="text" class="rde-input rde-input-sm" placeholder="Description (optional)" />
        <button type="button" class="rde-btn-remove" @click="removeWebsite(i)">×</button>
      </div>
      <button type="button" class="rde-btn-add" @click="addWebsite">+ Add website</button>
    </section>

    <!-- 6. Other sections -->
    <section class="rde-section">
      <h3 class="rde-section-title">Other sections</h3>
      <p class="rde-hint">Title, optional subtitle, optional description</p>
      <div v-for="(sec, i) in local.other_sections" :key="i" class="rde-repeat-row rde-repeat-col">
        <input v-model="sec.title" type="text" class="rde-input rde-input-sm" placeholder="Section title" />
        <input v-model="sec.subtitle" type="text" class="rde-input rde-input-sm" placeholder="Subtitle (optional)" />
        <input v-model="sec.description" type="text" class="rde-input rde-input-sm" placeholder="Description (optional)" />
        <button type="button" class="rde-btn-remove" @click="removeOtherSection(i)">×</button>
      </div>
      <button type="button" class="rde-btn-add" @click="addOtherSection">+ Add section</button>
    </section>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import { DEFAULT_OTHER_SECTIONS } from '../constants.mjs';

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
    d.other_sections = Array.isArray(data.other_sections) ? data.other_sections.map(s => ({ title: s.title ?? '', subtitle: s.subtitle ?? '', description: s.description ?? '' })) : [];
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

function addCert() {
  local.value.certifications.push({ name: '', url: '', description: '' });
}
function removeCert(i) {
  local.value.certifications.splice(i, 1);
}
function addWebsite() {
  local.value.websites.push({ label: '', url: '', description: '' });
}
function removeWebsite(i) {
  local.value.websites.splice(i, 1);
}
function addOtherSection() {
  local.value.other_sections.push({ title: '', subtitle: '', description: '' });
}
function removeOtherSection(i) {
  local.value.other_sections.splice(i, 1);
}
</script>

<style scoped>
.rde-tab-content { padding: 12px 16px; max-height: 60vh; overflow-y: auto; }
.rde-section { margin-bottom: 20px; }
.rde-section-title { font-size: 0.8rem; font-weight: 600; color: #fff; margin: 0 0 8px; }
.rde-hint { font-size: 0.7rem; color: rgba(255,255,255,0.4); margin: -4px 0 8px; }
.rde-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 12px; }
.rde-field { }
.rde-label { display: block; font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.05em; color: rgba(255,255,255,0.5); margin-bottom: 2px; }
.rde-input { width: 100%; background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; padding: 6px 10px; color: #e0e0e0; font-size: 0.9rem; box-sizing: border-box; }
.rde-input:focus { outline: none; border-color: rgba(74,158,255,0.6); }
.rde-input-sm { padding: 4px 8px; font-size: 0.85rem; }
.rde-textarea { width: 100%; background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; padding: 6px 10px; color: #e0e0e0; font-size: 0.9rem; resize: vertical; box-sizing: border-box; font-family: inherit; }
.rde-repeat-row { display: flex; gap: 8px; align-items: center; margin-bottom: 6px; }
.rde-repeat-row.rde-repeat-col { flex-wrap: wrap; }
.rde-repeat-row .rde-input { flex: 1; min-width: 100px; }
.rde-btn-remove { flex-shrink: 0; width: 28px; height: 28px; border: 1px solid rgba(255,255,255,0.2); background: transparent; color: rgba(255,255,255,0.6); border-radius: 4px; cursor: pointer; font-size: 1.2rem; line-height: 1; }
.rde-btn-remove:hover { background: rgba(255,80,80,0.2); color: #f88; }
.rde-btn-add { margin-top: 4px; padding: 6px 12px; background: transparent; border: 1px dashed rgba(255,255,255,0.3); color: rgba(255,255,255,0.6); border-radius: 4px; cursor: pointer; font-size: 0.8rem; }
.rde-btn-add:hover { border-color: rgba(74,158,255,0.6); color: #7ac; }
</style>
