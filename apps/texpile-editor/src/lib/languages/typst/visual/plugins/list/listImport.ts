// `- item` and `+ item` runs: one list node per item, a run of one kind with nothing but whitespace or comments between
import type { SyntaxNode } from '@lezer/common';
import {
	attachComments,
	childOf,
	children,
	gapKind,
	itemRun,
	noteBlockSpan,
	type TypstImport,
	type TypstSeg
} from '$lib/languages/typst/visual/core/document';

export function listSeg(im: TypstImport, kids: SyntaxNode[], i: number): { seg: TypstSeg; next: number } {
	const src = im.src;
	const { items, trailing, next } = itemRun(kids, i, src);
	const kind = kids[i].name === 'ListItem' ? 'bullet' : 'ordered';
	function numberOf(item: SyntaxNode): number | null {
		const marker = childOf(item, 'EnumMarker');
		const m = marker ? /^(\d+)[.)]/.exec(src.slice(marker.from, marker.to)) : null;
		return m ? Number(m[1]) : null;
	}
	const start = numberOf(items[0]) ?? 1;
	const blocks = items.map((item, idx) => {
		const markup = childOf(item, 'Markup');
		const inner = markup ? im.core.noted(im.core.markup(children(markup), src)) : [];
		const body = im.core.ensureBlocks(inner);
		if (inner.length === 0) {
			let at = markup ? markup.from : item.to;
			while (src[at] === ' ' || src[at] === '\t') at++;
			noteBlockSpan(body[0], { srcFrom: at, srcTo: at, size: 1 });
		}
		const node = im.core.node(
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
			attachComments(im, body, trailing[idx])
		);
		// a loose list (blank lines between items) stays loose: typst spaces it differently
		return idx === 0 ? node : im.core.withGap(node, gapKind(src.slice(items[idx - 1].to, item.from)));
	});
	return { seg: { blocks, from: items[0].from, to: items[items.length - 1].to }, next };
}
