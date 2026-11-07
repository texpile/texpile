// Standard on a list item: the item's own paragraph leaves the list, the items around it stay a list
import { TextSelection, type EditorState, type Transaction } from 'prosemirror-state';

export function liftListItem(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
	const { $from } = state.selection;
	if ($from.depth < 2 || !$from.parent.isTextblock) return false;
	const item = $from.node(-1);
	if (item.type.name !== 'list' || $from.index(-1) !== 0) return false;
	if (dispatch) {
		const start = $from.before(-1);
		const tr = state.tr.replaceWith(start, $from.after(-1), item.content);
		dispatch(tr.setSelection(TextSelection.create(tr.doc, start + 1 + $from.parentOffset)).scrollIntoView());
	}
	return true;
}
