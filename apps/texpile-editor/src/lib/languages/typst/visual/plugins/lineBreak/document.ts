import type { SyntaxNode } from '@lezer/common';
import { hasSyntaxError } from '$lib/languages/typst/knowledge/scan/syntax';
import {
	children,
	identName,
	noteSpans,
	standsFor,
	type PmMark,
	type TypstDocumentPlugin,
	type TypstImport
} from '$lib/languages/typst/visual/core/document';

/** `\` at a line's end: the break, and the space after it when it is on the same line */
function lineBreak(im: TypstImport, nodes: SyntaxNode[], i: number, marks: PmMark[]) {
	const k = nodes[i];
	const out = [noteSpans(im.core.node('hard_break', { lineBreak: true }), standsFor(1, k.from, k.to))];
	// the newline ending the broken line is part of the break, not a leading space
	// on the continuation; a same-line space after `\` is real text
	const sp = nodes[i + 1];
	if (sp?.name !== 'Space') return { nodes: out, next: i + 1 };
	if (!/[\r\n]/.test(im.src.slice(sp.from, sp.to))) out.push(...im.core.texts(' ', marks, standsFor(1, sp.from, sp.to)));
	return { nodes: out, next: i + 2 };
}

/** `#linebreak()` and `#linebreak(justify: true)`: the call as written */
function lineBreakCall(im: TypstImport, hash: SyntaxNode, call: SyntaxNode) {
	if (identName(call, im.src) !== 'linebreak' || hasSyntaxError(call)) return null;
	const args = call.lastChild;
	const kids = args?.name === 'Args' ? children(args) : [];
	if (kids[0]?.name !== 'LeftParen' || kids[kids.length - 1].name !== 'RightParen') return null;
	const typCall = im.src.slice(call.from, call.to);
	return [noteSpans(im.core.node('hard_break', { lineBreak: true, typCall }), standsFor(1, hash.from, call.to))];
}

export const lineBreakDocument: TypstDocumentPlugin = {
	import: { markup: { inline: { Linebreak: lineBreak } }, calls: { elements: { linebreak: lineBreakCall } } },
	// typCall: a break the file wrote as `#linebreak(..)`, as written
	schema: ({ nodes, marks }) => {
		const hardBreak = nodes.get('hard_break')!;
		return { nodes: nodes.update('hard_break', { ...hardBreak, attrs: { ...hardBreak.attrs, typCall: { default: null } } }), marks };
	},
	save: {
		inline: {
			hard_break(node, run) {
				if (node.attrs?.lineBreak === false) return null; // legacy no-op break
				if (typeof node.attrs.typCall === 'string')
					return { content: run.shadowed(node, '#' + node.attrs.typCall), marks: [], kind: 'other' };
				return { content: run.shadowed(node, run.singleLine ? '\\ ' : '\\\n'), marks: [], kind: 'break', startsLine: !run.singleLine };
			}
		},
		// a paragraph of nothing but line breaks is blank; one written as #linebreak(..) is not
		blank: (node) => node.type.name === 'hard_break' && !node.attrs.typCall
	}
};
