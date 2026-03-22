# Contrast Icons – How flock-of-postcards Uses Them

Resume-flock uses the same contrast icon concept as **flock-of-postcards**. This doc summarizes how flock-of-postcards uses url/back/img icons so we can mirror that pattern.

## In flock-of-postcards

### Icon types and assets

- **Types:** `url`, `back`, `img` (link, back-to-card, image).
- **Assets:** Two PNGs per type – black and white:
  - `static_content/icons/icons8-{url|back|img}-16-black.png`
  - `static_content/icons/icons8-{url|back|img}-16-white.png`

### Choosing black vs white (same rule as text)

- **Rule:** Icons are **white on dark background**, **black on light background** (match text contrast).
- **Implementation:** `getIconColor(backgroundColor)` in `modules/monoColor.mjs`:
  - Uses luminance (e.g. `RGB[0]+RGB[1]+RGB[2] > 382`) to return `'black'` or `'white'`.
  - Same idea as palette-utils `getHighContrastMono` / `getContrastIconSet(hex).variant`.

### Where icons are created

- **main.mjs:** `createUrlAnchorTag(url, savedColor)`, `createImgAnchorTag(img, savedColor)`, `createBackAnchorTag(bizcard_id, savedColor)`.
- Each gets `iconColor = monoColor.getIconColor(savedColor)` and builds:
  ```html
  <img class="icon url-icon mono-color-sensitive"
       src="static_content/icons/icons8-url-16-${iconColor}.png"
       data-url="..." data-saved-color="${iconColor}" data-icontype="url"/>
  ```
- `savedColor` is the card’s **text color** (contrast color for the card background). So icon color follows text: when text is white (dark bg), icon is white; when text is black (light bg), icon is black.

### When state changes (e.g. selected)

- **color_palette.mjs:** `updateMonoColorSensitiveChildren(parent, savedColor)`:
  - Finds all `.mono-color-sensitive` children (including icons).
  - Sets `data-saved-color` and calls `monoColor.applyMonoColorToElement(el)`.
- For icons, `applyMonoColorToElement` → `setIconToColor(iconElement, savedColor)`:
  - Recomputes `iconColor = getIconColor(savedColor)` and sets:
  - `iconElement.src = 'static_content/icons/icons8-' + iconType + '-16-' + iconColor + '.png'`.
- So when the card switches to selected (new background/text color), every icon’s `src` is updated to the correct black or white asset.

## In resume-flock (palette-utils + useColorPalette)

- We use **resume-flock** `getHighContrastForBackground(hex, { iconBase })` from `modules/utils/resumeFlockPaletteColors.mjs` (icons: black PNGs + CSS invert when variant is white):
  - Returns **one set of paths** (black PNGs only): `url`, `back`, `img`.
  - Returns **variant:** `'black'` | `'white'` (same rule as text: `getHighContrastMono` — white on dark, black on light). The icon set always matches the high-contrast text color for the given background.
- **Transparent background:** The icon set is always displayed with a transparent background; `.url-icon`, `.back-icon`, `.img-icon` have `background: transparent` in CSS so icons never show an opaque background.
- **Icon base:** Paths use `iconBase` `/static_content/icons` so assets are e.g. `/static_content/icons/icons8-url-16-black.png`.

### Icons may be present in card descriptions

Url/back/img icons can appear **inside card description content** (scene biz cards and resume line items). The card element (`.biz-card-div` or `.biz-resume-div`) has palette-applied data attributes and CSS variables for **normal**, **hovered**, and **selected** so icons stay correct in every state.

**Data attributes on the card (use these when building icon `<img>` in description HTML):**

| State   | URL / back / img paths      | Variant (black \| white)   |
|--------|-----------------------------|----------------------------|
| Normal | `data-icon-set-url`, `-back`, `-img` | `data-icon-set-variant`   |
| Hovered| `data-icon-set-hovered-url`, `-back`, `-img` | `data-icon-set-hovered-variant` |
| Selected | `data-icon-set-selected-url`, `-back`, `-img` | `data-icon-set-selected-variant` |

**CSS variables (same names with `--` prefix; URL values are `url(...)`):**  
`--data-icon-set-url`, `--data-icon-set-back`, `--data-icon-set-img`, `--data-icon-set-variant`, and the same for `-hovered-*` and `-selected-*`.

**Rendering icons in card descriptions:**

1. Add `<img>` (or elements with `background-image`) for url/back/img using the **card’s** current-state path (e.g. normal: `card.getAttribute('data-icon-set-url')`).
2. Give each icon one of the classes **`url-icon`**, **`back-icon`**, or **`img-icon`** so the stylesheet can apply **`filter: invert(1)`** when the card’s variant for that state is `'white'` (white on dark background).
3. When the card’s state changes (normal ↔ hovered ↔ selected), either re-set each icon’s `src` from the card’s corresponding `data-icon-set-*` / `data-icon-set-hovered-*` / `data-icon-set-selected-*` attributes, or rely on CSS: the card keeps the same data attributes and CSS vars, and the **variant** selectors (e.g. `[data-icon-set-variant="white"] .url-icon`) apply invert automatically for the active state.

So: same **rule** as flock-of-postcards (white on dark, black on light); we use **one asset + invert** instead of two assets.
