import { Columns2, Highlighter, Layers, Pause, Presentation, SquareStack } from '@lucide/svelte';
import type { Node, Schema } from 'prosemirror-model';
import type { Component } from 'svelte';
import {
	argumentSlots,
	renameEnvironment,
	type BlockInsertItem,
	type LatexInsertContext,
	type LatexInsertOffer
} from '$lib/languages/latex/visual/core';
import { m } from '$lib/paraglide/messages';

type Made = Pick<BlockInsertItem, 'turnIn' | 'neverIn' | 'paragraphStyle'> & {
	id: string;
	label: string;
	icon: Component;
	category: LatexInsertOffer['category'];
	make(s: Schema): Node;
	is(node: Node): boolean;
};

function style(made: Made, hint: string | undefined): LatexInsertOffer {
	return { ...made, hint, shape: 'block', style: true, select: 'in' };
}

function block(kind: string, label: string): Made {
	return {
		id: kind,
		label,
		icon: SquareStack,
		category: 'blocks',
		make: (s) => s.nodes.beamer_block.create({ kind }, [s.nodes.beamer_block_title.create(), s.nodes.paragraph.create()]),
		is: (node) => node.type.name === 'beamer_block' && node.attrs.kind === kind
	};
}

function overlayEnvironment(name: string, label: string, ctx: LatexInsertContext): Made {
	const args = argumentSlots(ctx.environment(name)?.args?.filter((a) => a.kind !== 'd<>'));
	return {
		id: name,
		label,
		icon: Layers,
		category: 'overlays',
		paragraphStyle: name === 'onlyenv' || name === 'uncoverenv',
		turnIn: renameEnvironment(name, args),
		make: (s) => s.nodes.environment.create({ name, args }, s.nodes.paragraph.create()),
		is: (node) => node.type.name === 'environment' && node.attrs.name === name
	};
}

const FRAME: Made = {
	id: 'frame',
	label: m.insert_beamer_frame(),
	icon: Presentation,
	category: 'frames',
	neverIn: (node) => node.type.name === 'frame',
	make: (s) => s.nodes.frame.create({ form: 'env' }, s.nodes.paragraph.create()),
	is: (node) => node.type.name === 'frame'
};

const COLUMNS: Made = {
	id: 'columns',
	label: m.insert_beamer_columns(),
	icon: Columns2,
	category: 'columns',
	make: (s) =>
		s.nodes.columns.create(
			null,
			[0, 1].map(() => s.nodes.column.create({ width: '0.5\\textwidth' }, s.nodes.paragraph.create()))
		),
	is: (node) => node.type.name === 'columns'
};

const CHARACTER_STYLES: [string, () => string][] = [
	['alert', m.insert_beamer_alert],
	['structure', m.insert_beamer_structure],
	['only', m.insert_beamer_only],
	['uncover', m.insert_beamer_uncover],
	['visible', m.insert_beamer_visible],
	['invisible', m.insert_beamer_invisible]
];

function characterStyle(name: string, label: string, hint: string | undefined): LatexInsertOffer {
	return {
		id: `\\${name}`,
		label,
		icon: Highlighter,
		category: 'textStyles',
		hint,
		shape: 'inline',
		source: (words) => `\\${name}{${words ?? ''}}`
	};
}

const PAUSE: LatexInsertOffer = {
	id: '\\pause',
	label: m.insert_beamer_pause(),
	icon: Pause,
	category: 'overlays',
	shape: 'inline',
	source: () => '\\pause'
};

const COVERS = ['frame', 'block', 'alertblock', 'exampleblock', 'columns', 'column', 'overprint', 'overlayarea', 'uncoverenv', 'onlyenv'];

export function slideInserts(ctx: LatexInsertContext): LatexInsertOffer[] {
	const frame = ctx.environment('frame');
	if (frame?.args?.[0]?.kind !== 'd<>') return [];
	const hint = ctx.hint(frame);
	function has(name: string): boolean {
		return !!ctx.environment(name);
	}
	const made: Made[] = [
		FRAME,
		...(
			[
				['block', m.insert_beamer_block()],
				['alertblock', m.insert_beamer_alertblock()],
				['exampleblock', m.insert_beamer_exampleblock()]
			] as const
		).flatMap(([kind, label]) => (has(kind) ? [block(kind, label)] : [])),
		...(has('columns') ? [COLUMNS] : []),
		...(
			[
				['overprint', m.insert_beamer_overprint()],
				['overlayarea', m.insert_beamer_overlayarea()],
				['uncoverenv', m.insert_beamer_uncover()],
				['onlyenv', m.insert_beamer_only()]
			] as const
		).flatMap(([name, label]) => (has(name) ? [overlayEnvironment(name, label, ctx)] : []))
	];
	const characters = CHARACTER_STYLES.filter(([name]) => ctx.command(name)).map(([name, label]) => characterStyle(name, label(), hint));
	const covers = [...COVERS, ...CHARACTER_STYLES.map(([name]) => `\\${name}`), '\\pause'];
	return [...made.map((x) => style(x, hint)), ...(ctx.command('pause') ? [{ ...PAUSE, hint }] : []), ...characters].map((offer) => ({
		...offer,
		covers
	}));
}
