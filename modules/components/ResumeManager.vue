<template>
  <Transition name="modal">
    <div v-if="isOpen" class="modal-overlay" @click.self="handleClose">
      <div class="modal-container">
        <!-- Header -->
        <div class="modal-header">
          <h2>Resume Manager</h2>
          <button class="close-button" @click="handleClose" aria-label="Close">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <!-- Content -->
        <div class="modal-content">
          <!-- Upload Section -->
          <section class="upload-section">
            <h3>Upload New Resume</h3>
            <div class="upload-area">
              <input
                ref="fileInput"
                type="file"
                accept=".docx,.pdf"
                @change="handleFileSelect"
                class="file-input"
                id="resume-file-input"
              />
              <label for="resume-file-input" class="file-label">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <span class="file-label-text">
                  {{ selectedFile ? selectedFile.name : 'Click to select .docx or .pdf file' }}
                </span>
              </label>

              <!-- OR Divider -->
              <div class="divider">
                <span class="divider-text">OR</span>
              </div>

              <!-- URL Input -->
              <div class="url-input-section">
                <input
                  v-model="resumeUrl"
                  type="url"
                  placeholder="Enter resume URL (https://...)"
                  class="url-input"
                  @input="handleUrlInput"
                />
                <small class="url-hint">Paste a direct link to a .docx or .pdf file</small>
              </div>

              <!-- Upload Controls (shown when file OR URL is provided) -->
              <div v-if="selectedFile || resumeUrl" class="upload-controls">
                <input
                  v-model="displayName"
                  type="text"
                  placeholder="Display name (optional)"
                  class="display-name-input"
                />
                <button
                  @click="handleUpload"
                  :disabled="uploading"
                  class="upload-button"
                >
                  {{ uploading ? 'Processing...' : (selectedFile ? 'Upload & Parse' : 'Fetch & Parse') }}
                </button>
              </div>

              <div v-if="uploading" class="progress-container">
                <div class="progress-bar">
                  <div class="progress-fill" :style="{ width: `${uploadProgress}%` }"></div>
                </div>
                <p class="progress-text">{{ uploadProgress }}% - {{ uploadStatus }}</p>
              </div>

              <div v-if="uploadError" class="error-message">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <pre class="error-text">{{ uploadError }}</pre>
              </div>
            </div>
          </section>

          <!-- Library Section -->
          <section class="library-section">
            <h3>Resume Library</h3>

            <div v-if="loadingResumes" class="loading-state">
              <div class="spinner"></div>
              <p>Loading resumes...</p>
            </div>

            <div v-else-if="loadError" class="error-message">
              Failed to load resumes: {{ loadError }}
            </div>

            <div v-else-if="resumes.length === 0" class="empty-state">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <p>No parsed resumes found</p>
              <p class="empty-hint">Upload a .docx or .pdf file to get started</p>
            </div>

            <div v-else class="resume-grid">
              <div
                v-for="resume in resumes"
                :key="resume.id"
                :class="['resume-card', { active: resume.id === currentResumeId }]"
                @click="handleResumeSelect(resume)"
              >
                <div class="resume-card-header">
                  <h4 class="resume-title">{{ resume.displayName }}</h4>
                  <span v-if="resume.id === currentResumeId" class="active-badge">Active</span>
                </div>
                <div class="resume-card-meta">
                  <div class="meta-item">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                    <span>{{ formatDate(resume.createdAt) }}</span>
                  </div>
                  <div class="meta-item">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                    </svg>
                    <span>{{ resume.jobCount }} jobs</span>
                  </div>
                  <div class="meta-item">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M12 2L2 7l10 5 10-5-10-5z" />
                      <path d="M2 17l10 5 10-5M2 12l10 5 10-5" />
                    </svg>
                    <span>{{ resume.skillCount }} skills</span>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { listResumes, uploadResume } from '../api/resumeManagerApi.mjs'
import { useAppState } from '../composables/useAppState.ts'

const props = defineProps({
  isOpen: {
    type: Boolean,
    required: true
  },
  currentResumeId: {
    type: String,
    default: 'default'
  }
})

const emit = defineEmits(['close', 'resume-selected'])

// State
const resumes = ref([])
const loadingResumes = ref(false)
const loadError = ref(null)
const selectedFile = ref(null)
const resumeUrl = ref('')
const displayName = ref('')
const uploading = ref(false)
const uploadProgress = ref(0)
const uploadStatus = ref('')
const uploadError = ref(null)
const fileInput = ref(null)

// Load resumes when modal opens
watch(() => props.isOpen, async (isOpen) => {
  if (isOpen) {
    await loadResumeList()
  }
})

onMounted(async () => {
  if (props.isOpen) {
    await loadResumeList()
  }
})

