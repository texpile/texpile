import type { SyntaxNode } from '@lezer/common';
import { bytes, sliceOf, type MarkdownPlugin, type PmMark, type PmNode, type Reader } from '$lib/languages/markdown/visual/core';

// the label of a reference and the lines of a definition are kept as written: whether or not the definition is in the
// file, the reference stays as it was drawn, and bringing the definition back makes it a footnote again
function readReference(r: Reader, node: SyntaxNode, marks: PmMark[]): PmNode[] {
	const text = sliceOf(r, node);
	return r.chip('markdown', text, bytes(r, node.from, text), marks);
}

export const footnote: MarkdownPlugin = {
	import: { blocks: { FootnoteDefinition: (r, node) => r.raw(r, 'markdown', node) }, inline: { FootnoteReference: readReference } }
};
