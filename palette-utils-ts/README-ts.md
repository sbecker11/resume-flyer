# color-palette-utils-ts

TypeScript types and color utilities for projects that use **Color Palette Maker** exported palette JSON files. The app exports palettes as `{ name, colors }` (e.g. `My_Palette.json`). This package lets you load, validate, and style those palettes with full type safety.

## Exported palette JSON shape (externally created)

Color palettes are externally created (e.g. via Color Palette Maker “Export Palette”) and consumed by the app. The palette file has required fields and optional attributes:

**Required:**

- **`name`** (string): Palette display name.
- **`colors`** (string[]): Array of hex color strings (e.g. `["#ff0000", "#00ff00"]`).

**Optional attribute (part of the external palette format):**

- **`backgroundSwatchIndex`** (number): Index of the swatch to use as this palette’s default background (for document `--background-light` / `--background-dark`). Each palette may specify a different swatch. If omitted, the app may derive a background (e.g. darkest color). Must be a valid index into `colors`.

Example:

```json
{
  "name": "My Palette",
  "colors": ["#ff0000", "#00ff00", "#0000ff"],
  "backgroundSwatchIndex": 0
}
```

## Installation

From this repo (e.g. monorepo or file dependency):

```bash
# In your other project
npm install /path/to/color-palette-maker-react/palette-utils-ts
```

Or copy the `palette-utils-ts` folder into your project and add a `package.json` dependency:

```json
"dependencies": {
  "color-palette-utils-ts": "file:./palette-utils-ts"
}
```

Then run `npm install` in `palette-utils-ts` to install devDependencies and build:

```bash
cd palette-utils-ts && npm install && npm run build
```

## Updating a TypeScript project (e.g. resume-flock)

