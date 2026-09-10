// @vitest-environment jsdom
// tinymist's postfix items are the shapes @codemirror/lsp-client scrambled: an empty main insertion
// with edits before the caret, and a snippet body with an edit that rewrites the receiver. Each
// must land as VS Code lands it, in a document the user kept typing into after the request.
import { describe, it, expect, afterEach } from 'vitest';
import { EditorState, ChangeSet, type Text } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { applyLspItem, type LspCompletionItem } from '$lib/languages/typst/intellisense/typstCompletionSource';

const fromPosition = (p: { line: number; character: number }, doc: Text) => doc.line(p.line + 1).from + p.character;
const at = (character: number) => ({ start: { line: 0, character }, end: { line: 0, character } });
const span = (from: number, to: number) => ({ start: { line: 0, character: from }, end: { line: 0, character: to } });

const views: EditorView[] = [];
function editor(doc: string, caret: number) {
	const parent = document.createElement('div');
	const view = new EditorView({ state: EditorState.create({ doc, selection: { anchor: caret } }), parent });
	views.push(view);
	return view;
}
afterEach(() => {
	for (const v of views.splice(0)) v.destroy();
});

// "abs" on `$subset.|$`: insert nothing, wrap the receiver, drop the dot
const ABS: LspCompletionItem = {
	label: 'abs',
	insertTextFormat: 1,
	textEdit: { newText: '', range: at(8) },
	additionalTextEdits: [
		{ newText: 'abs(', range: at(1) },
		{ newText: ')', range: span(7, 8) }
	]
};
// "abs)" on the same caret: a snippet body plus the same wrapping edits
const ABS_PAREN: LspCompletionItem = {
	label: 'abs)',
	insertTextFormat: 2,
	textEdit: { newText: '${1:})', range: at(8) },
	additionalTextEdits: [
		{ newText: 'abs(', range: at(1) },
		{ newText: '', range: span(7, 8) }
	]
};

describe('applyLspItem', () => {
	it('applies an empty insertion with its extra edits', () => {
		const view = editor('$subset.$', 8);
		applyLspItem(view, { label: 'abs' }, ABS, view.state.doc, fromPosition, null, 8, 8);
		expect(view.state.doc.toString()).toBe('$abs(subset)$');
		expect(view.state.selection.main.head).toBe(12);
	});

	it('applies a snippet body after its extra edits, fields where the text ended up', () => {
		const view = editor('$subset.$', 8);
		applyLspItem(view, { label: 'abs)' }, ABS_PAREN, view.state.doc, fromPosition, null, 8, 8);
		expect(view.state.doc.toString()).toBe('$abs(subset)$');
		expect(view.state.selection.main.head).toBe(11); // inside the parens, on the field
	});

	it('maps the request-time ranges through what was typed since, and the typed text is replaced', () => {
		// requested at `$subset.|$`, then the user typed "ab": the list was filtered locally
		const requestDoc = EditorState.create({ doc: '$subset.$' }).doc;
		const view = editor('$subset.ab$', 10);
		const since = ChangeSet.of({ from: 8, insert: 'ab' }, 9).desc;
		applyLspItem(view, { label: 'abs' }, ABS, requestDoc, fromPosition, since, 8, 10);
		expect(view.state.doc.toString()).toBe('$abs(subset)$');
	});

	it('inserts a plain item at its own range when the caret sits before other text', () => {
		const view = editor('$subset.$', 8);
		const eq: LspCompletionItem = { label: 'eq', insertTextFormat: 1, textEdit: { newText: 'eq', range: at(8) } };
		applyLspItem(view, { label: 'eq' }, eq, view.state.doc, fromPosition, null, 8, 8);
		expect(view.state.doc.toString()).toBe('$subset.eq$');
		expect(view.state.selection.main.head).toBe(10);
	});
});
