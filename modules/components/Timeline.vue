<template>
  <svg class="timeline-svg" :style="{ height: timelineHeight + 'px' }">
    <g v-for="item in years" :key="item.year" class="timeline-year">
      <!-- Debug circle at year position (removed) -->
      
      <!-- Year Label positioned above the year line -->
      <text
        :x="props.alignment === 'left' ? 70 : '166px'"
        :y="item.y - 17"
        class="year-label"
        :class="{ 'year-label-scene-left': props.alignment === 'right' }"
        :text-anchor="props.alignment === 'left' ? 'start' : 'end'"
      >
        {{ item.year }}
      </text>

      <!-- Continuous year line positioned at month 0 (January) -->
      <line
        :x1="props.alignment === 'left' ? '56px' : '50px'"
        :y1="props.alignment === 'left' ? item.y + 4 : item.y + 3"
        :x2="props.alignment === 'left' ? '180px' : '166px'"
        :y2="props.alignment === 'left' ? item.y + 3 : item.y + 2"
        class="year-tick-line"
      />
      
      <!-- Month Ticks -->
      <g v-for="month in 12" :key="`${item.year}-${month.toString().padStart(2, '0')}`">
        <text
          :x="props.alignment === 'left' ? 18 : '50px'"
          :y="item.y - ((month-1) * 16.67)"
          class="month-label"
          :text-anchor="props.alignment === 'left' ? 'start' : 'end'"
          style="list-style: none !important; list-style-type: none !important;"
        >
          <tspan>{{ item.year }}-{{ month.toString().padStart(2, '0') }}</tspan>
        </text>
        <line
          :x1="props.alignment === 'left' ? '18px' : '10px'"
          :y1="props.alignment === 'left' ? item.y - ((month-1) * 16.67) + 4 : item.y - ((month-1) * 16.67) + 3"
          :x2="props.alignment === 'left' ? '56px' : '50px'"
          :y2="props.alignment === 'left' ? item.y - ((month-1) * 16.67) + 4 : item.y - ((month-1) * 16.67) + 3"
          class="month-tick-line"
        />
      </g>
    </g>
  </svg>
</template>

<script setup>
import { computed } from 'vue';
import { useTimeline, initialize } from '@/modules/composables/useTimeline.mjs';
import { jobs } from '@/modules/data/enrichedJobs.mjs';

// Props
const props = defineProps({
  alignment: {
    type: String,
    default: 'left', // 'left' or 'right'
  }
});

// Use timeline composable
const { years, timelineHeight, isInitialized: timelineInitialized } = useTimeline();

// Initialize timeline with jobs data
if (!timelineInitialized.value) {
  console.log('[Timeline] Initializing timeline with jobs data...');
  initialize(jobs);
}

console.log('[Timeline] Component initialized with Vue composables - timelineHeight:', timelineHeight.value, 'Years array length:', years.value.length);
</script>

<style scoped>
.timeline-svg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none; /* Allows clicks to pass through */
  z-index: 5; /* Ensure it's visible */
  list-style: none !important; /* Remove any list styling */
  list-style-type: none !important;
  list-style-image: none !important;
}

.year-label {
  fill: rgba(255, 255, 255, 0.2); /* Very transparent */
  font-size: 48px;
  font-family: 'Arial', sans-serif;
  font-weight: bold;
  dominant-baseline: middle; /* Vertically center the text on the y-coordinate */
}

.year-label-scene-left {
  fill: rgba(255, 255, 255, 0.2); /* Transparent white for scene-left */
}

.year-tick-line {
  stroke: rgba(255, 255, 255, 0.4); /* Even less transparent */
  stroke-width: 1;
}

.month-label {
  fill: rgba(255, 255, 255, 0.2); /* Much more transparent */
  font-size: 8px;
  font-family: 'Arial', sans-serif;
  dominant-baseline: middle;
  list-style: none !important; /* Remove any list styling */
  list-style-type: none !important;
  list-style-image: none !important;
}

.month-tick-line {
  stroke: rgba(255, 255, 255, 0.4); /* More transparent than year tick lines */
  stroke-width: 1;
}

/* Override any list styles from timeline.css */
.timeline-svg * {
  list-style: none !important;
  list-style-type: none !important;
  list-style-image: none !important;
}

/* More specific override for text elements */
.timeline-svg text {
  list-style: none !important;
  list-style-type: none !important;
  list-style-image: none !important;
  list-style-position: outside !important;
}

/* Global override for any list styling */
* {
  list-style: none !important;
}

/* Remove any pseudo-elements that might be creating bullets */
.timeline-svg text::before,
.timeline-svg text::after {
  content: none !important;
  display: none !important;
}

.timeline-svg tspan::before,
.timeline-svg tspan::after {
  content: none !important;
  display: none !important;
}
</style> 