// quote and quotation, and verse beside them in the main text as LyX has it
import { Quote, TextQuote } from '@lucide/svelte';
import type { LatexInsertContext, LatexInsertOffer } from '$lib/languages/latex/visual/core';
import { m } from '$lib/paraglide/messages';

function quoteOffer(name: 'quote' | 'quotation', label: string): LatexInsertOffer {
	const env = name === 'quotation' ? 'quotation' : null;
	return {
		id: name,
		label,
		icon: Quote,
		category: 'mainText',
		shape: 'block',
		style: true,
		select: 'in',
		make: (s) => s.nodes.blockquote.create(env ? { env } : null, s.nodes.paragraph.create()),
		is: (node) => node.type.name === 'blockquote' && (node.attrs.env ?? null) === env,
		covers: [name]
	};
}

const verse: LatexInsertOffer = {
	id: 'verse',
	label: m.insert_style_verse(),
	icon: TextQuote,
	category: 'mainText',
	shape: 'block',
	style: true,
	select: 'in',
	make: (s) => s.nodes.environment.create({ name: 'verse' }, s.nodes.paragraph.create()),
	is: (node) => node.type.name === 'environment' && node.attrs.name === 'verse',
	covers: ['verse']
};

export function quoteInserts(ctx: LatexInsertContext): LatexInsertOffer[] {
	return [
		...(ctx.environment('quote') ? [quoteOffer('quote', m.blockmenu_quote())] : []),
		...(ctx.environment('quotation') ? [quoteOffer('quotation', m.insert_style_quotation())] : []),
		...(ctx.environment('verse') ? [verse] : [])
	];
}
