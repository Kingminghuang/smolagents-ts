import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts', 'tests/**/*.vitest.ts'],
    exclude: ['node_modules', 'dist', 'tests/wasm/**', 'tests/unit/**', 'tests/e2e/**', 'tests/integration/**', 'tests/fixtures/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/', 'tests/', '**/*.test.ts', '**/*.config.ts'],
    },
    setupFiles: ['./tests/setup.ts'],
  },
});
