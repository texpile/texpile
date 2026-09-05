// The engine modules for the bridge, bundled straight from electron/src. The app's own build
// rolls the main process into one file (scripts/build-electron.mjs), so there is no per-module
// dist to require; bundling here means no build step and never a stale copy.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, '../../../../electron/src');

// one bundle, so the compile and the bridge's own daemon calls share the same daemon state
const ENTRY = `
export * as draftService from './draft/draftService';
export * as draftDaemon from './draft/draftDaemon';
export * as fsService from './fs/fsService';
export * as synctexCli from './fs/synctexCli';
export * as fontT1Map from './fontT1Map';
`;

/** { draftService, draftDaemon, fsService, synctexCli, fontT1Map } from the current source */
export function loadEngine() {
	const out = path.join(os.tmpdir(), 'texpile-live-harness', `engine-${process.pid}.cjs`);
	fs.mkdirSync(path.dirname(out), { recursive: true });
	buildSync({
		stdin: { contents: ENTRY, resolveDir: src, loader: 'ts' },
		outfile: out,
		bundle: true,
		platform: 'node',
		format: 'cjs',
		target: 'node24',
		external: ['electron', 'node-pty'],
		logLevel: 'silent'
	});
	return createRequire(import.meta.url)(out);
}
