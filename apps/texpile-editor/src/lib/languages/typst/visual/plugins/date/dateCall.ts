// a chip that is one call printing a date, as Typst prints it: `#datetime.today().display("[month repr:long] [year]")`
import type { SyntaxNode } from '@lezer/common';
import { calleePath } from '$lib/languages/typst/knowledge';
import { childrenOf, hasSyntaxError } from '$lib/languages/typst/knowledge/scan/syntax';
import { fieldText, typstScopeOfDrawing, typstSyntax, stdEntryOf } from '$lib/languages/typst/visual/core/document';

const QUIET = new Set(['Space', 'LineComment', 'BlockComment', 'Semicolon']);

function madeDate(callee: SyntaxNode | null, written: string): boolean {
	const maker = callee?.name === 'FieldAccess' ? callee.firstChild : null;
	const path = maker?.name === 'FuncCall' && maker.firstChild ? calleePath(maker.firstChild, written) : null;
	const entry = path ? stdEntryOf(path.join('.'), written) : null;
	return !!entry && (entry.returns?.includes('datetime') === true || path!.join('.') === 'datetime');
}

export function readDate(written: string): string | null {
	if (!written.includes('display')) return null;
	const top = typstSyntax(written);
	if (hasSyntaxError(top)) return null;
	const kids = childrenOf(top).filter((k) => !QUIET.has(k.name));
	const call = kids.length === 2 && kids[0].name === 'Hash' && kids[1].name === 'FuncCall' ? kids[1] : null;
	return call && madeDate(call.firstChild, written) ? fieldText({ node: call, source: written }, typstScopeOfDrawing(written)) : null;
}
