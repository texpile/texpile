// `#figure(table(..), caption: [..])`: a table wrapper holding the caption and the table, every other argument as written
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
import { buildTableNode, tableParts } from './tableImport';

type FigureAttrs = { label: string | null; labelGap: string | null; typIndent: string | null };

function wrapperOf(im: TypstImport, fig: FigureCall, attrs: FigureAttrs): PmNode | null {
	const parts = tableParts(im, fig.body);
	const table = parts ? buildTableNode(im, parts) : null;
	if (!table) return null;
	const caption = figureCaption(im, fig.caption);
	const wrapper = { ...attrs, showNotes: false, typCaption: fig.caption !== null, typFigure: fig.args };
	return im.core.node('table_wrapper', wrapper, [
		im.core.node('table_caption', { typString: fig.caption?.name === 'Str' }, caption),
		table
	]);
}

/** a figure of a table standing alone in its paragraph, with an optional trailing `<label>` */
export function tableFigureSeg(im: TypstImport, kids: SyntaxNode[], i: number): { seg: TypstSeg; next: number } | null {
	const hash = kids[i];
	const call = kids[i + 1];
	const fig = figureCall(call, im.src);
	const alone = fig ? aloneWithLabel(kids, i + 2, im.src) : null;
	if (!fig || !alone) return null;
	const labelNode = alone.label;
	const label = labelNode ? im.src.slice(labelNode.from + 1, labelNode.to - 1) : null;
	const labelGap = labelGapOf(im.src, call.to, labelNode);
	const node = wrapperOf(im, fig, { label, labelGap, typIndent: lineIndent(hash, hash.from, im.src) || null });
	if (!node) return null;
	return { seg: { blocks: [node], from: hash.from, to: (labelNode ?? call).to }, next: alone.next };
}

/** a figure of a table written as code (a grid's cell) */
export function tableFigureCode(im: TypstImport, call: SyntaxNode): PmNode | null {
	const fig = figureCall(call, im.src);
	return fig ? wrapperOf(im, fig, { label: null, labelGap: null, typIndent: null }) : null;
}
