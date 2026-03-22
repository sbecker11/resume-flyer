# color-palette-utils-ts

TypeScript types and utilities for the **public palette catalog** (NDJSON from S3).

## Color palette nomenclature

- The **jsonl file** (read from S3) contains the complete catalog of **color palettes**.
- Each **color palette** is stored as a line in the jsonl file; it describes a collection of **color swatches**.
- Each indexed **color swatch** has a unique hex color.
- `imagePublicUrl` references the S3 image from which color swatches were sampled.
- `backgroundSwatchIndex` references the color swatch used for the background color of the sceneView.

## 1. Installing CPM-ts into your app

Copy the `color-palette-utils-ts` folder into your project root folder.

Install, test, and build CPM-ts in isolation:

```bash
cd color-palette-utils-ts
npm install
npm audit fix --force
npm run test:coverage
npm run test:integration
npm run build
```

- `npm audit fix --force` is optional; it can bump **major** versions (e.g. Vitest). Omit it if you prefer to stay on declared semver ranges.
- Output is in `dist/` (ESM `.js` + `.d.ts`). Your app uses the built files.

### Integration test (S3 fetch)

CPM-ts runs entirely in isolation. The integration test fetches the live palette catalog from S3:

- Reads `S3_COLOR_PALETTES_JSON_URL` from `.env.example` in this package (does not use or overwrite `.env`)
- **FAIL FAST**: throws if the URL is missing, empty, or wrong
- Asserts `fetchColorPalettesFromS3()` returns `ColorPaletteRecord[]` and logs each record's fields

#### Integration test: `403 Forbidden`

S3 public read is required. This project's setup includes AWS S3 — run `scripts/create-s3-palette-bucket.sh` and see [S3 storage](../docs/S3-STORAGE.md) in the parent repo.

## 2. Integrating the CPM-ts into your app

Add the CPM-ts to your project's package.json file
   ```json
   "dependencies": {
     "color-palette-utils-ts": "file:./color-palette-utils-ts"
   }
   ```
Install and test your app with the CPM-ts installation

From your project's root directory
```bash
npm install
npm test
```

Use `npm run test:watch` for watch mode.

## 3. Integrating CPM-ts into your app

### Listing all palettes in S3

The catalog is NDJSON at a public S3 URL. Each line is one color palette. See **Color palette structure** below for the format.

### Loading palettes from S3

1. Add to `.env` or `.env.local`:
   ```bash
   S3_COLOR_PALETTES_JSON_URL=https://sbecker11-color-palette-images.s3.us-west-1.amazonaws.com/metadata/color_palettes.jsonl
   ```

2. In your app:
   ```ts
   import { fetchColorPalettesFromS3 } from 'color-palette-utils-ts';

   const palettes = await fetchColorPalettesFromS3();
   ```

### Caching all palettes

Fetch once at app init or when the catalog URL changes, then store in state (e.g. React `useState`/`useEffect` or a global store). Avoid refetching on every render.

### Selecting a palette

Filter or find from `palettes` by `paletteName` or other fields:

```ts
const selected = palettes.find((p) => p.paletteName === 'jungle') ?? palettes[0];
```

### Color palette structure with swatches

| Field | Type | Description |
|-------|------|-------------|
| `paletteName` | string | Display name / identifier |
| `colorPalette` | string[] | Array of color swatches (hex), e.g. `["#81a936", "#56831c"]` |
| `imagePublicUrl` | string | S3 image from which swatches were sampled |
| `backgroundSwatchIndex` | number? | Index of the swatch used for sceneView background |

Other optional fields (`createdDateTime`, `regions`, etc.) 

```ts
const idx = palette.backgroundSwatchIndex ?? 0;
const bgHex = palette.colorPalette[idx];
// Use bgHex directly in CSS: backgroundColor: bgHex
```

## API summary

| Export | Description |
|--------|-------------|
| `ColorPaletteRecord` | Type: one color palette (see structure table above) |
| `fetchColorPalettesFromS3()` | Fetches catalog from S3 (URL from `S3_COLOR_PALETTES_JSON_URL` in .env); returns `ColorPaletteRecord[]` |
