import type { SyntaxNode } from '@lezer/common';
import { buildNode, textNodes, type PmNode } from '../builders';
import { linesOf, spansOfChars } from './blockSpans';
import type { Reader } from './reader';

export function rawBlock(lang: 'html' | 'markdown'): (r: Reader, node: SyntaxNode) => PmNode[] {
	return (r, node) => {
		const chars = linesOf(r, node);
		return chars.text ? [buildNode('raw_latex', { lang }, textNodes(chars.text, null, spansOfChars(r, chars)))] : [];
	};
}
