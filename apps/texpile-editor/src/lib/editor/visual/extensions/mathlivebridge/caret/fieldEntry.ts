// the editor's selection and the field's caret arriving together
import { NodeSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { MathfieldElement } from 'mathlive';

/** the caret arriving in the field, at the end it came from */
// a field built while the view was settling took its read-only state then; the caret arriving reads it again
export function enterField(field: MathfieldElement, atStart: boolean, editable: boolean): void {
	// eslint-disable-next-line no-param-reassign -- the field is the element to set up
	field.readOnly = !editable;
	field.focus();
	field.executeCommand((atStart ? 'moveToMathfieldStart' : 'moveToMathfieldEnd') as never);
}

/** a click into the field: the editor's selection takes the formula, as an arrow into it does, so commands act there */
export function selectFormulaOf(view: EditorView, pos: number, size: number): void {
	const { from, to } = view.state.selection;
	if (from < pos || to > pos + size) view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
}
