import { json } from '@sveltejs/kit';
import { DOCS } from '$lib/docs/content.server';
import { headingsOf } from '$lib/docs/markdown.server';
import { hrefFor } from '$lib/docs/nav';
import type { SearchEntry } from '$lib/docs/blocks';

export const prerender = true;

// The search box loads this once, on first open, so no page carries it in its own data.
export function GET() {
	const entries: SearchEntry[] = Object.values(DOCS)
		.filter((d) => d.slug !== '')
		.map((d) => {
			const up = d.slug.includes('/') ? DOCS[d.slug.slice(0, d.slug.lastIndexOf('/'))] : undefined;
			return { href: hrefFor(d.slug), title: d.title, parent: up?.title, description: d.description, headings: headingsOf(d) };
		});
	return json(entries);
}
