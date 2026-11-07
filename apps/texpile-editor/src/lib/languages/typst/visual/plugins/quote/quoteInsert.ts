import { Quote } from '@lucide/svelte';
import type { BlockInsertItem } from '$lib/languages/typst/visual/core';
import { m } from '$lib/paraglide/messages';

export function quoteInserts(): BlockInsertItem[] {
	return [
		{
			id: 'quote',
			label: m.blockmenu_quote(),
			icon: Quote,
			category: 'text',
			shape: 'block',
			style: true,
			select: 'in',
			make: (s) => s.nodes.blockquote.create(null, s.nodes.paragraph.create()),
			is: (node) => node.type.name === 'blockquote'
		}
	];
}
