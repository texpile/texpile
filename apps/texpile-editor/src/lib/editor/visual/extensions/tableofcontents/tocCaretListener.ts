import { EditorView } from '@codemirror/view';
import { tocCaretStore } from './tocStore';

/** source mode has no PM plugin; the update listener publishes the caret for the table of contents */
export const tocCaretListener = EditorView.updateListener.of((u) => {
	// a parked editor's caret is not the outline's
	if (u.selectionSet && u.state.facet(EditorView.editable)) tocCaretStore.current = u.state.selection.main.head;
});
