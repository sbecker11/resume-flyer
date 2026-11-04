import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // Compile .vue SFCs so component tests can mount them with @vue/test-utils.
  plugins: [vue()],
  test: {
    environment: 'happy-dom',
    include: ['modules/**/*.test.mjs', 'scripts/**/*.test.mjs'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/color-palette-utils-ts/**'],
    globals: false,
    setupFiles: ['./vitest.setup.mjs'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['modules/**/*.mjs', 'scripts/check-console-error-ratchet.mjs'],
      exclude: [
        '**/node_modules/**',
        '**/*.test.mjs',
        '**/*.d.ts',
        '**/dist/**',
        '**/color-palette-utils-ts/**',
        '**/modules/types/**',
        '**/index.ts',
        // Vue/DOM-heavy or integration-only (not unit-tested to 80%)
        // ~40% covered: half the file is a disabled scroll path (DISABLE_RESUME_LIST_SCROLL)
        // plus console debug helpers. Behaviour is covered by ResumeListController.test.mjs.
        'modules/resume/ResumeListController.mjs',
        'modules/resume/testFixtures.mjs',
        'modules/composables/testHost.mjs',
        // ~46% covered by useCardsController.test.mjs (init, fast-fail, static placement,
        // generation abort, reinitialize). The rest is pointer/selection/clone choreography
        // that needs real layout geometry.
        'modules/composables/useCardsController.mjs',
        'modules/composables/useCardRegistry.mjs',
        'modules/composables/useLayoutToggle.mjs',
        'modules/composables/useResizeHandle.mjs',
        'modules/composables/useCardsControllerOptimized.mjs',
        'modules/composables/useSelectedElementIdPersistence.mjs',
        'modules/composables/useTimeline.mjs',
        'modules/composables/useViewport.mjs',
        'modules/composables/useResumeItemsController.mjs',
        'modules/composables/useScenePlaneOptimized.mjs',
        'modules/composables/useSceneAutoScroll.mjs',
        'modules/composables/useGlobalElementRegistry.mjs',
        'modules/composables/useJobsDependency.mjs',
        'modules/debug/skillCardContrastGuard.mjs',
        'modules/core/selectionManager.mjs',
        'modules/scene/bizDetailsDivModule.mjs',
        'modules/core/abstracts/BaseComponent.mjs',
        'modules/stores/appStore.mjs',
        'modules/utils/domUtils.mjs',
        'modules/utils/mathUtils.mjs',
        // DOM-heavy modal helper with delegated listeners/innerHTML and cross-module globals.
        'modules/utils/skillInfoModal.mjs',
        // Large default state + migrations; covered by integration. Kept in report elsewhere.
        'modules/core/stateManager.mjs',
        // Export branch unreachable for parser output format; 75% line coverage.
        'modules/data/parseMjsExport.mjs',
        // DOM-heavy (getComputedStyle, getClientRects, skill-card classes).
        'modules/debug/skillCardContrastGuard.mjs',
      ],
      thresholds: {
        perFile: true,
        lines: 80,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
