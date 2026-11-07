import { Calendar, Heading, Landmark, User } from '@lucide/svelte';
import type { Component } from 'svelte';
import type { Node } from 'prosemirror-model';
import type { Command } from 'prosemirror-state';
import { serializeToLatex, type LatexInsertContext, type LatexInsertOffer } from '$lib/languages/latex/visual/core';
import { endsInComment } from '$lib/languages/latex/visual/core/document';
import { m } from '$lib/paraglide/messages';

type TitlePart = { name: string; label: () => string; icon: Component };

const PARTS: TitlePart[] = [
	{ name: 'title', label: m.insert_title_title, icon: Heading },
	{ name: 'subtitle', label: m.insert_title_subtitle, icon: Heading },
	{ name: 'author', label: m.insert_title_author, icon: User },
	{ name: 'institute', label: m.insert_title_institute, icon: Landmark },
	{ name: 'date', label: m.insert_title_date, icon: Calendar }
];

function callOf(name: string, words: string): string {
	return `\\${name}{${words}${endsInComment(words) ? '\n' : ''}}`;
}

function wordsOf(paragraph: Node): string {
	return serializeToLatex(paragraph.type.schema.topNodeType.create(null, paragraph)).trim();
}

function titleStyle(name: string): Command {
	return (state, dispatch) => {
		const { $from } = state.selection;
		if ($from.parent.type.name !== 'paragraph') return false;
		const chip = state.schema.nodes.raw_latex.create(null, state.schema.text(callOf(name, wordsOf($from.parent))));
		dispatch?.(state.tr.replaceWith($from.before(), $from.after(), chip).scrollIntoView());
		return true;
	};
}

function offer(part: TitlePart): LatexInsertOffer {
	return {
		id: part.name,
		label: part.label(),
		icon: part.icon,
		category: 'frontMatter',
		shape: 'block',
		style: true,
		select: 'node',
		make: (s) => s.nodes.raw_latex.create(null, s.text(callOf(part.name, ''))),
		turn: titleStyle(part.name),
		is: (node) => node.type.name === 'raw_latex' && new RegExp(`^\\\\${part.name}\\s*[[{]`).test(node.textContent),
		covers: [`\\${part.name}`]
	};
}

export function titleInserts(ctx: LatexInsertContext): LatexInsertOffer[] {
	return PARTS.filter((part) => ctx.command(part.name)).map(offer);
}
