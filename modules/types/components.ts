// Vue component prop and emit type definitions
// Provides type safety for component interfaces

import type { JobData, SortRule } from './index'

// ResizeHandle component types
export interface ResizeHandleProps {
  // No props currently needed
}

export interface ResizeHandleEmits {
  // Events emitted by ResizeHandle
  'mode-changed': [mode: string];
  'step-count-changed': [count: number];
}

// Timeline component types
export interface TimelineProps {
  alignment: 'left' | 'right';
  jobs: JobData[];
}

export interface TimelineEmits {
  'timeline-ready': [];
}

// ResumeContainer component types
export interface ResumeContainerProps {
  // No props currently needed
}

export interface ResumeContainerEmits {
  'sort-changed': [sortRule: SortRule];
  'palette-changed': [filename: string];
}

// SceneContainer component types
export interface SceneContainerProps {
  // No props currently needed
}

export interface SceneContainerEmits {
  'scene-ready': [];
  'viewport-changed': [];
}

// ColorPaletteSelector component types
export interface ColorPaletteSelectorProps {
  modelValue?: string;
  palettes: Record<string, string>;
  loading?: boolean;
}

export interface ColorPaletteSelectorEmits {
  'update:modelValue': [value: string];
  'change': [filename: string, paletteName: string];
}


// SceneViewLabel component types
export interface SceneViewLabelProps {
  orientation: 'scene-left' | 'scene-right';
}

export interface SceneViewLabelEmits {
  // No events currently emitted
}

// Generic component event types for better type safety
export interface ComponentBaseEvents {
  mounted: [];
  unmounted: [];
  error: [error: Error];
}

// Global component registration types for better IDE support
// TODO: Add proper component type registration after all components are converted to TypeScript