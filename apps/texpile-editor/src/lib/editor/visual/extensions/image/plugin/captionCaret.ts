// a click on the caption's own box (past a formula at its end, or an empty caption) puts the caret in the caption. The
// image is an atom, so a caret the browser placed there itself read as the whole image selected
import { TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';

export function caretIntoCaption(view: EditorView, imagePos: number, event: MouseEvent): void {
	const image = view.state.doc.nodeAt(imagePos);
	if (!image) return;
	const start = imagePos + 1;
	const end = imagePos + image.nodeSize - 1;
	const at = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
	const pos = at !== undefined && at >= start && at <= end ? at : end;
	event.preventDefault();
	view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));
	view.focus();
}
