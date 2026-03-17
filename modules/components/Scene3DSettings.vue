<template>
  <div class="scene-3d-settings">
    <button
      id="scene-3d-button"
      type="button"
      class="toggle-circle"
      title="3D Settings (parallax, blur, brightness)"
      @click.stop="openModal"
    >
      3D
    </button>

    <div v-if="showModal" class="modal-overlay" @click.self="closeModal">
      <div class="modal-3d" role="dialog" aria-labelledby="modal-3d-title">
        <h3 id="modal-3d-title" class="modal-title">3D Settings</h3>
        <div class="modal-body">
          <label class="modal-row">
            <span>Blur at max Z (0–5; 0 = no z-based blur)</span>
            <input v-model.number="form.blurAtMaxZ" type="number" min="0" max="5" step="0.5" />
          </label>
          <label class="modal-row">
            <span>Saturation at max Z (0–100%; 100% = no change)</span>
            <input v-model.number="form.saturationAtMaxZ" type="number" min="0" max="100" step="5" />
          </label>
          <label class="modal-row">
            <span>Brightness at max Z (75–100%; 100% = no z-based darkness)</span>
            <input v-model.number="form.brightnessAtMaxZ" type="number" min="75" max="100" step="5" />
          </label>
          <label class="modal-row">
            <span>Parallax scale at min scene Z / near (0–1.5)</span>
            <input v-model.number="form.parallaxScaleAtMinZ" type="number" min="0" max="1.5" step="0.05" />
          </label>
          <label class="modal-row">
            <span>Parallax scale at max scene Z / far (0–1.5)</span>
            <input v-model.number="form.parallaxScaleAtMaxZ" type="number" min="0" max="1.5" step="0.05" />
          </label>
        </div>
        <div class="modal-footer">
          <button type="button" class="modal-btn modal-btn-cancel" @click="closeModal">Cancel</button>
          <button type="button" class="modal-btn modal-btn-save" @click="save">Save</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useAppState } from '../composables/useAppState.ts'
import { setFromAppState as setRenderingFromAppState, getRendering } from '../core/renderingConfig.mjs'

const { appState, updateAppState } = useAppState()

const showModal = ref(false)
const form = ref({
  blurAtMaxZ: 0,
  saturationAtMaxZ: 100,
  brightnessAtMaxZ: 100,
  parallaxScaleAtMinZ: 1.0,
  parallaxScaleAtMaxZ: 1.0
})

function clamp(val, min, max) {
  const n = Number(val)
  if (Number.isNaN(n)) return min
  return Math.max(min, Math.min(max, n))
}

function openModal() {
  const r = appState.value?.['system-constants']?.rendering || getRendering()
  const saturationRaw = r.saturationAtMaxZ ?? 100
  const saturationPct = (typeof saturationRaw === 'number' && saturationRaw <= 1 && saturationRaw >= 0) ? Math.round(saturationRaw * 100) : saturationRaw
  const brightnessRaw = r.brightnessAtMaxZ
  const brightnessPct = (typeof brightnessRaw === 'number' && brightnessRaw <= 1 && brightnessRaw > 0) ? Math.round(brightnessRaw * 100) : brightnessRaw
  form.value = {
    blurAtMaxZ: clamp(r.blurAtMaxZ, 0, 5),
    saturationAtMaxZ: clamp(saturationPct, 0, 100),
    brightnessAtMaxZ: clamp(brightnessPct, 75, 100),
    parallaxScaleAtMinZ: clamp(r.parallaxScaleAtMinZ, 0, 1.5),
    parallaxScaleAtMaxZ: clamp(r.parallaxScaleAtMaxZ, 0, 1.5)
  }
  showModal.value = true
}

function closeModal() {
  showModal.value = false
}

async function save() {
  const r = appState.value?.['system-constants']?.rendering || {}
  const updated = {
    ...r,
    blurAtMaxZ: clamp(form.value.blurAtMaxZ, 0, 5),
    saturationAtMaxZ: clamp(form.value.saturationAtMaxZ, 0, 100),
    brightnessAtMaxZ: clamp(form.value.brightnessAtMaxZ, 75, 100),
    parallaxScaleAtMinZ: clamp(form.value.parallaxScaleAtMinZ, 0, 1.5),
    parallaxScaleAtMaxZ: clamp(form.value.parallaxScaleAtMaxZ, 0, 1.5)
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
    console.error('[Scene3DSettings] Failed to save 3D settings:', e)
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

.modal-row input {
  width: 72px;
  padding: 4px 8px;
  border-radius: 4px;
  border: 1px solid #555;
  background: #222;
  color: white;
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
