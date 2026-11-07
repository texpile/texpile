// how many columns a table's cells wrap at
import type { SyntaxNode } from '@lezer/common';
import { CALL_PUNCT, children } from './syntaxUtils';

export function columnCount(value: SyntaxNode, src: string): number | null {
	if (value.name === 'Int') {
		const n = parseInt(src.slice(value.from, value.to), 10);
		return Number.isFinite(n) && n > 0 && n <= 100 ? n : null;
	}
	if (value.name === 'Array') {
		const elems = children(value).filter((c) => !CALL_PUNCT.includes(c.name));
		return elems.length > 0 ? elems.length : null;
	}
	return null;
}
