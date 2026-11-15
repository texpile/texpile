// Backspace in an empty block at the very start of the document or after a block with no text to join
// (an \input, a table), and Delete in an empty block with another after it, take the empty block out.
// ProseMirror has nothing before the first block to join it with, so Backspace did nothing; the list
// keymap's Backspace selected the block before and left the empty line; and Delete joined the next
// block into the empty one, which turned a heading after it into body text.
import type { EditorState, Transaction } from 'prosemirror-state';
import type { ResolvedPos } from 'prosemirror-model';
import { gapAwareSelectionNear } from './gapSelection';

// a figure is a text block too, its caption the text: an empty caption is not an empty block
const REMOVABLE = new Set(['paragraph', 'heading']);

/** the cursor, when it sits in an empty paragraph or heading directly in the document */
function inEmptyBlock(state: EditorState): ResolvedPos | null {
	const { $cursor } = state.selection as { $cursor?: ResolvedPos | null };
	if (!$cursor || $cursor.depth !== 1) return null;
	const block = $cursor.parent;
	return REMOVABLE.has(block.type.name) && block.content.size === 0 ? $cursor : null;
}

/** the empty block goes and the cursor takes its place, else the block on `dir`'s side */
function remove($cursor: ResolvedPos, state: EditorState, dispatch?: (tr: Transaction) => void, dir: -1 | 1 = 1): boolean {
	if (dispatch) {
		const at = $cursor.before();
		const tr = state.tr.delete(at, $cursor.after());
		dispatch(tr.setSelection(gapAwareSelectionNear(tr.doc.resolve(at), dir)).scrollIntoView());
	}
	return true;
}

export function deleteEmptyBlockBackward(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
	const $cursor = inEmptyBlock(state);
	if (!$cursor) return false;
	if ($cursor.index(0) > 0) {
		const before = state.doc.child($cursor.index(0) - 1);
		return !before.isTextblock && before.isBlock && remove($cursor, state, dispatch, -1);
	}
	if (state.doc.childCount > 1) return remove($cursor, state, dispatch);
	// the document's only block stays, but an empty heading goes back to body text
	const paragraph = state.schema.nodes.paragraph;
	if (!paragraph || $cursor.parent.type === paragraph) return false;
	if (dispatch) dispatch(state.tr.setBlockType($cursor.pos, $cursor.pos, paragraph));
	return true;
}

export function deleteEmptyBlockForward(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
	const $cursor = inEmptyBlock(state);
	if (!$cursor || $cursor.index(0) + 1 >= state.doc.childCount) return false;
	return remove($cursor, state, dispatch);
}
