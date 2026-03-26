<template>
  <div class="scene-3d-settings">
    <button
      id="scene-3d-button"
      type="button"
      class="toggle-circle"
      title="3D Settings (parallax, blur, focal &amp; bulls-eye visibility)"
      @click.stop="openModal"
    >
      3D
    </button>

    <div v-if="showModal" class="modal-overlay" @click.self="closeModal">
      <div class="modal-3d" role="dialog" aria-labelledby="modal-3d-title">
        <h3 id="modal-3d-title" class="modal-title">3D Settings</h3>
        <div class="modal-body" v-if="renderingLimits">
          <label class="modal-row">
            <span class="modal-row-label">Blur at max Z (0–5; 0 = no z-based blur)</span>
            <span class="modal-row-input-wrap">
              <input v-model.number="form.blurAtMaxZ" type="number" :min="renderingLimits.blurAtMaxZ.min" :max="renderingLimits.blurAtMaxZ.max" :step="renderingLimits.blurAtMaxZ.step" />
            </span>
          </label>
          <label class="modal-row">
            <span class="modal-row-label">Saturation at max Z (0–100%; 100% = no change)</span>
            <span class="modal-row-input-wrap">
              <input v-model.number="form.saturationAtMaxZ" type="number" :min="renderingLimits.saturationAtMaxZ.min" :max="renderingLimits.saturationAtMaxZ.max" :step="renderingLimits.saturationAtMaxZ.step" />
            </span>
          </label>
          <label class="modal-row">
            <span class="modal-row-label">Brightness at max Z ({{ renderingLimits.brightnessAtMaxZ.min }}–{{ renderingLimits.brightnessAtMaxZ.max }}%; 100% = no z-based darkness)</span>
            <span class="modal-row-input-wrap">
              <input v-model.number="form.brightnessAtMaxZ" type="number" :min="renderingLimits.brightnessAtMaxZ.min" :max="renderingLimits.brightnessAtMaxZ.max" :step="renderingLimits.brightnessAtMaxZ.step" />
            </span>
          </label>
          <label class="modal-row">
            <span class="modal-row-label">Parallax scale at min scene Z / near (0–1.5)</span>
            <span class="modal-row-input-wrap">
              <input v-model.number="form.parallaxScaleAtMinZ" type="number" :min="renderingLimits.parallaxScaleAtMinZ.min" :max="renderingLimits.parallaxScaleAtMinZ.max" :step="renderingLimits.parallaxScaleAtMinZ.step" />
            </span>
          </label>
          <label class="modal-row">
            <span class="modal-row-label">Parallax scale at max scene Z / far (0–1.5)</span>
            <span class="modal-row-input-wrap">
              <input v-model.number="form.parallaxScaleAtMaxZ" type="number" :min="renderingLimits.parallaxScaleAtMaxZ.min" :max="renderingLimits.parallaxScaleAtMaxZ.max" :step="renderingLimits.parallaxScaleAtMaxZ.step" />
            </span>
          </label>
          <div class="modal-row modal-row-toggle">
            <span class="modal-row-label">Show focal point</span>
            <span class="modal-row-input-wrap modal-row-input-wrap--toggle">
              <label class="switch">
                <input v-model="form.focalPointUiVisible" type="checkbox" role="switch" />
                <span class="switch-slider" aria-hidden="true"></span>
              </label>
            </span>
          </div>
          <div class="modal-row modal-row-toggle">
            <span class="modal-row-label">Show viewport center (bulls-eye)</span>
            <span class="modal-row-input-wrap modal-row-input-wrap--toggle">
              <label class="switch">
                <input v-model="form.bullsEyeUiVisible" type="checkbox" role="switch" />
                <span class="switch-slider" aria-hidden="true"></span>
              </label>
            </span>
          </div>
          <div class="focal-mode-radios">
            <label
              v-for="opt in FOCAL_MODE_OPTIONS"
              :key="opt.value"
              class="focal-mode-radio"
              :class="{ selected: store.focalPoint.mode === opt.value }"
              :title="opt.tooltip"
            >
              <input
                type="radio"
                name="focal-mode"
                :value="opt.value"
                :checked="store.focalPoint.mode === opt.value"
                @change="appStoreActions.setFocalPointMode(opt.value)"
              />
              <span class="focal-mode-icon">
                <img
                  v-if="opt.icon !== 'following'"
                  :src="getFocalIconSrc(opt.icon)"
                  width="15"
                  height="15"
                  alt=""
                  class="focal-mode-icon-img"
                />
                <svg
                  v-else
                  class="focal-mode-icon-svg"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.5" />
                  <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1" />
                  <line x1="12" y1="2" x2="12" y2="6" stroke="currentColor" stroke-width="1" />
                  <line x1="12" y1="18" x2="12" y2="22" stroke="currentColor" stroke-width="1" />
                  <line x1="2" y1="12" x2="6" y2="12" stroke="currentColor" stroke-width="1" />
                  <line x1="18" y1="12" x2="22" y2="12" stroke="currentColor" stroke-width="1" />
                </svg>
              </span>
              <span class="focal-mode-tooltip">{{ opt.tooltip }}</span>
            </label>
          </div>
        </div>
        <p v-else class="modal-body">Loading state…</p>
        <div class="modal-footer">
          <button type="button" class="modal-btn modal-btn-cancel" @click="closeModal">Cancel</button>
          <button type="button" class="modal-btn modal-btn-save" @click="save" :disabled="!renderingLimits">Save</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useAppState } from '../composables/useAppState.ts'
