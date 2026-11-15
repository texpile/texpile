import { NodeSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { MathfieldElement } from 'mathlive';

// a field built while the view was settling took its read-only state then; the caret arriving reads it again
export function enterField(field: MathfieldElement, atStart: boolean, editable: boolean): void {
	// eslint-disable-next-line no-param-reassign -- the field is the element to set up
	field.readOnly = !editable;
	field.focus();
	// mathlive moves the keyboard into the field 60 ms later. Until then ProseMirror read the browser's range, which Chrome
	// cannot keep beside a formula between drawn blocks: it took the caret to the document's start
	field.shadowRoot?.querySelector<HTMLElement>('.ML__keyboard-sink')?.focus({ preventScroll: true });
	field.executeCommand((atStart ? 'moveToMathfieldStart' : 'moveToMathfieldEnd') as never);
}

export function selectFormulaOf(view: EditorView, pos: number, size: number): void {
	const { from, to } = view.state.selection;
	if (from < pos || to > pos + size) view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
}
