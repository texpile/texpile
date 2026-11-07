// `#figure(body, caption: [..])` around anything but an image or a table: a typ_figure holding the body's blocks, then
// the caption. Every other argument rides along as written (figureArgs.ts)
import type { SyntaxNode } from '@lezer/common';
import {
	aloneWithLabel,
	figureCall,
	figureCaption,
	labelGapOf,
	lineIndent,
	type FigureCall,
	type PmNode,
	type TypstImport,
	type TypstSeg
} from '$lib/languages/typst/visual/core/document';

type FigureAttrs = { label: string | null; labelGap: string | null; typIndent: string | null };

/** the blocks of a body that is neither an image nor a table, and whether it was code rather than a content block */
function figureBody(
	im: TypstImport,
	body: SyntaxNode
): { blocks: PmNode[]; code: boolean; bodyLead: string | null; bodyTrail: string | null } | null {
	if (body.name === 'ContentBlock') {
		const content = im.core.contentBody(body, im.src);
		return content ? { ...content, code: false } : null;
	}
	return { blocks: [im.core.codeBody(body, im.src)], code: true, bodyLead: null, bodyTrail: null };
}

function figureNode(im: TypstImport, fig: FigureCall, attrs: FigureAttrs): PmNode | null {
	const caption = figureCaption(im, fig.caption);
	const body = figureBody(im, fig.body);
	if (!body) return null;
	const captionNode = fig.caption ? [im.core.node('typ_figure_caption', { typString: fig.caption.name === 'Str' }, caption)] : [];
	const { code, bodyLead, bodyTrail } = body;
	return im.core.node('typ_figure', { ...attrs, code, bodyLead, bodyTrail, typFigure: fig.args }, [...body.blocks, ...captionNode]);
}

/** a `#figure(..)` standing alone in its paragraph, with an optional trailing `<label>` */
export function figureSeg(im: TypstImport, kids: SyntaxNode[], i: number): { seg: TypstSeg; next: number } | null {
	const hash = kids[i];
	const call = kids[i + 1];
	const fig = figureCall(call, im.src);
	const alone = fig ? aloneWithLabel(kids, i + 2, im.src) : null;
	if (!fig || !alone) return null;
	const labelNode = alone.label;
	const label = labelNode ? im.src.slice(labelNode.from + 1, labelNode.to - 1) : null;
	const labelGap = labelGapOf(im.src, call.to, labelNode);
	const node = figureNode(im, fig, { label, labelGap, typIndent: lineIndent(hash, hash.from, im.src) || null });
	if (!node) return null;
	return { seg: { blocks: [node], from: hash.from, to: (labelNode ?? call).to }, next: alone.next };
}

/** a figure written as code (a grid's cell) */
export function figureCode(im: TypstImport, call: SyntaxNode): PmNode | null {
	const fig = figureCall(call, im.src);
	return fig ? figureNode(im, fig, { label: null, labelGap: null, typIndent: null }) : null;
}
