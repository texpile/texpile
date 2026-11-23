// typed text (11.2): the caret owner, then handleTextInput in plugin order, then the default insert
import { NodeSelection, TextSelection, type EditorState, type Transaction } from 'prosemirror-state';
import { GapCursor } from 'prosemirror-gapcursor';
import type { VisualView } from '../../contracts/viewTypes';

/** the default insert: at a gap cursor or over a selected block it starts the parent's default textblock */
export function typedTextTr(state: EditorState, text: string, from: number, to: number): Transaction {
	const { selection, schema } = state;
	const tr = state.tr;
	if (selection instanceof GapCursor || (selection instanceof NodeSelection && selection.node.isBlock)) {
		const at = selection.from;
		const $at = state.doc.resolve(at);
		const type = $at.parent.contentMatchAt($at.index()).defaultType ?? schema.nodes.paragraph;
		if (selection instanceof NodeSelection) tr.deleteSelection();
		tr.insert(at, type.create(null, text ? schema.text(text) : null));
		return tr.setSelection(TextSelection.create(tr.doc, at + 1 + text.length));
	}
	tr.insertText(text, from, to);
	if (selection instanceof NodeSelection && text) tr.setSelection(TextSelection.near(tr.doc.resolve(from + text.length)));
	return tr;
}

export function insertTypedText(view: VisualView, text: string, from: number, to: number): void {
	if (view.canvas.nested()?.insertText(text, { from, to })) return;
	function deflt(): Transaction {
		return typedTextTr(view.state, text, from, to);
	}
	if (view.someProp('handleTextInput', (f) => f(view, from, to, text, deflt))) return;
	view.dispatch(deflt().scrollIntoView());
}
