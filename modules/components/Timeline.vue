<template>
  <svg class="timeline-svg" :style="{ height: timelineHeight + 'px' }">
    <g v-for="item in years" :key="item.year" class="timeline-year">
      <!-- Debug circle at year position (removed) -->
      
      <!-- Year Label -->
      <text
        :x="alignment === 'left' ? 70 : '85%'"
        :y="item.y - 28"
        class="year-label"
        :text-anchor="alignment === 'left' ? 'start' : 'end'"
      >
        {{ item.year }}
      </text>

      <!-- Continuous year line (from left edge to end of big year) -->
      <line
        :x1="alignment === 'left' ? '10px' : '20%'"
        :y1="item.y - 16.67 + 4"
        :x2="alignment === 'left' ? '180px' : '95%'"
        :y2="item.y - 16.67 + 4"
        class="year-tick-line"
      />
      
      <!-- Month Ticks -->
      <g v-for="month in 12" :key="`${item.year}-${month}`">
        <text
          :x="alignment === 'left' ? 18 : '75%'"
          :y="item.y - (month * 16.67)"
          class="month-label"
          :text-anchor="alignment === 'left' ? 'start' : 'end'"
          style="list-style: none !important; list-style-type: none !important;"
        >
          <tspan>{{ item.year }}-{{ month.toString().padStart(2, '0') }}</tspan>
        </text>
        <line
          :x1="alignment === 'left' ? '10px' : '85%'"
          :y1="item.y - (month * 16.67)"
          :x2="alignment === 'left' ? '15px' : '90%'"
          :y2="item.y - (month * 16.67)"
          class="month-tick-line"
        />
      </g>
    </g>
  </svg>
</template>

<script setup>
import { useTimeline } from '@/modules/composables/useTimeline.mjs';
import { watchEffect } from 'vue';

const props = defineProps({
  alignment: {
    type: String,
    default: 'left', // 'left' or 'right'
  },
});

const { timelineHeight, years } = useTimeline();

// Debug the alignment prop - reactive to changes
watchEffect(() => {
  console.log('Timeline alignment prop changed to:', props.alignment);
  console.log('Timeline should position years at:', props.alignment === 'left' ? '70px' : 'calc(100% - 150px)');
});
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

.year-tick-line {
  stroke: rgba(255, 255, 255, 0.2); /* Matching transparency */
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