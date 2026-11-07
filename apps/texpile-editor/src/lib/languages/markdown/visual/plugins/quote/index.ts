import type { SyntaxNode } from '@lezer/common';
import { childrenOf, type MarkdownPlugin, type PmNode, type Reader } from '$lib/languages/markdown/visual/core';

function readQuote(r: Reader, node: SyntaxNode): PmNode[] {
	const kids = childrenOf(node);
	const mark = kids.find((k) => k.name === 'QuoteMark');
	const column = mark ? mark.from - r.src.lineStart(mark.from) + (r.src.text[mark.from + 1] === ' ' ? 2 : 1) : r.baseColumn;
	const inner: Reader = { ...r, prefixes: [...r.prefixes, { quote: true }], baseColumn: column };
	return [r.node('blockquote', null, r.ensureBlocks(r.blocks(inner, kids)))];
}

export const quote: MarkdownPlugin = {
	import: { blocks: { Blockquote: readQuote } },
	save: {
		nodes: {
			blockquote(node, _ctx, core) {
				const inner = core.blocks(node);
				return (
					inner
						.split('\n')
						.map((l) => (l ? '> ' + l : '>'))
						.join('\n') + '\n\n'
				);
			}
		},
		interrupts: (node) => node.type.name === 'blockquote'
	}
};
