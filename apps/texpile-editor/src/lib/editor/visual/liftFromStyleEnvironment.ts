// Backspace at the start of an environment that is a paragraph's style lifts the paragraph out before joining the block above
import { TextSelection, type EditorState, type Transaction } from 'prosemirror-state';
import { styleEnvironment } from '$lib/editor/visual/insert/insertItems.svelte';

export function liftFromStyleEnvironment(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
	const { $from, empty } = state.selection;
	if (!empty || $from.parentOffset !== 0 || $from.depth < 2 || $from.parent.type.name !== 'paragraph' || $from.index(-1) !== 0)
		return false;
	const env = $from.node(-1);
	if (!styleEnvironment.current(env)) return false;
	if (dispatch) {
		const envStart = $from.before(-1);
		const tr =
			env.childCount === 1
				? state.tr.replaceWith(envStart, $from.after(-1), $from.parent)
				: state.tr.delete($from.before(), $from.after()).insert(envStart, $from.parent);
		dispatch(tr.setSelection(TextSelection.create(tr.doc, envStart + 1)).scrollIntoView());
	}
	return true;
}
