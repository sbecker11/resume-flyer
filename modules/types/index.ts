// Core type definitions for resume-flock application
// Provides type safety for Vue 3 components and composables

export interface JobData {
  employer: string;
  role: string;
  start: string; // Date string
  end: string | 'CURRENT_DATE'; // Date string or current marker
  startDate?: string; // Alternative field name
  Description?: string;
  'job-skills'?: Record<string, string>; // skill ID -> skill name mapping
  references?: string[];
}

export interface JobPosition {
  x: number;
  y: number;
  z?: number;
}

export interface ColorPalette {
  name: string;
  colors: string[]; // Hex color strings
}

export interface FocalPointState {
  x: number;
  y: number;
  mode: 'locked' | 'following' | 'dragging';
}

export interface SortRule {
  field: 'startDate' | 'employer' | 'role';
  direction: 'asc' | 'desc';
}

export interface AppState {
  version: string;
  lastUpdated: string;
  
  // User preferences grouped together
  "user-settings": {
    layout: {
      orientation: 'scene-left' | 'scene-right';
      scenePercentage: number;
      resumePercentage: number;
    };
    
    resizeHandle: {
      stepCount: number;
    };
    
    focalPointMode: 'locked' | 'following' | 'dragging';
    /** Persisted focal point position and mode (restored on load) */
    focalPoint?: { x: number; y: number; mode: 'locked' | 'following' | 'dragging' };

    currentResumeId: string;

    resume: {
      sortRule: SortRule;
    };

    theme: {
      colorPalette: string; // filename only
    };
  };

  // System constants grouped together (not user-editable in the app)
  "system-constants": {
    zIndex: {
      root: number;
      scene: number;
      sceneGradients: number;
      timeline: number;
      backgroundMax: number;
      cardsMin: number;
      cardsMax: number;
      bullsEye: number;
      selectedCard: number;
      focalPoint: number;
      aimPoint: number;
    };
    cards: {
      meanWidth: number;
      minHeight: number;
      maxXOffset: number;
      maxWidthOffset: number;
      minZDiff: number;
      skillMinDistance: number;
      concurrentJobsOffsetX: number;
      concurrentJobsOffsetY: number;
    };
    timeline: {
      pixelsPerYear: number;
      paddingTop: number;
      gradientLength: string;
    };
    resizeHandle: {
      width: number;
      shadowWidth: number;
      shadowBlur: number;
      defaultWidthPercent: number;
    };
    animation: {
      durations: {
        fast: string;
        medium: string;
        slow: string;
        spinner: string;
      };
      autoScroll: {
        repeatMillis: number;
        maxVelocity: number;
        minVelocity: number;
        changeThreshold: number;
        scrollZonePercentage: number;
      };
    };
    performance: {
      thresholds: {
        resizeTime: number;
        scrollTime: number;
        memoryUsage: number;
      };
      debounceTimeout: number;
    };
    typography: {
      fontSizes: {
        small: string;
        medium: string;
        large: string;
        xlarge: string;
        xxlarge: string;
        timeline: string;
      };
      fontFamily: string;
    };
    visualEffects: {
      parallax: {
        xExaggeration: number;
        yExaggeration: number;
      };
    };
    theme: {
      brightnessBoostSelected: number;
      brightnessBoostHovered: number;
      borderSettings: {
        normal: BorderStyle;
        hovered: BorderStyle;
        selected: BorderStyle;
      };
      rDivBorderOverrideSettings: {
        normal: BorderOverrideStyle;
        hovered: BorderOverrideStyle;
        selected: BorderOverrideStyle;
      };
    };
    /** Parallax/depth rendering constants (camelCase; editable via 3D Settings modal) */
    rendering: {
      parallaxScaleAtMinZ: number;   // at min scene Z (near); scene Z = distance-from-viewer, not z-index; 0–1.5 (default 1.0)
      parallaxScaleAtMaxZ: number;   // at max scene Z (far), 0–1.5 (default 1.0)
      saturationAtMaxZ: number;      // 0–100%; 100 = no change (default 100)
      brightnessAtMaxZ: number;      // 75–100%; 100 = no z-based darkness (default 100)
      blurAtMaxZ: number;            // 0–5 px at max Z; 0 = no z-based blur (default 0)
    };
    /** Min/max/step for 3D Settings sliders; edit in app_state.json for single source of truth */
    renderingLimits?: {
      blurAtMaxZ: { min: number; max: number; step: number };
      saturationAtMaxZ: { min: number; max: number; step: number };
      brightnessAtMaxZ: { min: number; max: number; step: number };
      parallaxScaleAtMinZ: { min: number; max: number; step: number };
      parallaxScaleAtMaxZ: { min: number; max: number; step: number };
    };
  };
}


export interface BorderStyle {
  padding: string;
  innerBorderWidth: string;
  innerBorderColor: string;
  outerBorderWidth: string;
  outerBorderColor: string;
  borderRadius: string;
}

export interface BorderOverrideStyle {
  padding: string;
  innerBorderWidth: string;
  marginTop: string;
}


// Event types for better type safety in event handling
export interface JobSelectedEvent {
  jobNumber: number;
  dataJobObject: JobData | null;
  previousSelection: number | null;
  source: string;
}

export interface JobHoveredEvent {
  jobNumber: number;
}

export interface BullsEyeMovedEvent {
  position: { x: number; y: number };
}

export interface ColorPaletteChangedEvent {
  filename: string;
  paletteName: string;
  previousFilename: string;
}

// Composable return types for better intellisense
export interface UseJobSelectionReturn {
  selectedJobNumber: Ref<number | null>;
  selectJob: (jobNumber: number, source?: string) => void;
  clearSelection: (source?: string) => void;
  getSelectedJob: () => JobData | null;
}

export interface UseFocalPointReturn {
  position: ComputedRef<{ x: number; y: number }>;
  mode: ComputedRef<string>;
  isLocked: ComputedRef<boolean>;
  isFollowing: ComputedRef<boolean>;
  isDragging: ComputedRef<boolean>;
  setPosition: (x: number, y: number, source?: string) => void;
  setTarget: (x: number, y: number, source?: string) => void;
  cycleMode: () => void;
}

export interface UseColorPaletteReturn {
  colorPalettes: Ref<Record<string, string[]>>;
  orderedPaletteNames: Ref<string[]>;
  filenameToNameMap: Ref<Record<string, string>>;
  isLoading: Ref<boolean>;
  currentPaletteFilename: Ref<string | null>;
  currentPaletteName: ComputedRef<string | null>;
  currentPalette: ComputedRef<string[]>;
  setCurrentPalette: (filename: string) => Promise<void>;
  loadPalettes: () => Promise<void>;
}

export interface UseAppStateReturn {
  appState: DeepReadonly<Ref<AppState | null>>;
  isLoading: DeepReadonly<Ref<boolean>>;
  isLoaded: DeepReadonly<Ref<boolean>>;
  loadError: DeepReadonly<Ref<Error | null>>;
  loadAppState: () => Promise<AppState>;
  saveAppState: () => Promise<AppState>;
  updateAppState: (updates: Partial<AppState>) => Promise<AppState>;
}

// Import Vue types for composable returns
import type { Ref, ComputedRef, DeepReadonly } from 'vue';