async function loadResumeList() {
  console.log('[ResumeManager] Loading resume list...')
  loadingResumes.value = true
  loadError.value = null

  try {
    const data = await listResumes()
    console.log('[ResumeManager] Received resume data:', data)
    console.log('[ResumeManager] Data type:', Array.isArray(data) ? 'array' : typeof data)
    console.log('[ResumeManager] Resume count:', Array.isArray(data) ? data.length : 'N/A')
    resumes.value = Array.isArray(data) ? data : (data.resumes || [])
    console.log('[ResumeManager] ✅ Loaded', resumes.value.length, 'resumes')
  } catch (error) {
    loadError.value = error.message
    console.error('[ResumeManager] ❌ Failed to load resumes:', error)
  } finally {
    loadingResumes.value = false
  }
}

function handleFileSelect(event) {
  const file = event.target.files[0]
  if (file) {
    const isDocx = file.name.endsWith('.docx')
    const isPdf = file.name.endsWith('.pdf')
    if (!isDocx && !isPdf) {
      uploadError.value = 'Please select a .docx or .pdf file'
      selectedFile.value = null
      return
    }
    selectedFile.value = file
    resumeUrl.value = '' // Clear URL when file is selected
    displayName.value = file.name.replace(/\.(docx|pdf)$/, '')
    uploadError.value = null
  }
}

function handleUrlInput() {
  if (resumeUrl.value) {
    selectedFile.value = null // Clear file when URL is entered
    if (fileInput.value) {
      fileInput.value.value = ''
    }
    uploadError.value = null

    // Auto-populate display name from URL filename
    try {
      const url = new URL(resumeUrl.value)
      const filename = url.pathname.split('/').pop()
      if (filename) {
        displayName.value = filename.replace(/\.(docx|pdf)$/i, '')
      }
    } catch (e) {
      // Invalid URL, ignore
    }
  }
}

async function handleUpload() {
  if (!selectedFile.value && !resumeUrl.value) {
    uploadError.value = 'Please select a file or enter a URL'
    return
  }

  uploading.value = true
  uploadProgress.value = 0
  uploadStatus.value = selectedFile.value ? 'Uploading file...' : 'Fetching resume...'
  uploadError.value = null

  try {
    const result = await uploadResume(
      selectedFile.value || resumeUrl.value, // Pass file or URL
      displayName.value || null,
      (progress) => {
        uploadProgress.value = progress
        if (progress < 100) {
          uploadStatus.value = selectedFile.value ? 'Uploading file...' : 'Downloading resume...'
        } else {
          uploadStatus.value = 'Processing resume...'
        }
      }
    )

    uploadStatus.value = 'Resume parsed successfully!'
    uploadProgress.value = 100

    // Reload resume list
    await loadResumeList()

    // Auto-select the new resume
    setTimeout(() => {
      handleResumeSelect(result)
    }, 500)

    // Reset form
    setTimeout(() => {
      selectedFile.value = null
      resumeUrl.value = ''
      displayName.value = ''
      uploadProgress.value = 0
      uploadStatus.value = ''
      if (fileInput.value) {
        fileInput.value.value = ''
      }
    }, 2000)

  } catch (error) {
    uploadError.value = error.message
    uploadStatus.value = ''
    console.error('Upload failed:', error)
  } finally {
    uploading.value = false
  }
}

async function handleResumeSelect(resume) {
  console.log('[ResumeManager] 🎯 Resume selected:', resume.id)
  console.log('[ResumeManager] Display name:', resume.displayName)
  console.log('[ResumeManager] Job count:', resume.jobCount)
  console.log('[ResumeManager] Skill count:', resume.skillCount)
  emit('resume-selected', resume.id)
  console.log('[ResumeManager] ✅ Emitted resume-selected event with ID:', resume.id)
}

function handleClose() {
  // Reset upload state when closing
  selectedFile.value = null
  resumeUrl.value = ''
  displayName.value = ''
  uploadError.value = null
  uploadProgress.value = 0
  uploadStatus.value = ''
  if (fileInput.value) {
    fileInput.value.value = ''
  }
  emit('close')
}

function formatDate(dateString) {
  const date = new Date(dateString)
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}
</script>

<style scoped>
/* Modal Overlay & Container */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 11000; /* Higher than ResizeHandle (10000) */
  backdrop-filter: blur(4px);
}

.modal-container {
  background: #1e1e1e;
  border-radius: 12px;
  width: 90%;
  max-width: 900px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  font-family: sans-serif; /* Match scene/resume view fonts */
}

/* Header */
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24px 32px;
  border-bottom: 1px solid #333;
}

.modal-header h2 {
  margin: 0;
  color: #fff;
  font-size: 24px;
  font-weight: 600;
}

.close-button {
  background: none;
  border: none;
  color: #999;
  cursor: pointer;
  padding: 4px;
  transition: color 0.2s;
}

.close-button:hover {
  color: #fff;
}

