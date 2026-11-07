// the pieces inline readers build their nodes from
import { buildNode, realMarks, textNodes, type PmMark, type PmNode } from '../builders';
import { noteSpans, spansOf, type LeafSpan } from '$lib/editor/visual/sourceSpans';

/** the node wearing `marks`, still knowing where it came from */
export function withMarks(node: PmNode, marks: PmMark[]): PmNode {
	return marks.length > 0 ? noteSpans(node.mark(realMarks(marks)), spansOf(node)) : node;
}

/** source kept as it is in a chip, wearing the marks around it */
export function chip(lang: 'html' | 'markdown', text: string, spans: LeafSpan[] | null, marks: PmMark[]): PmNode[] {
	return [withMarks(buildNode('inline_latex', { lang }, textNodes(text, null, spans)), marks)];
}
