// what the visual editor offers to insert, built per file from its language's plugins and the files it loads
import type { Node, Schema } from 'prosemirror-model';
import type { Command } from 'prosemirror-state';
import type { Component } from 'svelte';

/** LyX's categories, in its order, then Typst's; `common` is the part every file gets, ahead of the rest */
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
	/** the title of its part when the category has none of its own: the package a Typst file imports */
	part?: string;
	/** the package or class it comes from */
	hint?: string;
};

export type BlockInsertItem = InsertItemBase & {
	shape: 'block';
	/** a style turns the paragraph at the caret into it; anything else goes in as a block of its own */
	style: boolean;
	make(schema: Schema): Node | null;
	/** 'in' puts the caret inside the new block, 'cell' in its first table cell, 'node' selects it, 'after' puts the caret in the text after it */
	select: 'in' | 'cell' | 'node' | 'after';
	/** turns the paragraph at the caret into it; without one a style takes the paragraph's words into the first
	 *  paragraph `make` gives */
	turn?: Command;
	/** tried before `turn`: changes the container that holds only the paragraph at the caret into this style */
	turnIn?: Command;
	/** the node is this style */
	is?(node: Node): boolean;
	/** the environment is a paragraph's style (a theorem, a callout) rather than a box: a style picked on its lone paragraph
	 *  changes it and Backspace at its start lifts the paragraph out */
	paragraphStyle?: boolean;
	/** it goes after a node this is true of, never inside it (Beamer takes no frame in a frame) */
	neverIn?(node: Node): boolean;
};

/** goes in among the words, holding the selected ones */
export type InlineInsertItem = InsertItemBase & { shape: 'inline'; source(selected: string | null): string };

export type InsertItem = BlockInsertItem | InlineInsertItem;

/** an optional argument the node at the caret does not have yet */
export type InsertArgument = {
	id: string;
	label: string;
	/** asks for its text first */
	asks: boolean;
	/** writes it into the node at `pos`, the text asked for in `value` */
	run(value: string, pos: number): Command;
};

/** an argument of a node around the caret, bound to that node */
export type CaretArgument = Omit<InsertArgument, 'run'> & { run(value: string): Command };
