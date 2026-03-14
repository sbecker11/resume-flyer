<template>
  <Teleport to="body">
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
            <h3>Upload Resume</h3>
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

              <!-- Upload Controls (always visible) -->
              <div class="upload-controls">
                <input
                  v-if="selectedFile || resumeUrl"
                  v-model="displayName"
                  type="text"
                  placeholder="Display name (optional)"
                  class="display-name-input"
                />
                <div class="upload-actions">
                  <div v-if="uploading" class="spinner"></div>
                  <button @click="handleClose" class="cancel-button">Cancel</button>
                  <button
                    @click="handleUpload"
                    :disabled="uploading || (!selectedFile && !resumeUrl)"
                    class="upload-button"
                  >
                    {{ uploading ? 'Processing...' : (selectedFile ? 'Upload & Parse' : 'Fetch & Parse') }}
                  </button>
                </div>
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
        </div>
      </div>
    </div>
  </Transition>
  </Teleport>
</template>

<script setup>
import { ref } from 'vue'
import { uploadResume } from '../api/resumeManagerApi.mjs'

const props = defineProps({
  isOpen: { type: Boolean, required: true }
})

const emit = defineEmits(['close', 'resume-selected'])

// State
const selectedFile = ref(null)
const resumeUrl = ref('')
const displayName = ref('')
const uploading = ref(false)
const uploadProgress = ref(0)
const uploadStatus = ref('')
const uploadError = ref(null)
const fileInput = ref(null)

async function handleFileSelect(event) {
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
    await handleUpload()
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

    // Auto-select the new resume after a brief pause
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

function handleResumeSelect(resume) {
  emit('resume-selected', resume.id)
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
  color: #fff;
  background: #2563eb;
  border-radius: 6px;
  padding: 20px 16px;
  width: 100%;
  box-sizing: border-box;
  transition: background 0.2s;
}

.file-label:hover {
  background: #1d4ed8;
  color: #fff;
}

.file-label svg {
  opacity: 0.9;
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
  background: #2563eb;
  border-radius: 6px;
  padding: 20px 16px;
  box-sizing: border-box;
}

.url-input {
  width: 100%;
  padding: 12px 16px;
  background: #1e1e2e;
  border: 2px solid rgba(255, 255, 255, 0.25);
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
  color: #aaa;
}

.url-hint {
  color: rgba(255, 255, 255, 0.75);
  font-size: 12px;
  margin-left: 4px;
}

.upload-controls {
  margin-top: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.upload-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.cancel-button {
  padding: 10px 20px;
  background: none;
  border: 1px solid #555;
  border-radius: 6px;
  color: #ccc;
  font-size: 14px;
  cursor: pointer;
}

.cancel-button:hover {
  border-color: #888;
  color: #fff;
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
  flex-shrink: 0;
}

.upload-actions .spinner {
  width: 22px;
  height: 22px;
  border-width: 2px;
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
