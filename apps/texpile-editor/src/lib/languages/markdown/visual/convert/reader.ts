import type { SyntaxNode } from '@lezer/common';
import type { PmMark, PmNode } from '../builders';
import type { LeafSpan } from '$lib/editor/visual/sourceSpans';
import type { SourceText } from './sourceText';

export type Definition = { href: string; title: string | null };

export type LinePrefix = { quote: true } | { quote: false; width: number };

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
	blocks(r: Reader, kids: SyntaxNode[]): PmNode[];
	inline(r: Reader, kids: SyntaxNode[], from: number, to: number, marks: PmMark[], st: LineState): PmNode[];
	gap(r: Reader, from: number, to: number, marks: PmMark[], st: LineState): PmNode[];
	raw(r: Reader, lang: 'html' | 'markdown', node: SyntaxNode): PmNode[];
	node(type: string, attrs?: Record<string, unknown> | null, content?: ReadonlyArray<PmNode | null | undefined> | null): PmNode;
	texts(text: string, marks?: PmMark[] | null, spans?: LeafSpan[] | null): PmNode[];
	withMarks(node: PmNode, marks: PmMark[]): PmNode;
	chip(lang: 'html' | 'markdown', text: string, spans: LeafSpan[] | null, marks: PmMark[]): PmNode[];
	ensureBlocks(blocks: PmNode[]): PmNode[];
	prefixes: readonly LinePrefix[];
	baseColumn: number;
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

export function normalizeLabel(label: string): string {
	return label.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function trimmedEnd(r: Reader, from: number, to: number): number {
	let end = to;
	while (end > from && /\s/.test(r.src.text[end - 1])) end--;
	return end;
}

export function readContent(r: Reader, node: SyntaxNode, from = node.from, atStart = false): PmNode[] {
	return r.inline(r, childrenOf(node), from, trimmedEnd(r, from, node.to), [], new LineState(atStart));
}

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
