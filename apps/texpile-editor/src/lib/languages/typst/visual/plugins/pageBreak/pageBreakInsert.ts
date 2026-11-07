import { SeparatorHorizontal } from '@lucide/svelte';
import type { BlockInsertItem } from '$lib/languages/typst/visual/core';
import { m } from '$lib/paraglide/messages';

export function pageBreakInserts(): BlockInsertItem[] {
	return [
		{
			id: 'pagebreak',
			label: m.drawn_chip_page_label(),
			icon: SeparatorHorizontal,
			category: 'common',
			shape: 'block',
			style: false,
			select: 'node',
			make: (s) => s.nodes.raw_latex.create(null, s.text('#pagebreak()'))
		}
	];
}
