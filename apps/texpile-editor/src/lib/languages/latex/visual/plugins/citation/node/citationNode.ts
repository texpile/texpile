import type { Node } from 'prosemirror-model';
import { optionalsBeforeKey } from '$lib/languages/latex/knowledge/calls/roleKeys';
import {
	argTextContent,
	hasStar,
	mandatoryArgs,
	type ImportCall,
	type PmNode,
	type TreeImport
} from '$lib/languages/latex/visual/core/document';

export function createCitation(im: TreeImport, call: ImportCall): PmNode[] {
	if (call.args.some((a) => a.present && a.kind.startsWith('d'))) return [im.core.chip(call)];
	const optional = call.args.filter((a) => a.present && a.open === '[');
	const key = argTextContent(im, mandatoryArgs(call)[0]);
	const [prenote, postnote] =
		optional.length === 2 ? optional.map((a) => argTextContent(im, a)) : ['', optional.length === 1 ? argTextContent(im, optional[0]) : ''];
	return [
		im.core.node('citation', { variant: call.name + (hasStar(call) ? '*' : ''), prenote, postnote }, key ? [im.core.text(key)] : null)
	];
}

// notes are not escaped: a macro's raw source (a \eg pre-note) would become \textbackslash{}eg
export function citationLatex(node: Node): string {
	const key = node.textContent;
	const variant = String(node.attrs.variant ?? 'cite');
	const pre = node.attrs.prenote ? String(node.attrs.prenote) : '';
	const post = node.attrs.postnote ? String(node.attrs.postnote) : '';
	if (optionalsBeforeKey(variant) === 0 || (!pre && !post)) return `\\${variant}{${key}}`;
	// one bracket is the postnote everywhere; plain \cite has no two-bracket form
	if (!pre) return `\\${variant}[${post}]{${key}}`;
	return `\\${variant}[${pre}][${post}]{${key}}`;
}
