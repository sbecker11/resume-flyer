# Testing

## Running tests

```bash
# All tests (app + color-palette-utils-ts)
npm test

# App tests in watch mode
npm run test:watch

# Coverage (app + color-palette-utils-ts)
npm run test:coverage
```

To run only app tests or only palette tests: `npx vitest run --config vitest.config.js` or `cd color-palette-utils-ts && npm test` (and for coverage, add `--coverage` or `npm run test:coverage` in the palette dir).

Coverage reports:

- **App:** `./coverage/` (open `coverage/index.html` in a browser for the full report)
- **color-palette-utils-ts:** `color-palette-utils-ts/coverage/`

## Coverage threshold: 80% line coverage per file

The app test run enforces **at least 80% line coverage for each file** that is included in coverage (`vitest.config.js` → `coverage.thresholds.perFile: true`, `lines: 80`). Any file in the report that drops below 80% lines will fail the run.

Files that are **excluded from coverage** (and thus not subject to the 80% rule) are listed in `coverage.exclude` in `vitest.config.js`. They include:

- **Test helpers** — `modules/resume/testFixtures.mjs`, `modules/composables/testHost.mjs` (support code, not product code).
- **Partially covered, DOM-geometry-heavy modules** that have tests but sit below 80%: `ResumeListController.mjs` (~40%; half the file is the disabled `DISABLE_RESUME_LIST_SCROLL` path plus console helpers) and `useCardsController.mjs` (~46%; init, fast-fail, static placement, generation abort and reinitialize are covered — the pointer/selection/clone choreography needs real layout).
- **Vue/DOM-heavy composables without dedicated tests yet** (e.g. `useResizeHandle`, `useSceneAutoScroll`, `useCardRegistry`, `useLayoutToggle`, `useTimeline`, `useGlobalElementRegistry`, `useJobsDependency`).
- **stateManager.mjs** — large default state and migrations; covered by integration and state tests elsewhere.
- **parseMjsExport.mjs** — one branch is unreachable for the current parser output format; ~75% line coverage.
- **mathUtils.mjs**, **domUtils.mjs**, **appStore.mjs**, **selectionManager.mjs**, **BaseComponent.mjs** — excluded so the 80% rule applies to the remaining, more unit-testable modules.
- **skillCardContrastGuard.mjs**, **skillInfoModal.mjs** — DOM-heavy (getComputedStyle, getClientRects, delegated listeners/innerHTML).

`.vue` single-file components are not in `coverage.include` (`modules/**/*.mjs`), so component tests contribute behaviour coverage but are not gated by the 80% rule.

To meet 80% for a new or currently excluded file, add it to the include set (remove from exclude), add unit tests until line coverage is ≥ 80%, then run `npm run test:coverage`. Vitest's text table hides files at 100%; use `coverage/lcov.info` (`LF`/`LH` lines) or `coverage/index.html` to confirm a file's number.

If a file genuinely can't reasonably reach 80% (e.g. it's Vue/DOM-heavy and would need a full component-mount/jsdom harness to unit-test meaningfully), add it to `coverage.exclude` in `vitest.config.js` instead, with a one-line comment explaining why — follow the existing pattern already there (e.g. `// DOM-heavy (getComputedStyle, getClientRects, skill-card classes).` above `skillCardContrastGuard.mjs`). Prefer writing tests over excluding; only exclude when the DOM/Vue setup cost clearly outweighs the coverage gained.

### CI enforcement

CI (`.github/workflows/ci.yml`, job `test`, step **"Run tests with coverage"**) runs `npm run test:coverage` instead of plain `npm test`, so a pull request or push that drops any included file below 80% lines fails the build (vitest exits non-zero on a `coverage.thresholds` miss). The step **"Upload coverage report"** attaches the `coverage/` directory (including `coverage/index.html`) as a downloadable build artifact on every run (`if: always()`) so you can inspect exactly which lines are missing without reproducing locally.

