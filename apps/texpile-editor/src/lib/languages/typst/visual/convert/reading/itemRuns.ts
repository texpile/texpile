import type { SyntaxNode } from '@lezer/common';
import type { PmNode } from '../builders';
import type { TypstImport } from '../../core/plugin/typstDocumentPlugin';

type CommentBridge = {
	comments: string[];
	next: number;
};

/** `[Space] comment [Space] ... item`: comments between two items of one run. typst reads them as
 *  nothing, so they must not split the list; the caller keeps them on the preceding item. */
function bridgeComments(kids: SyntaxNode[], j: number, kindName: string, src: string): CommentBridge | null {
	const comments: string[] = [];
	let k = j;
	for (;;) {
		if (kids[k]?.name === 'Space') k++;
		const c = kids[k];
		if (!c || (c.name !== 'LineComment' && c.name !== 'BlockComment')) break;
		comments.push(src.slice(c.from, c.to));
		k++;
	}
	if (comments.length === 0) return null;
	if (kids[k]?.name === 'Space') k++;
	return kids[k]?.name === kindName ? { comments, next: k } : null;
}

export function itemRun(kids: SyntaxNode[], i: number, src: string): { items: SyntaxNode[]; trailing: string[][]; next: number } {
	const kindName = kids[i].name;
	const items: SyntaxNode[] = [kids[i]];
	const trailing: string[][] = [[]];
	let j = i + 1;
	while (j < kids.length) {
		const bridge = bridgeComments(kids, j, kindName, src);
		if (kids[j].name === kindName) {
			items.push(kids[j]);
			trailing.push([]);
			j++;
		} else if (kids[j].name === 'Space' && kids[j + 1]?.name === kindName) {
			j++;
		} else if (bridge) {
			trailing[trailing.length - 1].push(...bridge.comments);
			j = bridge.next;
		} else {
			break;
		}
	}
	return { items, trailing, next: j };
}

export function attachComments(im: TypstImport, blocks: PmNode[], comments: string[]): PmNode[] {
	if (comments.length === 0) return blocks;
	const last = blocks[blocks.length - 1];
	if (last && last.type.name === 'paragraph') {
		const content: PmNode[] = [];
		last.forEach((c) => content.push(c));
		for (const c of comments) content.push(...im.core.texts(' '), ...im.core.chip(c, []));
		return [...blocks.slice(0, -1), last.type.create(last.attrs, im.core.collapse(content), last.marks)];
	}
	return [...blocks, im.core.withGap(im.core.raw(comments.join('\n')), 'newline')];
}
