# Fast-Failure & Error Reporting Strategy

The codebase uses **fast failure** and **consistent error reporting**: every error must be reported; if a remedy is applied, that must be reported too.

## Error reporting (required)

- **Every error must be reported**: In catch blocks or any error path, always log the error with context (e.g. module name and operation). Use `reportError(error, context, remedy)` from `modules/utils/errorReporting.mjs` when possible.
- **Remedy must be reported**: If you apply a remedy (retry, revert, fallback, recovery), log it explicitly (e.g. `Remedy: Reverting to previous value`). Use the third argument of `reportError` or a clear `console.log('Remedy: ...')`.
- Then either rethrow (fast-fail) or continue only if the remedy fully recovers.

## Principles (fast failure)

- **Validate at boundaries**: Startup, palette load, state load, and any load of external/config data must validate and throw on invalid values.
- **No silent fallbacks**: Do not return default state, skip invalid rows, or apply fallback styling when required data is invalid. Throw so the failure is visible.
- **Rethrow in catch**: After reporting (and any remedy), rethrow unless the path is a test or documented optional path.

## Where Fast-Failure Is Applied

| Area | Behavior |
|------|----------|
| Palette load | **S3 only** (no API/static/cache fallbacks). Missing catalog URL, non-OK fetch, bad NDJSON, invalid bundle, or invalid hex → throw; startup fails. |
| State load | Fetch or parse error → throw (no default state fallback). |
| App init | Palette load or resume system init failure → rethrow; app does not start in a broken state. |
| applyPaletteToElement | Invalid color (e.g. hexToRgb null) → throw (palette was validated at startup). |
| Resume system init | Create resume divs or init failure → throw. |
| Cards controller init | Init or palette apply failure → throw. |
| Required deps | Missing selectionManager, palette, or required DOM ref when needed → throw. |

## Audit / Changed Files

- `modules/composables/useColorPalette.mjs` – loadPalettes validates all hex; catch rethrows; no palette filename/name → throw; inject fallback throws if no registry.
- `modules/core/stateManager.mjs` – fetchState/saveState throw on error.
- `modules/components/AppContent.vue` – palette and app init catch rethrow.
- `modules/resume/resumeSystemInitializer.mjs` – init/create failures throw; DOM not ready after retries throws.
- `modules/composables/useCardsController.mjs` – init and palette apply throw; no fallback styling; missing selectionManager throws; all catch rethrow.
- `modules/resume/ResumeItemsController.mjs` – create/scroll failures throw.
- `modules/resume/ResumeListController.mjs` / `ResumeListController.timeline.mjs` – catch blocks rethrow (sort save, getSortedIndexFromOriginal, addClassItem, removeClassItem, scroll, create div).
- `modules/composables/useJobsDependency.mjs` – controller init failure throws.
- `modules/components/ColorPaletteSelector.vue` – load palettes catch rethrows.
- `modules/components/ResizeHandle.vue` – step count update catch rethrows.
- `modules/components/SceneContainer.vue` – init and registry register catch rethrow; inject fallback throws if no registry.
- `modules/composables/useKeyboardNavigation.mjs` – navigation error rethrows.
- `modules/resume/infiniteScrollingContainer.mjs` – palette apply and onItemChange catch rethrow.
- `modules/composables/useAppState.ts` – load retries throw after max; save and auto-save catch rethrow.
- `modules/core/eventBus.mjs` – listener error rethrows.
- `modules/composables/useResizeHandle.mjs` – updateLayout catch rethrows.
- `modules/composables/useTimeline.mjs` – date parse catch rethrows.
- `modules/composables/useParallaxVue3Enhanced.mjs` – render error rethrows.
- `modules/core/dragStateManager.mjs` – pending calculation and listener catch rethrow.
- `modules/composables/useFocalPointVue3.mjs` – inject fallback throws if no registry.

## Error reporting utility

- **`modules/utils/errorReporting.mjs`** exports `reportError(error, context?, remedy?)`.
- **Always report**: Call it (or equivalent logging) in every catch block with a clear `context` (e.g. `[ModuleName] operation failed`).
- **Report remedy**: When you apply a remedy (retry, revert, fallback), pass a short `remedy` string (e.g. `Reverting step count to previous value`, `Retrying in 1s`). It is logged as `Remedy: ...` after the error.

## Exceptions

- **Tests**: Catch used to assert that an error is thrown.
- **Event-bus / third-party listeners**: Document if we intentionally isolate one listener’s error so others still run; otherwise rethrow.
- **Explicit optional features**: Only if documented as optional and non-blocking.
