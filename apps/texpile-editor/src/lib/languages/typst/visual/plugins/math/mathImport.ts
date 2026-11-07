// math: `$x$` inline, `$ x $` and `#math.equation(block: true, ..)` displayed, the trailing <label> the equation's
import type { SyntaxNode } from '@lezer/common';
import { hasSyntaxError } from '$lib/languages/typst/knowledge/scan/syntax';
import {
	equationInner,
	isDisplayEquation,
	labelGapOf,
	noteSpans,
	standsFor,
	type PmMark,
	type PmNode,
	type TypstImport,
	type TypstSeg
} from '$lib/languages/typst/visual/core/document';

export function displayMath(im: TypstImport, kids: SyntaxNode[], i: number): { seg: TypstSeg; next: number } | null {
	const src = im.src;
	const k = kids[i];
	if (!isDisplayEquation(k)) return null;
	let j = i + 1;
	while (kids[j]?.name === 'Space') j++;
	const labelNode = kids[j]?.name === 'Label' ? kids[j] : null;
	const after = labelNode ? j + 1 : i + 1;
	const inner = equationInner(k, src).trim();
	const to = (labelNode ?? k).to;
	if (inner && !hasSyntaxError(k)) {
		const equation = im.core.node(
			'block_math',
			{
				label: labelNode ? src.slice(labelNode.from + 1, labelNode.to - 1) : null,
				labelGap: labelGapOf(src, k.to, labelNode),
				numbered: false,
				environment: null,
				lineLabels: []
			},
			im.core.texts(inner)
		);
		return { seg: { blocks: [noteSpans(equation, standsFor(1, k.from, to))], from: k.from, to }, next: after };
	}
	return { seg: { blocks: [im.core.raw(src.slice(k.from, to), k.from)], from: k.from, to }, next: after };
}

export function inlineMath(im: TypstImport, nodes: SyntaxNode[], i: number, marks: PmMark[]): { nodes: PmNode[]; next: number } | null {
	const k = nodes[i];
	const inner = equationInner(k, im.src);
	if (!inner.trim() || hasSyntaxError(k)) return null;
	const math = noteSpans(im.core.node('inline_math', null, im.core.texts(inner)), standsFor(1, k.from, k.to));
	return { nodes: [im.core.withMarks(math, marks)], next: i + 1 };
}
