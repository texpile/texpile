import { Selection, TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';

/** a split slot's editor, built on the document `from` shows, takes its caret without taking focus */
export function carryCaret(from: EditorView, to: EditorView): void {
	if (!to.state.doc.eq(from.state.doc)) return;
	const { selection } = from.state;
	const { doc } = to.state;
	// a selected formula or chip becomes a caret beside it, as a reopened tab parks one
	const caret =
		selection instanceof TextSelection
			? TextSelection.create(doc, selection.anchor, selection.head)
			: (Selection.findFrom(doc.resolve(selection.from), 1, true) ?? Selection.findFrom(doc.resolve(selection.from), -1, true));
	if (caret) to.dispatch(to.state.tr.setSelection(caret).setMeta('addToHistory', false));
}
