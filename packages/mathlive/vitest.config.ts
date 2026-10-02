import { defineConfig, type Plugin } from 'vitest/config';
import wasm from 'vite-plugin-wasm';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const src = path.resolve(import.meta.dirname, 'src');

// vitest 4 runs vite-plugin-wasm's helper, `/__vite-plugin-wasm-helper`, as the file
// `file:///__vite-plugin-wasm-helper`, which is no path on Windows; as a virtual module it is none
const helper = createRequire(import.meta.url)(
  path.resolve(
    import.meta.dirname,
    'node_modules/vite-plugin-wasm/dist/wasm-helper.js'
  )
) as { id: string; code: string };
const wasmHelper: Plugin = {
  name: 'wasm-helper-virtual',
  enforce: 'pre',
  resolveId: (id) => (id === helper.id ? '\0wasm-helper' : undefined),
  load: (id) =>
    id === '\0wasm-helper' ? `export default ${helper.code}` : undefined,
};

// upstream imports by path from src/ (its tsconfig's baseUrl): `core/types`, `public/core-types`
const roots = fs
  .readdirSync(src, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

export default defineConfig({
  // Typst's parser is wasm, imported as an ES module
  plugins: [wasmHelper, wasm()],
  resolve: {
    alias: [
      {
        find: new RegExp(`^(${roots.join('|')})/`),
        replacement: `${src}/$1/`,
      },
    ],
  },
  define: {
    ENV: '"development"',
    SDK_VERSION: '"test"',
    GIT_VERSION: '"test"',
  },
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/bundle.ts'],
    server: { deps: { inline: ['texpile-typst-syntax-wasm'] } },
  },
});
