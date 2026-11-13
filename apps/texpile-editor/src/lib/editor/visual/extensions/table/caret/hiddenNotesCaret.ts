// a float's notes that the settings hide take no caret: it goes on past them, the way it was heading
import { Plugin, Selection, TextSelection } from 'prosemirror-state';
import { gapAwareSelectionNear } from '$lib/editor/visual/gapSelection';

export const hiddenNotesCaret = new Plugin({
	appendTransaction(_transactions, before, state) {
		const { selection, doc } = state;
		if (!(selection instanceof TextSelection) || !selection.empty) return null;
		const { $head } = selection;
		if ($head.parent.type.name !== 'table_notes' || $head.node(-1).attrs.showNotes) return null;
		const onward = before.selection.head < $head.before();
		const next = onward ? gapAwareSelectionNear(doc.resolve($head.after(-1)), 1) : Selection.near(doc.resolve($head.before()), -1);
		return state.tr.setSelection(next);
	}
});
