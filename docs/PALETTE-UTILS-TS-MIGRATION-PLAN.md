# Migration Plan: Replace color-palette Logic with color-palette-utils-ts

This document plans how to replace all color-palette–related color management in resume-flyer with the shared TypeScript package **color-palette-utils-ts** (folder `color-palette-utils-ts/`), using its README-ts.md as the API reference.

---

## 1. Current state

### 1.1 color-palette-utils-ts (new)

- **Location:** `color-palette-utils-ts/` (TypeScript, builds to `dist/`)
- **Purpose:** Types and utilities for Color Palette Maker–style exported palette JSON `{ name, colors }`.
- **Exports (from README-ts.md and `src/`):**
  - **Types:** `ExportedPalette`, `RGB`, `ContrastIconSet`, `GetHighlightColorOptions`, `GetContrastIconSetOptions`, etc.
  - **Palette:** `parsePaletteJson(json)`, `isExportedPalette(value)`, `normalizePaletteColors(colors)`
  - **Colors:** `formatHexDisplay(hex)`, `hexToRgb(hex)`, `rgbToHex(r,g,b)`, `getHighContrastMono(hex)`, `getHighlightColor(hex, options?)`, `getContrastIconSet(hex, options?)`
- **Contrast:** Uses luminance (0–1) for black/white choice; highlight uses LCH and `highlightPercent` (default 135) and `nearlyWhiteL` for nearly-white handling.

### 1.2 Current color stack in resume-flyer

| Layer | File(s) | Role |
|-------|---------|------|
| **Low-level color utils** | `modules/utils/colorUtils.mjs` | Hex validation, RGB/HSV conversion, `adjustBrightness`, `getPerceivedBrightness`, `getContrastingColor`, `isHexColor`, `isGrey` |
| **Palette composable** | `modules/composables/useColorPalette.mjs` | Load palettes from manifest/API, current palette state, `applyPaletteToElement`, document-level CSS vars (--background-light, --background-dark), brightness/border settings |
| **Re-exports / consumers** | `modules/utils/domUtils.mjs` | Imports `get_RGB_from_Hex`, `getContrastingColor`, `isHexColor` (as `isHexColorString`) from colorUtils |
| **Archive** | `archive/cssColors.mjs` | Uses `colorUtils.isHexColorString` (note: colorUtils exports `isHexColor`; may be a naming bug) |

### 1.3 Where colorUtils / useColorPalette are used

- **useColorPalette.mjs** (core):
  - **Loading:** Fetches manifest, loads JSON; validates `paletteData.name` and `paletteData.colors` (can use `parsePaletteJson` / `isExportedPalette`).
  - **Document theming:** Picks “darkest” color by `getPerceivedBrightness`, then uses `get_RGB_from_Hex` → `get_HSV_from_RGB` → darken (v, s) → `get_RGB_from_HSV` to set `--background-light` and `--background-dark`.
  - **applyPaletteToElement:** For base color at index: `getContrastingColor` (foreground), `adjustBrightness(base, factorSelected)` / `adjustBrightness(base, factorHovered)` for selected/hovered background, then `getContrastingColor` again for those states.
- **ResumeListController.mjs, ResumeItemsController.mjs, infiniteScrollingContainer.mjs, useCardsController.mjs:** Call `applyPaletteToElement` only; no direct colorUtils.
- **AppContent.vue, ColorPaletteSelector.vue, ResumeContainer.vue:** Use `useColorPalette()` (state + `loadPalettes`, `setCurrentPalette`, etc.); no direct colorUtils.
- **domUtils.mjs:** Imports colorUtils only; no in-file use of the color functions in the scanned lines; may re-export for other modules. Any caller using `domUtils.get_RGB_from_Hex` etc. must be switched to color-palette-utils-ts or a local adapter.

---

## 2. API mapping (current → color-palette-utils-ts)

