<template>
  <div class="color-palette-selector" v-if="isVisible">
    <div class="palette-dropdown">
      <button class="palette-toggle" @click="toggleDropdown" :title="currentPaletteName">
        🎨
      </button>
      <div v-if="isDropdownOpen" class="palette-list">
        <div 
          v-for="paletteName in orderedPaletteNames" 
          :key="paletteName"
          class="palette-option"
          :class="{ active: paletteName === currentPaletteName }"
          @click="selectPalette(paletteName)"
        >
          <div class="palette-preview">
            <div 
              v-for="(color, index) in getPalettePreview(paletteName)" 
              :key="index"
              class="color-swatch"
              :style="{ backgroundColor: color }"
            ></div>
          </div>
          <span class="palette-name">{{ paletteName }}</span>
        </div>
        <div class="palette-option palette-option-3d" @click="open3DModal">
          <span class="palette-name">3D Settings</span>
        </div>
      </div>
    </div>

    <!-- 3D Settings modal -->
    <div v-if="show3DModal" class="modal-overlay" @click.self="close3DModal">
      <div class="modal-3d" role="dialog" aria-labelledby="modal-3d-title">
        <h3 id="modal-3d-title" class="modal-title">3D Settings</h3>
        <div class="modal-body">
          <label class="modal-row">
            <span>Blur at max Z (0–5; 0 = no z-based blur)</span>
            <input v-model.number="form3D.blurAtMaxZ" type="number" :min="renderingLimits.blurAtMaxZ.min" :max="renderingLimits.blurAtMaxZ.max" :step="renderingLimits.blurAtMaxZ.step" />
          </label>
          <label class="modal-row">
            <span>Saturation at max Z (0–100%; 100% = no change)</span>
            <input v-model.number="form3D.saturationAtMaxZ" type="number" :min="renderingLimits.saturationAtMaxZ.min" :max="renderingLimits.saturationAtMaxZ.max" :step="renderingLimits.saturationAtMaxZ.step" />
          </label>
          <label class="modal-row">
            <span>Brightness at max Z ({{ renderingLimits.brightnessAtMaxZ.min }}–{{ renderingLimits.brightnessAtMaxZ.max }}%; 100% = no z-based darkness)</span>
            <input v-model.number="form3D.brightnessAtMaxZ" type="number" :min="renderingLimits.brightnessAtMaxZ.min" :max="renderingLimits.brightnessAtMaxZ.max" :step="renderingLimits.brightnessAtMaxZ.step" />
          </label>
          <label class="modal-row">
            <span>Parallax scale at min scene Z / near (scene Z = distance, not z-index; 0–1.5)</span>
            <input v-model.number="form3D.parallaxScaleAtMinZ" type="number" :min="renderingLimits.parallaxScaleAtMinZ.min" :max="renderingLimits.parallaxScaleAtMinZ.max" :step="renderingLimits.parallaxScaleAtMinZ.step" />
          </label>
          <label class="modal-row">
            <span>Parallax scale at max scene Z / far (0–1.5)</span>
            <input v-model.number="form3D.parallaxScaleAtMaxZ" type="number" :min="renderingLimits.parallaxScaleAtMaxZ.min" :max="renderingLimits.parallaxScaleAtMaxZ.max" :step="renderingLimits.parallaxScaleAtMaxZ.step" />
          </label>
          <label class="modal-row modal-row-checkbox">
            <span>Show focal point (opacity 0 when off; position and parallax unchanged)</span>
            <input v-model="form3D.focalPointUiVisible" type="checkbox" />
          </label>
          <label class="modal-row modal-row-checkbox">
            <span>Show bulls-eye (opacity 0 when off; centering and parallax unchanged)</span>
            <input v-model="form3D.bullsEyeUiVisible" type="checkbox" />
          </label>
        </div>
        <div class="modal-footer">
          <button type="button" class="modal-btn modal-btn-cancel" @click="close3DModal">Cancel</button>
          <button type="button" class="modal-btn modal-btn-save" @click="save3DSettings">Save</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useColorPalette } from '../composables/useColorPalette.mjs'
import { useAppState } from '../composables/useAppState.ts'
import { setFromAppState as setRenderingFromAppState, getRendering, clampRenderingValue } from '../core/renderingConfig.mjs'
import { reportError } from '../utils/errorReporting.mjs'

// Use color palette composable
const {
  colorPalettes,
  orderedPaletteNames,
  currentPaletteName,
  setCurrentPalette,
  loadPalettes
} = useColorPalette()

const { appState, updateAppState } = useAppState()

/** Only from app_state.json / app_state.default.json (no default in code). */
const renderingLimits = computed(() => appState.value?.['system-constants']?.renderingLimits)

// Local state
const isDropdownOpen = ref(false)
const isVisible = ref(false)
const show3DModal = ref(false)
const form3D = ref({
  blurAtMaxZ: 0,
  saturationAtMaxZ: 100,
  brightnessAtMaxZ: 100,
  parallaxScaleAtMinZ: 1.0,
  parallaxScaleAtMaxZ: 1.0,
  focalPointUiVisible: true,
  bullsEyeUiVisible: true
})

// Show selector after palettes are loaded
const showSelector = computed(() => {
  return orderedPaletteNames.value.length > 0
})

