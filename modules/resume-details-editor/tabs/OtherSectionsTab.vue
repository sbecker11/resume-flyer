<template>
  <div class="rde-tab-content rde-other-sections">
    <!-- 1. Summary -->
    <section class="rde-section">
      <label class="rde-top-label" for="rde-other-summary">Resume Summary</label>
      <textarea id="rde-other-summary" name="summary" v-model="local.summary" class="rde-textarea" rows="4" placeholder="Professional summary…" :disabled="!canEdit"></textarea>
    </section>

    <!-- 2. Title -->
    <section class="rde-section">
      <label class="rde-top-label" for="rde-other-title">Resume Title</label>
      <input id="rde-other-title" name="title" v-model="local.title" type="text" class="rde-input" placeholder="e.g. Senior Software Engineer" :disabled="!canEdit" />
    </section>

    <!-- 3. Contact -->
    <section class="rde-section">
      <ContactFields v-model="local.contact" :disabled="!canEdit" />
    </section>

    <!-- 4. Websites -->
    <section class="rde-section">
      <div class="rde-top-label">Other websites</div>
      <div class="rde-website-subhead">
        <span class="rde-website-subhead-col">Label</span>
        <span class="rde-website-subhead-col">hyperlink</span>
        <span class="rde-website-subhead-col">description</span>
        <span class="rde-website-remove-spacer" aria-hidden="true"></span>
      </div>
      <WebsiteItem
        v-for="(web, i) in local.websites"
        :key="i"
        :model-value="web"
        :should-focus="i === websiteFocusIndex"
        :focus-token="websiteFocusToken"
        :disabled="!canEdit"
        @update:model-value="(v) => updateWebsite(i, v)"
        @remove="removeWebsite(i)"
        @entry-blur="autosaveFromEntryBlur"
      />
      <button type="button" class="rde-btn-add" :disabled="!canEdit" @click="addWebsite">+ Add website</button>
    </section>

    <!-- 5. Certifications -->
    <section class="rde-section">
      <div class="rde-top-label">Certifications</div>
      <div class="rde-website-subhead rde-cert-subhead">
        <span class="rde-website-subhead-col">Name</span>
        <span class="rde-website-subhead-col">hyperlink</span>
        <span class="rde-website-subhead-col">description</span>
        <span class="rde-website-remove-spacer" aria-hidden="true"></span>
      </div>
      <CertificationItem
        v-for="(cert, i) in local.certifications"
        :key="i"
        :model-value="cert"
        :should-focus="i === certFocusIndex"
        :focus-token="certFocusToken"
        :disabled="!canEdit"
        @update:model-value="(v) => updateCert(i, v)"
        @remove="removeCert(i)"
        @entry-blur="autosaveFromEntryBlur"
      />
      <button type="button" class="rde-btn-add" :disabled="!canEdit" @click="addCert">+ Add certification</button>
    </section>

    <!-- 6. Other sections -->
    <section class="rde-section">
      <div class="rde-top-label">Other sections</div>
      <div class="rde-website-subhead rde-other-sections-subhead">
        <span class="rde-website-subhead-col">Title</span>
        <span class="rde-website-subhead-col">subtitle</span>
        <span class="rde-website-subhead-col">description</span>
        <span class="rde-website-remove-spacer" aria-hidden="true"></span>
      </div>
      <OtherSectionItem
        v-for="(sec, i) in local.custom_sections"
        :key="i"
        :model-value="sec"
        :should-focus="i === otherSectionFocusIndex"
        :focus-token="otherSectionFocusToken"
        :disabled="!canEdit"
        @update:model-value="(v) => updateOtherSection(i, v)"
        @remove="removeOtherSection(i)"
        @entry-blur="autosaveFromEntryBlur"
      />
      <button type="button" class="rde-btn-add" :disabled="!canEdit" @click="addOtherSection">+ Add section</button>
    </section>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import { DEFAULT_OTHER_SECTIONS } from '../constants.mjs';
import { hasServer } from '@/modules/core/hasServer.mjs';
import ContactFields from './fields/ContactFields.vue';
import CertificationItem from './fields/CertificationItem.vue';
import WebsiteItem from './fields/WebsiteItem.vue';
import OtherSectionItem from './fields/OtherSectionItem.vue';

