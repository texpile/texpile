// the section levels the class has, numbered and starred, as styles a paragraph turns into
import { BookMarked, BookOpen, Heading1, Heading2, Heading3, Heading4, Heading5 } from '@lucide/svelte';
import type { Component } from 'svelte';
import type { Command } from 'prosemirror-state';
import { commonFacts } from '$lib/languages/latex/knowledge/commands/commandFacts';
import type { Node } from 'prosemirror-model';
import type { InsertArgument, LatexArgumentContext, LatexInsertContext, LatexInsertOffer } from '$lib/languages/latex/visual/core';
import { m } from '$lib/paraglide/messages';

type Level = { name: string; level: number; command: string | null; label: () => string; icon: Component };

// the editor's level of each command; \chapter and \part keep their command at level 1
const LEVELS: Level[] = [
	{ name: 'part', level: 1, command: 'part', label: m.insert_heading_part, icon: BookMarked },
	{ name: 'chapter', level: 1, command: 'chapter', label: m.insert_heading_chapter, icon: BookOpen },
	{ name: 'section', level: 1, command: null, label: m.tbar_heading_section, icon: Heading1 },
	{ name: 'subsection', level: 2, command: null, label: m.tbar_heading_subsection, icon: Heading2 },
	{ name: 'subsubsection', level: 3, command: null, label: m.tbar_heading_subsubsection, icon: Heading3 },
	{ name: 'paragraph', level: 4, command: null, label: m.insert_heading_paragraph, icon: Heading4 },
	{ name: 'subparagraph', level: 5, command: null, label: m.insert_heading_subparagraph, icon: Heading5 }
];

/** sets the textblock at the caret to the heading, keeping its short title while it stays numbered */
function headingStyle(level: Level, numbered: boolean): Command {
	return (state, dispatch) => {
		const { $from } = state.selection;
		const block = $from.parent;
		if (!block.isTextblock || (block.type.name !== 'paragraph' && block.type.name !== 'heading')) return false;
		const kept = block.type.name === 'heading' && numbered ? (block.attrs.shortTitle ?? null) : null;
		const attrs = {
			...(block.type.name === 'heading' ? block.attrs : {}),
			level: level.level,
			numbered,
			command: level.command,
			shortTitle: kept
		};
		dispatch?.(state.tr.setBlockType($from.before(), $from.after(), state.schema.nodes.heading, attrs).scrollIntoView());
		return true;
	};
}

function offer(level: Level, numbered: boolean): LatexInsertOffer {
	const label = level.label();
	return {
		id: numbered ? level.name : `${level.name}*`,
		label: numbered ? label : `${label}*`,
		icon: level.icon,
		category: numbered ? 'sectioning' : 'unnumbered',
		shape: 'block',
		style: true,
		select: 'in',
		neverIn: (node) => node.type.name === 'frame',
		make: (s) => s.nodes.heading.create({ level: level.level, numbered, command: level.command }),
		turn: headingStyle(level, numbered),
		is: (node) =>
			node.type.name === 'heading' &&
			node.attrs.level === level.level &&
			(node.attrs.command ?? null) === level.command &&
			(node.attrs.numbered !== false) === numbered
	};
}

/** the levels the loaded files define, by their level; a level the class leaves unstated reads as most classes have it */
export function headingInserts(ctx: LatexInsertContext): LatexInsertOffer[] {
	const loaded = LEVELS.flatMap((level) => {
		const command = ctx.command(level.name);
		const section = command?.section ?? commonFacts(level.name).section;
		return command && section != null ? [{ level, section, starred: command.starred }] : [];
	}).sort((a, b) => a.section - b.section);
	return [...loaded.map((l) => offer(l.level, true)), ...loaded.filter((l) => l.starred).map((l) => offer(l.level, false))];
}

const COMMAND_OF: Record<number, string> = { 1: 'section', 2: 'subsection', 3: 'subsubsection', 4: 'paragraph', 5: 'subparagraph' };

/** a numbered heading's short title, where its command takes one */
export function headingArguments(node: Node, _pos: number, ctx: LatexArgumentContext): InsertArgument[] {
	if (node.type.name !== 'heading' || node.attrs.numbered === false || node.attrs.shortTitle) return [];
	const command = (node.attrs.command as string | null) ?? COMMAND_OF[Number(node.attrs.level)];
	if (!command || !ctx.commandArgs(command).some((a) => a.kind === 'o')) return [];
	return [
		{
			id: 'shortTitle',
			label: m.insert_argument_short_title(),
			asks: true,
			run: (value, pos) => (state, dispatch) => {
				dispatch?.(state.tr.setNodeAttribute(pos, 'shortTitle', value));
				return true;
			}
		}
	];
}
