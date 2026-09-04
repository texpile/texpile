import { error } from '@sveltejs/kit';
import { DOCS } from '$lib/docs/content.server';
import { renderDoc } from '$lib/docs/markdown.server';
import { hrefFor } from '$lib/docs/nav';

export function load({ params }: { params: { slug: string } }) {
	const doc = DOCS[params.slug ?? ''];
	if (!doc) error(404);
	// a nested page carries its chapter in the tab title: two "Live preview" pages, or the LaTeX
	// chapter and the LaTeX install page, would otherwise share one title in search results
	const parent = doc.slug.includes('/') ? DOCS[doc.slug.slice(0, doc.slug.lastIndexOf('/'))] : undefined;
	const headTitle = parent ? `${doc.title} - ${parent.title}` : doc.title;
	return { title: doc.title, headTitle, description: doc.description, path: hrefFor(doc.slug), ...renderDoc(doc) };
}
