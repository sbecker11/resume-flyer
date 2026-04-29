<template>
  <div class="rde-tab-content">
    <section class="rde-section">
      <div class="rde-top-label">Education</div>
      <p class="rde-hint">Degree, institution, optional dates, and details.</p>

      <div
        v-for="(item, i) in localItems"
        :key="item.educationObjectKey ?? i"
        class="rde-edu-item"
        :data-education-key="item.educationObjectKey ?? ''"
      >
        <div class="rde-row">
          <label class="rde-label">Degree</label>
          <input v-model="item.degree" type="text" class="rde-input" placeholder="BA in Economics" :disabled="!canEdit" @blur="requestAutosave" />
        </div>
        <div class="rde-row">
          <label class="rde-label">Institution</label>
          <input v-model="item.institution" type="text" class="rde-input" placeholder="Stanford University" :disabled="!canEdit" @blur="requestAutosave" />
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
                :disabled="!canEdit"
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
                :disabled="!canEdit"
                @input="onTwoDigitItemInput(item, 'startMM')"
                @blur="() => { onMonthBlur(item, 'startMM', 'startYY'); requestAutosave(); }"
              />
              <input
                v-model="item.startDD"
                type="text"
                class="rde-input rde-date-input"
                inputmode="numeric"
                maxlength="2"
                pattern="\\d{0,2}"
                placeholder="DD"
                :disabled="!canEdit"
                @input="onTwoDigitItemInput(item, 'startDD')"
                @blur="() => { onDayBlur(item, 'startDD', 'startYY', 'startMM'); requestAutosave(); }"
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
                :disabled="!canEdit"
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
                :disabled="!canEdit"
                @input="onTwoDigitItemInput(item, 'endMM')"
              />
              <input
                v-model="item.endDD"
                type="text"
                class="rde-input rde-date-input"
                inputmode="numeric"
                maxlength="2"
                pattern="\\d{0,2}"
                placeholder="DD"
                :disabled="!canEdit"
                @input="onTwoDigitItemInput(item, 'endDD')"
              />
            </div>
          </div>
        </div>
        <div class="rde-row">
          <label class="rde-label">Description</label>
          <textarea v-model="item.description" class="rde-textarea" rows="5" placeholder="Relevant coursework, honors, additional notes..." :disabled="!canEdit" @blur="requestAutosave" />
        </div>

        <button type="button" class="rde-btn-remove" :disabled="!canEdit" @click="removeItem(i)">Remove</button>
      </div>

      <button type="button" class="rde-btn-add" :disabled="!canEdit" @click="addItem">+ Add education item</button>
    </section>
  </div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue';

const canEdit = true;

const props = defineProps({
  data: { type: Object, default: () => ({}) },
  /** education.json object key — scroll this block into view when set (e.g. from scene / Jobs tab). */
  scrollToEntryKey: { type: String, default: '' },
});

const emit = defineEmits(['update:data', 'autosave']);

