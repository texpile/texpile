import { Columns2 } from '@lucide/svelte';
import { typGridNode, type BlockInsertItem } from '$lib/languages/typst/visual/core';
import { m } from '$lib/paraglide/messages';

export function gridInserts(): BlockInsertItem[] {
	return [
		{
			id: 'grid',
			label: m.typ_layout_title_grid(),
			icon: Columns2,
			category: 'common',
			shape: 'block',
			style: false,
			select: 'in',
			make: (s) => typGridNode(s)
		}
	];
}
