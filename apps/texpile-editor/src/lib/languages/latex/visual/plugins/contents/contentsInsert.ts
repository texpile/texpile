import { TableOfContents } from '@lucide/svelte';
import type { LatexInsertOffer } from '$lib/languages/latex/visual/core';
import { m } from '$lib/paraglide/messages';

export function contentsInserts(): LatexInsertOffer[] {
	return [
		{
			id: 'tableofcontents',
			label: m.drawn_chip_typst_outline_contents(),
			icon: TableOfContents,
			category: 'common',
			shape: 'block',
			style: false,
			select: 'after',
			make: (s) => s.nodes.raw_latex.create(null, s.text('\\tableofcontents'))
		}
	];
}
