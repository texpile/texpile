// `/ term: description` runs, mirroring a list's
import type { SyntaxNode } from '@lezer/common';
import {
	attachComments,
	children,
	gapKind,
	itemRun,
	noteBlockSpan,
	type TypstImport,
	type TypstSeg
} from '$lib/languages/typst/visual/core/document';

/** consecutive `/ term: description` items form ONE run */
export function termSeg(im: TypstImport, kids: SyntaxNode[], i: number): { seg: TypstSeg; next: number } {
	const src = im.src;
	const { items, trailing, next } = itemRun(kids, i, src);
	const blocks = items.map((item, idx) => {
		const markups = children(item).filter((c) => c.name === 'Markup');
		const title = im.core.node('term_title', null, markups[0] ? im.core.inline(children(markups[0]), src, []) : []);
		const desc = markups[1] ? im.core.noted(im.core.markup(children(markups[1]), src)) : [];
		const descBody = im.core.ensureBlocks(desc);
		if (desc.length === 0)
			noteBlockSpan(descBody[0], {
				srcFrom: markups[1] ? markups[1].from : item.to,
				srcTo: markups[1] ? markups[1].from : item.to,
				size: 1
			});
		const node = im.core.node('term_item', null, [title, ...attachComments(im, descBody, trailing[idx])]);
		return idx === 0 ? node : im.core.withGap(node, gapKind(src.slice(items[idx - 1].to, item.from)));
	});
	return { seg: { blocks, from: items[0].from, to: items[items.length - 1].to }, next };
}
