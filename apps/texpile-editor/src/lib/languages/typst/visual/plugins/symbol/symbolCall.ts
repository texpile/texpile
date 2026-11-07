// #emoji.heart and #sym.arrow.r: a symbol of Typst's own, which prints as its character
import type { SyntaxNode } from '@lezer/common';
import { typstSymbolByName, typstSyntax } from '$lib/languages/typst/visual/core/document';

const NAME = /^(sym|emoji)(\.[A-Za-z0-9-]+)+$/;

export function readSymbol(source: string): string | null {
	if (!/^#(sym|emoji)\./.test(source)) return null;
	const kids: SyntaxNode[] = [];
	for (let c = typstSyntax(source).firstChild; c; c = c.nextSibling) kids.push(c);
	if (kids.length !== 2 || kids[0].name !== 'Hash' || kids[1].name !== 'FieldAccess' || kids[1].to !== source.length) return null;
	const name = source.slice(kids[1].from, kids[1].to);
	const symbol = NAME.test(name) ? typstSymbolByName(name) : undefined;
	return symbol && !symbol.invisible ? symbol.value : null;
}
