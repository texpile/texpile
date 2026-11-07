import { Code } from '@lucide/svelte';
import type { LatexInsertContext, LatexInsertOffer } from '$lib/languages/latex/visual/core';
import { m } from '$lib/paraglide/messages';

export function verbatimInserts(ctx: LatexInsertContext): LatexInsertOffer[] {
	return [
		{
			id: 'verbatim',
			label: m.blockmenu_code_block(),
			icon: Code,
			category: 'common',
			shape: 'block',
			style: false,
			select: 'in',
			make: (s) => s.nodes.code_block.createAndFill(),
			covers: ctx.environments().flatMap((e) => (e.body === 'verbatim' || e.body === 'literal' ? [e.name] : []))
		}
	];
}
