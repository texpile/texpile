import { FileText } from '@lucide/svelte';
import type { LatexInsertContext, LatexInsertOffer } from '$lib/languages/latex/visual/core';
import { m } from '$lib/paraglide/messages';

export function abstractInserts(ctx: LatexInsertContext): LatexInsertOffer[] {
	if (!ctx.environment('abstract')) return [];
	return [
		{
			id: 'abstract',
			label: m.blockmenu_abstract(),
			icon: FileText,
			category: 'frontMatter',
			shape: 'block',
			style: true,
			select: 'in',
			make: (s) => s.nodes.abstract.create({ sourceForm: 'env' }, s.nodes.paragraph.create()),
			is: (node) => node.type.name === 'abstract',
			covers: ['abstract']
		}
	];
}
