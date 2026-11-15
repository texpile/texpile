import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { defineConfig, type Plugin, type ViteDevServer } from 'vite';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// Every docs page, from the markdown files themselves. The prose is English-only, but the
// localized routes still have to exist so the nav can never 404 in another locale.
const DOCS_DIR = fileURLToPath(new URL('../docs', import.meta.url));
type PagePath = `/${string}`;
function docSlugs(dir = DOCS_DIR): ('' | PagePath)[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
		const p = join(dir, e.name);
		if (e.isDirectory()) return docSlugs(p);
		if (!e.name.endsWith('.md')) return [];
		const slug = relative(DOCS_DIR, p)
			.replace(/\\/g, '/')
			.replace(/\.md$/, '')
			.replace(/(^|\/)README$/, '');
		return [slug ? (`/${slug}` as const) : ''];
	});
}
const DOC_SLUGS = docSlugs();
const NON_BASE_LOCALES = ['zh-Hans', 'zh-Hant'];
// the Svelte routes outside /docs
const PAGES = ['', '/download', '/latex-editor', '/typst-editor'];
const localizedDocs = NON_BASE_LOCALES.flatMap((l) => DOC_SLUGS.map((s): PagePath => `/${l}/docs${s}`));

// The docs are markdown in ../docs, outside this project root, reached through import.meta.glob
// in content.server.ts. Vite only watches the files it has already loaded from there, and a
// change in a server-only module does not reload the browser on its own. Watch the folder and
// reload the page, so an edit, a new page or a deleted page shows up like any other dev change.
function docsReload(): Plugin {
	const slash = (p: string) => p.replace(/\\/g, '/');
	const dir = slash(fileURLToPath(new URL('../docs/', import.meta.url)));
	return {
		name: 'texpile-docs-reload',
		apply: 'serve',
		configureServer(server: ViteDevServer) {
			server.watcher.add(dir);
			server.watcher.on('all', (event, changed) => {
				const file = slash(changed);
				if (!file.startsWith(dir) || !file.endsWith('.md')) return;
				for (const env of Object.values(server.environments)) {
					for (const mod of env.moduleGraph.getModulesByFile(file) ?? []) env.moduleGraph.invalidateModule(mod);
				}
				server.hot.send({ type: 'full-reload', path: '*' });
			});
		}
	};
}

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			preprocess: [vitePreprocess()],
			// $lib as before SvelteKit 3, and the repo-level brand assets (see TRADEMARK.md): one canonical copy, no
			// per-app duplicates. Subpath imports cannot reach outside the package, so both stay aliases
			alias: { $lib: 'src/lib', $branding: '../branding' },
			// Fully static site (single landing page) — deployable to any static host at a domain root.
			adapter: adapter({ fallback: undefined }),
			// '*' crawls real <a href> tags for the locale variants; the Navbar's language switcher is a
			// Menu component (not anchors), so the non-base locales must be listed explicitly or they
			// silently stop being prerendered.
			prerender: {
				entries: [
					'*',
					...NON_BASE_LOCALES.flatMap((l) => PAGES.map((p): PagePath => `/${l}${p}`)),
					...DOC_SLUGS.map((s): PagePath => `/docs${s}`),
					...localizedDocs
				]
			},
			// absolute asset URLs, so 404.html (served for any missing path) is styled at any URL depth
			paths: { relative: false }
		}),
		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/lib/paraglide',
			emitTsDeclarations: true,
			strategy: ['url', 'cookie', 'baseLocale']
		}),
		docsReload()
	]
});
