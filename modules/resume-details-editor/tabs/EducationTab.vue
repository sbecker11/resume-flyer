<template>
  <div class="rde-tab-content">
    <section class="rde-section">
      <div class="rde-top-label">Education</div>
      <p class="rde-hint">Degree, institution, optional dates, and details.</p>

      <div
        v-for="(item, i) in localItems"
        :key="i"
        class="rde-edu-item"
      >
        <div class="rde-row">
          <label class="rde-label">Degree</label>
          <input v-model="item.degree" type="text" class="rde-input" placeholder="BA in Economics" @blur="requestAutosave" />
        </div>
        <div class="rde-row">
          <label class="rde-label">Institution</label>
          <input v-model="item.institution" type="text" class="rde-input" placeholder="Stanford University" @blur="requestAutosave" />
        </div>
        <div class="rde-grid">
          <div class="rde-row">
            <label class="rde-label">Start</label>
            <div class="rde-date-inputs">
              <input
                v-model="item.startYY"
                type="text"
                class="rde-input rde-date-input"
                inputmode="numeric"
                maxlength="4"
                pattern="\\d{0,4}"
                placeholder="YYYY"
                @input="onFourDigitItemInput(item, 'startYY')"
                @blur="() => { onYearBlur(item, 'startYY'); requestAutosave(); }"
              />
              <input
                v-model="item.startMM"
                type="text"
                class="rde-input rde-date-input"
                inputmode="numeric"
                maxlength="2"
                pattern="\\d{0,2}"
                placeholder="MM"
                @input="onTwoDigitItemInput(item, 'startMM')"
                @blur="() => { onMonthBlur(item, 'startMM', 'startYY'); requestAutosave(); }"
              />
            </div>
          </div>
          <div class="rde-row">
            <label class="rde-label">End</label>
            <div class="rde-date-inputs" @focusout="(e) => onEndGroupFocusOut(e, item)">
              <input
                v-model="item.endYY"
                type="text"
                class="rde-input rde-date-input"
                inputmode="numeric"
                maxlength="4"
                pattern="\\d{0,4}"
                placeholder="YYYY"
                @input="onFourDigitItemInput(item, 'endYY')"
              />
              <input
                v-model="item.endMM"
                type="text"
                class="rde-input rde-date-input"
                inputmode="numeric"
                maxlength="2"
                pattern="\\d{0,2}"
                placeholder="MM"
                @input="onTwoDigitItemInput(item, 'endMM')"
              />
            </div>
          </div>
        </div>
        <div class="rde-row">
          <label class="rde-label">Description</label>
          <textarea v-model="item.description" class="rde-textarea" rows="5" placeholder="Relevant coursework, honors, additional notes..." @blur="requestAutosave" />
        </div>

        <button type="button" class="rde-btn-remove" @click="removeItem(i)">Remove</button>
      </div>

      <button type="button" class="rde-btn-add" @click="addItem">+ Add education item</button>
    </section>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';

const props = defineProps({
  data: { type: Object, default: () => ({}) }
});

const emit = defineEmits(['update:data', 'autosave']);

function normalizeItem(entry, fallbackIndex = 0) {
  const { yy: startYY, mm: startMM } = splitYearMonthYYMM(entry?.start);
  const { yy: endYY, mm: endMM } = splitYearMonthYYMM(entry?.end);
  return {
    index: typeof entry?.index === 'number' ? entry.index : fallbackIndex,
    degree: entry?.degree ?? '',
    institution: entry?.institution ?? '',
    startYY,
    startMM,
    endYY,
    endMM,
    description: entry?.description ?? ''
  };
}

function toTwoDigits(value) {
  return String(value ?? '').replace(/\D/g, '').slice(0, 2);
}

function toFourDigits(value) {
  return String(value ?? '').replace(/\D/g, '').slice(0, 4);
}

function normalizeYearOrBlank(value, { minYear = 1900, maxYear = new Date().getFullYear() } = {}) {
  const yyyy = toFourDigits(value);
  if (!yyyy) return '';
  if (yyyy.length !== 4) return null;
  const n = Number(yyyy);
  if (!Number.isFinite(n) || n < minYear || n > maxYear) return null;
  return String(n);
}

