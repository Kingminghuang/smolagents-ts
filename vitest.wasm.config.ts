import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'wasm',
    globals: true,
    environment: 'node',
    include: ['tests/wasm/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    testTimeout: 30000,
    setupFiles: ['./tests/setup.ts'],
  },
});
