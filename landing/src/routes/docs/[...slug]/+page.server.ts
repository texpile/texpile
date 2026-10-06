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
	// the breadcrumb: the section, then every page above this one
	const trail: { title: string; href: string }[] = [];
	for (let s = doc.slug; s.includes('/');) {
		s = s.slice(0, s.lastIndexOf('/'));
		trail.unshift({ title: DOCS[s].nav, href: hrefFor(s) });
	}
	const top = DOCS[doc.slug.split('/')[0]];
	// a chapter that is its section (LaTeX) is the section label itself, linked, not a second crumb
	const sectionHref = trail[0] && top?.section === trail[0].title ? trail.shift()!.href : undefined;
	// the same page in the other formats: latex/tables, typst/tables, markdown/tables
	const m = /^(latex|typst|markdown)(?:\/(.*))?$/.exec(doc.slug);
	const formats = m
		? (['latex', 'typst', 'markdown'] as const)
				.map((f) => ({ f, slug: m[2] ? `${f}/${m[2]}` : f }))
				.filter(({ slug }) => DOCS[slug])
				.map(({ f, slug }) => ({ label: DOCS[f].title, href: hrefFor(slug), current: slug === doc.slug }))
		: [];
	return {
		slug: doc.slug,
		title: doc.title,
		headTitle,
		description: doc.description,
		path: hrefFor(doc.slug),
		section: top?.section ?? '',
		sectionHref,
		trail,
		formats: formats.length > 1 ? formats : [],
		...renderDoc(doc)
	};
}
