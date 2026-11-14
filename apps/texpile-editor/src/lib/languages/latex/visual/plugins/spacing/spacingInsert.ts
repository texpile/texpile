import { MoveVertical } from '@lucide/svelte';
import type { LatexInsertOffer } from '$lib/languages/latex/visual/core';
import { m } from '$lib/paraglide/messages';

export function spacingInserts(): LatexInsertOffer[] {
	return [
		{
			id: 'medskip',
			label: m.drawn_chip_space_vertical(),
			icon: MoveVertical,
			category: 'common',
			shape: 'block',
			style: false,
			select: 'node',
			// a skip is read as a chip in a paragraph of its own
			make: (s) => s.nodes.paragraph.create(null, s.nodes.inline_latex.create(null, s.text('\\medskip')))
		}
	];
}
