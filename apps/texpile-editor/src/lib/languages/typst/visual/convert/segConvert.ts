// heading/list/term/quote block builders. bodies hold full markup, so this module and the
// markup walker in converter.ts are mutually recursive; ESM live bindings make the circular
// import safe (nothing runs at module init).
import type { SyntaxNode } from '@lezer/common';
import { buildNode, textNodes, collapseTextNodes, type PmNode } from './builders';
import { children, childOf, convertInline, chip, rawBlock } from './inlineConvert';
import { convertMarkup, ensureBlocks, notedBlocks, restOnlySpace, withGap, gapKind, type Seg } from './converter';
import { ARG_PUNCT } from './tableConvert';
import { noteBlockSpan } from '$lib/editor/visual/sourceSpans';
export function aloneWithLabel(kids: SyntaxNode[], after: number): { label: SyntaxNode | null; next: number } | null {
	let j = after;
	if (kids[j]?.name === 'Space' && kids[j + 1]?.name === 'Label') j++;
	const label = kids[j]?.name === 'Label' ? kids[j] : null;
	if (label) j++;
	return restOnlySpace(kids, j) ? { label, next: j } : null;
}

/** how the source set a <label> off from the element ending at `end`: the bytes between when they
 *  hold a line end, else null (a space, the serializer's default) */
export function labelGapOf(src: string, end: number, labelNode: SyntaxNode | null): string | null {
	if (!labelNode) return null;
	const between = src.slice(end, labelNode.from);
	return /\n/.test(between) ? between : null;
}

export function headingSeg(k: SyntaxNode, src: string, labelNode: SyntaxNode | null = null): Seg {
	const marker = childOf(k, 'HeadingMarker');
	const level = Math.min(6, Math.max(1, marker ? marker.to - marker.from : 1));
	const markup = childOf(k, 'Markup');
	const content = markup ? convertInline(children(markup), src, []) : [];
	const label = labelNode ? src.slice(labelNode.from + 1, labelNode.to - 1) : null;
	const labelGap = labelGapOf(src, k.to, labelNode);
	return { blocks: [buildNode('heading', { level, numbered: true, label, labelGap }, content)], from: k.from, to: (labelNode ?? k).to };
}

export function headingCallSeg(kids: SyntaxNode[], i: number, src: string): { seg: Seg; next: number } | null {
	const hash = kids[i];
	const call = kids[i + 1];
	if (!call || call.name !== 'FuncCall') return null;
	const ident = call.firstChild;
	if (!ident || ident.name !== 'Ident' || src.slice(ident.from, ident.to) !== 'heading') return null;
	const args = ident.nextSibling;
	if (!args || args.name !== 'Args') return null;
	const real = children(args).filter((c) => !ARG_PUNCT.includes(c.name));
	let level = 1;
	let size = '';
	let unnumbered = false;
	let markup: SyntaxNode | null = null;
	for (const a of real) {
		if (a.name === 'ContentBlock') {
			if (markup) return null;
			markup = childOf(a, 'Markup');
			continue;
		}
		if (a.name !== 'Named') return null;
		const key = a.firstChild && a.firstChild.name === 'Ident' ? src.slice(a.firstChild.from, a.firstChild.to) : '';
		const value = children(a).find((c) => !['Ident', 'Colon', 'Space'].includes(c.name));
		if (!value) return null;
		if ((key === 'level' || key === 'depth') && !size && value.name === 'Int') {
			size = key;
			level = Math.min(6, Math.max(1, parseInt(src.slice(value.from, value.to), 10) || 1));
		} else if (key === 'numbering' && value.name === 'None') unnumbered = true;
		else return null;
	}
	if (unnumbered ? size === 'depth' : size !== 'depth') return null;
	const alone = aloneWithLabel(kids, i + 2);
	if (!alone) return null;
	const label = alone.label ? src.slice(alone.label.from + 1, alone.label.to - 1) : null;
	const content = markup ? convertInline(children(markup), src, []) : [];
	const node = buildNode('heading', { level, numbered: !unnumbered, label }, content);
	return { seg: { blocks: [node], from: hash.from, to: (alone.label ?? call).to }, next: alone.next };
}

type CommentBridge = {
	/** the comment slices, in source order */
	comments: string[];
	/** index of the item that follows them */
	next: number;
};

/** `[Space] comment [Space] ... item`: comments between two items of one run. typst reads them as
 *  nothing, so they must not split the list; the caller keeps them on the preceding item. */
function bridgeComments(kids: SyntaxNode[], j: number, kindName: string, src: string): CommentBridge | null {
	const comments: string[] = [];
	let k = j;
	for (;;) {
		if (kids[k]?.name === 'Space') k++;
		const c = kids[k];
		if (!c || (c.name !== 'LineComment' && c.name !== 'BlockComment')) break;
		comments.push(src.slice(c.from, c.to));
		k++;
	}
	if (comments.length === 0) return null;
	if (kids[k]?.name === 'Space') k++;
	return kids[k]?.name === kindName ? { comments, next: k } : null;
}

/** the comments ride on the item's last paragraph as chips, or as a raw block after a block */
function attachComments(blocks: PmNode[], comments: string[]): PmNode[] {
	if (comments.length === 0) return blocks;
	const last = blocks[blocks.length - 1];
	if (last && last.type.name === 'paragraph') {
		const content: PmNode[] = [];
		last.forEach((c) => content.push(c));
		for (const c of comments) content.push(...textNodes(' '), ...chip(c, []));
		return [...blocks.slice(0, -1), last.type.create(last.attrs, collapseTextNodes(content), last.marks)];
	}
	return [...blocks, withGap(rawBlock(comments.join('\n')), 'newline')];
}

