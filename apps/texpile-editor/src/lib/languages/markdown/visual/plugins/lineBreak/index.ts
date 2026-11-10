import type { SyntaxNode } from '@lezer/common';
import {
	HARD_BREAK,
	noteSpans,
	sliceOf,
	stands,
	type LineState,
	type MarkdownPlugin,
	type PmMark,
	type PmNode,
	type Reader
} from '$lib/languages/markdown/visual/core';

function readHardBreak(r: Reader, node: SyntaxNode, _marks: PmMark[], st: LineState): PmNode[] {
	st.startLine();
	return [noteSpans(r.node('hard_break', { lineBreak: true }), stands(r, node, 1))];
}

function readBreakTag(r: Reader, node: SyntaxNode): PmNode[] | null {
	if (!/^<br\s*\/?>$/i.test(sliceOf(r, node))) return null;
	return [noteSpans(r.node('hard_break', { lineBreak: true, command: 'br' }), stands(r, node, 1))];
}

export const lineBreak: MarkdownPlugin = {
	import: { inline: { HardBreak: readHardBreak, HTMLTag: readBreakTag } },
	save: {
		inline: {
			hard_break(node, core) {
				const br = core.singleLine || core.inTableCell || node.attrs?.command === 'br';
				return { content: core.shadowed(node, br ? '<br>' : HARD_BREAK), marks: [], isText: false, startsLine: !br };
			}
		}
	}
};