// Methods
const toggleDropdown = () => {
  isDropdownOpen.value = !isDropdownOpen.value
}

const selectPalette = (paletteName) => {
  setCurrentPalette(paletteName)
  isDropdownOpen.value = false
}

const getPalettePreview = (paletteName) => {
  const palette = colorPalettes.value[paletteName]
  if (!palette || !Array.isArray(palette)) return []
  return palette.slice(0, 4)
}

// Close dropdown when clicking outside
const handleClickOutside = (event) => {
  if (!event.target.closest('.color-palette-selector')) {
    isDropdownOpen.value = false
  }
}

function open3DModal() {
  isDropdownOpen.value = false
  const limits = renderingLimits.value
  const r = appState.value?.['system-constants']?.rendering || getRendering()
  const saturationRaw = r.saturationAtMaxZ ?? 100
  const saturationPct = (typeof saturationRaw === 'number' && saturationRaw <= 1 && saturationRaw >= 0) ? Math.round(saturationRaw * 100) : saturationRaw
  const brightnessRaw = r.brightnessAtMaxZ
  const brightnessPct = (typeof brightnessRaw === 'number' && brightnessRaw <= 1 && brightnessRaw > 0) ? Math.round(brightnessRaw * 100) : brightnessRaw
  form3D.value = {
    blurAtMaxZ: clampRenderingValue(limits, 'blurAtMaxZ', r.blurAtMaxZ),
    saturationAtMaxZ: clampRenderingValue(limits, 'saturationAtMaxZ', saturationPct),
    brightnessAtMaxZ: clampRenderingValue(limits, 'brightnessAtMaxZ', brightnessPct),
    parallaxScaleAtMinZ: clampRenderingValue(limits, 'parallaxScaleAtMinZ', r.parallaxScaleAtMinZ),
    parallaxScaleAtMaxZ: clampRenderingValue(limits, 'parallaxScaleAtMaxZ', r.parallaxScaleAtMaxZ),
    focalPointUiVisible: r.focalPointUiVisible !== false,
    bullsEyeUiVisible: r.bullsEyeUiVisible !== false
  }
  show3DModal.value = true
}

function close3DModal() {
  show3DModal.value = false
}

async function save3DSettings() {
  const limits = renderingLimits.value
  const r = appState.value?.['system-constants']?.rendering || {}
  const updated = {
    ...r,
    blurAtMaxZ: clampRenderingValue(limits, 'blurAtMaxZ', form3D.value.blurAtMaxZ),
    saturationAtMaxZ: clampRenderingValue(limits, 'saturationAtMaxZ', form3D.value.saturationAtMaxZ),
    brightnessAtMaxZ: clampRenderingValue(limits, 'brightnessAtMaxZ', form3D.value.brightnessAtMaxZ),
    parallaxScaleAtMinZ: clampRenderingValue(limits, 'parallaxScaleAtMinZ', form3D.value.parallaxScaleAtMinZ),
    parallaxScaleAtMaxZ: clampRenderingValue(limits, 'parallaxScaleAtMaxZ', form3D.value.parallaxScaleAtMaxZ),
    focalPointUiVisible: !!form3D.value.focalPointUiVisible,
    bullsEyeUiVisible: !!form3D.value.bullsEyeUiVisible
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
    close3DModal()
  } catch (e) {
    reportError(e, '[ColorPaletteSelector] Failed to save 3D settings')
    throw e
  }
}

// Lifecycle
onMounted(async () => {
  try {
    await loadPalettes()
    isVisible.value = true
    document.addEventListener('click', handleClickOutside)
  } catch (error) {
    reportError(error, '[ColorPaletteSelector] Failed to load palettes')
    throw error
  }
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<style scoped>
.color-palette-selector {
  position: relative;
  z-index: 1000;
}

.palette-dropdown {
  position: relative;
}

.palette-toggle {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid white;
  background-color: var(--button-bg-color, #555);
  color: white;
  cursor: pointer;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 14px;
  transition: all 0.2s ease;
}

.palette-toggle:hover {
  background-color: white;
  color: black;
  border-color: black;
}

.palette-list {
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.9);
  border: 1px solid #555;
  border-radius: 8px;
  min-width: 200px;
  max-height: 300px;
  overflow-y: auto;
  margin-top: 4px;
  backdrop-filter: blur(10px);
}

.palette-option {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.palette-option:hover {
  background-color: rgba(255, 255, 255, 0.1);
}

.palette-option.active {
  background-color: rgba(255, 255, 255, 0.2);
}

.palette-preview {
  display: flex;
  margin-right: 8px;
  border-radius: 4px;
  overflow: hidden;
}

.color-swatch {
  width: 12px;
  height: 12px;
  border: 1px solid rgba(255, 255, 255, 0.3);
}

.palette-name {
  color: white;
  font-size: 12px;
  white-space: nowrap;
}

.palette-option-3d {
  border-top: 1px solid rgba(255, 255, 255, 0.2);
  margin-top: 4px;
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

.modal-row input {
  width: 72px;
  padding: 4px 8px;
  border-radius: 4px;
  border: 1px solid #555;
  background: #222;
  color: white;
}

.modal-row-checkbox input[type='checkbox'] {
  width: auto;
  min-width: auto;
  padding: 0;
  accent-color: #0088cc;
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