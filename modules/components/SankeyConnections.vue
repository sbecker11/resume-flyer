<template>
  <div id="sankey-connections-container" :style="containerStyle">
    <svg id="sankey-svg" :style="svgStyle">
      <!-- Render Links -->
      <g class="links" fill="none" stroke-opacity="0.5">
        <path
          v-for="link in links"
          :key="link.id"
          :d="link.path"
          :stroke="link.stroke"
          :stroke-width="link.strokeWidth"
        />
      </g>
      <!-- Render Nodes -->
      <g class="nodes" font-family="sans-serif" font-size="10">
        <g v-for="node in sankeyNodes" :key="node.id" :style="{ transform: `translate(${node.x0}px, ${node.y0}px)` }">
          <rect
            :height="node.y1 - node.y0"
            :width="node.x1 - node.x0"
            :fill="node.color"
            stroke="#000"
            stroke-width="0.5"
          >
            <title>{{ node.label }}\nValue: {{ node.value.toFixed(2) }}</title>
          </rect>
          <text
            :x="node.x0 < svgWidth / 2 ? 6 : -6"
            :y="(node.y1 - node.y0) / 2"
            dy="0.35em"
            :text-anchor="node.x0 < svgWidth / 2 ? 'start' : 'end'"
            fill="#fff"
            stroke="none"
          >
            {{ node.label }}
          </text>
        </g>
      </g>
    </svg>
  </div>
</template>

<script>
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { sankey, sankeyLinkHorizontal } from 'd3-sankey';
import { jobs as jobsData } from '@/static_content/jobs/jobs.mjs';
import { useColorPalette } from '@/modules/composables/useColorPalette.mjs';
import { BaseVueComponentMixin } from '@/modules/core/abstracts/BaseComponent.mjs';

export default {
  name: 'SankeyConnections',
  mixins: [BaseVueComponentMixin],
  
  methods: {
    getComponentDependencies() {
      return []; // SankeyConnections doesn't need dependencies currently
    },
    
    initialize(dependencies) {
      // SankeyConnections initialization handled in setup()
      console.log('[SankeyConnections] IM initialized');
    },

    /**
     * DOM setup phase - called after Vue DOM is ready
     * DOM operations moved from initialize() for proper separation
     */
    async setupDom() {
      // DOM operations are handled in the composition API setup()
      // This method exists for IM compliance
      console.log('[SankeyConnections.vue] DOM setup complete');
    },

    /**
     * Template ref injection for scene-content element
     * Replaces getElementById('scene-content') calls
     * @param {HTMLElement} element - The DOM element from template ref
     */
    setSceneContentElement(element) {
      this.scenecontentElement = element;
      console.log('[SankeyConnections.vue] scene-content element set via template ref');
    },
    
    cleanupDependencies() {
      // Cleanup handled in setup() onUnmounted
    }
  },
  
  setup() {
    const sankeyNodes = ref([]);
    const links = ref([]);
    const svgWidth = ref(0);
    const { currentPalette } = useColorPalette();

    const containerStyle = computed(() => ({
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      zIndex: 98, // Just below selected cards
    }));

    const svgStyle = computed(() => ({
      width: '100%',
      height: '100%',
      overflow: 'visible',
    }));

    const buildSankeyGraph = () => {
      window.CONSOLE_LOG_IGNORE('[Sankey] Building global Sankey graph from jobs data.');

      const nodes = [];
      const graphLinks = [];
      const skillNodes = new Map();
      const jobNodes = new Map();
      let skillColorIndex = 0;

      // 1. Process jobs data to create nodes and links
      jobsData.forEach(job => {
        const jobId = `job-${job.jobNumber}`;
        if (!jobNodes.has(jobId)) {
          jobNodes.set(jobId, { 
            nodeId: jobId, 
            name: job.employer, 
            type: 'job',
            colorIndex: job.jobNumber % 7 // Use job number for a consistent color index
          });
        }

        // Calculate duration for link value. Default to 1 month if duration is 0.
        const startDate = new Date(job.start);
        let endDate = new Date(); // Assume 'working' means up to today
        if (job.end && !['working', 'current_date'].includes(job.end.toLowerCase())) {
          endDate = new Date(job.end);
        }
        const durationInMonths = Math.max(1, (endDate.getFullYear() - startDate.getFullYear()) * 12 + (endDate.getMonth() - startDate.getMonth()));

        const jobSkills = job['job-skills'] || {};
        Object.values(jobSkills).forEach(skillName => {
          if (!skillNodes.has(skillName)) {
            skillNodes.set(skillName, { 
              nodeId: skillName, 
              name: skillName, 
              type: 'skill',
              colorIndex: skillColorIndex++ // Assign a unique color index to each skill
            });
          }

          // Create a link from skill to job
          graphLinks.push({
            source: skillName, // source is skill nodeId
            target: jobId,      // target is job nodeId
            value: durationInMonths, // Use the calculated duration in months
          });
        });
      });

      // Combine nodes into a single array
      nodes.push(...Array.from(skillNodes.values()));
      nodes.push(...Array.from(jobNodes.values()));

      const graph = { nodes, links: graphLinks };

      const sceneContent = this.scenecontentElement;
      const sceneRect = sceneContent.getBoundingClientRect();
      const width = sceneRect.width;
      const height = sceneRect.height;
      svgWidth.value = width;

      // --- D3 Sankey Calculation ---
      const sankeyLayout = sankey()
        .nodeId(d => d.nodeId)
        .nodeWidth(15)
        .nodePadding(10)
        .extent([[1, 5], [width - 1, height - 5]]); // Use extent for sizing

      const { nodes: d3Nodes, links: d3Links } = sankeyLayout(graph);

      // --- Update Vue's Reactive State ---
      const palette = currentPalette.value;

      sankeyNodes.value = d3Nodes.map(node => {
        const color = (palette && palette.length > 0)
            ? palette[node.colorIndex % palette.length]
            : (node.type === 'skill' ? '#1f77b4' : '#ff7f0e'); // D3 fallback color

        return {
          ...node,
          id: node.nodeId,
          label: node.name,
          color: color,
        };
      });

      links.value = d3Links.map((link, i) => ({
        id: `sankey-link-${i}`,
        path: sankeyLinkHorizontal()(link),
        // Color the link based on the source (skill) node's color
        stroke: link.source.color,
        strokeWidth: Math.max(1, link.width),
      }));

      window.CONSOLE_LOG_IGNORE(`[Sankey] Generated ${sankeyNodes.value.length} nodes and ${links.value.length} links.`);
    };

    onMounted(() => {
      // The graph is static, so we build it once.
      // We might need a small delay to ensure the container has its dimensions.
      setTimeout(buildSankeyGraph, 100);

      // We might want to rebuild on resize.
      const handleResize = () => {
        // A simple debounce
        clearTimeout(window.sankeyResizeTimer);
        window.sankeyResizeTimer = setTimeout(buildSankeyGraph, 300);
      };
      window.addEventListener('resize', handleResize);
      onUnmounted(() => {
        window.removeEventListener('resize', handleResize);
      });
    });

    return {
      sankeyNodes,
      links,
      containerStyle,
      svgStyle,
      svgWidth,
    };
  },
};
</script>