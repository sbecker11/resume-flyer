<template>
  <div class="rde-tab-content">
    <p class="rde-hint">Categories group skills. Each has a name and optional skill IDs.</p>
    <div v-for="(cat, catId) in local" :key="catId" class="rde-cat-row">
      <span class="rde-cat-id">{{ catId }}</span>
      <input v-model="cat.name" type="text" class="rde-input rde-cat-name" placeholder="Category name" />
      <input v-model="cat.skillIDsStr" type="text" class="rde-input rde-skill-ids" placeholder="skill-1, skill-2 (optional)" />
      <button type="button" class="rde-btn-remove" @click="removeCategory(catId)">×</button>
    </div>
    <button type="button" class="rde-btn-add" @click="addCategory">+ Add category</button>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';

const props = defineProps({
  categories: { type: Object, default: () => ({}) },
  skills: { type: Object, default: () => ({}) }
});

const emit = defineEmits(['update:categories']);

/** Local state: { [catId]: { name, skillIDs, skillIDsStr } } */
const local = ref({});

function toLocal(cats) {
  const out = {};
  for (const [id, c] of Object.entries(cats || {})) {
    const skillIDs = c.skillIDs || [];
    out[id] = {
      name: c.name ?? '',
      skillIDs,
      skillIDsStr: skillIDs.join(', ')
    };
  }
  return out;
}

function fromLocal(l) {
  const out = {};
  for (const [id, c] of Object.entries(l)) {
    const skillIDsStr = (c.skillIDsStr || '').trim();
    const skillIDs = skillIDsStr ? skillIDsStr.split(/,\s*/).filter(Boolean) : [];
    out[id] = { name: c.name ?? '', skillIDs };
  }
  return out;
}

watch(() => props.categories, (c) => {
  local.value = toLocal(c);
}, { immediate: true });

watch(local, (l) => {
  emit('update:categories', fromLocal(l));
}, { deep: true });

function addCategory() {
  const id = `cat-${Date.now()}`;
  local.value[id] = { name: '', skillIDs: [], skillIDsStr: '' };
  local.value = { ...local.value };
}

function removeCategory(catId) {
  const next = { ...local.value };
  delete next[catId];
  local.value = next;
}
</script>

<style scoped>
.rde-tab-content { padding: 12px 16px; max-height: 60vh; overflow-y: auto; }
.rde-hint { font-size: 0.7rem; color: rgba(255,255,255,0.4); margin-bottom: 12px; }
.rde-cat-row { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; flex-wrap: wrap; }
.rde-cat-id { font-size: 0.7rem; color: rgba(255,255,255,0.4); min-width: 80px; }
.rde-input { background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; padding: 6px 10px; color: #e0e0e0; font-size: 0.9rem; box-sizing: border-box; }
.rde-input:focus { outline: none; border-color: rgba(74,158,255,0.6); }
.rde-cat-name { flex: 1; min-width: 120px; }
.rde-skill-ids { flex: 2; min-width: 160px; font-family: monospace; font-size: 0.8rem; }
.rde-btn-remove { flex-shrink: 0; width: 28px; height: 28px; border: 1px solid rgba(255,255,255,0.2); background: transparent; color: rgba(255,255,255,0.6); border-radius: 4px; cursor: pointer; font-size: 1.2rem; line-height: 1; }
.rde-btn-remove:hover { background: rgba(255,80,80,0.2); color: #f88; }
.rde-btn-add { margin-top: 8px; padding: 6px 12px; background: transparent; border: 1px dashed rgba(255,255,255,0.3); color: rgba(255,255,255,0.6); border-radius: 4px; cursor: pointer; font-size: 0.8rem; }
.rde-btn-add:hover { border-color: rgba(74,158,255,0.6); color: #7ac; }
</style>
