// #figure / #image conversion; a figure wrapping a table delegates to tableConvert
import type { SyntaxNode } from '@lezer/common';
import { buildNode, type PmNode } from './builders';
import { children, childOf, convertInline, unquote } from './inlineConvert';
import { tableParts, buildTableNode, type TableParts } from './tableConvert';
import { aloneWithLabel, labelGapOf } from './segConvert';
import type { Seg } from './converter';
import { ARG_PUNCT } from './tableConvert';
import { cropOfArgs, isCropCall, type TypstCrop } from '../extensions/typstImageCrop';

type ImageParts = { src: string; options: string | null; crop?: TypstCrop | null };

function imageCallParts(call: SyntaxNode, src: string): ImageParts | null {
	if (call.name !== 'FuncCall') return null;
	const ident = call.firstChild;
	if (!ident || ident.name !== 'Ident' || src.slice(ident.from, ident.to) !== 'image') return null;
	const args = ident.nextSibling;
	if (!args || args.name !== 'Args' || args.firstChild?.name !== 'LeftParen') return null;
	const kids = children(args);
	const rparen = kids[kids.length - 1];
	if (rparen.name !== 'RightParen') return null;
	const real = kids.filter((c) => !['LeftParen', 'RightParen', 'Space'].includes(c.name));
	if (real.length === 0 || real[0].name !== 'Str') return null;
	const path = unquote(src.slice(real[0].from, real[0].to));
	if (real.length === 1) return { src: path, options: null };
	if (real[1].name !== 'Comma') return null;
	const options = src.slice(real[1].to, rparen.from).trim();
	return { src: path, options: options || null };
}

/** `texpile-crop(left: 10%, ..., image(...))`, as the paper writes a cropped image */
function croppedImageParts(call: SyntaxNode, src: string): ImageParts | null {
	if (call.name !== 'FuncCall') return null;
	const ident = call.firstChild;
	if (!ident || ident.name !== 'Ident' || !isCropCall(src.slice(ident.from, ident.to))) return null;
	const args = ident.nextSibling;
	if (!args || args.name !== 'Args') return null;
	const real = children(args).filter((c) => !ARG_PUNCT.includes(c.name));
	const image = real.length ? imageCallParts(real[real.length - 1], src) : null;
	const crop = image ? cropOfArgs(real.slice(0, -1).map((a) => src.slice(a.from, a.to))) : null;
	return image && crop ? { ...image, crop } : null;
}

function anyImageParts(call: SyntaxNode, src: string): ImageParts | null {
	return imageCallParts(call, src) ?? croppedImageParts(call, src);
}

type FigureParts = {
	img: ImageParts;
	captionMarkup: SyntaxNode | null;
	isFigure: boolean;
};

/** `#figure(image(...), caption: [...])` (caption optional) or a bare `#image(...)`; anything
 *  richer — placement, scope, kind, a table body — stays raw. */
function figureParts(call: SyntaxNode, src: string): FigureParts | null {
	const bare = anyImageParts(call, src);
	if (bare) return { img: bare, captionMarkup: null, isFigure: false };
	if (call.name !== 'FuncCall') return null;
	const ident = call.firstChild;
	if (!ident || ident.name !== 'Ident' || src.slice(ident.from, ident.to) !== 'figure') return null;
	const args = ident.nextSibling;
	if (!args || args.name !== 'Args' || args.firstChild?.name !== 'LeftParen') return null;
	const real = children(args).filter((c) => !['LeftParen', 'RightParen', 'Comma', 'Space'].includes(c.name));
	if (real.length < 1 || real.length > 2) return null;
	const img = anyImageParts(real[0], src);
	if (!img) return null;
	let captionMarkup: SyntaxNode | null = null;
	if (real.length === 2) {
		const named = real[1];
		const nIdent = named.firstChild;
		if (named.name !== 'Named' || !nIdent || src.slice(nIdent.from, nIdent.to) !== 'caption') return null;
		const cb = childOf(named, 'ContentBlock');
		if (!cb) return null; // caption: "string" and friends: raw
		captionMarkup = childOf(cb, 'Markup');
	}
	return { img, captionMarkup, isFigure: true };
}

/** `#figure(table(...), caption: [...])`: the table-figure sibling of figureParts. */
function tableFigureParts(
	call: SyntaxNode,
	src: string
): { table: TableParts; captionMarkup: SyntaxNode | null; captioned: boolean } | null {
	if (call.name !== 'FuncCall') return null;
	const ident = call.firstChild;
	if (!ident || ident.name !== 'Ident' || src.slice(ident.from, ident.to) !== 'figure') return null;
	const args = ident.nextSibling;
	if (!args || args.name !== 'Args' || args.firstChild?.name !== 'LeftParen') return null;
	const real = children(args).filter((c) => !ARG_PUNCT.includes(c.name));
	if (real.length < 1 || real.length > 2) return null;
	const table = tableParts(real[0], src);
	if (!table) return null;
	let captionMarkup: SyntaxNode | null = null;
	if (real.length === 2) {
		const named = real[1];
		const nIdent = named.firstChild;
		if (named.name !== 'Named' || !nIdent || src.slice(nIdent.from, nIdent.to) !== 'caption') return null;
		const cb = childOf(named, 'ContentBlock');
		if (!cb) return null;
		captionMarkup = childOf(cb, 'Markup');
	}
	return { table, captionMarkup, captioned: real.length === 2 };
}

/**
 * A `#figure(image(...))` / `#image(...)` / `#figure(table(...))` standing alone in its
 * paragraph, with an optional trailing `<label>`, becomes a real node. Null when the shape is
 * richer than the serializer can re-emit — the caller falls back to a raw block.
 */
export function figureSeg(kids: SyntaxNode[], i: number, src: string): { seg: Seg; next: number } | null {
	const hash = kids[i];
	const call = kids[i + 1];
	const parts = figureParts(call, src);
	const tParts = parts ? null : tableFigureParts(call, src);
	if (!parts && !tParts) return null;
	const alone = aloneWithLabel(kids, i + 2);
	if (!alone) return null;
	const labelNode = alone.label;
	const label = labelNode ? src.slice(labelNode.from + 1, labelNode.to - 1) : null;
	const labelGap = labelGapOf(src, call.to, labelNode);
	let node: PmNode;
	if (parts) {
		const caption = parts.captionMarkup ? convertInline(children(parts.captionMarkup), src, []) : [];
		node = buildNode(
			'image',
			{
				src: parts.img.src,
				options: parts.img.options,
				crop: parts.img.crop ?? null,
				label,
				labelGap,
				numbered: parts.isFigure,
				// a `caption: []` is a caption still: typst draws its "Figure 1:"
				showCaption: parts.captionMarkup !== null
			},
			caption
		);
	} else {
		const table = buildTableNode(tParts!.table);
		if (!table) return null;
		const caption = tParts!.captionMarkup ? convertInline(children(tParts!.captionMarkup), src, []) : [];
		node = buildNode('table_wrapper', { label, labelGap, showNotes: false, typCaption: tParts!.captioned }, [
			buildNode('table_caption', null, caption),
			table
		]);
	}
	const to = (labelNode ?? call).to;
	return { seg: { blocks: [node], from: hash.from, to }, next: alone.next };
}