Use these steps to add Color Palette Maker–style palettes to an existing TypeScript app (e.g. [resume-flock](https://github.com/sbecker11/resume-flock)) that will consume exported palette JSON files.

1. **Add the dependency**  
   From your project root (e.g. `resume-flock`), add the package as a file dependency. If both repos are siblings:
   ```bash
   npm install ../color-palette-maker-react/palette-utils-ts
   ```
   Or in `package.json`:
   ```json
   "dependencies": {
     "color-palette-utils-ts": "file:../color-palette-maker-react/palette-utils-ts"
   }
   ```
   Then run `npm install`.

2. **Build the utils package (one-time)**  
   The package ships built output in `dist/`. If you cloned fresh or the package has no `dist/`:
   ```bash
   cd node_modules/color-palette-utils-ts && npm install && npm run build && cd ../..
   ```
   (Or build from the palette-utils-ts repo: `cd /path/to/color-palette-maker-react/palette-utils-ts && npm run build`.)

3. **Import types and helpers**  
   In your app, import the exported palette type and the helpers you need:
   ```ts
   import type { ExportedPalette } from 'color-palette-utils-ts';
   import {
     parsePaletteJson,
     getHighContrastMono,
     getHighlightColor,
     formatHexDisplay,
   } from 'color-palette-utils-ts';
   ```

4. **Load and validate palette JSON**  
   Load the file (e.g. from `public/` or an API) and validate before use:
   ```ts
   const res = await fetch('/palettes/theme.json');
   const raw = await res.text();
   const palette = parsePaletteJson(raw);
   if (!palette) throw new Error('Invalid palette JSON');
   // palette.name, palette.colors
   ```

5. **Use colors in your UI**  
   Use the helpers for contrast text, hover/highlight colors, and consistent hex display:
   ```ts
   for (const hex of palette.colors) {
     const textColor = getHighContrastMono(hex);
     const highlightHex = getHighlightColor(hex, { highlightPercent: 135 });
     const displayHex = formatHexDisplay(hex); // #rrggbb lowercase
     // Render swatch with backgroundColor: hex, color: textColor, etc.
   }
   ```

Place exported `.json` files (from Color Palette Maker's "Export Palette") in your app's static assets or serve them from your backend, then load them as above.

## Usage

### Types for the exported file

```ts
import type { ExportedPalette } from 'color-palette-utils-ts';

const data: ExportedPalette = await fetch('/palettes/theme.json').then((r) => r.json());
// data.name: string
// data.colors: string[]
```

### Load and validate JSON

```ts
import { parsePaletteJson, isExportedPalette } from 'color-palette-utils-ts';

const jsonString = await fs.promises.readFile('palette.json', 'utf-8');
const palette = parsePaletteJson(jsonString);
if (palette) {
  console.log(palette.name, palette.colors);
}

// Or validate an unknown object
if (isExportedPalette(someObject)) {
  // someObject is ExportedPalette
}
```

### Color utilities

Use the same helpers as the app for contrast text, highlight swatches, and icon sets:

```ts
import {
  formatHexDisplay,
  getHighContrastMono,
  getHighlightColor,
  getContrastIconSet,
  hexToRgb,
  rgbToHex,
  normalizePaletteColors,
} from 'color-palette-utils-ts';

// Normalize hex to #rrggbb
const hex = formatHexDisplay('#f00'); // '#ff0000'

// Text color on a swatch background
const textColor = getHighContrastMono('#c1543c'); // '#ffffff' or '#000000'

// Slightly brighter/darker variant (e.g. hover)
const highlightHex = getHighlightColor('#c1543c', { highlightPercent: 135 });
const highlightTextColor = getHighContrastMono(highlightHex);

// Icon paths and variant for CSS (e.g. filter: invert(1) when variant === 'white')
const icons = getContrastIconSet('#c1543c', { iconBase: '/icons/anchors' });
// { url, back, img, variant: 'black' | 'white' }

// Normalize all colors in a loaded palette
normalizePaletteColors(palette.colors);
```

### Full example (Node or bundler)

```ts
import {
  parsePaletteJson,
  getHighContrastMono,
  getHighlightColor,
  type ExportedPalette,
} from 'color-palette-utils-ts';

const raw = await fs.promises.readFile('my-palette.json', 'utf-8');
const palette = parsePaletteJson(raw);
if (!palette) throw new Error('Invalid palette JSON');

for (const hex of palette.colors) {
  const text = getHighContrastMono(hex);
  const highlight = getHighlightColor(hex);
  console.log(hex, { text, highlight });
}
```

## Selected border / theme colors (resume-flock)

In the app, **all colors for the selected bizCard border (clone and bizCardLineItem) come from palette-utils**, except the **white separator layer** (`#ffffff`), which is fixed. The purple layers (e.g. `#801a81` for the 2px inner border and 5px outer ring) should be sourced from the palette or from a theme constant defined via palette-utils so that selected-border styling stays consistent with the rest of the palette.

## API summary

| Export | Description |
|--------|-------------|
| **Types** | `ExportedPalette`, `RGB`, `ContrastIconSet`, `GetHighlightColorOptions`, `GetContrastIconSetOptions`, etc. |
| `parsePaletteJson(json)` | Parse JSON string → `ExportedPalette \| null` |
| `isExportedPalette(value)` | Type guard for unknown data |
| `normalizePaletteColors(colors)` | Normalize hex strings to #rrggbb in place |
| `formatHexDisplay(hex)` | Normalize hex to 7-char lowercase |
| `hexToRgb(hex)` | `#rrggbb` → `{ r, g, b }` or null |
| `rgbToHex(r,g,b)` | RGB 0–255 → `#rrggbb` |
| `getHighContrastMono(hex)` | `'#000000'` or `'#ffffff'` for contrast |
| `getHighlightColor(hex, options?)` | Perceptually adjusted highlight color |
| `getContrastIconSet(hex, options?)` | `{ url, back, img, variant }` for icon paths |

## Build

```bash
cd palette-utils-ts
npm install
npm run build
```

Output is in `dist/` (ESM `.js` + `.d.ts`). Consuming projects should use the built files; no need to compile this package from source in your app.

## Tests

Unit tests are included in the package (under `src/*.test.ts`). From the package directory:

```bash
npm install
npm test
```

Use `npm run test:watch` for watch mode.
