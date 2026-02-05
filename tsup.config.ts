import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'models/index': 'src/models/index.ts',
    'tools/index': 'src/tools/index.ts',
    'utils/index': 'src/utils/index.ts',
    'logger/index': 'src/logger/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  splitting: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  minify: false,
  target: 'node18',
  external: ['openai', 'ai', '@ai-sdk/openai'],
  outDir: 'dist',
});
