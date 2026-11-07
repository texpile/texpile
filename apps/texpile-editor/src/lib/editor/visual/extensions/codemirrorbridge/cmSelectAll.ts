// Ctrl+A in code held in the document: its own text first, then the whole document, as a table cell takes it
import type { KeyBinding } from '@codemirror/view';
import { AllSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';

export function selectAllThenDocument(view: EditorView): KeyBinding {
	return {
		key: 'Mod-a',
		run: (cm) => {
			const { from, to } = cm.state.selection.main;
			if (from > 0 || to < cm.state.doc.length) {
				cm.dispatch({ selection: { anchor: 0, head: cm.state.doc.length } });
				return true;
			}
			view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc)));
			view.focus();
			return true;
		}
	};
}
