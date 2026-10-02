// Upstream's import cycles only resolve once esbuild bundles them, so tests that run a live
// field import MathLive the way the app does: as a bundle, built here before they start.
import { build } from 'esbuild';
import lessPlugin from '@arnog/esbuild-plugin-less';
import path from 'node:path';

const BUNDLE = path.resolve(import.meta.dirname, '../build/test/mathlive.mjs');

export default async function setup(): Promise<void> {
  await build({
    absWorkingDir: path.resolve(import.meta.dirname, '..'),
    entryPoints: ['src/mathlive.ts'],
    outfile: BUNDLE,
    bundle: true,
    format: 'esm',
    define: {
      ENV: '"development"',
      SDK_VERSION: '"test"',
      GIT_VERSION: '"test"',
    },
    plugins: [lessPlugin()],
    external: ['@cortex-js/compute-engine'],
    logLevel: 'error',
  });
}
