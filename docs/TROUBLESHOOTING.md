# Troubleshooting

## White borders/highlights appear missing (Chromium "force dark mode")

**Symptom:** White borders — e.g. the ring around the resize-handle circle buttons
(`.toggle-circle-ring` in `styles/controls.css`), or a white border/box-shadow on a
selected card — appear to be missing or invisible in some browsers, even though the
deployed CSS correctly specifies a white color and `getComputedStyle()` on the element
reports the correct value.

**Root cause:** Chromium-based browsers ship a "force dark mode for web contents"
feature that repaints/inverts page colors *after* CSS is rendered, as a heuristic
auto-dark-mode for pages that don't declare their own color scheme. This repaint
happens in a rendering-pipeline layer below computed styles, so:

- `getComputedStyle()` still reports the correct author-specified color (e.g. `#ffffff`).
- The actual painted pixels can be inverted/altered/hidden, because the browser is
  repainting on top of the correct CSS.

This is a **browser rendering-pipeline behavior**, not a CSS or JS bug in this codebase.
It's present in:

- **Brave:** `brave://flags` → search "force dark"
- **Chrome:** `chrome://flags` → search "force dark" (or "Auto Dark Mode for Web Contents")
- **Edge:** `edge://flags` → search "force dark"

**Fix for affected users:** Disable the flag for the affected browser:

1. Open `brave://flags` (or `chrome://flags` / `edge://flags`).
2. Search for "force dark".
3. Set the entry to **Default** or **Disabled**.
4. Relaunch the browser.

**Mitigation added in code (2026-08):** This app is dark-themed throughout (see
`styles/scene.css`, `styles/styles.css`) and has no light-mode support. To hint to
Chromium that the page already manages its own dark color scheme — so the auto-dark-mode
heuristic skips repainting it — two independent signals were added:

- `<meta name="color-scheme" content="dark">` in `index.html`.
- `color-scheme: dark;` on `:root` in `styles/styles.css`.

Both are recognized independently by different parts of the browser's dark-mode-detection
pipeline, so both are included as belt-and-suspenders. This should prevent most
Chromium-based browsers from auto-dark-mode-repainting this app going forward, but a user
who still sees missing white borders/highlights should check the flag above as a fallback.
