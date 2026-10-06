// Sidebar and pager helpers over the nav tree the docs layout receives from its server load.
import type { NavNode } from './content.server';

export type { NavNode };

export const hrefFor = (slug: string) => (slug ? `/docs/${slug}` : '/docs');

/** depth first, a parent immediately followed by its children: the reading order */
export function flatten(nav: NavNode[]): NavNode[] {
	return nav.flatMap((n) => [n, ...flatten(n.children)]);
}

/** the order the pager walks: reading order, minus the children of a page that asks to skip them */
function pagerOrder(nav: NavNode[]): NavNode[] {
	return nav.flatMap((n) => [n, ...(n.skipChildren ? [] : pagerOrder(n.children))]);
}

/** prev/next for the footer pager; nulls at the ends. A skipped child pages through its own reading order */
export function siblings(nav: NavNode[], slug: string) {
	let order = pagerOrder(nav);
	if (!order.some((n) => n.slug === slug)) order = flatten(nav);
	const i = order.findIndex((n) => n.slug === slug);
	return {
		prev: i > 0 ? order[i - 1] : null,
		next: i >= 0 && i < order.length - 1 ? order[i + 1] : null
	};
}

export function lookup(nav: NavNode[], slug: string): NavNode | null {
	return flatten(nav).find((n) => n.slug === slug) ?? null;
}

export interface NavGroup {
	section: string;
	topics: NavNode[];
}

/**
 * The sidebar groups: consecutive top-level pages that share a section. A section that is one
 * chapter of its own name (the LaTeX section holds only the LaTeX chapter) lists the chapter's
 * pages directly, with the chapter page itself first as `overview`. The chapter's own `overview`
 * front matter names it instead, and `none` leaves it out (Reference has nothing to overview).
 */
export function navGroups(nav: NavNode[], overview = 'Overview'): NavGroup[] {
	const out: NavGroup[] = [];
	for (const topic of nav) {
		const last = out[out.length - 1];
		if (last && last.section === topic.section) last.topics.push(topic);
		else out.push({ section: topic.section ?? '', topics: [topic] });
	}
	return out.map((g) => {
		const [only] = g.topics;
		if (g.topics.length !== 1 || only.title !== g.section) return g;
		if (only.overview === 'none') return { section: g.section, topics: only.children };
		const title = only.overview || overview || only.title;
		return { section: g.section, topics: [{ ...only, title, children: [] }, ...only.children] };
	});
}
