// Sidebar and pager helpers over the nav tree the docs layout receives from its server load.
import type { NavNode } from './content.server';

export type { NavNode };

export const hrefFor = (slug: string) => (slug ? `/docs/${slug}` : '/docs');

/** depth first, a parent immediately followed by its children: the reading order */
export function flatten(nav: NavNode[]): NavNode[] {
	return nav.flatMap((n) => [n, ...flatten(n.children)]);
}

/** prev/next for the footer pager; nulls at the ends */
export function siblings(nav: NavNode[], slug: string) {
	const flat = flatten(nav);
	const i = flat.findIndex((n) => n.slug === slug);
	return {
		prev: i > 0 ? flat[i - 1] : null,
		next: i >= 0 && i < flat.length - 1 ? flat[i + 1] : null
	};
}

export function lookup(nav: NavNode[], slug: string): NavNode | null {
	return flatten(nav).find((n) => n.slug === slug) ?? null;
}