import { useAppStore } from '../stores/appStore.mjs'
import { FOCALPOINT_MODES } from '../composables/useFocalPointVue3.mjs'
import { setFromAppState as setRenderingFromAppState, getRendering, clampRenderingValue } from '../core/renderingConfig.mjs'
import { reportError } from '../utils/errorReporting.mjs'

const { appState, updateAppState } = useAppState()
const { store, actions: appStoreActions } = useAppStore()

function getRuntimeBase() {
  const envBase = (import.meta?.env?.BASE_URL || '/')
  let base = envBase
  if (typeof window !== 'undefined') {
    const path = window.location.pathname || '/'
    const parts = path.split('/').filter(Boolean)
    const useSubpath = parts.length > 0 && (envBase === '/' || !path.startsWith(envBase))
    if (useSubpath) base = `/${parts[0]}/`
  }
  return base.endsWith('/') ? base : `${base}/`
}
function basePathJoin(relPath) {
  const b = getRuntimeBase()
  const p = relPath.startsWith('/') ? relPath.slice(1) : relPath
  return `${b}${p}`
}
function getFocalIconSrc(icon) {
  return basePathJoin(`static_content/icons/x-hairs/15/${icon}-15-white.png`)
}

const FOCAL_MODE_OPTIONS = [
  {
    value: FOCALPOINT_MODES.LOCKED,
    tooltip: 'focal point locked at viewport center (bulls eye)\n→ no motion parallax',
    icon: 'locked',
  },
  {
    value: FOCALPOINT_MODES.FOLLOWING,
    tooltip: 'focal point eases to mouse\n→ smooth motion parallax',
    icon: 'following',
  },
  {
    value: FOCALPOINT_MODES.DRAGGING,
    tooltip: 'mouse drags focal point\n→ fast motion parallax',
    icon: 'dragging',
  },
]

/** Only from app_state.json / app_state.default.json (no default in code). */
const renderingLimits = computed(() => appState.value?.['system-constants']?.renderingLimits)

const showModal = ref(false)
const form = ref({
  blurAtMaxZ: 0,
  saturationAtMaxZ: 100,
  brightnessAtMaxZ: 100,
  parallaxScaleAtMinZ: 1.0,
  parallaxScaleAtMaxZ: 1.0,
  focalPointUiVisible: true,
  bullsEyeUiVisible: true
})

function openModal() {
  const limits = renderingLimits.value
  const r = appState.value?.['system-constants']?.rendering || getRendering()
  const saturationRaw = r.saturationAtMaxZ ?? 100
  const saturationPct = (typeof saturationRaw === 'number' && saturationRaw <= 1 && saturationRaw >= 0) ? Math.round(saturationRaw * 100) : saturationRaw
  const brightnessRaw = r.brightnessAtMaxZ
  const brightnessPct = (typeof brightnessRaw === 'number' && brightnessRaw <= 1 && brightnessRaw > 0) ? Math.round(brightnessRaw * 100) : brightnessRaw
  form.value = {
    blurAtMaxZ: clampRenderingValue(limits, 'blurAtMaxZ', r.blurAtMaxZ),
    saturationAtMaxZ: clampRenderingValue(limits, 'saturationAtMaxZ', saturationPct),
    brightnessAtMaxZ: clampRenderingValue(limits, 'brightnessAtMaxZ', brightnessPct),
    parallaxScaleAtMinZ: clampRenderingValue(limits, 'parallaxScaleAtMinZ', r.parallaxScaleAtMinZ),
    parallaxScaleAtMaxZ: clampRenderingValue(limits, 'parallaxScaleAtMaxZ', r.parallaxScaleAtMaxZ),
    focalPointUiVisible: r.focalPointUiVisible !== false,
    bullsEyeUiVisible: r.bullsEyeUiVisible !== false
  }
  showModal.value = true
}

function closeModal() {
  showModal.value = false
}

