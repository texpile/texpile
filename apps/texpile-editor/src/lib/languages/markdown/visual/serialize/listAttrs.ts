// what a markdown list node's attrs say about the list it belongs to. kind is the editor's
// word (bullet, ordered, task); marker is the delimiter the source used, null on a node the
// editor made
import type { Node } from 'prosemirror-model';

export type ListFamily = 'bullet' | 'ordered';

const ORDERED_MARKERS = ['.', ')'];
const BULLET_MARKERS = ['-', '*', '+'];

export function listFamily(node: Node): ListFamily {
	const kind = String(node.attrs.kind ?? 'bullet');
	if (kind === 'ordered') return 'ordered';
	if (kind === 'bullet') return 'bullet';
	return ORDERED_MARKERS.includes(String(node.attrs.marker ?? '')) ? 'ordered' : 'bullet';
}

/** the delimiter the item is written with; a marker from the other family (the editor changed
 *  the kind) falls back to the family's default */
export function listMarker(node: Node): string {
	const valid = listFamily(node) === 'ordered' ? ORDERED_MARKERS : BULLET_MARKERS;
	const marker = node.attrs.marker == null ? null : String(node.attrs.marker);
	return marker != null && valid.includes(marker) ? marker : valid[0];
}

/** neighbours of one markdown list: same family and same delimiter (two bullet runs with
 *  different markers are two lists to the parser, so they stay two here) */
export function sameList(a: Node, b: Node): boolean {
	return a.type.name === 'list' && b.type.name === 'list' && listFamily(a) === listFamily(b) && listMarker(a) === listMarker(b);
}
