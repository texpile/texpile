import type { EditorView } from 'prosemirror-view';

export function handleUnitAt(view: EditorView, left: number, top: number): number | null {
	const found = view.posAtCoords({ left, top });
	if (!found) return null;
	const { doc } = view.state;
	const self = found.inside >= 0 ? doc.nodeAt(found.inside) : null;
	if (self?.type.name === 'list') return found.inside;
	const $pos = doc.resolve(found.inside >= 0 ? found.inside : found.pos);
	for (let depth = $pos.depth; depth > 0; depth--) {
		if ($pos.node(depth).type.name === 'list') return $pos.before(depth);
	}
	if ($pos.depth > 0) return $pos.before(1);
	if (self?.isBlock) return found.inside;
	if ($pos.nodeAfter) return $pos.pos;
	return $pos.nodeBefore ? $pos.pos - $pos.nodeBefore.nodeSize : null;
}
