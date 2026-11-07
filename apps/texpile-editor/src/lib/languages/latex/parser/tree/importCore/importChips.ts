// the bytes of the source as text, a chip or a raw block
import { buildNode, realMarks, textNode, type ConversionContext, type PmNode } from '../../builders';
import { alignedSpans, bytesSpan, standsFor } from '$lib/editor/visual/sourceSpans';
import { sliceOf, type Span, type TreeImport } from './treeImport';

/** text read from `span`, mapped onto its bytes */
export function sourceText(im: TreeImport, text: string, span: Span, ctx: ConversionContext | null = null): PmNode | null {
	return textNode(text, ctx && ctx.marks.length ? ctx.marks : null, alignedSpans(text, span.from, sliceOf(im, span)));
}

/** the bytes of `span` as a chip, wearing the marks around it */
export function chipOf(im: TreeImport, span: Span, ctx?: ConversionContext, text = sliceOf(im, span)): PmNode {
	const chip = buildNode('inline_latex', null, [
		textNode(text, null, text === sliceOf(im, span) ? bytesSpan(text.length, span.from) : standsFor(text.length, span.from, span.to))
	]);
	return ctx && ctx.marks.length > 0 ? chip.mark(realMarks(ctx.marks)) : chip;
}

export function rawBlockOf(im: TreeImport, span: Span, text = sliceOf(im, span)): PmNode {
	return buildNode('raw_latex', null, [textNode(text, null, text === sliceOf(im, span) ? bytesSpan(text.length, span.from) : null)]);
}
