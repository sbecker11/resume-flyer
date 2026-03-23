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

- **Vue/DOM-heavy composables** (e.g. `useCardsController`, `useColorPalette`, `useResizeHandle`, `resume/*`) — not unit-tested to 80% without full Vue/DOM setup.
- **stateManager.mjs** — large default state and migrations; covered by integration and state tests elsewhere.
- **parseMjsExport.mjs** — one branch is unreachable for the current parser output format; ~75% line coverage.
- **mathUtils.mjs**, **domUtils.mjs**, **appStore.mjs**, **selectionManager.mjs**, **BaseComponent.mjs** — excluded so the 80% rule applies to the remaining, more unit-testable modules.

To meet 80% for a new or currently excluded file, add it to the include set (remove from exclude), add unit tests until line coverage is ≥ 80%, then run `npm run test:coverage`.

## What is tested

Unit tests exist for modules that can run in Node without a browser or Vue:

- **utils:** `paletteHelpers`, `utils`, `dateUtils`, `mathUtils`, `bizCardUtils`, `zUtils`
- **core:** `eventBus`, `filters`, `cardConstants`, `InitializationPhases`, `dragStateManager`, `abstracts/BaseComponent`
- **data:** `enrichedJobs`, `parseMjsExport`
- **composables:** `useJobsDependency` (mocked fetch)

### Resume and resume-parser compatibility

- **Source of truth:** Schema docs, schema definitions, and parser CLIs live in the **resume-parser** package. The schema is versioned (e.g. `contracts/parsed-resume-format-v1.0.json`); the validator is at `contracts/validate_parsed_resume.py`. This repo may retain unit tests for parsed-resume format; **future resume-parser package updates may require updates to local tests and code**.
- **Unit:** `parseMjsExport` parses `.mjs` content in resume-parser format (`export const jobs = [...];`, `export const skills = {...};`). `enrichedJobs` is tested with parser-style job shape (index, role, employer, start, end, Description) and edge cases (null Description, empty url, dedup brackets).
- **Integration:** `resumeParserCompat.integration.test.mjs` checks that the pipeline (parseMjsExport + enrichJobsWithSkills) consumes parser output correctly. When `static_content/jobs/jobs.mjs` and `static_content/skills/skills.mjs` exist, tests read and parse them to ensure compatibility with real parser output. resume-parser has its own unit tests; these tests ensure resume-flyer stays compatible with the format it produces.

## Reaching 100% line coverage

A large share of the codebase is not yet covered by unit tests because it depends on:

- **Vue** (ref, computed, watch, inject, components)
- **DOM / browser** (document, window, elements, events)
- **App context** (useAppState, element registry, fetch, async initialization)

To cover those lines you would need to:

1. **Composables** (`useColorPalette`, `useCardsController`, etc.): use Vue Test Utils, mock `inject()`, `useAppState()`, and any global registry/fetch.
2. **Resume/core controllers** (`ResumeListController`, `ResumeItemsController`, `selectionManager`, etc.): run in a `jsdom` environment and mock DOM, CardsController, and data managers.
3. **Stores** (`appStore`): test with Pinia test helpers or by instantiating the store and exercising actions/getters.
4. **utils/domUtils**: test with jsdom or mocked DOM nodes.

The current Vitest config uses `environment: 'node'`. Switching to `environment: 'jsdom'` (and adding `@vitest/ui` or jsdom) would allow DOM-dependent tests; composables would still need Vue Test Utils and dependency mocks.

## Test layout

- App tests: `modules/**/*.test.mjs` and `scripts/**/*.test.mjs`
- **Integration tests** are named `*.integration.test.mjs` (e.g. `resumeParserCompat.integration.test.mjs`). All other `*.test.mjs` files are unit tests.
- Config: `vitest.config.js`
- Global mocks (e.g. `window.CONSOLE_LOG_IGNORE`, globals used by `mathUtils`): `vitest.setup.mjs`

### Resume-related test files

| File | Purpose |
|------|---------|
| `modules/data/parseMjsExport.test.mjs` | Unit tests for .mjs parsing (resume-parser format). |
| `modules/data/parsedResumeFormat.test.mjs` | Format conformance (parsed-resume); may need updates when resume-parser package changes. |
| `modules/data/enrichedJobs.test.mjs` | Unit tests for job enrichment (references, job-skills, parser job shape). |
| `modules/data/resumeParserCompat.integration.test.mjs` | Integration: parse + enrich pipeline; optional read from static_content. |
| `modules/composables/useJobsDependency.test.mjs` | Unit tests for loadJobs (URL, 404, non-array), getJobsData (mocked fetch). |

