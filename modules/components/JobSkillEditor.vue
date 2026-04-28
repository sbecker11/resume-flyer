<template>
  <Teleport to="body">
  <div v-if="isOpen" class="jse-overlay" @click.self="cancel">
    <div class="jse-modal">
      <div class="jse-header">
        <div class="jse-title">Edit Skills</div>
        <div class="jse-job-name">{{ jobLabel }}</div>
      </div>

      <div class="jse-search-row">
        <input
          v-model="search"
          class="jse-search"
          type="text"
          placeholder="Filter skills…"
          @keydown.escape="cancel"
        />
        <span class="jse-count">{{ checkedCount }} selected</span>
      </div>

      <div class="jse-skill-grid">
        <label
          v-for="skill in filteredSkills"
          :key="skill.id"
          class="jse-skill-item"
          :class="{ checked: selected.has(skill.id) }"
        >
          <input
            type="checkbox"
            :checked="selected.has(skill.id)"
            @change="toggle(skill.id)"
          />
          <span>{{ skill.name }}</span>
        </label>
      </div>

      <div class="jse-footer">
        <button class="jse-btn cancel" @click="cancel">Cancel</button>
        <button class="jse-btn save" @click="save" :disabled="saving">
          {{ saving ? 'Saving…' : 'Save' }}
        </button>
      </div>
    </div>
  </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { updateJobSkills } from '@/modules/api/resumeManagerApi.mjs';
import { filterSkillsBySearchQuery } from '@/modules/utils/skillSearch.mjs';

const props = defineProps({
  isOpen:    { type: Boolean, default: false },
  resumeId:  { type: String, required: true },
  jobIndex:  { type: Number, default: null },
  job:       { type: Object, default: null },   // { role, employer, skillIDs }
  allSkills: { type: Object, default: () => ({}) }, // full skills dict from getResumeData
});

const emit = defineEmits(['close', 'saved']);

const search  = ref('');
const saving  = ref(false);
const selected = ref(new Set());

// Rebuild selection whenever the modal opens or job changes
watch(() => [props.isOpen, props.job], ([open]) => {
  if (open && props.job) {
    selected.value = new Set(props.job.skillIDs || []);
    search.value = '';
  }
}, { immediate: true });

const jobLabel = computed(() => {
  if (!props.job) return '';
  return `${props.job.role} — ${props.job.employer}`;
});

// Sorted skill list: alphabetical only (stable order when toggling)
const sortedSkills = computed(() => {
  return Object.entries(props.allSkills)
    .map(([id, s]) => ({ id, name: s.name || id }))
    .sort((a, b) => a.name.localeCompare(b.name));
});

const filteredSkills = computed(() => {
  return filterSkillsBySearchQuery(sortedSkills.value, search.value);
});

const checkedCount = computed(() => selected.value.size);

function toggle(id) {
  const s = new Set(selected.value);
  if (s.has(id)) s.delete(id); else s.add(id);
  selected.value = s;
}

function cancel() {
  emit('close');
}

async function save() {
  saving.value = true;
  try {
    const skillIDs = [...selected.value];
    await updateJobSkills(props.resumeId, props.jobIndex, skillIDs);
    emit('saved', { jobIndex: props.jobIndex, skillIDs });
  } catch (err) {
    console.error('[JobSkillEditor] save failed:', err);
    alert('Failed to save skills: ' + err.message);
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.jse-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 20000;
}

.jse-modal {
  background: #1e1e1e;
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 8px;
  width: min(720px, 92vw);
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: #e0e0e0;
  font-size: 0.85rem;
}

.jse-header {
  padding: 14px 16px 10px;
  border-bottom: 1px solid rgba(255,255,255,0.1);
}

.jse-title {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(255,255,255,0.45);
  margin-bottom: 4px;
}

.jse-job-name {
  font-size: 1rem;
  font-weight: 600;
  color: #fff;
}

.jse-search-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
}

.jse-search {
  flex: 1;
  background: rgba(255,255,255,0.07);
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 4px;
  padding: 5px 10px;
  color: #e0e0e0;
  font-size: 0.85rem;
  outline: none;
}
.jse-search:focus { border-color: rgba(255,255,255,0.35); }
.jse-search::placeholder { color: rgba(255,255,255,0.3); }

.jse-count {
  font-size: 0.75rem;
  color: rgba(255,255,255,0.4);
  white-space: nowrap;
}

.jse-skill-grid {
  flex: 1;
  overflow-y: auto;
  padding: 10px 16px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 2px 8px;
  align-content: start;
}

.jse-skill-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  border-radius: 3px;
  cursor: pointer;
  color: rgba(255,255,255,0.65);
  transition: background 0.1s;
  user-select: none;
}
.jse-skill-item:hover { background: rgba(255,255,255,0.07); }
.jse-skill-item.checked { color: #fff; }
.jse-skill-item input[type="checkbox"] { accent-color: #4a9eff; cursor: pointer; }

.jse-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid rgba(255,255,255,0.1);
}

.jse-btn {
  padding: 6px 18px;
  border-radius: 4px;
  font-size: 0.85rem;
  cursor: pointer;
  border: 1px solid transparent;
}
.jse-btn.cancel {
  background: transparent;
  border-color: rgba(255,255,255,0.2);
  color: rgba(255,255,255,0.6);
}
.jse-btn.cancel:hover { border-color: rgba(255,255,255,0.4); color: #fff; }
.jse-btn.save {
  background: #4a9eff;
  color: #fff;
}
.jse-btn.save:hover:not(:disabled) { background: #6ab0ff; }
.jse-btn.save:disabled { opacity: 0.5; cursor: default; }
</style>
