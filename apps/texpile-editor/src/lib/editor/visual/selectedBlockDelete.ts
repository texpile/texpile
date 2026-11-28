import { NodeSelection, type EditorState, type Transaction } from 'prosemirror-state';
import { caretAfterDelete } from './extensions/blockHandle/caretAfterDelete';

// a top-level block or a list item, as the block handle selects it
export function deleteSelectedBlock(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
	const sel = state.selection;
	if (!(sel instanceof NodeSelection) || !sel.node.isBlock) return false;
	if (sel.$from.depth > 0 && sel.node.type.name !== 'list') return false;
	const tr = state.tr.deleteSelection();
	if (!tr.docChanged) return false;
	dispatch?.(tr.setSelection(caretAfterDelete(tr.doc, sel.from)).scrollIntoView());
	return true;
}