/* Content */
.modal-content {
  padding: 32px;
  overflow-y: auto;
  flex: 1;
}

/* Sections */
section {
  margin-bottom: 32px;
}

section:last-child {
  margin-bottom: 0;
}

section h3 {
  margin: 0 0 16px 0;
  color: #fff;
  font-size: 18px;
  font-weight: 600;
}

/* Upload Section */
.upload-area {
  background: #2a2a2a;
  border: 2px dashed #444;
  border-radius: 8px;
  padding: 32px;
  text-align: center;
  transition: border-color 0.2s;
}

.upload-area:hover {
  border-color: #666;
}

.file-input {
  display: none;
}

.file-label {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  color: #999;
  transition: color 0.2s;
}

.file-label:hover {
  color: #fff;
}

.file-label svg {
  opacity: 0.7;
}

.file-label-text {
  font-size: 14px;
}

/* Divider */
.divider {
  display: flex;
  align-items: center;
  margin: 24px 0;
  color: #666;
}

.divider::before,
.divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: #444;
}

.divider-text {
  padding: 0 16px;
  font-size: 13px;
  font-weight: 600;
}

/* URL Input Section */
.url-input-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.url-input {
  width: 100%;
  padding: 12px 16px;
  background: #1e1e1e;
  border: 2px solid #444;
  border-radius: 6px;
  color: #fff;
  font-size: 14px;
  transition: border-color 0.2s;
}

.url-input:focus {
  outline: none;
  border-color: #3498db;
}

.url-input::placeholder {
  color: #666;
}

.url-hint {
  color: #666;
  font-size: 12px;
  margin-left: 4px;
}

.upload-controls {
  margin-top: 20px;
  display: flex;
  gap: 12px;
  align-items: center;
}

.display-name-input {
  flex: 1;
  padding: 10px 16px;
  background: #1e1e1e;
  border: 1px solid #444;
  border-radius: 6px;
  color: #fff;
  font-size: 14px;
}

.display-name-input:focus {
  outline: none;
  border-color: #3498db;
}

.upload-button {
  padding: 10px 24px;
  background: #3498db;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.upload-button:hover:not(:disabled) {
  background: #2980b9;
}

.upload-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.progress-container {
  margin-top: 20px;
}

.progress-bar {
  width: 100%;
  height: 8px;
  background: #333;
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 8px;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #3498db, #2ecc71);
  transition: width 0.3s ease;
}

.progress-text {
  color: #999;
  font-size: 13px;
  margin: 0;
}

/* Library Section */
.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px;
  color: #999;
}

.loading-state p,
.empty-state p {
  margin: 8px 0 0 0;
}

.empty-hint {
  font-size: 13px;
  color: #666;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid #333;
  border-top-color: #3498db;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.resume-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.resume-card {
  background: #2a2a2a;
  border: 2px solid #333;
  border-radius: 8px;
  padding: 20px;
  cursor: pointer;
  transition: all 0.2s;
}

.resume-card:hover {
  border-color: #3498db;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(52, 152, 219, 0.2);
}

.resume-card.active {
  border-color: #2ecc71;
  background: linear-gradient(135deg, #1a3a2a 0%, #2a4a3a 100%);
  box-shadow: 0 0 12px rgba(46, 204, 113, 0.3);
  transform: scale(1.02);
}

.resume-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
}

.resume-title {
  margin: 0;
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  flex: 1;
  word-break: break-word;
}

.active-badge {
  background: linear-gradient(135deg, #2ecc71 0%, #27ae60 100%);
  color: #fff;
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  margin-left: 8px;
  flex-shrink: 0;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.8;
  }
}

.resume-card-meta {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #999;
  font-size: 13px;
}

.meta-item svg {
  flex-shrink: 0;
}

/* Error Message */
.error-message {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 16px;
  padding: 12px;
  background: #3a2a2a;
  border: 1px solid #dc3545;
  border-radius: 6px;
  color: #dc3545;
  font-size: 14px;
}

.error-message svg {
  flex-shrink: 0;
  margin-top: 2px;
}

.error-text {
  margin: 0;
  white-space: pre-wrap;
  word-wrap: break-word;
  font-family: 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.4;
}

/* Modal Transitions */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.3s ease;
}

.modal-enter-active .modal-container,
.modal-leave-active .modal-container {
  transition: transform 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal-container,
.modal-leave-to .modal-container {
  transform: scale(0.9);
}

/* Scrollbar styling */
.modal-content::-webkit-scrollbar {
  width: 8px;
}

.modal-content::-webkit-scrollbar-track {
  background: #1e1e1e;
}

.modal-content::-webkit-scrollbar-thumb {
  background: #444;
  border-radius: 4px;
}

.modal-content::-webkit-scrollbar-thumb:hover {
  background: #555;
}
</style>