const props = defineProps({
  data: { type: Object, default: () => ({}) }
});

const canEdit = hasServer();

const emit = defineEmits(['update:data', 'autosave']);

const certFocusIndex = ref(null);
const certFocusToken = ref(0);
const websiteFocusIndex = ref(null);
const websiteFocusToken = ref(0);
const otherSectionFocusIndex = ref(null);
const otherSectionFocusToken = ref(0);

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

// Guard flag to avoid emitting updates when we are just syncing from parent props.
let isSyncingFromParent = false;

watch(
  () => props.data,
  (d) => {
    isSyncingFromParent = true;
    local.value = mergeDefaults(d);
    isSyncingFromParent = false;
  },
  { immediate: true }
);

watch(
  local,
  (l) => {
    if (isSyncingFromParent) return;
    emit('update:data', { ...l });
  },
  { deep: true }
);

function updateCert(i, v) {
  local.value.certifications[i] = v;
}
function addCert() {
  local.value.certifications.push({ name: '', url: '', description: '' });
  certFocusIndex.value = local.value.certifications.length - 1;
  certFocusToken.value++;
}
function removeCert(i) {
  local.value.certifications.splice(i, 1);
}
function updateWebsite(i, v) {
  local.value.websites[i] = v;
}
function addWebsite() {
  local.value.websites.push({ label: '', url: '', description: '' });
  websiteFocusIndex.value = local.value.websites.length - 1;
  websiteFocusToken.value++;
}
function removeWebsite(i) {
  local.value.websites.splice(i, 1);
}
function updateOtherSection(i, v) {
  local.value.custom_sections[i] = v;
}
function addOtherSection() {
  local.value.custom_sections.push({ title: '', subtitle: '', description: '' });
  otherSectionFocusIndex.value = local.value.custom_sections.length - 1;
  otherSectionFocusToken.value++;
}
function removeOtherSection(i) {
  local.value.custom_sections.splice(i, 1);
}

function autosaveFromEntryBlur() {
  // Clone so parent autosave sees a stable snapshot even if more edits happen.
  const snapshot = JSON.parse(JSON.stringify(local.value));
  emit('autosave', snapshot);
}
</script>

<style scoped>
.rde-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
.rde-tab-content { padding: 12px 16px; max-height: 60vh; overflow-y: auto; }
.rde-section { margin-bottom: 20px; }
/* Legacy: keep field label styling consistent if anything still uses rde-label */
.rde-other-sections .rde-label {
  display: block;
  font-size: 0.7rem;
  text-transform: none;
  letter-spacing: 0.05em;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 4px;
}

/* Top-level labels (Resume Summary/Title/etc) */
.rde-other-sections .rde-top-label {
  display: block;
  font-size: 0.7rem;
  text-transform: none;
  letter-spacing: 0.05em;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 4px;
}
.rde-hint { font-size: 0.7rem; color: rgba(255,255,255,0.4); margin: 0 0 8px; }
.rde-website-subhead {
  display: flex;
  gap: 8px;
  align-items: center;
  margin: 0;
  color: rgba(255,255,255,0.4);
  font-size: 0.7rem;
}
.rde-website-subhead-col {
  flex: 1;
  min-width: 80px;
  text-align: left;
}
.rde-cert-subhead .rde-website-subhead-col {
  /* keep same widths as WebsiteItem */
}
.rde-other-sections-subhead .rde-website-subhead-col {
  /* keep same widths as OtherSectionItem */
}
.rde-website-remove-spacer {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
}
.rde-input { width: 100%; background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; padding: 6px 10px; color: #e0e0e0; font-size: 0.9rem; box-sizing: border-box; }
.rde-textarea { width: 100%; background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; padding: 6px 10px; color: #e0e0e0; font-size: 0.9rem; resize: vertical; box-sizing: border-box; font-family: Arial, sans-serif; }
.rde-btn-add { margin-top: 4px; padding: 6px 12px; background: transparent; border: 1px dashed rgba(255,255,255,0.3); color: rgba(255,255,255,0.6); border-radius: 4px; cursor: pointer; font-size: 0.8rem; }
.rde-btn-add:hover:not(:disabled) { border-color: rgba(74,158,255,0.6); color: #7ac; }
.rde-btn-add:disabled { opacity: 0.4; cursor: default; }
</style>