| Current (colorUtils.mjs) | color-palette-utils-ts | Notes |
|--------------------------|------------------|--------|
| `get_RGB_from_Hex(hex)` | `hexToRgb(hex)` | Returns `RGB \| null`; current throws. Call sites must handle null or validate hex first. |
| `get_Hex_from_RGB(rgb)` | `rgbToHex(rgb.r, rgb.g, rgb.b)` | Signature differs (args vs object). |
| `get_HSV_from_RGB` / `get_RGB_from_HSV` | Not in color-palette-utils-ts | Only needed for document-level “darkest” darkening. See §3.2. |
| `getContrastingColor(hex)` | `getHighContrastMono(hex)` | Same idea; TS returns `'#000000' \| '#ffffff'`. |
| `adjustBrightness(hex, factor)` | `getHighlightColor(hex, { highlightPercent })` | Map factor 2.0 → highlightPercent 200, 1.5 → 150. Perceptual (LCH) vs HSV; verify visuals. |
| `getPerceivedBrightness(hex)` | Not exported | palette-utils uses internal `getLuminance` (0–1). For “darkest” we can use luminance or a one-off 0–255 formula from `hexToRgb`. |
| `isHexColor(hex)` | — | Implement via `formatHexDisplay(hex)` + regex, or keep a tiny local helper. |
| `validateHexColor` | — | Local wrapper that throws if invalid (e.g. after `formatHexDisplay` or `hexToRgb`). |
| `isGrey` | — | Not in color-palette-utils-ts; keep locally if still needed, or drop. |

---

## 3. Migration steps (high level)

### 3.1 Add color-palette-utils-ts as dependency and build

- In repo root `package.json`, add: `"color-palette-utils-ts": "file:./color-palette-utils-ts"`.
- Run `npm install`.
- Ensure built output exists: `cd color-palette-utils-ts && npm install && npm run build`.
- Resolve any alias in Vite/TS so that `import ... from 'color-palette-utils-ts'` resolves to the local package.

### 3.2 useColorPalette.mjs

- **Palette loading:** After fetching each palette JSON string, use `parsePaletteJson(raw)` (and optionally `isExportedPalette` for type guard). Optionally call `normalizePaletteColors(palette.colors)` after parse.
- **Document-level theming (darkest color, --background-light/--background-dark):**
  - “Darkest” color: either (a) add a small helper that uses `hexToRgb` + same luminance formula as palette-utils (e.g. 0.2126*R + 0.7152*G + 0.0722*B on linearized sRGB), or (b) request/contribute a `getLuminance` or `getPerceivedBrightness` export from color-palette-utils-ts. Compare by luminance and pick darkest.
  - Darkening: color-palette-utils-ts has no HSV. Options: (i) keep a minimal local HSV darken (only for this block) using `hexToRgb` → local RGB→HSV→RGB, or (ii) use `getHighlightColor(hex, { highlightPercent: 45 })` (or similar) for darker variants and set CSS vars from that. Prefer (ii) if it matches design.
- **applyPaletteToElement:**
  - Base: `foregroundColor = getHighContrastMono(backgroundColor)`.
  - Selected: `selectedBackgroundColor = getHighlightColor(backgroundColor, { highlightPercent: brightnessFactorSelected * 100 })`, then `selectedForegroundColor = getHighContrastMono(selectedBackgroundColor)`. Same for hovered with `brightnessFactorHovered`.
  - Keep all existing data attributes and CSS custom properties; only the computation of hex values switches to color-palette-utils-ts.
- **Replace all** `colorUtils.*` usages in this file with color-palette-utils-ts (+ any small local helpers). Remove dependency on `colorUtils.mjs` for color logic.

### 3.3 colorUtils.mjs

- **Option A (recommended):** Turn into a thin adapter that re-exports from color-palette-utils-ts where possible and implements only what’s missing (e.g. `isHexColor` via `formatHexDisplay` + regex, `validateHexColor`, and if needed `isGrey` and a local “darkest” luminance helper). This keeps existing import paths working for domUtils and any other stray imports.
- **Option B:** Remove colorUtils.mjs and update every importer to use color-palette-utils-ts (and local helpers) directly. More invasive; do only if we want to delete colorUtils entirely.

### 3.4 domUtils.mjs

