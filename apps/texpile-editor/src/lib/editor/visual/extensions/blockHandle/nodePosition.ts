import type { Node } from 'prosemirror-model';

export function positionOf(doc: Node, node: Node): number | null {
	let found: number | null = null;
	doc.descendants((child, pos) => {
		if (found != null) return false;
		if (child === node) found = pos;
		return found == null && !child.isTextblock;
	});
	return found;
}

/** the node at `pos`, or null once the document no longer reaches it (another file swapped in under an open panel) */
export function nodeStillAt(doc: Node, pos: number): Node | null {
	return pos >= 0 && pos < doc.content.size ? doc.nodeAt(pos) : null;
}
