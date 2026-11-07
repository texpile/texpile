import type { Node } from 'prosemirror-model';

/** where `node` itself now stands in `doc`, or null once it is gone or was rewritten */
export function positionOf(doc: Node, node: Node): number | null {
	let found: number | null = null;
	doc.descendants((child, pos) => {
		if (found != null) return false;
		if (child === node) found = pos;
		return found == null && !child.isTextblock;
	});
	return found;
}