function normalizeMonthOrBlank(value) {
  const mm = toTwoDigits(value);
  if (!mm) return '';
  const n = Number(mm);
  if (!Number.isFinite(n) || n < 1 || n > 12) return null;
  return String(n).padStart(2, '0');
}

function ymScore(yyyy, mm) {
  const y = Number(yyyy);
  const m = mm ? Number(mm) : 0;
  return y + (m / 12);
}

/**
 * Parse a variety of persisted formats into {yy, mm}:
 * - "YYYY-MM" or "YYYY/MM"
 * - "YY-MM" or "YY/MM"
 * - "YYYY" or "YY"
 */
function splitYearMonthYYMM(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return { yy: '', mm: '' };
  const parts = raw.split(/[-/]/).map(p => p.trim()).filter(Boolean);
  if (parts.length === 1) {
    const digits = parts[0].replace(/\D/g, '');
    if (digits.length >= 4) return { yy: digits.slice(0, 4), mm: '' };
    return { yy: toFourDigits(digits), mm: '' };
  }
  const yearDigits = parts[0].replace(/\D/g, '');
  const monthDigits = parts[1].replace(/\D/g, '');
  const yy = toFourDigits(yearDigits);
  const mm = toTwoDigits(monthDigits);
  return { yy, mm };
}

function joinYearMonthYYMM(yy, mm) {
  const y = normalizeYearOrBlank(yy);
  const m = normalizeMonthOrBlank(mm);
  if (y === null || m === null) return '';
  if (y && m) return `${y}/${m}`;
  return y || '';
}

