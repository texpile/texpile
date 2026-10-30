// the items of one tree level, white space left out
import type { SyntaxNode } from '@lezer/common';

export function isBlankText(text: string, n: SyntaxNode): boolean {
	return n.name === 'Text' && !text.slice(n.from, n.to).trim();
}

export function nextItem(text: string, n: SyntaxNode): SyntaxNode | null {
	let s = n.nextSibling;
	while (s && isBlankText(text, s)) s = s.nextSibling;
	return s;
}

export function groupItems(text: string, group: SyntaxNode): SyntaxNode[] {
	const out: SyntaxNode[] = [];
	for (let c = group.firstChild; c; c = c.nextSibling)
		if (c.name !== '{' && c.name !== '}' && c.name !== 'GroupEnd' && !isBlankText(text, c)) out.push(c);
	return out;
}

export function wordOf(text: string, n: SyntaxNode | null): string | null {
	return n?.name === 'ControlWord' ? text.slice(n.from + 1, n.to) : null;
}

/** what a closed group holds, null for an unclosed group or anything else */
export function groupInner(text: string, n: SyntaxNode | null): string | null {
	return n?.name === 'Group' && n.lastChild?.name === '}' ? text.slice(n.from + 1, n.to - 1) : null;
}