CI does not need `.env` to be decrypted (see `docs/SECRETS.md`) — these tests are fully mocked and never call `ANTHROPIC_API_KEY`/AWS APIs for real.

## What is tested

Tests run under `environment: 'happy-dom'` (see `vitest.config.js`), so `document`/`window` are available everywhere and `.vue` files are compiled by `@vitejs/plugin-vue`.

**Pure modules (Node-only logic):**

- **utils:** `paletteHelpers`, `utils`, `dateUtils`, `mathUtils`, `bizCardUtils`, `zUtils`, `paletteBundleFromImageMetadata`, `errorReporting`, `paletteCatalogValidate`, `paletteS3LoudError`, `skillUrlSync`
- **core:** `eventBus`, `filters`, `cardConstants`, `InitializationPhases`, `dragStateManager`, `abstracts/BaseComponent`
- **data:** `enrichedJobs`, `parseMjsExport`, `ResumeSkill`, `parsedResumeFormatValidator`
- **server:** `modules/server/*.test.mjs` — pure helpers extracted from `server.mjs` (`resumeDataHelpers`, `skillMerge`, `localDevQuit`) plus `resumeRoutes.test.mjs`, which mounts the Express routes against a temp `parsed_resumes` directory and asserts the resume, state and skill-URL API.

**Resume list / items controllers (happy-dom):** `modules/resume/*.test.mjs` — `ResumeListController`, `ResumeItemsController`, `resumeListScrollContainer`, `resumeReinitializer`, `resumeSystemInitializer`, `reparseHistory`. Shared fixtures live in `modules/resume/testFixtures.mjs` (`fixtureJobs()`, `createJobsDependencyStub()`, `mountResumeListDom()`, `listedJobNumbers()`).

**Scene composables (happy-dom + Vue runtime, no component mount):** `useColorPalette`, `useParallaxVue3Enhanced`, `useFocalPointVue3`, `useBullsEyeVue3`, `useKeyboardNavigation`, `useCardsController`, `useJobsDependency`, `useAppContext`, `usePointerDragOffset`. Composables are run inside a throwaway host app via `modules/composables/testHost.mjs`:

```js
import { withSetup, setRect } from './testHost.mjs';
const m = withSetup(() => useBullsEye(), { parentSetup: () => provideAppContext() });
m.result.setPosition(10, 20);   // the composable's return value
m.unmount();
```

`parentSetup` runs in a wrapping parent component so anything it `provide()`s is injectable by the composable (a component cannot inject what it provided itself). `setRect(el, { left, top, width, height })` pins `getBoundingClientRect` for geometry-dependent code. The parallax tests assert the transform math from fixed bulls-eye/focal/scene rects; the cards-controller test asserts that focal/bulls-eye events never reposition scene cards (the scene is static — only the parallax transform changes).

**Vue components (`@vue/test-utils`):** `Timeline.vue`, `ResumeManagerDelete.vue`, `ResizeHandle.vue`, `resume-details-editor/tabs/{MetaTab,JobsTab,SkillJobsTab}.vue`. These mock the API/composable layer and assert behaviour (emitted events, API calls, disabled states, dialog flow) — never pixel positions. Dialogs rendered through `<Teleport to="body">` are tested with `global.stubs.Teleport = true`; handlers that rethrow (fast-fail) are captured with `global.config.errorHandler`.

### Resume and resume-parser compatibility

- **Source of truth:** Schema docs, schema definitions, and parser CLIs live in the **resume-parser** package. The schema is versioned (e.g. `contracts/parsed-resume-format-v1.0.json`); the validator is at `contracts/validate_parsed_resume.py`. This repo may retain unit tests for parsed-resume format; **future resume-parser package updates may require updates to local tests and code**.
- **Unit:** `parseMjsExport` parses `.mjs` content in resume-parser format (`export const jobs = [...];`, `export const skills = {...};`). `enrichedJobs` is tested with parser-style job shape (index, role, employer, start, end, Description) and edge cases (null Description, empty url, dedup brackets).
- **Integration:** `resumeParserCompat.integration.test.mjs` checks that the pipeline (parseMjsExport + enrichJobsWithSkills) consumes parser output correctly. When `static_content/jobs/jobs.mjs` and `static_content/skills/skills.mjs` exist, tests read and parse them to ensure compatibility with real parser output. resume-parser has its own unit tests; these tests ensure resume-flyer stays compatible with the format it produces.