function normalizeToArray(data) {
  if (!data || typeof data !== 'object') return [];
  const entries = Object.entries(data);
  entries.sort(([a], [b]) => {
    const na = Number(a);
    const nb = Number(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
    return String(a).localeCompare(String(b));
  });
  return entries.map(([key, value], idx) => normalizeItem(value, Number.isNaN(Number(key)) ? idx : Number(key)));
}

function toIndexedObject(items) {
  const out = {};
  items.forEach((item, i) => {
    out[String(i)] = {
      index: i,
      degree: item.degree ?? '',
      institution: item.institution ?? '',
      start: joinYearMonthYYMM(item.startYY, item.startMM),
      end: joinYearMonthYYMM(item.endYY, item.endMM),
      description: item.description ?? ''
    };
  });
  return out;
}

const localItems = ref(normalizeToArray(props.data));
let isSyncingFromParent = false;

watch(
  () => props.data,
  (nextData) => {
    isSyncingFromParent = true;
    localItems.value = normalizeToArray(nextData);
    isSyncingFromParent = false;
  },
  { immediate: true }
);

watch(
  localItems,
  (items) => {
    if (isSyncingFromParent) return;
    emit('update:data', toIndexedObject(items));
  },
  { deep: true }
);

function addItem() {
  localItems.value.push(normalizeItem({}, localItems.value.length));
}

function removeItem(index) {
  localItems.value.splice(index, 1);
}

function onTwoDigitItemInput(item, field) {
  item[field] = toTwoDigits(item[field]);
}

function onFourDigitItemInput(item, field) {
  item[field] = toFourDigits(item[field]);
}

function onYearBlur(item, field) {
  if (!item[field]) return;
  const startY = normalizeYearOrBlank(item.startYY, { minYear: 1900 });
  const minForThisField = field === 'endYY' && startY && startY !== null ? Number(startY) : 1900;
  const v = normalizeYearOrBlank(item[field], { minYear: minForThisField });
  if (v === null) {
    alert(field === 'endYY'
      ? 'End year must be between start year and the current year'
      : 'Start year must be between 1900 and the current year'
    );
    item[field] = '';
    return;
  }
  item[field] = v;
  // If we have both start and end, enforce ordering.
  const endY = normalizeYearOrBlank(item.endYY, { minYear: 1900 });
  const startM = normalizeMonthOrBlank(item.startMM);
  const endM = normalizeMonthOrBlank(item.endMM);
  if (startY && startY !== null && endY && endY !== null) {
    const startScore = ymScore(startY, startM || '');
    const endScore = ymScore(endY, endM || '');
    if (endScore < startScore) {
      alert('End date must be on or after start date');
      item.endYY = '';
      item.endMM = '';
    }
  }
}

function onMonthBlur(item, field, yearField) {
  if (!item[field]) return;
  const y = normalizeYearOrBlank(item[yearField]);
  if (!y || y === null) {
    alert('Enter a 4-digit year (YYYY) before entering a month');
    item[field] = '';
    return;
  }
  const mm = normalizeMonthOrBlank(item[field]);
  if (mm === null) {
    alert('Month must be between 1 and 12');
    item[field] = '';
    return;
  }
  item[field] = mm;
}

function validateAndNormalizeEducationEnd(item) {
  const startY = normalizeYearOrBlank(item.startYY, { minYear: 1900 });
  if (startY === null) throw new Error('Start year must be between 1900 and the current year');
  const startM = normalizeMonthOrBlank(item.startMM);
  if (startM === null) throw new Error('Start month must be between 1 and 12');
  if (item.startMM && !startY) throw new Error('Enter a 4-digit year (YYYY) before entering a month');

  const endMin = startY ? Number(startY) : 1900;
  const endY = normalizeYearOrBlank(item.endYY, { minYear: endMin });
  const endM = normalizeMonthOrBlank(item.endMM);
  if (endY === null) throw new Error('End year must be between start year and the current year');
  if (endM === null) throw new Error('End month must be between 1 and 12');
  if (item.endMM && !endY) throw new Error('Enter a 4-digit year (YYYY) before entering a month');

  item.endYY = endY || '';
  item.endMM = endM || '';

  if (startY && endY) {
    const startScore = ymScore(startY, startM || '');
    const endScore = ymScore(endY, endM || '');
    if (endScore < startScore) throw new Error('End date must be on or after start date');
  }
}

function onEndGroupFocusOut(e, item) {
  const next = e?.relatedTarget || null;
  const root = e?.currentTarget || null;
  if (root && next && root.contains(next)) return;
  try {
    validateAndNormalizeEducationEnd(item);
  } catch (err) {
    alert(err instanceof Error ? err.message : String(err));
    item.endYY = '';
    item.endMM = '';
  }
  requestAutosave();
}

function requestAutosave() {
  emit('autosave');
}
</script>

<style scoped>
.rde-tab-content { padding: 12px 16px; max-height: 60vh; overflow-y: auto; }
.rde-section { margin-bottom: 20px; }
.rde-section-title { font-size: 0.8rem; font-weight: 600; color: #fff; margin: 0 0 8px; }
.rde-hint { font-size: 0.7rem; color: rgba(255,255,255,0.4); margin: -4px 0 8px; }
.rde-edu-item { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.12); border-radius: 6px; padding: 10px; margin-bottom: 10px; }
.rde-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.rde-row { margin-bottom: 8px; }
.rde-label { display: block; font-size: 0.7rem; text-transform: none; letter-spacing: 0.05em; color: rgba(255,255,255,0.5); margin-bottom: 4px; }
.rde-date-inputs { display: flex; gap: 6px; }
.rde-date-input { flex: 1; min-width: 0; }
.rde-input { width: 100%; background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; padding: 6px 10px; color: #e0e0e0; font-size: 0.9rem; box-sizing: border-box; }
.rde-input:focus { outline: none; border-color: rgba(74,158,255,0.6); }
.rde-textarea { width: 100%; background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; padding: 6px 10px; color: #e0e0e0; font-size: 0.9rem; resize: vertical; box-sizing: border-box; font-family: Arial, sans-serif; }
.rde-btn-add { margin-top: 4px; padding: 6px 12px; background: transparent; border: 1px dashed rgba(255,255,255,0.3); color: rgba(255,255,255,0.6); border-radius: 4px; cursor: pointer; font-size: 0.8rem; }
.rde-btn-add:hover { border-color: rgba(74,158,255,0.6); color: #7ac; }
.rde-btn-remove { margin-top: 4px; padding: 5px 10px; background: transparent; border: 1px solid rgba(255,255,255,0.2); color: rgba(255,255,255,0.7); border-radius: 4px; cursor: pointer; font-size: 0.75rem; }
.rde-btn-remove:hover { border-color: rgba(255,255,255,0.4); color: #fff; }
</style>
