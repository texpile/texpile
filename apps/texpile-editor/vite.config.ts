import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';
import tailwindcss from '@tailwindcss/vite';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { createRequire } from 'node:module';
import path from 'node:path';
import { readChangelog } from './scripts/changelog.mjs';

// pre-bundle every runtime dependency up front: lazy discovery re-optimizes mid-session and
// forces a full page reload (mathlive and the CodeMirror language modes are the usual offenders)
const require = createRequire(import.meta.url);
const pkg = require('./package.json') as { version?: string; dependencies?: Record<string, string> };
// __APP_VERSION__ comes from the ROOT package.json, the same field electron-builder stamps
// into the installer, so the two can never drift apart.
const rootPkg = require('../../package.json') as { version?: string };

// build-only packages must not be pre-bundled for the browser
const NO_PREBUNDLE = new Set([
	'harper.js', // ships its own WASM worker; kept external (see optimizeDeps.exclude)
	'svelte-pdf-view', // bundles the PDF.js worker; pre-bundling breaks worker loading (see optimizeDeps.exclude)
	'@tailwindcss/vite', // a Vite plugin, not a runtime dependency
	'@inlang/paraglide-js', // compiler/vite plugin; app code imports the generated $lib/paraglide output, not this package
	'y-protocols' // no root export (only y-protocols/awareness, /sync); prebundling the bare package fails
]);

// y-protocols has no "." entry, so pre-bundle its subpaths instead of the bare package
const prebundle = [...Object.keys(pkg.dependencies ?? {}).filter((d) => !NO_PREBUNDLE.has(d)), 'y-protocols/awareness', 'y-protocols/sync'];

export default defineConfig(({ mode }) => ({
	plugins: [
		tailwindcss(),
		svelte(),
		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/lib/paraglide',
			emitTsDeclarations: true
		})
	],

	// relative asset URLs: the packaged app is served from the app:// scheme (electron/src/main.ts),
	// so the bundle must not assume a server root
	base: './',

	// injected at build time (importing package.json fails Vite's dev fs-allow list). Every released
	// changelog entry is bundled: the What's New modal shows each release the user skipped, so an
	// upgrade across several versions doesn't silently swallow the features in between.
	define: {
		__APP_VERSION__: JSON.stringify(rootPkg.version ?? '0.0.0'),
		__WHATS_NEW__: JSON.stringify(
			readChangelog()
				.filter((e) => e.released)
				.map(({ version, date, notes }) => ({ version, date, notes }))
		)
	},
	test: {
		// unit tests live under tests/unit/ (mirroring src/); playwright's tests/integration/
		// tree is deliberately outside this glob
		include: ['tests/unit/**/*.{test,spec}.{js,ts}']
		// node by default (most tests are pure logic); component tests opt in per file with
		// a `// @vitest-environment jsdom` docblock
	},

	resolve: {
		// vitest would otherwise resolve svelte's server export, where mount() throws. scoped to
		// test mode so the real build's condition resolution is untouched.
		...(mode === 'test' ? { conditions: ['browser'] } : {}),
		// 90+ source files (and the vitest suite) import through $lib, so keep it as a plain alias
		alias: {
			$lib: path.resolve(__dirname, 'src/lib')
		},
		// dynamically-loaded language packages must share one @codemirror/state instance
		// (avoids instanceof failures)
		dedupe: ['@codemirror/state', '@codemirror/view', '@codemirror/language']
	},

	optimizeDeps: {
		include: [
			...prebundle,
			// dynamically loaded by @codemirror/language-data's .load(); transitive, so resolve
			// through it with Vite's `a > b` syntax
			'@codemirror/language-data > @codemirror/legacy-modes/mode/stex', // LaTeX highlighting
			'@codemirror/language-data > @codemirror/lang-json'
		],
		exclude: ['harper.js', 'svelte-pdf-view'],
		esbuildOptions: {
			target: 'esnext'
		}
	},

	assetsInclude: ['**/*.wasm'],

	worker: {
		format: 'es'
	},

	build: {
		sourcemap: false
	},

	// minification strips our comments but must keep third-party legal comments (/*! */,
	// @license, @preserve): they're the bundled libraries' attribution requirements
	esbuild: {
		legalComments: 'inline'
	}
}));