function normalizeItem(entry, fallbackIndex = 0) {
  const { yy: startYY, mm: startMM, dd: startDD } = splitEducationDate(entry?.start);
  const { yy: endYY, mm: endMM, dd: endDD } = splitEducationDate(entry?.end);
  return {
    index: typeof entry?.index === 'number' ? entry.index : fallbackIndex,
    degree: entry?.degree ?? '',
    institution: entry?.institution ?? '',
    startYY,
    startMM,
    startDD,
    endYY,
    endMM,
    endDD,
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

/** @param {string} dd @param {string} yyyy @param {string} mm */
function normalizeDayOrBlank(dd, yyyy, mm) {
  const d = toTwoDigits(dd);
  if (!d) return '';
  const n = Number(d);
  if (!Number.isFinite(n) || n < 1 || n > 31) return null;
  const y = Number(yyyy);
  const m = Number(mm);
  if (Number.isFinite(y) && Number.isFinite(m) && m >= 1 && m <= 12) {
    const last = new Date(y, m, 0).getDate();
    if (n > last) return null;
  }
  return String(n).padStart(2, '0');
}

/** @returns {number|null} local date ms, or null if incomplete */
function ymdToTime(yyyy, mm, dd) {
  if (!yyyy) return null;
  const y = Number(yyyy);
  if (!Number.isFinite(y)) return null;
  if (!mm) return null;
  const m = Number(mm);
  if (!Number.isFinite(m) || m < 1 || m > 12) return null;
  const d = dd ? Number(dd) : 1;
  if (!Number.isFinite(d) || d < 1 || d > 31) return null;
  const t = new Date(y, m - 1, d).getTime();
  return Number.isNaN(t) ? null : t;
}

function ymScore(yyyy, mm) {
  const y = Number(yyyy);
  const m = mm ? Number(mm) : 0;
  return y + (m / 12);
}

/**
 * Parse persisted formats into {yy, mm, dd}:
 * - "YYYY/MM/DD" or "YYYY-MM-DD"
 * - "YYYY/MM" or "YYYY-MM"
 * - "YYYY" or "YY"
 */
function splitEducationDate(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return { yy: '', mm: '', dd: '' };
  const parts = raw.split(/[-/]/).map(p => p.trim()).filter(Boolean);
  if (parts.length === 1) {
    const digits = parts[0].replace(/\D/g, '');
    if (digits.length >= 4) return { yy: digits.slice(0, 4), mm: '', dd: '' };
    return { yy: toFourDigits(digits), mm: '', dd: '' };
  }
  const yearDigits = parts[0].replace(/\D/g, '');
  const monthDigits = parts[1].replace(/\D/g, '');
  const yy = toFourDigits(yearDigits);
  const mm = toTwoDigits(monthDigits);
  if (parts.length >= 3) {
    const dayDigits = parts[2].replace(/\D/g, '');
    const dd = toTwoDigits(dayDigits);
    return { yy, mm, dd };
  }
  return { yy, mm, dd: '' };
}

function joinEducationDate(yy, mm, dd) {
  const rawY = String(yy ?? '').trim();
  const rawM = String(mm ?? '').trim();
  const rawD = String(dd ?? '').trim();
  if (!rawY && !rawM && !rawD) return '';

  const y = rawY ? normalizeYearOrBlank(yy) : '';
  if (rawY && y === null) return '';
  // Year-only: valid without month or day
  if (y && !rawM && !rawD) return y;

  const m = rawM ? normalizeMonthOrBlank(mm) : '';
  if (rawM && m === null) return '';
  const d = rawD ? normalizeDayOrBlank(dd, y || '', m || '') : '';
  if (rawD && d === null) return '';
  if (y && m && d) return `${y}/${m}/${d}`;
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
  return entries.map(([key, value], idx) => ({
    ...normalizeItem(value, Number.isNaN(Number(key)) ? idx : Number(key)),
    educationObjectKey: key,
  }));
}

function toIndexedObject(items) {
  const out = {};
  items.forEach((item, i) => {
    out[String(i)] = {
      index: i,
      degree: item.degree ?? '',
      institution: item.institution ?? '',
      start: joinEducationDate(item.startYY, item.startMM, item.startDD),
      end: joinEducationDate(item.endYY, item.endMM, item.endDD),
      description: item.description ?? ''
    };
  });
  return out;
}

const localItems = ref(normalizeToArray(props.data));
let isSyncingFromParent = false;

function scrollEducationKeyIntoView(key) {
  const k = String(key ?? '').trim();
  if (!k || typeof document === 'undefined') return;
  nextTick(() => {
    const esc = typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(k) : k.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const el = document.querySelector(`.rde-edu-item[data-education-key="${esc}"]`);
    el?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  });
}

watch(
  () => props.scrollToEntryKey,
  (key) => {
    if (key) scrollEducationKeyIntoView(key);
  }
);

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
    const sFull = item.startYY && startM && item.startDD;
    const eFull = item.endYY && endM && item.endDD;
    const sTime = ymdToTime(item.startYY, startM || '', item.startDD || '');
    const eTime = ymdToTime(item.endYY, endM || '', item.endDD || '');
    let orderBad = false;
    if (sFull && eFull && sTime != null && eTime != null) {
      orderBad = eTime < sTime;
    } else {
      const startScore = ymScore(startY, startM || '');
      const endScore = ymScore(endY, endM || '');
      orderBad = endScore < startScore;
    }
    if (orderBad) {
      alert('End date must be on or after start date');
      item.endYY = '';
      item.endMM = '';
      item.endDD = '';
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

function onDayBlur(item, field, yearField, monthField) {
  if (!item[field]) return;
  const y = normalizeYearOrBlank(item[yearField]);
  if (!y || y === null) {
    alert('Enter a 4-digit year (YYYY) before entering a day');
    item[field] = '';
    return;
  }
  const m = normalizeMonthOrBlank(item[monthField]);
  if (m === null) {
    alert('Month must be between 1 and 12');
    item[field] = '';
    return;
  }
  if (!m) {
    alert('Enter month (MM) before entering a day');
    item[field] = '';
    return;
  }
  const dd = normalizeDayOrBlank(item[field], y, m);
  if (dd === null) {
    alert('Day is invalid for this month');
    item[field] = '';
    return;
  }
  item[field] = dd;
}

function validateAndNormalizeEducationEnd(item) {
  const rawStartY = String(item.startYY ?? '').trim();
  const rawStartM = String(item.startMM ?? '').trim();
  const rawStartD = String(item.startDD ?? '').trim();
  const rawEndY = String(item.endYY ?? '').trim();
  const rawEndM = String(item.endMM ?? '').trim();
  const rawEndD = String(item.endDD ?? '').trim();

  const startY = rawStartY ? normalizeYearOrBlank(item.startYY, { minYear: 1900 }) : '';
  if (rawStartY && startY === null) throw new Error('Start year must be between 1900 and the current year');
  const startM = rawStartM ? normalizeMonthOrBlank(item.startMM) : '';
  if (rawStartM && startM === null) throw new Error('Start month must be between 1 and 12');
  if (rawStartM && !startY) throw new Error('Enter a 4-digit year (YYYY) before entering a month');

  const startDD = rawStartD ? normalizeDayOrBlank(item.startDD, startY || '', startM || '') : '';
  if (rawStartD && startDD === null) throw new Error('Start day is invalid for this month');
  if (rawStartD && (!startM || !startY)) throw new Error('Enter year and month before start day');
  item.startDD = startDD || '';

  const endMin = startY ? Number(startY) : 1900;
  const endY = rawEndY ? normalizeYearOrBlank(item.endYY, { minYear: endMin }) : '';
  if (rawEndY && endY === null) throw new Error('End year must be between start year and the current year');
  const endM = rawEndM ? normalizeMonthOrBlank(item.endMM) : '';
  if (rawEndM && endM === null) throw new Error('End month must be between 1 and 12');
  if (rawEndM && !endY) throw new Error('Enter a 4-digit year (YYYY) before entering a month');

  const endDD = rawEndD ? normalizeDayOrBlank(item.endDD, endY || '', endM || '') : '';
  if (rawEndD && endDD === null) throw new Error('End day is invalid for this month');
  if (rawEndD && (!endM || !endY)) throw new Error('Enter year and month before end day');

  item.startYY = startY || '';
  item.startMM = startM || '';
  item.endYY = endY || '';
  item.endMM = endM || '';
  item.endDD = endDD || '';

  const sFull = item.startYY && item.startMM && item.startDD;
  const eFull = item.endYY && item.endMM && item.endDD;
  const sTime = ymdToTime(item.startYY, item.startMM || '', item.startDD || '');
  const eTime = ymdToTime(item.endYY, item.endMM || '', item.endDD || '');

  if (startY && endY) {
    if (sFull && eFull && sTime != null && eTime != null) {
      if (eTime < sTime) throw new Error('End date must be on or after start date');
    } else {
      const startScore = ymScore(startY, startM || '');
      const endScore = ymScore(endY, endM || '');
      if (endScore < startScore) throw new Error('End date must be on or after start date');
    }
  }
}

function onEndGroupFocusOut(e, item) {
  const next = e?.relatedTarget || null;
  const root = e?.currentTarget || null;
  if (root && next && root.contains(next)) return;
  try {
    validateAndNormalizeEducationEnd(item);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    alert(msg);
    if (msg.includes('before start day') || msg.includes('Start day is invalid')) {
      item.startDD = '';
    } else {
      item.endYY = '';
      item.endMM = '';
      item.endDD = '';
    }
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
.rde-textarea { width: 100%; background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; padding: 6px 10px; color: #e0e0e0; font-size: 0.9rem; resize: vertical; box-sizing: border-box; font-family: Arial, sans-serif; }
.rde-btn-add { margin-top: 4px; padding: 6px 12px; background: transparent; border: 1px dashed rgba(255,255,255,0.3); color: rgba(255,255,255,0.6); border-radius: 4px; cursor: pointer; font-size: 0.8rem; }
.rde-btn-add:hover:not(:disabled) { border-color: rgba(74,158,255,0.6); color: #7ac; }
.rde-btn-add:disabled { opacity: 0.4; cursor: default; }
.rde-btn-remove { margin-top: 4px; padding: 5px 10px; background: transparent; border: 1px solid rgba(255,255,255,0.2); color: rgba(255,255,255,0.7); border-radius: 4px; cursor: pointer; font-size: 0.75rem; }
.rde-btn-remove:hover:not(:disabled) { border-color: rgba(255,255,255,0.4); color: #fff; }
.rde-btn-remove:disabled { opacity: 0.4; cursor: default; }
</style>
