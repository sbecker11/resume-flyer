# Card visual parity (scene vs resume)

Scene cards and resume listing cards must look the same where they represent the same content. Drift is prevented by **shared markup**, **shared CSS**, and **automated style checks**.

## Rules

1. **Shared inner markup** — Use `modules/scene/cardMarkup.mjs` for HTML inside card shells. Do not hand-build parallel strings in `useCardsController.mjs` or `ResumeContainer.vue`.

2. **CSS ownership** — `styles/scene.css` owns all card shell typography, padding, borders, and inner stacks (`.skill-card-content`, `.biz-details-*`). `ResumeContainer.vue` styles are for the listing panel, footer, and resume-only chrome (× close buttons), not card `font-size` / `padding`.

3. **Shell classes only differ by view** — Scene: `.biz-card-div`, `.skill-card-div`. Resume: `.biz-resume-div`, `.skill-resume-div`. Inner content uses the **same** child classes (`.skill-card-label`, `.skill-card-years`, `.biz-details-employer`, …).

4. **No rDiv padding override for parity** — Job card padding comes from `borderSettings.normal.padding` (via `applyPaletteToElement`), not a separate rDiv padding default.

5. **Typography tokens** — Prefer CSS variables in `scene.css` (`--card-biz-font-size`, `--card-skill-font-size`, …) when adding new card text sizes.

## Modules

| Module | Role |
|--------|------|
| `modules/scene/cardMarkup.mjs` | HTML builders for skill + biz card content |
| `modules/scene/cardVisualEquivalency.mjs` | Test helpers: inject CSS, compare computed styles |
| `modules/scene/cardVisualEquivalency.test.mjs` | CI guard: scene/resume shells must match |
| `modules/scene/cardMarkup.test.mjs` | Markup structure / shared classes |

## Adding or changing card content

1. Update the builder in `cardMarkup.mjs`.
2. Wire scene + resume callers to that builder (both paths).
3. Add or extend selectors in `cardVisualEquivalency.test.mjs` if new elements need parity.
4. Run: `npm test -- modules/scene/cardMarkup.test.mjs modules/scene/cardVisualEquivalency.test.mjs`

## PR checklist

- [ ] Inner markup from `cardMarkup.mjs` (or documented exception)?
- [ ] No new card `font-size` / `padding` in `ResumeContainer.vue`?
- [ ] Scene + resume selectors updated together in `scene.css`?
- [ ] Equivalency tests pass?

## Known intentional differences

- **Resume-only UI**: rDiv/skill × remove buttons, listing scrollport padding, full job description sections on rDivs (scene shows compact card).
- **Scene parallax**: `.skill-card-div` / `.biz-card-div` may have `transform` in the scene view; resume listing cards do not. Parity tests compare CSS typography/padding, not transform scale.
