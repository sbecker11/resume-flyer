import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['modules/**/*.test.mjs', 'scripts/**/*.test.mjs'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/palette-utils-ts/**'],
    globals: false,
    setupFiles: ['./vitest.setup.mjs'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['modules/**/*.mjs'],
      exclude: [
        '**/node_modules/**',
        '**/*.test.mjs',
        '**/*.d.ts',
        '**/dist/**',
        '**/palette-utils-ts/**',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
