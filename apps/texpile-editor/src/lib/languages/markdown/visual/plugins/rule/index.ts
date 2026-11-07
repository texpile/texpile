import type { SyntaxNode } from '@lezer/common';
import { blockStands, noteSpans, type MarkdownPlugin, type PmNode, type Reader } from '$lib/languages/markdown/visual/core';

function readRule(r: Reader, node: SyntaxNode): PmNode[] {
	return [noteSpans(r.node('horizontal_rule'), blockStands(r, node))];
}

export const rule: MarkdownPlugin = {
	import: { blocks: { HorizontalRule: readRule } },
	save: {
		nodes: { horizontal_rule: () => '---\n\n' },
		wholeRun: (node) => node.type.name === 'horizontal_rule'
	}
};
