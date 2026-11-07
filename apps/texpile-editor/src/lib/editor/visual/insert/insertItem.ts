import type { Node, Schema } from 'prosemirror-model';
import type { Command } from 'prosemirror-state';
import type { Component } from 'svelte';

export const INSERT_CATEGORIES = [
	'common',
	'mainText',
	'sectioning',
	'unnumbered',
	'lists',
	'frontMatter',
	'titling',
	'frames',
	'blocks',
	'columns',
	'overlays',
	'theorems',
	'backMatter',
	'floats',
	'math',
	'environments',
	'textStyles',
	'text',
	'thisFile',
	'package',
	'layout'
] as const;

export type InsertCategory = (typeof INSERT_CATEGORIES)[number];

type InsertItemBase = {
	/** unique in its list: the name it writes, `section*`, `env:lemma` */
	id: string;
	label: string;
	icon: Component;
	category: InsertCategory;
	part?: string;
	hint?: string;
};

export type BlockInsertItem = InsertItemBase & {
	shape: 'block';
	/** a style turns the paragraph at the caret into it; anything else goes in as a block of its own */
	style: boolean;
	make(schema: Schema): Node | null;
	/** 'in' puts the caret inside the new block, 'cell' in its first table cell, 'node' selects it, 'after' puts the caret in the text after it */
	select: 'in' | 'cell' | 'node' | 'after';
	turn?: Command;
	/** tried before `turn`: changes the container that holds only the paragraph at the caret into this style */
	turnIn?: Command;
	is?(node: Node): boolean;
	/** the environment is a paragraph's style (a theorem, a callout) rather than a box */
	paragraphStyle?: boolean;
	/** it goes after a node this is true of, never inside it (Beamer takes no frame in a frame) */
	neverIn?(node: Node): boolean;
};

export type InlineInsertItem = InsertItemBase & { shape: 'inline'; source(selected: string | null): string };

export type InsertItem = BlockInsertItem | InlineInsertItem;

export type InsertArgument = {
	id: string;
	label: string;
	asks: boolean;
	run(value: string, pos: number): Command;
};

export type CaretArgument = Omit<InsertArgument, 'run'> & { run(value: string): Command };
