import adapter from '@sveltejs/adapter-static';
import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// Every docs page, from the markdown files themselves. The prose is English-only, but the
// localized routes still have to exist so the nav can never 404 in another locale.
const DOCS_DIR = fileURLToPath(new URL('../docs', import.meta.url));
const docSlugs = (dir = DOCS_DIR) =>
	readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
		const p = join(dir, e.name);
		if (e.isDirectory()) return docSlugs(p);
		if (!e.name.endsWith('.md')) return [];
		const slug = relative(DOCS_DIR, p)
			.replace(/\\/g, '/')
			.replace(/\.md$/, '')
			.replace(/(^|\/)README$/, '');
		return [slug ? `/${slug}` : ''];
	});
const DOC_SLUGS = docSlugs();
const NON_BASE_LOCALES = ['zh-Hans', 'zh-Hant'];
// the Svelte routes outside /docs
const PAGES = [
	'',
	'/download',
	'/latex-editor',
	'/typst-editor',
	'/overleaf-alternatives',
	'/vs/texstudio',
	'/vs/overleaf',
	'/vs/latex-workshop',
	'/vs/lyx'
];
const localizedDocs = NON_BASE_LOCALES.flatMap((l) => DOC_SLUGS.map((s) => `/${l}/docs${s}`));

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: [vitePreprocess()],
	kit: {
		// the repo-level brand assets (see TRADEMARK.md); one canonical copy, no per-app duplicates
		alias: { $branding: '../branding' },
		// Fully static site (single landing page) — deployable to any static host at a domain root.
		adapter: adapter({ fallback: undefined }),
		// '*' crawls real <a href> tags for the locale variants; the Navbar's language switcher is a
		// Menu component (not anchors), so the non-base locales must be listed explicitly or they
		// silently stop being prerendered.
		prerender: {
			entries: [
				'*',
				...NON_BASE_LOCALES.flatMap((l) => PAGES.map((p) => `/${l}${p}`)),
				...DOC_SLUGS.map((s) => `/docs${s}`),
				...localizedDocs
			]
		},
		// absolute asset URLs, so 404.html (served for any missing path) is styled at any URL depth
		paths: { relative: false }
	}
};

export default config;
