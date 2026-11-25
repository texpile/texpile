// a Shift move from a selected node: the range keeps the node's edge away from the move and its head goes where a caret at the near edge would
import { NodeSelection, Selection, TextSelection } from 'prosemirror-state';
import type { VisualView } from '../../contracts/viewTypes';

/** `head`: where a block node's range ends at once; null when the key moves the head from a caret now at an inline node's near edge */
export type NodeStart = { readonly anchor: number; readonly head: number | null };

export function startFromNode(view: VisualView, dir: -1 | 1): NodeStart | null {
	const { selection, doc } = view.state;
	if (!(selection instanceof NodeSelection)) return null;
	const anchor = dir > 0 ? selection.from : selection.to;
	const near = dir > 0 ? selection.to : selection.from;
	if (selection.node.isInline) {
		view.dispatch(view.state.tr.setSelection(TextSelection.create(doc, near)));
		return { anchor, head: null };
	}
	// a block has no caret at its edge: the range runs from the textblock behind it to the facing edge of the one beyond
	const beyond = Selection.findFrom(doc.resolve(near), dir, true);
	if (!beyond) return null;
	const behind = Selection.findFrom(doc.resolve(anchor), -dir as -1 | 1, true);
	return { anchor: behind ? behind.head : anchor, head: dir > 0 ? beyond.from : beyond.to };
}
