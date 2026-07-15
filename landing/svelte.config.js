import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: [vitePreprocess()],
	kit: {
		// Fully static site (single landing page) — deployable to any static host at a domain root.
		adapter: adapter({ fallback: undefined }),
		prerender: { entries: ['*'] },
		// absolute asset URLs, so 404.html (served for any missing path) is styled at any URL depth
		paths: { relative: false }
	}
};

export default config;
