import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    'smolagents.browser': 'src/index.ts',
  },
  format: ['iife'],
  globalName: 'SmolAgents',
  dts: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  minify: false, // Keep it readable for demo debugging
  target: 'es2020',
  platform: 'browser',
  external: ['pyodide'], // Load from CDN
  outDir: 'dist-browser',
  banner: {
    js: `/* smolagents-ts browser shim: minimal process/env */
;(function(){
  const g = (typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
  const p = (g.process ??= {});
  p.env ??= {};
})();
`,
  },
  noExternal: ['process', 'openai', 'handlebars', 'js-yaml', 'ai', '@ai-sdk/openai'], // Bundle these
  esbuildOptions(options) {
    options.alias = {
      process: 'process/browser',
    };
  },
});