/** consecutive same-kind items separated by plain whitespace (comments included) form ONE list. */
export function listSeg(kids: SyntaxNode[], i: number, src: string): { seg: Seg; next: number } {
	const kindName = kids[i].name;
	const items: SyntaxNode[] = [kids[i]];
	const trailing: string[][] = [[]];
	let j = i + 1;
	while (j < kids.length) {
		const bridge = bridgeComments(kids, j, kindName, src);
		if (kids[j].name === kindName) {
			items.push(kids[j]);
			trailing.push([]);
			j++;
		} else if (kids[j].name === 'Space' && kids[j + 1]?.name === kindName) {
			j++;
		} else if (bridge) {
			trailing[trailing.length - 1].push(...bridge.comments);
			j = bridge.next;
		} else {
			break;
		}
	}
	const kind = kindName === 'ListItem' ? 'bullet' : 'ordered';
	// an explicit "3." enum marker sets the run's start; "+" auto-numbers from 1
	function numberOf(item: SyntaxNode): number | null {
		const marker = childOf(item, 'EnumMarker');
		const m = marker ? /^(\d+)[.)]/.exec(src.slice(marker.from, marker.to)) : null;
		return m ? Number(m[1]) : null;
	}
	const start = numberOf(items[0]) ?? 1;
	const blocks = items.map((item, idx) => {
		const markup = childOf(item, 'Markup');
		const inner = markup ? notedBlocks(convertMarkup(children(markup), src)) : [];
		// an item with nothing typed yet: its paragraph has no bytes, and stands where they would go
		const body = ensureBlocks(inner);
		if (inner.length === 0) {
			// past the marker and the space after it, so what is typed does not fuse with the marker
			let at = markup ? markup.from : item.to;
			while (src[at] === ' ' || src[at] === '\t') at++;
			noteBlockSpan(body[0], { srcFrom: at, srcTo: at, size: 1 });
		}
		const node = buildNode(
			'list',
			{
				kind,
				// flat-list only reads `order` on the first node of an ordered run (CSS counter-set)
				order: kind === 'ordered' ? (idx === 0 ? start : 1) : null,
				typNumber: kind === 'ordered' ? numberOf(item) : null,
				checked: null,
				collapsed: false,
				preBody: null
			},
			attachComments(body, trailing[idx])
		);
		// a loose list (blank lines between items) stays loose: typst spaces it differently
		return idx === 0 ? node : withGap(node, gapKind(src.slice(items[idx - 1].to, item.from)));
	});
	return { seg: { blocks, from: items[0].from, to: items[items.length - 1].to }, next: j };
}

/** consecutive `/ term: description` items form ONE run, mirroring listSeg. */
export function termSeg(kids: SyntaxNode[], i: number, src: string): { seg: Seg; next: number } {
	const items: SyntaxNode[] = [kids[i]];
	const trailing: string[][] = [[]];
	let j = i + 1;
	while (j < kids.length) {
		const bridge = bridgeComments(kids, j, 'TermItem', src);
		if (kids[j].name === 'TermItem') {
			items.push(kids[j]);
			trailing.push([]);
			j++;
		} else if (kids[j].name === 'Space' && kids[j + 1]?.name === 'TermItem') {
			j++;
		} else if (bridge) {
			trailing[trailing.length - 1].push(...bridge.comments);
			j = bridge.next;
		} else {
			break;
		}
	}
	const blocks = items.map((item, idx) => {
		const markups = children(item).filter((c) => c.name === 'Markup');
		const title = buildNode('term_title', null, markups[0] ? convertInline(children(markups[0]), src, []) : []);
		const desc = markups[1] ? notedBlocks(convertMarkup(children(markups[1]), src)) : [];
		const descBody = ensureBlocks(desc);
		if (desc.length === 0)
			noteBlockSpan(descBody[0], {
				srcFrom: markups[1] ? markups[1].from : item.to,
				srcTo: markups[1] ? markups[1].from : item.to,
				size: 1
			});
		const node = buildNode('term_item', null, [title, ...attachComments(descBody, trailing[idx])]);
		return idx === 0 ? node : withGap(node, gapKind(src.slice(items[idx - 1].to, item.from)));
	});
	return { seg: { blocks, from: items[0].from, to: items[items.length - 1].to }, next: j };
}

/** `#quote(block: true)[...]` standing alone becomes a blockquote; any other quote stays raw. */
export function quoteSeg(kids: SyntaxNode[], i: number, src: string): { seg: Seg; next: number } | null {
	const hash = kids[i];
	const call = kids[i + 1];
	if (!call || !restOnlySpace(kids, i + 2)) return null;
	if (call.name !== 'FuncCall') return null;
	const ident = call.firstChild;
	if (!ident || ident.name !== 'Ident' || src.slice(ident.from, ident.to) !== 'quote') return null;
	const args = ident.nextSibling;
	if (!args || args.name !== 'Args') return null;
	const real = children(args).filter((c) => !ARG_PUNCT.includes(c.name));
	if (real.length !== 2 || real[0].name !== 'Named' || real[1].name !== 'ContentBlock') return null;
	const nIdent = real[0].firstChild;
	if (!nIdent || nIdent.name !== 'Ident' || src.slice(nIdent.from, nIdent.to) !== 'block') return null;
	const bool = children(real[0]).find((c) => c.name === 'Bool');
	if (!bool || src.slice(bool.from, bool.to) !== 'true') return null;
	const markup = childOf(real[1], 'Markup');
	const blocks = markup ? notedBlocks(convertMarkup(children(markup), src)) : [];
	return { seg: { blocks: [buildNode('blockquote', null, ensureBlocks(blocks))], from: hash.from, to: call.to }, next: i + 2 };
}
