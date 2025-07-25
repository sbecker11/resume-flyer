<template>
  <svg class="timeline-svg" :style="{ height: (timelineHeight?.value || 0) + 'px' }">
    <g v-for="item in years" :key="item.year" class="timeline-year">
      <!-- Debug circle at year position (removed) -->
      
      <!-- Year Label -->
      <text
        :x="alignment === 'left' ? 70 : '92%'"
        :y="item.y - 28"
        class="year-label"
        :text-anchor="alignment === 'left' ? 'start' : 'end'"
      >
        {{ item.year }}
      </text>

      <!-- Continuous year line (from left edge to end of big year) -->
      <line
        :x1="alignment === 'left' ? '10px' : 'calc(81% - 42px)'"
        :y1="item.y - 16.67 + 4"
        :x2="alignment === 'left' ? '180px' : '98%'"
        :y2="item.y - 16.67 + 4"
        class="year-tick-line"
      />
      
      <!-- Month Ticks -->
      <g v-for="month in 12" :key="`${item.year}-${month}`">
        <text
          :x="alignment === 'left' ? 18 : '98%'"
          :y="item.y - (month * 16.67)"
          class="month-label"
          :text-anchor="alignment === 'left' ? 'start' : 'end'"
          style="list-style: none !important; list-style-type: none !important;"
        >
          <tspan>{{ item.year }}-{{ month.toString().padStart(2, '0') }}</tspan>
        </text>
        <line
          :x1="alignment === 'left' ? '10px' : '94%'"
          :y1="alignment === 'left' ? item.y - (month * 16.67) + 4 : item.y - (month * 16.67) + 3"
          :x2="alignment === 'left' ? '50px' : '99%'"
          :y2="alignment === 'left' ? item.y - (month * 16.67) + 4 : item.y - (month * 16.67) + 3"
          class="month-tick-line"
        />
      </g>
    </g>
  </svg>
</template>

<script>
import { BaseVueComponentMixin } from '@/modules/core/abstracts/BaseComponent.mjs';
import { watchEffect, ref, computed } from 'vue';

export default {
  name: 'Timeline',
  mixins: [BaseVueComponentMixin],
  
  props: {
    alignment: {
      type: String,
      default: 'left', // 'left' or 'right'
    },
  },
  
  data() {
    return {
      timelineManager: null,
      timelineState: null,
      timelineHeight: ref(0),
      startYear: ref(2020),
      endYear: ref(2025)
    };
  },
  
  computed: {
    // Calculate years for display
    years() {
      console.log('[Timeline] years() computed - IM guarantees dependencies are ready:', {
        hasTimelineState: !!this.timelineState,
        startYearValue: this.startYear?.value,
        endYearValue: this.endYear?.value,
        timelineHeightValue: this.timelineHeight?.value
      });
      
      // IM framework guarantees TimelineManager is ready - no initialization check needed
      if (!this.timelineState) {
        console.log('[Timeline] years() - no timeline state available');
        return [];
      }
      
      const yearsList = [];
      const YEAR_HEIGHT = 200;
      
      console.log('[Timeline] years() - generating years from', this.endYear.value, 'to', this.startYear.value, '(newest first)');
      
      // Iterate from newest to oldest year (top to bottom)
      for (let year = this.endYear.value; year >= this.startYear.value; year--) {
        const yearIndex = this.endYear.value - year; // 0 for newest year, increases for older years
        const y = (yearIndex + 1) * YEAR_HEIGHT; // Position from top
        yearsList.push({ year, y });
      }
      
      const firstYear = yearsList[0]?.year;
      const lastYear = yearsList[yearsList.length - 1]?.year;
      console.log('[Timeline] years() - generated', yearsList.length, 'years: first =', firstYear, ', last =', lastYear);
      
      // Debug: Expected vs actual years
      const expectedYears = this.endYear.value - this.startYear.value;
      console.log('[Timeline] Expected years based on range:', expectedYears, '( endYear', this.endYear.value, '- startYear', this.startYear.value, ')');
      console.log('[Timeline] Actual years generated:', yearsList.length);
      console.log('[Timeline] years() - first 3:', yearsList.slice(0, 3));
      console.log('[Timeline] years() - last 3:', yearsList.slice(-3));
      return yearsList;
    }
  },
  
  methods: {
    getComponentDependencies() {
      return ['TimelineManager'];
    },
    
    initialize(dependencies) {
      console.log('[Timeline] initializing with dependencies:', Object.keys(dependencies));
      
      // Dependencies are guaranteed to be available - no null checks needed!
      this.timelineManager = dependencies.TimelineManager;
      console.log('[Timeline] TimelineManager instance received from IM:', this.timelineManager);
      console.log('[Timeline] TimelineManager initialized status:', this.timelineManager.isInitialized);
      console.log('[Timeline] TimelineManager constructor name:', this.timelineManager.constructor.name);
      console.log('[Timeline] About to call getTimelineState()...');
      
      this.timelineState = this.timelineManager.getTimelineState();
      console.log('[Timeline] getTimelineState() call completed');
      console.log('[Timeline] Timeline state received:', {
        isInitialized: this.timelineState.isInitialized.value,
        timelineHeight: this.timelineState.timelineHeight.value,
        startYear: this.timelineState.startYear.value,
        endYear: this.timelineState.endYear.value
      });
      
      // Use TimelineManager data
      this.timelineHeight = this.timelineState.timelineHeight;
      this.startYear = this.timelineState.startYear;
      this.endYear = this.timelineState.endYear;
      
      console.log('[Timeline] Initialized with TimelineManager. Timeline height:', this.timelineHeight.value, 'Years:', this.startYear.value, '-', this.endYear.value);
      console.log('[Timeline] TimelineState isInitialized:', this.timelineState.isInitialized.value);
    },
    
    cleanupDependencies() {
      console.log('[Timeline] cleanup');
      this.timelineManager = null;
      this.timelineState = null;
    }
  },
  
  mounted() {
    // Debug the alignment prop - reactive to changes
    watchEffect(() => {
      console.log('[Timeline] mounted watchEffect - SVG height:', this.timelineHeight?.value, 'Years array length:', this.years?.length);
    });
  },
  
  beforeUnmount() {
    this.cleanupDependencies();
  }
};
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