// Backspace in an empty block at the very start of the document, and Delete in an empty block with
// another after it, take the empty block out. ProseMirror has nothing before the first block to join
// it with, so Backspace did nothing, and Delete joined the next block into the empty one, which
// turned a heading after it into body text.
import type { EditorState, Transaction } from 'prosemirror-state';
import type { ResolvedPos } from 'prosemirror-model';
import { gapAwareSelectionNear } from './gapSelection';

/** the cursor, when it sits in an empty paragraph or heading directly in the document */
function inEmptyBlock(state: EditorState): ResolvedPos | null {
	const { $cursor } = state.selection as { $cursor?: ResolvedPos | null };
	if (!$cursor || $cursor.depth !== 1) return null;
	const block = $cursor.parent;
	return block.isTextblock && block.content.size === 0 && !block.type.spec.code ? $cursor : null;
}

/** the empty block goes and the cursor starts the block that followed it */
function remove($cursor: ResolvedPos, state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
	if (dispatch) {
		const at = $cursor.before();
		const tr = state.tr.delete(at, $cursor.after());
		dispatch(tr.setSelection(gapAwareSelectionNear(tr.doc.resolve(at), 1)).scrollIntoView());
	}
	return true;
}

export function deleteEmptyFirstBlock(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
	const $cursor = inEmptyBlock(state);
	if (!$cursor || $cursor.index(0) > 0) return false;
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