async function save() {
  const limits = renderingLimits.value
  const r = appState.value?.['system-constants']?.rendering || {}
  const updated = {
    ...r,
    blurAtMaxZ: clampRenderingValue(limits, 'blurAtMaxZ', form.value.blurAtMaxZ),
    saturationAtMaxZ: clampRenderingValue(limits, 'saturationAtMaxZ', form.value.saturationAtMaxZ),
    brightnessAtMaxZ: clampRenderingValue(limits, 'brightnessAtMaxZ', form.value.brightnessAtMaxZ),
    parallaxScaleAtMinZ: clampRenderingValue(limits, 'parallaxScaleAtMinZ', form.value.parallaxScaleAtMinZ),
    parallaxScaleAtMaxZ: clampRenderingValue(limits, 'parallaxScaleAtMaxZ', form.value.parallaxScaleAtMaxZ),
    focalPointUiVisible: !!form.value.focalPointUiVisible,
    bullsEyeUiVisible: !!form.value.bullsEyeUiVisible
  }
  try {
    await updateAppState({
      'system-constants': {
        ...appState.value?.['system-constants'],
        rendering: updated
      }
    }, true)
    setRenderingFromAppState(updated)
    window.dispatchEvent(new CustomEvent('rendering-changed'))
    closeModal()
  } catch (e) {
    reportError(e, '[Scene3DSettings] Failed to save 3D settings')
    throw e
  }
}
</script>

<style scoped>
.scene-3d-settings {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
}

#scene-3d-button {
  width: 24px;
  height: 24px;
  min-width: 24px;
  border-radius: 50%;
  border: 2px solid white;
  background-color: var(--button-bg-color, #555);
  color: var(--button-text-color, white);
  cursor: pointer;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 10px;
  font-weight: 600;
  padding: 0;
  transition: all 0.2s ease;
}

#scene-3d-button:hover {
  background-color: var(--button-text-color, white);
  color: var(--button-bg-color, #555);
  border-color: var(--button-text-color, white);
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.modal-3d {
  font-family: Arial, sans-serif;
  background: rgba(30, 30, 30, 0.98);
  border: 1px solid #555;
  border-radius: 8px;
  min-width: 280px;
  padding: 16px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
}

.modal-title {
  margin: 0 0 12px 0;
  font-size: 16px;
  color: white;
}

.modal-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 16px;
}

.modal-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  color: white;
  font-size: 13px;
}

.modal-row-label {
  flex: 1;
  min-width: 0;
  line-height: 1.35;
}

/* Fixed column so every number input (and stepper) is the same width */
.modal-row-input-wrap {
  flex: 0 0 88px;
  width: 88px;
  display: flex;
  justify-content: flex-end;
  align-items: center;
}

.modal-row-input-wrap input[type='number'] {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  padding: 4px 6px;
  border-radius: 4px;
  border: 1px solid #555;
  background: #222;
  color: white;
}

.modal-row-input-wrap--toggle {
  justify-content: flex-end;
}

/* Toggle switch (checkbox + slider) */
.switch {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
  flex-shrink: 0;
}

.switch input {
  opacity: 0;
  width: 0;
  height: 0;
  position: absolute;
}

.switch-slider {
  position: absolute;
  cursor: pointer;
  inset: 0;
  background: #555;
  border-radius: 12px;
  border: 1px solid #666;
  transition: background 0.2s ease;
}

.switch-slider::before {
  position: absolute;
  content: '';
  height: 18px;
  width: 18px;
  left: 2px;
  top: 50%;
  transform: translateY(-50%);
  background: #fff;
  border-radius: 50%;
  transition: transform 0.2s ease;
}

.switch input:checked + .switch-slider {
  background: #0066aa;
  border-color: #0088cc;
}

.switch input:checked + .switch-slider::before {
  transform: translate(20px, -50%);
}

.switch input:focus-visible + .switch-slider {
  outline: 2px solid #88c8ff;
  outline-offset: 2px;
}

/* Vertical bank of focal-mode radio buttons */
.focal-mode-radios {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 8px;
  padding-top: 12px;
  border-top: 1px solid #444;
}

.focal-mode-radio {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  color: #ddd;
  font-size: 12px;
  line-height: 1.35;
  transition: background 0.15s ease, color 0.15s ease;
}

.focal-mode-radio:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.focal-mode-radio.selected {
  background: rgba(0, 102, 170, 0.25);
  color: #fff;
}

.focal-mode-radio input[type='radio'] {
  margin: 0;
  flex-shrink: 0;
  accent-color: #0088cc;
}

.focal-mode-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 15px;
  height: 15px;
}

.focal-mode-icon-img,
.focal-mode-icon-svg {
  width: 15px;
  height: 15px;
  display: block;
  transform: translate(-0.5px, 0.5px);
}

.focal-mode-icon-svg {
  color: currentColor;
}

.focal-mode-tooltip {
  flex: 1;
  min-width: 0;
  white-space: pre-line;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.modal-btn {
  padding: 6px 14px;
  border-radius: 4px;
  border: 1px solid #555;
  background: #333;
  color: white;
  cursor: pointer;
  font-size: 13px;
}

.modal-btn:hover {
  background: #444;
}

.modal-btn-save {
  background: #0066aa;
  border-color: #0088cc;
}

.modal-btn-save:hover {
  background: #0077bb;
}
</style>
