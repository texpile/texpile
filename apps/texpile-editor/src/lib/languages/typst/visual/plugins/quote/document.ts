import type { SyntaxNode } from '@lezer/common';
import {
	CALL_PUNCT,
	childOf,
	children,
	indentAfterFirstLine,
	restOnlySpace,
	type TypstDocumentPlugin,
	type TypstImport,
	type TypstSeg
} from '$lib/languages/typst/visual/core/document';

function quoteSeg(im: TypstImport, kids: SyntaxNode[], i: number): { seg: TypstSeg; next: number } | null {
	const src = im.src;
	const hash = kids[i];
	const call = kids[i + 1];
	if (!call || !restOnlySpace(kids, i + 2, src)) return null;
	if (call.name !== 'FuncCall') return null;
	const ident = call.firstChild;
	if (!ident || ident.name !== 'Ident' || src.slice(ident.from, ident.to) !== 'quote') return null;
	const args = ident.nextSibling;
	if (!args || args.name !== 'Args') return null;
	const real = children(args).filter((c) => !CALL_PUNCT.includes(c.name));
	if (real.length !== 2 || real[0].name !== 'Named' || real[1].name !== 'ContentBlock') return null;
	const nIdent = real[0].firstChild;
	if (!nIdent || nIdent.name !== 'Ident' || src.slice(nIdent.from, nIdent.to) !== 'block') return null;
	const bool = children(real[0]).find((c) => c.name === 'Bool');
	if (!bool || src.slice(bool.from, bool.to) !== 'true') return null;
	const markup = childOf(real[1], 'Markup');
	const blocks = markup ? im.core.noted(im.core.markup(children(markup), src)) : [];
	return { seg: { blocks: [im.core.node('blockquote', null, im.core.ensureBlocks(blocks))], from: hash.from, to: call.to }, next: i + 2 };
}

export const quoteDocument: TypstDocumentPlugin = {
	import: { calls: { blocks: { quote: quoteSeg } } },
	save: {
		nodes: {
			blockquote(node, _ctx, core) {
				const inner = core.blocks(node);
				if (!inner) return '';
				return `#quote(block: true)[\n  ${indentAfterFirstLine(inner, '  ')}\n]\n\n`;
			}
		}
	}
};
