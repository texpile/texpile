// `#image(..)` and an image cropped by texpile-crop, bare or as a figure's body: an image node, its caption the figure's
import type { SyntaxNode } from '@lezer/common';
import {
	aloneWithLabel,
	CALL_PUNCT,
	children,
	cropOfArgs,
	figureCall,
	figureCaption,
	isCropCall,
	labelGapOf,
	lineIndent,
	unquote,
	type FigureCall,
	type PmNode,
	type TypstCrop,
	type TypstImport,
	type TypstSeg
} from '$lib/languages/typst/visual/core/document';

type ImageParts = { src: string; options: string | null; crop?: TypstCrop | null };
type FigureAttrs = { label: string | null; labelGap: string | null; typIndent: string | null };

function imageCallParts(call: SyntaxNode, src: string): ImageParts | null {
	if (call.name !== 'FuncCall') return null;
	const ident = call.firstChild;
	if (!ident || ident.name !== 'Ident' || src.slice(ident.from, ident.to) !== 'image') return null;
	const args = ident.nextSibling;
	if (!args || args.name !== 'Args' || args.firstChild?.name !== 'LeftParen') return null;
	const kids = children(args);
	const rparen = kids[kids.length - 1];
	if (rparen.name !== 'RightParen') return null;
	const items = kids.filter((c) => !['LeftParen', 'RightParen', 'Space', 'Comma'].includes(c.name));
	const at = items.findIndex((c) => c.name !== 'Named');
	if (at < 0 || items[at].name !== 'Str' || items.slice(at + 1).some((c) => c.name !== 'Named')) return null;
	const path = unquote(src.slice(items[at].from, items[at].to));
	if (items.length === 1) return { src: path, options: null };
	if (at > 0) return { src: path, options: items.flatMap((c, i) => (i === at ? [] : [src.slice(c.from, c.to)])).join(', ') };
	const comma = kids.find((c) => c.name === 'Comma' && c.from >= items[0].to);
	const options = comma ? src.slice(comma.to, rparen.from).trim() : '';
	return { src: path, options: options || null };
}

function croppedImageParts(call: SyntaxNode, src: string): ImageParts | null {
	if (call.name !== 'FuncCall') return null;
	const ident = call.firstChild;
	if (!ident || ident.name !== 'Ident' || !isCropCall(src.slice(ident.from, ident.to))) return null;
	const args = ident.nextSibling;
	if (!args || args.name !== 'Args') return null;
	const real = children(args).filter((c) => !CALL_PUNCT.includes(c.name));
	const image = real.length ? imageCallParts(real[real.length - 1], src) : null;
	const crop = image ? cropOfArgs(real.slice(0, -1).map((a) => src.slice(a.from, a.to))) : null;
	return image && crop ? { ...image, crop } : null;
}

function anyImageParts(call: SyntaxNode, src: string): ImageParts | null {
	return imageCallParts(call, src) ?? croppedImageParts(call, src);
}

function bareImage(im: TypstImport, img: ImageParts, label: string | null, labelGap: string | null): PmNode {
	const attrs = { src: img.src, options: img.options, crop: img.crop ?? null, label, labelGap };
	return im.core.node('image', { ...attrs, numbered: false, showCaption: false });
}

function figureImage(im: TypstImport, fig: FigureCall, attrs: FigureAttrs): PmNode | null {
	const img = anyImageParts(fig.body, im.src);
	if (!img) return null;
	const caption = figureCaption(im, fig.caption);
	const imageAttrs = { src: img.src, options: img.options, crop: img.crop ?? null, numbered: true, showCaption: fig.caption !== null };
	return im.core.node('image', { ...imageAttrs, ...attrs, typFigure: fig.args }, caption);
}

export function imageSeg(im: TypstImport, kids: SyntaxNode[], i: number): { seg: TypstSeg; next: number } | null {
	const hash = kids[i];
	const call = kids[i + 1];
	const bare = anyImageParts(call, im.src);
	const alone = bare ? aloneWithLabel(kids, i + 2, im.src) : null;
	if (!bare || !alone) return null;
	const labelNode = alone.label;
	const label = labelNode ? im.src.slice(labelNode.from + 1, labelNode.to - 1) : null;
	const node = bareImage(im, bare, label, labelGapOf(im.src, call.to, labelNode));
	return { seg: { blocks: [node], from: hash.from, to: (labelNode ?? call).to }, next: alone.next };
}

export function imageFigureSeg(im: TypstImport, kids: SyntaxNode[], i: number): { seg: TypstSeg; next: number } | null {
	const hash = kids[i];
	const call = kids[i + 1];
	const fig = figureCall(call, im.src);
	const alone = fig ? aloneWithLabel(kids, i + 2, im.src) : null;
	if (!fig || !alone) return null;
	const labelNode = alone.label;
	const label = labelNode ? im.src.slice(labelNode.from + 1, labelNode.to - 1) : null;
	const labelGap = labelGapOf(im.src, call.to, labelNode);
	const node = figureImage(im, fig, { label, labelGap, typIndent: lineIndent(hash, hash.from, im.src) || null });
	if (!node) return null;
	return { seg: { blocks: [node], from: hash.from, to: (labelNode ?? call).to }, next: alone.next };
}

export function imageCode(im: TypstImport, call: SyntaxNode): PmNode | null {
	const bare = anyImageParts(call, im.src);
	return bare ? bareImage(im, bare, null, null) : null;
}

export function imageFigureCode(im: TypstImport, call: SyntaxNode): PmNode | null {
	const fig = figureCall(call, im.src);
	return fig ? figureImage(im, fig, { label: null, labelGap: null, typIndent: null }) : null;
}
