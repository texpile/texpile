// what the readers of one file share
import type { SyntaxNode } from '@lezer/common';
import type { PmMark, PmNode } from '../builders';
import type { LeafSpan } from '$lib/editor/visual/sourceSpans';
import type { SourceText } from './sourceText';

export type Definition = { href: string; title: string | null };

/** what a line of a container starts with: a quote's `>`, or the indentation of a list item's content */
export type LinePrefix = { quote: true } | { quote: false; width: number };

/** where in a line the reading is: leading spaces of a continuation line are not content */
export class LineState {
	atStart: boolean;

	constructor(atStart = false) {
		this.atStart = atStart;
	}

	startLine(): void {
		this.atStart = true;
	}

	inContent(): void {
		this.atStart = false;
	}
}

export type Reader = {
	src: SourceText;
	definitions: ReadonlyMap<string, Definition>;
	/** the blocks a container holds, each carrying the bytes it was read from */
	blocks(r: Reader, kids: SyntaxNode[]): PmNode[];
	/** the inline content between two offsets, its nodes `kids`, wearing `marks` */
	inline(r: Reader, kids: SyntaxNode[], from: number, to: number, marks: PmMark[], st: LineState): PmNode[];
	/** the source text between two offsets as text */
	gap(r: Reader, from: number, to: number, marks: PmMark[], st: LineState): PmNode[];
	/** a block kept as the source it was read from */
	raw(r: Reader, lang: 'html' | 'markdown', node: SyntaxNode): PmNode[];
	/** the nodes and text of the schema, built from the file's */
	node(type: string, attrs?: Record<string, unknown> | null, content?: ReadonlyArray<PmNode | null | undefined> | null): PmNode;
	texts(text: string, marks?: PmMark[] | null, spans?: LeafSpan[] | null): PmNode[];
	withMarks(node: PmNode, marks: PmMark[]): PmNode;
	/** source kept as it is in an inline chip, wearing the marks around it */
	chip(lang: 'html' | 'markdown', text: string, spans: LeafSpan[] | null, marks: PmMark[]): PmNode[];
	ensureBlocks(blocks: PmNode[]): PmNode[];
	/** the containers around the block being read, outermost first */
	prefixes: readonly LinePrefix[];
	/** the column the containers' content starts at */
	baseColumn: number;
	/** reading a table cell, where `\|` is a pipe even inside code and math */
	inCell?: boolean;
};

export function childrenOf(node: SyntaxNode): SyntaxNode[] {
	const out: SyntaxNode[] = [];
	for (let c = node.firstChild; c; c = c.nextSibling) out.push(c);
	return out;
}

export function childNamed(node: SyntaxNode, name: string): SyntaxNode | null {
	for (let c = node.firstChild; c; c = c.nextSibling) if (c.name === name) return c;
	return null;
}

export function sliceOf(r: Reader, node: SyntaxNode): string {
	return r.src.text.slice(node.from, node.to);
}

/** a reference label as definitions and references are matched */
export function normalizeLabel(label: string): string {
	return label.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** `to`, pulled back over the spaces and line breaks the content ends in */
export function trimmedEnd(r: Reader, from: number, to: number): number {
	let end = to;
	while (end > from && /\s/.test(r.src.text[end - 1])) end--;
	return end;
}

/** the inline content of `node`, its own syntax marks left out, from `from` */
export function readContent(r: Reader, node: SyntaxNode, from = node.from, atStart = false): PmNode[] {
	return r.inline(r, childrenOf(node), from, trimmedEnd(r, from, node.to), [], new LineState(atStart));
}

/** the text between two offsets of an inline construct as a reader sees it: a continuation line starts at its first word, and in a table `\\|` is a pipe */
export function innerText(r: Reader, node: SyntaxNode, from: number, to: number): string {
	let text = '';
	let at = from;
	for (const k of childrenOf(node)) {
		if (k.name !== 'QuoteMark' || k.from < from || k.to > to) continue;
		text += r.src.text.slice(at, k.from);
		at = k.to;
	}
	text += r.src.text.slice(at, to);
	text = text.replace(/\n[ \t]+/g, '\n');
	return r.inCell ? text.replace(/\\\|/g, '|') : text;
}
