# Testing

## Running tests

```bash
# All tests (app + palette-utils-ts)
npm test

# App tests only
npm run test:app

# App tests in watch mode
npm run test:app:watch

# Coverage (app + palette-utils-ts)
npm run test:coverage

# App coverage only
npm run test:coverage:app
```

Coverage reports:

- **App:** `./coverage/` (open `coverage/index.html` in a browser for the full report)
- **palette-utils-ts:** `palette-utils-ts/coverage/`

## What is tested

Unit tests exist for modules that can run in Node without a browser or Vue:

- **utils:** `paletteHelpers`, `utils`, `dateUtils`, `mathUtils`, `bizCardUtils`, `zUtils`
- **core:** `eventBus`, `filters`, `cardConstants`, `InitializationPhases`, `dragStateManager`, `abstracts/BaseComponent`
- **data:** `enrichedJobs`

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

- App tests: `modules/**/*.test.mjs`
- Config: `vitest.config.js`
- Global mocks (e.g. `window.CONSOLE_LOG_IGNORE`, globals used by `mathUtils`): `vitest.setup.mjs`
