/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Injected in vite.config.js from merged process.env + loadEnv (GitHub Actions / .env). */
  readonly S3_PALETTE_CATALOG_RESOLVED?: string;
  /** Public palette catalog NDJSON URL (color-palette-utils-ts / README-ts.md). Takes precedence over bucket/region/key. */
  readonly S3_COLOR_PALETTES_JSON_URL?: string;
  /** Color Palette Maker bucket; with AWS_REGION + S3_PALETTES_JSONL_KEY builds catalog URL. */
  readonly S3_IMAGES_BUCKET?: string;
  /** Injected from merged env in vite.config.js. */
  readonly AWS_REGION?: string;
  readonly S3_PALETTES_JSONL_KEY?: string;
  /** @deprecated Legacy; use S3_IMAGES_BUCKET */
  readonly S3_BUCKET?: string;
  /** @deprecated Legacy; prefer AWS_REGION */
  readonly S3_REGION?: string;
  /** @deprecated Legacy; use S3_PALETTES_JSONL_KEY */
  readonly S3_COLOR_PALETTES_OBJECT_KEY?: string;
  /** Base URL prefix for external skill definition links (skill-info-modal). */
  readonly VITE_SKILL_INFO_SOURCE_BASE_URL?: string;
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

declare global {
  interface Window {
    CONSOLE_LOG_IGNORE: (...args: any[]) => void;
    CONSOLE_INFO_IGNORE: (...args: any[]) => void;
  }
}

export {};