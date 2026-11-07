import { MoveVertical } from '@lucide/svelte';
import type { BlockInsertItem } from '$lib/languages/typst/visual/core';
import { m } from '$lib/paraglide/messages';

export function spacingInserts(): BlockInsertItem[] {
	return [
		{
			id: 'vspace',
			label: m.drawn_chip_space_vertical(),
			icon: MoveVertical,
			category: 'common',
			shape: 'block',
			style: false,
			select: 'node',
			make: (s) => s.nodes.raw_latex.create(null, s.text('#v(1em)'))
		}
	];
}