- Change color-related imports to come from color-palette-utils-ts (or from the new colorUtils adapter):
  - `get_RGB_from_Hex` → `hexToRgb` (and handle null at call sites if any).
  - `getContrastingColor` → `getHighContrastMono`.
  - `isHexColor` → keep name `isHexColorString` but implement via color-palette-utils-ts or adapter (e.g. `formatHexDisplay(hex)` and regex).
- If nothing in the codebase actually uses these from domUtils, we can still switch the imports so domUtils is a single place that bridges to color-palette-utils-ts.

### 3.5 Optional: archive and other

- **archive/cssColors.mjs:** Uses `colorUtils.isHexColorString`. If we keep a colorUtils adapter, add `isHexColorString` as alias for `isHexColor`. If we remove colorUtils, update cssColors to use color-palette-utils-ts (e.g. `formatHexDisplay(HEX)` and length/regex check) or leave archive as-is if it’s not built.
- **modules/types/index.ts, components.ts:** No code changes; they define interfaces for ColorPaletteSelector and UseColorPaletteReturn. Optional: add a type import from color-palette-utils-ts for `ExportedPalette` where we pass palette data.

### 3.6 Icon set (optional)

- color-palette-utils-ts has `getContrastIconSet(hex, { iconBase })`. If resume-flyer uses contrast-dependent icon paths, consider switching to this and pass `iconBase` to match existing static paths (e.g. `static_content/icons/anchors`).

### 3.7 Tests and validation

- Run color-palette-utils-ts tests: `cd color-palette-utils-ts && npm test`.
- After migration: manually verify palette switch, card/resume colors, selected/hovered states, and document-level background vars.
- If selected/hovered look different (HSV vs LCH), tune `highlightPercent` / `nearlyWhiteL` or keep a single local “brightness” path for those only.

---

## 4. File-level checklist

| File | Action |
|------|--------|
| `package.json` | Add dependency `"color-palette-utils-ts": "file:./color-palette-utils-ts"`. |
| `color-palette-utils-ts` | Ensure `npm run build` works and `dist/` is present. |
| `modules/composables/useColorPalette.mjs` | Use parsePaletteJson, getHighContrastMono, getHighlightColor; implement “darkest” and document vars with palette-utils or minimal local helpers; remove colorUtils usage. |
| `modules/utils/colorUtils.mjs` | Replace with adapter that uses color-palette-utils-ts + local isHexColor/validateHexColor/isGrey (if needed); or delete and update all importers. |
| `modules/utils/domUtils.mjs` | Import from color-palette-utils-ts (or adapter); keep isHexColorString alias if used. |
| `archive/cssColors.mjs` | Fix isHexColorString vs isHexColor; use adapter or color-palette-utils-ts if we migrate archive. |
| ResumeListController, ResumeItemsController, infiniteScrollingContainer, useCardsController | No API change; they only call applyPaletteToElement. |
| Vue components (AppContent, ColorPaletteSelector, ResumeContainer) | No change to useColorPalette() surface; only internals of the composable change. |

---

## 5. Risk and rollback

- **Behavior change:** `getHighlightColor` (LCH) vs `adjustBrightness` (HSV) may change look of selected/hovered. Mitigation: compare side-by-side; tune options or keep one local brightness path.
- **Null handling:** `hexToRgb` returns null; current code assumes valid hex. Ensure every caller validates or handles null (e.g. after parsePaletteJson + normalizePaletteColors).
- **Rollback:** Keep colorUtils.mjs in git until migration is validated; revert useColorPalette and domUtils imports if needed.

---

## 6. Summary

- **Add** color-palette-utils-ts as a file dependency and use it for: palette parse/validate, contrast text, highlight (selected/hovered) colors, and hex normalize/convert.
- **Replace** colorUtils usage in useColorPalette and (optionally) elsewhere with color-palette-utils-ts plus a small adapter or local helpers for hex validation and “darkest” luminance/darkening.
- **Keep** useColorPalette’s public API and applyPaletteToElement behavior the same; only the underlying color math and palette validation switch to color-palette-utils-ts.
