import type { SyntaxNode } from '@lezer/common';
import {
	CALL_PUNCT,
	childOf,
	children,
	type PmMark,
	type TypstDocumentPlugin,
	type TypstImport
} from '$lib/languages/typst/visual/core/document';

const MARKS: Record<string, 'strong' | 'em'> = { Strong: 'strong', Emph: 'em', strong: 'strong', emph: 'em' };

/** `*bold*` and `_emphasis_`: the mark over the markup inside */
function emphasisMarkup(im: TypstImport, nodes: SyntaxNode[], i: number, marks: PmMark[]) {
	const k = nodes[i];
	const markup = childOf(k, 'Markup');
	return markup ? { nodes: im.core.inline(children(markup), im.src, [...marks, { type: MARKS[k.name] }]), next: i + 1 } : null;
}

// the function forms the serializer writes for an intraword mark (`un#strong[happy]ness`)
function emphasisCall(im: TypstImport, _hash: SyntaxNode, call: SyntaxNode, marks: PmMark[]) {
	const ident = call.name === 'FuncCall' ? call.firstChild : null;
	const args = ident?.name === 'Ident' ? ident.nextSibling : null;
	if (!ident || !args || args.name !== 'Args') return null;
	const real = children(args).filter((k) => !CALL_PUNCT.includes(k.name));
	const markup = real.length === 1 && real[0].name === 'ContentBlock' ? childOf(real[0], 'Markup') : null;
	return markup ? im.core.inline(children(markup), im.src, [...marks, { type: MARKS[im.src.slice(ident.from, ident.to)] }]) : null;
}

export const emphasisDocument: TypstDocumentPlugin = {
	import: {
		markup: { inline: { Strong: emphasisMarkup, Emph: emphasisMarkup } },
		calls: { inline: { strong: emphasisCall, emph: emphasisCall } }
	},
	save: {
		// strong and emphasis open and close at a word edge only: inside a word they take the function form
		marks: {
			strong: () => ({ open: '*', close: '*', expel: true, inWord: { open: '#strong[', close: ']' } }),
			em: () => ({ open: '_', close: '_', expel: true, inWord: { open: '#emph[', close: ']' } })
		}
	}
};
