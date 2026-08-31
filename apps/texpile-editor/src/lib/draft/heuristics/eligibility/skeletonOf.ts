// A block's structure with EVERY string blanked, nested ones included -- what remains when
// all the text is unsaid. Two blocks with equal skeletons differ only in text, wherever
// that text lives: top-level prose, a heading's title, an \emph body, math content.
// Whitespace inside arguments is text too ('a b' -> 'a big b' must not read as structure),
// and a comment's content never becomes ink; a parbreak stays structural.
import { printRaw } from '@unified-latex/unified-latex-util-print-raw';
import type { Node } from '@unified-latex/unified-latex-types';

const TEXTUAL = new Set(['string', 'whitespace']);

function blank(n: unknown): unknown {
	if (Array.isArray(n)) return n.filter((x) => !TEXTUAL.has((x as { type?: string }).type ?? '')).map(blank);
	if (!n || typeof n !== 'object') return n;
	const node = n as Record<string, unknown>;
	if (node.type === 'comment') return { ...node, content: '' };
	// a BARE argument (no delimiters) is structure, not text: \section's star parses as one,
	// and blanking it would read \section -> \section* as an interior edit. Editable text
	// lives inside real marks -- braces, brackets, an environment, a math span.
	if (node.type === 'argument' && !node.openMark) return node;
	const out: Record<string, unknown> = { ...node };
	for (const k of ['content', 'args']) if (out[k]) out[k] = blank(out[k]);
	return out;
}

export function skeletonOf(nodes: Node[]): string[] {
	return (blank(nodes) as Node[]).map((n) => printRaw(n));
}
