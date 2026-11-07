// lists: one list node per item, the items of a Markdown list sharing their marker
import type { SyntaxNode } from '@lezer/common';
import {
	childrenOf,
	contentEnd,
	LineState,
	nestedSpan,
	noteBlockSpan,
	trimmedEnd,
	type PmNode,
	type Reader
} from '$lib/languages/markdown/visual/core';

const TASK_BOX = /^\[([ xX])\](?=[ \t\n]|$)/;

/** a blank line between two items, or between two blocks of one, makes a list loose */
function isLoose(r: Reader, items: SyntaxNode[]): boolean {
	function apart(before: SyntaxNode, after: SyntaxNode): boolean {
		return /\n[^\n]*\n/.test(r.src.text.slice(contentEnd(r, before), after.from));
	}
	for (let i = 1; i < items.length; i++) if (apart(items[i - 1], items[i])) return true;
	return items.some((item) => {
		const blocks = childrenOf(item).filter((k) => k.name !== 'ListMark' && k.name !== 'QuoteMark');
		return blocks.some((block, i) => i > 0 && apart(blocks[i - 1], block));
	});
}

/** the task box an item opens with, read from the source so an escaped `\[x\]` is not one */
function taskBoxOf(r: Reader, first: SyntaxNode | undefined): RegExpExecArray | null {
	if (!first || (first.name !== 'Paragraph' && first.name !== 'Task')) return null;
	return TASK_BOX.exec(r.src.text.slice(first.from, first.from + 4));
}

function itemColumn(r: Reader, mark: SyntaxNode, first: SyntaxNode | undefined): number {
	const lineStart = r.src.lineStart(mark.from);
	if (first && first.from <= r.src.lineEnd(mark.from)) return first.from - lineStart;
	return mark.to - lineStart + 1;
}

function readItem(r: Reader, item: SyntaxNode, attrs: Record<string, unknown>): PmNode {
	const kids = childrenOf(item);
	const mark = kids[0];
	const content = kids.filter((k) => k.name !== 'ListMark');
	const first = content.find((k) => k.name !== 'QuoteMark');
	const column = itemColumn(r, mark, first);
	const inner: Reader = { ...r, prefixes: [...r.prefixes, { quote: false, width: column - r.baseColumn }], baseColumn: column };
	const box = taskBoxOf(r, first);
	const text = r.src.text;
	let blocks: PmNode[];
	let checked: boolean | null = null;
	if (first && box) {
		// the paragraph holds what follows the box, and its bytes the box too
		let from = first.from + 3;
		const to = trimmedEnd(r, first.from, first.to);
		while (from < to && /\s/.test(text[from])) from++;
		const kidsAfter = content.slice(content.indexOf(first) + 1);
		const paragraph = r.node('paragraph', { indent: 'auto' }, r.inline(inner, childrenOf(first), from, to, [], new LineState(true)));
		const span = from < to ? nestedSpan(r, first) : { srcFrom: r.src.at(from), srcTo: r.src.at(from), size: 1 };
		blocks = [noteBlockSpan(paragraph, span), ...r.blocks(inner, kidsAfter)];
		checked = box[1] !== ' ';
	} else if (first) blocks = r.blocks(inner, content);
	else {
		// an item with nothing in it gets a paragraph of its own, standing after the marker on its line
		let at = mark.to;
		while (text[at] === ' ' || text[at] === '\t') at++;
		blocks = [noteBlockSpan(r.node('paragraph'), { srcFrom: r.src.at(at), srcTo: r.src.at(at), size: 1 })];
	}
	return r.node('list', { ...attrs, kind: checked != null ? 'task' : attrs.kind, checked }, blocks);
}

export function readList(r: Reader, node: SyntaxNode): PmNode[] {
	const ordered = node.name === 'OrderedList';
	const items = childrenOf(node).filter((k) => k.name === 'ListItem');
	const firstMark = items[0].firstChild!;
	const start = ordered ? parseInt(r.src.text.slice(firstMark.from, firstMark.to), 10) : null;
	// the delimiter as written, which tells two adjacent lists apart
	const written = r.src.text.slice(firstMark.from, firstMark.to);
	const marker = ordered ? written.slice(-1) : written;
	const loose = isLoose(r, items);
	return items.map((item, i) =>
		readItem(r, item, {
			kind: ordered ? 'ordered' : 'bullet',
			// flat-list reads `order` on the first node of an ordered run only
			order: ordered ? (i === 0 ? start : 1) : null,
			checked: null,
			collapsed: false,
			preBody: null,
			marker,
			loose
		})
	);
}
