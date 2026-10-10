// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { history, undo } from 'prosemirror-history';
import { latexToProseMirror } from '$lib/languages/latex/parser/converter';
import { latexSourceSlice } from '$lib/editor/visual/extensions/latexClipboard';
import { visualTextSnippets } from '$lib/editor/snippets/visual/visualTextSnippets';
import { parseSnippetFile } from '$lib/editor/snippets/file/parseSnippetFile';
import { setSnippetLayers } from '$lib/editor/snippets/file/snippetRegistry';

const GLOBAL = `{
	"v": 1,
	"snippets": {
		"For example": { "prefix": "eg", "context": "text", "auto": true, "body": "for example" },
		"Emphasis": { "prefix": "em", "context": "text", "body": { "latex": "\\\\emph{$1}" } },
		"Integral": { "prefix": "dint", "context": "math", "auto": true, "body": "\\\\int" }
	}
}`;

let view: EditorView | null = null;

function editor(text: string): EditorView {
	const { doc } = latexToProseMirror(`${text}\n`);
	const state = EditorState.create({ doc, plugins: [history(), visualTextSnippets('latex', latexSourceSlice)] });
	view = new EditorView(document.body, { state });
	view.dispatch(view.state.tr.setSelection(TextSelection.atEnd(view.state.doc)));
	return view;
}

function type(v: EditorView, keys: string): void {
	for (const ch of keys) {
		const { from, to } = v.state.selection;
		if (!v.someProp('handleTextInput', (f) => f(v, from, to, ch, () => v.state.tr))) v.dispatch(v.state.tr.insertText(ch, from, to));
	}
}

function pressTab(v: EditorView): boolean {
	return v.someProp('handleKeyDown', (f) => f(v, new KeyboardEvent('keydown', { key: 'Tab' }))) ?? false;
}

beforeAll(() => {
	setSnippetLayers({ global: parseSnippetFile(GLOBAL, 'global'), project: null, allowedPatterns: null });
});

afterEach(() => {
	view?.destroy();
	view = null;
});

describe('text snippets in the visual editor', () => {
	it('an auto snippet expands as typed after a citation, and one undo gives the trigger back', () => {
		const v = editor('See \\citep{doe2024} and');
		type(v, ' eg');
		expect(v.state.doc.textContent).toBe('See doe2024 and for example');
		undo(v.state, v.dispatch);
		expect(v.state.doc.textContent).toBe('See doe2024 and eg');
	});

	it('Tab after a trigger reads the body as LaTeX, the caret inside the emphasis', () => {
		const v = editor('See');
		type(v, ' em');
		expect(pressTab(v)).toBe(true);
		type(v, 'this');
		const para = v.state.doc.firstChild!;
		expect(para.textContent).toBe('See this');
		expect(para.child(1).marks.map((mk) => mk.type.name)).toEqual(['em']);
	});

	it('a math snippet stays as typed in a paragraph', () => {
		const v = editor('See');
		type(v, ' dint');
		expect(v.state.doc.textContent).toBe('See dint');
	});
});
