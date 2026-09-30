// A paste that read plain text as something else (Markdown, LaTeX or Typst source) is two undo
// steps: the text as the clipboard had it, then what it was read as. When the reading was wrong,
// one undo leaves the text; a second takes the paste away.
import { closeHistory } from 'prosemirror-history';
import { Mapping } from 'prosemirror-transform';
import type { Slice } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';

/** paste `text` as the rich `reading` of it, with the plain text one undo away */
export function pasteReadingOfText(view: EditorView, text: string, reading: Slice): void {
	const read = view.state.tr.replaceSelection(reading);
	view.dispatch(closeHistory(view.state.tr));
	// ProseMirror's own plain paste; with no clipboard data on it the paste handlers that read one stand aside
	view.pasteText(text);
	const plain = view.state.doc;
	const start = plain.content.findDiffStart(read.doc.content);
	if (start != null) {
		const end = plain.content.findDiffEnd(read.doc.content)!;
		// the two ends can cross where the text repeats around the change
		const overlap = Math.max(0, start - Math.min(end.a, end.b));
		const tr = view.state.tr.replace(start, end.a + overlap, read.doc.slice(start, end.b + overlap));
		tr.setSelection(read.selection.map(tr.doc, new Mapping()));
		view.dispatch(closeHistory(tr).scrollIntoView().setMeta('uiEvent', 'paste'));
	}
	// typing right after the paste is an undo step of its own, not part of the reading
	view.dispatch(closeHistory(view.state.tr));
}
