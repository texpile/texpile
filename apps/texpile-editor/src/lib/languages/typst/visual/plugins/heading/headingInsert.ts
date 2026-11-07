import { Heading1, Heading2, Heading3, Heading4, Heading5 } from '@lucide/svelte';
import type { Command } from 'prosemirror-state';
import type { BlockInsertItem } from '$lib/languages/typst/visual/core';
import { m } from '$lib/paraglide/messages';

const ICONS = [Heading1, Heading2, Heading3, Heading4, Heading5];

/** the textblock at the caret as a heading of `level`, keeping its label */
function headingStyle(level: number): Command {
	return (state, dispatch) => {
		const { $from } = state.selection;
		const block = $from.parent;
		if (block.type.name !== 'paragraph' && block.type.name !== 'heading') return false;
		const attrs = { ...(block.type.name === 'heading' ? block.attrs : {}), level };
		dispatch?.(state.tr.setBlockType($from.before(), $from.after(), state.schema.nodes.heading, attrs).scrollIntoView());
		return true;
	};
}

/** Typst numbers headings by a set rule, so a level is one style */
export function headingInserts(): BlockInsertItem[] {
	return ICONS.map((icon, i) => ({
		id: `heading:${i + 1}`,
		label: m.mdtoolbar_heading_n({ n: i + 1 }),
		icon,
		category: 'text',
		shape: 'block',
		style: true,
		select: 'in',
		make: (s) => s.nodes.heading.create({ level: i + 1 }),
		turn: headingStyle(i + 1),
		is: (node) => node.type.name === 'heading' && node.attrs.level === i + 1
	}));
}
