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
