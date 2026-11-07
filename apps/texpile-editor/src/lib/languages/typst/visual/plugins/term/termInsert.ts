import { ListCollapse } from '@lucide/svelte';
import type { BlockInsertItem } from '$lib/languages/typst/visual/core';
import { m } from '$lib/paraglide/messages';

/** a term and what it means */
export function termInserts(): BlockInsertItem[] {
	return [
		{
			id: 'terms',
			label: m.insert_list_terms(),
			icon: ListCollapse,
			category: 'text',
			shape: 'block',
			style: true,
			select: 'in',
			make: (s) => s.nodes.term_item.create(null, [s.nodes.term_title.create(), s.nodes.paragraph.create()]),
			is: (node) => node.type.name === 'term_item'
		}
	];
}
