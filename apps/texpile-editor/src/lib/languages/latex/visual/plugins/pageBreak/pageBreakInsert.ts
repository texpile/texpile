import { SeparatorHorizontal } from '@lucide/svelte';
import type { LatexInsertOffer } from '$lib/languages/latex/visual/core';
import { m } from '$lib/paraglide/messages';

export function pageBreakInserts(): LatexInsertOffer[] {
	return [
		{
			id: 'newpage',
			label: m.drawn_chip_page_label(),
			icon: SeparatorHorizontal,
			category: 'common',
			shape: 'block',
			style: false,
			select: 'after',
			make: (s) => s.nodes.raw_latex.create(null, s.text('\\newpage'))
		}
	];
}