## Remaining gaps

What is still excluded, and what it would take to cover it:

1. **`useCardsController` beyond init** — pointer hover/selection, clone show/hide and skill-card placement depend on real layout (`offsetHeight`, `getBoundingClientRect`); happy-dom returns zeros. Candidates for a browser-mode Vitest run rather than more unit tests.
2. **`useResizeHandle`, `useSceneAutoScroll`, `useLayoutToggle`, `useTimeline`** — module-level singletons with window/scroll geometry; testable with `withSetup` plus `setRect`, not yet done.
3. **`ResumeListController` scroll path** — the half of the file under `DISABLE_RESUME_LIST_SCROLL` is dead in the current build.
4. **`selectionManager`, `appStore`, `stateManager`, `domUtils`** — exercised indirectly by the controller and composable tests but not asserted directly.
5. **Large components** (`ResumeContainer.vue`, `AppContent.vue`, `SceneContainer.vue`, `ResumeDetailsEditor.vue`) — integration-level; mount them only with a dedicated harness.

Conventions when adding tests:

- Mock at module boundaries with `vi.mock(...)`; stub `fetch` by URL suffix rather than mocking the API module when the module under test *is* the fetch layer (see `useColorPalette.test.mjs`).
- Hover/debounce code paths need `vi.useFakeTimers()`; animation code stubs `requestAnimationFrame` (synchronous, or a controllable queue as in `useFocalPointVue3.test.mjs`).
- Assert error paths against the fast-failure rule: `reportError(error, context, remedy)` is called and the error is rethrown (see `.cursor/rules/fast-failure.mdc`).
- Keep scratch files outside the repo; shared fixtures belong in `testFixtures.mjs` / `testHost.mjs`, which stay in `coverage.exclude`.

## Test layout

- App tests: `modules/**/*.test.mjs` and `scripts/**/*.test.mjs`
- **Integration tests** are named `*.integration.test.mjs` (e.g. `resumeParserCompat.integration.test.mjs`). All other `*.test.mjs` files are unit tests.
- Component tests sit next to their `.vue` file and keep the `.test.mjs` suffix (e.g. `modules/components/ResizeHandle.test.mjs`).
- Config: `vitest.config.js` (`happy-dom`, `@vitejs/plugin-vue`, `@` alias → repo root)
- Global mocks (e.g. `window.CONSOLE_LOG_IGNORE`, globals used by `mathUtils`): `vitest.setup.mjs`
- Shared helpers: `modules/resume/testFixtures.mjs`, `modules/composables/testHost.mjs`

### Resume-related test files

| File | Purpose |
|------|---------|
| `modules/data/parseMjsExport.test.mjs` | Unit tests for .mjs parsing (resume-parser format). |
| `modules/data/parsedResumeFormat.test.mjs` | Format conformance (parsed-resume); may need updates when resume-parser package changes. |
| `modules/data/enrichedJobs.test.mjs` | Unit tests for job enrichment (references, job-skills, parser job shape). |
| `modules/data/resumeParserCompat.integration.test.mjs` | Integration: parse + enrich pipeline; optional read from static_content. |
| `modules/composables/useJobsDependency.test.mjs` | Unit tests for loadJobs (URL, 404, non-array), getJobsData (mocked fetch). |
| `modules/utils/paletteBundleFromImageMetadata.test.mjs` | Unit tests for JSONL parsing (valid/invalid lines, backgroundSwatchIndex, imagePublicUrl, normalization). |

