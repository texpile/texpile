// what a LaTeX line break needs around it to compile: a line to end, and no [ read as its argument
import type { Node } from 'prosemirror-model';
import type { Ctx } from '$lib/serializer/types';

// a line break (\\, not an escaped backslash) ending the text, before any spaces
const LINE_END = /(?:^|[^\\])(?:\\\\)+\s*$/;
export const BRACKET_START = /^\s*\[/;

// the children of the real block before an inline run written on its own (null: not known)
let runLead: Node[] | null = [];

/** `render` of a run of `block`'s children, knowing what the block holds before them: a break
 *  opening the run opens the line only when nothing drawn comes first */
export function afterLead<T>(block: Node, nodes: Node[], render: () => T): T {
	const k = block.content.content.indexOf(nodes[0]);
	runLead = k < 0 ? null : block.content.content.slice(0, k);
	try {
		return render();
	} finally {
		runLead = [];
	}
}

/** whether nothing the page shows comes before this child in its block */
export function opensLine(ctx: Ctx): boolean {
	if (!ctx.parent || ctx.index === undefined || !runLead) return false;
	const before = [...runLead, ...Array.from({ length: ctx.index }, (_, i) => ctx.parent!.child(i))];
	return before.every((c) => (c.isText ? (c.text ?? '').trim() === '' : c.type.name === 'label'));
}

/** whether the text after this break begins with [, which \\ would read as its spacing argument */
export function bracketFollows(ctx: Ctx): boolean {
	const next = ctx.parent && ctx.index !== undefined ? ctx.parent.maybeChild(ctx.index + 1) : null;
	return !!next?.isText && BRACKET_START.test(next.text ?? '');
}

/** `out` (the bytes written between kept `head` and `tail`) with an empty group ending a line break
 *  that a [ would otherwise follow, on either side of the seam */
export function guardBracket(head: string, bytes: string, tail: string, out: string): string | null {
	// at the start of its block a [ may follow a row's \\ the block cannot see: written afresh, a cell guards it
	if (head === '' && BRACKET_START.test(bytes || tail)) return null;
	let guarded = LINE_END.test(head) && BRACKET_START.test(bytes || tail) ? `{}${out}` : out;
	if (bytes && LINE_END.test(head + bytes) && BRACKET_START.test(tail)) guarded += '{}';
	return guarded;
}
