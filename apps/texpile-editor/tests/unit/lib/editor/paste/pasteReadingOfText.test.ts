// @vitest-environment jsdom
// A paste that read text as Markdown is two undo steps: the first undo leaves the text as it was on
// the clipboard, in case the reading was wrong, and the second takes the paste away.
import { describe, expect, it } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { history, undo } from 'prosemirror-history';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { markdownSlice } from '$lib/editor/paste/markdownPaste';
import { pasteReadingOfText } from '$lib/editor/paste/pasteReadingOfText';

const TEXT = 'Some **bold** words\n\n- one\n- two';

// jsdom has no ClipboardEvent, which ProseMirror's plain paste makes for its handlers
globalThis.ClipboardEvent ??= class extends Event {
	clipboardData = null;
} as unknown as typeof ClipboardEvent;

describe('pasteReadingOfText', () => {
	it('keeps the plain text one undo away', () => {
		const doc = schema.node('doc', null, [schema.node('paragraph', null, [schema.text('Before after')])]);
		const state = EditorState.create({ doc, plugins: [history()], selection: TextSelection.create(doc, 8) });
		const view = new EditorView(document.createElement('div'), { state });
		const reading = markdownSlice(TEXT, schema)!;
		const expected = state.tr.replaceSelection(reading).doc;

		pasteReadingOfText(view, TEXT, reading);
		expect(view.state.doc.eq(expected)).toBe(true);
		undo(view.state, view.dispatch);
		expect(view.state.doc.textContent).toBe('Before Some **bold** words- one- twoafter');
		undo(view.state, view.dispatch);
		expect(view.state.doc.eq(doc)).toBe(true);
		view.destroy();
	});
});
