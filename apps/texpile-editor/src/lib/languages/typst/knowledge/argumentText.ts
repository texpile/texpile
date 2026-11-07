import type { SyntaxNode } from '@lezer/common';
import { stdEntry } from './stdLibrary';
import { valueText } from './scan/readEntry';

export function argumentText(node: SyntaxNode, source: string): string | null {
	return valueText(node, source, (name) => stdEntry(name)?.block === 'content');
}
