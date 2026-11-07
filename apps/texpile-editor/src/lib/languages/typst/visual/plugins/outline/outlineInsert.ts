import { TableOfContents } from '@lucide/svelte';
import type { BlockInsertItem } from '$lib/languages/typst/visual/core';
import { m } from '$lib/paraglide/messages';

export function outlineInserts(): BlockInsertItem[] {
	return [
		{
			id: 'outline',
			label: m.drawn_chip_typst_outline_contents(),
			icon: TableOfContents,
			category: 'common',
			shape: 'block',
			style: false,
			select: 'node',
			make: (s) => s.nodes.raw_latex.create(null, s.text('#outline()'))
		}
	];
}
