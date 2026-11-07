// where a block ends in the markup it stands in: what ends a paragraph, a <label> after a block, a line's indent
import type { SyntaxNode } from '@lezer/common';
import { BLOCK_MARKUP } from '$lib/languages/typst/knowledge';
import { isDisplayEquation } from './syntaxUtils';
import { callLevel } from './callLevel';

export type GapKind = 'newline' | 'blank';

export function gapKind(gap: string): GapKind {
	return /\r?\n[ \t]*\r?\n/.test(gap) ? 'blank' : 'newline';
}

export function restOnlySpace(kids: SyntaxNode[], from: number, src: string): boolean {
	for (let j = from; j < kids.length; j++) {
		if (kids[j].name === 'Parbreak' || (j > from && startsBlock(kids, j, src))) return true;
		if (kids[j].name !== 'Space') return false;
	}
	return true;
}

function startsBlock(kids: SyntaxNode[], j: number, src: string): boolean {
	const k = kids[j];
	if (BLOCK_MARKUP.has(k.name)) return true;
	if (k.name === 'Equation') return isDisplayEquation(k);
	return k.name === 'Hash' && !!kids[j + 1] && callLevel(kids[j + 1], src) === true;
}

export function aloneWithLabel(kids: SyntaxNode[], after: number, src: string): { label: SyntaxNode | null; next: number } | null {
	let j = after;
	if (kids[j]?.name === 'Space' && kids[j + 1]?.name === 'Label') j++;
	const label = kids[j]?.name === 'Label' ? kids[j] : null;
	if (label) j++;
	return restOnlySpace(kids, j, src) ? { label, next: j } : null;
}

/** how the source set a <label> off from the element ending at `end`: the bytes between when they
 *  hold a line end, else null (a space, the serializer's default) */
export function labelGapOf(src: string, end: number, labelNode: SyntaxNode | null): string | null {
	if (!labelNode) return null;
	const between = src.slice(end, labelNode.from);
	return /\n/.test(between) ? between : null;
}

export function labelledEnd(kids: SyntaxNode[], after: number): number {
	const j = kids[after]?.name === 'Space' && kids[after + 1]?.name === 'Label' ? after + 1 : after;
	return kids[j]?.name === 'Label' ? j + 1 : after;
}

/** what the lines after `at` are indented by: a list marker counts as its width, a term as two spaces whatever its title */
export function lineIndent(node: SyntaxNode, at: number, src: string): string {
	const lineStart = src.lastIndexOf('\n', at - 1) + 1;
	for (let p = node.parent; p; p = p.parent) {
		const description = p.name === 'TermItem' && p.from >= lineStart ? p.lastChild : null;
		if (description && description.from <= at)
			return lineIndent(p, p.from, src) + '  ' + src.slice(description.from, at).replace(/\S/g, ' ');
	}
	return src.slice(lineStart, at).replace(/\S/g, ' ');
}
