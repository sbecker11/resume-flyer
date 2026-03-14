<template>
  <Teleport to="body">
  <Transition name="modal">
    <div v-if="isOpen" class="modal-overlay" @click.self="cancel">
      <div class="modal-container">
        <div class="modal-header">
          <h2>Manage Resumes</h2>
          <button class="close-button" @click="cancel" aria-label="Close">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div class="modal-content">
          <div v-if="loading" class="loading-state">
            <div class="spinner"></div>
            <p>Loading resumes…</p>
          </div>

          <div v-else-if="loadError" class="error-message">
            <p>{{ loadError }}</p>
          </div>

          <div v-else-if="resumes.length === 0" class="empty-state">
            <p>No parsed resumes found.</p>
            <p class="empty-hint">Upload a resume to get started.</p>
          </div>

          <ul v-else class="resume-list">
            <li
              v-for="r in resumes"
              :key="r.id"
              class="resume-row"
              :class="{
                'marked-for-deletion': pendingDeletes.has(r.id),
                'is-selected': selectedId === r.id && !pendingDeletes.has(r.id),
                'is-current': r.id === currentResumeId && !pendingDeletes.has(r.id),
              }"
              @click="selectResume(r.id)"
              @dblclick="openResume(r.id)"
            >
              <div class="resume-info">
                <span class="resume-name">{{ r.displayName || r.id }}</span>
                <span class="resume-id">{{ r.id }}</span>
              </div>
              <div class="resume-row-actions">
                <!-- Active indicator -->
                <span v-if="r.id === currentResumeId && !pendingDeletes.has(r.id)" class="active-badge">active</span>
                <!-- Delete toggle -->
                <button
                  class="delete-toggle"
                  :class="{ active: pendingDeletes.has(r.id) }"
                  @click.stop="pendingDeletes.has(r.id) ? toggleDelete(r.id) : requestDelete(r.id)"
                  :aria-label="pendingDeletes.has(r.id) ? 'Undo delete' : 'Mark for deletion'"
                  :title="pendingDeletes.has(r.id) ? 'Undo' : 'Delete'"
                >
                  <svg v-if="!pendingDeletes.has(r.id)" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    <path d="M10 11v6M14 11v6" />
                    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                  </svg>
                  <svg v-else width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="9 14 4 9 9 4" />
                    <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
                  </svg>
                </button>
              </div>
            </li>
          </ul>

          <p v-if="pendingDeletes.size > 0" class="pending-warning">
            {{ pendingDeletes.size }} resume{{ pendingDeletes.size > 1 ? 's' : '' }} will be permanently deleted on Save.
          </p>
        </div>

        <!-- Confirm-delete dialog -->
        <div v-if="confirmDeleteId" class="confirm-overlay" @click.self="confirmDeleteId = null">
          <div class="confirm-dialog">
            <p class="confirm-message">Delete <strong>{{ confirmDeleteName }}</strong>?</p>
            <p class="confirm-hint">This will be permanently removed on Save.</p>
            <div class="confirm-actions">
              <button class="btn-cancel" @click="confirmDeleteId = null">Cancel</button>
              <button class="btn-confirm-delete" @click="confirmAndDelete">Delete</button>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn-upload" @click="openUpload">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            Upload New…
          </button>
          <div class="footer-right">
            <div v-if="saving" class="footer-spinner"></div>
            <button
              class="btn-save"
              :disabled="!hasChanges || saving"
              @click="save"
            >
              {{ saving ? 'Saving…' : 'Save' }}
            </button>
            <button class="btn-cancel" @click="cancel">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { listResumes, deleteResume } from '../api/resumeManagerApi.mjs'

const props = defineProps({
  isOpen: { type: Boolean, required: true },
  currentResumeId: { type: String, default: 'default' },
})

const emit = defineEmits(['close', 'deleted', 'selected', 'open-upload'])

const resumes = ref([])
const loading = ref(false)
const loadError = ref(null)
const pendingDeletes = ref(new Set())
const selectedId = ref(null)
const saving = ref(false)
const confirmDeleteId = ref(null)

const confirmDeleteName = computed(() => {
  if (!confirmDeleteId.value) return ''
  const r = resumes.value.find(r => r.id === confirmDeleteId.value)
  return r?.displayName || r?.id || confirmDeleteId.value
})

const hasChanges = computed(() => {
  const selectionChanged = selectedId.value && selectedId.value !== props.currentResumeId && !pendingDeletes.value.has(selectedId.value)
  return pendingDeletes.value.size > 0 || selectionChanged
})

watch(() => props.isOpen, async (open) => {
  if (!open) return
  pendingDeletes.value = new Set()
  selectedId.value = props.currentResumeId
  loading.value = true
  loadError.value = null
  try {
    resumes.value = await listResumes()
  } catch (err) {
    loadError.value = err.message
  } finally {
    loading.value = false
  }
})

function selectResume(id) {
  if (pendingDeletes.value.has(id)) return
  selectedId.value = id
}

function openResume(id) {
  if (pendingDeletes.value.has(id)) return
  emit('selected', id)
  emit('close')
}

function requestDelete(id) {
  confirmDeleteId.value = id
}

async function confirmAndDelete() {
  const id = confirmDeleteId.value
  if (!id) return
  confirmDeleteId.value = null
  try {
    await deleteResume(id)
  } catch (err) {
    loadError.value = `Delete failed: ${err.message}`
    return
  }
  // Remove from local list immediately
  resumes.value = resumes.value.filter(r => r.id !== id)
  // Clean up any pending state
  const s = new Set(pendingDeletes.value)
  s.delete(id)
  pendingDeletes.value = s
  if (selectedId.value === id) selectedId.value = props.currentResumeId
  emit('deleted', [id])
}

