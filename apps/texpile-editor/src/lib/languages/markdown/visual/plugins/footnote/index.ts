import type { SyntaxNode } from '@lezer/common';
import { bytes, sliceOf, type MarkdownPlugin, type PmMark, type PmNode, type Reader } from '$lib/languages/markdown/visual/core';

function readReference(r: Reader, node: SyntaxNode, marks: PmMark[]): PmNode[] {
	const text = sliceOf(r, node);
	return r.chip('markdown', text, bytes(r, node.from, text), marks);
}

export const footnote: MarkdownPlugin = {
	import: { blocks: { FootnoteDefinition: (r, node) => r.raw(r, 'markdown', node) }, inline: { FootnoteReference: readReference } }
};
