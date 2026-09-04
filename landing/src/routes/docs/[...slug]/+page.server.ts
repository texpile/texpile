import { error } from '@sveltejs/kit';
import { DOCS } from '$lib/docs/content.server';
import { renderDoc } from '$lib/docs/markdown.server';
import { hrefFor } from '$lib/docs/nav';

export function load({ params }: { params: { slug: string } }) {
	const doc = DOCS[params.slug ?? ''];
	if (!doc) error(404);
	return { title: doc.title, description: doc.description, path: hrefFor(doc.slug), ...renderDoc(doc) };
}