function toggleDelete(id) {
  const s = new Set(pendingDeletes.value)
  if (s.has(id)) {
    s.delete(id)
  } else {
    s.add(id)
    // If we just marked the selected row for deletion, clear selection
    if (selectedId.value === id) selectedId.value = props.currentResumeId
  }
  pendingDeletes.value = s
}

async function save() {
  if (!hasChanges.value) return
  saving.value = true
  const deleted = []
  const errors = []

  for (const id of pendingDeletes.value) {
    try {
      await deleteResume(id)
      deleted.push(id)
    } catch (err) {
      errors.push({ id, message: err.message })
    }
  }

  saving.value = false

  if (errors.length) {
    loadError.value = 'Some deletes failed: ' + errors.map(e => `${e.id}: ${e.message}`).join('; ')
    return
  }

  if (deleted.length) emit('deleted', deleted)

  const newSelection = selectedId.value && !deleted.includes(selectedId.value) ? selectedId.value : null
  if (newSelection && newSelection !== props.currentResumeId) emit('selected', newSelection)

  emit('close')
}

function cancel() {
  emit('close')
}

function openUpload() {
  emit('open-upload')
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 11000;
  backdrop-filter: blur(4px);
}

.modal-container {
  position: relative;
  background: #1e1e1e;
  border-radius: 12px;
  width: 90%;
  max-width: 560px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  font-family: sans-serif;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid #333;
}

.modal-header h2 {
  margin: 0;
  color: #fff;
  font-size: 20px;
  font-weight: 600;
}

.close-button {
  background: none;
  border: none;
  color: #999;
  cursor: pointer;
  padding: 4px;
}
.close-button:hover { color: #fff; }

.modal-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px 24px;
}

.loading-state, .empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 32px;
  color: #999;
  gap: 8px;
}

.empty-hint { font-size: 13px; color: #666; }

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #333;
  border-top-color: #3498db;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.error-message {
  color: #dc3545;
  padding: 12px;
  background: #3a2a2a;
  border: 1px solid #dc3545;
  border-radius: 6px;
  font-size: 14px;
}

.resume-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.resume-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-radius: 6px;
  background: #2a2a2a;
  border: 2px solid transparent;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  gap: 8px;
}

.resume-row:hover:not(.marked-for-deletion) {
  background: #333;
}

.resume-row.is-selected {
  border-color: #3498db;
  background: #1a2a3a;
}

.resume-row.is-current {
  border-color: #2ecc71;
}

.resume-row.is-selected.is-current {
  border-color: #2ecc71;
}

.resume-row.marked-for-deletion {
  background: #3a2020;
  opacity: 0.55;
  text-decoration: line-through;
  cursor: default;
}

.resume-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.resume-name {
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.resume-id {
  color: #666;
  font-size: 11px;
  font-family: monospace;
}

.resume-row-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.active-badge {
  background: #27ae60;
  color: #fff;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  padding: 2px 7px;
  border-radius: 10px;
  letter-spacing: 0.03em;
}

.delete-toggle {
  background: none;
  border: 1px solid #555;
  border-radius: 4px;
  color: #999;
  cursor: pointer;
  padding: 4px 6px;
  display: flex;
  align-items: center;
  transition: all 0.15s;
}
.delete-toggle:hover { border-color: #dc3545; color: #dc3545; }
.delete-toggle.active { border-color: #3498db; color: #3498db; }

.pending-warning {
  margin-top: 12px;
  color: #e67e22;
  font-size: 13px;
  text-align: center;
}

.modal-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 16px 24px;
  border-top: 1px solid #333;
}

.footer-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.footer-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid #555;
  border-top-color: #3498db;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  flex-shrink: 0;
}

.btn-upload {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: none;
  border: 1px solid #555;
  border-radius: 6px;
  color: #ccc;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s;
}
.btn-upload:hover { border-color: #3498db; color: #3498db; }

.btn-cancel {
  padding: 8px 20px;
  background: none;
  border: 1px solid #555;
  border-radius: 6px;
  color: #ccc;
  font-size: 14px;
  cursor: pointer;
}
.btn-cancel:hover { border-color: #888; color: #fff; }

.btn-save {
  padding: 8px 20px;
  background: #3498db;
  border: none;
  border-radius: 6px;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}
.btn-save:hover:not(:disabled) { background: #2980b9; }
.btn-save:disabled { opacity: 0.4; cursor: not-allowed; }

.modal-enter-active, .modal-leave-active { transition: opacity 0.25s ease; }
.modal-enter-from, .modal-leave-to { opacity: 0; }

.confirm-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  z-index: 10;
}

.confirm-dialog {
  background: #2a2a2a;
  border: 1px solid #444;
  border-radius: 10px;
  padding: 24px 28px;
  min-width: 280px;
  text-align: center;
}

.confirm-message {
  font-size: 15px;
  color: #eee;
  margin: 0 0 6px;
}

.confirm-hint {
  font-size: 12px;
  color: #888;
  margin: 0 0 20px;
}

.confirm-actions {
  display: flex;
  justify-content: center;
  gap: 10px;
}

.btn-confirm-delete {
  padding: 8px 20px;
  background: #c0392b;
  border: none;
  border-radius: 6px;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}
.btn-confirm-delete:hover { background: #a93226; }
</style>
