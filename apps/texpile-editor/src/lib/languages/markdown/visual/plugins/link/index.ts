import type { SyntaxNode } from '@lezer/common';
import {
	autolinkHref,
	bytes,
	childNamed,
	formatLinkDest,
	formatLinkTitle,
	isLiteralAutolink,
	noteSpans,
	sliceOf,
	stands,
	standsFor,
	targetOf,
	textOf,
	unresolved,
	type LineState,
	type MarkdownPlugin,
	type PmMark,
	type PmNode,
	type Reader
} from '$lib/languages/markdown/visual/core';

function readLink(r: Reader, node: SyntaxNode, marks: PmMark[], st: LineState): PmNode[] {
	const target = targetOf(r, node);
	if (!target) return unresolved(r, node, marks, st);
	if (target.to === target.from) {
		const literal = `[](${formatLinkDest(target.href)}${formatLinkTitle(target.title ?? '')})`;
		return r.chip('markdown', literal, stands(r, node, literal.length), marks);
	}
	const mark: PmMark = { type: 'link', attrs: { href: target.href, title: target.title || null, bare: false } };
	return r.inline(r, textOf(node), target.from, target.to, [...marks, mark], st);
}

function readAutolink(r: Reader, node: SyntaxNode, marks: PmMark[]): PmNode[] {
	const url = childNamed(node, 'URL');
	if (!url) return [];
	const text = sliceOf(r, url);
	const mark: PmMark = { type: 'link', attrs: { href: autolinkHref(text), title: null, bare: true } };
	return r.texts(text, [...marks, mark], bytes(r, url.from, text));
}

function urlEnd(text: string, from: number, to: number): number {
	if (!/^(?:https?:\/\/|www\.|ftp:\/\/)/i.test(text.slice(from, to))) return to;
	let end = to;
	function count(ch: string): number {
		return text.slice(from, end).split(ch).length - 1;
	}
	while (end > from && (/[?!.,:*_~'"]/.test(text[end - 1]) || (text[end - 1] === ')' && count(')') > count('(')))) end--;
	return end;
}

function readUrl(r: Reader, node: SyntaxNode, marks: PmMark[], st: LineState, to: number): PmNode[] | { nodes: PmNode[]; next: number } {
	if (marks.some((m) => m.type === 'link')) return r.texts(sliceOf(r, node), marks, bytes(r, node.from, sliceOf(r, node)));
	const breaks = node.to < to && r.src.text[node.to - 1] === '\\' && r.src.text[node.to] === '\n';
	const stop = breaks ? node.to - 1 : node.to;
	const end = urlEnd(r.src.text, node.from, stop);
	const text = r.src.text.slice(node.from, end);
	const mark: PmMark = { type: 'link', attrs: { href: autolinkHref(text), title: null, bare: 'literal' } };
	const nodes = r.texts(text, [...marks, mark], bytes(r, node.from, text));
	if (end < stop) nodes.push(...r.gap(r, end, stop, marks, st));
	if (!breaks) return nodes;
	st.startLine();
	nodes.push(noteSpans(r.node('hard_break', { lineBreak: true }), standsFor(1, r.src.at(stop), r.src.at(node.to + 1))));
	return { nodes, next: node.to + 1 };
}

export const link: MarkdownPlugin = {
	import: { inline: { Link: readLink, Autolink: readAutolink, URL: readUrl } },
	save: {
		marks: {
			link(mark, inTableCell) {
				const title = formatLinkTitle(mark.attrs.title == null ? '' : String(mark.attrs.title), inTableCell);
				return { open: '[', close: `](${formatLinkDest(String(mark.attrs.href ?? ''), inTableCell)}${title})` };
			}
		},
		text(node, core, around) {
			const mark = node.marks.find((m) => m.type.name === 'link');
			if (!mark?.attrs?.bare || mark.attrs.title) return null;
			const href = String(mark.attrs.href ?? '');
			const text = node.text ?? '';
			let written: string | null;
			if (mark.attrs.bare === 'literal') written = isLiteralAutolink(text, href, around.before, around.after) ? text : null;
			else written = text === href && !/[\s<>]/.test(href) ? `<${href}>` : null;
			if (written === null) return null;
			return { content: core.shadowed(node, written), marks: core.marks(node.marks.filter((m) => m.type.name !== 'link')), isText: false };
		}
	}
};
