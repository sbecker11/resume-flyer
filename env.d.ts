/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Injected in vite.config.js from merged .env (full resolved catalog URL or ''). */
  readonly S3_PALETTE_CATALOG_RESOLVED?: string;
  /** Public palette catalog NDJSON URL (color-palette-utils-ts / README-ts.md). Takes precedence over bucket/region/key. */
  readonly S3_COLOR_PALETTES_JSON_URL?: string;
  /** With S3_REGION + S3_COLOR_PALETTES_OBJECT_KEY, builds `https://{bucket}.s3.{region}.amazonaws.com/{key}` (same shape as CPM-ts test URL). */
  readonly S3_BUCKET?: string;
  readonly S3_REGION?: string;
  readonly S3_COLOR_PALETTES_OBJECT_KEY?: string;
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