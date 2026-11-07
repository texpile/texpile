import type { SyntaxNode } from '@lezer/common';
import { stdEntry } from './stdLibrary';
import { valueText } from './scan/readEntry';

/** the text an argument prints when it is plain text: a string, a content block of words, a styling call around one */
export function argumentText(node: SyntaxNode, source: string): string | null {
	return valueText(node, source, (name) => stdEntry(name)?.block === 'content');
}
